import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Fingerprint, Sliders, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { subscribeSyncStatus } from '../services/sync';
import { useAuth } from '../context/AuthContext';

export const Layout = ({ children }) => {
    const { t } = useTranslation();
    const { isAdmin } = useAuth();
    const [syncStatus, setSyncStatus] = useState('idle');
    const mainRef = useRef(null);
    const location = useLocation();

    useEffect(() => {
        return subscribeSyncStatus(setSyncStatus);
    }, []);

    // Smoothly scroll to top on tab switch
    useEffect(() => {
        if (mainRef.current) {
            mainRef.current.scrollTop = 0;
        }
    }, [location.pathname]);

    const getStatusIndicator = () => {
        switch (syncStatus) {
            case 'syncing':
                return {
                    className: 'w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.9)]',
                    title: 'Syncing changes to cloud...'
                };
            case 'offline':
                return {
                    className: 'w-2 h-2 rounded-full bg-slate-500',
                    title: 'Offline mode (changes saved locally)'
                };
            case 'error':
                return {
                    className: 'w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
                    title: 'Sync failed (will retry automatically)'
                };
            case 'idle':
            default:
                return {
                    className: 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]',
                    title: 'Connected & synced'
                };
        }
    };

    const statusInfo = getStatusIndicator();

    return (
        <div className="min-h-[100dvh] flex flex-col relative text-[var(--on-container)] transition-colors duration-200">

            {/* Safe Area Top Header */}
            <header className="safe-top fixed top-0 left-0 right-0 z-40 pointer-events-none flex justify-center">
                <div className="theme-header flex justify-between items-center transition-all duration-300 pointer-events-auto">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] shadow-sm">
                            <Fingerprint size={19} />
                        </div>
                        <h1 className="text-lg font-semibold tracking-tight text-white">{t('app_name')}</h1>
                    </div>

                    <div
                        id="sync-status"
                        title={statusInfo.title}
                        className={statusInfo.className}
                    />
                </div>
            </header>

            {/* Main Content */}
            <main ref={mainRef} className="flex-1 p-4 pt-20 max-w-[440px] mx-auto w-full space-y-4 pb-28 overflow-y-auto no-scrollbar relative z-10">
                {children}
            </main>

            {/* Theme-Aware Bottom Navigation */}
            <nav className="theme-nav-container z-50 safe-bottom">
                <div
                    className={`theme-nav-bar flex justify-around items-center transition-all duration-300 ${location.pathname === '/admin' && isAdmin ? 'nav-on-admin' : location.pathname === '/settings' ? 'nav-on-settings' : 'nav-on-home'}`}
                    style={{ '--nav-count': isAdmin ? 3 : 2, '--nav-index': location.pathname === '/admin' && isAdmin ? 2 : location.pathname === '/settings' ? 1 : 0 }}
                >
                    <span className="theme-nav-liquid" aria-hidden="true" />
                    <NavItem to="/" icon={<Fingerprint size={20} />} label={t('nav_home')} />
                    <NavItem to="/settings" icon={<Sliders size={20} />} label={t('settings_title')} />
                    {isAdmin && <NavItem to="/admin" icon={<ShieldCheck size={20} />} label="Admin" />}
                </div>
            </nav>
        </div>
    );
};

const NavItem = ({ to, icon, label }) => {
    return (
        <NavLink 
            to={to} 
            className={({ isActive }) =>
                `theme-nav-item flex flex-col items-center justify-center gap-1 py-2 px-8 transition-all duration-300 active:scale-95 ${isActive
                    ? "theme-nav-active"
                    : "text-slate-400 hover:text-slate-200"
                }`
            }
        >
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </NavLink>
    );
};
