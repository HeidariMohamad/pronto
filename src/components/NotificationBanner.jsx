import { useTranslation } from '../hooks/useTranslation';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Info, AlertTriangle, AlertCircle, CheckCircle, X, ShieldAlert, HardDrive } from 'lucide-react';

export function NotificationBanner() {
  const { t } = useTranslation();
  const { user, storageUsage } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [dismissedQuotaAlert, setDismissedQuotaAlert] = useState(false);

  useEffect(() => {
    if (!user?.id || !localStorage.getItem('pronto_token')) return;
    let active = true;
    const fetchNotifications = async () => {
      try {
        const res = await api.get('/api/notifications');
        if (active && res?.notifications) setNotifications(res.notifications.filter(n => !n.isRead));
      } catch {
        // Offline or unauthenticated; retry on the next poll.
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 120000);
    return () => { active = false; clearInterval(interval); };
  }, [user?.id]);

  const handleDismiss = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await api.post(`/api/notifications/${id}/dismiss`);
    } catch (err) {
      console.warn('Failed to dismiss notification:', err);
    }
  };

  const isStorageFull = storageUsage?.storageLimitBytes > 0 && storageUsage.totalBytes >= storageUsage.storageLimitBytes;

  const getTypeStyle = (type) => {
    switch (type) {
      case 'warning':
        return {
          bg: 'bg-amber-500/15 border-amber-500/30 text-amber-200',
          icon: <AlertTriangle size={17} className="text-amber-400 shrink-0" />
        };
      case 'alert':
        return {
          bg: 'bg-red-500/15 border-red-500/30 text-red-200',
          icon: <AlertCircle size={17} className="text-red-400 shrink-0" />
        };
      case 'success':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
          icon: <CheckCircle size={17} className="text-emerald-400 shrink-0" />
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-500/15 border-blue-500/30 text-blue-200',
          icon: <Info size={17} className="text-blue-400 shrink-0" />
        };
    }
  };

  if (!user?.isBanned && !isStorageFull && notifications.length === 0) return null;

  return (
    <div className="w-full space-y-2 select-none">
      {/* Storage Quota Full Alert */}
      {isStorageFull && !dismissedQuotaAlert && (
        <div className="w-full rounded-2xl p-3 bg-red-600/20 border border-red-500/40 text-red-200 shadow-xl backdrop-blur-md flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5 flex-1">
            <HardDrive size={18} className="text-rose-400 shrink-0 mt-0.5 animate-pulse" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-red-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <span>{t("Cloud Storage Full")}</span>
                <span className="text-[10px] bg-red-500/30 px-1 rounded font-mono">
                  {Math.round(storageUsage.totalBytes / (1024 * 1024))} MB / {storageUsage.storageLimitMb} MB
                </span>
              </p>
              <p className="opacity-90 leading-relaxed text-[11px]">
                {t("You have reached your cloud storage quota. Syncing and photo uploads are paused.")}
              </p>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="mt-1 text-[11px] font-bold text-white underline hover:text-red-200 block"
              >
                {t("Manage Cloud Storage")} →
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDismissedQuotaAlert(true)}
            className="p-1 text-slate-300 hover:text-white shrink-0"
            title={t("Dismiss alert")}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Account Suspended / Banned Notice */}
      {user?.isBanned && (
        <div className="w-full rounded-2xl p-3.5 bg-red-500/20 border border-red-500/40 text-red-200 shadow-xl backdrop-blur-md flex items-start gap-3 animate-in fade-in">
          <ShieldAlert size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <p className="font-bold text-red-100 uppercase tracking-wider text-[11px]">
              {t("Account Suspended")}
            </p>
            <p className="leading-relaxed opacity-90">
              {user.banReason ? `${t("Reason")}: "${user.banReason}".` : t("Your account has been suspended by an administrator.")}
            </p>
            <p className="text-[10px] text-red-300/80">
              {t("Cloud synchronization and uploads are currently disabled for this account.")}
            </p>
          </div>
        </div>
      )}

      {/* Admin Broadcasts & Notifications */}
      {notifications.map(notif => {
        const { bg, icon } = getTypeStyle(notif.type);
        return (
          <div 
            key={notif.id}
            className={`w-full rounded-2xl p-3 border shadow-lg backdrop-blur-md flex items-start justify-between gap-3 animate-in fade-in duration-200 ${bg}`}
          >
            <div className="flex items-start gap-2.5 flex-1">
              <div className="mt-0.5">{icon}</div>
              <div className="space-y-0.5 text-xs">
                <p className="font-bold tracking-tight text-white">{notif.title}</p>
                <p className="opacity-90 leading-relaxed text-[11px] whitespace-pre-line">{notif.message}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDismiss(notif.id)}
              className="p-1 rounded-lg hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white transition-all shrink-0"
              title={t("Dismiss notification")}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

