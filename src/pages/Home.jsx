import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDailyRecord } from '../hooks/useDailyRecord';
import { M2T, formatDurationHM, groupEntriesIntoSessions } from '../services/stats';
import { 
    ChevronLeft, 
    ChevronRight, 
    Fingerprint, 
    Camera, 
    Trash2, 
    ChevronDown, 
    ChevronUp,
    Sparkles,
    X
} from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { toLocalISOString } from '../services/db';
import { optimizeImage } from '../services/imageOptimizer';
import { api } from '../services/api';
import { IosTimePickerModal } from '../components/IosTimePickerModal';
import { CameraCaptureModal } from '../components/CameraCaptureModal';

export const HomePage = () => {
    const [activeDate, setActiveDate] = useState(new Date());
    const { record, settings, stats, addEntry, updateEntry, deleteEntry, updateNote } = useDailyRecord(toLocalISOString(activeDate));
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [entryToDelete, setEntryToDelete] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [editingTimePicker, setEditingTimePicker] = useState(null);
    const [capturingCameraEntryId, setCapturingCameraEntryId] = useState(null);
    const [collapsedTurns, setCollapsedTurns] = useState({});
    const { t, lang } = useTranslation();

    const changeDate = (days) => {
        const d = new Date(activeDate);
        d.setDate(d.getDate() + days);
        setActiveDate(d);
    };

    const handleQuickStamp = () => {
        const n = new Date();
        const time = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
        const count = record.entries?.length || 0;
        const typeBase = lang === 'pt' ? (count % 2 === 0 ? 'Entrada' : 'Saída') 
                       : lang === 'fa' ? (count % 2 === 0 ? 'ورود' : 'خروج')
                       : (count % 2 === 0 ? 'In' : 'Out');
        const type = `${typeBase} ${Math.floor(count / 2) + 1}`;
        addEntry(time, type);
    };

    const handleProcessAndSavePhoto = async (fileOrBlob, entryId) => {
        if (!fileOrBlob || !entryId) return;

        try {
            // 1:1 square crop guaranteed
            const { blob, dataUrl } = await optimizeImage(fileOrBlob, 800, 0.65, true);
            await updateEntry(entryId, 'photo', dataUrl);

            if (navigator.onLine && localStorage.getItem('pronto_token')) {
                const fileName = fileOrBlob.name || `punch_${entryId}.webp`;
                const uploadRes = await api.uploadPhoto(blob, fileName);
                if (uploadRes?.url) {
                    await updateEntry(entryId, 'photo', uploadRes.url);
                }
            }
        } catch (err) {
            console.error('Failed to process and upload photo:', err);
        }
    };

    const confirmDelete = (id) => {
        setEntryToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const executeDelete = () => {
        if (entryToDelete) deleteEntry(entryToDelete);
        setIsDeleteModalOpen(false);
        setEntryToDelete(null);
    };

    const toggleTurnCollapse = (turnNumber) => {
        setCollapsedTurns(prev => ({
            ...prev,
            [turnNumber]: !prev[turnNumber]
        }));
    };

    const WEEKDAYS = t('weekday_labels');

    const handleDateChange = (e) => {
        if (e.target.value) {
            setActiveDate(new Date(e.target.value + 'T00:00:00'));
        }
    };

    const count = record.entries?.length || 0;
    const nextAction = count % 2 === 0 ? 'entry' : 'exit';
    const isPositiveBalance = stats.balance >= 0;

    // Group entries into sessions & intervals
    const timelineItems = groupEntriesIntoSessions(record.entries || []);

    return (
        <div className="space-y-4 pb-28 animate-fade-in">
            <div className="space-y-2.5">
            {/* Date Switcher */}
            <div className="home-date-switcher text-center space-y-0.5 pt-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                    {WEEKDAYS[activeDate.getDay()]}
                </p>

                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => changeDate(-1)}
                        className="p-1 text-slate-400 hover:text-white active:scale-90 transition-transform"
                    >
                        <ChevronLeft size={22} />
                    </button>

                    <label className="text-lg font-medium cursor-pointer relative text-slate-100 hover:text-white transition-colors">
                        {activeDate.toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'fa' ? 'fa-IR' : 'en-US', { day: 'numeric', month: 'long' })}
                        <input
                            type="date"
                            className="absolute opacity-0 inset-0 w-full h-full cursor-pointer"
                            onChange={handleDateChange}
                            value={toLocalISOString(activeDate)}
                        />
                    </label>

                    <button
                        onClick={() => changeDate(1)}
                        className="p-1 text-slate-400 hover:text-white active:scale-90 transition-transform"
                    >
                        <ChevronRight size={22} />
                    </button>
                </div>
            </div>

            {/* Top 3 Stat Cards */}
            <div className="grid grid-cols-3 gap-2.5">
                <div className="theme-stat-pill p-2.5 text-center flex flex-col items-center justify-center">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        {t('worked')}
                    </p>
                    <p className="text-xl font-bold tracking-tight text-white">
                        {M2T(stats.worked)}
                    </p>
                </div>

                <div className={`theme-stat-pill p-2.5 text-center flex flex-col items-center justify-center border ${
                    isPositiveBalance 
                        ? 'border-emerald-500/30 text-emerald-400' 
                        : 'border-red-500/30 text-red-400'
                }`}>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        {t('balance')}
                    </p>
                    <p className="text-xl font-bold tracking-tight">
                        {isPositiveBalance && stats.balance > 0 ? `+${M2T(stats.balance)}` : M2T(stats.balance)}
                    </p>
                </div>

                <div className="theme-stat-pill p-2.5 text-center flex flex-col items-center justify-center">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        {t('journey')}
                    </p>
                    <p className="text-xl font-bold tracking-tight text-white">
                        {M2T(stats.totalTarget || 0)}
                    </p>
                </div>
            </div>

            {/* Predicted Exit Time Card */}
            {stats.prediction && (
                <div className="theme-card p-3 relative overflow-hidden bg-gradient-to-r from-blue-600/30 via-indigo-600/20 to-purple-600/20 border-blue-400/30 shadow-lg shadow-blue-500/10">
                    <div className="flex justify-between items-center relative z-10">
                        <div>
                            <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-0.5">
                                <Sparkles size={13} />
                                {t('prediction')}
                            </div>
                            <h2 className="text-3xl font-light tracking-tight text-white">
                                {M2T(stats.prediction)}
                            </h2>
                        </div>
                        <Fingerprint className="w-12 h-12 text-blue-400/15" />
                    </div>
                </div>
            )}

            {/* Hero Stamp Action Button */}
            <div className="flex justify-center pt-1">
                <button
                    onClick={handleQuickStamp}
                    className="theme-action-btn w-full max-w-[280px] py-2.5 px-6 flex items-center justify-center gap-3 text-base shadow-xl"
                >
                    <Fingerprint className="w-6 h-6 text-white" />
                    <span>{t(nextAction)}</span>
                </button>
            </div>
            </div>

            {/* Timeline: Grouped Sessions (Turnos) & Breaks (Intervalos) */}
            <div className="space-y-3">
                {timelineItems.map((item) => {
                    if (item.type === 'interval') {
                        return (
                            <div
                                key={item.id}
                                className="theme-interval-card p-3 flex items-center justify-between text-xs text-slate-300"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div>
                                        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] block">
                                            {t('interval')}
                                        </span>
                                        <span className="text-slate-200 font-medium">
                                            {item.from} → {item.to}
                                        </span>
                                    </div>
                                </div>

                                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full font-semibold text-slate-300 text-xs">
                                    {formatDurationHM(item.durationMinutes)}
                                </span>
                            </div>
                        );
                    }

                    const isCollapsed = collapsedTurns[item.sessionNumber];

                    return (
                        <div key={item.sessionNumber} className="theme-card overflow-hidden">
                            {/* Session Header */}
                            <div
                                onClick={() => toggleTurnCollapse(item.sessionNumber)}
                                className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                        {t('shift')} {item.sessionNumber}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {item.durationMinutes !== null && (
                                        <span className="px-3 py-1 bg-blue-500/15 border border-blue-400/20 text-blue-300 rounded-full text-xs font-semibold">
                                            {formatDurationHM(item.durationMinutes)}
                                        </span>
                                    )}
                                    {item.durationMinutes === null && (
                                        <span className="px-2.5 py-0.5 bg-amber-500/15 border border-amber-400/20 text-amber-300 rounded-full text-[11px] font-medium animate-pulse">
                                            {t('in_progress')}
                                        </span>
                                    )}
                                    <button className="text-slate-400">
                                        {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Session Punches */}
                            {!isCollapsed && (
                                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5">
                                    {/* Entry Punch */}
                                    {item.inEntry && (
                                        <div className="flex items-center justify-between py-1.5 px-1">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTimePicker({ id: item.inEntry.id, time: item.inEntry.time, label: item.inEntry.type || t('entry') })}
                                                    className="text-base font-semibold text-white tracking-tight px-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all cursor-pointer select-none"
                                                    title={t('select_time')}
                                                >
                                                    {item.inEntry.time}
                                                </button>
                                                <span className="text-xs text-slate-400">
                                                    · {item.inEntry.type || t('entry')}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {item.inEntry.photo ? (
                                                    <img
                                                        src={item.inEntry.photo}
                                                        alt="Punch"
                                                        className="w-7 h-7 rounded-lg object-cover cursor-pointer border border-white/20 active:scale-95 transition-transform"
                                                        onClick={() => setSelectedImage(item.inEntry.photo)}
                                                    />
                                                ) : (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setCapturingCameraEntryId(item.inEntry.id)}
                                                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-slate-400 hover:text-white border border-white/10 cursor-pointer transition-all"
                                                        title={t('take_photo') || 'Take photo (1:1)'}
                                                    >
                                                        <Camera size={13} />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => confirmDelete(item.inEntry.id)}
                                                    className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
                                                    title="Delete punch"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Exit Punch */}
                                    {item.outEntry && (
                                        <div className="flex items-center justify-between py-1.5 px-1 border-t border-white/5 pt-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTimePicker({ id: item.outEntry.id, time: item.outEntry.time, label: item.outEntry.type || t('exit') })}
                                                    className="text-base font-semibold text-white tracking-tight px-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all cursor-pointer select-none"
                                                    title={t('select_time')}
                                                >
                                                    {item.outEntry.time}
                                                </button>
                                                <span className="text-xs text-slate-400">
                                                    · {item.outEntry.type || t('exit')}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {item.outEntry.photo ? (
                                                    <img
                                                        src={item.outEntry.photo}
                                                        alt="Punch"
                                                        className="w-7 h-7 rounded-lg object-cover cursor-pointer border border-white/20 active:scale-95 transition-transform"
                                                        onClick={() => setSelectedImage(item.outEntry.photo)}
                                                    />
                                                ) : (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setCapturingCameraEntryId(item.outEntry.id)}
                                                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-slate-400 hover:text-white border border-white/10 cursor-pointer transition-all"
                                                        title={t('take_photo') || 'Take photo (1:1)'}
                                                    >
                                                        <Camera size={13} />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => confirmDelete(item.outEntry.id)}
                                                    className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
                                                    title="Delete punch"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {record.entries?.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm theme-card">
                        {t('no_records_today')}
                    </div>
                )}
            </div>

            {/* Daily Note Card */}
            <div className="theme-card p-3.5">
                <textarea
                    value={record.note || ''}
                    onChange={(e) => updateNote(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-300 outline-none resize-none placeholder:text-slate-500"
                    placeholder={t('note_placeholder')}
                    rows={2}
                />
            </div>

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="theme-card p-5 w-full max-w-xs space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h3 className="text-base font-semibold text-white">{t('delete_modal_title')}</h3>
                            <button onClick={() => setIsDeleteModalOpen(false)} className="text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-300">{t('delete_modal_desc')}</p>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="flex-1 py-2 rounded-xl text-xs bg-white/10 text-slate-300 hover:bg-white/15"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={executeDelete}
                                className="flex-1 py-2 rounded-xl text-xs bg-red-500 hover:bg-red-600 text-white font-semibold"
                            >
                                {t('delete')}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Photo Zoom Modal */}
            {selectedImage && createPortal(
                <div 
                    onClick={() => setSelectedImage(null)}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg cursor-pointer"
                >
                    <div className="relative max-w-sm max-h-[80vh] overflow-hidden rounded-3xl border border-white/20 shadow-2xl">
                        <img src={selectedImage} alt="Expanded punch" className="w-full h-auto object-contain max-h-[75vh]" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>, document.body
            )}

            {/* iOS Action-Sheet Style Time Picker Modal */}
            <IosTimePickerModal
                isOpen={!!editingTimePicker}
                initialTime={editingTimePicker?.time || '08:00'}
                title={editingTimePicker?.label ? `${t('select_time')} · ${editingTimePicker.label}` : undefined}
                onConfirm={(newTime) => {
                    if (editingTimePicker?.id) {
                        updateEntry(editingTimePicker.id, 'time', newTime);
                    }
                }}
                onClose={() => setEditingTimePicker(null)}
            />

            {/* 1:1 Aspect Ratio Camera Capture Modal */}
            <CameraCaptureModal
                isOpen={!!capturingCameraEntryId}
                onCapture={(fileOrBlob) => {
                    if (capturingCameraEntryId) {
                        handleProcessAndSavePhoto(fileOrBlob, capturingCameraEntryId);
                    }
                }}
                onClose={() => setCapturingCameraEntryId(null)}
            />

        </div>
    );
};
