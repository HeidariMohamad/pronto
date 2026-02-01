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
                    <div className="flex items-center justify-between">
                        <span className="text-sm opacity-70">10 Minutes Tolerance</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.tolerance}
                                onChange={(e) => saveSetting('tolerance', e.target.checked ? 10 : 0)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-300 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                        </label>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--primary)] uppercase block mb-4 tracking-widest">{t('journey')}</label>
                    <div className="space-y-4">
                        {WEEKDAYS.map((day, dayIdx) => (
                            <div key={dayIdx} className="bg-white/5 rounded-2xl p-4 space-y-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium opacity-80 text-sm">{day}</span>
                                    <button
                                        onClick={() => {
                                            const newTargets = [...settings.targets];
                                            newTargets[dayIdx] = [...(newTargets[dayIdx] || []), 480]; // Add 8h default
                                            saveSetting('targets', newTargets);
                                        }}
                                        className="text-xs bg-white/10 px-2 py-1 rounded-md hover:bg-white/20 transition-colors"
                                    >
                                        + Add Session
                                    </button>
                                </div>
                                {(settings.targets[dayIdx] || []).map((duration, sessionIdx) => {
                                    const h = Math.floor(duration / 60);
                                    const m = duration % 60;
                                    return (
                                        <div key={sessionIdx} className="flex items-center gap-2">
                                            <div className="flex-1 flex gap-2 bg-white/10 p-2 rounded-xl">
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="23"
                                                        value={h}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            const newTargets = [...settings.targets];
                                                            newTargets[dayIdx][sessionIdx] = val * 60 + m;
                                                            saveSetting('targets', newTargets);
                                                        }}
                                                        className="w-full bg-transparent text-center font-bold outline-none border-none"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-[10px] opacity-50 absolute top-0 right-1">H</span>
                                                </div>
                                                <div className="w-px bg-white/10"></div>
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="59"
                                                        value={m}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            const newTargets = [...settings.targets];
                                                            newTargets[dayIdx][sessionIdx] = h * 60 + val;
                                                            saveSetting('targets', newTargets);
                                                        }}
                                                        className="w-full bg-transparent text-center font-bold outline-none border-none"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-[10px] opacity-50 absolute top-0 right-1">M</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newTargets = [...settings.targets];
                                                    newTargets[dayIdx] = newTargets[dayIdx].filter((_, i) => i !== sessionIdx);
                                                    saveSetting('targets', newTargets);
                                                }}
                                                className="p-3 text-red-400 hover:bg-red-400/10 rounded-xl"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    );
                                })}
                                {(!settings.targets[dayIdx] || settings.targets[dayIdx].length === 0) && (
                                    <p className="text-xs opacity-30 italic text-center py-2">No work scheduled</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        </div>
    );
};
