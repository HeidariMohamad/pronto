
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
    let totalTarget = targets.reduce((acc, sess) => {
        if (typeof sess === 'number') return acc + sess;
        if (sess && sess.start && sess.end) {
            return acc + Math.max(0, T2M(sess.end) - T2M(sess.start));
        }
        return acc;
    }, 0);

    // FIX: If totalTarget is 0 but it's a weekday and targets are empty (maybe misconfig or past day), fallback to 0.
    // Actually, logic is better handled in useDailyRecord or db defaults.
    // But if we want to force it?
    // Let's assume if targets length is 0, it comes as 0.
    // The previous code: `const targets = Array.isArray(targetSessions) ? targetSessions : [targetSessions || 0];`

    // If targets is [0], totalTarget is 0. 
    // This is correct if it's a weekend.
    // We shouldn't force 8h here if not passed.


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

    // Prediction: Prioritize the CURRENT shift duration (Floating Shift)
    // Goal: Ensure the user works the full duration of the shift they are currently in.
    let prediction = null;
    if (isOpen) {
        let currentRemaining = Math.max(0, totalTarget - worked);

        // Find shifts that have start/end times
        const timeRanges = targets
            .filter(t => typeof t === 'object' && t.start && t.end)
            .sort((a, b) => T2M(a.start) - T2M(b.start));

        if (timeRanges.length > 0 && currentRemaining > 0) {
            // New Strategy: Floating Shift
            // Prioritize the DURATION of the current/next shift.
            // If user enters late, they should leave late to complete the full session.

            // Find the first shift that ends AFTER the current clock-in
            const matchedShift = timeRanges.find(s => T2M(s.end) > lastIn);

            if (matchedShift) {
                const duration = Math.max(0, T2M(matchedShift.end) - T2M(matchedShift.start));
                prediction = lastIn + duration;
            } else {
                // If we are past all configured shifts, just add the remaining target
                prediction = lastIn + currentRemaining;
            }
        } else if (currentRemaining > 0) {
            // Fallback for duration-only targets (no specific start/end times)
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