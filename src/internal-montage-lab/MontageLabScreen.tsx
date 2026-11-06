// Montage Lab — Stage 0 feasibility harness for Match Montage V2 (internal,
// /internal/montage-lab). Measures, on the coach's own phone, what a montage
// needs: OPFS storage, sustained encoding, memory behaviour, saving and
// sharing large MP4s, wake lock, cancellation and cleanup.
//
// Isolation from Match Clipper V1: reads V1's saved clips only through the
// read-only loader, never writes V1's storage key, and keeps every file in its
// own OPFS directory (V1 uses no OPFS at all).

import { useEffect, useRef, useState } from "react";
import { probeSource as v1ProbeSource, type SourceProbe } from "../internal-match-clipper/clip-export";
import { loadClipperStore } from "../internal-match-clipper/clip-storage";
import { isAudible } from "../internal-match-clipper/audio-level";
import { runReadChecks, type ReadCheck } from "../internal-match-clipper/diagnostics";
import { sourceKey } from "../internal-match-clipper/clip-types";
import { detectEnvironment, type LabEnvironment } from "./lab-env";
import { aacEncodeSupported, benchmarkEncode, encoderSupport, type EncodeBenchResult, type EncoderSupportRow } from "./lab-encode";
import { MemoryMonitor, jsHeapMB, type MemorySummary } from "./lab-memory";
import { runMontage as realRunMontage, type MontageRunResult, type OutputMode } from "./lab-montage";
import { PROFILES, WORKLOADS, estimateOutputBytes, formatMB, planRanges, rangesFromSavedClips } from "./lab-plan";
import { buildLabReport } from "./lab-report";
import { addRecord, clearRecords, endRun, loadRecords, startRun, takeInterruptedRun, updateRun, type LabRecord, type RunMarker } from "./lab-session";
import { clearLabFiles, listLabFiles, removeLabFile, writeProbe, type LabFile, type WriteProbeResult } from "./lab-storage";
import {
  LifecycleLog, ReadTracker, forensicsSummary, lifecycleSummary, probeAccess, runForensics, snapshotFile, soakRead,
  type FileSnapshot, type Forensics, type SoakResult,
} from "./lab-readdiag";

export interface LabDeps {
  detectEnvironment: typeof detectEnvironment;
  probeSource: (file: Blob) => Promise<SourceProbe>;
  runMontage: typeof realRunMontage;
  writeProbe: typeof writeProbe;
  encoderSupport: typeof encoderSupport;
  benchmarkEncode: typeof benchmarkEncode;
  listLabFiles: typeof listLabFiles;
  clearLabFiles: typeof clearLabFiles;
  removeLabFile: typeof removeLabFile;
  runReadChecks: (file: Blob) => Promise<ReadCheck[]>;
  probeAccess: typeof probeAccess;
  soakRead: typeof soakRead;
  runForensics: typeof runForensics;
}

const REAL_DEPS: LabDeps = {
  detectEnvironment, probeSource: v1ProbeSource, runMontage: realRunMontage, writeProbe, encoderSupport,
  benchmarkEncode, listLabFiles, clearLabFiles, removeLabFile, runReadChecks, probeAccess, soakRead, runForensics,
};

type WakeSentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };

/** DOMException is not guaranteed to be an Error subclass in every engine; read its fields directly. */
function errName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : String(err);
}
function errMessage(err: unknown): string {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
}

function audioSummary(r: MontageRunResult): string {
  if (!r.clipAudio.length) return "not measured";
  const count = (v: string) => r.clipAudio.filter((c) => c.verdict === v).length;
  const lost = r.clipAudio.filter((c) => c.verdict === "LOST-IN-MONTAGE").map((c) => c.clip);
  return `${count("ok")} ok, ${count("source-silent")} silent in the source, ${lost.length} LOST in montage${lost.length ? ` (clips ${lost.join(", ")})` : ""}, ${count("unmeasured")} unmeasured`;
}

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

export default function MontageLabScreen({ deps: depsOverride }: { deps?: Partial<LabDeps> }) {
  const deps = { ...REAL_DEPS, ...depsOverride };
  const [env, setEnv] = useState<LabEnvironment | null>(null);
  const [records, setRecords] = useState<LabRecord[]>(() => loadRecords());
  const [interrupted, setInterrupted] = useState<RunMarker | null>(null);
  const [leftovers, setLeftovers] = useState<LabFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ fraction: number; detail: string; startedAt: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [writeResult, setWriteResult] = useState<WriteProbeResult | null>(null);
  const [headroomCapGB, setHeadroomCapGB] = useState(4);
  const [support, setSupport] = useState<{ rows: EncoderSupportRow[]; aac: boolean | null } | null>(null);
  const [benches, setBenches] = useState<EncodeBenchResult[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<SourceProbe | null>(null);
  const [readChecks, setReadChecks] = useState<ReadCheck[] | null>(null);
  const [workloadId, setWorkloadId] = useState("five");
  const [profileId, setProfileId] = useState<"1080p" | "720p">("1080p");
  const [output, setOutput] = useState<OutputMode>("opfs");
  const [useSaved, setUseSaved] = useState(false);
  const [montage, setMontage] = useState<(MontageRunResult & { memory: MemorySummary; wake: string[]; hiddenMs: number }) | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  // ── Source-read diagnostics ──
  const [snap, setSnap] = useState<FileSnapshot | null>(null);
  /** Set once the browser can no longer read the picked file: it must be chosen again. */
  const [stale, setStale] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [diagText, setDiagText] = useState<string | null>(null);
  const [soakMinutes, setSoakMinutes] = useState(3);

  const refreshRecords = () => setRecords(loadRecords());
  const record = (kind: string, summary: string, data: unknown) => {
    addRecord(kind, summary, data);
    refreshRecords();
  };

  useEffect(() => {
    const m = takeInterruptedRun();
    setInterrupted(m);
    refreshRecords();
    void deps.detectEnvironment().then(setEnv).catch(() => undefined);
    void deps.listLabFiles().then(setLeftovers).catch(() => setLeftovers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Wake lock + visibility, held for the duration of a long operation ──
  const wakeLog = useRef<string[]>([]);
  const hiddenMs = useRef(0);
  const sentinel = useRef<WakeSentinel | null>(null);
  const runningRef = useRef(false);
  const acquireWake = async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } }).wakeLock;
    if (!wl) {
      wakeLog.current.push("wake lock API unavailable");
      return;
    }
    try {
      const s = await wl.request("screen");
      sentinel.current = s;
      wakeLog.current.push(`acquired at +${Math.round(performance.now() / 1000)} s`);
      s.addEventListener("release", () => wakeLog.current.push(`released at +${Math.round(performance.now() / 1000)} s (page ${document.visibilityState})`));
    } catch (err) {
      wakeLog.current.push(`request failed: ${err instanceof Error ? err.name : String(err)}`);
    }
  };
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (!runningRef.current) return;
      if (document.visibilityState === "hidden") hiddenAt = performance.now();
      else {
        if (hiddenAt) hiddenMs.current += performance.now() - hiddenAt;
        hiddenAt = 0;
        if (!sentinel.current || sentinel.current.released) void acquireWake();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const begin = async (op: string, detail: string) => {
    setBusy(op);
    setStatus(null);
    abortRef.current = new AbortController();
    wakeLog.current = [];
    hiddenMs.current = 0;
    runningRef.current = true;
    startRun(op, detail);
    await acquireWake();
    return abortRef.current.signal;
  };
  const finish = async () => {
    runningRef.current = false;
    endRun();
    setBusy(null);
    setProgress(null);
    abortRef.current = null;
    if (sentinel.current && !sentinel.current.released) await sentinel.current.release().catch(() => undefined);
    sentinel.current = null;
  };

  // ── 2. Storage ──
  const runWrite = async (bytes: number, label: string) => {
    const signal = await begin(label, `${formatMB(bytes)} target`);
    const started = performance.now();
    try {
      const r = await deps.writeProbe(bytes, {
        signal,
        onProgress: (w) => {
          setProgress({ fraction: Math.min(1, w / bytes), detail: `${formatMB(w)} written`, startedAt: started });
          updateRun(Math.min(1, w / bytes), `${formatMB(w)} written`);
        },
      });
      setWriteResult(r);
      record(
        label,
        `${formatMB(r.wroteBytes)} written${r.error ? `, stopped by ${r.error}` : ""} · write ${r.writeMBps?.toFixed(0) ?? "?"} MB/s · commit ${r.closeMs ?? "?"} ms · read ${r.readMBps?.toFixed(0) ?? "?"} MB/s · usage mid-write ${formatMB(r.usageMidWrite ?? 0)}`,
        r,
      );
    } finally {
      await finish();
    }
  };

  const requestPersist = async () => {
    let granted: boolean | null = null;
    try {
      granted = await navigator.storage.persist();
    } catch {
      granted = null;
    }
    record("persist", `navigator.storage.persist() → ${granted}`, { granted });
    setEnv(await deps.detectEnvironment());
  };

  // ── 3. Encoder ──
  const runSupport = async () => {
    setBusy("encoder support");
    try {
      const rows = await deps.encoderSupport();
      const aac = await aacEncodeSupported();
      setSupport({ rows, aac });
      record("encoder-support", rows.map((r) => `${r.label}: ${r.supported === null ? "error" : r.supported ? "yes" : "no"}`).join(" · ") + ` · AAC encode: ${aac}`, { rows, aac });
    } finally {
      setBusy(null);
    }
  };
  const runBench = async (width: number, height: number, accel: HardwareAcceleration) => {
    const signal = await begin(`encode ${height}p`, `${accel} 60 s`);
    const mon = new MemoryMonitor();
    mon.start();
    const started = performance.now();
    const tick = setInterval(() => setProgress({ fraction: Math.min(0.99, (performance.now() - started) / 60000), detail: "encoding 60 s of video", startedAt: started }), 500);
    try {
      const r = await deps.benchmarkEncode(width, height, 60, accel, signal);
      const memory = mon.stop();
      setBenches((b) => [r, ...b]);
      record(
        `encode-${height}p`,
        r.error ? `failed: ${r.error}` : `${r.label}: ${r.realtimeFactor}× real time (${r.fps} fps) over 60 s · max queue ${r.maxQueue} · stalls>500ms ${memory.stallsOver500ms}`,
        { ...r, memory },
      );
    } finally {
      clearInterval(tick);
      await finish();
    }
  };

  // ── 4. Montage ──
  const onPick = async (f: File | null) => {
    setFile(f);
    setProbe(null);
    setReadChecks(null);
    setMontage(null);
    setStale(null);
    setDiagText(null);
    if (!f) return;
    const s = snapshotFile(f);
    setSnap(s);
    setBusy("checking video");
    try {
      const pr = await deps.probeSource(f);
      setProbe(pr);
      // Is the file readable from start to end, by both read methods? (Investigates NotReadableError.)
      const checks = await deps.runReadChecks(f).catch(() => [] as ReadCheck[]);
      setReadChecks(checks);
      const failedReads = checks.filter((c) => !c.ok);
      record(
        "source",
        `${f.name} · ${formatMB(f.size)} · ${(pr.duration / 60).toFixed(1)} min · ${pr.width}×${pr.height} · video ${pr.videoCodec} · audio tracks: ${
          pr.audioTracks.map((t) => `#${t.index} ${t.codec} ${t.channels}ch ${t.levelDb === null ? "n/a" : `${t.levelDb.toFixed(0)} dB`}${t.id === pr.audioTrackId ? " (used)" : ""}`).join(", ") || "none"
        } · read checks ${checks.length - failedReads.length}/${checks.length} ok${failedReads.length ? ` — FAILED: ${failedReads.map((c) => `${c.method}@${c.where} ${c.error}`).join("; ")}` : ""} · type "${f.type}" · lastModified ${new Date(f.lastModified).toISOString()}${s.looksLikeAndroidMediaId ? " · name looks like an Android Photo Picker media id" : ""}${pr.blocker ? ` · blocker: ${pr.blocker.code} ${pr.blocker.detail ?? ""}` : ""}`,
        { name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, snapshot: s, probe: { ...pr, scan: pr.scan ? { brands: pr.scan.brands, tracks: pr.scan.tracks, error: pr.scan.error } : null }, readChecks: checks },
      );
    } finally {
      setBusy(null);
    }
  };
  const savedClips = (() => {
    if (!file) return [];
    const project = loadClipperStore().store.projects.find((p) => p.key === sourceKey(file.name, file.size));
    return project ? rangesFromSavedClips(project.clips) : [];
  })();
  const workload = WORKLOADS.find((w) => w.id === workloadId)!;
  const profile = PROFILES.find((p) => p.id === profileId)!;
  const ranges = !probe ? [] : useSaved ? savedClips : planRanges(probe.duration, workload.clips, workload.seconds);
  const plannedSeconds = ranges.reduce((n, [s, e]) => n + (e - s), 0);

  /** The browser can't read this File any more: say so and require a fresh pick. */
  const markStale = (reason: string) => {
    setStale(reason);
    setInputKey((k) => k + 1); // a fresh <input>, so picking the same file again fires
  };
  /** Quick start/middle/end read before a long run; a stale file is caught here. */
  const preflight = async (f: File, what: string): Promise<boolean> => {
    const probes = await deps.probeAccess(f);
    const bad = probes.filter((p) => !p.ok);
    if (!bad.length) return true;
    const reason = `Before ${what}: ${bad.map((p) => `${p.where} ${p.error}`).join("; ")}`;
    record("read-preflight", `FAILED — ${reason}`, { probes, snapshot: snap });
    markStale(reason);
    return false;
  };
  /** After a read failure: re-read immediately, at 2 s and at 10 s, then record everything. */
  const afterReadFailure = async (what: string, forensics: Promise<Forensics>, lifecycle: string, extra: unknown) => {
    setBusy("checking file access (10 s)");
    const f = await forensics;
    const text = `${what}: ${forensicsSummary(f)} · page events: ${lifecycle}`;
    setDiagText(text);
    record("read-failure", text, { forensics: f, snapshot: snap, extra });
    markStale(`${f.failure.name} at bytes ${f.failure.start}–${f.failure.end} (${f.verdict})`);
  };
  const newTracker = (f: File) => {
    const tracker = new ReadTracker();
    const ref: { forensics: Promise<Forensics> | null } = { forensics: null };
    tracker.onFirstFailure = () => {
      ref.forensics = deps.runForensics(f, snap ?? snapshotFile(f), tracker);
    };
    return { tracker, ref };
  };

  const runMontage = async () => {
    if (!file || !probe || !ranges.length || stale) return;
    const label = `montage ${ranges.length} clips / ${Math.round(plannedSeconds)} s / ${profile.id} / ${output}`;
    if (!(await preflight(file, "building"))) return;
    const { tracker, ref } = newTracker(file);
    const lifecycle = new LifecycleLog();
    lifecycle.start();
    const signal = await begin("montage", label);
    const mon = new MemoryMonitor();
    mon.start();
    const started = performance.now();
    setMontage(null);
    setHandoff(null);
    try {
      const r = await deps.runMontage(file, {
        ranges, profile, output, audioTrackId: probe.audioTrackId, signal, tracker,
        onProgress: (fraction, detail) => {
          setProgress({ fraction, detail, startedAt: started });
          updateRun(fraction, detail);
        },
      });
      const memory = mon.stop();
      const events = lifecycle.stop();
      const full = { ...r, memory, wake: [...wakeLog.current], hiddenMs: Math.round(hiddenMs.current) };
      setMontage(full);
      const reads = { reads: tracker.reads, bytes: tracker.bytes, slowReads: tracker.slowReads, maxReadMs: Math.round(tracker.maxReadMs) };
      const v = r.verify;
      record(
        "montage",
        r.ok
          ? `${label}: built in ${fmtTime(r.elapsedMs)} (${r.realtimeFactor}× real time), ${formatMB(r.bytes)} (est. ${formatMB(r.estimateBytes)}), ${r.width}×${r.height} · joins on keyframe ${v?.joinsOnKeyframe}/${v?.joins} · audio gaps ${v?.audioGaps} · timestamps increasing ${v?.videoTimestampsStrictlyIncreasing} · sound ${v?.audioLevelDb?.toFixed(0) ?? "?"} dB · per-clip audio: ${audioSummary(r)} · audio ${r.audioTrack?.codecString ?? "?"} ${r.audioTrack?.sampleRate ?? "?"} Hz ${r.audioTrack?.channels ?? "?"}ch · stalls>500ms ${memory.stallsOver500ms} · hidden ${Math.round(hiddenMs.current / 1000)} s`
          : `${label}: ${r.cancelled ? "CANCELLED" : `FAILED (${r.errorName}: ${r.error})`} after ${fmtTime(r.elapsedMs)} · ${reads.reads} source reads, ${formatMB(reads.bytes)} · page events: ${lifecycleSummary(events)} · JS heap peak ${memory.jsHeapPeakMB ?? "n/a"} MB (indicative)`,
        { ...full, file: undefined, reads, lifecycle: events },
      );
      if (ref.forensics) await afterReadFailure("Montage", ref.forensics, lifecycleSummary(events), { label, reads, memory, wake: full.wake, hiddenMs: full.hiddenMs });
    } finally {
      await finish();
      setLeftovers(await deps.listLabFiles().catch(() => []));
    }
  };

  // ── 4b. Read soak: the file only, no decoding; optionally with encoding running ──
  const runSoak = async (withEncoding: boolean) => {
    if (!file || stale) return;
    const label = `read soak ${soakMinutes} min${withEncoding ? " + 720p encoding" : " (no encoding)"}`;
    if (!(await preflight(file, "the soak"))) return;
    const { tracker, ref } = newTracker(file);
    const lifecycle = new LifecycleLog();
    lifecycle.start();
    const signal = await begin("read soak", label);
    const mon = new MemoryMonitor();
    mon.start();
    const started = performance.now();
    const durationMs = soakMinutes * 60000;
    // Encoding load: synthetic frames only (no file reads), 30 s rounds until the soak ends.
    const encAbort = new AbortController();
    const enc = { rounds: 0, errors: [] as string[], realtime: [] as number[] };
    const encLoop = withEncoding
      ? (async () => {
          while (!encAbort.signal.aborted && !signal.aborted) {
            const b = await deps.benchmarkEncode(1280, 720, 30, "no-preference", encAbort.signal).catch((e: unknown) => ({ error: errName(e), realtimeFactor: 0 }));
            if (encAbort.signal.aborted) break;
            enc.rounds++;
            if (b.error) {
              enc.errors.push(b.error);
              if (enc.errors.length > 3) break;
            } else enc.realtime.push(b.realtimeFactor);
          }
        })()
      : Promise.resolve();
    let r: SoakResult | null = null;
    try {
      r = await deps.soakRead(file, tracker, {
        durationMs, signal,
        onProgress: (ms, bytes) => {
          const detail = `${Math.round(ms / 1000)} s · ${formatMB(bytes)} read${withEncoding ? ` · encode rounds ${enc.rounds}` : ""}`;
          setProgress({ fraction: Math.min(1, ms / durationMs), detail, startedAt: started });
          updateRun(Math.min(1, ms / durationMs), detail);
        },
      });
    } finally {
      encAbort.abort();
      await encLoop;
      const memory = mon.stop();
      const events = lifecycle.stop();
      if (r) {
        const encText = withEncoding ? ` · encoding: ${enc.rounds} × 30 s rounds${enc.realtime.length ? ` at ${Math.min(...enc.realtime)}–${Math.max(...enc.realtime)}× real time` : ""}${enc.errors.length ? `, errors: ${enc.errors.join("; ")}` : ""}` : "";
        const text = `${label}: ${r.cancelled ? "CANCELLED" : r.failure ? `FAILED after ${fmtTime(r.failedAfterMs ?? 0)}` : "PASSED"} · ${r.reads} reads, ${formatMB(r.bytes)} (${r.passes} full passes, ${r.mbPerSecond} MB/s) · slowest read ${Math.round(tracker.maxReadMs)} ms${encText} · page events: ${lifecycleSummary(events)} · JS heap peak ${memory.jsHeapPeakMB ?? "n/a"} MB (indicative) · stalls>500ms ${memory.stallsOver500ms}`;
        setDiagText(text);
        record("read-soak", text, { ...r, withEncoding, enc, memory, lifecycle: events, wake: [...wakeLog.current], hiddenMs: Math.round(hiddenMs.current), snapshot: snap });
      }
      if (ref.forensics) await afterReadFailure(label, ref.forensics, lifecycleSummary(events), { soak: r, withEncoding });
      await finish();
    }
  };

  // ── 5/6. Save and share ──
  const saveDownload = () => {
    if (!montage?.file) return;
    const t = performance.now();
    const url = URL.createObjectURL(montage.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paircvision-montage-${Math.round(montage.montageSeconds)}s.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    const msg = `Download started (${formatMB(montage.file.size)}, link made in ${Math.round(performance.now() - t)} ms). Check Downloads, then play it.`;
    setHandoff(msg);
    record("save-download", msg, { bytes: montage.file.size });
  };
  const saveWithPicker = async () => {
    if (!montage?.file) return;
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (!picker) return;
    try {
      const h = await picker({ suggestedName: `paircvision-montage-${Math.round(montage.montageSeconds)}s.mp4`, types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }] });
      const t = performance.now();
      const w = await h.createWritable();
      await montage.file.stream().pipeTo(w);
      const msg = `Saved via picker in ${fmtTime(performance.now() - t)} (${formatMB(montage.file.size)}).`;
      setHandoff(msg);
      record("save-picker", msg, { bytes: montage.file.size, ms: Math.round(performance.now() - t) });
    } catch (err) {
      const msg = `Picker save: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
      setHandoff(msg);
      record("save-picker", msg, {});
    }
  };
  const share = () => {
    if (!montage?.file) return;
    const heap0 = jsHeapMB();
    const t0 = performance.now();
    // Name and type the on-disk OPFS file for sharing. Blob composition references the bytes; it should not copy them.
    const shareFile = new File([montage.file], `paircvision-montage-${Math.round(montage.montageSeconds)}s.mp4`, { type: "video/mp4" });
    const wrapMs = Math.round(performance.now() - t0);
    const heap1 = jsHeapMB();
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const canRaw = !!nav.canShare?.({ files: [montage.file] });
    const can = !!nav.canShare?.({ files: [shareFile] });
    const base = { bytes: shareFile.size, wrapMs, heapBeforeMB: heap0, heapAfterWrapMB: heap1, canShareRawOpfsFile: canRaw, canShareTypedFile: can };
    if (!can || typeof navigator.share !== "function") {
      const msg = `This browser can't share this file (canShare=${can}). Use Save MP4.`;
      setHandoff(msg);
      record("share", msg, base);
      return;
    }
    const t1 = performance.now();
    navigator
      .share({ files: [shareFile] })
      .then(() => {
        const msg = `Shared: handed to the chosen app after ${fmtTime(performance.now() - t1)}. Check it plays in WhatsApp with commentary.`;
        setHandoff(msg);
        record("share", msg, { ...base, outcome: "shared", ms: Math.round(performance.now() - t1), heapAfterShareMB: jsHeapMB() });
      })
      .catch((err: unknown) => {
        const name = errName(err);
        const msg = name === "AbortError" ? "Share sheet closed (cancelled)." : `Share failed: ${name}: ${errMessage(err)}`;
        setHandoff(msg);
        record("share", msg, { ...base, outcome: name, ms: Math.round(performance.now() - t1), heapAfterShareMB: jsHeapMB() });
      });
  };
  /**
   * Share-size ladder: shares the first N MB of the finished montage (a Blob slice, so it is instant and the
   * tap still counts as a user gesture). Finds the browser's real share-size limit and whether it is per
   * file or total. The slices are not playable videos — just close the share sheet when it opens.
   */
  const shareSlice = (sizesMB: number[]) => {
    if (!montage?.file) return;
    const files = sizesMB.map((n, i) => new File([montage.file!.slice(0, Math.min(montage.file!.size, n * 1e6))], `share-test-${n}MB-${i + 1}.mp4`, { type: "video/mp4" }));
    const label = sizesMB.length > 1 ? `${sizesMB.length} files × ${sizesMB[0]} MB` : `${sizesMB[0]} MB`;
    const can = !!(navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare?.({ files });
    if (typeof navigator.share !== "function") {
      record("share-ladder", `${label}: navigator.share unavailable`, { sizesMB });
      setHandoff(`${label}: navigator.share unavailable`);
      return;
    }
    const t = performance.now();
    navigator
      .share({ files })
      .then(() => {
        const msg = `${label}: ALLOWED — the share sheet opened and a target was chosen`;
        setHandoff(msg);
        record("share-ladder", msg, { sizesMB, canShare: can, ms: Math.round(performance.now() - t) });
      })
      .catch((err: unknown) => {
        const name = errName(err);
        const msg = name === "AbortError"
          ? `${label}: ALLOWED — the share sheet opened (closed without sharing)`
          : `${label}: REFUSED — ${name}: ${errMessage(err)}`;
        setHandoff(msg);
        record("share-ladder", msg, { sizesMB, canShare: can, error: name, ms: Math.round(performance.now() - t) });
      });
  };

  const deleteMontage = async () => {
    if (montage?.outputName) await deps.removeLabFile(montage.outputName);
    setMontage(null);
    setHandoff(null);
    setLeftovers(await deps.listLabFiles().catch(() => []));
  };

  // ── 7. Cleanup ──
  const cleanup = async () => {
    const removed = await deps.clearLabFiles();
    record("cleanup", `removed ${removed.length} lab file(s), ${formatMB(removed.reduce((n, f) => n + Math.max(0, f.bytes), 0))}`, removed);
    setLeftovers([]);
    setMontage(null);
  };

  const report = buildLabReport(env, records);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setStatus("Report copied — paste it into a message.");
    } catch {
      setStatus("Couldn't copy — use Download report instead.");
    }
  };
  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `montage-lab-report-${env?.isBrave ? "brave" : "chrome"}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const p = progress;
  const eta = p && p.fraction > 0.02 ? ((performance.now() - p.startedAt) / p.fraction) * (1 - p.fraction) : null;
  const hasPicker = typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";

  return (
    <div className="ml-shell">
      <style>{CSS}</style>
      <div className="ml-content">
        <div className="ml-top">
          <button type="button" className="ml-ghost" onClick={() => window.location.assign("/internal")}>← Internal</button>
          <h1 className="ml-title">Montage Lab</h1>
        </div>
        <p className="ml-muted">Stage 0 test harness for Match Montage. It measures this phone; it does not change your Match Clipper clips.</p>

        {interrupted && (
          <p className="ml-banner ml-warn" role="alert">
            The last test did not finish: {interrupted.op} stopped at {Math.round(interrupted.progress * 100)}% after{" "}
            {fmtTime(interrupted.updatedAt - interrupted.startedAt)} ({interrupted.detail}). This is recorded in the report.
          </p>
        )}
        {leftovers && leftovers.length > 0 && (
          <div className="ml-card">
            <p className="ml-strong">Temporary files left in lab storage</p>
            <ul className="ml-list">
              {leftovers.map((f) => <li key={f.name}>{f.name} — {f.bytes >= 0 ? formatMB(f.bytes) : "unreadable"}</li>)}
            </ul>
            <button type="button" className="ml-secondary" onClick={() => void cleanup()} disabled={!!busy}>Clean up lab files</button>
          </div>
        )}

        <section className="ml-card">
          <h2 className="ml-h2">1. Phone and browser</h2>
          {env ? (
            <>
              <p className="ml-strong">{env.browser} · Android {env.android ?? "?"}</p>
              <p className="ml-muted">Storage quota {env.quota !== null ? formatMB(env.quota) : "?"} · used {env.usage !== null ? formatMB(env.usage) : "?"} · persistent {String(env.persisted)}</p>
              <ul className="ml-list">
                {Object.entries(env.apis).map(([k, v]) => <li key={k} className={v ? "ml-yes" : "ml-no"}>{v ? "✓" : "✗"} {k}</li>)}
              </ul>
            </>
          ) : (
            <p className="ml-muted">Checking…</p>
          )}
        </section>

        <section className="ml-card">
          <h2 className="ml-h2">2. Phone storage (OPFS)</h2>
          <p className="ml-muted">Writes a test file in 8 MB pieces, reads it back, then deletes it.</p>
          <div className="ml-row">
            <button type="button" className="ml-primary" disabled={!!busy} onClick={() => void runWrite(500e6, "write-500MB")}>Write test (500 MB)</button>
            <button type="button" className="ml-secondary" disabled={!!busy} onClick={() => void requestPersist()}>Request persistent storage</button>
          </div>
          <div className="ml-row">
            <label className="ml-label">
              Headroom probe — write until full, at most
              <select value={headroomCapGB} onChange={(e) => setHeadroomCapGB(Number(e.target.value))} aria-label="Headroom probe limit">
                {[1, 2, 4, 8].map((g) => <option key={g} value={g}>{g} GB</option>)}
              </select>
            </label>
            <button type="button" className="ml-secondary" disabled={!!busy} onClick={() => void runWrite(headroomCapGB * 1e9, "headroom-probe")}>Run headroom probe</button>
          </div>
          {writeResult && (
            <p className="ml-result">
              Wrote {formatMB(writeResult.wroteBytes)}{writeResult.error ? ` — stopped by ${writeResult.error}` : ""} · write {writeResult.writeMBps?.toFixed(0) ?? "?"} MB/s · commit {writeResult.closeMs ?? "?"} ms · read back {writeResult.readMBps?.toFixed(0) ?? "?"} MB/s ({String(writeResult.readBackOk)})
            </p>
          )}
        </section>

        <section className="ml-card">
          <h2 className="ml-h2">3. Video encoder</h2>
          <div className="ml-row">
            <button type="button" className="ml-secondary" disabled={!!busy} onClick={() => void runSupport()}>Check H.264 support</button>
            <button type="button" className="ml-secondary" disabled={!!busy} onClick={() => void runBench(1280, 720, "no-preference")}>Encode 60 s at 720p</button>
            <button type="button" className="ml-secondary" disabled={!!busy} onClick={() => void runBench(1920, 1080, "no-preference")}>Encode 60 s at 1080p</button>
            <button type="button" className="ml-ghost" disabled={!!busy} onClick={() => void runBench(1920, 1080, "prefer-software")}>1080p software only</button>
          </div>
          {support && (
            <ul className="ml-list">
              {support.rows.map((r) => <li key={r.label} className={r.supported ? "ml-yes" : "ml-no"}>{r.supported ? "✓" : "✗"} {r.label}{r.error ? ` (${r.error})` : ""}</li>)}
              <li className={support.aac ? "ml-yes" : "ml-no"}>{support.aac ? "✓" : "✗"} AAC audio encoder</li>
            </ul>
          )}
          {benches.map((b, i) => (
            <p key={i} className="ml-result">{b.label}: {b.error ? `failed — ${b.error}` : `${b.realtimeFactor}× real time (${b.fps} fps), max queue ${b.maxQueue}`}</p>
          ))}
        </section>

        <section className="ml-card">
          <h2 className="ml-h2">4. Montage test</h2>
          <label className="ml-label">
            Match video
            <input key={inputKey} type="file" accept="video/*" aria-label="Match video for montage test" disabled={!!busy} onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />
          </label>
          {probe && (
            <p className={`ml-muted${probe.blocker ? " ml-no" : ""}`}>
              {file?.name} · {(probe.duration / 60).toFixed(1)} min · {probe.width}×{probe.height} · video {probe.videoCodec} · audio {probe.audioCodec ?? "none"}
              {probe.blocker ? ` — ${probe.blocker.message}` : ""}
            </p>
          )}
          {probe && (
            <ul className="ml-list" aria-label="Source audio tracks">
              {probe.audioTracks.length === 0 && <li className="ml-no">✗ no audio track the engine can read</li>}
              {probe.audioTracks.map((t) => (
                <li key={t.id} className={isAudible(t.levelDb) ? "ml-yes" : "ml-no"}>
                  Audio track {t.index}: {t.codec} {t.channels}ch {t.sampleRate} Hz — {t.levelDb === null ? "level n/a" : isAudible(t.levelDb) ? `sound ${t.levelDb.toFixed(0)} dB` : `SILENT (${t.levelDb.toFixed(0)} dB at 20/50/80% of the video)`}
                  {t.id === probe.audioTrackId ? " · used" : ""}
                </li>
              ))}
            </ul>
          )}
          {readChecks && readChecks.some((c) => !c.ok) && (
            <p className="ml-no" role="alert">
              File read problems: {readChecks.filter((c) => !c.ok).map((c) => `${c.method} at ${c.where}: ${c.error}`).join("; ")}
            </p>
          )}
          {stale && (
            <p className="ml-no" role="alert" data-testid="stale-file">
              The browser can no longer read “{file?.name}” ({stale}). Choose the video again before the next test — retrying with the same selection would only repeat this failure.
            </p>
          )}
          {snap?.looksLikeAndroidMediaId && (
            <p className="ml-muted">“{snap.name}” is named like an Android Photo Picker item (a media id), so it was probably served by the phone's media provider, not opened from Files/Downloads.</p>
          )}
          <div className="ml-grid">
            <label className="ml-label">
              Workload
              <select value={workloadId} onChange={(e) => setWorkloadId(e.target.value)} disabled={useSaved} aria-label="Workload">
                {WORKLOADS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
            </label>
            <label className="ml-label">
              Output size
              <select value={profileId} onChange={(e) => setProfileId(e.target.value as "1080p" | "720p")} aria-label="Output size">
                {PROFILES.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
              </select>
            </label>
            <label className="ml-label">
              Write to
              <select value={output} onChange={(e) => setOutput(e.target.value as OutputMode)} aria-label="Write to">
                <option value="opfs">Phone storage (OPFS)</option>
                <option value="memory">Memory (comparison only)</option>
              </select>
            </label>
          </div>
          {savedClips.length > 0 && (
            <label className="ml-check">
              <input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} />
              Use my {savedClips.length} saved Match Clipper clips for this video (read-only)
            </label>
          )}
          {probe && ranges.length > 0 && (
            <p className="ml-muted">
              {ranges.length} clips · {(plannedSeconds / 60).toFixed(1)} min montage · estimated {formatMB(estimateOutputBytes(plannedSeconds, profile))}
              {output === "memory" ? " — memory mode holds the whole file in RAM; it may crash the tab on long montages (that is a valid result)." : ""}
            </p>
          )}
          <button type="button" className="ml-primary" disabled={!!busy || !probe || !!probe.blocker || !ranges.length || !!stale} onClick={() => void runMontage()}>
            Build montage
          </button>

          <div className="ml-soak" aria-label="Source read soak">
            <p className="ml-strong">Source read soak (diagnostic)</p>
            <p className="ml-muted">Reads the selected video over and over with no decoding, to see whether reading alone loses access to the file. The second run adds a synthetic 720p encode (no extra file reads) to test memory and processor pressure.</p>
            <div className="ml-row">
              <label className="ml-label">
                Duration
                <select value={soakMinutes} onChange={(e) => setSoakMinutes(Number(e.target.value))} aria-label="Soak duration">
                  <option value={3}>3 min</option>
                  <option value={6}>6 min</option>
                </select>
              </label>
              <button type="button" className="ml-secondary" disabled={!!busy || !file || !!stale} onClick={() => void runSoak(false)}>Read soak (no encoding)</button>
              <button type="button" className="ml-secondary" disabled={!!busy || !file || !!stale} onClick={() => void runSoak(true)}>Read soak + encoding</button>
            </div>
          </div>
          {diagText && <p className="ml-result" data-testid="read-diag">{diagText}</p>}

          {montage && (
            <div className="ml-result-box">
              {montage.ok ? (
                <>
                  <p className="ml-strong ml-yes">Built {(montage.montageSeconds / 60).toFixed(1)} min in {fmtTime(montage.elapsedMs)} — {montage.realtimeFactor}× real time</p>
                  <p className="ml-muted">
                    {formatMB(montage.bytes)} (estimated {formatMB(montage.estimateBytes)}) · {montage.width}×{montage.height}{montage.downscaled ? " (downscaled)" : ""} ·
                    joins on keyframe {montage.verify?.joinsOnKeyframe}/{montage.verify?.joins} · audio gaps {montage.verify?.audioGaps} · timestamps increasing {String(montage.verify?.videoTimestampsStrictlyIncreasing)} ·
                    commentary {montage.verify?.audioLevelDb?.toFixed(0) ?? "?"} dB · page stalls &gt;0.5 s: {montage.memory.stallsOver500ms} · JS heap peak {montage.memory.jsHeapPeakMB ?? "n/a"} MB (indicative)
                  </p>
                  <p className="ml-muted" data-testid="clip-audio">Per-clip audio (source → montage): {audioSummary(montage)}</p>
                  <div className="ml-row">
                    <button type="button" className="ml-primary" onClick={share}>Share to WhatsApp</button>
                    <button type="button" className="ml-secondary" onClick={saveDownload}>Save MP4 to Downloads</button>
                    {hasPicker && <button type="button" className="ml-ghost" onClick={() => void saveWithPicker()}>Save to… (picker)</button>}
                    <button type="button" className="ml-ghost" onClick={() => void deleteMontage()}>Delete montage</button>
                  </div>
                  <p className="ml-muted">Share-size test — each button shares the first part of the montage (not playable; close the sheet when it opens):</p>
                  <div className="ml-row">
                    {[10, 45, 55, 100].filter((n) => n * 1e6 <= montage.bytes).map((n) => (
                      <button key={n} type="button" className="ml-ghost" onClick={() => shareSlice([n])}>Share {n} MB</button>
                    ))}
                    {montage.bytes >= 60e6 && <button type="button" className="ml-ghost" onClick={() => shareSlice([30, 30])}>Share 2 × 30 MB</button>}
                  </div>
                  {handoff && <p className="ml-result" role="status">{handoff}</p>}
                </>
              ) : (
                <p className={montage.cancelled ? "ml-warn-text" : "ml-no"} role="alert">
                  {montage.cancelled ? "Cancelled" : `Failed: ${montage.errorName} — ${montage.error}`} after {fmtTime(montage.elapsedMs)}. Temporary file removed.
                </p>
              )}
            </div>
          )}
        </section>

        {busy && (
          <div className="ml-job" role="region" aria-label="Running test">
            <p className="ml-strong">Running: {busy}</p>
            {p && (
              <>
                <div className="ml-bar"><div className="ml-bar-fill" style={{ width: `${Math.round(p.fraction * 100)}%` }} /></div>
                <p className="ml-muted">{p.detail} · {Math.round(p.fraction * 100)}% · elapsed {fmtTime(performance.now() - p.startedAt)}{eta !== null ? ` · about ${fmtTime(eta)} left` : ""}</p>
              </>
            )}
            <p className="ml-muted">Keep this screen open. Switching apps or locking the phone is itself a test — note what you did.</p>
            {abortRef.current && <button type="button" className="ml-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}
          </div>
        )}

        <section className="ml-card">
          <h2 className="ml-h2">5. Report</h2>
          <div className="ml-row">
            <button type="button" className="ml-primary" onClick={() => void copyReport()}>Copy report</button>
            <button type="button" className="ml-secondary" onClick={downloadReport}>Download report</button>
            <button type="button" className="ml-ghost" onClick={() => { clearRecords(); refreshRecords(); }}>Clear results</button>
          </div>
          {status && <p className="ml-muted" role="status">{status}</p>}
          <pre className="ml-pre" data-testid="lab-report">{report}</pre>
        </section>
      </div>
    </div>
  );
}

const CSS = `
.ml-shell { --bg:#06150F; --border:#275C3B; --card:rgba(23,61,40,0.7); --text:#F1F7F0; --muted:#8FA099; --primary:#7CFF72; --bad:#fca5a5; --warn:#fbbf24;
  min-height:100dvh; background:var(--bg); color:var(--text); font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  padding:calc(10px + env(safe-area-inset-top,0px)) 12px calc(32px + env(safe-area-inset-bottom,0px)); box-sizing:border-box; }
.ml-shell * { box-sizing:border-box; }
.ml-content { max-width:720px; margin:0 auto; display:grid; gap:10px; }
.ml-top { display:flex; align-items:center; gap:12px; }
.ml-title { margin:0; font-size:20px; font-weight:800; }
.ml-h2 { margin:0; font-size:16px; font-weight:750; }
.ml-card { border:1px solid var(--border); background:var(--card); border-radius:14px; padding:14px; display:grid; gap:10px; }
.ml-strong { margin:0; font-weight:700; }
.ml-muted { margin:0; color:var(--muted); font-size:13px; line-height:1.4; }
.ml-banner { margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--warn); background:rgba(251,191,36,0.1); font-size:13.5px; }
.ml-shell button { font-family:inherit; cursor:pointer; min-height:48px; border-radius:10px; padding:0 14px; font-size:14px; font-weight:700; }
.ml-shell button:disabled { opacity:0.4; cursor:default; }
.ml-primary { background:var(--primary); color:#03100B; border:0; }
.ml-secondary { background:transparent; color:var(--text); border:1px solid var(--primary); }
.ml-ghost { background:transparent; color:var(--muted); border:1px solid var(--border); }
.ml-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; }
.ml-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; }
.ml-label { display:grid; gap:4px; font-size:12px; color:var(--muted); }
.ml-label select, .ml-label input { min-height:44px; font-size:16px; background:#03100B; color:var(--text); border:1px solid var(--border); border-radius:8px; padding:6px; }
.ml-check { display:flex; gap:8px; align-items:center; font-size:14px; }
.ml-list { margin:0; padding-left:4px; list-style:none; font-size:13px; display:grid; gap:2px; }
.ml-yes { color:var(--primary); }
.ml-no { color:var(--bad); }
.ml-warn-text { color:var(--warn); }
.ml-result { margin:0; font-size:13px; }
.ml-result-box { border-top:1px solid var(--border); padding-top:10px; display:grid; gap:8px; }
.ml-job { position:sticky; bottom:8px; z-index:3; border:1px solid var(--primary); background:#0A2216; border-radius:14px; padding:14px; display:grid; gap:8px; }
.ml-soak { display:grid; gap:6px; border-top:1px solid #275C3B; padding-top:10px; }
.ml-bar { height:8px; border-radius:4px; background:#10291B; overflow:hidden; }
.ml-bar-fill { height:100%; background:var(--primary); transition:width 0.3s; }
.ml-pre { margin:0; max-height:40dvh; overflow:auto; white-space:pre-wrap; word-break:break-word; font-size:11px; background:#03100B; border:1px solid var(--border); border-radius:8px; padding:8px; }
`;
