// Compare the meaningful content, not timestamps assigned by different devices.
async function content(collection, value) {
  let serialized;
  if (collection === 'records') {
    serialized = JSON.stringify({ entries: value.entries || [], note: value.note || '' });
  } else {
    const rest = { ...value };
    delete rest.updatedAt;
    serialized = JSON.stringify(rest);
  }
  // Keeping full JSON signatures duplicates large Base64 photos in memory.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function embeddedPhotoKey(date, entry, index) {
  if (typeof entry?.photo !== 'string' || !entry.photo.startsWith('data:image/')) return null;
  const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entry.photo));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `embedded:${JSON.stringify([date, identity, hash])}`;
}

export async function prepareMerge(device, cloud, backup = null, { restoringBackup = !!backup } = {}) {
  const groups = new Map();
  const aliases = new Map((cloud?.optimizedPhotos || []).map(item => [JSON.stringify([item.date, item.identity, item.hash]), item.url]));
  const deletedPhotos = new Set((cloud?.deletedItems || []).filter(item => item.collection === 'photos').map(item => item.id));
  const embeddedIdentities = new Set();
  for (const id of deletedPhotos) {
    if (!id.startsWith('embedded:')) continue;
    try {
      const [date, identity] = JSON.parse(id.slice('embedded:'.length));
      embeddedIdentities.add(JSON.stringify([date, identity]));
    } catch { /* Ignore invalid legacy markers. */ }
  }
  const add = async (collection, key, value, source, missingPhotos = 0) => {
    if (key === undefined || key === null || key === '') throw new Error(`Invalid ${collection} item`);
    const groupKey = `${collection}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { collection, key, options: [], cloud: null });
    const group = groups.get(groupKey);
    const signature = await content(collection, value);
    if (source === 'cloud') group.cloud = { signature, value };
    const existing = group.options.find(option => option.signature === signature);
    if (existing) { existing.sources.push(source); existing.missingPhotos[source] = missingPhotos; }
    else group.options.push({ value, signature, sources: [source], missingPhotos: { [source]: missingPhotos } });
  };

  for (const [source, data] of [['device', device], ['cloud', cloud], ['backup', backup]]) {
    if (!data) continue;
    for (const record of data.records || []) {
      if (!record || typeof record.date !== 'string' || !Array.isArray(record.entries || [])) throw new Error('Invalid backup record');
      // Empty placeholders are not a competing saved day during a restore.
      if (restoringBackup && !(record.entries || []).length && !String(record.note || '').trim()) continue;
      const entries = [];
      let missingPhotos = 0;
      for (const [index, entry] of (record.entries || []).entries()) {
        if (!entry || typeof entry !== 'object') { entries.push(entry); continue; }
        const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
        let removed = deletedPhotos.has(entry.photo);
        if (!removed && embeddedIdentities.has(JSON.stringify([record.date, identity]))) {
          const key = await embeddedPhotoKey(record.date, entry, index);
          removed = key && deletedPhotos.has(key);
        }
        let photo = entry.photo;
        if (!removed && typeof photo === 'string' && photo.startsWith('data:image/') && aliases.size) {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photo));
          const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          photo = aliases.get(JSON.stringify([record.date, identity, hash])) || photo;
          if (deletedPhotos.has(photo)) removed = true;
        }
        if (removed && entry.photo) missingPhotos++;
        entries.push(removed ? { ...entry, photo: null } : photo !== entry.photo ? { ...entry, photo } : entry);
      }
      const cleaned = { ...record, entries };
      await add('records', record.date, cleaned, source, missingPhotos);
    }
    for (const semester of data.semesters || []) {
      if (!semester || semester.id === undefined || semester.id === null) throw new Error('Invalid backup semester');
      const id = String(semester.id);
      await add('semesters', id, { ...semester, id: /^\d+$/.test(id) ? Number(id) : id }, source);
    }
    const settings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
    if (settings) await add('settings', 'v8', { ...settings, id: 'v8' }, source);
  }
  for (const item of cloud?.deletedItems || []) {
    if (!['records', 'semesters'].includes(item.collection)) continue;
    const key = String(item.id);
    const groupKey = `${item.collection}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { collection: item.collection, key, options: [], cloud: null });
    const group = groups.get(groupKey);
    const signature = `deleted:${item.deletedAt}`;
    const value = { updatedAt: item.deletedAt, deletedAt: item.deletedAt };
    group.cloud = { signature, value, deleted: true };
    group.options.push({ signature, value, sources: ['cloud'], deleted: true });
  }
  const all = [...groups.values()];
  for (const group of all) {
    if (!restoringBackup) continue;
    const saved = group.options.filter(option => !option.deleted);
    // Explicit backup restore merges unique saved days even if the cloud has a tombstone.
    if (group.cloud?.deleted && saved.length === 1) group.defaultOption = saved[0];
    // Keep device settings by default. The summary can explicitly select backup settings.
    if (group.collection === 'settings') group.defaultOption = saved.find(option => option.sources.includes('device')) || saved.find(option => option.sources.includes('cloud')) || saved[0];
  }
  const photoTombstones = (cloud?.deletedItems || []).filter(item => item.collection === 'photos')
    .map(item => [item.id, item.deletedAt]).sort((a, b) => a[0].localeCompare(b[0]));
  const conflicts = all.filter(group => {
    if (restoringBackup && group.collection === 'settings' && group.defaultOption) return false;
    if (restoringBackup && group.cloud?.deleted) return group.options.filter(option => !option.deleted).length > 1;
    return group.options.length > 1;
  });
  return { groups: all, conflicts, photoTombstones, restoringBackup };
}

// Apply a source choice only where that exact source exists; unrelated conflicts remain reviewable.
export function selectMergeConflict(plan, index, option, previous, applyToAll, preferredSource = null) {
  const group = plan.conflicts[index];
  const selections = { ...previous, [`${group.collection}:${group.key}`]: option };
  if (applyToAll && plan.restoringBackup && group.collection === 'records' && !option.deleted) {
    const source = preferredSource && option.sources.includes(preferredSource) ? preferredSource : option.sources.includes('device') && !option.sources.includes('backup') ? 'device' : option.sources.includes('backup') && !option.sources.includes('device') ? 'backup' : null;
    if (source) for (const candidate of plan.conflicts.slice(index + 1)) {
      if (candidate.collection !== 'records') continue;
      const matching = candidate.options.find(item => !item.deleted && item.sources.includes(source));
      if (matching) selections[`${candidate.collection}:${candidate.key}`] = matching;
    }
  }
  const nextIndex = plan.conflicts.findIndex((candidate, i) => i > index && !selections[`${candidate.collection}:${candidate.key}`]);
  return { selections, nextIndex };
}

export function sameSourceSnapshot(first, second, source) {
  if (source === 'cloud' && JSON.stringify(first.photoTombstones || []) !== JSON.stringify(second.photoTombstones || [])) return false;
  const snapshot = plan => new Map(plan.groups.flatMap(group => {
    const option = group.options.find(candidate => candidate.sources.includes(source));
    const original = source === 'cloud' ? group.cloud?.value : option?.value;
    return option ? [[`${group.collection}:${group.key}`, JSON.stringify([option.signature, original?.updatedAt || 0])]] : [];
  }));
  const a = snapshot(first);
  const b = snapshot(second);
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}
