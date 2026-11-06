// Montage Lab — run markers and saved results. A marker is written when a long
// operation starts and cleared when it ends; if the page loads and finds a
// marker, the previous run was interrupted (tab killed, page reloaded, app
// switched and frozen). Own key only: never Match Clipper V1's storage.

export const LAB_STORAGE_KEY = "paircvision_internal_montage_lab_v1";

export interface RunMarker {
  op: string;
  startedAt: number;
  updatedAt: number;
  /** 0..1 */
  progress: number;
  detail: string;
}

export interface LabRecord {
  at: number;
  kind: string;
  summary: string;
  data: unknown;
}

interface LabStore {
  version: 1;
  active: RunMarker | null;
  records: LabRecord[];
}

const MAX_RECORDS = 60;

function read(): LabStore {
  try {
    const raw = window.localStorage.getItem(LAB_STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<LabStore>) : null;
    if (v && v.version === 1 && Array.isArray(v.records)) return { version: 1, active: v.active ?? null, records: v.records };
  } catch {
    /* unreadable → start fresh; this key is lab-only */
  }
  return { version: 1, active: null, records: [] };
}

function write(store: LabStore): void {
  try {
    window.localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full: lab results are best-effort */
  }
}

export function startRun(op: string, detail: string): void {
  const s = read();
  const now = Date.now();
  s.active = { op, startedAt: now, updatedAt: now, progress: 0, detail };
  write(s);
}

export function updateRun(progress: number, detail?: string): void {
  const s = read();
  if (!s.active) return;
  s.active.progress = progress;
  s.active.updatedAt = Date.now();
  if (detail) s.active.detail = detail;
  write(s);
}

export function endRun(): void {
  const s = read();
  s.active = null;
  write(s);
}

/** Cached per page load, so a remount (React StrictMode runs effects twice) sees the same answer. */
let interruptedThisLoad: RunMarker | null | undefined;

/** Test hook: forget the per-load cache (simulates a fresh page load). */
export function resetPageLoadForTests(): void {
  interruptedThisLoad = undefined;
}

/** On page load: returns the interrupted run (if any) and records it once. Idempotent within a page load. */
export function takeInterruptedRun(): RunMarker | null {
  if (interruptedThisLoad !== undefined) return interruptedThisLoad;
  interruptedThisLoad = takeFromStorage();
  return interruptedThisLoad;
}

function takeFromStorage(): RunMarker | null {
  const s = read();
  const m = s.active;
  if (!m) return null;
  s.active = null;
  s.records.unshift({
    at: Date.now(),
    kind: "interrupted",
    summary: `${m.op} was interrupted at ${Math.round(m.progress * 100)}% after ${Math.round((m.updatedAt - m.startedAt) / 1000)} s (${m.detail})`,
    data: m,
  });
  s.records = s.records.slice(0, MAX_RECORDS);
  write(s);
  return m;
}

export function addRecord(kind: string, summary: string, data: unknown): void {
  const s = read();
  s.records.unshift({ at: Date.now(), kind, summary, data });
  s.records = s.records.slice(0, MAX_RECORDS);
  write(s);
}

export function loadRecords(): LabRecord[] {
  return read().records;
}

export function clearRecords(): void {
  write({ version: 1, active: null, records: [] });
}
