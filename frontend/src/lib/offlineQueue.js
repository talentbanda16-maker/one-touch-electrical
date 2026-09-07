import { api } from "../api";

const DB_NAME = "onetouch-offline";
const STORE_NAME = "pending-reports";
const MAX_ATTEMPTS = 5;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "submissionId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function readAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function put(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(submissionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(submissionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// fetch() rejects with a TypeError ("Failed to fetch" / "NetworkError...")
// when the request can't even reach the network — that's the signal we
// use to tell "you're offline" apart from "the server rejected this."
function isNetworkFailure(err) {
  return !navigator.onLine || err instanceof TypeError;
}

const listeners = new Set();
function notify() {
  readAll().then((reports) => listeners.forEach((cb) => cb(reports)));
}

export function subscribeToQueue(callback) {
  listeners.add(callback);
  readAll().then(callback);
  return () => listeners.delete(callback);
}

export async function getPendingReports() {
  return readAll();
}

// Queues a report submission that couldn't reach the server. `photos` are
// raw File objects — IndexedDB can store Blobs directly via structured
// clone, so no base64 encoding needed.
export async function queueReport({ label, endpoint, payload, photos = [] }) {
  const record = {
    submissionId: payload.submissionId,
    label,
    endpoint,
    payload,
    photos,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await put(record);
  notify();
  return record;
}

export async function discardPending(submissionId) {
  await remove(submissionId);
  notify();
}

async function uploadPhoto(reportId, file) {
  const formData = new FormData();
  formData.append("photo", file);
  await api.upload(`/reports/${reportId}/attachments`, formData);
}

let syncing = false;

// Retries every queued report in order. A record that fails because we're
// still offline is left completely untouched (no attempts++, so sitting
// offline for hours doesn't get it marked "failed"). A record that fails
// for any other reason gets an attempt counted; after MAX_ATTEMPTS it's
// left in the queue flagged as failed rather than retried forever.
export async function syncPendingReports() {
  if (syncing) return;
  syncing = true;
  try {
    const records = await readAll();
    for (const record of records) {
      if (record.attempts >= MAX_ATTEMPTS) continue;
      try {
        const report = await api.post(record.endpoint, record.payload);
        for (const file of record.photos) {
          try {
            await uploadPhoto(report.id, file);
          } catch {
            // Same as the online path: a photo failure doesn't lose the report.
          }
        }
        await remove(record.submissionId);
      } catch (err) {
        if (isNetworkFailure(err)) {
          break; // still offline — stop for now, the rest will keep waiting too
        }
        await put({ ...record, attempts: record.attempts + 1, lastError: err.message || "Sync failed" });
      }
    }
  } finally {
    syncing = false;
    notify();
  }
}

export { isNetworkFailure };

export function initOfflineSync() {
  window.addEventListener("online", syncPendingReports);
  if (navigator.onLine) syncPendingReports();
}
