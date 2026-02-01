import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/db';
import { M2T, T2M } from '../services/stats';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, Upload, RefreshCw } from 'lucide-react';

// Independent input component to prevent re-renders of the whole list
const DurationInput = ({ initialMinutes, onChange, onDelete, label }) => {
    const [h, setH] = useState(Math.floor(initialMinutes / 60));
    const [m, setM] = useState(initialMinutes % 60);

    // Sync if initial value changes externally
    useEffect(() => {
        setH(Math.floor(initialMinutes / 60));
        setM(initialMinutes % 60);
    }, [initialMinutes]);

    const handleBlur = () => {
        const total = (parseInt(h) || 0) * 60 + (parseInt(m) || 0);
        if (total !== initialMinutes) {
            onChange(total);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-2 bg-white/10 p-2 rounded-xl">
                <div className="flex-1 relative">
                    <input
                        type="number"
                        min="0"
                        max="23"
                        value={h}
                        onChange={(e) => setH(e.target.value)}
                        onBlur={handleBlur}
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
                        onChange={(e) => setM(e.target.value)}
                        onBlur={handleBlur}
                        className="w-full bg-transparent text-center font-bold outline-none border-none"
                        placeholder="0"
                    />
                    <span className="text-[10px] opacity-50 absolute top-0 right-1">M</span>
                </div>
            </div>
            <button
                onClick={onDelete}
                className="p-3 text-red-400 hover:bg-red-400/10 rounded-xl"
            >
                ×
            </button>
        </div>
    );
};

export const SettingsPage = () => {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const { t } = useTranslation();
    const WEEKDAYS = t('weekday_labels');

    // PWA Update Logic
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW();

    const [backupMsg, setBackupMsg] = useState('');

    const saveSetting = async (key, value) => {
        if (settings) {
            await db.settings.update('v8', { [key]: value });
        }
    };

    const handleExport = async () => {
        try {
            const records = await db.records.toArray();
            const config = await db.settings.toArray();
            const data = { records, settings: config };
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pronto-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            setBackupMsg('Backup saved!');
            setTimeout(() => setBackupMsg(''), 3000);
        } catch (e) {
            setBackupMsg('Error exporting');
        }
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.records) {
                    await db.records.clear();
                    await db.records.bulkAdd(data.records);
                }
                if (data.settings && data.settings[0]) {
                    // Restore settings but keep ID 'v8' just in case
                    const s = { ...data.settings[0], id: 'v8' };
                    await db.settings.put(s);
                }
                setBackupMsg('Data restored! Reloading...');
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                setBackupMsg('Invalid file');
            }
        };
        reader.readAsText(file);
    };

    if (!settings) return <div className="p-6 text-center opacity-50">Carregando...</div>;

    return (
        <div className="space-y-6 pb-24">
            <h2 className="text-2xl font-light">{t('settings_title')}</h2>

            {/* PWA Update Check */}
            <Card className="flex items-center justify-between p-4">
                <div>
                    <p className="font-bold opacity-80">App Version</p>
                    <p className="text-xs opacity-50">Status: {needRefresh ? 'Update Available' : 'Latest'}</p>
                </div>
                <button
                    onClick={() => updateServiceWorker(true)}
                    className="bg-[var(--primary)] text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                >
                    <RefreshCw size={14} />
                    Check Update
                </button>
            </Card>

            {/* Data Backup */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">Data Management</p>
                <div className="flex gap-3">
                    <button onClick={handleExport} className="flex-1 bg-white/5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-white/10">
                        <Download size={16} /> Backup
                    </button>
                    <label className="flex-1 bg-white/5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-white/10 cursor-pointer">
                        <Upload size={16} /> Restore
                        <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                    </label>
                </div>
                {backupMsg && <p className="text-center text-xs text-[var(--primary)]">{backupMsg}</p>}
            </Card>

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
                                {(settings.targets[dayIdx] || []).map((duration, sessionIdx) => (
                                    <DurationInput
                                        key={sessionIdx}
                                        initialMinutes={duration}
                                        onChange={(newVal) => {
                                            const newTargets = [...settings.targets];
                                            newTargets[dayIdx][sessionIdx] = newVal;
                                            saveSetting('targets', newTargets);
                                        }}
                                        onDelete={() => {
                                            const newTargets = [...settings.targets];
                                            newTargets[dayIdx] = newTargets[dayIdx].filter((_, i) => i !== sessionIdx);
                                            saveSetting('targets', newTargets);
                                        }}
                                    />
                                ))}
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
