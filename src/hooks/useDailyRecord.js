import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayISO } from "../services/db";
import { calculateDailyStats } from "../services/stats";

export function useDailyRecord(dateStr = getTodayISO()) {
    const record = useLiveQuery(
        () => db.records.get(dateStr),
        [dateStr]
    );

    const settings = useLiveQuery(() => db.settings.get('v8'));

    const stats = calculateDailyStats(
        record?.entries || [],
        settings ? settings.targets[new Date(dateStr).getDay()] : [],
        settings?.tolerance ? 10 : 0 // Toggle: If true => 10, else 0
    );

    const addEntry = async (time, type, photo = null) => {
        const id = Date.now().toString();
        await db.transaction('rw', db.records, async () => {
            const existing = await db.records.get(dateStr);
            if (existing) {
                await db.records.update(dateStr, {
                    entries: [...(existing.entries || []), { id, time, type, photo }]
                });
            } else {
                await db.records.add({ date: dateStr, entries: [{ id, time, type, photo }], note: '' });
            }
        });
    };

    const updateEntry = async (id, field, value) => {
        await db.transaction('rw', db.records, async () => {
            const current = await db.records.get(dateStr);
            if (!current) return;
            const newEntries = (current.entries || []).map(e => e.id === id ? { ...e, [field]: value } : e);
            await db.records.update(dateStr, { entries: newEntries });
        });
    };

    const deleteEntry = async (id) => {
        await db.transaction('rw', db.records, async () => {
            const current = await db.records.get(dateStr);
            if (!current) return;
            const newEntries = (current.entries || []).filter(e => e.id !== id);
            await db.records.update(dateStr, { entries: newEntries });
        });
    };

    const updateNote = async (note) => {
        await db.transaction('rw', db.records, async () => {
            const existing = await db.records.get(dateStr);
            if (existing) {
                await db.records.update(dateStr, { note });
            } else {
                await db.records.add({ date: dateStr, entries: [], note });
            }
        });
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
