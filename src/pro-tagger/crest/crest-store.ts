// Club crest storage (Club Crest V1, Checkpoint 1).
//
// Crest images live ONLY here: one IndexedDB record per Saved Team, keyed by
// that team's existing id (SavedTeam.id in pro-tagger-team-storage.ts).
//
// Storage rules this module guarantees:
//  - It never reads or writes localStorage, so a crest operation can never
//    touch the Saved Teams store ("pitchflow_saved_squads_v1") or any match.
//  - Saving or replacing a crest is ONE put in ONE readwrite transaction. The
//    previous crest is only replaced when that transaction commits; a failed
//    or interrupted write (quota, abort, closed connection) leaves the
//    previous crest exactly as it was.
//  - Success is reported only on the transaction's `complete` event — never
//    on request success, which can still be followed by an abort at commit.
//  - Nothing here deletes a crest except removeClubCrest(), which the coach
//    triggers explicitly. Deleting a Saved Team does not delete its crest
//    (historical matches keep their crest), and there is no automatic
//    cleanup of any kind.
//  - If IndexedDB is missing or broken, reads resolve to null (the monogram
//    stays) and writes reject with a clear reason; nothing else in the app
//    depends on this store.

export const CLUB_CRESTS_DB_NAME = "paircvision-club-crests";
const CLUB_CRESTS_DB_VERSION = 1;
const CLUB_CRESTS_STORE_NAME = "crests";
/** An open that neither succeeds nor fails within this time is treated as unavailable. */
const OPEN_TIMEOUT_MS = 5000;

export type ClubCrestRecord = {
  v: 1;
  /** The Saved Team id this crest belongs to (also the IndexedDB key). */
  teamId: string;
  /** The crest that is displayed: PNG, at most 512 px on its longest edge. */
  image: Blob;
  /** The artwork before background removal — present only when removal was applied. */
  original?: Blob;
  /** Pixel size of `image`. */
  width: number;
  height: number;
  backgroundRemoved: boolean;
  /** True when the artwork is too dark to stand out on the dark analysis background on its own. */
  needsBacking: boolean;
  /** The Saved Team's name when the crest was saved — for identification only, never for lookup. */
  teamName: string;
  updatedAt: number;
};

export type ClubCrestInput = Omit<ClubCrestRecord, "v" | "updatedAt">;

export type CrestStoreFailure = "quota" | "unavailable";

export class CrestStoreError extends Error {
  readonly reason: CrestStoreFailure;
  constructor(reason: CrestStoreFailure, message: string) {
    super(message);
    this.name = "CrestStoreError";
    this.reason = reason;
  }
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Shape check for anything read back from the database. */
export function isClubCrestRecord(value: unknown): value is ClubCrestRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    r.v === 1 &&
    typeof r.teamId === "string" &&
    r.teamId.length > 0 &&
    r.image instanceof Blob &&
    r.image.size > 0 &&
    (r.original === undefined || r.original instanceof Blob) &&
    isPositiveInt(r.width) &&
    isPositiveInt(r.height) &&
    typeof r.backgroundRemoved === "boolean" &&
    typeof r.needsBacking === "boolean" &&
    typeof r.teamName === "string" &&
    typeof r.updatedAt === "number"
  );
}

// ── Backend ──────────────────────────────────────────────────────────────

/** Minimal key/value seam — IndexedDB in the app, a fake in tests. */
export interface CrestBackend {
  put(teamId: string, record: ClubCrestRecord): Promise<void>;
  get(teamId: string): Promise<unknown>;
  delete(teamId: string): Promise<void>;
}

function isQuotaError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    ((err as { name: unknown }).name === "QuotaExceededError" || (err as { name: unknown }).name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

// Resolves only once the transaction commits (oncomplete).
function runInTransaction<T>(tx: IDBTransaction, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>;
    try {
      request = run(tx.objectStore(CLUB_CRESTS_STORE_NAME));
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Crest transaction aborted"));
    tx.onerror = () => reject(tx.error ?? request.error ?? new Error("Crest transaction failed"));
  });
}

/**
 * IndexedDB-backed crest store, following the hardened connection handling of
 * the kit image store (internal-team-sheet/team-sheet-kit-store.ts):
 * one cached connection, dropped on versionchange / close; a transaction on a
 * dead connection is retried once on a fresh one; a blocked, failed or hung
 * open rejects and is never cached.
 */
export function createIndexedDbCrestBackend(getFactory: () => IDBFactory | undefined = defaultFactory): CrestBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function forget(promise: Promise<IDBDatabase>) {
    if (dbPromise === promise) dbPromise = null;
  }

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Crest database did not open"));
      }, OPEN_TIMEOUT_MS);
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      let request: IDBOpenDBRequest;
      try {
        const factory = getFactory();
        if (!factory) throw new Error("IndexedDB is not available");
        request = factory.open(CLUB_CRESTS_DB_NAME, CLUB_CRESTS_DB_VERSION);
      } catch (err) {
        fail(err);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CLUB_CRESTS_STORE_NAME)) db.createObjectStore(CLUB_CRESTS_STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          // Timed out or blocked earlier: never leak a late connection.
          db.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        db.onversionchange = () => {
          db.close();
          forget(opening);
        };
        db.onclose = () => forget(opening);
        resolve(db);
      };
      request.onerror = () => fail(request.error ?? new Error("Failed to open crest database"));
      request.onblocked = () => fail(new Error("Crest database is blocked by another open tab"));
    });
    dbPromise = opening;
    opening.catch(() => forget(opening));
    return opening;
  }

  async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const promise = openDb();
      const db = await promise;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(CLUB_CRESTS_STORE_NAME, mode);
      } catch (err) {
        // InvalidStateError: the connection closed without telling us.
        forget(promise);
        if (attempt === 0) continue;
        throw err;
      }
      return runInTransaction(tx, run);
    }
  }

  return {
    async put(teamId, record) {
      await withStore("readwrite", (s) => s.put(record, teamId));
    },
    get(teamId) {
      return withStore<unknown>("readonly", (s) => s.get(teamId));
    },
    async delete(teamId) {
      await withStore("readwrite", (s) => s.delete(teamId));
    },
  };
}

function defaultFactory(): IDBFactory | undefined {
  // Accessing indexedDB can itself throw (some private / locked-down modes).
  try {
    return typeof window !== "undefined" ? window.indexedDB ?? undefined : undefined;
  } catch {
    return undefined;
  }
}

/** True when this browser exposes IndexedDB at all. A true result does not guarantee writes succeed. */
export function isCrestStorageSupported(getFactory: () => IDBFactory | undefined = defaultFactory): boolean {
  return Boolean(getFactory());
}

let defaultBackend: CrestBackend | null = null;
export function getDefaultCrestBackend(): CrestBackend {
  if (!defaultBackend) defaultBackend = createIndexedDbCrestBackend();
  return defaultBackend;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Saves (or replaces) a team's crest. Resolves only after the IndexedDB
 * transaction has committed. On any failure it rejects with a
 * CrestStoreError, and the team's previous crest — if any — is untouched.
 */
export async function saveClubCrest(
  input: ClubCrestInput,
  backend: CrestBackend = getDefaultCrestBackend(),
  now: () => number = Date.now,
): Promise<ClubCrestRecord> {
  const record: ClubCrestRecord = { v: 1, ...input, updatedAt: now() };
  if (record.original === undefined) delete record.original;
  if (!isClubCrestRecord(record)) {
    throw new CrestStoreError("unavailable", "This crest image is not valid.");
  }
  try {
    await backend.put(record.teamId, record);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new CrestStoreError("quota", "This device is out of storage space. The previous crest has been kept.");
    }
    throw new CrestStoreError("unavailable", "Couldn't save the crest on this device. The previous crest has been kept.");
  }
  return record;
}

/** The team's crest, or null when there is none, it is unreadable, or storage is unavailable. Never throws. */
export async function loadClubCrest(teamId: string, backend: CrestBackend = getDefaultCrestBackend()): Promise<ClubCrestRecord | null> {
  if (!teamId) return null;
  try {
    const value = await backend.get(teamId);
    return isClubCrestRecord(value) && value.teamId === teamId ? value : null;
  } catch {
    return null;
  }
}

/**
 * Explicit, coach-initiated removal. This is the only code path that deletes
 * a crest. Rejects with a CrestStoreError when the delete did not commit (the
 * crest is then still stored).
 */
export async function removeClubCrest(teamId: string, backend: CrestBackend = getDefaultCrestBackend()): Promise<void> {
  try {
    await backend.delete(teamId);
  } catch {
    throw new CrestStoreError("unavailable", "Couldn't remove the crest on this device. It is still saved.");
  }
}
