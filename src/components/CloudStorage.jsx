import React, { useState } from 'react';
import { Cloud, HardDrive, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { embeddedPhotoKey } from '../services/mergeData';

const copy = {
  en: { title: 'Manage cloud storage', close: 'Close', loading: 'Loading cloud storage…', empty: 'Nothing saved here.', records: 'Days', semesters: 'Schedules', photos: 'Photos', delete: 'Delete', noPunches: 'No punches', error: 'Could not load cloud storage.', deleting: 'Deleting…', changed: 'Deleted from the cloud, but this device changed meanwhile. Use Sync Now to review it.', localError: 'Deleted from the cloud, but this device could not be updated. Use Sync Now to review it.', cleanup: 'Deleted, but server disk cleanup is still pending.', confirmRecord: 'Delete this entire day from cloud storage and this device? Its stored photos are listed separately.', confirmSemester: 'Delete this schedule from cloud storage and this device? Work records will remain.', confirmPhoto: 'Delete this photo from cloud storage and remove it from its records? This cannot be undone.', syncHint: 'Other devices will review deletions the next time you use Sync Now.' },
  pt: { title: 'Gerenciar armazenamento na nuvem', close: 'Fechar', loading: 'Carregando armazenamento…', empty: 'Nada salvo aqui.', records: 'Dias', semesters: 'Horários', photos: 'Fotos', delete: 'Excluir', noPunches: 'Sem registros', error: 'Não foi possível carregar o armazenamento.', deleting: 'Excluindo…', changed: 'Excluído da nuvem, mas este dispositivo mudou. Use Sincronizar Agora para revisar.', localError: 'Excluído da nuvem, mas não foi possível atualizar este dispositivo. Use Sincronizar Agora para revisar.', cleanup: 'Excluído, mas a limpeza no servidor ainda está pendente.', confirmRecord: 'Excluir este dia inteiro da nuvem e deste dispositivo? As fotos salvas são listadas separadamente.', confirmSemester: 'Excluir este horário da nuvem e deste dispositivo? Os registros de ponto serão mantidos.', confirmPhoto: 'Excluir esta foto da nuvem e removê-la dos registros? Esta ação não pode ser desfeita.', syncHint: 'Em outros dispositivos, use Sincronizar Agora para revisar as exclusões.' },
  fa: { title: 'مدیریت فضای ابری', close: 'بستن', loading: 'در حال بارگذاری…', empty: 'موردی ذخیره نشده است.', records: 'روزها', semesters: 'برنامه‌ها', photos: 'عکس‌ها', delete: 'حذف', noPunches: 'بدون ثبت', error: 'بارگذاری فضای ابری ناموفق بود.', deleting: 'در حال حذف…', changed: 'از فضای ابری حذف شد، اما داده این دستگاه تغییر کرده است. همگام‌سازی را بررسی کنید.', localError: 'از فضای ابری حذف شد، اما دستگاه به‌روزرسانی نشد. همگام‌سازی را بررسی کنید.', cleanup: 'حذف شد، اما پاک‌سازی فایل روی سرور هنوز انجام نشده است.', confirmRecord: 'این روز از فضای ابری و این دستگاه حذف شود؟ عکس‌های ذخیره‌شده جداگانه فهرست شده‌اند.', confirmSemester: 'این برنامه از فضای ابری و این دستگاه حذف شود؟ سوابق کاری باقی می‌مانند.', confirmPhoto: 'این عکس از فضای ابری و سوابق حذف شود؟ این کار قابل بازگشت نیست.', syncHint: 'برای بررسی حذف‌ها در دستگاه‌های دیگر، همگام‌سازی را اجرا کنید.' }
};

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CloudStorage() {
  const { lang, t } = useTranslation();
  const { refreshStorage } = useAuth();
  const labels = copy[lang] || copy.en;
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const result = await api.get('/api/storage');
    setData(result);
    return result;
  };

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setBusy(true);
    setMessage('');
    try { await load(); } catch (err) { setMessage(err.message || labels.error); }
    finally { setBusy(false); }
  };

  const remove = async (collection, item) => {
    const prompt = collection === 'records' ? labels.confirmRecord : collection === 'semesters' ? labels.confirmSemester : labels.confirmPhoto;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage(labels.deleting);
    const id = String(collection === 'records' ? item.date : item.id);
    const key = collection === 'semesters' && /^\d+$/.test(id) ? Number(id) : id;
    const keys = collection === 'semesters' && typeof key === 'number' ? [key, id] : [key];
    let removedFromCloud = false;
    try {
      const before = collection === 'photos' ? null : collection === 'embeddedPhotos' ? await db.records.get(item.date) : await Promise.all(keys.map(itemKey => db[collection].get(itemKey)));
      const embeddedMatches = [];
      if (collection === 'embeddedPhotos' && before) {
        for (const [index, entry] of (before.entries || []).entries()) {
          if (!entry || typeof entry !== 'object') continue;
          if (await embeddedPhotoKey(item.date, entry, index) === item.photoKey) embeddedMatches.push({ identity: entry.id == null ? `index-${index}` : `id-${String(entry.id)}`, photo: entry.photo });
        }
      }
      const result = await api.post('/api/storage/delete', { collection, id, expectedUpdatedAt: item.updatedAt, photoKey: item.photoKey });
      removedFromCloud = true;
      let changed = false;
      await db.transaction('rw', db.records, db.semesters, db.pending_sync, async () => {
        if (collection === 'embeddedPhotos') {
          const record = await db.records.get(item.date);
          if (record && embeddedMatches.length) {
            let removed = 0;
            const entries = (record.entries || []).map((entry, index) => {
              if (!entry || typeof entry !== 'object') return entry;
              const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
              if (embeddedMatches.some(match => match.identity === identity && match.photo === entry.photo)) { removed++; return { ...entry, photo: null }; }
              return entry;
            });
            if (removed) await db.records.update(record.date, { entries, updatedAt: Math.max(record.updatedAt || 0, result.changedRecords?.[0]?.updatedAt || 0) });
            if (removed < embeddedMatches.length) changed = true;
          }
        } else if (collection === 'photos') {
          const cloudTimes = new Map((result.changedRecords || []).map(record => [record.date, record.updatedAt]));
          const records = await db.records.toArray();
          for (const record of records) {
            if ((record.entries || []).some(entry => entry?.photo === result.url)) {
              const entries = record.entries.map(entry => entry?.photo === result.url ? { ...entry, photo: null } : entry);
              await db.records.update(record.date, { entries, updatedAt: Math.max(record.updatedAt || 0, cloudTimes.get(record.date) || 0) });
            }
          }
        } else {
          const current = await Promise.all(keys.map(itemKey => db[collection].get(itemKey)));
          if (JSON.stringify(current) !== JSON.stringify(before)) {
            changed = true;
          } else {
            await db[collection].bulkDelete(keys);
            await db.pending_sync.where('collection').equals(collection).filter(entry => entry.docId === id).delete();
          }
        }
      });
      await load();
      await refreshStorage();
      setMessage(changed ? labels.changed : result.cleanupPending ? labels.cleanup : labels.syncHint);
    } catch (err) {
      console.error('Cloud storage deletion failed:', err);
      setMessage(removedFromCloud ? labels.localError : (err.message || labels.error));
      if (removedFromCloud) { try { await load(); await refreshStorage(); } catch {} }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-3 text-sm font-semibold hover:bg-white/10">
        <span className="flex items-center gap-2"><Cloud size={16} />{open ? labels.close : labels.title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="space-y-2 text-sm">
        {busy && <p className="text-xs text-slate-400">{labels.loading}</p>}
        {message && <p role="status" className="text-xs text-slate-300">{message}</p>}
        {data && <>
          <p className="flex items-center gap-1.5 text-xs text-slate-400"><HardDrive size={14} />{size(data.storageUsage.totalBytes)} / {data.storageUsage.storageLimitMb} MB</p>
          <details className="rounded-xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer p-3 font-semibold">{labels.records} ({data.records.length})</summary>
            <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-2">
              {!data.records.length && <p className="text-xs text-slate-400">{labels.empty}</p>}
              {[...data.records].sort((a, b) => b.date.localeCompare(a.date)).map(record => <div key={record.date} className="rounded-lg bg-white/5 p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2"><span className="font-semibold">{record.date}</span><span className="text-xs text-slate-400">{size(record.sizeBytes)}</span></div>
                <p className="text-xs text-slate-300 break-words">{record.entries.map(entry => `${entry.type || ''} ${entry.time || ''}${entry.hasPhoto ? ' 📷' : ''}`).join(' · ') || labels.noPunches}</p>
                {record.note && <p className="text-xs text-slate-400 break-words">{record.note}</p>}
                <button type="button" disabled={busy} onClick={() => remove('records', record)} className="flex items-center gap-1 text-xs text-red-300 py-1"><Trash2 size={13} />{labels.delete}</button>
              </div>)}
            </div>
          </details>
          <details className="rounded-xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer p-3 font-semibold">{labels.semesters} ({data.semesters.length})</summary>
            <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-2">
              {!data.semesters.length && <p className="text-xs text-slate-400">{labels.empty}</p>}
              {data.semesters.map(semester => <div key={semester.id} className="rounded-lg bg-white/5 p-2.5 space-y-1">
                <div className="flex justify-between gap-2"><span className="font-semibold">{semester.name}</span><span className="text-xs text-slate-400">{size(semester.sizeBytes)}</span></div>
                <p className="text-xs text-slate-300">{semester.startDate} – {semester.endDate}</p>
                {Array.isArray(semester.targets) && <div className="space-y-0.5 text-xs text-slate-400">
                  {semester.targets.map((sessions, day) => <p key={day}>{t('weekday_labels')[day]}: {Array.isArray(sessions) && sessions.length ? sessions.map(session => typeof session === 'number' ? `${Math.floor(session / 60)}h ${session % 60}m` : `${session.start || '—'}–${session.end || '—'}`).join(', ') : '—'}</p>)}
                </div>}
                <button type="button" disabled={busy} onClick={() => remove('semesters', semester)} className="flex items-center gap-1 text-xs text-red-300 py-1"><Trash2 size={13} />{labels.delete}</button>
              </div>)}
            </div>
          </details>
          <details className="rounded-xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer p-3 font-semibold">{labels.photos} ({data.files.length + (data.embeddedPhotos?.length || 0)})</summary>
            <div className="max-h-72 overflow-y-auto px-3 pb-3 grid grid-cols-2 gap-2">
              {!data.files.length && !data.embeddedPhotos?.length && <p className="text-xs text-slate-400">{labels.empty}</p>}
              {data.files.map(file => <div key={file.id} className="rounded-lg bg-white/5 p-2 space-y-1 min-w-0">
                <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.originalName || labels.photos} className="w-full h-24 object-cover rounded-lg" loading="lazy" /></a>
                <p className="text-xs text-slate-400 truncate">{file.originalName} · {size(file.sizeBytes)}</p>
                <button type="button" disabled={busy} onClick={() => remove('photos', file)} className="flex items-center gap-1 text-xs text-red-300 py-1"><Trash2 size={13} />{labels.delete}</button>
              </div>)}
              {(data.embeddedPhotos || []).map(photo => <div key={photo.id} className="rounded-lg bg-white/5 p-2 space-y-1 min-w-0">
                <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`${labels.photos} ${photo.date}`} className="w-full h-24 object-cover rounded-lg" loading="lazy" /></a>
                <p className="text-xs text-slate-400 truncate">{photo.date} · {size(photo.sizeBytes)}</p>
                <button type="button" disabled={busy} onClick={() => remove('embeddedPhotos', photo)} className="flex items-center gap-1 text-xs text-red-300 py-1"><Trash2 size={13} />{labels.delete}</button>
              </div>)}
            </div>
          </details>
          <p className="text-xs text-slate-400">{labels.syncHint}</p>
        </>}
      </div>}
    </div>
  );
}
