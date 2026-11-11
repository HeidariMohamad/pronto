// Compare the meaningful content, not timestamps assigned by different devices.
function content(collection, value) {
  if (collection === 'records') {
    return JSON.stringify({ entries: value.entries || [], note: value.note || '' });
  }
  const rest = { ...value };
  delete rest.updatedAt;
  return JSON.stringify(rest);
}

export async function embeddedPhotoKey(date, entry, index) {
  if (typeof entry?.photo !== 'string' || !entry.photo.startsWith('data:image/')) return null;
  const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entry.photo));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `embedded:${JSON.stringify([date, identity, hash])}`;
}

export async function prepareMerge(device, cloud, backup = null) {
  const groups = new Map();
  const deletedPhotos = new Set((cloud?.deletedItems || []).filter(item => item.collection === 'photos').map(item => item.id));
  const embeddedIdentities = new Set();
  for (const id of deletedPhotos) {
    if (!id.startsWith('embedded:')) continue;
    try {
      const [date, identity] = JSON.parse(id.slice('embedded:'.length));
      embeddedIdentities.add(JSON.stringify([date, identity]));
    } catch { /* Ignore invalid legacy markers. */ }
  }
  const add = (collection, key, value, source) => {
    if (key === undefined || key === null || key === '') throw new Error(`Invalid ${collection} item`);
    const groupKey = `${collection}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { collection, key, options: [], cloud: null });
    const group = groups.get(groupKey);
    const signature = content(collection, value);
    if (source === 'cloud') group.cloud = { signature, value };
    const existing = group.options.find(option => option.signature === signature);
    if (existing) existing.sources.push(source);
    else group.options.push({ value, signature, sources: [source] });
  };

  for (const [source, data] of [['device', device], ['cloud', cloud], ['backup', backup]]) {
    if (!data) continue;
    for (const record of data.records || []) {
      if (!record || typeof record.date !== 'string' || !Array.isArray(record.entries || [])) throw new Error('Invalid backup record');
      const entries = [];
      for (const [index, entry] of (record.entries || []).entries()) {
        if (!entry || typeof entry !== 'object') { entries.push(entry); continue; }
        const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
        let removed = deletedPhotos.has(entry.photo);
        if (!removed && embeddedIdentities.has(JSON.stringify([record.date, identity]))) {
          const key = await embeddedPhotoKey(record.date, entry, index);
          removed = key && deletedPhotos.has(key);
        }
        entries.push(removed ? { ...entry, photo: null } : entry);
      }
      const cleaned = { ...record, entries };
      add('records', record.date, cleaned, source);
    }
    for (const semester of data.semesters || []) {
      if (!semester || semester.id === undefined || semester.id === null) throw new Error('Invalid backup semester');
      const id = String(semester.id);
      add('semesters', id, { ...semester, id: /^\d+$/.test(id) ? Number(id) : id }, source);
    }
    const settings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
    if (settings) add('settings', 'v8', { ...settings, id: 'v8' }, source);
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
  const photoTombstones = (cloud?.deletedItems || []).filter(item => item.collection === 'photos')
    .map(item => [item.id, item.deletedAt]).sort((a, b) => a[0].localeCompare(b[0]));
  return { groups: all, conflicts: all.filter(group => group.options.length > 1), photoTombstones };
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
