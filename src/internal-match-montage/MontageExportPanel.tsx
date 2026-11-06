// Create MP4 for a montage — Match Montage V2, Stage 3 (internal).
//
// Lives inside a montage in Montage mode. One export at a time, held in a
// small module-level session so it keeps running (and its result stays
// available) while the coach switches modes or opens another montage. The
// export engine loads only when Create MP4 is first tapped.
//
// Save MP4 always works as the fallback. Share is offered where the browser
// says it can share the file, and called straight from the tap; if the phone
// refuses (e.g. NotAllowedError for a large file), the coach is told plainly
// and pointed at Save MP4 — no size limit is assumed.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CLIP_MP4_MIME, makeClipFile, shareClipFile, type ShareOutcome } from "../internal-match-clipper/clip-share";
import { downloadClipBlob } from "../features/shared/mediaClipExport";
import { formatClock } from "../internal-match-clipper/timestamp-parse";
import { cleanExportFiles, markRunEnded, markRunStarted, removeExportFile, takeInterruptedRun, type RunMarker } from "./export-storage";
import type { ExportProgress, MontageExportErrorCode, MontageExportOptions, MontageExportResult } from "./montage-export";
import type { MontageProject } from "./montage-types";

/** Approved first target is 5 minutes; a little headroom so a 5:15 selection isn't refused. */
export const EXPORT_LIMIT_SECONDS = 6 * 60;
/** Ten-minute exports stay behind a test switch (?exportLimit=10) until Samsung acceptance. */
export const EXPORT_LIMIT_TEST_SECONDS = 10 * 60;
const VIDEO_BITRATE = 3_000_000, AUDIO_BITRATE = 128_000;

export function exportLimitSeconds(search = typeof window === "undefined" ? "" : window.location.search): number {
  return new URLSearchParams(search).get("exportLimit") === "10" ? EXPORT_LIMIT_TEST_SECONDS : EXPORT_LIMIT_SECONDS;
}

export interface ExportEngine {
  exportMontage: (file: File, opts: MontageExportOptions) => Promise<MontageExportResult>;
}
const loadRealEngine = (): Promise<ExportEngine> => import("./montage-export");

// ── Export session (one at a time, survives mode switches) ────────────────

export type ExportSession =
  | { phase: "idle" }
  | { phase: "running"; montageId: string; montageName: string; progress: ExportProgress; startedAt: number; abort: AbortController }
  | { phase: "done"; montageId: string; montageName: string; signature: string; result: MontageExportResult; shareFile: File; share: string | null }
  | { phase: "failed"; montageId: string; montageName: string; code: MontageExportErrorCode | "failed"; message: string; detail: string | null; source: File };

let session: ExportSession = { phase: "idle" };
const listeners = new Set<() => void>();
function setSession(next: ExportSession) {
  session = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useExportSession(): ExportSession {
  return useSyncExternalStore(subscribe, () => session, () => session);
}
export function exportRunning(): boolean {
  return session.phase === "running";
}

let interrupted: RunMarker | null | undefined;
let cleaned = false;
/** Read once per page load (StrictMode runs effects twice). */
function interruptedRun(): RunMarker | null {
  if (interrupted === undefined) interrupted = takeInterruptedRun();
  return interrupted;
}
export function resetExportSessionForTests() {
  session = { phase: "idle" };
  interrupted = undefined;
  cleaned = false;
  listeners.forEach((l) => l());
}

/** Order, trims and source of a montage: a finished MP4 is out of date when this changes. */
export function montageSignature(p: MontageProject): string {
  return `${p.sourceKey}|${p.items.map((i) => `${i.start}-${i.end}`).join(",")}`;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Montage";
}
function mb(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`;
}
function length(seconds: number): string {
  return formatClock(seconds).replace(/^00:/, "0:");
}
/** "12345.mp4": how Android's Photo Picker names files — those were the ones that lost access on Samsung. */
export function looksLikePickerMediaId(name: string): boolean {
  return /^\d+\.[a-z0-9]+$/i.test(name);
}

type WakeSentinel = { release: () => Promise<void> };
async function requestWake(): Promise<WakeSentinel | null> {
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } }).wakeLock;
  try {
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

export function shareMessage(outcome: ShareOutcome, bytes: number): string {
  switch (outcome.status) {
    case "shared":
      return "Montage handed to the app you chose. If WhatsApp doesn't send it (for example, it says the video is too large), tap Save MP4 and attach the saved video from WhatsApp instead.";
    case "cancelled":
      return "Share cancelled. The MP4 is still ready — share it or save it.";
    case "unsupported":
      return "This browser can't share this file directly. Tap Save MP4, then attach the saved video in WhatsApp.";
    case "failed":
      return outcome.name === "NotAllowedError"
        ? `This phone's browser refused to share this ${mb(bytes)} MP4 directly. Tap Save MP4, then attach the saved video in WhatsApp.`
        : `Sharing didn't work (${outcome.name}). Tap Save MP4, then attach the saved video in WhatsApp.`;
  }
}

export default function MontageExportPanel({
  project,
  source,
  audioTrackId,
  clipExportBusy,
  onPickVideo,
  engine,
}: {
  project: MontageProject;
  /** The match video Match Clipper has open for this montage, or null. */
  source: File | null;
  /** Commentary track chosen in Match Clipper; null = the video's primary audio track. */
  audioTrackId: number | null;
  clipExportBusy: boolean;
  onPickVideo: (file: File) => string | null;
  /** For tests; the real engine is loaded on first use. */
  engine?: ExportEngine;
}) {
  const s = useExportSession();
  const [notice, setNotice] = useState<RunMarker | null>(() => interruptedRun());
  const [pickError, setPickError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wake = useRef<WakeSentinel | null>(null);
  const mine = s.phase !== "idle" && s.montageId === project.id;
  const seconds = project.items.reduce((n, i) => n + (i.end - i.start), 0);
  const limit = exportLimitSeconds();
  const estimate = Math.round(((VIDEO_BITRATE + AUDIO_BITRATE) / 8) * seconds * 1.02);

  // Leftovers from earlier visits or interrupted runs are deleted once per page load.
  useEffect(() => {
    if (cleaned || session.phase !== "idle") return;
    cleaned = true;
    void cleanExportFiles(null);
  }, []);

  useEffect(() => {
    if (s.phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
    };
  }, [s.phase]);

  const sourceStale = s.phase === "failed" && s.code === "source_unreadable" && s.source === source;
  const blocker = !project.items.length
    ? "Add clips to the montage first."
    : seconds > limit + 0.5
      ? `Montages can be exported up to ${Math.round(limit / 60)} minutes for now; this one is ${length(seconds)}. Remove or trim clips to export it.`
      : !source
        ? "Select the match video above to create the MP4."
        : sourceStale
          ? "Choose the match video again first (below)."
          : clipExportBusy
            ? "Wait for the clip export in Match Clipper to finish."
            : s.phase === "running" && !mine
              ? `“${s.montageName}” is being exported. One montage at a time.`
              : null;

  const start = async () => {
    if (blocker || !source || s.phase === "running") return;
    setNotice(null);
    const abort = new AbortController();
    const base = { montageId: project.id, montageName: project.name };
    setSession({ phase: "running", ...base, progress: { stage: "checking", fraction: 0, clip: 0, clips: project.items.length }, startedAt: Date.now(), abort });
    markRunStarted({ ...base, startedAt: Date.now() });
    wake.current = await requestWake();
    const signature = montageSignature(project);
    try {
      await cleanExportFiles(null); // the previous export (if any) is replaced
      const eng = engine ?? (await loadRealEngine());
      const result = await eng.exportMontage(source, {
        ranges: project.items.map((i) => ({ start: i.start, end: i.end })),
        maxSeconds: limit,
        audioTrackId,
        fileName: `montage-${Date.now()}.mp4`,
        signal: abort.signal,
        onProgress: (progress) => session.phase === "running" && session.abort === abort && setSession({ ...session, progress }),
      });
      setSession({ phase: "done", ...base, signature, result, shareFile: makeClipFile(result.file, `${safeName(project.name)}.mp4`), share: null });
    } catch (err) {
      const e = err as { code?: MontageExportErrorCode; message?: string; detail?: string | null };
      setSession({ phase: "failed", ...base, code: e.code ?? "failed", message: e.message ?? "The montage couldn't be built.", detail: e.detail ?? null, source });
    } finally {
      markRunEnded();
      await wake.current?.release().catch(() => undefined);
      wake.current = null;
    }
  };

  const share = () => {
    if (session.phase !== "done") return;
    const current = session;
    // Called straight from the tap: nothing is awaited before the share sheet opens.
    void shareClipFile(current.shareFile).then((outcome) => {
      if (session === current) setSession({ ...current, share: shareMessage(outcome, current.result.bytes) });
    });
  };
  const save = () => {
    if (s.phase !== "done") return;
    downloadClipBlob(s.result.file, CLIP_MP4_MIME, safeName(project.name));
    setSession({ ...s, share: "Saving to your phone's Downloads. You can attach it from there in WhatsApp." });
  };
  const discard = async () => {
    if (s.phase !== "done") return;
    if (s.result.storedName) await removeExportFile(s.result.storedName);
    setSession({ phase: "idle" });
  };

  const tip = source && looksLikePickerMediaId(source.name);

  return (
    <div className="mw-card" aria-label="Create MP4" role="region">
      <p className="mw-strong">Create MP4</p>
      <p className="mw-muted">720p · {length(seconds)} · about {mb(estimate)}</p>
      {notice && (
        <p className="mw-banner mw-warn" role="status">
          The last export (“{notice.montageName}”) didn't finish — the page was closed or the phone stopped it. Nothing was kept; create it again.
        </p>
      )}

      {mine && s.phase === "running" ? (
        <>
          <p className="mw-strong" role="status" data-testid="export-progress">
            {s.progress.stage === "checking" ? "Checking the clips…" : s.progress.stage === "verifying" ? "Checking the finished MP4…" : `Building clip ${s.progress.clip} of ${s.progress.clips}…`} {Math.round(s.progress.fraction * 100)}%
          </p>
          <progress className="mw-progress" max={1} value={s.progress.fraction} aria-label="Export progress" />
          <p className="mw-muted">
            {length((now - s.startedAt) / 1000)} elapsed
            {s.progress.fraction > 0.08 && now - s.startedAt > 10000 ? ` · about ${length(((now - s.startedAt) / 1000) * (1 / s.progress.fraction - 1))} left` : ""} · keep PáircVision open and the screen on until it finishes.
          </p>
          <button type="button" className="mw-ghost" onClick={() => s.abort.abort()}>Cancel export</button>
        </>
      ) : mine && s.phase === "done" ? (
        <>
          <p className="mw-strong" data-testid="export-done">
            MP4 ready · {mb(s.result.bytes)} · {length(s.result.seconds)} · {s.result.width}×{s.result.height}
          </p>
          <p className="mw-muted">Commentary checked: all {s.result.verify.clips.length} clips' audio is in the MP4, unchanged.</p>
          {s.signature !== montageSignature(project) && (
            <p className="mw-banner mw-warn" role="status">You've changed the montage since this MP4 was made. Create MP4 again to include the changes.</p>
          )}
          <div className="mw-row">
            <button type="button" className="mw-primary" onClick={save}>Save MP4</button>
            <button type="button" className="mw-ghost" onClick={share}>Share</button>
            <button type="button" className="mw-ghost" onClick={() => void discard()}>Delete export</button>
          </div>
          {s.share && <p className="mw-muted" role="status" data-testid="export-handoff">{s.share}</p>}
          <details className="mw-muted">
            <summary>Details</summary>
            Built in {length(s.result.elapsedMs / 1000)} · {(s.result.actualBitrate / 1e6).toFixed(1)} Mbps average (target 3.1, {s.result.bitrateMode} bitrate) · estimate was {mb(s.result.estimateBytes)} · audio {s.result.audioCodec ?? "AAC"} copied · joins starting on a keyframe {s.result.verify.joinsOnKeyframe}/{s.result.verify.joins}
          </details>
          <button type="button" className="mw-link" onClick={() => void start()} disabled={!!blocker}>Create MP4 again</button>
        </>
      ) : (
        <>
          {mine && s.phase === "failed" && (
            <div className="mw-banner mw-bad" role="alert">
              <p className="mw-strong">{s.code === "cancelled" ? "Export cancelled. Nothing was kept." : s.message}</p>
              {s.detail && <p className="mw-muted">{s.detail}</p>}
            </div>
          )}
          {sourceStale && (
            <>
              <p className="mw-muted">
                The phone may stop letting the browser read a video it handed over earlier. Choosing it again fixes that. On Samsung, choosing it from “From this device” (or the Files app) has worked where Gallery/Photos selections stopped part-way.
              </p>
              <label className="mw-file">
                Choose the match video again
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/*"
                  className="mw-hidden"
                  aria-label="Choose the match video again"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (`${f.name}::${f.size}` !== project.sourceKey) {
                      setPickError(`That's a different video (${f.name}). This montage was made from “${project.sourceName}”.`);
                      return;
                    }
                    setPickError(onPickVideo(f));
                  }}
                />
              </label>
              {pickError && <p className="mw-error" role="alert">{pickError}</p>}
            </>
          )}
          {tip && !sourceStale && (
            <p className="mw-muted">Tip: “{source!.name}” looks like it came from Gallery/Photos. If the export stops with “couldn't read the match video”, choose the video from “From this device” or the Files app instead.</p>
          )}
          {blocker && <p className="mw-muted" data-testid="export-blocker">{blocker}</p>}
          <button type="button" className="mw-primary" onClick={() => void start()} disabled={!!blocker}>Create MP4</button>
          <p className="mw-muted">The commentary is copied exactly as it is in the match video. Keep the phone awake with PáircVision open while it builds.</p>
        </>
      )}
    </div>
  );
}
