
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

/**
 * Calculates daily statistics
 * @param {Array} entries - List of entry objects {time, type}
 * @param {Array} targetSessions - List of session durations in minutes (e.g. [240, 240])
 * @param {number} tolerance - Tolerance in minutes (fixed 10 if on, 0 if off, passed as value)
 * @param {boolean} isToday - Whether the date is today (affects live session)
 * @returns {Object} { worked: number, balance: number, prediction: number|null, isOpen: boolean, totalTarget: number }
 */
export const calculateDailyStats = (entries = [], targetSessions = [], tolerance = 0, isToday = false) => {
    let worked = 0;
    let lastIn = null;
    let isOpen = false;
    let completedSessions = 0;

    // Ensure targetSessions is an array
    const targets = Array.isArray(targetSessions) ? targetSessions : [targetSessions || 0];

    // Calculate total target from durations or time ranges
    const totalTarget = targets.reduce((acc, sess) => {
        if (typeof sess === 'number') return acc + sess;
        if (sess && sess.start && sess.end) {
            return acc + Math.max(0, T2M(sess.end) - T2M(sess.start));
        }
        return acc;
    }, 0);

    // Sort by time
    const sorted = [...entries].sort((a, b) => T2M(a.time) - T2M(b.time));

    sorted.forEach(e => {
        const m = T2M(e.time);
        if (e.type.match(/entrada|in|entrance/i)) {
            lastIn = m;
            isOpen = true;
        } else if (e.type.match(/saída|saida|out|exit/i) && isOpen) {
            let exitM = m;
            if (exitM < lastIn) {
                exitM += 1440; // Add 24 hours if crossed midnight
            }
            worked += (exitM - lastIn);
            isOpen = false;
            completedSessions++;
        }
    });

    // If currently open, add time until NOW *only if checking today*
    let currentSessionWorked = 0;
    if (isOpen && isToday) {
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        currentSessionWorked = Math.max(0, nowM - lastIn);
    }

    const totalWorked = worked + currentSessionWorked;
    const effectiveTarget = Math.max(0, totalTarget - tolerance);
    const balance = totalWorked - effectiveTarget;

    // Prediction: Goal is to reach Total Daily Target (Zero Balance)
    // Formula: Prediction = LastIn + (TotalTarget - WorkedSoFar)
    let prediction = null;
    if (isOpen) {
        let currentRemaining = Math.max(0, totalTarget - worked);

        // Find shifts that have start/end times
        const timeRanges = targets
            .filter(t => typeof t === 'object' && t.start && t.end)
            .sort((a, b) => T2M(a.start) - T2M(b.start));

        if (timeRanges.length > 0 && currentRemaining > 0) {
            let simulatedNow = lastIn;

            for (const shift of timeRanges) {
                const shiftStart = T2M(shift.start);
                const shiftEnd = T2M(shift.end);

                // If we already finished this shift's timeframe, skip it
                if (simulatedNow >= shiftEnd) continue;

                // If there's a gap before this shift starts, we "wait" until it starts
                if (simulatedNow < shiftStart) {
                    simulatedNow = shiftStart;
                }

                const capacity = shiftEnd - simulatedNow;
                if (capacity >= currentRemaining) {
                    prediction = simulatedNow + currentRemaining;
                    currentRemaining = 0;
                    break;
                } else {
                    currentRemaining -= capacity;
                    simulatedNow = shiftEnd;
                }
            }

            // If still remaining after all shifts, just add to the end
            if (currentRemaining > 0) {
                prediction = simulatedNow + currentRemaining;
            }
        } else if (currentRemaining > 0) {
            // Fallback for duration-only targets
            prediction = lastIn + currentRemaining;
        }
    }

    return {
        worked: totalWorked,
        balance,
        prediction, // in minutes
        isOpen,
        totalTarget
    };
};
// comments