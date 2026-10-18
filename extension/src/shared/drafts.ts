import type { Draft } from "./types";

// Drafts hold screenshots and recordings, which are too big for chrome.storage, so they live in IndexedDB.
const DB = "uptrack";
const STORE = "drafts";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveDraft = (draft: Draft) => run("readwrite", (s) => s.put(draft));
export const getDraft = (id: string) => run<Draft | undefined>("readonly", (s) => s.get(id));
export const deleteDraft = (id: string) => run("readwrite", (s) => s.delete(id));

/** Drops drafts nobody reported within a day, so abandoned recordings don't pile up. */
export async function deleteOldDrafts(): Promise<void> {
  const all = await run<Draft[]>("readonly", (s) => s.getAll());
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const d of all) if (d.createdAt < cutoff) await deleteDraft(d.id);
}
