import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';
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

export const AdminPage = () => {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

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
  const [messageRecipient, setMessageRecipient] = useState('all'); // 'all' or userId
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info' | 'warning' | 'alert' | 'success'
  const [sendingMessage, setSendingMessage] = useState(false);

  const fetchMetricsAndNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const [resMetrics, resNotifs] = await Promise.all([
        api.get('/api/admin/metrics'),
        api.get('/api/admin/notifications').catch(() => ({ notifications: [] }))
      ]);

      setData(resMetrics);
      setNotifications(resNotifs?.notifications || []);
      if (resMetrics.defaultLimitMb) {
        setDefaultLimitInput(String(resMetrics.defaultLimitMb));
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch admin metrics');
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

  const showNotificationSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Save Default Storage Limit
  const handleSaveDefaultLimit = async () => {
    const val = parseInt(defaultLimitInput, 10);
    if (!val || val < 1) {
      setError('Please enter a valid positive number for storage limit');
      return;
    }

    setSavingDefault(true);
    setError('');
    try {
      await api.put('/api/admin/config/storage-limit', { limitMb: val });
      showNotificationSuccess(`Default storage limit updated to ${val} MB`);
      await fetchMetricsAndNotifications();
    } catch (err) {
      setError(err.message || 'Failed to update default limit');
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
      showNotificationSuccess(`Storage limit updated for ${editingUser.name}`);
      setEditingUser(null);
      await fetchMetricsAndNotifications();
    } catch (err) {
      setError(err.message || 'Failed to update user limit');
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
      showNotificationSuccess(isBanning ? `${userToBan.name} has been suspended.` : `Suspension lifted for ${userToBan.name}.`);
      setBanningUser(null);
      setBanReasonInput('');
      await fetchMetricsAndNotifications();
    } catch (err) {
      setError(err.message || 'Failed to update user ban status');
    } finally {
      setProcessingBan(false);
    }
  };

  // Send Notification or Announcement
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageTitle.trim() || !messageBody.trim()) {
      setError('Please enter both a title and message');
      return;
    }

    setSendingMessage(true);
    setError('');
    try {
      await api.post('/api/admin/notifications', {
        userId: messageRecipient === 'all' ? null : messageRecipient,
        title: messageTitle.trim(),
        message: messageBody.trim(),
        type: messageType
      });
      showNotificationSuccess('Notification sent successfully!');
      setIsComposeOpen(false);
      setMessageTitle('');
      setMessageBody('');
      setMessageRecipient('all');
      await fetchMetricsAndNotifications();
    } catch (err) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSendingMessage(false);
    }
  };

  // Delete Notification
  const handleDeleteNotification = async (id) => {
    try {
      await api.delete(`/api/admin/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      showNotificationSuccess('Notification recalled / deleted.');
    } catch (err) {
      setError(err.message || 'Failed to delete notification');
    }
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
          <span>Back to Settings</span>
        </button>

        <button
          onClick={fetchMetricsAndNotifications}
          disabled={loading}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-light text-white">Admin Dashboard</h2>
            <p className="text-xs text-slate-400">Moderation, Quota & Messaging</p>
          </div>
        </div>

        <button
          onClick={() => {
            setMessageRecipient('all');
            setIsComposeOpen(true);
          }}
          className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Send size={13} />
          <span>Broadcast</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 space-y-1 bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Users</span>
            <Users size={16} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{summary.totalUsers}</span>
            {summary.totalBanned > 0 && (
              <span className="text-[10px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">
                {summary.totalBanned} Banned
              </span>
            )}
          </div>
        </Card>

        <Card className="p-3 space-y-1 bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Data</span>
            <HardDrive size={16} />
          </div>
          <p className="text-2xl font-bold text-white">{formatBytes(summary.totalBytes)}</p>
        </Card>
      </div>

      {/* Announcements / Notifications Section */}
      <Card className="space-y-3 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300">
            <Bell size={15} />
            <span>Active Announcements ({notifications.length})</span>
          </div>
          <button
            onClick={() => {
              setMessageRecipient('all');
              setIsComposeOpen(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            + New Message
          </button>
        </div>

        {notifications.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">No active announcements or sent messages.</p>
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
                      {n.type}
                    </span>
                    <span className="font-bold text-white">{n.title}</span>
                    <span className="text-[10px] text-slate-400">· To: {n.recipientName}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-slate-500">
                    Read by {n.readCount} users • {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteNotification(n.id)}
                  className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
                  title="Recall / Delete Notification"
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
          <span>Default Storage Quota</span>
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
            {savingDefault ? 'Saving...' : 'Update Default'}
          </button>
        </div>
      </Card>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search user by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[var(--primary)] transition-colors"
        />
      </div>

      {/* Users Table */}
      <Card className="space-y-4">
        <p className="text-xs font-bold opacity-50 uppercase tracking-widest">
          Registered Users ({filteredUsers.length})
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
                      alt={u.name || 'User'}
                      className="w-9 h-9 rounded-xl bg-white/10 object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">{u.name}</span>
                        {u.is_admin ? (
                          <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-md font-bold uppercase">
                            Admin
                          </span>
                        ) : null}
                        {u.is_banned ? (
                          <span className="px-1.5 py-0.5 text-[9px] bg-red-500/30 text-red-200 border border-red-500/40 rounded-md font-bold uppercase">
                            Suspended
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-slate-400 block">{u.email}</span>
                      {u.is_banned && u.ban_reason && (
                        <span className="text-[10px] text-red-300/80 italic block">
                          Reason: "{u.ban_reason}"
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-xs font-bold block ${statusColor}`}>
                      {formatBytes(u.totalBytes)} / {userLimitMb} MB
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {percentUsed}% used
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
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-slate-400">
                  <span>DB: {formatBytes(u.dbBytes)} • {t('photos_label')}: {formatBytes(u.filesBytes)} ({u.filesCount || 0})</span>

                  <div className="flex items-center gap-1.5">
                    {/* Send Message to this user */}
                    <button
                      type="button"
                      onClick={() => {
                        setMessageRecipient(u.id);
                        setIsComposeOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-blue-300 hover:text-blue-200 flex items-center gap-1 transition-all"
                      title="Send in-app message"
                    >
                      <MessageSquare size={11} />
                      <span>Message</span>
                    </button>

                    {/* Storage Quota Exception */}
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setCustomLimitInput(u.isCustomLimit ? String(u.storageLimitMb) : '');
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                        u.isCustomLimit 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                          : 'bg-white/5 hover:bg-white/10 text-slate-300'
                      }`}
                      title="Set custom storage limit"
                    >
                      <Edit3 size={11} />
                      <span>{u.isCustomLimit ? `${u.storageLimitMb}MB` : 'Limit'}</span>
                    </button>

                    {/* Ban / Unban Button */}
                    {!isSelf && (
                      u.is_banned ? (
                        <button
                          type="button"
                          onClick={() => handleToggleBan(u, false)}
                          disabled={processingBan}
                          className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold transition-all"
                          title="Lift suspension"
                        >
                          <Check size={11} />
                          <span>Unban</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBanningUser(u);
                            setBanReasonInput('');
                          }}
                          className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 flex items-center gap-1 font-semibold transition-all"
                          title="Suspend account"
                        >
                          <ShieldAlert size={11} />
                          <span>Ban</span>
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
              No users found matching "{search}"
            </p>
          )}
        </div>
      </Card>

      {/* Ban User Confirmation Modal */}
      {banningUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#0d1520] border border-red-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-red-400">
              <div className="flex items-center gap-2">
                <ShieldAlert size={20} />
                <h3 className="text-base font-bold text-white">Suspend Account</h3>
              </div>
              <button
                onClick={() => setBanningUser(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to suspend <strong className="text-white">{banningUser.name}</strong> ({banningUser.email})? 
              They will not be able to sync or upload photos until reinstated.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Reason for suspension (optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Storage quota abuse, policy violation..."
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
                Cancel
              </button>
              <button
                onClick={() => handleToggleBan(banningUser, true)}
                disabled={processingBan}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all"
              >
                {processingBan ? 'Suspending...' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message / Announcement Composer Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <form 
            onSubmit={handleSendMessage}
            className="w-full max-w-md bg-[#0d1520] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-blue-400" />
                <h3 className="text-base font-bold">
                  {messageRecipient === 'all' ? 'Broadcast Announcement' : 'Send Direct Message'}
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

            <div className="space-y-3 text-xs">
              {/* Recipient Selector */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Recipient
                </label>
                <select
                  value={messageRecipient}
                  onChange={(e) => setMessageRecipient(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-400"
                >
                  <option value="all">📢 All Users (Broadcast Announcement)</option>
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
                  Notification Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { type: 'info', label: 'Info' },
                    { type: 'warning', label: 'Warning' },
                    { type: 'alert', label: 'Alert' },
                    { type: 'success', label: 'Update' }
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
                  Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled Maintenance, Storage Notice..."
                  value={messageTitle}
                  onChange={(e) => setMessageTitle(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Message Body
                </label>
                <textarea
                  rows={4}
                  placeholder="Type the message that will be displayed in the user's app..."
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingMessage}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Send size={13} />
                <span>{sendingMessage ? 'Sending...' : 'Send Message'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit User Limit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-[#0d1520] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Storage Limit for {editingUser.name}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Set a custom limit for this user in MB. Leave blank to inherit the system default ({defaultLimitMb} MB).
            </p>

            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2.5">
              <input
                type="number"
                min="1"
                placeholder={`Default (${defaultLimitMb} MB)`}
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
                Use Default
              </button>

              <button
                onClick={handleSaveUserLimit}
                disabled={savingUserLimit}
                className="flex-1 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold rounded-xl transition-all"
              >
                {savingUserLimit ? 'Saving...' : 'Save Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
