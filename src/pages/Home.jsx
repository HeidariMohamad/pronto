import React, { useState } from 'react';
import { useDailyRecord } from '../hooks/useDailyRecord';
import { M2T, T2M } from '../services/stats';
import { Card, Fab, Modal } from '../components/UI';
import { ChevronLeft, ChevronRight, Fingerprint, Camera, Trash2, Edit2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { toLocalISOString } from '../services/db';

export const HomePage = () => {
    const [activeDate, setActiveDate] = useState(new Date());
    const { record, settings, stats, addEntry, updateEntry, deleteEntry, updateNote } = useDailyRecord(toLocalISOString(activeDate));
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [entryToDelete, setEntryToDelete] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
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
        const typeBase = lang === 'pt' ? (count % 2 === 0 ? 'Entrada' : 'Saída') : (count % 2 === 0 ? 'In' : 'Out');
        const type = `${typeBase} ${Math.floor(count / 2) + 1}`;
        addEntry(time, type);
    };

    const handlePhoto = (e, entryId) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX = 1000;
                    let w = img.width;
                    let h = img.height;
                    if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                    else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    updateEntry(entryId, 'photo', dataUrl);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
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

    const WEEKDAYS = t('weekday_labels');

    const handleDateChange = (e) => {
        if (e.target.value) {
            setActiveDate(new Date(e.target.value + 'T00:00:00'));
        }
    };

    // Calculate next action type
    const count = record.entries?.length || 0;
    const nextAction = count % 2 === 0 ? 'entry' : 'exit';

    return (
        <div className="space-y-4 pb-32">
            {/* Date Nav */}
            <div className="flex items-center justify-between px-2">
                <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeft size={24} /></button>
                <div className="text-center relative">
                    <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest">{WEEKDAYS[activeDate.getDay()]}</p>
                    <label className="text-lg font-normal cursor-pointer flex items-center justify-center gap-2">
                        {activeDate.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'long' })}
                        <input
                            type="date"
                            className="absolute opacity-0 inset-0 w-full h-full cursor-pointer"
                            onChange={handleDateChange}
                            value={toLocalISOString(activeDate)}
                        />
                    </label>
                </div>
                <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ChevronRight size={24} /></button>
            </div>

            {/* Prediction */}
            {stats.prediction && (
                <div className="m3-card p-6 bg-[var(--primary)] text-white relative overflow-hidden shadow-lg rounded-[28px]">
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold uppercase opacity-70 tracking-tighter">{t('prediction')}</p>
                        <h2 className="text-6xl font-light tracking-tighter">{M2T(stats.prediction)}</h2>
                    </div>
                    <Fingerprint className="absolute -right-4 -top-4 w-24 h-24 opacity-10" />
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="p-5">
                    <p className="text-[10px] font-bold opacity-50 uppercase mb-1">{t('worked')}</p>
                    <p className="text-2xl font-medium">{M2T(stats.worked)}</p>
                </Card>
                <Card className={`p-5 border ${stats.balance >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
                    <p className="text-[10px] font-bold opacity-50 uppercase mb-1">{t('balance')}</p>
                    <p className="text-2xl font-medium">{M2T(stats.balance)}</p>
                </Card>
            </div>

            {/* FAB */}
            <div className="flex justify-center py-4">
                <Fab onClick={handleQuickStamp} className="px-8 py-4 h-auto rounded-2xl">
                    <Fingerprint className="w-6 h-6 mr-2" />
                    <span className="text-lg font-medium tracking-wide w-[100px] inline-block text-center">{t(nextAction)}</span>
                </Fab>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
                {[...(record.entries || [])].sort((a, b) => (T2M(a.time) || 0) - (T2M(b.time) || 0)).map(entry => (
                    <Card key={entry.id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {entry.photo ? (
                                <img
                                    src={entry.photo}
                                    className="w-10 h-10 rounded-lg object-cover cursor-pointer"
                                    onClick={() => setSelectedImage(entry.photo)}
                                />
                            ) : (
                                <label className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-slate-400 border-2 border-dashed border-black/10 dark:border-white/20 cursor-pointer overflow-hidden relative">
                                    <Camera size={16} />
                                    <input type="file" accept="image/*" className="hidden" capture="environment" onChange={(e) => handlePhoto(e, entry.id)} />
                                </label>
                            )}
                            <div>
                                <input
                                    type="time"
                                    value={entry.time}
                                    onChange={(e) => updateEntry(entry.id, 'time', e.target.value)}
                                    className="text-lg font-bold bg-transparent border-none p-0 focus:ring-0 outline-none w-28"
                                />
                                <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">{entry.type}</p>
                            </div>
                        </div>
                        <button onClick={() => confirmDelete(entry.id)} className="p-2 text-red-500 opacity-60 hover:opacity-100"><Trash2 size={18} /></button>
                    </Card>
                ))}
                {record.entries?.length === 0 && <p className="text-center opacity-30 text-sm py-4">{t('no_records_today')}</p>}
            </div>

            {/* Note */}
            <Card className="p-4">
                <textarea
                    value={record.note}
                    onChange={(e) => updateNote(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm italic outline-none resize-none"
                    placeholder={t('note_placeholder')}
                    rows={2}
                ></textarea>
            </Card>

            {/* Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
                <h3 className="text-xl font-medium">{t('delete_modal_title')}</h3>
                <p className="opacity-70">{t('delete_modal_desc')}</p>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 font-medium opacity-50">{t('cancel')}</button>
                    <button onClick={executeDelete} className="px-6 py-2 bg-red-500 text-white rounded-full font-medium">{t('delete')}</button>
                </div>
            </Modal>

            {/* Image Viewer Overlay */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setSelectedImage(null)}
                >
                    <img
                        src={selectedImage}
                        className="max-w-full max-h-full rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-4 right-4 bg-white/10 p-2 rounded-full text-white backdrop-blur-md"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
};
