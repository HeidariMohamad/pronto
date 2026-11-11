import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayISO } from "../services/db";
import { calculateDailyStats } from "../services/stats";
import { queueSync } from "../services/sync";

const nextUpdatedAt = (record) => Math.max(Date.now(), Number(record?.updatedAt || 0) + 1);

export function useDailyRecord(dateStr = getTodayISO()) {
    const record = useLiveQuery(
        () => db.records.get(dateStr),
        [dateStr]
    );


    const settings = useLiveQuery(() => db.settings.get('v8'));
    const semester = useLiveQuery(async () => {
        const semesters = await db.semesters.toArray();
        return semesters.find(s => dateStr >= s.startDate && dateStr <= s.endDate);
    }, [dateStr]);

    // Fix date parsing for day of week to ensure it uses local components
    const [y, m, d] = dateStr.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    const dayOfWeek = localDate.getDay();

    const activeTargets = semester ? semester.targets : (settings?.targets || []);
    const tolerance = settings?.tolerance ? 10 : 0;
    const isToday = dateStr === getTodayISO();

    const stats = calculateDailyStats(
        record?.entries || [],
        activeTargets[dayOfWeek] || [],
        tolerance,
        isToday
    );

    const addEntry = async (time, type, photo = null) => {
        const id = Date.now().toString();
        await db.transaction('rw', db.records, async () => {
            const existing = await db.records.get(dateStr);
            if (existing) {
                await db.records.update(dateStr, {
                    entries: [...(existing.entries || []), { id, time, type, photo }],
                    updatedAt: nextUpdatedAt(existing)
                });
            } else {
                await db.records.add({ date: dateStr, entries: [{ id, time, type, photo }], note: '', updatedAt: Date.now() });
            }
        });
        queueSync('records', dateStr);
    };

    const updateEntry = async (id, field, value) => {
        await db.transaction('rw', db.records, async () => {
            const current = await db.records.get(dateStr);
            if (!current) return;
            const newEntries = (current.entries || []).map(e => e.id === id ? { ...e, [field]: value } : e);
            await db.records.update(dateStr, { entries: newEntries, updatedAt: nextUpdatedAt(current) });
        });
        queueSync('records', dateStr);
    };

    const deleteEntry = async (id) => {
        await db.transaction('rw', db.records, async () => {
            const current = await db.records.get(dateStr);
            if (!current) return;
            const newEntries = (current.entries || []).filter(e => e.id !== id);
            await db.records.update(dateStr, { entries: newEntries, updatedAt: nextUpdatedAt(current) });
        });
        queueSync('records', dateStr);
    };

    const updateNote = async (note) => {
        await db.transaction('rw', db.records, async () => {
            const existing = await db.records.get(dateStr);
            if (existing) {
                await db.records.update(dateStr, { note, updatedAt: nextUpdatedAt(existing) });
            } else {
                await db.records.add({ date: dateStr, entries: [], note, updatedAt: Date.now() });
            }
        });
        queueSync('records', dateStr);
    };

    return {
        record: record || { entries: [], note: '' },
        settings,
        stats,
        addEntry,
        updateEntry,
        deleteEntry,
        updateNote
    };
}
