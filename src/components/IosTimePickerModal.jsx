import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../hooks/useTranslation';

const ITEM_HEIGHT = 44; // px
const VISIBLE_COUNT = 5; // 5 visible rows (2 above, center, 2 below)
const HALF_VISIBLE = Math.floor(VISIBLE_COUNT / 2); // 2 rows offset to center

/**
 * Single iOS scroll wheel column with optional infinite circular rolling
 */
function WheelColumn({ items, value, onChange, loop = true }) {
    const containerRef = useRef(null);
    const isProgrammaticScroll = useRef(false);
    const scrollTimeout = useRef(null);

    const baseLen = items.length;
    // Repeat 5 times for seamless circular infinite scrolling
    const totalItems = loop ? [...items, ...items, ...items, ...items, ...items] : items;
    const baseIndex = items.indexOf(value);

    // Initial positioning: center value directly inside the selection lens
    useEffect(() => {
        if (baseIndex >= 0 && containerRef.current) {
            isProgrammaticScroll.current = true;
            const targetCycle = loop ? 2 : 0;
            const targetIndex = targetCycle * baseLen + baseIndex;
            // Subtract HALF_VISIBLE so targetIndex lands in the center row
            const targetScrollTop = (targetIndex - HALF_VISIBLE) * ITEM_HEIGHT;
            containerRef.current.scrollTop = targetScrollTop;
            setTimeout(() => {
                isProgrammaticScroll.current = false;
            }, 60);
        }
    }, [value, baseIndex, loop, baseLen]);

    const handleScroll = (e) => {
        if (isProgrammaticScroll.current) return;

        if (scrollTimeout.current) {
            clearTimeout(scrollTimeout.current);
        }

        const scrollTop = e.target.scrollTop;
        // The item at the center lens is row (scrollTop / ITEM_HEIGHT) + HALF_VISIBLE
        const centerIndex = Math.round(scrollTop / ITEM_HEIGHT) + HALF_VISIBLE;
        const modIndex = ((centerIndex % baseLen) + baseLen) % baseLen;
        const selectedItem = items[modIndex];

        if (selectedItem !== value) {
            onChange(selectedItem);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(6); } catch {}
            }
        }

        // Loop normalization and snap on scroll end
        scrollTimeout.current = setTimeout(() => {
            if (!containerRef.current) return;

            // Keep user in middle cycle (cycle 2)
            if (loop) {
                const currentCycle = Math.floor(centerIndex / baseLen);
                if (currentCycle !== 2) {
                    isProgrammaticScroll.current = true;
                    const normalizedCenter = 2 * baseLen + modIndex;
                    const normalizedTop = (normalizedCenter - HALF_VISIBLE) * ITEM_HEIGHT;
                    containerRef.current.scrollTop = normalizedTop;
                    setTimeout(() => {
                        isProgrammaticScroll.current = false;
                    }, 50);
                    return;
                }
            }

            // Smooth snap to exact line
            isProgrammaticScroll.current = true;
            const snapTop = (centerIndex - HALF_VISIBLE) * ITEM_HEIGHT;
            containerRef.current.scrollTo({
                top: snapTop,
                behavior: 'smooth'
            });
            setTimeout(() => {
                isProgrammaticScroll.current = false;
            }, 120);
        }, 120);
    };

    const onItemClick = (clickedIdx) => {
        if (!containerRef.current) return;
        const modIndex = ((clickedIdx % baseLen) + baseLen) % baseLen;
        onChange(items[modIndex]);
        isProgrammaticScroll.current = true;
        // Scroll so clicked item lands directly in the center row
        const targetTop = (clickedIdx - HALF_VISIBLE) * ITEM_HEIGHT;
        containerRef.current.scrollTo({
            top: targetTop,
            behavior: 'smooth'
        });
        setTimeout(() => {
            isProgrammaticScroll.current = false;
        }, 150);
    };

    const paddingY = HALF_VISIBLE * ITEM_HEIGHT;

    return (
        <div className="flex-1 flex flex-col items-center relative select-none">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="w-full overflow-y-auto no-scrollbar relative"
                style={{
                    height: `${ITEM_HEIGHT * VISIBLE_COUNT}px`,
                    scrollSnapType: 'y mandatory',
                    WebkitOverflowScrolling: 'touch'
                }}
            >
                {!loop && <div style={{ height: `${paddingY}px` }} />}

                {totalItems.map((item, idx) => {
                    const isSelected = item === value;
                    return (
                        <div
                            key={`${item}_${idx}`}
                            onClick={() => onItemClick(idx)}
                            className={`flex items-center justify-center cursor-pointer font-mono tabular-nums transition-all duration-150 ${
                                isSelected
                                    ? 'text-white font-bold text-3xl scale-105'
                                    : 'text-slate-300/40 font-medium text-xl scale-90 hover:text-slate-200'
                            }`}
                            style={{
                                height: `${ITEM_HEIGHT}px`,
                                scrollSnapAlign: 'center'
                            }}
                        >
                            {item}
                        </div>
                    );
                })}

                {!loop && <div style={{ height: `${paddingY}px` }} />}
            </div>
        </div>
    );
}

/**
 * iOS Action-Sheet Style Time Picker Modal
 * Rendered at the body root via React Portal to prevent CSS transform/clipping glitches
 */
export function IosTimePickerModal({ isOpen, initialTime = '08:00', title, onConfirm, onClose }) {
    const { t } = useTranslation();
    const [is24Hour, setIs24Hour] = useState(true);

    // Initial state parsing
    const parseInitial = (timeStr, mode24) => {
        const [hStr, mStr] = (timeStr || '08:00').split(':');
        const rawH = parseInt(hStr || '8', 10);
        const rawM = parseInt(mStr || '0', 10);
        const m = String(isNaN(rawM) ? 0 : rawM).padStart(2, '0');

        if (mode24) {
            const h = String(isNaN(rawH) ? 8 : rawH).padStart(2, '0');
            return { hour: h, minute: m, period: 'AM' };
        } else {
            const period = rawH >= 12 ? 'PM' : 'AM';
            const h12 = rawH % 12 || 12;
            return { hour: String(h12), minute: m, period };
        }
    };

    const [hour, setHour] = useState('08');
    const [minute, setMinute] = useState('00');
    const [period, setPeriod] = useState('AM');

    // Sync state on open
    useEffect(() => {
        if (isOpen) {
            const parsed = parseInitial(initialTime, is24Hour);
            setHour(parsed.hour);
            setMinute(parsed.minute);
            setPeriod(parsed.period);
        }
    }, [isOpen, initialTime, is24Hour]);

    if (!isOpen) return null;

    // Numerical lists
    const hours24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const periods = ['AM', 'PM'];

    const handleConfirm = () => {
        let finalH = 0;
        const m = minute;

        if (is24Hour) {
            finalH = parseInt(hour, 10);
        } else {
            const h12 = parseInt(hour, 10);
            finalH = h12 % 12;
            if (period === 'PM') finalH += 12;
        }

        const formatted = `${String(finalH).padStart(2, '0')}:${m}`;
        onConfirm(formatted);
        onClose();
    };

    const toggleMode = (mode24) => {
        if (mode24 === is24Hour) return;

        let currentTotalH = 0;
        if (is24Hour) {
            currentTotalH = parseInt(hour, 10);
        } else {
            const h12 = parseInt(hour, 10);
            currentTotalH = (h12 % 12) + (period === 'PM' ? 12 : 0);
        }

        setIs24Hour(mode24);

        if (mode24) {
            setHour(String(currentTotalH).padStart(2, '0'));
        } else {
            const p = currentTotalH >= 12 ? 'PM' : 'AM';
            const h12 = currentTotalH % 12 || 12;
            setHour(String(h12));
            setPeriod(p);
        }
    };

    const modalContent = (
        <div className="time-picker-overlay fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center items-center p-4 sm:pb-6">
            {/* Seamless Full-Viewport Backdrop Scrim */}
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/65 backdrop-blur-md transition-opacity duration-300 cursor-pointer"
            />

            {/* iOS Action Sheet Cards */}
            <div className="w-full max-w-[390px] mx-auto space-y-2.5 relative z-10 animate-in slide-in-from-bottom-8 duration-300">
                {/* Main Wheel Card */}
                <div className="theme-card overflow-hidden shadow-2xl flex flex-col">
                    {/* Header: Title + 24h/12h Switcher */}
                    <div className="px-5 pt-4 pb-2.5 flex items-center justify-between border-b border-white/5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            {title || t('select_time')}
                        </span>

                        {/* Format Switcher Pill */}
                        <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-[11px]">
                            <button
                                type="button"
                                onClick={() => toggleMode(true)}
                                className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                                    is24Hour ? 'bg-white/20 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                24h
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleMode(false)}
                                className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                                    !is24Hour ? 'bg-white/20 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                12h
                            </button>
                        </div>
                    </div>

                    {/* Wheel Picker Stage */}
                    <div className="relative py-2 px-4 flex items-center justify-center">
                        {/* Center Highlight Selection Lens */}
                        <div
                            className="absolute left-4 right-4 pointer-events-none rounded-xl"
                            style={{
                                height: `${ITEM_HEIGHT}px`,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 100%)',
                                border: '1px solid rgba(255, 255, 255, 0.18)',
                                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.25)'
                            }}
                        />

                        {/* 3D Optical Cylinder Mask */}
                        <div
                            className="w-full flex items-center justify-center relative z-10"
                            style={{
                                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 15%, black 32%, black 68%, rgba(0,0,0,0.5) 85%, transparent 100%)',
                                maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 15%, black 32%, black 68%, rgba(0,0,0,0.5) 85%, transparent 100%)'
                            }}
                        >
                            {/* Hours Column (Infinite Rolling Drum) */}
                            <WheelColumn
                                items={is24Hour ? hours24 : hours12}
                                value={hour}
                                onChange={setHour}
                                loop={true}
                            />

                            {/* Colon Separator */}
                            <div className="text-2xl font-bold text-white/50 px-2 select-none pointer-events-none">
                                :
                            </div>

                            {/* Minutes Column (Infinite Rolling Drum) */}
                            <WheelColumn
                                items={minutes}
                                value={minute}
                                onChange={setMinute}
                                loop={true}
                            />

                            {/* AM/PM Column (12h mode only, non-looping) */}
                            {!is24Hour && (
                                <WheelColumn
                                    items={periods}
                                    value={period}
                                    onChange={setPeriod}
                                    loop={false}
                                />
                            )}
                        </div>
                    </div>

                    {/* Confirm Button */}
                    <div className="border-t border-white/10">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="w-full py-3.5 text-center text-lg font-semibold text-blue-400 hover:text-blue-300 active:bg-white/5 transition-colors cursor-pointer"
                        >
                            {t('confirm')}
                        </button>
                    </div>
                </div>

                {/* Detached Cancel Button (iOS Action Sheet style) */}
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3.5 theme-card text-center text-lg font-semibold text-slate-300 hover:text-white active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                >
                    {t('cancel')}
                </button>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
