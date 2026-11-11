import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { M2T, T2M } from '../services/stats';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '../components/UI';
import { useTranslation } from '../hooks/useTranslation';
import { Download, Upload, Cloud, HardDrive, LogOut, ShieldCheck, RefreshCw, Sparkles, Sliders } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { triggerSync, queueSync } from '../services/sync';
import { api } from '../services/api';
import { prepareMerge, sameSourceSnapshot } from '../services/mergeData';
import { formatPunchType } from '../services/i18n';
import { createPortal } from 'react-dom';
import { IosTimePickerModal } from '../components/IosTimePickerModal';
import { CloudStorage } from '../components/CloudStorage';

// Time Range Input Component (Start - End)
const ShiftTimeInput = ({ value, onChange, onDelete }) => {
    const [pickerTarget, setPickerTarget] = useState(null); // 'start' | 'end' | null
    const { t } = useTranslation();

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => setPickerTarget('start')}
                className="flex-1 bg-black/30 hover:bg-black/50 border border-white/5 rounded-lg p-2 text-sm font-semibold text-white text-center cursor-pointer active:scale-95 transition-all"
            >
                {value?.start || '08:00'}
            </button>
            <span className="opacity-30 text-xs">-</span>
            <button
                type="button"
                onClick={() => setPickerTarget('end')}
                className="flex-1 bg-black/30 hover:bg-black/50 border border-white/5 rounded-lg p-2 text-sm font-semibold text-white text-center cursor-pointer active:scale-95 transition-all"
            >
                {value?.end || '17:00'}
            </button>
            <button
                type="button"
                onClick={onDelete}
                className="p-1 text-red-500/60 hover:text-red-500"
                title={t('delete')}
            >
                <div className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-full text-xs">×</div>
            </button>

            <IosTimePickerModal
                isOpen={!!pickerTarget}
                initialTime={pickerTarget === 'start' ? (value?.start || '08:00') : (value?.end || '17:00')}
                title={pickerTarget === 'start' ? t('shift_start') : t('shift_end')}
                onConfirm={(newTime) => {
                    if (pickerTarget === 'start') {
                        onChange({ ...value, start: newTime });
                    } else if (pickerTarget === 'end') {
                        onChange({ ...value, end: newTime });
                    }
                }}
                onClose={() => setPickerTarget(null)}
            />
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

function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const RANDOM_ROBOTS = [
    '/avatar-robot.png', // The purple horned devil bot
    'https://api.dicebear.com/7.x/bottts/svg?seed=Felix&colors=blue,cyan',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Aiden&colors=amber,orange',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Midnight&colors=emerald,teal',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Zoe&colors=purple,pink',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow&colors=slate,zinc'
];

function getConsistentRandomAvatar(identifier = '') {
    if (!identifier) return '/avatar-robot.png';
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        hash = (hash << 5) - hash + identifier.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % RANDOM_ROBOTS.length;
    return RANDOM_ROBOTS[idx];
}

export const SettingsPage = () => {
    const settings = useLiveQuery(() => db.settings.get('v8'));
    const { t, lang } = useTranslation();
    const { user, isAdmin, storageUsage, logout, refreshStorage } = useAuth();
    const navigate = useNavigate();

    const [backupMsg, setBackupMsg] = useState('');
    const [syncingNow, setSyncingNow] = useState(false);
    const [mergeReview, setMergeReview] = useState(null);

    const finishMerge = async (plan, selections) => {
        setSyncingNow(true);
        try {
            // Another tab or device may have changed data while the review was open.
            const cloud = await api.get('/api/sync/pull');
            const device = {
                records: await db.records.toArray(),
                semesters: await db.semesters.toArray(),
                settings: await db.settings.get('v8')
            };
            const latest = await prepareMerge(device, cloud);
            if (!sameSourceSnapshot(plan, latest, 'device') || !sameSourceSnapshot(plan, latest, 'cloud')) {
                setMergeReview(null);
                setBackupMsg('Data changed during review. Nothing was changed; start again to compare the latest versions.');
                return;
            }
            const restored = new Map();
            for (const group of plan.groups) {
                const selected = selections[`${group.collection}:${group.key}`] || group.options[0];
                if (group.cloud?.deleted && !selected.deleted) {
                    const result = await api.post('/api/storage/restore', {
                        collection: group.collection, id: String(group.key), deletedAt: group.cloud.value.deletedAt, value: selected.value
                    });
                    restored.set(`${group.collection}:${group.key}`, result.updatedAt);
                }
            }
            const now = Date.now();
            await db.transaction('rw', db.records, db.settings, db.semesters, db.pending_sync, async () => {
                const pending = [];
                for (const group of plan.groups) {
                    const selected = selections[`${group.collection}:${group.key}`] || group.options[0];
                    if (selected.deleted) {
                        const key = group.collection === 'semesters' && /^\d+$/.test(String(group.key)) ? Number(group.key) : group.key;
                        await db[group.collection].delete(key);
                        if (group.collection === 'semesters' && typeof key === 'number') await db.semesters.delete(String(key));
                        await db.pending_sync.where('collection').equals(group.collection).filter(item => item.docId === String(group.key)).delete();
                        continue;
                    }
                    const restoredAt = restored.get(`${group.collection}:${group.key}`);
                    const needsUpload = !restoredAt && (!group.cloud || group.cloud.signature !== selected.signature);
                    const updatedAt = restoredAt || (needsUpload ? Math.max(now, Number(group.cloud?.value.updatedAt || 0) + 1) : Math.max(Number(selected.value.updatedAt || 0), Number(group.cloud?.value.updatedAt || 0)));
                    const value = { ...selected.value, ...(updatedAt ? { updatedAt } : {}) };
                    await db[group.collection].put(value);
                    if (needsUpload) pending.push({ collection: group.collection, docId: String(group.key), action: 'upsert', timestamp: now });
                }
                if (pending.length) await db.pending_sync.bulkAdd(pending);
            });
            setMergeReview(null);
            setBackupMsg('Changes saved on this device. Syncing...');
            await triggerSync();
            await refreshStorage();
            setBackupMsg('Sync completed. Device and cloud records were compared.');
        } catch (err) {
            console.error('Merge or sync failed:', err);
            setBackupMsg('Sync could not finish. Your local data is kept; please retry.');
        } finally {
            setSyncingNow(false);
        }
    };

    const beginMerge = async (backup = null) => {
        if (!navigator.onLine || !localStorage.getItem('pronto_token')) {
            setBackupMsg('Connect to the internet and sign in before syncing or restoring.');
            return;
        }
        setSyncingNow(true);
        setBackupMsg('Comparing device and cloud data...');
        try {
            const cloud = await api.get('/api/sync/pull');
            const device = {
                records: await db.records.toArray(),
                semesters: await db.semesters.toArray(),
                settings: await db.settings.get('v8')
            };
            const plan = await prepareMerge(device, cloud, backup);
            if (plan.conflicts.length) {
                setBackupMsg('Review the differences before syncing.');
                setMergeReview({ plan, index: 0, selections: {} });
            } else {
                await finishMerge(plan, {});
            }
        } catch (err) {
            console.error('Could not compare data:', err);
            setBackupMsg('Could not compare cloud data. Nothing was changed; please retry.');
        } finally {
            setSyncingNow(false);
        }
    };

    const handleSyncNow = () => beginMerge();

    const chooseMergeOption = async (option) => {
        const { plan, index, selections } = mergeReview;
        const group = plan.conflicts[index];
        const next = { ...selections, [`${group.collection}:${group.key}`]: option };
        if (index + 1 < plan.conflicts.length) setMergeReview({ plan, index: index + 1, selections: next });
        else await finishMerge(plan, next);
    };

    const saveSetting = async (key, value) => {
        if (settings) {
            await db.settings.update('v8', { [key]: value });
            queueSync('settings', 'v8');
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
                if (!data || typeof data !== 'object' ||
                    (data.records !== undefined && !Array.isArray(data.records)) ||
                    (data.semesters !== undefined && !Array.isArray(data.semesters)) ||
                    (data.settings !== undefined && !Array.isArray(data.settings)) ||
                    (!data.records && !data.semesters && !data.settings)) {
                    throw new Error('Invalid backup format');
                }
                await beginMerge(data);
            } catch (err) {
                console.error('Backup restore failed:', err);
                setBackupMsg('Backup could not be restored. Existing local data was kept.');
            }
        };
        reader.onerror = () => setBackupMsg('The backup file could not be read.');
        reader.readAsText(file);
        e.target.value = '';
    };

    if (!settings) return <div className="p-6 text-center opacity-50">Carregando...</div>;

    return (
        <div className="space-y-6 pb-24">
            <h2 className="text-2xl font-light">{t('settings_title')}</h2>

            {/* Account & Storage */}
            {user && (
                <Card className="space-y-4">
                    <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('account_cloud_storage')}</p>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img
                                src={user.avatar_url || user.picture || getConsistentRandomAvatar(user.email || user.id)}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = getConsistentRandomAvatar(user.email || user.id);
                                }}
                                alt={user.name || 'User'}
                                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500/25 to-blue-500/25 border border-white/20 p-0.5 object-cover shadow-lg"
                            />
                            <div>
                                <p className="text-sm font-semibold">{user.name}</p>
                                <p className="text-xs opacity-60">{user.email}</p>
                            </div>
                        </div>

                        <button
                            onClick={logout}
                            title="Sign out"
                            className="p-2 text-red-400/80 hover:text-red-400 hover:bg-white/5 rounded-xl transition-colors"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>

                    {/* Storage Usage Bar */}
                    {(() => {
                        const limitMb = storageUsage?.storageLimitMb || 50;
                        const limitBytes = storageUsage?.storageLimitBytes || (limitMb * 1024 * 1024);
                        const totalBytes = storageUsage?.totalBytes || 0;
                        const percent = Math.min(100, Math.max(1, (totalBytes / limitBytes) * 100));

                        return (
                            <div className="bg-white/5 p-3 rounded-xl space-y-2 border border-white/5">
                                <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-1.5 opacity-80">
                                        <HardDrive size={13} className="text-[var(--primary)]" />
                                        <span>{t('storage_used')}</span>
                                    </div>
                                    <span className="font-semibold text-[var(--primary)]">
                                        {formatBytes(totalBytes)} / {limitMb} MB
                                    </span>
                                </div>

                                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>

                                <div className="flex justify-between text-[10px] opacity-60 pt-0.5">
                                    <span>{storageUsage ? `${t('records_label')}: ${formatBytes(storageUsage.dbBytes || 0)} (${storageUsage.recordsCount || 0} ${t('days_label')})` : t('cloud_unavailable')}</span>
                                    {storageUsage && <span>{t('photos_label')}: {formatBytes(storageUsage.filesBytes || 0)} ({storageUsage.filesCount || 0})</span>}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleSyncNow}
                            disabled={syncingNow}
                            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 active:scale-[0.99] rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                            <RefreshCw size={14} className={syncingNow ? 'animate-spin' : ''} />
                            {syncingNow ? '...' : t('sync_now')}
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => navigate('/admin')}
                                className="flex-1 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-purple-500/30 cursor-pointer"
                            >
                                <ShieldCheck size={14} />
                                Admin Dashboard
                            </button>
                        )}
                    </div>
                    {backupMsg && <p role="status" aria-live="polite" className="text-xs text-slate-200">{backupMsg}</p>}
                    <CloudStorage />
                </Card>
            )}

            {/* Data Backup */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('data_management')}</p>
                <div className="flex gap-3">
                    <button onClick={handleExport} className="flex-1 bg-white/5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-white/10 cursor-pointer">
                        <Download size={16} /> {t('backup')}
                    </button>
                    <label className="flex-1 bg-white/5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-white/10 cursor-pointer">
                        <Upload size={16} /> {t('restore')}
                        <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                    </label>
                </div>
                {backupMsg && <p className="text-center text-xs text-[var(--primary)]">{backupMsg}</p>}
            </Card>

            {/* Visual Theme Selection */}
            {(() => {
                const activeTheme = (!settings?.theme || settings.theme === 'default') ? 'liquid-glass' : settings.theme;
                return (
                    <Card className="space-y-3">
                        <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('theme_title') || 'Visual Theme'}</p>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => saveSetting('theme', 'liquid-glass')}
                                className={`py-3 px-2 rounded-2xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${activeTheme === 'liquid-glass'
                                        ? 'bg-blue-600/30 text-white border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                        : 'border-white/10 hover:bg-white/5 text-slate-300'
                                    }`}
                            >
                                <Sparkles size={16} className="text-blue-400" />
                                <span>Liquid Glass</span>
                            </button>

                            <button
                                onClick={() => saveSetting('theme', 'classic')}
                                className={`py-3 px-2 rounded-2xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${activeTheme === 'classic'
                                        ? 'bg-slate-700/50 text-white border-slate-400/50 shadow-md'
                                        : 'border-white/10 hover:bg-white/5 text-slate-300'
                                    }`}
                            >
                                <Sliders size={16} className="text-slate-400" />
                                <span>Classic Dark</span>
                            </button>

                            <button
                                onClick={() => saveSetting('theme', 'oled')}
                                className={`py-3 px-2 rounded-2xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${activeTheme === 'oled'
                                        ? 'bg-black text-white border-white/40 shadow-md'
                                        : 'border-white/10 hover:bg-white/5 text-slate-300'
                                    }`}
                            >
                                <div className="w-4 h-4 rounded-full bg-black border border-white/40" />
                                <span>OLED Black</span>
                            </button>
                        </div>
                    </Card>
                );
            })()}

            {/* Language */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('lang_title')}</p>
                <div className="flex gap-2">
                    <button onClick={() => saveSetting('language', 'pt')} className={`flex-1 py-3 rounded-xl border font-medium cursor-pointer ${settings.language === 'pt' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>Português</button>
                    <button onClick={() => saveSetting('language', 'en')} className={`flex-1 py-3 rounded-xl border font-medium cursor-pointer ${settings.language === 'en' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>English</button>
                    <button onClick={() => saveSetting('language', 'fa')} className={`flex-1 py-3 rounded-xl border font-medium cursor-pointer ${settings.language === 'fa' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-white/10'}`}>فارسی</button>
                </div>
            </Card>

            {/* Preferences (Notifications & Tolerance) */}
            <Card className="space-y-4">
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('preferences')}</p>

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
                    <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t('semesters_title')}</p>
                    <button
                        onClick={async () => {
                            await db.semesters.add({
                                name: t('new_semester'),
                                startDate: new Date().toISOString().split('T')[0],
                                endDate: new Date().toISOString().split('T')[0],
                                targets: [[], [], [], [], [], [], []]
                            });
                        }}
                        className="text-xs bg-[var(--primary)] text-white px-3 py-1.5 rounded-lg font-bold"
                    >
                        {t('add_new')}
                    </button>
                </div>

                <SemesterList />
            </Card>

            {mergeReview && createPortal((() => {
                const { plan, index } = mergeReview;
                const group = plan.conflicts[index];
                return (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="merge-title">
                        <div className="theme-card w-full max-w-md max-h-[85dvh] overflow-y-auto p-5 space-y-4 text-white shadow-2xl">
                            <div>
                                <p className="text-xs text-slate-400">Difference {index + 1} of {plan.conflicts.length}</p>
                                <h3 id="merge-title" className="text-lg font-semibold mt-1">
                                    {group.collection === 'records' ? `Choose the record for ${group.key}` : group.collection === 'semesters' ? 'Choose the schedule to keep' : 'Choose the settings to keep'}
                                </h3>
                                <p className="text-xs text-slate-300 mt-2">Select the version you want to keep. Nothing changes until all differences are reviewed.</p>
                                {group.cloud?.deleted && <p className="text-xs text-amber-300 mt-2">This item was deleted from the cloud. Choosing a device or backup version restores it there.</p>}
                            </div>
                            {group.options.map((option, optionIndex) => (
                                <button key={optionIndex} disabled={syncingNow} onClick={() => chooseMergeOption(option)} className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10 space-y-1">
                                    <span className="block text-sm font-semibold">{option.deleted ? 'Keep deleted from cloud' : option.sources.map(source => ({ device: 'This device', cloud: 'Cloud', backup: 'Backup file' }[source])).join(' / ')}</span>
                                    {option.deleted ? (
                                        <span className="block text-xs text-slate-300">Remove this item from this device too.</span>
                                    ) : group.collection === 'records' ? (
                                        <span className="block text-xs text-slate-300 break-words">
                                            {(option.value.entries || []).filter(Boolean).map(entry => `${formatPunchType(entry.type, lang)} ${entry.time || ''}${entry.photo ? ' 📷' : ''}`).join(' · ') || 'No punches'}{option.value.note ? ` · ${option.value.note}` : ''}
                                            <span className="flex flex-wrap gap-2 mt-2">{(option.value.entries || []).filter(entry => entry?.photo).map((entry, photoIndex) => <img key={photoIndex} src={entry.photo} alt={`${entry.time || ''} photo`} className="w-12 h-12 object-cover rounded-lg" />)}</span>
                                        </span>
                                    ) : group.collection === 'semesters' ? (
                                        <span className="block text-xs text-slate-300 break-words">{option.value.name || 'Schedule'} · {option.value.startDate} – {option.value.endDate}<br />Hours: {JSON.stringify(option.value.targets || [])}</span>
                                    ) : (
                                        <span className="block text-xs text-slate-300 break-words">Theme: {option.value.theme || 'default'} · Language: {option.value.language || 'default'} · Tolerance: {option.value.tolerance || 0} min<br />Hours: {JSON.stringify(option.value.targets || [])}</span>
                                    )}
                                </button>
                            ))}
                            <button disabled={syncingNow} onClick={() => { setMergeReview(null); setBackupMsg('Review cancelled. No data was changed.'); }} className="w-full py-2 text-sm text-slate-300">{t('cancel')}</button>
                        </div>
                    </div>
                );
            })(), document.body)}

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
                        <div className="flex items-center justify-center gap-2 text-sm font-bold opacity-100 transition-opacity text-white border border-white/20 rounded-xl py-2 px-4 bg-white/5">
                            <span>{t('github_button')}</span>
                        </div>
                    </a>
                </div>
                <p className="text-sm font-medium opacity-80 mt-4">v0.1.0 • Made with ☕ and 🍰</p>
            </div>
        </div>
    );
};

const SemesterList = () => {
    const semesters = useLiveQuery(() => db.semesters.toArray());
    const [expandedId, setExpandedId] = useState(null);
    const { t } = useTranslation();

    if (!semesters?.length) return <div className="text-center opacity-30 text-sm py-4">{t('no_semesters')}</div>;

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
                            {expandedId === sem.id ? t('close_label') : t('edit_label')}
                        </div>
                    </div>

                    {expandedId === sem.id && (
                        <div className="p-4 border-t border-white/10 bg-black/20 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] opacity-50 uppercase tracking-widest block mb-1">{t('start_label')}</label>
                                    <input
                                        type="date"
                                        value={sem.startDate}
                                        onChange={(e) => db.semesters.update(sem.id, { startDate: e.target.value })}
                                        className="w-full bg-white/10 border-none rounded-lg text-sm p-2"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] opacity-50 uppercase tracking-widest block mb-1">{t('end_label')}</label>
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
                                    if (confirm(t('delete_semester_confirm'))) db.semesters.delete(sem.id);
                                }}
                                className="w-full py-3 text-red-400 bg-red-400/10 rounded-xl text-sm font-bold mt-4"
                            >
                                {t('delete_semester')}
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
