import React from 'react';
import { NavLink } from 'react-router-dom';
import { Fingerprint, Sliders } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

export const Layout = ({ children }) => {
    const { t } = useTranslation();

    return (
        <div className="min-h-[100dvh] flex flex-col bg-[var(--surface)] text-[var(--on-container)] transition-colors duration-200">

            {/* Safe Area Top */}
            <div className="safe-top fixed top-0 left-0 right-0 z-50 bg-[#0d1520]/85 backdrop-blur-xl rounded-b-3xl border-b border-white/5 shadow-lg transition-all duration-300">
                <div className="px-6 py-4 flex justify-between items-center max-w-lg mx-auto">
                    <div className="flex items-center gap-3">
                        <Fingerprint className="w-6 h-6 text-[var(--primary)]" />
                        <h1 className="text-xl font-normal tracking-tight">{t('app_name')}</h1>
                    </div>
                    <div id="sync-status" className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 p-4 pt-24 max-w-lg mx-auto w-full space-y-4 pb-32 overflow-y-auto no-scrollbar">
                {children}
            </main>

            {/* Bottom Nav */}
            <nav className="fixed bottom-0 left-0 right-0 bg-[var(--surface)]/90 backdrop-blur-xl border-t border-black/5 safe-bottom z-50 transition-colors duration-200">
                <div className="max-w-lg mx-auto flex justify-around p-2">
                    <NavItem to="/" icon={<Fingerprint size={20} />} label={t('nav_home')} />
                    <NavItem to="/settings" icon={<Sliders size={20} />} label={t('settings_title')} />
                </div>
            </nav>
        </div>
    );
};

const NavItem = ({ to, icon, label }) => {
    return (
        <NavLink to={to} className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-10 py-2 rounded-full transition-all duration-300 ${isActive
                ? "bg-[var(--primary-container)] text-[var(--on-primary-container)]"
                : "text-slate-400 hover:bg-black/5"
            }`
        }>
            {icon}
            <span className="text-[10px] font-bold uppercase">{label}</span>
        </NavLink>
    );
};
