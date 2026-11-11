import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { Fingerprint, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';

export const LoginModal = () => {
  const { loginWithGoogle, loginWithDevMock } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize Google Identity Services if client ID is set
  useEffect(() => {
    /* global google */
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (window.google?.accounts?.id && googleClientId) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          try {
            setLoading(true);
            setError('');
            await loginWithGoogle(response.credential);
          } catch (err) {
            setError(err.message || 'Failed to sign in with Google');
          } finally {
            setLoading(false);
          }
        }
      });

      const btnContainer = document.getElementById('google-signin-btn');
      if (btnContainer) {
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280
        });
      }
    }
  }, [loginWithGoogle]);

  const handleDevLogin = async (asAdmin = false) => {
    try {
      setLoading(true);
      setError('');
      await loginWithDevMock({
        sub: asAdmin ? 'admin_test_1' : 'user_test_1',
        email: asAdmin ? 'admin@pronto.local' : 'developer@pronto.local',
        name: asAdmin ? 'Admin User' : 'Alex Developer',
        picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${asAdmin ? 'admin' : 'alex'}`
      });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-[#0d1520] border border-white/10 rounded-3xl p-6 shadow-2xl text-center space-y-6">
        
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
            <span>{error}</span>
          </div>
        )}

        {/* Google Sign-In Container */}
        <div className="space-y-3 pt-2">
          <div id="google-signin-btn" className="flex justify-center min-h-[44px]"></div>

          {/* Quick Sign-In Options (Dev & Test) */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <button
              onClick={() => handleDevLogin(false)}
              disabled={loading}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/15 active:scale-[0.99] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
            >
              <Sparkles size={16} className="text-amber-400" />
              {loading ? 'Signing in...' : 'Continue with Google / Quick Sign-in'}
            </button>

            <button
              onClick={() => handleDevLogin(true)}
              disabled={loading}
              className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Sign in as Admin (Demo)
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Private & Secure • Self-hosted data storage
        </p>
      </div>
    </div>
  );
};

