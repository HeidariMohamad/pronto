import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { api } from '../services/api';
import { subscribeSyncStatus } from '../services/sync';
import { useTranslation } from '../hooks/useTranslation';
import { prepareMerge } from '../services/mergeData';

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

export function DeviceBackupStatus({ usage }) {
  const { t } = useTranslation();
  const [cloud, setCloud] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [matching, setMatching] = useState(null);
  const records = useLiveQuery(() => db.records.toArray());
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
  return <div className="space-y-2">
    <CloudBackupSummary usage={usage} />
    <p className="text-xs text-slate-300" role="status">{unavailable ? t('Backup status could not be verified. Connect and retry syncing.') : matching === null ? t('Checking backup status…') : t('{saved} of {total} device record days match the cloud. {pending} need backup or have changes.', { saved: matching, total: records.length, pending: records.length - matching })}</p>
    <p className="text-[11px] text-slate-500">{t('Device status covers this browser only. Unsynced data on other devices is not visible to admins.')}</p>
  </div>;
}
