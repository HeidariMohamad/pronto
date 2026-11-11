import { useEffect, useRef, useState } from 'react';
import { HardDrive, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { useTranslation } from '../hooks/useTranslation';

function size(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function OptimizerPanel({ users }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState('all');
  const [job, setJob] = useState(null);
  const [currentUsers, setCurrentUsers] = useState(null);
  const [userResults, setUserResults] = useState({});
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const refreshedJob = useRef('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get('/api/admin/optimizer');
        if (!active) return;
        setJob(result.job);
        setUserResults(result.users || {});
        setError('');
        const completedKey = result.job && `${result.job.id}:${result.job.status}`;
        if (result.job && result.job.status !== 'running' && refreshedJob.current !== completedKey) {
          const metrics = await api.get('/api/admin/metrics');
          if (active) { setCurrentUsers(metrics.users); refreshedJob.current = completedKey; }
        }
      } catch { if (active) setError('Could not load optimizer status'); }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const start = async mode => {
    if (mode === 'optimize' && !window.confirm(t('Optimize selected users’ cloud photos? Original photos will be retained on the server.'))) return;
    setStarting(true); setError('');
    try {
      const result = await api.post('/api/admin/optimizer', { mode, userId: selected === 'all' ? null : selected });
      setJob(result.job);
    } catch { setError('Could not start optimizer'); }
    finally { setStarting(false); }
  };

  const running = job?.status === 'running';
  const busy = running || starting;
  const progress = job?.total ? Math.round((job.processed / job.total) * 100) : job?.status === 'completed' ? 100 : 0;
  const latestUsers = currentUsers || users;
  const status = { running: 'Running', completed: 'Completed', failed: 'Failed', interrupted: 'Interrupted' };
  const resultTotal = job?.users?.reduce((sum, item) => sum + (job.mode === 'preview' ? item.estimatedBytes : item.savedBytes), 0) || 0;
  return <section id="photo-optimizer" className="rounded-3xl border border-white/10 bg-[#111d30] p-4 space-y-4">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-500/15 p-2 text-blue-300"><Sparkles size={18}/></div><div><h3 className="font-semibold text-white">{t('Photo optimizer')}</h3><p className="mt-1 text-xs text-slate-400">{t('Preview savings or optimize photos for one user or everyone.')}</p></div></div>
    <label className="block text-xs text-slate-400">{t('Choose users')}<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-sm text-white"><option value="all">{t('All users')}</option>{users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => start('preview')} className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2.5 text-xs font-semibold text-blue-300 disabled:opacity-40">{t('Preview savings')}</button><button type="button" disabled={busy} onClick={() => start('optimize')} className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{t('Optimize photos')}</button></div>
    <p className="text-[11px] leading-relaxed text-slate-400">{t('Originals are retained as server backups. Quota savings do not immediately free server disk space.')}</p>
    {error && <p role="alert" className="text-xs text-red-300">{t(error)}</p>}
    {job && <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-white">{t(job.mode === 'preview' ? 'Savings preview' : 'Optimization')} · {t(status[job.status] || 'Failed')}</span>{running && <RefreshCw size={14} className="animate-spin text-blue-300"/>}</div>
      <div className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }}/></div>
      <p className="text-xs text-slate-300">{job.stage === 'scanning' ? t('Preparing photo inventory…') : t('{done} of {total} photos processed', { done: job.processed, total: job.total })}</p>
      {job.status === 'interrupted' && <p className="text-xs text-amber-300">{t('The server restarted. Completed photos are safe; run again to continue.')}</p>}
      <p className="text-xs font-medium text-emerald-300">{job.mode === 'preview' ? t('Estimated quota savings: {size}', { size: size(resultTotal) }) : t('Quota saved: {size}', { size: size(resultTotal) })}</p>
      <div className="space-y-2">{job.users.map(item => <div key={item.id} className="rounded-xl bg-white/5 p-3 text-xs space-y-1"><div className="flex justify-between gap-2"><span className="font-semibold text-slate-200 break-all">{item.name || item.email} {running && job.currentUserId === item.id && <span className="text-blue-300">· {t('Running')}</span>}</span><span className="text-slate-400 whitespace-nowrap">{item.processed}/{item.total}</span></div><p className="text-slate-400">{t('Storage before: {size}', { size: size(item.beforeBytes) })} · {job.mode === 'preview' ? t('Estimated savings: {size}', { size: size(item.estimatedBytes) }) : t('Storage now: {size}', { size: size(item.afterBytes) })}</p><p className="text-slate-400">{t(job.mode === 'preview' ? 'Can optimize: {count} · Skipped: {skipped} · Failed: {failed}' : 'Optimized: {count} · Skipped: {skipped} · Failed: {failed}', { count: item.optimized, skipped: item.skipped, failed: item.failed })}</p></div>)}</div>
    </div>}
    <div className="space-y-2"><h4 className="flex items-center gap-2 text-xs font-semibold text-slate-300"><HardDrive size={14}/>{t('Current storage by user')}</h4><div className="max-h-60 overflow-y-auto divide-y divide-white/5">{latestUsers.map(user => <div key={user.id} className="py-2 text-xs space-y-1"><div className="flex justify-between gap-3"><span className="truncate text-slate-300">{user.name || user.email}</span><span className="whitespace-nowrap text-slate-400">{size(user.totalBytes)} / {user.storageLimitMb} MB</span></div>{userResults[user.id] && <p className="text-slate-400">{t('Previously saved: {size}', { size: size(userResults[user.id].savedBytes) })}{userResults[user.id].estimatedBytes !== null && <> · {t('Estimated savings: {size}', { size: size(userResults[user.id].estimatedBytes) })}</>}</p>}</div>)}</div></div>
  </section>;
}
