
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
 * @returns {Object} { worked: number, balance: number, prediction: number|null, isOpen: boolean }
 */
export const calculateDailyStats = (entries = [], targetSessions = [], tolerance = 0) => {
    let worked = 0;
    let lastIn = null;
    let isOpen = false;
    let completedSessions = 0;

    // Ensure targetSessions is an array (handle legacy data)
    const targets = Array.isArray(targetSessions) ? targetSessions : [targetSessions || 0];
    const totalTarget = targets.reduce((a, b) => a + b, 0);

    // Sort by time
    const sorted = [...entries].sort((a, b) => T2M(a.time) - T2M(b.time));

    sorted.forEach(e => {
        const m = T2M(e.time);
        if (e.type.match(/entrada|in|entrance/i)) {
            lastIn = m;
            isOpen = true;
        } else if (e.type.match(/saída|saida|out|exit/i) && isOpen) {
            worked += (m - lastIn);
            isOpen = false;
            completedSessions++;
        }
    });

    // If currently open, add time until NOW
    let currentSessionWorked = 0;
    if (isOpen) {
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        currentSessionWorked = Math.max(0, nowM - lastIn);
    }

    const totalWorked = worked + currentSessionWorked;
    const effectiveTarget = Math.max(0, totalTarget - tolerance);
    const balance = totalWorked - effectiveTarget;

    // Prediction: Based on CURRENT session target
    let prediction = null;
    if (isOpen) {
        // Current session index is 'completedSessions'
        // If we have more sessions than defined targets, fallback to the last defined target or 0
        const currentTarget = targets[completedSessions] || 0;

        // Prediction = lastIn + currentTarget
        // Note: Tolerance is usually applied to the FINAL balance, not per session. 
        // User requested "tolerance is fixed 10 minutes". Usually this implies everyday tolerance.
        // For prediction, we usually aim for the exact target of the session.
        if (currentTarget > 0) {
            prediction = lastIn + currentTarget;
        }
    }

    return {
        worked: totalWorked,
        balance,
        prediction, // in minutes
        isOpen
    };
};
