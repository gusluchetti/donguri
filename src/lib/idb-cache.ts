const DB_NAME = "donguri";
const DB_VERSION = 2;
const STORE_NAME = "cache";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB budget

// Keys that should survive LRU eviction
const PROTECTED_KEYS = new Set(["trackedIds", "watchlist", "mediaStats"]);

export type CacheRecord<T = unknown> = {
  key: string;
  data: T;
  timestamp: number;
  sizeEstimate: number;
};

function estimateSize(data: unknown): number {
  try {
    return JSON.stringify(data).length * 2; // rough UTF-16 estimate
  } catch {
    return 0;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Drop legacy v1 "watchlist" store
      if (db.objectStoreNames.contains("watchlist")) {
        db.deleteObjectStore("watchlist");
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheGet<T>(key: string): Promise<{ data: T; timestamp: number } | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as CacheRecord<T> | undefined;
        if (record) {
          resolve({ data: record.data, timestamp: record.timestamp });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    const sizeEstimate = estimateSize(data);

    // Evict if over budget
    await evictIfNeeded(db, sizeEstimate);

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: CacheRecord<T> = {
        key,
        data,
        timestamp: Date.now(),
        sizeEstimate,
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail — cache is best-effort
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail
  }
}

export async function cacheClearAll(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail
  }
}

/**
 * Invalidate user-specific caches (keeps media detail cache since it's not user-specific).
 */
export async function invalidateUserCaches(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const key = cursor.key as string;
          if (
            key === "watchlist" ||
            key === "trackedIds" ||
            key.startsWith("catalog:") ||
            key.startsWith("entry:")
          ) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail
  }
}

export function isStale(timestamp: number, maxAgeMs: number): boolean {
  return Date.now() - timestamp > maxAgeMs;
}

/**
 * LRU eviction: if total stored size + incoming exceeds budget, delete oldest non-protected records.
 */
async function evictIfNeeded(db: IDBDatabase, incomingSize: number): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const allRequest = store.getAll();

    allRequest.onsuccess = () => {
      const records = allRequest.result as CacheRecord[];
      const totalSize = records.reduce((sum, r) => sum + r.sizeEstimate, 0);

      if (totalSize + incomingSize <= MAX_BYTES) {
        resolve();
        return;
      }

      // Sort evictable records by timestamp (oldest first)
      const evictable = records
        .filter((r) => !PROTECTED_KEYS.has(r.key))
        .sort((a, b) => a.timestamp - b.timestamp);

      let freed = 0;
      const target = totalSize + incomingSize - MAX_BYTES;
      for (const record of evictable) {
        if (freed >= target) break;
        store.delete(record.key);
        freed += record.sizeEstimate;
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
