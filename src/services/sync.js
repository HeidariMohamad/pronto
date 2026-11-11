import { db } from './db';
import { api } from './api';

let syncListeners = new Set();
let currentStatus = 'idle'; // 'idle' | 'syncing' | 'offline' | 'error'

export function subscribeSyncStatus(listener) {
  syncListeners.add(listener);
  listener(currentStatus);
  return () => syncListeners.delete(listener);
}

function setSyncStatus(status) {
  currentStatus = status;
  syncListeners.forEach(fn => fn(status));
}

export function getSyncStatus() {
  return currentStatus;
}

// Queue a change to be synced to the server
export async function queueSync(table, id, action = 'upsert', data = null) {
  try {
    await db.pending_sync.add({
      collection: table,
      docId: String(id),
      action,
      data,
      timestamp: Date.now()
    });
    // Attempt push immediately if online
    triggerSync();
  } catch (err) {
    console.warn('Failed to queue sync:', err);
  }
}

// Trigger synchronization of pending local changes
export async function triggerSync() {
  const token = localStorage.getItem('pronto_token');
  if (!token) return;

  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }

  const pending = await db.pending_sync.toArray();
  if (pending.length === 0) {
    setSyncStatus('idle');
    return;
  }

  setSyncStatus('syncing');

  try {
    // Gather all dirty records, settings, and semesters
    const recordDates = new Set();
    let hasSettings = false;
    const semesterIds = new Set();

    for (const item of pending) {
      if (item.collection === 'records') recordDates.add(item.docId);
      if (item.collection === 'settings') hasSettings = true;
      if (item.collection === 'semesters') semesterIds.add(item.docId);
    }

    const recordsToPush = [];
    for (const date of recordDates) {
      const rec = await db.records.get(date);
      if (rec) recordsToPush.push(rec);
    }

    const semestersToPush = [];
    for (const id of semesterIds) {
      const sem = await db.semesters.get(Number(id) || id);
      if (sem) semestersToPush.push(sem);
    }

    let settingsToPush = null;
    if (hasSettings) {
      settingsToPush = await db.settings.get('v8');
    }

    const res = await api.post('/api/sync/push', {
      records: recordsToPush,
      semesters: semestersToPush,
      settings: settingsToPush
    });

    // On success, clear the processed pending items
    const pendingIds = pending.map(p => p.id);
    await db.pending_sync.bulkDelete(pendingIds);

    setSyncStatus('idle');
    return res;
  } catch (err) {
    console.error('Sync failed:', err);
    setSyncStatus('error');
    throw err;
  }
}

// Pull all data from server (used on new device or fresh sign-in)
export async function pullAllFromServer() {
  setSyncStatus('syncing');
  try {
    const data = await api.get('/api/sync/pull');

    if (data.records && data.records.length > 0) {
      await db.records.bulkPut(data.records);
    }

    if (data.semesters && data.semesters.length > 0) {
      await db.semesters.bulkPut(data.semesters);
    }

    if (data.settings) {
      await db.settings.put({ ...data.settings, id: 'v8' });
    }

    setSyncStatus('idle');
    return data;
  } catch (err) {
    console.error('Pull all failed:', err);
    setSyncStatus('error');
    throw err;
  }
}

// Migrate existing local IndexedDB records to server with progress feedback
export async function migrateLocalHistory(onProgress) {
  const allRecords = await db.records.toArray();
  const allSemesters = await db.semesters.toArray();
  const settings = await db.settings.get('v8');

  const totalSteps = allRecords.length + 2; // +1 for settings/semesters, +1 for finalize
  let completed = 0;

  if (onProgress) {
    onProgress({
      percent: 5,
      stage: 'scanning',
      totalRecords: allRecords.length,
      totalSemesters: allSemesters.length
    });
  }

  // Chunk records into batches of 30 to report progress smoothly
  const BATCH_SIZE = 30;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    await api.post('/api/sync/push', {
      records: batch
    });

    completed += batch.length;
    const percent = Math.min(90, Math.round((completed / totalSteps) * 100));
    if (onProgress) {
      onProgress({
        percent,
        stage: 'uploading_records',
        current: completed,
        total: allRecords.length
      });
    }
  }

  // Push semesters and settings
  if (onProgress) {
    onProgress({
      percent: 95,
      stage: 'saving_settings'
    });
  }

  await api.post('/api/sync/push', {
    semesters: allSemesters,
    settings: settings || {}
  });

  // Clear pending_sync queue since everything is now synced
  await db.pending_sync.clear();

  if (onProgress) {
    onProgress({
      percent: 100,
      stage: 'done'
    });
  }

  return {
    totalRecords: allRecords.length,
    totalSemesters: allSemesters.length
  };
}

// Listen to online events to resume sync automatically
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setSyncStatus('idle');
    triggerSync();
  });

  window.addEventListener('offline', () => {
    setSyncStatus('offline');
  });
}
