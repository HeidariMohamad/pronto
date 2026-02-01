import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { M2T, T2M } from '../services/stats';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';

export const SettingsPage = () => {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const { t } = useTranslation();
    const WEEKDAYS = t('weekday_labels');

    const saveSetting = async (key, value) => {
        if (settings) {
            await db.settings.update('v8', { [key]: value });
        }
    };

    const updateTarget = async (dayIndex, timeStr) => {
        if (!settings) return;
        const newTargets = [...settings.targets];
        newTargets[dayIndex] = T2M(timeStr);
        await saveSetting('targets', newTargets);
    };

    if (!settings) return <div className="p-6 text-center opacity-50">Carregando...</div>;

    return (
        <div className="space-y-6 pb-24">
            <h2 className="text-2xl font-light">{t('settings_title')}</h2>

            {/* Language */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('lang_title')}</p>
                <div className="flex gap-2">
                    <button onClick={() => saveSetting('language', 'pt')} className={`flex-1 py-3 rounded-xl border font-medium ${settings.language === 'pt' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>Português</button>
                    <button onClick={() => saveSetting('language', 'en')} className={`flex-1 py-3 rounded-xl border font-medium ${settings.language === 'en' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>English</button>
                    <button onClick={() => saveSetting('language', 'fa')} className={`flex-1 py-3 rounded-xl border font-medium ${settings.language === 'fa' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>فارسی</button>
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
                            checked={settings.notify}
                            onChange={(e) => {
                                saveSetting('notify', e.target.checked);
                                if (e.target.checked && Notification.permission !== 'granted') Notification.requestPermission();
                            }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                    </label>
                </div>
            </Card>

            {/* Schedule */}
            <Card className="space-y-6">
                <div>
                    <label className="text-xs font-bold text-[var(--primary)] uppercase block mb-2 tracking-widest">{t('tolerance')}</label>
                    <input
                        type="number"
                        value={settings.tolerance}
                        onChange={(e) => saveSetting('tolerance', parseInt(e.target.value) || 0)}
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
                                    value={M2T(settings.targets[idx])}
                                    onChange={(e) => updateTarget(idx, e.target.value)}
                                    className="bg-white/10 p-2 rounded-xl font-bold text-center w-24 border-none outline-none"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        </div>
    );
};
