import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db as firestore, auth } from "./firebase";
import { db as localDb } from "./db";

// Simple Sync Service
// 1. Listen to Local Changes -> Push to Firestore (Debounced?)
// 2. Listen to Firestore Changes -> Update Local

let unsubscribe = null;

export const startSync = (userId) => {
    if (!userId) return;

    // Listen to Firestore changes for *today* or recent days?
    // For simplicity PWA, let's just sync the *active* day or all changed days.
    // Real-time listener might be too expensive for all days.
    // Better approach:
    // - On Load: Pull "Settings" and "Recent Records"
    // - On Local Change: Push that specific record to Firestore.

    // 1. Sync Settings Down
    const settingsRef = doc(firestore, `artifacts/pronto-app-v8/users/${userId}/settings/v8`);
    onSnapshot(settingsRef, (snap) => {
        if (snap.exists()) {
            localDb.settings.put({ ...snap.data(), id: 'v8' });
        }
    });

    // 2. Sync Records (Up)
    // We can hook into Dexie middleware or just manually call sync in the UI hooks.
    // But strictly, we should probably watch for changes.
    // For this MVP, we will expose a `syncRecord(date)` function that the hook calls.
};

export const syncRecordUp = async (userId, dateStr, data) => {
    if (!userId || !navigator.onLine) return;
    try {
        const Ref = doc(firestore, `artifacts/pronto-app-v8/users/${userId}/records/${dateStr}`);
        await setDoc(Ref, data, { merge: true });
    } catch (e) {
        console.error("Sync failed", e);
    }
};

export const syncRecordDown = async (userId, dateStr) => {
    if (!userId || !navigator.onLine) return;
    try {
        const Ref = doc(firestore, `artifacts/pronto-app-v8/users/${userId}/records/${dateStr}`);
        const snap = await getDoc(Ref);
        if (snap.exists()) {
            localDb.records.put({ ...snap.data(), date: dateStr });
        }
    } catch (e) {
        console.error("Sync down failed", e);
    }
};
