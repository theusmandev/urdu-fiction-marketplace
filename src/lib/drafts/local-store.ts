/**
 * UNB Premium — Offline-Tolerant Local Drafts Store (IndexedDB)
 * 
 * Provides persistent, user-isolated storage for chapter drafts on the writer's device.
 * Keyed by client_key and strictly segregated by userId so no user's drafts
 * can ever be viewed or accessed by another user on the same browser profile.
 */

export interface LocalDraft {
  client_key: string;
  userId: string;
  novelId: string;
  chapterId: string | null;
  title: string;
  content: string;
  chapterNumber: number | null;
  localSeq: number; // increments on every save
  baseChapterUpdatedAt: string | null;
  serverRevision: number;
  lastSyncedSeq: number;
  lastSyncedAt: string | null;
  dirty: boolean;
  deviceLabel: string;
  updatedAt: string; // ISO string
}

const DB_NAME = 'unb_writer_drafts_v1';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

let dbInstancePromise: Promise<IDBDatabase> | null = null;

/**
 * Opens or initializes the IndexedDB database.
 */
export function openDraftsDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' && typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }

  // Use existing IDBFactory (supports window.indexedDB or polyfill / fake-indexeddb in tests)
  const idbFactory =
    typeof indexedDB !== 'undefined'
      ? indexedDB
      : (window as unknown as { indexedDB?: IDBFactory }).indexedDB;

  if (!idbFactory) {
    return Promise.reject(new Error('IndexedDB is not supported in this browser.'));
  }

  if (dbInstancePromise) {
    return dbInstancePromise;
  }

  dbInstancePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = idbFactory.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_key' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('userId_novelId', ['userId', 'novelId'], { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbInstancePromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbInstancePromise = null;
      reject(request.error || new Error('Failed to open drafts IndexedDB.'));
    };
  });

  return dbInstancePromise;
}

/**
 * Resets cached database connection (useful for unit tests).
 */
export function resetDraftsDB(): void {
  if (dbInstancePromise) {
    dbInstancePromise.then((db) => db.close()).catch(() => {});
    dbInstancePromise = null;
  }
}

/**
 * Generates a stable client_key for a chapter draft.
 * Guaranteed to be <= 64 characters and unique per (novel, chapter/slot).
 */
export function generateDraftClientKey(
  userId: string,
  novelId: string,
  chapterId: string | null,
  newSlot?: string
): string {
  const cleanNovel = novelId.replace(/-/g, '').slice(0, 12);
  if (chapterId) {
    const cleanChap = chapterId.replace(/-/g, '').slice(0, 16);
    return `c_${cleanNovel}_${cleanChap}`;
  }
  const cleanSlot = (newSlot || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
  return `new_${cleanNovel}_${cleanSlot}`;
}

/**
 * Generates a user-friendly device label (max 40 chars).
 */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Desktop';
  const ua = navigator.userAgent || '';
  let os = 'Device';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  const label = `${browser} on ${os}`;
  return label.slice(0, 40);
}

/**
 * Requests persistent storage from the browser (best-effort, non-blocking).
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

const memoryStorage = new Map<string, string>();

/**
 * Preference: "Remember drafts on this device"
 * Default is FALSE on first use (unpublished manuscripts are stored unencrypted on disk).
 */
export function getRememberDraftsOnDevice(userId: string): boolean {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(`unb_remember_drafts_${userId}`) === 'true';
    } catch {
      return false;
    }
  }
  return memoryStorage.get(`unb_remember_drafts_${userId}`) === 'true';
}

export function setRememberDraftsOnDevice(userId: string, remember: boolean): void {
  if (typeof localStorage !== 'undefined') {
    try {
      if (remember) {
        localStorage.setItem(`unb_remember_drafts_${userId}`, 'true');
      } else {
        localStorage.removeItem(`unb_remember_drafts_${userId}`);
      }
      return;
    } catch {
      // Fall through to memory fallback
    }
  }
  if (remember) {
    memoryStorage.set(`unb_remember_drafts_${userId}`, 'true');
  } else {
    memoryStorage.delete(`unb_remember_drafts_${userId}`);
  }
}

/**
 * Saves or updates a draft in IndexedDB.
 * Automatically increments localSeq unless explicitly passed.
 * Handles QuotaExceededError with a clear, user-friendly message.
 */
export async function saveLocalDraft(
  draft: Omit<LocalDraft, 'localSeq' | 'updatedAt' | 'dirty'> & {
    localSeq?: number;
    dirty?: boolean;
    updatedAt?: string;
  }
): Promise<LocalDraft> {
  const db = await openDraftsDB();

  // Retrieve existing record to increment localSeq accurately
  const existing = await getLocalDraft(draft.client_key, draft.userId);
  const nextSeq = draft.localSeq !== undefined ? draft.localSeq : (existing ? existing.localSeq + 1 : 1);
  const now = draft.updatedAt || new Date().toISOString();

  const recordToStore: LocalDraft = {
    client_key: draft.client_key,
    userId: draft.userId,
    novelId: draft.novelId,
    chapterId: draft.chapterId ?? null,
    title: draft.title,
    content: draft.content,
    chapterNumber: draft.chapterNumber ?? null,
    localSeq: nextSeq,
    baseChapterUpdatedAt: draft.baseChapterUpdatedAt ?? existing?.baseChapterUpdatedAt ?? null,
    serverRevision: draft.serverRevision ?? existing?.serverRevision ?? 1,
    lastSyncedSeq: draft.lastSyncedSeq ?? existing?.lastSyncedSeq ?? 0,
    lastSyncedAt: draft.lastSyncedAt ?? existing?.lastSyncedAt ?? null,
    dirty: draft.dirty !== undefined ? draft.dirty : true,
    deviceLabel: draft.deviceLabel || existing?.deviceLabel || getDeviceLabel(),
    updatedAt: now,
  };

  return new Promise<LocalDraft>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(recordToStore);

      req.onsuccess = () => resolve(recordToStore);
      req.onerror = () => {
        const err = req.error;
        if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          reject(
            new Error(
              'Storage quota exceeded on this device. Please free up space or save your work to the cloud.'
            )
          );
        } else {
          reject(err || new Error('Failed to save draft to IndexedDB.'));
        }
      };
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        reject(
          new Error(
            'Storage quota exceeded on this device. Please free up space or save your work to the cloud.'
          )
        );
      } else {
        reject(err);
      }
    }
  });
}

/**
 * Retrieves a draft by client_key.
 * Strictly verifies that the draft belongs to the requesting userId.
 * Returns null if no draft exists or if the draft belongs to another user.
 */
export async function getLocalDraft(
  clientKey: string,
  userId: string
): Promise<LocalDraft | null> {
  const db = await openDraftsDB();

  return new Promise<LocalDraft | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(clientKey);

    req.onsuccess = () => {
      const record = req.result as LocalDraft | undefined;
      if (!record) {
        resolve(null);
        return;
      }
      // Strict user isolation check
      if (record.userId !== userId) {
        resolve(null);
        return;
      }
      resolve(record);
    };

    req.onerror = () => reject(req.error || new Error('Failed to read draft from IndexedDB.'));
  });
}

/**
 * Lists all drafts for a specific novel belonging to userId.
 */
export async function listLocalDraftsForNovel(
  userId: string,
  novelId: string
): Promise<LocalDraft[]> {
  const db = await openDraftsDB();

  return new Promise<LocalDraft[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('userId_novelId');
    const req = index.getAll([userId, novelId]);

    req.onsuccess = () => {
      const records = (req.result as LocalDraft[]) || [];
      // Secondary filter ensuring user isolation
      const userDrafts = records.filter((r) => r.userId === userId);
      userDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(userDrafts);
    };

    req.onerror = () => reject(req.error || new Error('Failed to query drafts from IndexedDB.'));
  });
}

/**
 * Lists all drafts on this device belonging to userId.
 */
export async function listAllLocalDrafts(userId: string): Promise<LocalDraft[]> {
  const db = await openDraftsDB();

  return new Promise<LocalDraft[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('userId');
    const req = index.getAll(userId);

    req.onsuccess = () => {
      const records = (req.result as LocalDraft[]) || [];
      records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(records);
    };

    req.onerror = () => reject(req.error || new Error('Failed to query drafts from IndexedDB.'));
  });
}

/**
 * Deletes a draft from IndexedDB.
 * Enforces that only the owning user can delete their draft.
 */
export async function deleteLocalDraft(clientKey: string, userId: string): Promise<boolean> {
  const existing = await getLocalDraft(clientKey, userId);
  if (!existing) return false;

  const db = await openDraftsDB();
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(clientKey);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error('Failed to delete draft from IndexedDB.'));
  });
}

/**
 * Archives a draft under an alternative key (used when "Keep server version" is chosen
 * so local changes are NEVER lost).
 */
export async function archiveLocalDraftUnderDifferentKey(
  clientKey: string,
  userId: string
): Promise<string | null> {
  const existing = await getLocalDraft(clientKey, userId);
  if (!existing) return null;

  const archiveKey = `${clientKey}_arch_${Date.now()}`.slice(0, 64);
  const archivedRecord: LocalDraft = {
    ...existing,
    client_key: archiveKey,
    title: `${existing.title || 'Draft'} (Archived Conflict)`,
    dirty: false,
    updatedAt: new Date().toISOString(),
  };

  await saveLocalDraft(archivedRecord);
  return archiveKey;
}

/**
 * Clears all cleanly synced local drafts for a user on logout
 * if "Remember drafts on this device" is not enabled.
 */
export async function clearSyncedLocalDrafts(userId: string): Promise<number> {
  const drafts = await listAllLocalDrafts(userId);
  let clearedCount = 0;

  for (const draft of drafts) {
    if (!draft.dirty) {
      await deleteLocalDraft(draft.client_key, userId);
      clearedCount++;
    }
  }

  return clearedCount;
}
