import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { db } from '../services/db';
import { Fingerprint, ShieldCheck, AlertCircle } from 'lucide-react';

export const LoginModal = () => {
  const { loginWithGoogle } = useAuth();
  const { t, lang } = useTranslation();
  const [error, setError] = useState('');

  // Initialize Google Identity Services if client ID is set
  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const renderGoogleButton = () => {
    if (window.google?.accounts?.id && googleClientId) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          try {
            setError('');
            await loginWithGoogle(response.credential);
          } catch (err) {
            console.error('Google sign-in failed:', err);
            setError('Failed to sign in with Google');
          }
        }
      });

      const btnContainer = document.getElementById('google-signin-btn');
      if (btnContainer) {
        btnContainer.replaceChildren();
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280,
          locale: lang === 'pt' ? 'pt_BR' : lang
        });
      }
    }
    };
    renderGoogleButton();
    const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    script?.addEventListener('load', renderGoogleButton);
    return () => script?.removeEventListener('load', renderGoogleButton);
  }, [loginWithGoogle, lang]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-[#0d1520] border border-white/10 rounded-3xl p-6 shadow-2xl text-center space-y-6">
        <fieldset className="space-y-2 text-left">
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('lang_title')}</legend>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('lang_title')}>
            {[[ 'pt', 'Português' ], [ 'en', 'English' ], [ 'fa', 'فارسی' ]].map(([code, label]) => (
              <button key={code} type="button" lang={code} aria-pressed={lang === code}
                onClick={async () => { await db.settings.update('v8', { language: code }); sessionStorage.setItem('pronto_login_language', code); }}
                className={`rounded-xl border px-2 py-2 text-sm transition-colors ${lang === code ? 'bg-[var(--primary)] border-transparent text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        
        {/* App Icon */}
        <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/20 border border-[var(--primary)]/30 mx-auto flex items-center justify-center text-[var(--primary)] shadow-lg shadow-[var(--primary)]/10">
          <Fingerprint size={36} />
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {t('login_welcome') || 'Welcome to Pronto'}
          </h2>
          <p className="text-sm text-slate-300/80 leading-relaxed">
            {t('login_subtitle') || 'Sign in to sync your shift hours to the cloud and keep your data safe across devices.'}
          </p>
        </div>

        {/* Existing Data Assurance */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-3 text-left">
          <ShieldCheck className="text-emerald-400 shrink-0" size={20} />
          <p className="text-xs text-emerald-200">
            {t('login_data_safe') || 'Previous records on this device will be automatically linked to your account.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-xs text-red-300 text-left">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{t(error)}</span>
          </div>
        )}

        {/* Google Sign-In Container */}
        <div className="space-y-3 pt-2">
          <div id="google-signin-btn" className="flex justify-center min-h-[44px]"></div>
        </div>

        <p className="text-[11px] text-slate-500">
          {t('Private & Secure · Self-hosted data storage')}
        </p>
      </div>
    </div>
  );
};

