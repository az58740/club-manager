const DB_NAME = "setaregan-club-local";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const MAX_BACKUP_FILE_BYTES = 128 * 1024 * 1024;

let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not open local database."));
      request.onblocked = () => reject(new Error("Close other club app tabs to upgrade local storage."));
    }).catch((error) => {
      database = null;
      throw error;
    });
  }
  return database!;
}

export async function getLocalItem(key: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Could not read local data."));
  });
}

export async function setLocalItem(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save local data."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving local data was aborted."));
  });
}

export async function removeLocalItem(key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove local data."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Removing local data was aborted."));
  });
}

/**
 * Reads an IndexedDB value, migrating the matching legacy localStorage entry on
 * first access. localStorage remains a fallback only when IndexedDB is absent.
 */
export async function getLocalItemMigrating(key: string): Promise<string | null> {
  try {
    const stored = await getLocalItem(key);
    if (stored !== null) return stored;
    if (typeof localStorage === "undefined") return null;
    const legacy = localStorage.getItem(key);
    if (legacy === null) return null;
    await setLocalItem(key, legacy);
    localStorage.removeItem(key);
    return legacy;
  } catch (error) {
    if (typeof localStorage !== "undefined") {
      try {
        return localStorage.getItem(key);
      } catch {
        // Report the original storage failure below.
      }
    }
    throw error;
  }
}

export async function setLocalItemWithFallback(key: string, value: string): Promise<void> {
  try {
    await setLocalItem(key, value);
  } catch (error) {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        // Both stores are unavailable; keep the failure visible to the caller.
      }
    }
    throw error;
  }
}

/** Ask supported browsers not to evict the club database under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function isBackupFileSizeAllowed(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= MAX_BACKUP_FILE_BYTES;
}
