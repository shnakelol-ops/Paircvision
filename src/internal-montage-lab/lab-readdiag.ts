// Montage Lab — source-read diagnostics (DIAGNOSTIC ONLY, throwaway branch).
//
// Samsung Brave runs fail with NotReadableError after ~60–80 s of reading the
// selected match file, at a different byte offset each time, and afterwards
// even byte 0 can't be read. This module measures *why*:
//  - every source read is tracked (count, bytes, timing, last good read);
//  - on the first failure, the file is re-read at start / middle / end and at
//    the failed range immediately, after 2 s and after 10 s (transient vs
//    permanent, whole file vs one region);
//  - a read-only soak reads the file for minutes with no decoding or encoding,
//    optionally while a synthetic 720p encode runs (memory/CPU pressure with
//    no extra file reads), to separate "long reading" from "encoding pressure";
//  - page lifecycle (visibility, freeze/resume, pagehide) is logged with times.
//
// Reads go through V1's unchanged readFileRange (slice reads, one retry).

import { readFileRange, newReadStats, type ReadFailure, type ReadStats } from "../internal-match-clipper/file-source";
import { jsHeapMB } from "./lab-memory";

type Mediabunny = typeof import("mediabunny");

const PROBE_BYTES = 64 * 1024;

/** What the File object said about itself when it was picked. */
export interface FileSnapshot {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  /** "12345.mp4" — how Android's Photo Picker names files (a media id), not the real file name. */
  looksLikeAndroidMediaId: boolean;
  pickedAt: number;
}

export function snapshotFile(file: File, now = performance.now()): FileSnapshot {
  return {
    name: file.name, size: file.size, type: file.type, lastModified: file.lastModified,
    looksLikeAndroidMediaId: /^\d+\.[a-z0-9]+$/i.test(file.name), pickedAt: now,
  };
}

export interface ReadEvent {
  t: number;
  kind: "ok" | "fail";
  start: number;
  end: number;
  ms: number;
}

/** Tracks every source read; the first failure triggers `onFirstFailure`. */
export class ReadTracker {
  reads = 0;
  bytes = 0;
  slowReads = 0;
  maxReadMs = 0;
  firstReadAt: number | null = null;
  lastOk: ReadEvent | null = null;
  failure: (ReadFailure & { t: number }) | null = null;
  /** The last 20 reads before (and including) the failure. */
  recent: ReadEvent[] = [];
  onFirstFailure: ((f: ReadFailure & { t: number }) => void) | null = null;
  private now: () => number;
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }
  ok(start: number, end: number, ms: number): void {
    const t = this.now();
    this.firstReadAt ??= t - ms;
    this.reads++;
    this.bytes += end - start;
    if (ms > 1000) this.slowReads++;
    this.maxReadMs = Math.max(this.maxReadMs, ms);
    this.lastOk = { t, kind: "ok", start, end, ms };
    this.push(this.lastOk);
  }
  fail(f: ReadFailure, ms: number): void {
    const t = this.now();
    this.push({ t, kind: "fail", start: f.start, end: f.end, ms });
    if (this.failure) return;
    this.failure = { ...f, t };
    this.onFirstFailure?.(this.failure);
  }
  private push(e: ReadEvent) {
    this.recent.push(e);
    if (this.recent.length > 20) this.recent.shift();
  }
}

/** Reads through V1's readFileRange and records the outcome of each read. */
export async function trackedRead(file: Blob, start: number, end: number, stats: ReadStats, tracker: ReadTracker): Promise<Uint8Array> {
  const t0 = performance.now();
  try {
    const data = await readFileRange(file, start, end, stats);
    tracker.ok(start, end, performance.now() - t0);
    return data;
  } catch (err) {
    const f: ReadFailure = stats.failure ?? { name: errName(err), message: String(err), start, end, retried: true };
    tracker.fail(f, performance.now() - t0);
    throw err;
  }
}

/** V1's StreamSource settings, with every read tracked. */
export function createTrackedFileSource(mb: Mediabunny, file: Blob, stats: ReadStats, tracker: ReadTracker) {
  return new mb.StreamSource({
    getSize: () => file.size,
    read: (start, end) => trackedRead(file, start, end, stats, tracker),
    prefetchProfile: "network",
    maxCacheSize: 16 * 1024 * 1024,
  });
}

export interface AccessProbe {
  where: "start" | "middle" | "end" | "failed range";
  offset: number;
  ok: boolean;
  ms: number;
  error: string | null;
}

/** One slice read at start, middle, end (and the failed range), no retries. */
export async function probeAccess(file: Blob, failed?: { start: number; end: number }): Promise<AccessProbe[]> {
  const spots: [AccessProbe["where"], number, number][] = [
    ["start", 0, PROBE_BYTES],
    ["middle", Math.max(0, Math.floor(file.size / 2) - PROBE_BYTES / 2), PROBE_BYTES],
    ["end", Math.max(0, file.size - PROBE_BYTES), PROBE_BYTES],
  ];
  if (failed) spots.push(["failed range", failed.start, Math.min(PROBE_BYTES, failed.end - failed.start)]);
  const out: AccessProbe[] = [];
  for (const [where, offset, len] of spots) {
    const t = performance.now();
    try {
      await file.slice(offset, Math.min(file.size, offset + len)).arrayBuffer();
      out.push({ where, offset, ok: true, ms: Math.round(performance.now() - t), error: null });
    } catch (err) {
      out.push({ where, offset, ok: false, ms: Math.round(performance.now() - t), error: `${errName(err)}: ${errMessage(err)}` });
    }
  }
  return out;
}

export interface ForensicRound {
  label: "immediately" | "after 2 s" | "after 10 s";
  atMsAfterFailure: number;
  probes: AccessProbe[];
  visibility: string;
  /** File.size / lastModified as the page sees them now (same object). */
  sizeNow: number;
  lastModifiedNow: number;
}

export type ForensicVerdict =
  | "permanent: whole file unreadable"
  | "permanent: only some regions unreadable"
  | "recovered: readable again after a pause"
  | "never failed again (one-off read error)";

export interface Forensics {
  failure: ReadFailure & { t: number };
  msSincePick: number;
  msSinceFirstRead: number | null;
  msSinceLastGoodRead: number | null;
  lastGoodRead: ReadEvent | null;
  readsBefore: number;
  bytesBefore: number;
  slowReadsBefore: number;
  maxReadMs: number;
  recentReads: ReadEvent[];
  rounds: ForensicRound[];
  snapshotChanged: boolean;
  verdict: ForensicVerdict;
  jsHeapMB: number | null;
}

export function classify(rounds: ForensicRound[]): ForensicVerdict {
  const okAll = (r: ForensicRound) => r.probes.every((p) => p.ok);
  const noneOk = (r: ForensicRound) => r.probes.every((p) => !p.ok);
  if (okAll(rounds[0]!)) return "never failed again (one-off read error)";
  if (rounds.slice(1).some(okAll)) return "recovered: readable again after a pause";
  if (rounds.every(noneOk)) return "permanent: whole file unreadable";
  return "permanent: only some regions unreadable";
}

export const FORENSIC_DELAYS_MS = [0, 2000, 10000] as const;

/** Re-reads the file immediately, after 2 s and after 10 s from the failure. */
export async function runForensics(
  file: File,
  snap: FileSnapshot,
  tracker: ReadTracker,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = () => performance.now(),
): Promise<Forensics> {
  const failure = tracker.failure!;
  const rounds: ForensicRound[] = [];
  const labels = ["immediately", "after 2 s", "after 10 s"] as const;
  for (let i = 0; i < FORENSIC_DELAYS_MS.length; i++) {
    const due = failure.t + FORENSIC_DELAYS_MS[i]!;
    const delay = due - now();
    if (delay > 0) await wait(delay);
    rounds.push({
      label: labels[i]!,
      atMsAfterFailure: Math.round(now() - failure.t),
      probes: await probeAccess(file, failure),
      visibility: typeof document === "undefined" ? "n/a" : document.visibilityState,
      sizeNow: file.size,
      lastModifiedNow: file.lastModified,
    });
  }
  return {
    failure,
    msSincePick: Math.round(failure.t - snap.pickedAt),
    msSinceFirstRead: tracker.firstReadAt === null ? null : Math.round(failure.t - tracker.firstReadAt),
    msSinceLastGoodRead: tracker.lastOk ? Math.round(failure.t - tracker.lastOk.t) : null,
    lastGoodRead: tracker.lastOk,
    readsBefore: tracker.reads,
    bytesBefore: tracker.bytes,
    slowReadsBefore: tracker.slowReads,
    maxReadMs: Math.round(tracker.maxReadMs),
    recentReads: tracker.recent.map((e) => ({ ...e, t: Math.round(e.t - failure.t), ms: Math.round(e.ms) })),
    rounds,
    snapshotChanged: rounds.some((r) => r.sizeNow !== snap.size || r.lastModifiedNow !== snap.lastModified),
    verdict: classify(rounds),
    jsHeapMB: jsHeapMB(),
  };
}

export function forensicsSummary(f: Forensics): string {
  const round = (r: ForensicRound) => `${r.label}: ${r.probes.map((p) => `${p.where} ${p.ok ? "ok" : "FAIL"}`).join(", ")}`;
  return [
    `${f.failure.name} at bytes ${f.failure.start}–${f.failure.end}`,
    `${(f.msSincePick / 1000).toFixed(1)} s after picking the file, ${f.msSinceFirstRead === null ? "?" : (f.msSinceFirstRead / 1000).toFixed(1)} s after the first read`,
    `last good read ${f.msSinceLastGoodRead === null ? "none" : `${f.msSinceLastGoodRead} ms before`} (${f.readsBefore} reads, ${(f.bytesBefore / 1e6).toFixed(0)} MB, slowest ${f.maxReadMs} ms, ${f.slowReadsBefore} over 1 s)`,
    ...f.rounds.map(round),
    `file size/date changed: ${f.snapshotChanged ? "YES" : "no"}`,
    `verdict: ${f.verdict}`,
  ].join(" · ");
}

// ── Soak: read the file for a fixed time with no decoding ──────────────────

export interface SoakOptions {
  durationMs: number;
  /** Bytes per read; 4 MiB matches the montage's read-ahead chunks. */
  chunkBytes?: number;
  signal?: AbortSignal;
  onProgress?: (elapsedMs: number, bytes: number) => void;
}

export interface SoakResult {
  elapsedMs: number;
  reads: number;
  bytes: number;
  passes: number;
  mbPerSecond: number;
  cancelled: boolean;
  failure: (ReadFailure & { t: number }) | null;
  failedAfterMs: number | null;
}

/**
 * Reads the whole file front to back in chunks, over and over, until the time
 * is up. Every 8th read jumps to a pseudo-random offset (like montage seeks).
 */
export async function soakRead(file: Blob, tracker: ReadTracker, opts: SoakOptions): Promise<SoakResult> {
  const chunk = opts.chunkBytes ?? 4 * 1024 * 1024;
  const stats = newReadStats();
  const t0 = performance.now();
  let pos = 0, passes = 0, n = 0, seed = 12345;
  const result: SoakResult = { elapsedMs: 0, reads: 0, bytes: 0, passes: 0, mbPerSecond: 0, cancelled: false, failure: null, failedAfterMs: null };
  try {
    while (performance.now() - t0 < opts.durationMs) {
      if (opts.signal?.aborted) {
        result.cancelled = true;
        break;
      }
      let start = pos;
      if (++n % 8 === 0) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        start = Math.floor((seed / 2147483648) * Math.max(1, file.size - chunk));
      } else {
        pos += chunk;
        if (pos >= file.size) {
          pos = 0;
          passes++;
        }
      }
      await trackedRead(file, start, Math.min(file.size, start + chunk), stats, tracker);
      opts.onProgress?.(performance.now() - t0, tracker.bytes);
    }
  } catch {
    result.failure = tracker.failure;
    result.failedAfterMs = Math.round(performance.now() - t0);
  }
  result.elapsedMs = Math.round(performance.now() - t0);
  result.reads = stats.reads;
  result.bytes = stats.bytes;
  result.passes = passes;
  result.mbPerSecond = +(stats.bytes / 1e6 / Math.max(0.001, result.elapsedMs / 1000)).toFixed(1);
  return result;
}

// ── Page lifecycle log ────────────────────────────────────────────────────

export interface LifecycleEvent {
  t: number;
  event: string;
}

/** Records visibility / freeze / resume / pagehide / online events with times. */
export class LifecycleLog {
  events: LifecycleEvent[] = [];
  private t0 = 0;
  private off: (() => void) | null = null;
  start(): void {
    this.events = [];
    this.t0 = performance.now();
    const add = (event: string) => this.events.push({ t: Math.round(performance.now() - this.t0), event });
    const vis = () => add(`visibility ${document.visibilityState}`);
    const pairs: [EventTarget, string, () => void][] = [
      [document, "visibilitychange", vis],
      [document, "freeze", () => add("freeze")],
      [document, "resume", () => add("resume")],
      [window, "pagehide", () => add("pagehide")],
      [window, "pageshow", () => add("pageshow")],
      [window, "blur", () => add("window blur")],
      [window, "focus", () => add("window focus")],
      [window, "offline", () => add("offline")],
      [window, "online", () => add("online")],
    ];
    for (const [t, n, f] of pairs) t.addEventListener(n, f);
    add(`start (visibility ${document.visibilityState})`);
    this.off = () => pairs.forEach(([t, n, f]) => t.removeEventListener(n, f));
  }
  stop(): LifecycleEvent[] {
    this.off?.();
    this.off = null;
    return this.events;
  }
}

export function lifecycleSummary(events: LifecycleEvent[]): string {
  const other = events.filter((e) => !e.event.startsWith("start"));
  return other.length ? other.map((e) => `${(e.t / 1000).toFixed(1)} s ${e.event}`).join(", ") : "no visibility/focus/freeze changes";
}

function errName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "Error";
}
function errMessage(err: unknown): string {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
}
