import { db } from './db';
import { api } from './api';
import { optimizeImage } from './imageOptimizer';

let syncListeners = new Set();
let currentStatus = 'idle'; // 'idle' | 'syncing' | 'offline' | 'error'
let activeSync = null;
let syncPauseCount = 0;
const SYNC_PAUSED = Symbol('sync paused');
const BATCH_BYTES = 1.5 * 1024 * 1024; // 1.5 MB per batch for smooth progressive upload
const MAX_BATCH_ITEMS = 15; // Max 15 items per batch so progress bar updates frequently

// Keep requests responsive with progressive batch feedback
async function pushBatches(items, onBatch) {
  let batch = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const payload = { records: [], semesters: [], settings: null };
    for (const item of batch) {
      if (item.collection === 'settings') payload.settings = item.value;
      else payload[item.collection].push(item.value);
    }
    const result = await api.post('/api/sync/push', payload);
    if (onBatch) await onBatch(batch, result);
    batch = [];
    size = 0;
  };

  for (const item of items) {
    const itemSize = new Blob([JSON.stringify(item.value)]).size + 128;
    if (batch.length && (batch.length >= MAX_BATCH_ITEMS || size + itemSize > BATCH_BYTES || (item.collection === 'settings' && batch.some(i => i.collection === 'settings')))) {
      await flush();
    }
    batch.push(item);
    size += itemSize;
    if (batch.length >= MAX_BATCH_ITEMS || size >= BATCH_BYTES) await flush();
  }
  await flush();
}

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
    triggerSync().catch(console.warn);
  } catch (err) {
    console.warn('Failed to queue sync:', err);
  }
}

// Trigger synchronization of pending local changes
export function triggerSync() {
  if (syncPauseCount) return Promise.resolve({ paused: true });
  if (activeSync) return activeSync;
  activeSync = performSync().finally(() => { activeSync = null; });
  return activeSync;
}

// Stop at a batch boundary while the user reviews conflicting versions.
export async function pauseSync() {
  syncPauseCount++;
  if (activeSync) {
    try { await activeSync; } catch { /* Pending changes remain queued. */ }
  }
}

export function resumeSync() {
  syncPauseCount = Math.max(0, syncPauseCount - 1);
}

async function performSync() {
  const token = localStorage.getItem('pronto_token');
  if (!token) throw new Error('Sign in before syncing');

  if (!navigator.onLine) {
    setSyncStatus('offline');
    throw new Error('Connect to the internet before syncing');
  }

  setSyncStatus('syncing');

  try {
    let res;
    while (true) {
      if (syncPauseCount) { setSyncStatus('idle'); return { paused: true }; }
      const pending = await db.pending_sync.toArray();
      if (!pending.length) break;
      const groups = new Map();
      for (const item of pending) {
        const key = `${item.collection}:${item.docId}`;
        if (!groups.has(key)) groups.set(key, { collection: item.collection, docId: item.docId, ids: [] });
        groups.get(key).ids.push(item.id);
      }
      const items = [];
      const missingIds = [];
      for (const group of groups.values()) {
        let value;
        if (group.collection === 'records') value = await db.records.get(group.docId);
        else if (group.collection === 'semesters') value = await db.semesters.get(Number(group.docId) || group.docId);
        else if (group.collection === 'settings') value = await db.settings.get('v8');
        if (value) items.push({ ...group, value });
        else missingIds.push(...group.ids);
      }
      await pushBatches(items, async (batch, result) => {
        res = result;
        await db.pending_sync.bulkDelete(batch.flatMap(item => item.ids));
        if (syncPauseCount) throw SYNC_PAUSED;
      });
      if (missingIds.length) await db.pending_sync.bulkDelete(missingIds);
    }
    setSyncStatus('idle');
    return res;
  } catch (err) {
    if (err === SYNC_PAUSED) { setSyncStatus('idle'); return { paused: true }; }
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
      const loginLanguage = sessionStorage.getItem('pronto_login_language');
      await db.settings.put({ ...data.settings, id: 'v8', ...(loginLanguage ? { language: loginLanguage } : {}) });
      if (loginLanguage) {
        sessionStorage.removeItem('pronto_login_language');
        await queueSync('settings', 'v8');
      }
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
  const pendingBefore = await db.pending_sync.toCollection().primaryKeys();
  const allRecords = await db.records.toArray();
  const allSemesters = await db.semesters.toArray();
  const settings = await db.settings.get('v8');

  let completed = 0;

  if (onProgress) {
    onProgress({
      percent: 5,
      stage: 'scanning',
      totalRecords: allRecords.length,
      totalSemesters: allSemesters.length
    });
  }

  const prepared = [];
  for (const record of allRecords) {
    const entries = [];
    for (const entry of record.entries || []) {
      if (typeof entry?.photo === 'string' && entry.photo.startsWith('data:image/')) {
        try {
          const optimized = await optimizeImage(entry.photo, 1024, 0.75, false);
          entries.push(optimized.dataUrl.length < entry.photo.length ? { ...entry, photo: optimized.dataUrl } : entry);
        } catch (err) {
          console.warn('Could not optimize a migration photo; keeping the original:', err);
          entries.push(entry);
        }
      } else entries.push(entry);
    }
    prepared.push({ collection: 'records', value: { ...record, entries }, original: record });
  }

  await pushBatches(prepared, async (batch) => {
    await db.transaction('rw', db.records, async () => {
      for (const item of batch) {
        const current = await db.records.get(item.original.date);
        if (current && JSON.stringify(current) === JSON.stringify(item.original)) {
          await db.records.put(item.value);
        }
      }
    });
    completed += batch.length;
    const percent = Math.min(92, Math.max(8, Math.round((completed / (allRecords.length || 1)) * 88)));
    if (onProgress) {
      onProgress({
        percent,
        stage: 'uploading_records',
        current: completed,
        total: allRecords.length
      });
    }
  });

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

  // Keep changes queued after this migration began.
  await db.pending_sync.bulkDelete(pendingBefore);

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
    triggerSync().catch(console.warn);
  });

  window.addEventListener('offline', () => {
    setSyncStatus('offline');
  });
}
