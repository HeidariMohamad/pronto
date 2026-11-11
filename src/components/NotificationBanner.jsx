import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Info, AlertTriangle, AlertCircle, CheckCircle, X, ShieldAlert } from 'lucide-react';

export function NotificationBanner() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!user || !localStorage.getItem('pronto_token')) return;
    try {
      setLoading(true);
      const res = await api.get('/api/notifications');
      if (res?.notifications) {
        // Show unread ones first
        setNotifications(res.notifications.filter(n => !n.isRead));
      }
    } catch (err) {
      // Silently ignore if offline or unauthenticated
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Periodically check for new announcements every 2 minutes
    const interval = setInterval(fetchNotifications, 120000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleDismiss = async (id) => {
    // Optimistic UI update
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await api.post(`/api/notifications/${id}/dismiss`);
    } catch (err) {
      console.warn('Failed to dismiss notification:', err);
    }
  };

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

  return (
    <div className="w-full space-y-2 mb-4">
      {/* Account Suspended / Banned Notice */}
      {user?.isBanned && (
        <div className="w-full rounded-2xl p-3.5 bg-red-500/20 border border-red-500/40 text-red-200 shadow-xl backdrop-blur-md flex items-start gap-3 animate-in fade-in">
          <ShieldAlert size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <p className="font-bold text-red-100 uppercase tracking-wider text-[11px]">
              Account Suspended
            </p>
            <p className="leading-relaxed opacity-90">
              {user.banReason ? `Reason: "${user.banReason}".` : 'Your account has been suspended by an administrator.'}
            </p>
            <p className="text-[10px] text-red-300/80">
              Cloud synchronization and uploads are currently disabled for this account.
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
              title="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
