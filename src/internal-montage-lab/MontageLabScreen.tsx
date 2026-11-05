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
import { sourceKey } from "../internal-match-clipper/clip-types";
import { detectEnvironment, type LabEnvironment } from "./lab-env";
import { aacEncodeSupported, benchmarkEncode, encoderSupport, type EncodeBenchResult, type EncoderSupportRow } from "./lab-encode";
import { MemoryMonitor, jsHeapMB, type MemorySummary } from "./lab-memory";
import { runMontage as realRunMontage, type MontageRunResult, type OutputMode } from "./lab-montage";
import { PROFILES, WORKLOADS, estimateOutputBytes, formatMB, planRanges, rangesFromSavedClips } from "./lab-plan";
import { buildLabReport } from "./lab-report";
import { addRecord, clearRecords, endRun, loadRecords, startRun, takeInterruptedRun, updateRun, type LabRecord, type RunMarker } from "./lab-session";
import { clearLabFiles, listLabFiles, removeLabFile, writeProbe, type LabFile, type WriteProbeResult } from "./lab-storage";

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
}

const REAL_DEPS: LabDeps = {
  detectEnvironment, probeSource: v1ProbeSource, runMontage: realRunMontage, writeProbe, encoderSupport,
  benchmarkEncode, listLabFiles, clearLabFiles, removeLabFile,
};

type WakeSentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };

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
  const [workloadId, setWorkloadId] = useState("five");
  const [profileId, setProfileId] = useState<"1080p" | "720p">("1080p");
  const [output, setOutput] = useState<OutputMode>("opfs");
  const [useSaved, setUseSaved] = useState(false);
  const [montage, setMontage] = useState<(MontageRunResult & { memory: MemorySummary; wake: string[]; hiddenMs: number }) | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);

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
    setMontage(null);
    if (!f) return;
    setBusy("checking video");
    try {
      setProbe(await deps.probeSource(f));
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

  const runMontage = async () => {
    if (!file || !probe || !ranges.length) return;
    const label = `montage ${ranges.length} clips / ${Math.round(plannedSeconds)} s / ${profile.id} / ${output}`;
    const signal = await begin("montage", label);
    const mon = new MemoryMonitor();
    mon.start();
    const started = performance.now();
    setMontage(null);
    setHandoff(null);
    try {
      const r = await deps.runMontage(file, {
        ranges, profile, output, audioTrackId: probe.audioTrackId, signal,
        onProgress: (fraction, detail) => {
          setProgress({ fraction, detail, startedAt: started });
          updateRun(fraction, detail);
        },
      });
      const memory = mon.stop();
      const full = { ...r, memory, wake: [...wakeLog.current], hiddenMs: Math.round(hiddenMs.current) };
      setMontage(full);
      const v = r.verify;
      record(
        "montage",
        r.ok
          ? `${label}: built in ${fmtTime(r.elapsedMs)} (${r.realtimeFactor}× real time), ${formatMB(r.bytes)} (est. ${formatMB(r.estimateBytes)}), ${r.width}×${r.height} · joins on keyframe ${v?.joinsOnKeyframe}/${v?.joins} · audio gaps ${v?.audioGaps} · timestamps increasing ${v?.videoTimestampsStrictlyIncreasing} · sound ${v?.audioLevelDb?.toFixed(0) ?? "?"} dB · stalls>500ms ${memory.stallsOver500ms} · hidden ${Math.round(hiddenMs.current / 1000)} s`
          : `${label}: ${r.cancelled ? "CANCELLED" : `FAILED (${r.errorName}: ${r.error})`} after ${fmtTime(r.elapsedMs)}`,
        { ...full, file: undefined },
      );
    } finally {
      await finish();
      setLeftovers(await deps.listLabFiles().catch(() => []));
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
        const name = err instanceof Error ? err.name : String(err);
        const msg = name === "AbortError" ? "Share sheet closed (cancelled)." : `Share failed: ${name}: ${err instanceof Error ? err.message : ""}`;
        setHandoff(msg);
        record("share", msg, { ...base, outcome: name, ms: Math.round(performance.now() - t1), heapAfterShareMB: jsHeapMB() });
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
            <input type="file" accept="video/*" aria-label="Match video for montage test" disabled={!!busy} onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />
          </label>
          {probe && (
            <p className={`ml-muted${probe.blocker ? " ml-no" : ""}`}>
              {file?.name} · {(probe.duration / 60).toFixed(1)} min · {probe.width}×{probe.height} · video {probe.videoCodec} · audio {probe.audioCodec ?? "none"}
              {probe.blocker ? ` — ${probe.blocker.message}` : ""}
            </p>
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
          <button type="button" className="ml-primary" disabled={!!busy || !probe || !!probe.blocker || !ranges.length} onClick={() => void runMontage()}>
            Build montage
          </button>

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
                  <div className="ml-row">
                    <button type="button" className="ml-primary" onClick={share}>Share to WhatsApp</button>
                    <button type="button" className="ml-secondary" onClick={saveDownload}>Save MP4 to Downloads</button>
                    {hasPicker && <button type="button" className="ml-ghost" onClick={() => void saveWithPicker()}>Save to… (picker)</button>}
                    <button type="button" className="ml-ghost" onClick={() => void deleteMontage()}>Delete montage</button>
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
.ml-bar { height:8px; border-radius:4px; background:#10291B; overflow:hidden; }
.ml-bar-fill { height:100%; background:var(--primary); transition:width 0.3s; }
.ml-pre { margin:0; max-height:40dvh; overflow:auto; white-space:pre-wrap; word-break:break-word; font-size:11px; background:#03100B; border:1px solid var(--border); border-radius:8px; padding:8px; }
`;
