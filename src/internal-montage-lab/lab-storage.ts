// Montage Lab — OPFS (origin private file system) probes. Everything lives in
// one lab-only directory, so cleanup can never touch anything else. Match
// Clipper V1 does not use OPFS at all.

export const LAB_DIR = "paircvision-montage-lab";

type DirHandle = FileSystemDirectoryHandle & {
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

export function hasOpfs(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

export async function labDir(): Promise<DirHandle> {
  const root = await navigator.storage.getDirectory();
  return (await root.getDirectoryHandle(LAB_DIR, { create: true })) as DirHandle;
}

export interface LabFile {
  name: string;
  bytes: number;
  lastModified: number;
}

export async function listLabFiles(): Promise<LabFile[]> {
  const dir = await labDir();
  const out: LabFile[] = [];
  if (!dir.entries) return out;
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file") continue;
    try {
      const f = await (handle as FileSystemFileHandle).getFile();
      out.push({ name, bytes: f.size, lastModified: f.lastModified });
    } catch {
      out.push({ name, bytes: -1, lastModified: 0 });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeLabFile(name: string): Promise<void> {
  try {
    await (await labDir()).removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** Deletes every lab file (never anything outside the lab directory). */
export async function clearLabFiles(): Promise<LabFile[]> {
  const files = await listLabFiles();
  for (const f of files) await removeLabFile(f.name);
  return files;
}

export async function storageEstimate(): Promise<{ quota: number | null; usage: number | null }> {
  try {
    const e = await navigator.storage.estimate();
    return { quota: e.quota ?? null, usage: e.usage ?? null };
  } catch {
    return { quota: null, usage: null };
  }
}

export interface WriteProbeResult {
  targetBytes: number;
  wroteBytes: number;
  /** Error that stopped the write, e.g. "QuotaExceededError". */
  error: string | null;
  writeMBps: number | null;
  /** Time for close() to commit. Proportional to size ⇒ the browser copies the data on commit. */
  closeMs: number | null;
  readMBps: number | null;
  readBackOk: boolean | null;
  quota: number | null;
  usageBefore: number | null;
  /** Usage while the write stream is open (half way) — shows whether a temporary swap copy is counted. */
  usageMidWrite: number | null;
  usageAfterClose: number | null;
}

/**
 * Writes `targetBytes` to one OPFS file in fixed-size chunks (the same buffer
 * reused, so the page holds only one chunk in memory), closes it, reads it all
 * back, then deletes it. With a huge target it becomes a headroom probe: it
 * stops at the first failure and reports how much was actually writable.
 */
export async function writeProbe(
  targetBytes: number,
  opts: { chunkBytes?: number; signal?: AbortSignal; onProgress?: (written: number) => void } = {},
): Promise<WriteProbeResult> {
  const chunkBytes = opts.chunkBytes ?? 8 * 1024 * 1024;
  const dir = await labDir();
  const name = `write-probe-${Date.now()}.bin`;
  const est0 = await storageEstimate();
  const result: WriteProbeResult = {
    targetBytes, wroteBytes: 0, error: null, writeMBps: null, closeMs: null, readMBps: null, readBackOk: null,
    quota: est0.quota, usageBefore: est0.usage, usageMidWrite: null, usageAfterClose: null,
  };
  const chunk = new Uint8Array(chunkBytes);
  for (let i = 0; i < chunk.length; i += 4096) chunk[i] = (i / 4096) & 0xff;
  let ws: FileSystemWritableFileStream | null = null;
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    ws = await handle.createWritable();
    const t0 = performance.now();
    let sampledMid = false;
    while (result.wroteBytes < targetBytes) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const n = Math.min(chunkBytes, targetBytes - result.wroteBytes);
      await ws.write(n === chunkBytes ? chunk : chunk.subarray(0, n));
      result.wroteBytes += n;
      opts.onProgress?.(result.wroteBytes);
      if (!sampledMid && result.wroteBytes >= targetBytes / 2) {
        sampledMid = true;
        result.usageMidWrite = (await storageEstimate()).usage;
      }
    }
    const tw = performance.now();
    result.writeMBps = result.wroteBytes / 1e6 / ((tw - t0) / 1000);
    await ws.close();
    ws = null;
    result.closeMs = Math.round(performance.now() - tw);
    result.usageAfterClose = (await storageEstimate()).usage;

    // Read back by streaming (never the whole file in memory) and spot-check the pattern.
    const file = await handle.getFile();
    const tr = performance.now();
    const reader = file.stream().getReader();
    let read = 0;
    let ok = file.size === result.wroteBytes;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (read % chunkBytes === 0 && value.length > 4096) ok = ok && value[4096] === 1;
      read += value.length;
    }
    result.readMBps = read / 1e6 / ((performance.now() - tr) / 1000);
    result.readBackOk = ok && read === result.wroteBytes;
  } catch (err) {
    result.error = err instanceof DOMException || err instanceof Error ? err.name : String(err);
    if (ws) await ws.abort().catch(() => undefined);
  } finally {
    await removeLabFile(name);
  }
  return result;
}
