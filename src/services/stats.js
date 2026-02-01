
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
 * @param {number} targetMinutes - Daily goal in minutes
 * @param {number} tolerance - Tolerance in minutes
 * @returns {Object} { worked: number, balance: number, prediction: number|null, isOpen: boolean }
 */
export const calculateDailyStats = (entries = [], targetMinutes = 0, tolerance = 0) => {
    let worked = 0;
    let lastIn = null;
    let isOpen = false;

    // Sort by time
    const sorted = [...entries].sort((a, b) => T2M(a.time) - T2M(b.time));

    sorted.forEach(e => {
        const m = T2M(e.time);
        // Match 'Entrada' (PT) or 'In' (EN)
        if (e.type.match(/entrada|in/i)) {
            lastIn = m;
            isOpen = true;
            // Match 'Saída' (PT), 'Saida', or 'Out' (EN)
        } else if (e.type.match(/saída|saida|out/i) && isOpen) {
            worked += (m - lastIn);
            isOpen = false;
        }
    });

    // If currently open (clocked in), add time until NOW
    let currentSession = 0;
    if (isOpen) {
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        // Only add if "now" is ostensibly today (simple check)
        // Ideally we check if the entry date is today, but for now we assume caller handles context
        currentSession = Math.max(0, nowM - lastIn);
    }

    const totalWorked = worked + currentSession;
    const effectiveTarget = Math.max(0, targetMinutes - tolerance);
    const balance = totalWorked - effectiveTarget;

    // Prediction: When can I leave to reach target?
    // Target = (Past Sessions) + (Future Session)
    // Target = worked + (ExitTime - lastIn)
    // ExitTime = Target - worked + lastIn
    let prediction = null;
    if (isOpen && targetMinutes > 0) {
        // We want to reach 'effectiveTarget' usually? Or full target? 
        // Prototype used: net = goal - tolerance
        // predictionTime = lastIn + (net - acc)
        // acc = worked (closed sessions)
        prediction = lastIn + (effectiveTarget - worked);
    }

    return {
        worked: totalWorked,
        balance,
        prediction, // in minutes
        isOpen
    };
};
