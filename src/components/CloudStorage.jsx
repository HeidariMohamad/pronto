import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Cloud, 
  HardDrive, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  CheckSquare, 
  Square, 
  AlertTriangle, 
  Image as ImageIcon,
  Calendar,
  Layers,
  Eye,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { embeddedPhotoKey } from '../services/mergeData';
import { formatPunchType } from '../services/i18n';

const copy = {
  en: { 
    title: 'Manage cloud storage', 
    close: 'Close', 
    loading: 'Loading cloud storage…', 
    empty: 'Nothing saved here.', 
    records: 'Days', 
    semesters: 'Schedules', 
    photos: 'Photos', 
    delete: 'Delete', 
    noPunches: 'No punches',
    error: 'Could not load cloud storage.', 
    deleting: 'Deleting…', 
    changed: 'Deleted from the cloud, but this device changed meanwhile. Use Sync Now to review it.', 
    localError: 'Deleted from the cloud, but this device could not be updated. Use Sync Now to review it.', 
    cleanup: 'Deleted, but server disk cleanup is still pending.', 
    confirmRecord: 'Delete this entire day from cloud storage and this device? Its stored photos are listed separately.', 
    confirmSemester: 'Delete this schedule from cloud storage and this device? Work records will remain.', 
    confirmPhoto: 'Delete this photo from cloud storage and remove it from its records? This cannot be undone.', 
    syncHint: 'Other devices will review deletions the next time you use Sync Now.',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    deleteSelected: 'Delete selected',
    deleteAllPhotos: 'Delete all photos',
    deleteAllCloud: 'Delete all cloud data',
    confirmDeleteSelected: 'Are you sure you want to delete the selected items from the cloud and this device?',
    confirmDeleteAllPhotos: 'Delete ALL photos from cloud storage? Your work hours and punches will stay intact.',
    confirmDeleteAllCloud: '⚠️ DANGER: Delete ALL records, schedules, and photos from the cloud? This action cannot be undone.',
    selectedCount: 'selected',
    viewPhoto: 'View photo'
  },
  pt: { 
    title: 'Gerenciar armazenamento na nuvem', 
    close: 'Fechar', 
    loading: 'Carregando armazenamento…', 
    empty: 'Nada salvo aqui.', 
    records: 'Registros', 
    semesters: 'Jornadas', 
    photos: 'Imagens', 
    delete: 'Excluir', 
    noPunches: 'Sem registros', 
    error: 'Não foi possível carregar o armazenamento.', 
    deleting: 'Excluindo…', 
    changed: 'Excluído da nuvem, mas este dispositivo mudou. Use Sincronizar Agora para revisar.', 
    localError: 'Excluído da nuvem, mas não foi possível atualizar este dispositivo. Use Sincronizar Agora para revisar.', 
    cleanup: 'Excluído, mas a limpeza no servidor ainda está pendente.', 
    confirmRecord: 'Excluir este dia inteiro da nuvem e deste dispositivo? As imagens salvas são listadas separadamente.', 
    confirmSemester: 'Excluir esta jornada da nuvem e deste dispositivo? Os registros de ponto serão mantidos.', 
    confirmPhoto: 'Excluir esta imagem da nuvem e removê-la dos registros? Esta ação não pode ser desfeita.', 
    syncHint: 'Em outros dispositivos, use Sincronizar Agora para revisar as exclusões.',
    selectAll: 'Selecionar tudo',
    deselectAll: 'Desmarcar tudo',
    deleteSelected: 'Excluir selecionados',
    deleteAllPhotos: 'Excluir todas as fotos',
    deleteAllCloud: 'Excluir tudo da nuvem',
    confirmDeleteSelected: 'Tem certeza que deseja excluir os itens selecionados da nuvem e deste dispositivo?',
    confirmDeleteAllPhotos: 'Excluir TODAS as fotos da nuvem? Suas horas e registros continuarão intactos.',
    confirmDeleteAllCloud: '⚠️ PERIGO: Excluir TODOS os registros, jornadas e fotos da nuvem? Esta ação não pode ser desfeita.',
    selectedCount: 'selecionado(s)',
    viewPhoto: 'Ver imagem'
  },
  fa: { 
    title: 'مدیریت فضای ابری', 
    close: 'بستن', 
    loading: 'در حال بارگذاری…', 
    empty: 'موردی ذخیره نشده است.', 
    records: 'روزها', 
    semesters: 'برنامه‌ها', 
    photos: 'عکس‌ها', 
    delete: 'حذف', 
    noPunches: 'بدون ثبت', 
    error: 'بارگذاری فضای ابری ناموفق بود.', 
    deleting: 'در حال حذف…', 
    changed: 'از فضای ابری حذف شد، اما داده این دستگاه تغییر کرده است. همگام‌سازی را بررسی کنید.', 
    localError: 'از فضای ابری حذف شد، اما دستگاه به‌روزرسانی نشد. همگام‌سازی را بررسی کنید.', 
    cleanup: 'حذف شد، اما پاک‌سازی فایل روی سرور هنوز انجام نشده است.', 
    confirmRecord: 'این روز از فضای ابری و این دستگاه حذف شود؟ عکس‌های ذخیره‌شده جداگانه فهرست شده‌اند.', 
    confirmSemester: 'این برنامه از فضای ابری و این دستگاه حذف شود؟ سوابق کاری باقی می‌مانند.', 
    confirmPhoto: 'این عکس از فضای ابری و سوابق حذف شود؟ این کار قابل بازگشت نیست.', 
    syncHint: 'برای بررسی حذف‌ها در دستگاه‌های دیگر، همگام‌سازی را اجرا کنید.',
    selectAll: 'انتخاب همه',
    deselectAll: 'لغو انتخاب',
    deleteSelected: 'حذف موارد انتخاب‌شده',
    deleteAllPhotos: 'حذف تمام عکس‌ها',
    deleteAllCloud: 'حذف کامل داده‌های ابری',
    confirmDeleteSelected: 'آیا از حذف موارد انتخاب‌شده از فضای ابری و این دستگاه اطمینان دارید؟',
    confirmDeleteAllPhotos: 'آیا تمام عکس‌ها از فضای ابری حذف شوند؟ ساعات کاری ثبت‌شده باقی خواهند ماند.',
    confirmDeleteAllCloud: '⚠️ هشدار: آیا مایلید تمام سوابق، برنامه‌ها و عکس‌ها از فضای ابری پاک شوند؟ این عمل برگشت‌پذیر نیست.',
    selectedCount: 'مورد انتخاب شد',
    viewPhoto: 'دیدن عکس'
  }
};

function size(bytes) {
  if (!bytes || bytes === 0) return '0 B';
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
  const [previewPhoto, setPreviewPhoto] = useState(null);
  
  // Multi-selection state
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const load = async () => {
    const result = await api.get('/api/storage');
    setData(result);
    return result;
  };

  const toggle = async () => {
    if (open) { 
      setOpen(false); 
      setSelectedKeys(new Set());
      return; 
    }
    setOpen(true);
    setBusy(true);
    setMessage('');
    try { await load(); } catch (err) { setMessage(err.message || labels.error); }
    finally { setBusy(false); }
  };

  const toggleSelection = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllSection = (collection) => {
    if (!data) return;
    const keys = collection === 'photos'
      ? [...data.files.map(item => `photos:${item.id}`), ...(data.embeddedPhotos || []).map(item => `embeddedPhotos:${item.id}`)]
      : (collection === 'records' ? data.records : data.semesters).map(item => `${collection}:${String(collection === 'records' ? item.date : item.id)}`);

    setSelectedKeys(prev => {
      const next = new Set(prev);
      const allSelected = keys.every(k => prev.has(k));
      keys.forEach(k => {
        if (allSelected) next.delete(k);
        else next.add(k);
      });
      return next;
    });
  };

  // Delete single item
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
      setSelectedKeys(prev => {
        const next = new Set(prev);
        next.delete(`${collection}:${id}`);
        return next;
      });
      await load();
      await refreshStorage();
      setMessage(changed ? labels.changed : result.cleanupPending ? labels.cleanup : labels.syncHint);
    } catch (err) {
      console.error('Cloud storage deletion failed:', err);
      setMessage(removedFromCloud ? labels.localError : (err.message || labels.error));
      if (removedFromCloud) {
        try { await load(); await refreshStorage(); }
        catch (refreshError) { console.warn('Could not refresh cloud storage:', refreshError); }
      }
    } finally { setBusy(false); }
  };

  // Mass delete selected items
  const removeSelected = async () => {
    if (selectedKeys.size === 0) return;
    if (!window.confirm(`${labels.confirmDeleteSelected} (${selectedKeys.size} ${labels.selectedCount})`)) return;

    setBusy(true);
    setMessage(labels.deleting);

    try {
      const itemsToDelete = [];
      for (const compositeKey of selectedKeys) {
        const [collection, ...idParts] = compositeKey.split(':');
        const id = idParts.join(':');

        if (collection === 'records') {
          const record = data?.records.find(r => r.date === id);
          if (record) itemsToDelete.push({ collection, id, expectedUpdatedAt: record.updatedAt });
        } else if (collection === 'semesters') {
          const sem = data?.semesters.find(s => String(s.id) === id);
          if (sem) itemsToDelete.push({ collection, id, expectedUpdatedAt: sem.updatedAt });
        } else if (collection === 'photos') {
          const file = data?.files.find(f => f.id === id);
          if (file) itemsToDelete.push({ collection, id, photoKey: file.url });
        } else if (collection === 'embeddedPhotos') {
          const emb = data?.embeddedPhotos?.find(p => p.id === id);
          if (emb) itemsToDelete.push({ collection, id, photoKey: emb.photoKey });
        }
      }

      const result = await api.post('/api/storage/delete-batch', { items: itemsToDelete });

      // Update local storage in one bulk transaction
      await db.transaction('rw', db.records, db.semesters, db.pending_sync, async () => {
        // Handle deleted records
        if (result.deletedRecords?.length) {
          await db.records.bulkDelete(result.deletedRecords);
          for (const d of result.deletedRecords) {
            await db.pending_sync.where('collection').equals('records').filter(e => e.docId === d).delete();
          }
        }
        // Handle deleted semesters
        if (result.deletedSemesters?.length) {
          const keys = result.deletedSemesters.flatMap(id => /^\d+$/.test(id) ? [Number(id), id] : [id]);
          await db.semesters.bulkDelete(keys);
          for (const s of result.deletedSemesters) {
            await db.pending_sync.where('collection').equals('semesters').filter(e => e.docId === s).delete();
          }
        }
        // Handle stripped photos from records
        if (result.changedRecords?.length) {
          for (const changed of result.changedRecords) {
            const local = await db.records.get(changed.date);
            if (local && local.entries) {
              const cleaned = local.entries.map(e => e?.photo ? { ...e, photo: null } : e);
              await db.records.update(changed.date, { entries: cleaned, updatedAt: changed.updatedAt });
            }
          }
        }
      });

      setSelectedKeys(new Set());
      await load();
      await refreshStorage();
      setMessage(`Successfully deleted ${result.deletedCount || itemsToDelete.length} items.`);
    } catch (err) {
      console.error('Batch deletion failed:', err);
      setMessage(err.message || labels.error);
    } finally {
      setBusy(false);
    }
  };

  // Delete ALL Photos shortcut
  const removeAllPhotos = async () => {
    if (!window.confirm(labels.confirmDeleteAllPhotos)) return;

    setBusy(true);
    setMessage(labels.deleting);

    try {
      await api.post('/api/storage/delete-batch', { deleteAll: 'photos' });

      // Clean local records photos
      await db.transaction('rw', db.records, async () => {
        const records = await db.records.toArray();
        for (const record of records) {
          if ((record.entries || []).some(e => e?.photo)) {
            const cleaned = record.entries.map(e => ({ ...e, photo: null }));
            await db.records.update(record.date, { entries: cleaned });
          }
        }
      });

      setSelectedKeys(new Set());
      await load();
      await refreshStorage();
      setMessage(t("All photos deleted successfully from cloud storage."));
    } catch (err) {
      console.error('Delete all photos failed:', err);
      setMessage(err.message || labels.error);
    } finally {
      setBusy(false);
    }
  };

  // Nuclear: Wipe All Cloud Data
  const wipeAllCloudData = async () => {
    if (!window.confirm(labels.confirmDeleteAllCloud)) return;
    if (!window.confirm(t("Please confirm one more time: Reset all cloud data to 0 MB?"))) return;

    setBusy(true);
    setMessage(labels.deleting);

    try {
      await api.post('/api/storage/delete-batch', { deleteAll: 'all' });

      // Clean local databases
      await db.transaction('rw', db.records, db.semesters, db.pending_sync, async () => {
        await db.records.clear();
        await db.semesters.clear();
        await db.pending_sync.clear();
      });

      setSelectedKeys(new Set());
      await load();
      await refreshStorage();
      setMessage(t("All cloud data wiped successfully."));
    } catch (err) {
      console.error('Wipe all cloud data failed:', err);
      setMessage(err.message || labels.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <button 
        type="button" 
        onClick={toggle} 
        className="w-full flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-3.5 text-sm font-semibold hover:bg-white/10 active:scale-[0.99] transition-all shadow-sm"
      >
        <span className="flex items-center gap-2.5 text-white">
          <Cloud size={18} className="text-blue-400" />
          <span>{open ? labels.close : labels.title}</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="space-y-3 text-sm animate-fade-in">
          {busy && <p className="text-xs text-slate-400 animate-pulse">{labels.loading}</p>}
          {message && (
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-200">
              {message}
            </div>
          )}

          {data && (
            <>
              {/* Storage Overview Bar & Quick Mass Clean Actions */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <HardDrive size={14} className="text-purple-400" />
                    <span>{size(data.storageUsage.totalBytes)} / {data.storageUsage.storageLimitMb} MB</span>
                  </span>
                  <span>{Math.round(((data.storageUsage.totalBytes || 0) / (data.storageUsage.storageLimitBytes || 1)) * 100)}% Used</span>
                </div>

                {/* Mass Delete Quick Action Pills */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                  {(data.files?.length > 0 || data.embeddedPhotos?.length > 0) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={removeAllPhotos}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      <ImageIcon size={13} />
                      <span>{labels.deleteAllPhotos}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={wipeAllCloudData}
                    className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Trash2 size={13} />
                    <span>{labels.deleteAllCloud}</span>
                  </button>
                </div>
              </div>

              {/* Multi-Selection Sticky Action Bar */}
              {selectedKeys.size > 0 && (
                <div className="p-2.5 px-3 rounded-2xl bg-blue-600/25 border border-blue-400/40 text-white flex items-center justify-between shadow-xl backdrop-blur-md animate-in fade-in">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <CheckSquare size={14} className="text-blue-300" />
                    <span>{selectedKeys.size} {labels.selectedCount}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set())}
                      className="px-2 py-1 text-xs text-slate-300 hover:text-white"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={removeSelected}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                    >
                      <Trash2 size={12} />
                      <span>{labels.deleteSelected} ({selectedKeys.size})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 1. Records / Days Section */}
              <details className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden" open>
                <summary className="cursor-pointer p-3.5 font-semibold flex items-center justify-between hover:bg-white/5 transition-colors">
                  <span className="flex items-center gap-2">
                    <Calendar size={15} className="text-emerald-400" />
                    <span>{labels.records} ({data.records.length})</span>
                  </span>
                  {data.records.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        selectAllSection('records');
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      {data.records.every(r => selectedKeys.has(`records:${r.date}`)) ? labels.deselectAll : labels.selectAll}
                    </button>
                  )}
                </summary>

                <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-2 no-scrollbar">
                  {!data.records.length && <p className="text-xs text-slate-400 py-1">{labels.empty}</p>}
                  {[...data.records].sort((a, b) => b.date.localeCompare(a.date)).map(record => {
                    const key = `records:${record.date}`;
                    const isSelected = selectedKeys.has(key);

                    return (
                      <div 
                        key={record.date} 
                        className={`rounded-xl p-2.5 space-y-1.5 border transition-all ${
                          isSelected ? 'bg-blue-600/15 border-blue-500/40' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(key)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="font-semibold text-white">{record.date}</span>
                          </label>
                          <span className="text-xs text-slate-400 shrink-0">{size(record.sizeBytes)}</span>
                        </div>

                        <p className="text-xs text-slate-300 break-words pl-6.5">
                          {record.entries.map(entry => `${formatPunchType(entry.type, lang)} ${entry.time || ''}${entry.hasPhoto ? ' 📷' : ''}`).join(' · ') || labels.noPunches}
                        </p>
                        {record.note && <p className="text-xs text-slate-400 break-words pl-6.5 italic">"{record.note}"</p>}

                        <div className="flex justify-end pt-1">
                          <button 
                            type="button" 
                            disabled={busy} 
                            onClick={() => remove('records', record)} 
                            className="flex items-center gap-1 text-xs text-red-400/80 hover:text-red-400 p-1"
                          >
                            <Trash2 size={12} />
                            <span>{labels.delete}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* 2. Semesters / Schedules Section */}
              <details className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                <summary className="cursor-pointer p-3.5 font-semibold flex items-center justify-between hover:bg-white/5 transition-colors">
                  <span className="flex items-center gap-2">
                    <Layers size={15} className="text-purple-400" />
                    <span>{labels.semesters} ({data.semesters.length})</span>
                  </span>
                  {data.semesters.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        selectAllSection('semesters');
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      {data.semesters.every(s => selectedKeys.has(`semesters:${String(s.id)}`)) ? labels.deselectAll : labels.selectAll}
                    </button>
                  )}
                </summary>

                <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-2 no-scrollbar">
                  {!data.semesters.length && <p className="text-xs text-slate-400 py-1">{labels.empty}</p>}
                  {data.semesters.map(semester => {
                    const key = `semesters:${String(semester.id)}`;
                    const isSelected = selectedKeys.has(key);

                    return (
                      <div 
                        key={semester.id} 
                        className={`rounded-xl p-2.5 space-y-1.5 border transition-all ${
                          isSelected ? 'bg-blue-600/15 border-blue-500/40' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(key)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="font-semibold text-white">{semester.name}</span>
                          </label>
                          <span className="text-xs text-slate-400 shrink-0">{size(semester.sizeBytes)}</span>
                        </div>

                        <p className="text-xs text-slate-300 pl-6.5">{semester.startDate} – {semester.endDate}</p>

                        <div className="flex justify-end pt-1">
                          <button 
                            type="button" 
                            disabled={busy} 
                            onClick={() => remove('semesters', semester)} 
                            className="flex items-center gap-1 text-xs text-red-400/80 hover:text-red-400 p-1"
                          >
                            <Trash2 size={12} />
                            <span>{labels.delete}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* 3. Photos Section */}
              <details className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                <summary className="cursor-pointer p-3.5 font-semibold flex items-center justify-between hover:bg-white/5 transition-colors">
                  <span className="flex items-center gap-2">
                    <ImageIcon size={15} className="text-amber-400" />
                    <span>{labels.photos} ({data.files.length + (data.embeddedPhotos?.length || 0)})</span>
                  </span>
                  {(data.files.length > 0 || (data.embeddedPhotos?.length || 0) > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        selectAllSection('photos');
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      {data.files.every(f => selectedKeys.has(`photos:${f.id}`)) && (data.embeddedPhotos || []).every(p => selectedKeys.has(`embeddedPhotos:${p.id}`)) ? labels.deselectAll : labels.selectAll}
                    </button>
                  )}
                </summary>

                <div className="max-h-80 overflow-y-auto px-3 pb-3 grid grid-cols-2 gap-2 no-scrollbar">
                  {!data.files.length && !data.embeddedPhotos?.length && (
                    <p className="text-xs text-slate-400 py-1 col-span-2">{labels.empty}</p>
                  )}

                  {data.files.map(file => {
                    const key = `photos:${file.id}`;
                    const isSelected = selectedKeys.has(key);

                    return (
                      <div 
                        key={file.id} 
                        className={`rounded-xl p-2 space-y-1.5 border transition-all relative ${
                          isSelected ? 'bg-blue-600/20 border-blue-500/50' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <label className="relative block cursor-pointer">
                            <img src={file.url} alt={file.originalName || labels.photos} className="w-full h-24 object-cover rounded-lg" loading="lazy" />
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(key)}
                            className="absolute top-1.5 left-1.5 w-4 h-4 rounded text-blue-600 cursor-pointer shadow-md"
                          />
                        </label>

                        <p className="text-[11px] text-slate-400 truncate">{file.originalName} · {size(file.sizeBytes)}</p>
                        
                        <div className="flex justify-between">
                          <button type="button" onClick={() => setPreviewPhoto({ url: file.url, alt: file.originalName || labels.photos })} className="flex items-center gap-1 p-1 text-[11px] text-blue-300"><Eye size={13} />{labels.viewPhoto}</button>
                          <button 
                            type="button" 
                            disabled={busy} 
                            onClick={() => remove('photos', file)} 
                            className="flex items-center gap-1 text-[11px] text-red-400/80 hover:text-red-400 p-0.5"
                          >
                            <Trash2 size={11} />
                            <span>{labels.delete}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(data.embeddedPhotos || []).map(photo => {
                    const key = `embeddedPhotos:${photo.id}`;
                    const isSelected = selectedKeys.has(key);

                    return (
                      <div 
                        key={photo.id} 
                        className={`rounded-xl p-2 space-y-1.5 border transition-all relative ${
                          isSelected ? 'bg-blue-600/20 border-blue-500/50' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <label className="relative block cursor-pointer">
                            <img src={photo.url} alt={`${labels.photos} ${photo.date}`} className="w-full h-24 object-cover rounded-lg" loading="lazy" />
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(key)}
                            className="absolute top-1.5 left-1.5 w-4 h-4 rounded text-blue-600 cursor-pointer shadow-md"
                          />
                        </label>

                        <p className="text-[11px] text-slate-400 truncate">{photo.date} · {size(photo.sizeBytes)}</p>

                        <div className="flex justify-between">
                          <button type="button" onClick={() => setPreviewPhoto({ url: photo.url, alt: `${labels.photos} ${photo.date}` })} className="flex items-center gap-1 p-1 text-[11px] text-blue-300"><Eye size={13} />{labels.viewPhoto}</button>
                          <button 
                            type="button" 
                            disabled={busy} 
                            onClick={() => remove('embeddedPhotos', photo)} 
                            className="flex items-center gap-1 text-[11px] text-red-400/80 hover:text-red-400 p-0.5"
                          >
                            <Trash2 size={11} />
                            <span>{labels.delete}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              <p className="text-xs text-slate-500 italic pt-1">{labels.syncHint}</p>
            </>
          )}
        </div>
      )}
      {previewPhoto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={labels.viewPhoto} onClick={() => setPreviewPhoto(null)} className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4">
          <div className="relative max-h-[85vh] max-w-full" onClick={event => event.stopPropagation()}>
            <img src={previewPhoto.url} alt={previewPhoto.alt} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
            <button type="button" aria-label={labels.close} onClick={() => setPreviewPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"><X size={20} /></button>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
