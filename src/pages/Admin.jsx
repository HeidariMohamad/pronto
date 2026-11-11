import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Card } from '../components/UI';
import { 
  Users, 
  HardDrive, 
  FileText, 
  Image as ImageIcon, 
  ArrowLeft, 
  RefreshCw, 
  ShieldCheck, 
  Search,
  Settings,
  Check,
  Edit3,
  X
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
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  // Default limit state
  const [defaultLimitInput, setDefaultLimitInput] = useState('50');
  const [savingDefault, setSavingDefault] = useState(false);

  // User limit exception modal/state
  const [editingUser, setEditingUser] = useState(null);
  const [customLimitInput, setCustomLimitInput] = useState('');
  const [savingUserLimit, setSavingUserLimit] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/admin/metrics');
      setData(res);
      if (res.defaultLimitMb) {
        setDefaultLimitInput(String(res.defaultLimitMb));
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
    fetchMetrics();
  }, [isAdmin, navigate]);

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
      setSuccessMsg(`Default storage limit updated to ${val} MB`);
      setTimeout(() => setSuccessMsg(''), 3000);
      await fetchMetrics();
    } catch (err) {
      setError(err.message || 'Failed to update default limit');
    } finally {
      setSavingDefault(false);
    }
  };

  const handleSaveUserLimit = async () => {
    if (!editingUser) return;
    setSavingUserLimit(true);
    setError('');

    try {
      const val = customLimitInput.trim() === '' ? null : parseInt(customLimitInput, 10);
      await api.put(`/api/admin/users/${editingUser.id}/storage-limit`, { limitMb: val });
      setSuccessMsg(`Storage limit updated for ${editingUser.name}`);
      setTimeout(() => setSuccessMsg(''), 3000);
      setEditingUser(null);
      await fetchMetrics();
    } catch (err) {
      setError(err.message || 'Failed to update user limit');
    } finally {
      setSavingUserLimit(false);
    }
  };

  if (!isAdmin) return null;

  const summary = data?.summary || {
    totalUsers: 0,
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
    <div className="space-y-6 pb-24 animate-fade-in">
      
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Settings
        </button>

        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-light">Admin Dashboard</h2>
          <p className="text-xs text-slate-400">Server Storage & Quota Management</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <Check size={16} />
          {successMsg}
        </div>
      )}

      {/* Default Storage Limit Card */}
      <Card className="space-y-3 bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
          <Settings size={15} />
          Default Storage Quota
        </div>
        <p className="text-xs text-slate-300/80">
          All registered users receive this amount by default, unless granted a custom exception below.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2 flex-1">
            <input
              type="number"
              min="1"
              value={defaultLimitInput}
              onChange={(e) => setDefaultLimitInput(e.target.value)}
              className="bg-transparent text-white font-semibold text-sm outline-none border-none w-full"
            />
            <span className="text-xs text-slate-400 font-bold ml-1">MB</span>
          </div>

          <button
            onClick={handleSaveDefaultLimit}
            disabled={savingDefault}
            className="px-4 py-2.5 bg-[var(--primary)] hover:opacity-90 active:scale-[0.99] text-white text-xs font-semibold rounded-xl transition-all"
          >
            {savingDefault ? 'Saving...' : 'Save Default'}
          </button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <Users size={14} className="text-blue-400" /> Users
          </div>
          <p className="text-2xl font-semibold">{summary.totalUsers}</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <HardDrive size={14} className="text-purple-400" /> Total Storage
          </div>
          <p className="text-2xl font-semibold text-purple-400">{formatBytes(summary.totalBytes)}</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <FileText size={14} className="text-emerald-400" /> Total Records
          </div>
          <p className="text-2xl font-semibold">{summary.totalRecords}</p>
          <p className="text-[10px] text-slate-500">DB: {formatBytes(summary.totalDbBytes)}</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <ImageIcon size={14} className="text-amber-400" /> Total Photos
          </div>
          <p className="text-2xl font-semibold">{summary.totalFiles}</p>
          <p className="text-[10px] text-slate-500">Photos: {formatBytes(summary.totalFilesBytes)}</p>
        </Card>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[var(--primary)] text-white"
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

            return (
              <div
                key={u.id}
                className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                      alt={u.name}
                      className="w-9 h-9 rounded-xl bg-white/10 object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{u.name}</span>
                        {u.is_admin ? (
                          <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-md font-bold uppercase">
                            Admin
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-slate-400">{u.email}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-[var(--primary)] block">
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
                    className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(2, percentUsed)}%` }}
                  />
                </div>

                {/* Breakdown & Quota Control */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-slate-400">
                  <span>DB: {formatBytes(u.dbBytes)} • Photos: {formatBytes(u.filesBytes)} ({u.filesCount || 0})</span>

                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setCustomLimitInput(u.isCustomLimit ? String(u.storageLimitMb) : '');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                      u.isCustomLimit 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <Edit3 size={11} />
                    {u.isCustomLimit ? `${u.storageLimitMb} MB (Custom)` : `${defaultLimitMb} MB (Default)`}
                  </button>
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
