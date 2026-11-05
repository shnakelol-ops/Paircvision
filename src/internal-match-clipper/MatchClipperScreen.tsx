import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadClipBlob } from "../features/shared/mediaClipExport";
import { CLIP_MP4_MIME, makeClipFile, shareClipFile, shareOutcomeMessage, shareSupport, type ShareOutcome } from "./clip-share";
import {
  ClipExportError,
  exportClip as defaultExportClip,
  probeSource as defaultProbeSource,
  type AudioTrackInfo,
  type ExportedClip,
  type SourceProbe,
} from "./clip-export";
import {
  cleanClipName,
  loadClipperStore,
  removeProject,
  saveClipperStore,
  upsertProject,
  type SaveResult,
} from "./clip-storage";
import {
  CLIP_CATEGORIES,
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  categoryLabel,
  newClipId,
  sourceKey,
  type ClipCategory,
  type ClipProject,
  type ClipSelection,
  type ClipperStoreV1,
} from "./clip-types";
import {
  DEFAULT_TIMESTAMP_SETTINGS,
  formatClock,
  formatPrecise,
  parseTimestamp,
  parseTimestampList,
  type TimestampParseError,
} from "./timestamp-parse";
import { buildZip } from "./zip-store";
import { isAudible } from "./audio-level";
import {
  buildReport,
  collectEnvironment,
  readPlayback,
  runReadChecks,
  type EnvironmentInfo,
  type ReadCheck,
} from "./diagnostics";
import { clipFilename, safeFilename } from "./clip-files";

/** Batches estimated above this get an explicit "export anyway" step (ZIPs are built in memory). */
const LARGE_BATCH_BYTES = 300 * 1024 * 1024;

export interface ClipperEngine {
  probe: (file: Blob) => Promise<SourceProbe>;
  exportClip: typeof defaultExportClip;
}

const DEFAULT_ENGINE: ClipperEngine = { probe: defaultProbeSource, exportClip: defaultExportClip };

type ClipResult =
  /** `file` wraps the exported blob once (no copy) and is reused for every Share/Save tap. */
  | { id: string; status: "done"; clip: ExportedClip; filename: string; file: File }
  | { id: string; status: "failed"; message: string; error: ClipExportError | null }
  | { id: string; status: "skipped"; reason?: string };

interface ExportJob {
  kind: "single" | "batch";
  ids: string[];
  index: number;
  progress: number;
  results: ClipResult[];
  state: "running" | "finished" | "canceled";
}

function navigateToInternal() {
  if (typeof window !== "undefined") window.location.assign("/internal");
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type WakeLockLike = { release: () => Promise<void> };
async function requestWakeLock(): Promise<WakeLockLike | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

export default function MatchClipperScreen({ engine = DEFAULT_ENGINE }: { engine?: ClipperEngine }) {
  const initial = useMemo(() => loadClipperStore(), []);
  const [store, setStoreState] = useState<ClipperStoreV1>(initial.store);
  const storeRef = useRef<ClipperStoreV1>(initial.store);
  const [storeUnreadable] = useState(initial.status === "unreadable");
  const [saveResult, setSaveResult] = useState<SaveResult>({ ok: true });

  const lastProject = useMemo(
    () => initial.store.projects.find((p) => p.key === initial.store.lastProjectKey) ?? null,
    [initial],
  );
  const [project, setProject] = useState<ClipProject | null>(lastProject);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [probe, setProbe] = useState<SourceProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  /** Playback decoded audio although the file check found none — never export silently then. */
  const [audioContradiction, setAudioContradiction] = useState(false);
  const [lastError, setLastError] = useState<ClipExportError | null>(null);
  const [readChecks, setReadChecks] = useState<ReadCheck[] | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentInfo | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  /** Outcome of the last Share Clip / Save MP4 tap for the finished export. */
  const [handoff, setHandoff] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  /** Audio track exports use; preset to the probe's pick (the track that actually has sound). */
  const [audioTrackId, setAudioTrackId] = useState<number | null>(null);
  /** Playback position to return to after reselecting the same video. */
  const resumeAt = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previewEnd = useRef<number | null>(null);

  const [markStart, setMarkStart] = useState<number | null>(null);
  const [markEnd, setMarkEnd] = useState<number | null>(null);
  const [manualCategory, setManualCategory] = useState<ClipCategory>("other");
  const [markError, setMarkError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [tsText, setTsText] = useState("");
  const [tsPreRoll, setTsPreRoll] = useState(String(DEFAULT_TIMESTAMP_SETTINGS.preRoll));
  const [tsDuration, setTsDuration] = useState(String(DEFAULT_TIMESTAMP_SETTINGS.duration));
  const [tsCategory, setTsCategory] = useState<ClipCategory>(DEFAULT_TIMESTAMP_SETTINGS.category);
  const [tsErrors, setTsErrors] = useState<TimestampParseError[]>([]);

  const [job, setJob] = useState<ExportJob | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [largeBatchConfirm, setLargeBatchConfirm] = useState(false);

  const clips = project?.clips ?? [];
  const fileReady = file !== null && project !== null && project.key === sourceKey(file.name, file.size);
  const exportBlocker = !fileReady
    ? "Select the match video to export."
    : probing
      ? "Checking the video…"
      : probe?.blocker?.message ??
        (audioContradiction
          ? "Playback found sound in this video, but the export check found no audio track. Export is turned off rather than making silent clips — copy the diagnostics below and send them to the team."
          : null);
  const busy = job?.state === "running";

  // ── Persistence ────────────────────────────────────────────────────────
  /** Every change is written to storage immediately and read back. */
  const persistStore = useCallback((next: ClipperStoreV1) => {
    storeRef.current = next;
    setStoreState(next);
    setSaveResult(saveClipperStore(next));
  }, []);

  const commitProject = useCallback(
    (next: ClipProject) => {
      const stamped = { ...next, updatedAt: Date.now() };
      setProject(stamped);
      persistStore(upsertProject(storeRef.current, stamped));
    },
    [persistStore],
  );

  const updateClips = useCallback(
    (fn: (clips: ClipSelection[]) => ClipSelection[]) => {
      if (!project) return;
      commitProject({ ...project, clips: fn(project.clips) });
    },
    [project, commitProject],
  );

  // ── Source video ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const onPickFile = (picked: File | null) => {
    if (!picked || busy) return;
    const key = sourceKey(picked.name, picked.size);
    const existing = storeRef.current.projects.find((p) => p.key === key) ?? null;
    const sameVideo = file !== null && sourceKey(file.name, file.size) === key;
    resumeAt.current = sameVideo ? (videoRef.current?.currentTime ?? currentTime) : null;
    const next: ClipProject = existing ?? {
      key,
      fileName: picked.name,
      fileSize: picked.size,
      duration: null,
      clips: [],
      updatedAt: Date.now(),
    };
    setFile(picked);
    setVideoUrl(URL.createObjectURL(picked));
    setDuration(null);
    setCurrentTime(sameVideo ? currentTime : 0);
    if (!sameVideo) {
      setMarkStart(null);
      setMarkEnd(null);
      setSelected(new Set());
      setEditingId(null);
    }
    setJob(null); // changing or reselecting the video releases any exported clips
    setHandoff(null);
    setMismatch(null);
    setAudioContradiction(false);
    setLastError(null);
    setReadChecks(null);
    setProject(next);
    if (sameVideo) {
      setNotice("Video reselected — your clips and position are kept.");
    } else if (existing) {
      setNotice(existing.clips.length ? `Restored ${existing.clips.length} saved clip${existing.clips.length === 1 ? "" : "s"} for this match.` : null);
      persistStore({ ...storeRef.current, lastProjectKey: key });
    } else {
      setNotice(null);
    }
    setProbe(null);
    setProbing(true);
    engine
      .probe(picked)
      .then((p) => {
        setProbe(p);
        setAudioTrackId(p.audioTrackId);
        // Diagnostics only — never blocks or changes the workflow.
        void runReadChecks(picked).then(setReadChecks).catch(() => undefined);
        void collectEnvironment(p.width, p.height).then(setEnvironment).catch(() => undefined);
      })
      .catch((err: unknown) =>
        setProbe({
          duration: 0, width: 0, height: 0, videoCodec: null, audioCodec: null, hasAudio: false, scan: null, readFailure: null,
          audioTracks: [], audioTrackId: null,
          blocker: {
            code: "failed",
            message: "This video couldn't be checked for export. Playback may still work.",
            detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          },
        }),
      )
      .finally(() => setProbing(false));
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || !project) return;
    setDuration(v.duration);
    if (resumeAt.current !== null) {
      v.currentTime = Math.min(resumeAt.current, v.duration);
      setCurrentTime(v.currentTime);
      resumeAt.current = null;
    }
    if (project.duration !== null && Math.abs(project.duration - v.duration) > 1) {
      setMismatch(
        `This file is ${formatClock(v.duration)} long but the saved clips were made on a ${formatClock(project.duration)} video. Check that it's the same match.`,
      );
    }
    if (project.duration === null) {
      // Remember the length so a different file with the same name/size is caught later.
      const next = { ...project, duration: v.duration };
      if (project.clips.length) commitProject(next);
      else setProject(next);
    }
  };

  // ── Playback ───────────────────────────────────────────────────────────
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (probe && !probe.hasAudio && !audioContradiction && (readPlayback(v).audioDecodedBytes ?? 0) > 0) {
      setAudioContradiction(true);
    }
    if (previewEnd.current !== null && v.currentTime >= previewEnd.current) {
      v.pause();
      previewEnd.current = null;
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    previewEnd.current = null;
    // Clamp to [0, duration]; works the same whether playing or paused.
    const max = duration ?? (Number.isFinite(v.duration) ? v.duration : v.currentTime);
    v.currentTime = Math.max(0, Math.min(max, v.currentTime + delta));
    setCurrentTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    previewEnd.current = null;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  const preview = (clip: ClipSelection) => {
    const v = videoRef.current;
    if (!v || !fileReady) return;
    v.currentTime = clip.start;
    previewEnd.current = clip.end;
    // On phones the player isn't sticky — bring it back into view to watch.
    v.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    void v.play().catch(() => undefined);
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    previewEnd.current = null;
    v.currentTime = t;
    setCurrentTime(t);
  };

  // ── Manual marking ─────────────────────────────────────────────────────
  const now = () => round1(videoRef.current?.currentTime ?? currentTime);

  const onMarkStart = () => {
    setMarkError(null);
    const t = now();
    setMarkStart(t);
    if (markEnd !== null && markEnd <= t) setMarkEnd(null);
  };

  const onMarkEnd = () => {
    setMarkError(null);
    const t = now();
    if (markStart !== null && t <= markStart) {
      setMarkError("End must be after the start. Play on a little, then mark the end.");
      return;
    }
    setMarkEnd(t);
  };

  const onSaveClip = () => {
    if (!project) return;
    if (markStart === null) {
      setMarkError("Mark the start first.");
      return;
    }
    const end = markEnd ?? now();
    const span = end - markStart;
    if (span < MIN_CLIP_SECONDS) {
      setMarkError(markEnd === null ? "Mark the end (or play on) before saving." : "Clip is too short.");
      return;
    }
    if (span > MAX_CLIP_SECONDS) {
      setMarkError(`Clips can be up to ${MAX_CLIP_SECONDS / 60} minutes long.`);
      return;
    }
    const clip: ClipSelection = {
      id: newClipId(),
      name: `${categoryLabel(manualCategory)} · ${formatClock(markStart)}`,
      category: manualCategory,
      start: markStart,
      end,
      origin: "manual",
      createdAt: Date.now(),
    };
    commitProject({ ...project, duration: project.duration ?? duration, clips: [...project.clips, clip] });
    setMarkStart(null);
    setMarkEnd(null);
    setMarkError(null);
    setNotice(`Saved clip ${project.clips.length + 1}: ${formatPrecise(clip.start)}–${formatPrecise(clip.end)}.`);
  };

  // ── Timestamp sheet ────────────────────────────────────────────────────
  const onAddTimestamps = () => {
    if (!project) return;
    const preRoll = Number(tsPreRoll);
    const length = Number(tsDuration);
    if (!Number.isFinite(preRoll) || preRoll < 0 || preRoll > 60) {
      setTsErrors([{ line: 0, text: tsPreRoll, reason: "Seconds before must be between 0 and 60" }]);
      return;
    }
    if (!Number.isFinite(length) || length < MIN_CLIP_SECONDS || length > MAX_CLIP_SECONDS) {
      setTsErrors([{ line: 0, text: tsDuration, reason: `Clip length must be between ${MIN_CLIP_SECONDS} and ${MAX_CLIP_SECONDS} seconds` }]);
      return;
    }
    const { entries, errors } = parseTimestampList(tsText, { preRoll, duration: length, category: tsCategory }, duration);
    setTsErrors(errors);
    if (!entries.length) {
      if (!errors.length) setTsErrors([{ line: 0, text: "", reason: "Enter at least one time, e.g. 25:30" }]);
      return;
    }
    const created = Date.now();
    const newClips: ClipSelection[] = entries.map((e, i) => ({
      id: newClipId(),
      name: cleanClipName(e.label) || `${categoryLabel(e.category)} · ${formatClock(e.timestamp)}`,
      category: e.category,
      start: e.start,
      end: e.end,
      origin: "timestamp",
      createdAt: created + i,
    }));
    commitProject({ ...project, duration: project.duration ?? duration, clips: [...project.clips, ...newClips] });
    setNotice(`Added ${newClips.length} clip${newClips.length === 1 ? "" : "s"} from timestamps.`);
    if (!errors.length) {
      setTsText("");
      setSheetOpen(false);
    } else {
      // Keep only the lines that need fixing in the box.
      const bad = new Set(errors.map((e) => e.line));
      setTsText(tsText.split(/\r?\n/).filter((_, i) => bad.has(i + 1)).join("\n"));
    }
  };

  // ── Clip editing ───────────────────────────────────────────────────────
  const patchClip = (id: string, patch: Partial<ClipSelection>) => {
    updateClips((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        const max = duration ?? project?.duration ?? Infinity;
        next.start = Math.max(0, Math.min(next.start, max));
        next.end = Math.max(0, Math.min(next.end, max));
        if (next.end - next.start < MIN_CLIP_SECONDS || next.end - next.start > MAX_CLIP_SECONDS) return c;
        return next;
      }),
    );
  };

  const moveClip = (id: string, delta: -1 | 1) => {
    updateClips((list) => {
      const i = list.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  };

  const deleteClip = (id: string) => {
    updateClips((list) => list.filter((c) => c.id !== id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setConfirmDeleteId(null);
    setEditingId(null);
  };

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ── Export ─────────────────────────────────────────────────────────────
  const runExport = async (kind: "single" | "batch", ids: string[]) => {
    if (!file || exportBlocker || busy || !project) return;
    const ordered = project.clips.filter((c) => ids.includes(c.id));
    if (!ordered.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLargeBatchConfirm(false);
    const wake = await requestWakeLock();
    const results: ClipResult[] = [];
    // Starting a new export releases the previous one's clips (the old job is replaced).
    setHandoff(null);
    setJob({ kind, ids: ordered.map((c) => c.id), index: 0, progress: 0, results: [], state: "running" });
    /** Set once the phone refuses to read the video: later clips would fail the same way. */
    let fileLost = false;
    try {
      for (let i = 0; i < ordered.length; i++) {
        const clip = ordered[i]!;
        if (controller.signal.aborted) {
          results.push({ id: clip.id, status: "skipped" });
          continue;
        }
        if (fileLost) {
          results.push({ id: clip.id, status: "skipped", reason: "not exported — reselect the video first" });
          continue;
        }
        setJob((j) => (j ? { ...j, index: i, progress: 0, results: [...results] } : j));
        try {
          let shown = 0;
          const out = await engine.exportClip(file, { start: clip.start, end: clip.end }, {
            signal: controller.signal,
            allowSilentSource: probe?.hasAudio === false,
            audioTrackId,
            // Re-render at most every 4%, not on every encoded frame.
            onProgress: (p) => {
              if (p - shown < 0.04 && p < 1) return;
              shown = p;
              setJob((j) => (j ? { ...j, progress: p } : j));
            },
          });
          const position = project.clips.findIndex((c) => c.id === clip.id);
          const filename = clipFilename(position, clip);
          results.push({ id: clip.id, status: "done", clip: out, filename, file: makeClipFile(out.blob, filename) });
        } catch (err) {
          if (err instanceof ClipExportError && err.code === "canceled") {
            results.push({ id: clip.id, status: "skipped" });
          } else {
            const error = err instanceof ClipExportError ? err : null;
            if (error) setLastError(error);
            if (error?.code === "file_unreadable") fileLost = true;
            results.push({ id: clip.id, status: "failed", message: err instanceof Error ? err.message : "Export failed.", error });
          }
        }
      }
    } finally {
      void wake?.release().catch(() => undefined);
      abortRef.current = null;
      setJob((j) =>
        j ? { ...j, index: ordered.length, progress: 1, results: [...results], state: controller.signal.aborted ? "canceled" : "finished" } : j,
      );
    }
  };

  const startBatch = () => {
    const ids = clips.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (!ids.length || !file) return;
    const seconds = clips.filter((c) => selected.has(c.id)).reduce((n, c) => n + (c.end - c.start), 0);
    const bytesPerSecond = probe && probe.duration > 0 ? file.size / probe.duration : 0;
    if (!largeBatchConfirm && seconds * bytesPerSecond * 1.5 > LARGE_BATCH_BYTES) {
      setLargeBatchConfirm(true);
      return;
    }
    void runExport("batch", ids);
  };

  const doneResults = (job?.results ?? []).filter((r): r is Extract<ClipResult, { status: "done" }> => r.status === "done");

  const saveZip = async () => {
    if (!doneResults.length) return;
    const entries = await Promise.all(
      doneResults.map(async (r) => ({ name: r.filename, data: new Uint8Array(await r.clip.blob.arrayBuffer()) })),
    );
    let zip: Blob;
    try {
      zip = buildZip(entries);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't build the ZIP.");
      return;
    }
    const base = safeFilename((project?.fileName ?? "match").replace(/\.[^.]+$/, "")) || "match";
    const filename = `${base} clips.zip`;
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  };

  const filenamePrefix = (r: Extract<ClipResult, { status: "done" }>) => r.filename.replace(/\.mp4$/, "");

  /** Called straight from the tap — nothing is awaited before navigator.share, so it counts as a user gesture. */
  const onShareClip = (r: Extract<ClipResult, { status: "done" }>) => {
    if (sharing) return;
    setSharing(true);
    setHandoff(null);
    void shareClipFile(r.file)
      .then((outcome: ShareOutcome) =>
        setHandoff({
          tone: outcome.status === "shared" ? "ok" : outcome.status === "cancelled" ? "warn" : "bad",
          text: shareOutcomeMessage(outcome),
        }),
      )
      .finally(() => setSharing(false));
  };

  const onSaveMp4 = (r: Extract<ClipResult, { status: "done" }>) => {
    downloadClipBlob(r.clip.blob, CLIP_MP4_MIME, filenamePrefix(r));
    setHandoff({ tone: "ok", text: "MP4 saved — look in your Downloads folder." });
  };

  const closeJob = () => {
    // Drops the exported clips: nothing else holds them, so the memory is released.
    setJob(null);
    setHandoff(null);
  };

  const diagnosticsReport = () =>
    buildReport({ file, probe, readChecks, environment, playback: file ? readPlayback(videoRef.current) : null, lastError });

  const copyDiagnostics = async () => {
    const text = diagnosticsReport();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Diagnostics copied — paste them into a message to the team.");
    } catch {
      setCopyStatus("Couldn't copy automatically — open Diagnostics, press and hold the text, then Select all and Copy.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const savedOther = store.projects.filter((p) => p.key !== project?.key && p.clips.length > 0);
  const selectedCount = clips.filter((c) => selected.has(c.id)).length;
  const jobClip = job && job.state === "running" ? clips.find((c) => c.id === job.ids[job.index]) : null;

  return (
    <div className="mc-shell">
      <style>{CSS}</style>
      <div className="mc-content">
        <div className="mc-top">
          <button type="button" className="mc-ghost" onClick={navigateToInternal}>
            ← Internal
          </button>
          <h1 className="mc-title">Match Clipper</h1>
        </div>

        {storeUnreadable && (
          <p className="mc-banner mc-banner-bad" role="alert">
            Saved clip lists on this device couldn't be read. They have been left untouched, and new clips won't be saved until this is fixed.
          </p>
        )}
        {!saveResult.ok && !storeUnreadable && (
          <p className="mc-banner mc-banner-bad" role="alert">
            {saveResult.reason === "full"
              ? "This device's storage is full — the latest clip changes weren't saved."
              : "The latest clip changes couldn't be saved on this device."}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/*"
          className="mc-hidden"
          aria-label="Match video file"
          onChange={(e) => {
            onPickFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {!file && (
          <div className="mc-card">
            {project ? (
              <>
                <p className="mc-strong">Reselect “{project.fileName}” to continue</p>
                <p className="mc-muted">
                  {project.clips.length} saved clip{project.clips.length === 1 ? "" : "s"} · {formatBytes(project.fileSize)}. The match video stays on your phone — PáircVision doesn't store or upload it, so choose it again after reopening.
                </p>
              </>
            ) : (
              <p className="mc-muted">Open a full match video from this phone. It stays on the device — nothing is uploaded.</p>
            )}
            <button type="button" className="mc-primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              {project ? "Reselect match video" : "Open match video"}
            </button>
          </div>
        )}

        {file && videoUrl && (
          <div className="mc-player">
            <video
              ref={videoRef}
              className="mc-video"
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onSeeked={onTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <div className="mc-time" aria-live="off">
              <span>{formatPrecise(currentTime)}</span>
              <span className="mc-muted">{duration ? formatClock(duration) : "--:--"}</span>
            </div>
            <div className="mc-transport">
              <button type="button" className="mc-ctl mc-ctl-seek" onClick={() => seekBy(-10)} aria-label="Rewind 10 seconds">−10s</button>
              <button type="button" className="mc-ctl mc-ctl-seek" onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
              <button type="button" className="mc-ctl mc-ctl-seek" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">+10s</button>
            </div>
            <div className="mc-controls">
              <button type="button" className="mc-ctl mc-ctl-mark" onClick={onMarkStart}>Mark Start</button>
              <button type="button" className="mc-ctl mc-ctl-mark" onClick={onMarkEnd}>Mark End</button>
              <button type="button" className="mc-ctl mc-ctl-save" onClick={onSaveClip}>Save Clip</button>
            </div>
            <div className="mc-marks">
              <MarkField label="Start" value={markStart} onNudge={(d) => markStart !== null && setMarkStart(round1(Math.max(0, markStart + d)))} onSeek={seekTo} />
              <MarkField label="End" value={markEnd} onNudge={(d) => markEnd !== null && setMarkEnd(round1(Math.max(0, markEnd + d)))} onSeek={seekTo} />
            </div>
            <div className="mc-chips" role="radiogroup" aria-label="Category for the next clip">
              {CLIP_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={manualCategory === c.id}
                  className={`mc-chip${manualCategory === c.id ? " mc-chip-on" : ""}`}
                  onClick={() => setManualCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {markError && <p className="mc-error" role="alert">{markError}</p>}
          </div>
        )}

        {file && (
          <div className="mc-row">
            <button type="button" className="mc-secondary" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
              {sheetOpen ? "Close timestamps" : "Add timestamps"}
            </button>
            <button type="button" className="mc-ghost" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              Change video
            </button>
          </div>
        )}

        {file && probe?.blocker && <p className="mc-banner mc-banner-bad" role="alert">{probe.blocker.message}</p>}
        {file && probe && !probe.blocker && !probe.hasAudio && (
          <p className="mc-banner mc-banner-warn" role="alert">
            This match video has no audio track, so exported clips will have no sound.
            {probe.scan && probe.scan.tracks.length > 0 && (
              <> The file only lists: {probe.scan.tracks.map((t) => `${t.handler ?? "?"} (${t.sampleEntry ?? "?"})`).join(", ")}.</>
            )}
          </p>
        )}
        {mismatch && <p className="mc-banner mc-banner-warn" role="alert">{mismatch}</p>}
        {file && probe && probe.audioTracks.length > 1 && (
          <div className="mc-card" role="radiogroup" aria-label="Clip audio">
            <p className="mc-strong">Clip audio</p>
            <p className="mc-muted">This video has {probe.audioTracks.length} audio tracks. Clips use the one selected here.</p>
            <div className="mc-chips mc-wrap">
              {probe.audioTracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={audioTrackId === t.id}
                  className={`mc-chip${audioTrackId === t.id ? " mc-chip-on" : ""}`}
                  onClick={() => setAudioTrackId(t.id)}
                  disabled={busy}
                >
                  {audioTrackLabel(t)}
                </button>
              ))}
            </div>
          </div>
        )}
        {file && probe && !probe.blocker && probe.audioTracks.length > 0 && probe.audioTracks.every((t) => t.levelDb !== null && !isAudible(t.levelDb)) && (
          <p className="mc-banner mc-banner-warn" role="alert">
            The audio in this video was silent at all three points checked (20%, 50% and 80% of the match). Clips will be checked for sound when exported.
          </p>
        )}
        {notice && <p className="mc-banner" role="status">{notice}</p>}

        {sheetOpen && file && (
          <div className="mc-card">
            <label className="mc-label" htmlFor="mc-ts">Timestamps — one per line (MM:SS or HH:MM:SS), optionally followed by a category and a name</label>
            <textarea
              id="mc-ts"
              className="mc-textarea"
              rows={5}
              value={tsText}
              placeholder={"25:30 score Conor point\n41:10 kickout\n1:02:03 hit Big hit"}
              onChange={(e) => setTsText(e.target.value)}
            />
            <div className="mc-grid3">
              <label className="mc-label">
                Seconds before
                <input className="mc-input" inputMode="decimal" value={tsPreRoll} onChange={(e) => setTsPreRoll(e.target.value)} aria-label="Seconds before timestamp" />
              </label>
              <label className="mc-label">
                Clip length (s)
                <input className="mc-input" inputMode="decimal" value={tsDuration} onChange={(e) => setTsDuration(e.target.value)} aria-label="Clip length in seconds" />
              </label>
              <label className="mc-label">
                Default category
                <select className="mc-input" value={tsCategory} onChange={(e) => setTsCategory(e.target.value as ClipCategory)} aria-label="Default category">
                  {CLIP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            {tsErrors.length > 0 && (
              <ul className="mc-error-list" role="alert">
                {tsErrors.map((e, i) => (
                  <li key={i}>{e.line > 0 ? `Line ${e.line} “${e.text}”: ` : ""}{e.reason}</li>
                ))}
              </ul>
            )}
            <button type="button" className="mc-primary" onClick={onAddTimestamps}>Add clips</button>
          </div>
        )}

        {project && (
          <div className="mc-list-head">
            <h2 className="mc-h2">Clips ({clips.length})</h2>
            {clips.length > 0 && (
              <button
                type="button"
                className="mc-ghost"
                onClick={() => setSelected(selectedCount === clips.length ? new Set() : new Set(clips.map((c) => c.id)))}
              >
                {selectedCount === clips.length ? "Select none" : "Select all"}
              </button>
            )}
          </div>
        )}
        {project && clips.length === 0 && <p className="mc-muted">No clips yet. Mark a start and end, then Save Clip — or add timestamps.</p>}

        <ol className="mc-list">
          {clips.map((clip, i) => (
            <li key={clip.id} className="mc-clip">
              <div className="mc-clip-main">
                <input
                  type="checkbox"
                  className="mc-check"
                  checked={selected.has(clip.id)}
                  onChange={() => toggleSelected(clip.id)}
                  aria-label={`Select ${clip.name}`}
                />
                <button type="button" className="mc-clip-info" onClick={() => setEditingId(editingId === clip.id ? null : clip.id)} aria-expanded={editingId === clip.id}>
                  <span className="mc-clip-name">{i + 1}. {clip.name}</span>
                  <span className="mc-clip-sub">
                    {categoryLabel(clip.category)} · {formatPrecise(clip.start)}–{formatPrecise(clip.end)} ({(clip.end - clip.start).toFixed(1)}s)
                  </span>
                </button>
              </div>
              <div className="mc-clip-actions">
                <button type="button" className="mc-mini" onClick={() => preview(clip)} disabled={!fileReady} aria-label={`Preview ${clip.name}`}>▶</button>
                <button type="button" className="mc-mini" onClick={() => moveClip(clip.id, -1)} disabled={i === 0} aria-label={`Move ${clip.name} up`}>↑</button>
                <button type="button" className="mc-mini" onClick={() => moveClip(clip.id, 1)} disabled={i === clips.length - 1} aria-label={`Move ${clip.name} down`}>↓</button>
                <button type="button" className="mc-mini" onClick={() => void runExport("single", [clip.id])} disabled={!!exportBlocker || busy} aria-label={`Export ${clip.name}`}>Export</button>
              </div>
              {editingId === clip.id && (
                <ClipEditor
                  clip={clip}
                  canUseCurrent={fileReady}
                  currentTime={currentTime}
                  confirmDelete={confirmDeleteId === clip.id}
                  onPatch={(p) => patchClip(clip.id, p)}
                  onDelete={() => (confirmDeleteId === clip.id ? deleteClip(clip.id) : setConfirmDeleteId(clip.id))}
                  onDone={() => {
                    setEditingId(null);
                    setConfirmDeleteId(null);
                  }}
                />
              )}
            </li>
          ))}
        </ol>

        {clips.length > 0 && (
          <div className="mc-card">
            {largeBatchConfirm && (
              <p className="mc-banner mc-banner-warn" role="alert">
                These clips are long — the ZIP may be over {formatBytes(LARGE_BATCH_BYTES)}, which can be slow or fail on some phones. Export fewer at a time, or tap again to continue.
              </p>
            )}
            <button type="button" className="mc-primary" onClick={startBatch} disabled={!selectedCount || !!exportBlocker || busy}>
              {largeBatchConfirm ? "Export anyway" : selectedCount ? `Export ${selectedCount} selected as ZIP` : "Select clips to export as ZIP"}
            </button>
            {exportBlocker && fileReady === false && <p className="mc-muted">{exportBlocker}</p>}
          </div>
        )}

        {job && (
          <div className="mc-job" role="region" aria-label="Export">
            {job.state === "running" ? (
              <>
                <p className="mc-strong">
                  Exporting {job.kind === "batch" ? `${job.index + 1} of ${job.ids.length}` : "clip"}
                  {jobClip ? ` — ${jobClip.name}` : ""}
                </p>
                <div className="mc-bar"><div className="mc-bar-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
                <p className="mc-muted">Keep PáircVision open until this finishes.</p>
                <button type="button" className="mc-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>
              </>
            ) : (
              <>
                <p className="mc-strong">
                  {job.state === "canceled" ? "Export cancelled. " : ""}
                  {doneResults.length} of {job.ids.length} clip{job.ids.length === 1 ? "" : "s"} ready
                </p>
                <ul className="mc-result-list">
                  {job.results.map((r) => {
                    const c = clips.find((x) => x.id === r.id);
                    return (
                      <li key={r.id} className={`mc-result mc-result-${r.status}`}>
                        {c?.name ?? "Clip"} —{" "}
                        {r.status === "done"
                          ? `${formatBytes(r.clip.blob.size)}, ${r.clip.duration.toFixed(1)}s, ${soundLabel(r.clip)}`
                          : r.status === "failed"
                            ? `failed: ${r.message}`
                            : r.reason ?? "not exported"}
                        {r.status === "failed" && r.error?.stage && (
                          <span className="mc-result-detail">
                            {r.error.code} at {r.error.stage}
                            {r.error.detail ? ` · ${r.error.detail}` : ""}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mc-row">
                  {job.kind === "single" && doneResults[0] && (() => {
                    const r = doneResults[0];
                    const support = shareSupport(r.file);
                    return (
                      <>
                        <button
                          type="button"
                          className="mc-primary mc-handoff"
                          onClick={() => onShareClip(r)}
                          disabled={!support.ok || sharing}
                          aria-describedby={support.ok ? undefined : "mc-share-unavailable"}
                        >
                          Share Clip
                        </button>
                        <button type="button" className="mc-secondary mc-handoff" onClick={() => onSaveMp4(r)}>
                          Save MP4
                        </button>
                        {!support.ok && (
                          <p id="mc-share-unavailable" className="mc-muted mc-full">
                            {shareOutcomeMessage({ status: "unsupported", reason: support.reason })}
                          </p>
                        )}
                      </>
                    );
                  })()}
                  {job.kind === "batch" && doneResults.length > 0 && (
                    <button type="button" className="mc-primary" onClick={() => void saveZip()}>
                      Save ZIP ({doneResults.length} clip{doneResults.length === 1 ? "" : "s"})
                    </button>
                  )}
                  {job.results.some((r) => r.status === "failed" && r.error?.code === "file_unreadable") && (
                    <button type="button" className="mc-primary" onClick={() => fileInputRef.current?.click()}>
                      Reselect video
                    </button>
                  )}
                  {job.results.some((r) => r.status === "failed") && (
                    <button type="button" className="mc-secondary" onClick={() => void copyDiagnostics()}>
                      Copy diagnostics
                    </button>
                  )}
                  <button type="button" className="mc-ghost" onClick={closeJob}>Close</button>
                </div>
                {handoff && (
                  <p className={`mc-handoff-status mc-handoff-${handoff.tone}`} role="status">{handoff.text}</p>
                )}
                {job.kind === "single" && doneResults[0] && (
                  <p className="mc-muted">This clip stays ready here until you close this panel or export another.</p>
                )}
                {copyStatus && <p className="mc-muted" role="status">{copyStatus}</p>}
              </>
            )}
          </div>
        )}

        {file && (
          <details className="mc-card mc-diag">
            <summary>Diagnostics</summary>
            <p className="mc-muted">Read-only checks on this phone. Contains file names, sizes and errors — no video.</p>
            <pre className="mc-pre" data-testid="diagnostics-report">{diagnosticsReport()}</pre>
            <div className="mc-row">
              <button type="button" className="mc-secondary" onClick={() => void copyDiagnostics()}>Copy diagnostics</button>
              {copyStatus && <span className="mc-muted" role="status">{copyStatus}</span>}
            </div>
          </details>
        )}

        {!file && savedOther.length > 0 && (
          <div className="mc-card">
            <p className="mc-strong">Other saved clip lists</p>
            <p className="mc-muted">Open that match's video to continue its list.</p>
            <ul className="mc-saved">
              {savedOther.map((p) => (
                <li key={p.key}>
                  <span>{p.fileName} — {p.clips.length} clip{p.clips.length === 1 ? "" : "s"}</span>
                  <button
                    type="button"
                    className="mc-mini"
                    onClick={() => persistStore(removeProject(storeRef.current, p.key))}
                    aria-label={`Delete saved list for ${p.fileName}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function audioTrackLabel(t: AudioTrackInfo): string {
  const layout = t.channels === 1 ? "mono" : t.channels === 2 ? "stereo" : `${t.channels} ch`;
  const level = t.levelDb === null ? "level unknown" : isAudible(t.levelDb) ? `sound ${t.levelDb.toFixed(0)} dB` : "silent";
  const lang = t.language && t.language !== "und" ? ` · ${t.language}` : "";
  return `Track ${t.index} · ${layout}${lang} · ${level}`;
}

function soundLabel(clip: ExportedClip): string {
  if (!clip.hasAudio) return "no sound track";
  if (clip.audioLevelDb === null) return "sound not checked";
  return isAudible(clip.audioLevelDb) ? `sound ${clip.audioLevelDb.toFixed(0)} dB` : "quiet moment";
}

function MarkField({
  label,
  value,
  onNudge,
  onSeek,
}: {
  label: string;
  value: number | null;
  onNudge: (delta: number) => void;
  onSeek: (t: number) => void;
}) {
  return (
    <div className="mc-mark">
      <span className="mc-mark-label">{label}</span>
      <button type="button" className="mc-mark-value" disabled={value === null} onClick={() => value !== null && onSeek(value)} aria-label={`${label} ${value === null ? "not marked" : formatPrecise(value)} — jump to it`}>
        {value === null ? "—" : formatPrecise(value)}
      </button>
      <button type="button" className="mc-mini" disabled={value === null} onClick={() => onNudge(-0.5)} aria-label={`${label} back half a second`}>−½</button>
      <button type="button" className="mc-mini" disabled={value === null} onClick={() => onNudge(0.5)} aria-label={`${label} forward half a second`}>+½</button>
    </div>
  );
}

function TimeInput({ label, value, onCommit }: { label: string; value: number; onCommit: (t: number) => void }) {
  const [text, setText] = useState(formatPrecise(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(formatPrecise(value));
    setBad(false);
  }, [value]);
  const commit = () => {
    const t = parseTimestamp(text);
    if (t === null) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(round1(t));
  };
  return (
    <input
      className={`mc-input mc-time-input${bad ? " mc-input-bad" : ""}`}
      value={text}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function ClipEditor({
  clip,
  canUseCurrent,
  currentTime,
  confirmDelete,
  onPatch,
  onDelete,
  onDone,
}: {
  clip: ClipSelection;
  canUseCurrent: boolean;
  currentTime: number;
  confirmDelete: boolean;
  onPatch: (p: Partial<ClipSelection>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(clip.name);
  useEffect(() => setName(clip.name), [clip.name]);
  const commitName = () => {
    const clean = cleanClipName(name);
    if (clean && clean !== clip.name) onPatch({ name: clean });
    else setName(clip.name);
  };
  const boundary = (key: "start" | "end") => (
    <div className="mc-edit-row">
      <span className="mc-mark-label">{key === "start" ? "Start" : "End"}</span>
      <TimeInput label={`Clip ${key}`} value={clip[key]} onCommit={(t) => onPatch({ [key]: t })} />
      <button type="button" className="mc-mini" onClick={() => onPatch({ [key]: round1(clip[key] - 0.5) })} aria-label={`Clip ${key} back half a second`}>−½</button>
      <button type="button" className="mc-mini" onClick={() => onPatch({ [key]: round1(clip[key] + 0.5) })} aria-label={`Clip ${key} forward half a second`}>+½</button>
      <button type="button" className="mc-mini" disabled={!canUseCurrent} onClick={() => onPatch({ [key]: round1(currentTime) })} aria-label={`Set clip ${key} to current time`}>Now</button>
    </div>
  );
  return (
    <div className="mc-editor">
      <label className="mc-label">
        Name
        <input
          className="mc-input"
          value={name}
          maxLength={80}
          aria-label="Clip name"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
          }}
        />
      </label>
      <label className="mc-label">
        Category
        <select className="mc-input" value={clip.category} aria-label="Clip category" onChange={(e) => onPatch({ category: e.target.value as ClipCategory })}>
          {CLIP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {boundary("start")}
      {boundary("end")}
      <div className="mc-row">
        <button type="button" className={confirmDelete ? "mc-danger" : "mc-ghost"} onClick={onDelete}>
          {confirmDelete ? "Tap again to remove" : "Remove clip"}
        </button>
        <button type="button" className="mc-secondary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

const CSS = `
.mc-shell {
  --mc-bg: #06150F; --mc-border: #275C3B; --mc-card: rgba(23,61,40,0.7);
  --mc-text: #F1F7F0; --mc-muted: #8FA099; --mc-primary: #7CFF72; --mc-bad: #ef4444; --mc-warn: #fbbf24;
  min-height: 100dvh; background: var(--mc-bg); color: var(--mc-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px calc(32px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.mc-shell * { box-sizing: border-box; }
.mc-content { max-width: 720px; margin: 0 auto; display: grid; gap: 10px; }
.mc-top { display: flex; align-items: center; gap: 12px; }
.mc-title { margin: 0; font-size: 20px; font-weight: 800; }
.mc-h2 { margin: 0; font-size: 16px; font-weight: 750; }
.mc-hidden { display: none; }
.mc-card { border: 1px solid var(--mc-border); background: var(--mc-card); border-radius: 14px; padding: 14px; display: grid; gap: 10px; }
.mc-strong { margin: 0; font-weight: 700; }
.mc-muted { margin: 0; color: var(--mc-muted); font-size: 13px; line-height: 1.4; }
.mc-banner { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--mc-border); font-size: 13.5px; line-height: 1.4; }
.mc-banner-bad { border-color: var(--mc-bad); background: rgba(239,68,68,0.12); }
.mc-banner-warn { border-color: var(--mc-warn); background: rgba(251,191,36,0.1); }
.mc-error { margin: 0; color: #fca5a5; font-size: 13px; }
.mc-error-list { margin: 0; padding-left: 18px; color: #fca5a5; font-size: 13px; }
.mc-shell button { font-family: inherit; cursor: pointer; }
.mc-shell button:disabled { opacity: 0.4; cursor: default; }
.mc-primary, .mc-secondary, .mc-ghost, .mc-danger { min-height: 44px; border-radius: 10px; padding: 0 16px; font-size: 14px; font-weight: 700; }
.mc-primary { background: var(--mc-primary); color: #03100B; border: 0; }
.mc-secondary { background: transparent; color: var(--mc-text); border: 1px solid var(--mc-primary); }
.mc-ghost { background: transparent; color: var(--mc-muted); border: 1px solid var(--mc-border); }
.mc-danger { background: var(--mc-bad); color: #fff; border: 0; }
.mc-row { display: flex; gap: 8px; flex-wrap: wrap; }
.mc-player { display: grid; gap: 8px; background: #03100B; border-radius: 14px; padding: 8px; border: 1px solid var(--mc-border); }
@media (min-height: 1000px) { .mc-player { position: sticky; top: 0; z-index: 2; } }
.mc-video { width: 100%; max-height: 30dvh; background: #000; border-radius: 10px; display: block; }
.mc-time { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 700; padding: 0 4px; }
.mc-transport { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 6px; }
.mc-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mc-ctl-seek { min-height: 52px; font-size: 17px; font-weight: 800; }
.mc-ctl { min-height: 48px; border-radius: 10px; border: 1px solid var(--mc-border); background: #10291B; color: var(--mc-text); font-size: 13px; font-weight: 750; padding: 0 2px; line-height: 1.1; }
.mc-ctl:active { background: #1B4A30; }
.mc-ctl-mark { border-color: #22d3ee; }
.mc-ctl-save { background: var(--mc-primary); color: #03100B; border: 0; }
.mc-marks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.mc-mark { display: flex; align-items: center; gap: 4px; }
.mc-mark-label { font-size: 12px; color: var(--mc-muted); min-width: 34px; }
.mc-mark-value { flex: 1; min-height: 36px; background: transparent; border: 1px solid var(--mc-border); color: var(--mc-text); border-radius: 8px; font-variant-numeric: tabular-nums; font-weight: 700; }
.mc-mini { min-height: 36px; min-width: 40px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--mc-border); background: #10291B; color: var(--mc-text); font-size: 13px; font-weight: 700; }
.mc-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.mc-chip { flex: none; min-height: 34px; padding: 0 9px; border-radius: 999px; border: 1px solid var(--mc-border); background: transparent; color: var(--mc-muted); font-size: 12px; font-weight: 700; }
.mc-chip-on { background: var(--mc-primary); color: #03100B; border-color: var(--mc-primary); }
.mc-label { display: grid; gap: 4px; font-size: 12px; color: var(--mc-muted); }
.mc-input, .mc-textarea { width: 100%; min-height: 40px; border-radius: 8px; border: 1px solid var(--mc-border); background: #03100B; color: var(--mc-text); padding: 8px 10px; font-size: 16px; font-family: inherit; }
.mc-input-bad { border-color: var(--mc-bad); }
.mc-time-input { width: 104px; flex: none; font-variant-numeric: tabular-nums; }
.mc-textarea { font-variant-numeric: tabular-nums; resize: vertical; }
.mc-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mc-list-head { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.mc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mc-clip { border: 1px solid var(--mc-border); border-radius: 12px; background: var(--mc-card); padding: 10px; display: grid; gap: 8px; }
.mc-clip-main { display: flex; align-items: center; gap: 10px; }
.mc-check { width: 22px; height: 22px; flex: none; accent-color: var(--mc-primary); }
.mc-clip-info { flex: 1; background: none; border: 0; color: inherit; text-align: left; padding: 0; display: grid; gap: 2px; min-height: 40px; }
.mc-clip-name { font-weight: 700; font-size: 14.5px; }
.mc-clip-sub { font-size: 12.5px; color: var(--mc-muted); font-variant-numeric: tabular-nums; }
.mc-clip-actions { display: flex; gap: 6px; justify-content: flex-end; }
.mc-editor { display: grid; gap: 8px; border-top: 1px solid var(--mc-border); padding-top: 8px; }
.mc-edit-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mc-job { position: sticky; bottom: 8px; z-index: 3; border: 1px solid var(--mc-primary); background: #0A2216; border-radius: 14px; padding: 14px; display: grid; gap: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
.mc-bar { height: 8px; border-radius: 4px; background: #10291B; overflow: hidden; }
.mc-bar-fill { height: 100%; background: var(--mc-primary); transition: width 0.2s; }
.mc-result-list { margin: 0; padding-left: 18px; font-size: 13px; display: grid; gap: 2px; max-height: 30dvh; overflow: auto; }
.mc-result-failed { color: #fca5a5; }
.mc-result-skipped { color: var(--mc-muted); }
.mc-handoff { flex: 1 1 140px; min-height: 52px; font-size: 16px; }
.mc-full { flex-basis: 100%; }
.mc-wrap { flex-wrap: wrap; overflow: visible; }
.mc-handoff-status { margin: 0; font-size: 13.5px; }
.mc-handoff-ok { color: var(--mc-primary); }
.mc-handoff-warn { color: var(--mc-warn); }
.mc-handoff-bad { color: #fca5a5; }
.mc-result-detail { display: block; color: var(--mc-muted); font-size: 11.5px; word-break: break-word; }
.mc-diag summary { cursor: pointer; font-weight: 700; }
.mc-pre { margin: 0; max-height: 40dvh; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.35; background: #03100B; border: 1px solid var(--mc-border); border-radius: 8px; padding: 8px; user-select: text; }
.mc-saved { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13px; }
.mc-saved li { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
`;
