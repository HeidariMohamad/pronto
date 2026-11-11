import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Fingerprint, Sliders, ShieldCheck, RefreshCw } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { subscribeSyncStatus } from '../services/sync';
import { useAuth } from '../context/AuthContext';
import { NotificationBanner } from './NotificationBanner';
import { refreshApp } from '../services/appUpdate';

export const Layout = ({ children }) => {
    const { t } = useTranslation();
    const { isAdmin } = useAuth();
    const [syncStatus, setSyncStatus] = useState('idle');
    const mainRef = useRef(null);
    const pullStart = useRef(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
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
                    title: t("Syncing changes to cloud...")
                };
            case 'offline':
                return {
                    className: 'w-2 h-2 rounded-full bg-slate-500',
                    title: t("Offline mode (changes saved locally)")
                };
            case 'error':
                return {
                    className: 'w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
                    title: t("Sync failed (will retry automatically)")
                };
            case 'idle':
            default:
                return {
                    className: 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]',
                    title: t("Connected & synced")
                };
        }
    };

    const statusInfo = getStatusIndicator();

    const handleTouchStart = (event) => {
        if (refreshing || event.touches.length !== 1 || event.target.closest('button, input, textarea, select, [role="dialog"]')) return;
        const root = document.getElementById('root');
        if ((root?.scrollTop || 0) > 0 || (mainRef.current?.scrollTop || 0) > 0) return;
        let element = event.target;
        while (element && element !== mainRef.current) {
            if (element.scrollTop > 0) return;
            element = element.parentElement;
        }
        pullStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const handleTouchMove = (event) => {
        if (!pullStart.current || event.touches.length !== 1) return;
        const dy = event.touches[0].clientY - pullStart.current.y;
        const dx = event.touches[0].clientX - pullStart.current.x;
        if (Math.abs(dx) > Math.abs(dy) || (mainRef.current?.scrollTop || 0) > 0 || (document.getElementById('root')?.scrollTop || 0) > 0) {
            pullStart.current = null;
            setPullDistance(0);
            return;
        }
        setPullDistance(Math.min(90, Math.max(0, dy)));
    };
    const handleTouchEnd = () => {
        pullStart.current = null;
        if (pullDistance >= 70 && !refreshing) {
            setRefreshing(true);
            refreshApp();
        }
        setPullDistance(0);
    };

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
            {(pullDistance > 10 || refreshing) && <div role="status" aria-live="polite" className="fixed top-[calc(4.5rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-[#1b263b] border border-white/10 px-3 py-2 shadow-xl text-xs text-slate-200"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />{refreshing ? t('Refreshing…') : pullDistance >= 70 ? t('Release to refresh') : t('Pull to refresh')}</div>}
            <main ref={mainRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={() => { pullStart.current = null; setPullDistance(0); }} className="flex-1 p-4 pt-[calc(4.5rem+env(safe-area-inset-top))] max-w-[440px] mx-auto w-full space-y-4 pb-28 overflow-y-auto no-scrollbar relative z-10">
                <NotificationBanner />
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
