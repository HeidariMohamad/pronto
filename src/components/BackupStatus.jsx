import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { api } from '../services/api';
import { subscribeSyncStatus } from '../services/sync';
import { useTranslation } from '../hooks/useTranslation';
import { prepareMerge } from '../services/mergeData';
import { subscribeOfflinePhotos } from '../services/offlinePhotos';

export function CloudBackupSummary({ usage }) {
  const { t } = useTranslation();
  if (!usage) return null;
  const coverage = usage.backupCoverage || {};
  return <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2 text-xs text-slate-300">
    <h4 className="font-semibold text-blue-300">{t('Cloud backup coverage')}</h4>
    <p>{t('Stored in cloud: {size} MB · {records} record days · {files} files', { size: (usage.totalBytes / 1048576).toFixed(2), records: usage.recordsCount, files: usage.filesCount })}</p>
    <p>{coverage.firstRecordDate ? t('Saved record dates: {from} to {to}', { from: coverage.firstRecordDate, to: coverage.lastRecordDate }) : t('No record days backed up yet')}</p>
    {coverage.firstFileSavedAt && <p>{t('Files uploaded: {from} to {to}', { from: coverage.firstFileSavedAt, to: coverage.lastFileSavedAt })}</p>}
    <p className="text-slate-500">{t('Record dates show coverage, not the time of upload.')}</p>
  </div>;
}

export function DeviceBackupStatus() {
  const { t } = useTranslation();
  const [cloud, setCloud] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [matching, setMatching] = useState(null);
  const [offlinePhotos, setOfflinePhotos] = useState({ cached: 0, total: 0, state: 'idle', failed: 0 });
  const records = useLiveQuery(() => db.records.toArray());
  useEffect(() => subscribeOfflinePhotos(setOfflinePhotos), []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get('/api/sync/pull');
        if (active) { setCloud(result); setUnavailable(false); }
      } catch { if (active) setUnavailable(true); }
    };
    const unsubscribe = subscribeSyncStatus(status => { if (status === 'idle' || status === 'error') refresh(); });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!records || !cloud) return undefined;
    let active = true;
    prepareMerge({ records }, cloud).then(plan => {
      if (active) setMatching(plan.groups.filter(group => group.collection === 'records' && group.options.some(option => option.sources.includes('device') && option.sources.includes('cloud'))).length);
    }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [records, cloud]);
  const missingDays = records && cloud ? (cloud.records || []).filter(saved => !records.some(record => record.date === saved.date)).length : null;
  const pending = records && matching !== null ? Math.max(0, records.length - matching) : null;
  return <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2 text-xs text-slate-300" role="status" aria-live="polite">
    <h4 className="font-semibold text-blue-300">{t('Backup status')}</h4>
    {unavailable ? <p className="text-amber-300">{t('Could not check your backup. Connect and try again.')}</p> : matching === null || !records || !cloud ? <p>{t('Checking backup status…')}</p> : <>
      <p>{records.length ? t('{saved} of {total} days on this device match your backup.', { saved: matching, total: records.length }) : t('No saved days on this device.')}</p>
      {pending > 0 && <p className="text-amber-300">{t('{count} days need to be backed up or reviewed.', { count: pending })}</p>}
      {missingDays > 0 && <p className="text-amber-300">{t('{count} days in your backup are not on this device. Tap Sync Now to review them.', { count: missingDays })}</p>}
    </>}
    {offlinePhotos.total > 0 && <p>{t('Downloaded photos available offline: {saved} of {total}', { saved: offlinePhotos.cached, total: offlinePhotos.total })}</p>}
    {offlinePhotos.state === 'syncing' && offlinePhotos.cached < offlinePhotos.total && <p>{t('Downloading photos for offline use…')}</p>}
    {offlinePhotos.state === 'offline' && offlinePhotos.cached < offlinePhotos.total && <p className="text-amber-300">{t('Connect to the internet to finish saving photos for offline use.')}</p>}
    {offlinePhotos.state === 'error' && <p className="text-amber-300">{t('Some photos could not be saved on this device. Check your connection and device storage, then reopen the app.')}</p>}
  </div>;
}
