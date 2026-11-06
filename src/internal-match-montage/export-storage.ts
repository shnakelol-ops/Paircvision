// Where montage exports are written while they are built: one dedicated OPFS
// (origin private file system) directory, so cleanup can never touch anything
// else. Match Clipper V1 uses no OPFS at all; the Montage Lab uses its own
// directory. Only the latest finished export is kept, and only for this visit:
// leftovers from earlier visits or interrupted runs are deleted on open.

export const EXPORT_DIR = "paircvision-montage-exports";
/** Marks a run in progress, so a run the phone killed is reported next time. */
export const EXPORT_RUN_KEY = "paircvision_internal_montage_export_run_v1";

type DirHandle = FileSystemDirectoryHandle & {
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

export function hasOpfs(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

export async function exportDir(): Promise<DirHandle> {
  const root = await navigator.storage.getDirectory();
  return (await root.getDirectoryHandle(EXPORT_DIR, { create: true })) as DirHandle;
}

export async function removeExportFile(name: string): Promise<void> {
  try {
    await (await exportDir()).removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** Deletes every export file except `keep`. Returns how many were removed. */
export async function cleanExportFiles(keep: string | null = null): Promise<number> {
  if (!hasOpfs()) return 0;
  let removed = 0;
  try {
    const dir = await exportDir();
    if (!dir.entries) return 0;
    const names: string[] = [];
    for await (const [name, handle] of dir.entries()) if (handle.kind === "file" && name !== keep) names.push(name);
    for (const name of names) {
      await removeExportFile(name);
      removed++;
    }
  } catch {
    /* storage unavailable: nothing to clean */
  }
  return removed;
}

export interface StorageRoom {
  quota: number | null;
  usage: number | null;
  /** quota − usage, when known. */
  free: number | null;
}

export async function storageRoom(): Promise<StorageRoom> {
  try {
    const e = await navigator.storage.estimate();
    const quota = e.quota ?? null, usage = e.usage ?? null;
    return { quota, usage, free: quota !== null && usage !== null ? Math.max(0, quota - usage) : null };
  } catch {
    return { quota: null, usage: null, free: null };
  }
}

export interface RunMarker {
  montageId: string;
  montageName: string;
  startedAt: number;
}

export function markRunStarted(m: RunMarker): void {
  try {
    window.localStorage.setItem(EXPORT_RUN_KEY, JSON.stringify(m));
  } catch {
    /* best effort */
  }
}

export function markRunEnded(): void {
  try {
    window.localStorage.removeItem(EXPORT_RUN_KEY);
  } catch {
    /* best effort */
  }
}

/** A run that was still marked as running when the page loaded: the page was closed or the phone stopped it. */
export function takeInterruptedRun(): RunMarker | null {
  try {
    const raw = window.localStorage.getItem(EXPORT_RUN_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(EXPORT_RUN_KEY);
    const m = JSON.parse(raw) as Partial<RunMarker>;
    return typeof m.montageId === "string" && typeof m.montageName === "string" && typeof m.startedAt === "number"
      ? { montageId: m.montageId, montageName: m.montageName, startedAt: m.startedAt }
      : null;
  } catch {
    return null;
  }
}
