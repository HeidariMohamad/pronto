import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { M2T, T2M } from '../services/stats';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';

export const SettingsPage = () => {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const [localSettings, setLocalSettings] = useState(null);
    const { t, lang } = useTranslation();
    const WEEKDAYS = t('weekday_labels');

    useEffect(() => {
        if (settings) setLocalSettings(settings);
    }, [settings]);

    const handleSave = async () => {
        if (localSettings) {
            await db.settings.put(localSettings);
            applyTheme(localSettings.theme);
        }
    };

    const applyTheme = (t) => {
        document.body.className = t === 'default' ? '' : `theme-${t}`;
        const colors = { default: '#0b57d0', olive: '#606c38', eastbay: '#1b263b' };
        const meta = document.getElementById('meta-theme-color');
        if (meta) meta.content = colors[t] || '#f8fafc';
    };

    const updateTarget = (dayIndex, timeStr) => {
        const newTargets = [...localSettings.targets];
        newTargets[dayIndex] = T2M(timeStr);
        setLocalSettings({ ...localSettings, targets: newTargets });
    };

    if (!localSettings) return <div className="p-6 text-center opacity-50">Carregando...</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-light">{t('settings_title')}</h2>

            {/* Language */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('lang_title')}</p>
                <div className="flex gap-2">
                    <button onClick={() => setLocalSettings({ ...localSettings, language: 'pt' })} className={`flex-1 py-3 rounded-xl border font-medium ${localSettings.language === 'pt' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>Português</button>
                    <button onClick={() => setLocalSettings({ ...localSettings, language: 'en' })} className={`flex-1 py-3 rounded-xl border font-medium ${localSettings.language === 'en' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>English</button>
                </div>
            </Card>

            {/* Notifications */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('notify_title')}</p>
                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('notify_desc')}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={localSettings.notify}
                            onChange={(e) => {
                                setLocalSettings({ ...localSettings, notify: e.target.checked });
                                if (e.target.checked && Notification.permission !== 'granted') Notification.requestPermission();
                            }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                    </label>
                </div>
            </Card>

            {/* Theme */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('theme_title')}</p>
                <div className="flex gap-4">
                    <button onClick={() => { setLocalSettings({ ...localSettings, theme: 'default' }); applyTheme('default'); }} className={`w-10 h-10 rounded-full bg-[#0b57d0] border-4 shadow-sm ${localSettings.theme === 'default' ? 'border-white ring-2 ring-blue-400' : 'border-transparent'}`}></button>
                    <button onClick={() => { setLocalSettings({ ...localSettings, theme: 'olive' }); applyTheme('olive'); }} className={`w-10 h-10 rounded-full bg-[#606c38] border-4 shadow-sm ${localSettings.theme === 'olive' ? 'border-white ring-2 ring-green-700' : 'border-transparent'}`}></button>
                    <button onClick={() => { setLocalSettings({ ...localSettings, theme: 'eastbay' }); applyTheme('eastbay'); }} className={`w-10 h-10 rounded-full bg-[#415a77] border-4 shadow-sm ${localSettings.theme === 'eastbay' ? 'border-white ring-2 ring-blue-900' : 'border-transparent'}`}></button>
                </div>
            </Card>

            {/* Schedule */}
            <Card className="space-y-6">
                <div>
                    <label className="text-xs font-bold text-[var(--primary)] uppercase block mb-2 tracking-widest">{t('tolerance')}</label>
                    <input
                        type="number"
                        value={localSettings.tolerance}
                        onChange={(e) => setLocalSettings({ ...localSettings, tolerance: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/10 p-4 rounded-2xl border-none text-xl font-medium outline-none"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--primary)] uppercase block mb-4 tracking-widest">{t('journey')}</label>
                    <div className="space-y-3">
                        {WEEKDAYS.map((day, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-2xl">
                                <span className="font-medium opacity-80 text-sm">{day}</span>
                                <input
                                    type="time"
                                    value={M2T(localSettings.targets[idx])}
                                    onChange={(e) => updateTarget(idx, e.target.value)}
                                    className="bg-white/10 p-2 rounded-xl font-bold text-center w-24 border-none outline-none"
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <button onClick={handleSave} className="w-full bg-[var(--primary)] text-white py-4 rounded-full font-medium shadow-md active:scale-95 transition-transform">{t('save')}</button>
            </Card>
        </div>
    );
};
