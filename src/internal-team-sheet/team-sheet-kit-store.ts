import type { KitRole, TeamSheetKit } from "./team-sheet-kits";

// Storage for future user-uploaded kits. Split in two on purpose:
//
//  - Metadata (id, team, name, role) is a plain JSON array under its own
//    localStorage key. It is small, readable synchronously on first render,
//    and already matches the backup system's "json-array" domain kind
//    (src/backup/backup-domains.ts), so it can be added to backups later by
//    one descriptor entry.
//  - The image itself is a Blob in IndexedDB keyed by the kit id — never a
//    data URL in localStorage, which would blow the ~5MB quota after a few
//    kits. Backing images up later needs a blob encoder in backup-build.ts
//    (the same gap voice-note audio already has).
//
// Like team-sheet-storage.ts, these keys are deliberately separate from any
// Event Stats storage.
export const TEAM_SHEET_KITS_STORAGE_KEY = "paircvision_internal_team_sheet_kits_v1";
export const TEAM_SHEET_KIT_IMAGES_DB_NAME = "paircvision-internal-team-sheet-kits";
const KIT_IMAGES_DB_VERSION = 1;
const KIT_IMAGES_STORE_NAME = "kit-images";

export interface UserKitRecord {
  id: string;
  teamId: string;
  name: string;
  role: KitRole;
  createdAt: number;
}

function isUserKitRecord(value: unknown): value is UserKitRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.startsWith("user:") &&
    typeof v.teamId === "string" &&
    typeof v.name === "string" &&
    (v.role === "outfield" || v.role === "gk") &&
    typeof v.createdAt === "number"
  );
}

export function loadUserKitRecords(): UserKitRecord[] {
  try {
    const raw = window.localStorage.getItem(TEAM_SHEET_KITS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUserKitRecord) : [];
  } catch {
    return [];
  }
}

function saveUserKitRecords(records: UserKitRecord[]): boolean {
  try {
    window.localStorage.setItem(TEAM_SHEET_KITS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function userKitRecordToKit(record: UserKitRecord): TeamSheetKit {
  return { id: record.id, teamId: record.teamId, name: record.name, role: record.role, source: "user" };
}

// ── Image blobs ────────────────────────────────────────────────────────────

/** Minimal blob key/value store — IndexedDB in the app, in-memory in tests. */
export interface KitImageBackend {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function createIndexedDbKitImageBackend(): KitImageBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open(TEAM_SHEET_KIT_IMAGES_DB_NAME, KIT_IMAGES_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(KIT_IMAGES_STORE_NAME)) db.createObjectStore(KIT_IMAGES_STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          dbPromise = null;
          reject(request.error ?? new Error("Failed to open kit image database"));
        };
      });
    }
    return dbPromise;
  }
  async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return requestToPromise(run(db.transaction(KIT_IMAGES_STORE_NAME, mode).objectStore(KIT_IMAGES_STORE_NAME)));
  }
  return {
    async put(id, blob) {
      await withStore("readwrite", (s) => s.put(blob, id));
    },
    async get(id) {
      const result = await withStore<unknown>("readonly", (s) => s.get(id));
      return result instanceof Blob ? result : null;
    },
    async delete(id) {
      await withStore("readwrite", (s) => s.delete(id));
    },
  };
}

export function createMemoryKitImageBackend(): KitImageBackend {
  const blobs = new Map<string, Blob>();
  return {
    async put(id, blob) {
      blobs.set(id, blob);
    },
    async get(id) {
      return blobs.get(id) ?? null;
    },
    async delete(id) {
      blobs.delete(id);
    },
  };
}

let defaultBackend: KitImageBackend | null = null;
function getDefaultBackend(): KitImageBackend {
  if (!defaultBackend) defaultBackend = createIndexedDbKitImageBackend();
  return defaultBackend;
}

function newUserKitId(): string {
  const c = globalThis.crypto;
  const suffix =
    c && typeof c.randomUUID === "function" ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `user:${suffix}`;
}

// ── Public API (used by the Kit Builder in a later PR) ───────────────────────

/** Stores the image first, then the metadata — a kit is never listed without its image. */
export async function saveUserKit(
  input: { teamId: string; name: string; role: KitRole; image: Blob },
  backend: KitImageBackend = getDefaultBackend(),
): Promise<UserKitRecord> {
  const record: UserKitRecord = {
    id: newUserKitId(),
    teamId: input.teamId,
    name: input.name.trim() || "Kit",
    role: input.role,
    createdAt: Date.now(),
  };
  await backend.put(record.id, input.image);
  if (!saveUserKitRecords([...loadUserKitRecords(), record])) {
    await backend.delete(record.id);
    throw new Error("Couldn't save the kit on this device.");
  }
  return record;
}

/** Removes the metadata first, then the image — a listed kit always has an image. */
export async function deleteUserKit(id: string, backend: KitImageBackend = getDefaultBackend()): Promise<void> {
  saveUserKitRecords(loadUserKitRecords().filter((r) => r.id !== id));
  await backend.delete(id);
}

export function loadUserKitImage(id: string, backend: KitImageBackend = getDefaultBackend()): Promise<Blob | null> {
  return backend.get(id).catch(() => null);
}
