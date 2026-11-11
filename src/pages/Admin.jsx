import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Card } from '../components/UI';
import { CloudBackupSummary } from '../components/BackupStatus';
import { useTranslation } from '../hooks/useTranslation';
import { optimizeImage } from '../services/imageOptimizer';
import { 
  Users, 
  HardDrive, 
  FileText, 
  ArrowLeft, 
  RefreshCw, 
  ShieldCheck, 
  Search,
  Settings,
  Check,
  Edit3,
  X,
  ShieldAlert,
  Send,
  Bell,
  Trash2,
  AlertTriangle,
  Info,
  AlertCircle,
  MessageSquare
} from 'lucide-react';

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function recordEntries(record) {
  try {
    const entries = typeof record.entries === 'string' ? JSON.parse(record.entries) : record.entries;
    return Array.isArray(entries) ? entries : [];
  } catch { return []; }
}

function recordPhotos(record, files, userId) {
  return recordEntries(record).flatMap((entry, index) => {
    if (typeof entry?.photo !== 'string') return [];
    const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(entry.photo);
    if (match) {
      const data = match[1].replace(/[\r\n]/g, '');
      const size = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      return [{ key: `${record.date}:${index}`, size, embedded: true, time: entry.time, url: `/api/admin/users/${encodeURIComponent(userId)}/records/${encodeURIComponent(record.date)}/photos/${index}` }];
    }
    try {
      const url = new URL(entry.photo, window.location.origin);
      const file = url.origin === window.location.origin && files.find(item => url.pathname === `/uploads/${encodeURIComponent(userId)}/${encodeURIComponent(item.filename)}`);
      return file ? [{ key: `${record.date}:${index}`, size: file.sizeBytes, time: entry.time, url: `/api/admin/users/${encodeURIComponent(userId)}/photos/${encodeURIComponent(file.id)}` }] : [];
    } catch { return []; }
  });
}

function recordSize(record, photos) {
  const encoder = new TextEncoder();
  return encoder.encode(typeof record.entries === 'string' ? record.entries : JSON.stringify(record.entries || [])).length + encoder.encode(record.note || '').length + encoder.encode(record.date || '').length + photos.filter(photo => !photo.embedded).reduce((sum, photo) => sum + Number(photo.size || 0), 0);
}

function PhotoPreview({ photo, t }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const open = async () => {
    if (url) { setUrl(''); return; }
    setLoading(true); setError(false);
    try { setUrl(URL.createObjectURL(await api.getImage(photo.url))); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  return <div className="rounded-xl bg-black/20 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="text-slate-300">{photo.time || t('Photo')} · {formatBytes(photo.size)}</span><button type="button" onClick={open} disabled={loading} className="rounded-lg bg-white/5 px-3 py-2 text-blue-300 hover:bg-white/10">{loading ? t('Loading…') : url ? t('Hide photo') : t('View photo')}</button></div>{error && <p role="alert" className="mt-2 text-red-300">{t('Could not load photo')}</p>}{url && <img src={url} alt={t('Saved photo')} className="mt-2 max-h-80 w-full rounded-lg object-contain" />}</div>;
}

function SavedDays({ records, files, userId, t }) {
  if (!records.length) return <p className="text-xs text-slate-400">{t('No saved records')}</p>;
  return <div className="divide-y divide-white/5">{records.map(record => { const photos = recordPhotos(record, files, userId); return <details key={record.date} className="py-2 text-xs"><summary className="cursor-pointer text-slate-200">{record.date} <span className="text-slate-400">· {t('Saved punches: {count}', { count: recordEntries(record).length })} · {t('Saved photos: {count}', { count: photos.length })} · {formatBytes(recordSize(record, photos))}</span></summary><div className="mt-2 space-y-2">{photos.map(photo => <PhotoPreview key={photo.key} photo={photo} t={t} />)}{!photos.length && <p className="text-slate-400">{t('No saved photos for this day')}</p>}</div></details>; })}</div>;
}

export const AdminPage = () => {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [inboxError, setInboxError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [viewingUserData, setViewingUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState('');

  // Default storage limit state
  const [defaultLimitInput, setDefaultLimitInput] = useState('50');
  const [savingDefault, setSavingDefault] = useState(false);

  // User limit exception modal/state
  const [editingUser, setEditingUser] = useState(null);
  const [customLimitInput, setCustomLimitInput] = useState('');
  const [savingUserLimit, setSavingUserLimit] = useState(false);

  // Ban management modal/state
  const [banningUser, setBanningUser] = useState(null);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [processingBan, setProcessingBan] = useState(false);

  // Messaging / Announcement composer state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [messageRecipient, setMessageRecipient] = useState('all'); // 'all' or userId
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info' | 'warning' | 'alert' | 'success'
  const [sendingMessage, setSendingMessage] = useState(false);

  const fetchMetricsAndNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const [resMetrics, resNotifs, resInbox] = await Promise.all([
        api.get('/api/admin/metrics'),
        api.get('/api/admin/notifications').catch(() => ({ notifications: [] })),
        api.get('/api/admin/messages').then(result => { setInboxError(''); return result; }).catch(() => { setInboxError("Could not load user messages. Refresh to try again."); return null; })
      ]);

      setData(resMetrics);
      setNotifications(resNotifs?.notifications || []);
      if (resInbox) setInbox(resInbox.messages || []);
      if (resMetrics.defaultLimitMb) {
        setDefaultLimitInput(String(resMetrics.defaultLimitMb));
      }
    } catch {
      setError("Failed to fetch admin metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchMetricsAndNotifications();
  }, [isAdmin, navigate]);

  const showNotificationSuccess = (key, values = {}) => {
    setSuccessMsg({ key, values });
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Save Default Storage Limit
  const handleSaveDefaultLimit = async () => {
    const val = parseInt(defaultLimitInput, 10);
    if (!val || val < 1) {
      setError("Please enter a valid positive number for storage limit");
      return;
    }

    setSavingDefault(true);
    setError('');
    try {
      await api.put('/api/admin/config/storage-limit', { limitMb: val });
      showNotificationSuccess("Default storage limit updated to {value} MB", { value: val });
      await fetchMetricsAndNotifications();
    } catch {
      setError("Failed to update default limit");
    } finally {
      setSavingDefault(false);
    }
  };

  // Save Custom Storage Limit for User
  const handleSaveUserLimit = async () => {
    if (!editingUser) return;
    setSavingUserLimit(true);
    setError('');

    try {
      const val = customLimitInput.trim() === '' ? null : parseInt(customLimitInput, 10);
      await api.put(`/api/admin/users/${editingUser.id}/storage-limit`, { limitMb: val });
      showNotificationSuccess("Storage limit updated for {name}", { name: editingUser.name });
      setEditingUser(null);
      await fetchMetricsAndNotifications();
    } catch {
      setError("Failed to update user limit");
    } finally {
      setSavingUserLimit(false);
    }
  };

  // Ban or Unban User
  const handleToggleBan = async (userToBan, isBanning) => {
    setProcessingBan(true);
    setError('');
    try {
      await api.put(`/api/admin/users/${userToBan.id}/ban`, {
        isBanned: isBanning,
        reason: isBanning ? banReasonInput.trim() : ''
      });
      showNotificationSuccess(isBanning ? "{name} has been suspended." : "Suspension lifted for {name}.", { name: userToBan.name });
      setBanningUser(null);
      setBanReasonInput('');
      await fetchMetricsAndNotifications();
    } catch {
      setError("Failed to update user ban status");
    } finally {
      setProcessingBan(false);
    }
  };

  // Send Notification or Announcement
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageTitle.trim() || !messageBody.trim()) {
      setError("Please enter both a title and message");
      return;
    }

    setSendingMessage(true);
    setError('');
    try {
      await api.post(replyTo ? `/api/admin/messages/${replyTo.id}/replies` : '/api/admin/notifications', {
        ...(replyTo ? {} : { userId: messageRecipient === 'all' ? null : messageRecipient }),
        title: messageTitle.trim(),
        message: messageBody.trim(),
        type: messageType
      });
      showNotificationSuccess("Notification sent successfully!");
      setIsComposeOpen(false);
      setMessageTitle('');
      setMessageBody('');
      setMessageRecipient('all');
      setReplyTo(null);
      await fetchMetricsAndNotifications();
    } catch {
      setError("Failed to send notification");
    } finally {
      setSendingMessage(false);
    }
  };

  // Delete Notification
  const handleDeleteNotification = async (id) => {
    try {
      await api.delete(`/api/admin/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      showNotificationSuccess("Notification recalled / deleted.");
    } catch {
      setError("Failed to delete notification");
    }
  };

  const handleDeleteMessage = async (id) => {
    try {
      await api.delete(`/api/admin/messages/${id}`);
      setInbox(prev => prev.filter(message => message.id !== id));
    } catch { setError("Failed to delete message"); }
  };

  const handleViewUserData = async (targetUser) => {
    setOptimizationMessage('');
    setViewingUserData({ user: targetUser, cloud: null });
    setUserDataLoading(true);
    try {
      const result = await api.get(`/api/admin/users/${encodeURIComponent(targetUser.id)}/data`);
      setViewingUserData(result);
    } catch {
      setError(t('Failed to load user data'));
      setViewingUserData(null);
    } finally {
      setUserDataLoading(false);
    }
  };

  const handleOptimizePhotos = async () => {
    const { user: target, cloud } = viewingUserData;
    if (!window.confirm(t('Optimize this user’s cloud photos? Original photos will be kept on the server.'))) return;
    setOptimizing(true);
    setOptimizationMessage('');
    const tasks = [];
    let unsupported = 0;
    for (const record of cloud.records) {
      recordEntries(record).forEach((entry, index) => {
        if (typeof entry?.photo === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(entry.photo)) {
          tasks.push({ kind: 'embedded', date: record.date, index, original: entry.photo, url: `/api/admin/users/${encodeURIComponent(target.id)}/records/${encodeURIComponent(record.date)}/photos/${index}`, mime: 'image/webp' });
        } else if (typeof entry?.photo === 'string' && entry.photo.startsWith('data:image/')) unsupported++;
      });
    }
    for (const file of cloud.files) {
      const ext = file.filename.split('.').pop().toLowerCase();
      const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[ext];
      if (mime) tasks.push({ kind: 'file', fileId: file.id, url: `/api/admin/users/${encodeURIComponent(target.id)}/photos/${encodeURIComponent(file.id)}`, mime });
      else unsupported++;
    }
    let saved = 0, changed = 0, failed = unsupported;
    for (const [index, task] of tasks.entries()) {
      setOptimizationMessage(t('Optimizing photos: {current} of {total}', { current: index + 1, total: tasks.length }));
      try {
        const blob = await api.getImage(task.url);
        const original = task.kind === 'embedded' ? new TextEncoder().encode(task.original) : await blob.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', original);
        const expectedHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        const result = await optimizeImage(blob, 1024, 0.75, false, { mimeType: task.mime });
        if (result.mimeType !== task.mime) { failed++; continue; }
        const response = await api.post(`/api/admin/users/${encodeURIComponent(target.id)}/optimize-photo`, { kind: task.kind, date: task.date, index: task.index, fileId: task.fileId, expectedHash, dataUrl: result.dataUrl });
        if (response.optimized) { changed++; saved += response.savedBytes; }
      } catch (err) { console.warn('Photo optimization skipped:', err); failed++; }
    }
    try { setViewingUserData(await api.get(`/api/admin/users/${encodeURIComponent(target.id)}/data`)); await fetchMetricsAndNotifications(); }
    catch { /* Report completed work even if refreshing fails. */ }
    setOptimizationMessage(t('Optimized {count} photos, saving {size}. Skipped or failed: {failed}.', { count: changed, size: formatBytes(saved), failed }));
    setOptimizing(false);
  };

  if (!isAdmin) return null;

  const summary = data?.summary || {
    totalUsers: 0,
    totalBanned: 0,
    totalRecords: 0,
    totalFiles: 0,
    totalBytes: 0,
    totalDbBytes: 0,
    totalFilesBytes: 0
  };

  const defaultLimitMb = data?.defaultLimitMb || 50;

  const filteredUsers = (data?.users || []).filter(u => 
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-24 animate-fade-in select-none">
      
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          <span>{t("Back to Settings")}</span>
        </button>

        <button
          onClick={fetchMetricsAndNotifications}
          disabled={loading}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>{t("Refresh")}</span>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-light text-white">{t("Admin Dashboard")}</h2>
            <p className="text-xs text-slate-400">{t("Moderation, Quota & Messaging")}</p>
          </div>
        </div>

        <button
          onClick={() => {
            setReplyTo(null);
            setMessageRecipient('all');
            setIsComposeOpen(true);
          }}
          className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Send size={13} />
          <span>{t("Broadcast")}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs flex items-center justify-between">
          <span>{t(error)}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <Check size={16} />
          <span>{t(successMsg.key, successMsg.values)}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 space-y-1 bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Users")}</span>
            <Users size={16} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{summary.totalUsers}</span>
            {summary.totalBanned > 0 && (
              <span className="text-[10px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">
                {summary.totalBanned} {t("Banned")}
              </span>
            )}
          </div>
        </Card>

        <Card className="p-3 space-y-1 bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Total Data")}</span>
            <HardDrive size={16} />
          </div>
          <p className="text-2xl font-bold text-white">{formatBytes(summary.totalBytes)}</p>
        </Card>
      </div>

      <Card className="space-y-3 bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300"><MessageSquare size={15} />{t("User messages")} ({inbox.length})</div>
        {inboxError && <p role="alert" className="text-xs text-red-300">{t(inboxError)}</p>}
        {!inboxError && inbox.length === 0 && <p className="text-xs text-slate-500">{t("No messages from users yet.")}</p>}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {inbox.map(message => <div key={message.id} className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2">
            <div className="flex justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-white break-words">{message.senderName || message.senderEmail}</p><p className="text-[10px] text-slate-400 break-all">{message.senderEmail} · {new Date(message.createdAt).toLocaleString()}</p></div>
              <button type="button" onClick={() => handleDeleteMessage(message.id)} title={t("Delete message")} aria-label={t("Delete message")} className="p-1 text-red-400"><Trash2 size={15} /></button></div>
            <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">{message.message}</p>
            {(message.replies || []).map(reply => <div key={reply.id} className="ml-3 rounded-lg border-l-2 border-blue-400 bg-blue-500/10 p-2 text-xs">
              <p className="font-semibold text-blue-300">{t("Reply")} · {reply.createdBy} · {new Date(reply.createdAt).toLocaleString()}</p>
              <p className="mt-1 font-medium text-slate-200 break-words">{reply.title}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">{reply.message}</p>
            </div>)}
            <button type="button" onClick={() => { setReplyTo(message); setError(''); setMessageRecipient(message.userId); setMessageType('info'); setMessageTitle(t("Reply")); setMessageBody(''); setIsComposeOpen(true); }} className="text-xs font-semibold text-blue-400 hover:text-blue-300">{t("Reply")}</button>
          </div>)}
        </div>
      </Card>

      {/* Announcements / Notifications Section */}
      <Card className="space-y-3 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300">
            <Bell size={15} />
            <span>{t("Active Announcements")} ({notifications.length})</span>
          </div>
          <button
            onClick={() => {
              setReplyTo(null);
              setMessageRecipient('all');
              setIsComposeOpen(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            {t("+ New Message")}
          </button>
        </div>

        {notifications.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">{t("No active announcements or sent messages.")}</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
            {notifications.map(n => (
              <div 
                key={n.id}
                className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      n.type === 'alert' ? 'bg-red-500/20 text-red-300' :
                      n.type === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                      n.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {t(({ info: "Info", warning: "Warning", alert: "Alert", success: "Update" })[n.type] || n.type)}
                    </span>
                    <span className="font-bold text-white">{n.title}</span>
                    <span className="text-[10px] text-slate-400">· {t("To")}: {n.recipientName}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-slate-500">
                    {t("Read by {count} users", { count: n.readCount })} • {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteNotification(n.id)}
                  className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
                  title={t("Recall / Delete Notification")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Default Storage Limit Card */}
      <Card className="space-y-3 bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
          <Settings size={15} />
          <span>{t("Default Storage Quota")}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2">
            <input
              type="number"
              min="1"
              value={defaultLimitInput}
              onChange={(e) => setDefaultLimitInput(e.target.value)}
              className="bg-transparent text-white font-semibold text-sm outline-none border-none w-full"
            />
            <span className="text-xs text-slate-400 font-bold ml-2">MB</span>
          </div>

          <button
            onClick={handleSaveDefaultLimit}
            disabled={savingDefault}
            className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold rounded-xl text-xs transition-all shadow-lg disabled:opacity-50"
          >
            {savingDefault ? t("Saving...") : t("Update Default")}
          </button>
        </div>
      </Card>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder={t("Search user by name or email...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[var(--primary)] transition-colors"
        />
      </div>

      {/* Users Table */}
      <Card className="space-y-4">
        <p className="text-xs font-bold opacity-50 uppercase tracking-widest">
          {t("Registered Users")} ({filteredUsers.length})
        </p>

        <div className="space-y-3">
          {filteredUsers.map(u => {
            const userLimitMb = u.storageLimitMb || defaultLimitMb;
            const userLimitBytes = userLimitMb * 1024 * 1024;
            const percentUsed = Math.min(100, Math.round(((u.totalBytes || 0) / userLimitBytes) * 100));
            const isSelf = u.id === user?.id;
            const isCritical = percentUsed >= 90;
            const isWarning = percentUsed >= 75 && percentUsed < 90;

            const barColor = u.is_banned 
              ? 'bg-red-500' 
              : isCritical 
              ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse'
              : isWarning 
              ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
              : 'bg-[var(--primary)]';

            const statusColor = isCritical 
              ? 'text-red-400' 
              : isWarning 
              ? 'text-amber-400' 
              : 'text-[var(--primary)]';

            return (
              <div
                key={u.id}
                className={`p-3 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                  u.is_banned 
                    ? 'bg-red-500/10 border-red-500/30' 
                    : 'bg-white/5 border-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatar_url || '/avatar-robot.png'}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/avatar-robot.png';
                      }}
                      alt={u.name || t("User")}
                      className="w-9 h-9 rounded-xl bg-white/10 object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">{u.name}</span>
                        {u.is_admin ? (
                          <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-md font-bold uppercase">
                            {t("Admin")}
                          </span>
                        ) : null}
                        {u.is_banned ? (
                          <span className="px-1.5 py-0.5 text-[9px] bg-red-500/30 text-red-200 border border-red-500/40 rounded-md font-bold uppercase">
                            {t("Suspended")}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-slate-400 block">{u.email}</span>
                      {!!u.is_banned && !!u.ban_reason && (
                        <span className="text-[10px] text-red-300/80 italic block">
                          {t("Reason")}: "{u.ban_reason}"
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-xs font-bold block ${statusColor}`}>
                      {formatBytes(u.totalBytes)} / {userLimitMb} MB
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {percentUsed}% {t("used")}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${Math.max(2, percentUsed)}%` }}
                  />
                </div>

                {/* Breakdown & Action Controls */}
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <span className="block text-[11px] leading-5 text-slate-400">DB: {formatBytes(u.dbBytes)} • {t('photos_label')}: {formatBytes(u.filesBytes)} ({u.filesCount || 0})</span>

                  <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 [&>button]:min-w-0 [&>button]:h-9 [&>button]:justify-center [&>button]:px-2 [&>button]:py-0 [&>button]:text-[11px] [&>button]:font-medium [&>button]:whitespace-nowrap [&_svg]:shrink-0">
                    <button type="button" onClick={() => handleViewUserData(u)} className="whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1.5 text-[11px] transition-colors" title={t('View saved data')}>
                      <FileText size={11} /><span>{t('View data')}</span>
                    </button>
                    {/* Send Message to this user */}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        setMessageRecipient(u.id);
                        setIsComposeOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-blue-300 hover:text-blue-200 flex items-center gap-1 transition-all"
                      title={t("Send in-app message")}
                    >
                      <MessageSquare size={11} />
                      <span>{t("Message")}</span>
                    </button>

                    {/* Storage Quota Exception */}
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setCustomLimitInput(u.isCustomLimit ? String(u.storageLimitMb) : '');
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        u.isCustomLimit 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                          : 'bg-white/5 hover:bg-white/10 text-slate-300'
                      }`}
                      title={t("Set custom storage limit")}
                    >
                      <Edit3 size={11} />
                      <span>{u.isCustomLimit ? `${u.storageLimitMb}MB` : t("Limit")}</span>
                    </button>

                    {/* Ban / Unban Button */}
                    {!isSelf && (
                      u.is_banned ? (
                        <button
                          type="button"
                          onClick={() => handleToggleBan(u, false)}
                          disabled={processingBan}
                          className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold transition-all"
                          title={t("Lift suspension")}
                        >
                          <Check size={11} />
                          <span>{t("Unban")}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBanningUser(u);
                            setBanReasonInput('');
                          }}
                          className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 flex items-center gap-1 font-semibold transition-all"
                          title={t("Suspend account")}
                        >
                          <ShieldAlert size={11} />
                          <span>{t("Ban")}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <p className="text-center text-xs text-slate-500 py-6">
              {t("No users found matching {search}", { search })}
            </p>
          )}
        </div>
      </Card>

      {/* Ban User Confirmation Modal */}
      {viewingUserData && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0d1520] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div><h3 className="text-lg font-semibold text-white">{t('Saved data')}</h3><p className="text-xs text-slate-400">{viewingUserData.user.name} · {viewingUserData.user.email}</p></div>
              <button type="button" disabled={optimizing} onClick={() => setViewingUserData(null)} className="p-2 text-slate-400 hover:text-white disabled:opacity-40" aria-label={t('Close')}><X size={18}/></button>
            </div>
            {userDataLoading ? <p className="text-sm text-slate-400">{t('Loading…')}</p> : <>
              <CloudBackupSummary usage={viewingUserData.storageUsage} />
              <div className="space-y-2"><button type="button" disabled={optimizing} onClick={handleOptimizePhotos} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{optimizing ? t('Optimizing photos…') : t('Optimize cloud photos')}</button>{optimizationMessage && <p role="status" className="text-xs text-slate-300">{optimizationMessage}</p>}</div>
              {(() => {
                const { records, files } = viewingUserData.cloud;
                const photos = records.flatMap(record => recordPhotos(record, files, viewingUserData.user.id));
                const total = photos.reduce((sum, photo) => sum + Number(photo.size || 0), 0);
                const dayBytes = records.reduce((sum, record) => sum + recordSize(record, recordPhotos(record, files, viewingUserData.user.id)), 0);
                return <section className="rounded-2xl border border-white/10 bg-[#111d30] p-4 space-y-2 text-xs text-slate-300"><h4 className="text-sm font-semibold text-blue-300">{t('Attached photo storage')}</h4><p>{t('Photos: {count} · Total: {size}', { count: photos.length, size: formatBytes(total) })}</p><p>{t('Average per photo: {size}', { size: photos.length ? formatBytes(total / photos.length) : '—' })}</p><p>{t('Average per saved day: {size}', { size: records.length ? formatBytes(dayBytes / records.length) : '—' })}</p><p>{t('Average photo storage per saved day: {size}', { size: records.length ? formatBytes(total / records.length) : '—' })}</p><p className="text-slate-500">{t('Day size includes saved records and attached photos; averages include days without photos.')}</p></section>;
              })()}
              <section className="rounded-2xl border border-white/10 bg-[#111d30] p-4 space-y-3"><h4 className="text-sm font-semibold text-purple-300">{t('Saved semesters')} ({viewingUserData.cloud.semesters.length})</h4>
                {viewingUserData.cloud.semesters.map(item => {
                  const records = viewingUserData.cloud.records.filter(record => record.date >= item.startDate && record.date <= item.endDate);
                  const photos = records.reduce((sum, record) => sum + recordPhotos(record, viewingUserData.cloud.files, viewingUserData.user.id).length, 0);
                  return <details key={item.id} className="rounded-xl bg-white/5 p-3 text-sm text-slate-200"><summary className="cursor-pointer"><strong>{item.name || t('Schedule')}</strong><span className="block mt-1 text-xs text-slate-400">{item.startDate} – {item.endDate}</span><span className="block mt-2 text-xs text-blue-300">{t('Saved days: {count}', { count: records.length })} · {t('Saved photos: {count}', { count: photos })}</span></summary><div className="mt-3 border-t border-white/10"><SavedDays records={records} files={viewingUserData.cloud.files} userId={viewingUserData.user.id} t={t} /></div></details>;
                })}
                {!viewingUserData.cloud.semesters.length && <p className="text-xs text-slate-400">{t('No saved schedules')}</p>}
                {viewingUserData.cloud.records.some(record => !viewingUserData.cloud.semesters.some(item => record.date >= item.startDate && record.date <= item.endDate)) && <details className="rounded-xl bg-white/5 p-3 text-sm text-slate-200"><summary className="cursor-pointer font-medium">{t('Days outside semesters')}</summary><SavedDays records={viewingUserData.cloud.records.filter(record => !viewingUserData.cloud.semesters.some(item => record.date >= item.startDate && record.date <= item.endDate))} files={viewingUserData.cloud.files} userId={viewingUserData.user.id} t={t} /></details>}
                <p className="text-[11px] text-slate-400">{t('Photo counts include photos attached to saved punches. Overlapping semesters can include the same day.')}</p>
              </section>
            </>}
          </div>
        </div>, document.body
      )}

      {/* Ban User Confirmation Modal */}
      {banningUser && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0d1520] border border-red-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-red-400">
              <div className="flex items-center gap-2">
                <ShieldAlert size={20} />
                <h3 className="text-base font-bold text-white">{t("Suspend Account")}</h3>
              </div>
              <button
                onClick={() => setBanningUser(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t("Are you sure you want to suspend {name} ({email})? They will not be able to sync or upload photos until reinstated.", { name: banningUser.name, email: banningUser.email })}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {t("Reason for suspension (optional)")}
              </label>
              <textarea
                rows={2}
                placeholder={t("e.g. Storage quota abuse, policy violation...")}
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-red-400 resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setBanningUser(null)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-xs text-slate-300 rounded-xl transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => handleToggleBan(banningUser, true)}
                disabled={processingBan}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all"
              >
                {processingBan ? t("Suspending...") : t("Confirm Ban")}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Message / Announcement Composer Modal */}
      {isComposeOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm">
          <form 
            onSubmit={handleSendMessage}
            className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0d1520] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-blue-400" />
                <h3 className="text-base font-bold">
                  {replyTo ? t("Reply to User") : messageRecipient === 'all' ? t("Broadcast Announcement") : t("Send Direct Message")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsComposeOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {error && <p role="alert" className="text-xs text-red-300">{t(error)}</p>}
            {replyTo && <p className="rounded-xl bg-white/5 p-3 text-xs text-slate-300 whitespace-pre-wrap break-words">{replyTo.message}</p>}
            <div className="space-y-3 text-xs">
              {/* Recipient Selector */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {t("Recipient")}
                </label>
                <select
                  value={messageRecipient}
                  disabled={!!replyTo}
                  onChange={(e) => setMessageRecipient(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-400"
                >
                  <option value="all">📢 {t("All Users (Broadcast Announcement)")}</option>
                  {(data?.users || []).map(u => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Alert Type */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {t("Notification Type")}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { type: 'info', label: t("Info") },
                    { type: 'warning', label: t("Warning") },
                    { type: 'alert', label: t("Alert") },
                    { type: 'success', label: t("Update") }
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setMessageType(item.type)}
                      className={`py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                        messageType === item.type
                          ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {t("Title")}
                </label>
                <input
                  type="text"
                  placeholder={t("e.g. Scheduled Maintenance, Storage Notice...")}
                  value={messageTitle}
                  onChange={(e) => setMessageTitle(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {t("Message Body")}
                </label>
                <textarea
                  rows={4}
                  placeholder={t("Type the message that will be displayed in the user's app...")}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-blue-400 resize-none leading-relaxed"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsComposeOpen(false)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-xs text-slate-300 rounded-xl transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                disabled={sendingMessage}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Send size={13} />
                <span>{sendingMessage ? t("Sending...") : t("Send Message")}</span>
              </button>
            </div>
          </form>
        </div>, document.body
      )}

      {/* Edit User Limit Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0d1520] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {t("Storage Limit for {name}", { name: editingUser.name })}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {t("Set a custom limit for this user in MB. Leave blank to inherit the system default ({value} MB).", { value: defaultLimitMb })}
            </p>

            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2.5">
              <input
                type="number"
                min="1"
                placeholder={t("Default ({value} MB)", { value: defaultLimitMb })}
                value={customLimitInput}
                onChange={(e) => setCustomLimitInput(e.target.value)}
                className="bg-transparent text-white font-semibold text-sm outline-none border-none w-full"
              />
              <span className="text-xs text-slate-400 font-bold ml-1">MB</span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setCustomLimitInput('')}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-xs text-slate-300 rounded-xl transition-colors"
              >
                {t("Use Default")}
              </button>

              <button
                onClick={handleSaveUserLimit}
                disabled={savingUserLimit}
                className="flex-1 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold rounded-xl transition-all"
              >
                {savingUserLimit ? t("Saving...") : t("Save Limit")}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

    </div>
  );
};
