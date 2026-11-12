import { liveQuery } from 'dexie';
import { db } from './db';
import { api } from './api';

let status = { cached: 0, total: 0, state: 'idle', failed: 0 };
const listeners = new Set();
function publish(next) { status = next; listeners.forEach(listener => listener(status)); }
export function subscribeOfflinePhotos(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener); }

export function isOwnedPhotoUrl(url, userId) {
  if (typeof url !== 'string' || !userId) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    const parts = parsed.pathname.split('/');
    return parsed.origin === window.location.origin && parts.length === 4 && parts[1] === 'uploads' && decodeURIComponent(parts[2]) === userId && !!parts[3] && !parsed.search && !parsed.hash;
  } catch { return false; }
}

export function stripSelectedPhotos(date, entries, urls, embeddedMatches) {
  return entries.map((entry, index) => {
    if (!entry?.photo) return entry;
    const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
    const selected = urls.has(entry.photo) || embeddedMatches.some(match => match.date === date && match.identity === identity && match.photo === entry.photo);
    return selected ? { ...entry, photo: null } : entry;
  });
}

export async function cacheUploadedPhoto({ date, id, originalPhoto, url, blob, userId }) {
  if (!isOwnedPhotoUrl(url, userId)) throw new Error('Invalid photo owner');
  let saved = false;
  await db.transaction('rw', db.records, db.offline_photos, async () => {
    const current = await db.records.get(date);
    if (!current || !(current.entries || []).some(entry => entry.id === id && entry.photo === originalPhoto)) return;
    await db.offline_photos.put({ userId, url, blob });
    const entries = current.entries.map(entry => entry.id === id && entry.photo === originalPhoto ? { ...entry, photo: url } : entry);
    await db.records.update(date, { entries, updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1) });
    saved = true;
  });
  return saved;
}

export async function pruneOfflinePhotos(userId) {
  if (!userId) return;
  await db.transaction('rw', db.records, db.offline_photos, async () => {
    const records = await db.records.toArray();
    const referenced = new Set(records.flatMap(record => (record.entries || []).map(entry => entry?.photo)).filter(url => isOwnedPhotoUrl(url, userId)));
    const cached = await db.offline_photos.where('userId').equals(userId).toArray();
    const obsolete = cached.filter(photo => !referenced.has(photo.url)).map(photo => [userId, photo.url]);
    if (obsolete.length) await db.offline_photos.bulkDelete(obsolete);
  });
}

// Called only for the signed-in account. A failed download is never counted as saved.
export function startOfflinePhotoSync(userId) {
  let active = true;
  let running = false;
  let requested = false;
  let currentRefs = [];
  const controller = new AbortController();
  publish({ cached: 0, total: 0, state: 'checking', failed: 0 });
  const sync = async () => {
    requested = true;
    if (running) return;
    running = true;
    try {
      while (active && requested) {
        requested = false;
        const refs = [...currentRefs];
        const urls = refs.map(item => item.url);
        const cached = await db.offline_photos.where('userId').equals(userId).toArray();
        const available = new Set(cached.map(item => item.url));
        let count = urls.filter(url => available.has(url)).length;
        let failed = 0;
        publish({ cached: count, total: urls.length, state: navigator.onLine ? 'syncing' : 'offline', failed: 0 });
        for (const { url, dates } of refs) {
          if (!active || !navigator.onLine) break;
          if (available.has(url)) continue;
          try {
            const blob = await api.getImage(url, { signal: controller.signal });
            if (!active) break;
            // Check the record again before saving, so deletion during download stays deleted.
            await db.transaction('rw', db.records, db.offline_photos, async () => {
              const records = (await db.records.bulkGet(dates)).filter(Boolean);
              if (active && records.some(record => (record.entries || []).some(entry => entry?.photo === url))) {
                await db.offline_photos.put({ userId, url, blob });
                available.add(url);
              }
            });
            count = urls.filter(item => available.has(item)).length;
          } catch (err) { if (active) { failed++; console.warn('Could not save photo for offline use:', err); } }
          if (active) publish({ cached: count, total: urls.length, state: 'syncing', failed });
        }
        if (active && !requested) publish({ cached: count, total: urls.length, state: !navigator.onLine ? 'offline' : failed ? 'error' : 'idle', failed });
      }
    } catch (err) {
      if (active) { console.warn('Could not prepare offline photos:', err); publish({ cached: 0, total: currentRefs.length, state: 'error', failed: currentRefs.length }); }
    } finally { running = false; }
  };
  const subscription = liveQuery(async () => {
    const records = await db.records.toArray();
    const refs = new Map();
    for (const record of records) for (const entry of record.entries || []) {
      if (!isOwnedPhotoUrl(entry?.photo, userId)) continue;
      if (!refs.has(entry.photo)) refs.set(entry.photo, new Set());
      refs.get(entry.photo).add(record.date);
    }
    return [...refs].map(([url, dates]) => ({ url, dates: [...dates] }));
  }).subscribe({ next(refs) { currentRefs = refs; sync(); }, error(err) { console.warn('Offline photo tracking failed:', err); publish({ cached: 0, total: currentRefs.length, state: 'error', failed: currentRefs.length }); } });
  const retry = () => { if (document.visibilityState === 'visible') sync(); };
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', retry);
  return () => { active = false; controller.abort(); subscription.unsubscribe(); window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); publish({ cached: 0, total: 0, state: 'idle', failed: 0 }); };
}
