// Time string (HH:MM) to Minutes
export const T2M = (t) => {
    if (!t || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Minutes to Time string (HH:MM or -HH:MM)
export const M2T = (m) => {
    const a = Math.abs(m);
    const h = Math.floor(a / 60);
    const min = a % 60;
    return `${m < 0 ? '-' : ''}${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

// Formats minutes into human-readable duration (e.g. 4h 54min or 35min)
export const formatDurationHM = (m) => {
    if (!m || m <= 0) return '0min';
    const a = Math.abs(m);
    const h = Math.floor(a / 60);
    const min = a % 60;
    if (h > 0) {
        return min > 0 ? `${h}h ${min}min` : `${h}h`;
    }
    return `${min}min`;
};

/**
 * Groups entries into sessions (Turnos) and breaks (Intervalos)
 * @param {Array} entries
 * @returns {Array} List of grouped sessions and intervals
 */
export const groupEntriesIntoSessions = (entries = []) => {
    const sorted = [...entries].sort((a, b) => T2M(a.time) - T2M(b.time));
    const items = [];
    
    let currentSession = null;
    let sessionNumber = 1;
    let lastExitTime = null;

    sorted.forEach((e) => {
        const isEntry = Boolean(e.type.match(/entrada|in|entrance|ورود/i));
        const isExit = Boolean(e.type.match(/saída|saida|out|exit|خروج/i));

        if (isEntry) {
            // Check if there was a previous session's exit to form an interval
            if (lastExitTime !== null) {
                let intervalM = T2M(e.time) - T2M(lastExitTime);
                if (intervalM < 0) intervalM += 1440;
                items.push({
                    type: 'interval',
                    id: `interval_${sessionNumber}_${e.id}`,
                    from: lastExitTime,
                    to: e.time,
                    durationMinutes: intervalM
                });
            }

            currentSession = {
                type: 'session',
                sessionNumber: sessionNumber++,
                inEntry: e,
                outEntry: null,
                durationMinutes: null
            };
            items.push(currentSession);
        } else if (isExit) {
            if (currentSession && !currentSession.outEntry) {
                currentSession.outEntry = e;
                let diff = T2M(e.time) - T2M(currentSession.inEntry?.time || '00:00');
                if (diff < 0) diff += 1440;
                currentSession.durationMinutes = diff;
                lastExitTime = e.time;
            } else {
                // Exit without an open entry
                currentSession = {
                    type: 'session',
                    sessionNumber: sessionNumber++,
                    inEntry: null,
                    outEntry: e,
                    durationMinutes: null
                };
                items.push(currentSession);
                lastExitTime = e.time;
            }
        }
    });

    return items;
};

/**
 * Calculates daily statistics and exit time suggestion
 * @param {Array} entries - List of entry objects {time, type}
 * @param {Array} targetSessions - List of session durations or range objects [{start, end}]
 * @param {number} tolerance - Tolerance in minutes (e.g. 10 or 0)
 * @param {boolean} isToday - Whether the date is today
 * @param {string} toleranceMode - 'entry' | 'exit'
 * @returns {Object} { worked, balance, prediction, isOpen, totalTarget, plannedShiftsCount, completedSessions }
 */
export const calculateDailyStats = (
    entries = [],
    targetSessions = [],
    tolerance = 0,
    isToday = false,
    toleranceMode = 'exit'
) => {
    // 1. Separate the planned schedule from actual punches
    const targets = Array.isArray(targetSessions) ? targetSessions : [targetSessions || 0];

    const plannedShifts = targets.map((sess) => {
        if (typeof sess === 'number') {
            return { duration: sess, start: null, end: null };
        }
        if (sess && sess.start && sess.end) {
            return {
                duration: Math.max(0, T2M(sess.end) - T2M(sess.start)),
                start: sess.start,
                end: sess.end
            };
        }
        return { duration: 0, start: null, end: null };
    }).filter(s => s.duration > 0);

    // 2. Calculate the day's planned total by summing the duration of all planned shifts
    const totalTarget = plannedShifts.reduce((acc, s) => acc + s.duration, 0);

    // 3. Process actual punches and calculate worked-so-far total
    const sorted = [...entries].sort((a, b) => T2M(a.time) - T2M(b.time));

    let worked = 0;
    let lastIn = null;
    let isOpen = false;
    let completedSessions = 0;

    sorted.forEach((e) => {
        const m = T2M(e.time);
        if (e.type.match(/entrada|in|entrance/i)) {
            lastIn = m;
            isOpen = true;
        } else if (e.type.match(/saída|saida|out|exit/i) && isOpen) {
            let exitM = m;
            if (exitM < lastIn) {
                exitM += 1440; // Crossed midnight
            }
            
            // Apply tolerance credit to completed shifts if enabled
            let sessionDuration = exitM - lastIn;
            if (tolerance > 0) {
                sessionDuration += tolerance;
            }

            worked += sessionDuration;
            isOpen = false;
            completedSessions++;
        }
    });

    // If currently open and today, add active session time
    let currentSessionWorked = 0;
    if (isOpen && isToday) {
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        currentSessionWorked = Math.max(0, nowM - lastIn);
    }

    const totalWorked = worked + currentSessionWorked;
    const balance = totalWorked - totalTarget;

    // 4. Calculate exit suggestion
    let prediction = null;

    if (isOpen && lastIn !== null) {
        const remainingDayTime = Math.max(0, totalTarget - worked);

        // Determine if current shift is the last planned shift of the day
        const isLastShift = plannedShifts.length <= 1 || completedSessions >= (plannedShifts.length - 1);

        if (isLastShift) {
            // 5. If the current shift is the last one of the day:
            // Completed shifts already include their tolerance credit in worked.
            prediction = lastIn + remainingDayTime;
        } else {
            // 6. If there is still another planned shift on the same day:
            // Use the planned duration of that specific shift - tolerance
            const currentPlannedShift = plannedShifts[completedSessions];
            const shiftDuration = currentPlannedShift ? currentPlannedShift.duration : (plannedShifts[0]?.duration || 0);
            const effectiveShiftDuration = Math.max(0, shiftDuration - tolerance);
            prediction = lastIn + effectiveShiftDuration;
        }
    }

    return {
        worked: totalWorked,
        balance,
        prediction, // in minutes
        isOpen,
        totalTarget,
        completedSessions,
        plannedShiftsCount: plannedShifts.length
    };
};
