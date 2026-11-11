// Compare the meaningful content, not timestamps assigned by different devices.
function content(collection, value) {
  if (collection === 'records') {
    return JSON.stringify({ entries: value.entries || [], note: value.note || '' });
  }
  const { updatedAt, ...rest } = value;
  return JSON.stringify(rest);
}

export function prepareMerge(device, cloud, backup = null) {
  const groups = new Map();
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
      add('records', record.date, record, source);
    }
    for (const semester of data.semesters || []) {
      if (!semester || semester.id === undefined || semester.id === null) throw new Error('Invalid backup semester');
      const id = String(semester.id);
      add('semesters', id, { ...semester, id: /^\d+$/.test(id) ? Number(id) : id }, source);
    }
    const settings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
    if (settings) add('settings', 'v8', { ...settings, id: 'v8' }, source);
  }
  const all = [...groups.values()];
  return { groups: all, conflicts: all.filter(group => group.options.length > 1) };
}

export function sameSourceSnapshot(first, second, source) {
  const snapshot = plan => new Map(plan.groups.flatMap(group => {
    const option = group.options.find(candidate => candidate.sources.includes(source));
    const original = source === 'cloud' ? group.cloud?.value : option?.value;
    return option ? [[`${group.collection}:${group.key}`, JSON.stringify([option.signature, original?.updatedAt || 0])]] : [];
  }));
  const a = snapshot(first);
  const b = snapshot(second);
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}
