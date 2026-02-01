import Dexie from 'dexie';

export const db = new Dexie('ProntoDB');

db.version(1).stores({
    records: 'date, note', // 'date' is the primary key (YYYY-MM-DD)
    settings: 'id', // Singleton setting with id='v8'
    pending_sync: '++id, collection, docId, action, data' // Queue for sync
});

// Helper to get today's ISO string (YYYY-MM-DD)
export const getTodayISO = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
};

// Default Settings
export const DEFAULT_SETTINGS = {
    id: 'v8',
    theme: 'default',
    language: 'pt',
    tolerance: 10,
    notify: false,
    targets: [0, 480, 480, 480, 480, 480, 0] // Sun=0, Mon-Fri=8h, Sat=0
};

// Initialize settings if empty
db.on('populate', () => {
    db.settings.add(DEFAULT_SETTINGS);
});
