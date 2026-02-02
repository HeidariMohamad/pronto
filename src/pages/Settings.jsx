import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { M2T, T2M } from '../services/stats';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';
import { Download, Upload } from 'lucide-react';

// Time Range Input Component (Start - End)
const ShiftTimeInput = ({ value, onChange, onDelete }) => {
    // We update parent immediately to ensure totals are calculated in real-time
    // Local state is still useful if we wanted to debounce, but for time inputs immediate is better for UX here.

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/30 rounded-lg p-2 flex items-center justify-center">
                <input
                    type="time"
                    value={value?.start || '08:00'}
                    onChange={(e) => onChange({ ...value, start: e.target.value })}
                    className="bg-transparent text-sm font-medium outline-none border-none text-center w-full appearance-none"
                />
            </div>
            <span className="opacity-30 text-xs">-</span>
            <div className="flex-1 bg-black/30 rounded-lg p-2 flex items-center justify-center">
                <input
                    type="time"
                    value={value?.end || '17:00'}
                    onChange={(e) => onChange({ ...value, end: e.target.value })}
                    className="bg-transparent text-sm font-medium outline-none border-none text-center w-full appearance-none"
                />
            </div>
            <button
                onClick={onDelete}
                className="p-1 text-red-500/60 hover:text-red-500"
                title="Remove shift"
            >
                <div className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-full text-xs">×</div>
            </button>
        </div>
    );
};

// Weekly Schedule Editor with Time Range Inputs and Total Hours
const WeeklyScheduleEditor = ({ targets, onChange }) => {
    const { t } = useTranslation();
    const WEEKDAYS = t('weekday_labels');

    const calculateTotal = (dayShifts) => {
        if (!dayShifts) return 0;
        return dayShifts.reduce((acc, shift) => {
            if (typeof shift === 'number') return acc + shift;
            if (shift && shift.start && shift.end) {
                return acc + Math.max(0, T2M(shift.end) - T2M(shift.start));
            }
            return acc;
        }, 0);
    };

    return (
        <div className="space-y-3">
            {WEEKDAYS.map((day, dayIdx) => {
                const dayShifts = targets[dayIdx] || [];
                const totalMinutes = calculateTotal(dayShifts);

                return (
                    <div key={dayIdx} className="bg-white/5 rounded-xl p-3 space-y-2 border border-white/5">
                        <div className="flex justify-between items-end">
                            <span className="font-bold opacity-70 text-xs uppercase tracking-widest">{day}</span>
                            <span className="font-medium text-[var(--primary)] text-sm">{M2T(totalMinutes)}h</span>
                        </div>

                        <div className="space-y-2">
                            {dayShifts.map((shift, sessionIdx) => (
                                <ShiftTimeInput
                                    key={sessionIdx}
                                    value={shift}
                                    onChange={(newVal) => {
                                        const newTargets = targets.map((d, i) => i === dayIdx ? [...d] : d);
                                        newTargets[dayIdx][sessionIdx] = newVal;
                                        onChange(newTargets);
                                    }}
                                    onDelete={() => {
                                        const newTargets = targets.map((d, i) => i === dayIdx ? [...d] : d);
                                        newTargets[dayIdx] = newTargets[dayIdx].filter((_, i) => i !== sessionIdx);
                                        onChange(newTargets);
                                    }}
                                />
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                const newTargets = targets.map((d, i) => i === dayIdx ? [...(d || [])] : (d || []));
                                newTargets[dayIdx].push({ start: '08:00', end: '12:00' });
                                onChange(newTargets);
                            }}
                            className="w-full py-2.5 bg-white/5 rounded-xl text-xs font-medium opacity-50 hover:opacity-100 hover:bg-white/10 transition-all"
                        >
                            {t('add_shift')}
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export const SettingsPage = () => {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const { t } = useTranslation();

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
            const sems = await db.semesters.toArray();
            const data = { records, settings: config, semesters: sems };
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
                    const s = { ...data.settings[0], id: 'v8' };
                    await db.settings.put(s);
                }
                if (data.semesters) {
                    await db.semesters.clear();
                    await db.semesters.bulkAdd(data.semesters);
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

            {/* Preferences (Notifications & Tolerance) */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">Preferences</p>

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

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('tolerance')}</span>
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
            </Card>

            {/* Semester Management */}
            <Card className="space-y-6">
                <div className="flex justify-between items-center">
                    <p className="text-xs font-bold opacity-50 uppercase tracking-widest">Semesters</p>
                    <button
                        onClick={async () => {
                            await db.semesters.add({
                                name: 'New Semester',
                                startDate: new Date().toISOString().split('T')[0],
                                endDate: new Date().toISOString().split('T')[0],
                                targets: [[], [], [], [], [], [], []]
                            });
                        }}
                        className="text-xs bg-[var(--primary)] text-white px-3 py-1.5 rounded-lg font-bold"
                    >
                        + Add
                    </button>
                </div>

                <SemesterList />
            </Card>

            {/* GitHub Star Plea */}
            <div className="pt-8 pb-4 text-center space-y-4">
                <div className="inline-block p-[2px] rounded-2xl bg-gradient-to-r from-yellow-400/30 via-orange-500/30 to-purple-500/30">
                    <a
                        href="https://github.com/HeidariMohamad/pronto"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-black/80 backdrop-blur-xl rounded-2xl p-6 hover:bg-black/60 transition-all group"
                    >
                        <p className="text-xl mb-1 transform group-hover:scale-110 transition-transform duration-300">⭐</p>
                        <p className="text-sm font-medium opacity-80 mb-3 bg-gradient-to-r from-yellow-200 to-orange-200 bg-clip-text text-transparent">
                            {t('github_star_text')}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50 group-hover:opacity-100 transition-opacity">
                            <span>{t('github_button')}</span>
                        </div>
                    </a>
                </div>
                <p className="text-[10px] opacity-20">v0.1.0 • Made with coffee and cake</p>
            </div>
        </div>
    );
};

const SemesterList = () => {
    const semesters = useLiveQuery(() => db.semesters.toArray());
    const [expandedId, setExpandedId] = useState(null);

    if (!semesters?.length) return <div className="text-center opacity-30 text-sm py-4">No semesters defined</div>;

    return (
        <div className="space-y-4">
            {semesters.map(sem => (
                <div key={sem.id} className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                    <div
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedId(expandedId === sem.id ? null : sem.id)}
                    >
                        <div>
                            <input
                                value={sem.name}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => db.semesters.update(sem.id, { name: e.target.value })}
                                className="bg-transparent font-bold border-none p-0 focus:ring-0 outline-none w-full"
                            />
                            <p className="text-xs opacity-50 mt-1">
                                {sem.startDate} — {sem.endDate}
                            </p>
                        </div>
                        <div className="text-xs opacity-50">
                            {expandedId === sem.id ? 'Close' : 'Edit'}
                        </div>
                    </div>

                    {expandedId === sem.id && (
                        <div className="p-4 border-t border-white/10 bg-black/20 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] opacity-50 uppercase tracking-widest block mb-1">Start</label>
                                    <input
                                        type="date"
                                        value={sem.startDate}
                                        onChange={(e) => db.semesters.update(sem.id, { startDate: e.target.value })}
                                        className="w-full bg-white/10 border-none rounded-lg text-sm p-2"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] opacity-50 uppercase tracking-widest block mb-1">End</label>
                                    <input
                                        type="date"
                                        value={sem.endDate}
                                        onChange={(e) => db.semesters.update(sem.id, { endDate: e.target.value })}
                                        className="w-full bg-white/10 border-none rounded-lg text-sm p-2"
                                    />
                                </div>
                            </div>

                            <WeeklyScheduleEditor
                                targets={sem.targets}
                                onChange={(newTargets) => db.semesters.update(sem.id, { targets: newTargets })}
                            />

                            <button
                                onClick={() => {
                                    if (confirm('Delete semester?')) db.semesters.delete(sem.id);
                                }}
                                className="w-full py-3 text-red-400 bg-red-400/10 rounded-xl text-sm font-bold mt-4"
                            >
                                Delete Semester
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
