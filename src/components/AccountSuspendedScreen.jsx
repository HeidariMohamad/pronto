import React, { useState, useEffect } from 'react';
import { ShieldAlert, LogOut, RefreshCw, AlertOctagon } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

export const AccountSuspendedScreen = ({ user, onLogout, onCheckStatus }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState('');

  const banReason = user?.banReason || user?.ban_reason;

  const handleManualCheck = async () => {
    if (checking) return;
    setChecking(true);
    setFeedback('');
    try {
      const refreshed = await onCheckStatus?.();
      if (refreshed && !refreshed.isBanned) {
        setFeedback(t('account_unbanned_welcome'));
      } else {
        setFeedback(t('still_suspended'));
      }
    } catch {
      setFeedback(t('still_suspended'));
    } finally {
      setChecking(false);
    }
  };

  // Automatically check every 8 seconds in case admin unbans the account
  useEffect(() => {
    const timer = setInterval(() => {
      onCheckStatus?.().catch(() => {});
    }, 8000);

    const handleFocus = () => {
      onCheckStatus?.().catch(() => {});
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onCheckStatus]);

  return (
    <div className="fixed inset-0 z-[99999] bg-[#070b14] flex flex-col justify-between overflow-y-auto px-5 py-8 select-none">
      {/* Ambient Crimson Glow */}
      <div 
        className="absolute -top-16 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-red-600/15 blur-3xl pointer-events-none"
        aria-hidden="true" 
      />

      <div className="relative max-w-[420px] w-full mx-auto flex-1 flex flex-col justify-center items-center text-center space-y-6">
        {/* Pulsing Shield Badge */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-red-500/20 animate-ping opacity-60 pointer-events-none" />
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-red-500/20 to-red-950/40 border border-red-500/40 flex items-center justify-center shadow-xl shadow-red-950/50 backdrop-blur-md">
            <ShieldAlert size={42} className="text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
          </div>
        </div>

        {/* User Card */}
        <div className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center gap-3.5 backdrop-blur-md">
          {user?.avatar_url ? (
            <img 
              src={user.avatar_url} 
              referrerPolicy="no-referrer" 
              alt={user.name || 'User'} 
              className="w-12 h-12 rounded-xl object-cover border border-red-500/40 shrink-0" 
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-red-900/40 border border-red-500/30 flex items-center justify-center text-red-200 font-bold text-lg shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <div className="text-left flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{user?.name || 'User'}</h3>
              <span className="px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase rounded bg-red-500/20 text-red-400 border border-red-500/40 shrink-0">
                {t('account_suspended_badge')}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {t('account_suspended')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {t('account_suspended_desc')}
          </p>
        </div>

        {/* Reason Callout Box */}
        <div className="w-full text-left bg-gradient-to-b from-red-950/30 to-red-900/10 border border-red-500/30 rounded-2xl p-4 space-y-1.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-red-400 text-xs font-semibold uppercase tracking-wider">
            <AlertOctagon size={14} className="shrink-0" />
            <span>{t('suspension_reason_label')}</span>
          </div>
          <p className="text-sm text-red-100/90 font-medium italic break-words pl-5 border-l-2 border-red-500/40 my-2">
            {banReason ? `"${banReason}"` : t('no_suspension_reason')}
          </p>
          <p className="text-[11px] text-slate-400 leading-normal pt-1">
            {t('suspension_contact_note')}
          </p>
        </div>

        {/* Feedback message when checking */}
        {feedback && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 w-full animate-fade-in">
            {feedback}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="relative max-w-[420px] w-full mx-auto space-y-2.5 pt-4">
        <button
          type="button"
          onClick={handleManualCheck}
          disabled={checking}
          className="w-full py-3 px-4 rounded-xl font-medium text-sm text-slate-200 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={15} className={checking ? 'animate-spin text-red-400' : 'text-slate-400'} />
          <span>{checking ? t('checking_status') : t('check_status')}</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3 px-4 rounded-xl font-medium text-sm text-red-300 bg-red-500/10 hover:bg-red-500/20 active:scale-95 border border-red-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut size={15} className="text-red-400" />
          <span>{t('sign_out_switch')}</span>
        </button>
      </div>
    </div>
  );
};
