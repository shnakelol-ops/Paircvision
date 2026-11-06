// Montage mode of Match Clipper — Match Montage V2, Stages 1–2 (internal).
// Rendered by MatchClipperScreen beside Clip mode and lazy-loaded the first
// time the coach switches to it. Named montage projects built from saved clips:
// arrange, trim and preview them in order. No MP4 export yet.
//
// The match video is owned by Match Clipper: when it already has this
// montage's video open, the preview plays from that same in-memory file, so
// switching modes never asks for the video again. Montage data has its own
// store; nothing here writes Match Clipper's saved clips.

import { useEffect, useMemo, useRef, useState } from "react";
import { categoryLabel, sourceKey, type ClipSelection } from "../internal-match-clipper/clip-types";
import { formatClock, formatPrecise, parseTimestamp } from "../internal-match-clipper/timestamp-parse";
import {
  addClips,
  createMontage,
  defaultMontageName,
  deleteMontage,
  moveItem,
  removeItem,
  renameMontage,
  setSourceDuration,
  totals,
  trimItem,
  upsertMontage,
  type MontageSource,
} from "./montage-ops";
import { PreviewController, type PreviewState } from "./montage-preview";
import MontageExportPanel, { useExportSession } from "./MontageExportPanel";
import { MONTAGE_STORAGE_KEY, loadMontages, saveMontages, type MontageSave } from "./montage-storage";
import { LONG_MONTAGE_SECONDS, MAX_MONTAGE_ITEMS, type MontageItem, type MontageProject, type MontageStoreV1 } from "./montage-types";

/** The match video Match Clipper currently has open and playable. */
export interface LoadedVideo extends MontageSource {
  url: string;
  /** The File itself, for Create MP4. */
  file: File;
  /** Commentary track chosen in Match Clipper (null = the primary track). */
  audioTrackId: number | null;
}

export interface MontageModeProps {
  /** False while Clip mode is showing: preview stops and its player is released. */
  active: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** Video open in Match Clipper right now (null if none / needs reselecting). */
  loaded: LoadedVideo | null;
  /** Match Clipper's current match, even if its video needs reselecting. */
  current: MontageSource | null;
  /** Match Clipper's saved clips for a video (read only). */
  savedClips: (sourceKey: string) => ClipSelection[];
  /** Opens a video in Match Clipper. Returns a message if it can't right now. */
  onPickVideo: (file: File) => string | null;
  /** A clip export is running in Clip mode (only one encoder at a time). */
  clipExportBusy?: boolean;
  /** Tells Match Clipper when a montage export starts and stops. */
  onExportBusyChange?: (busy: boolean) => void;
}

function fmtLength(seconds: number): string {
  return formatClock(seconds).replace(/^00:/, "0:");
}
function fmtBytes(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`;
}
const clipsWord = (n: number) => `${n} clip${n === 1 ? "" : "s"}`;

export default function MontageMode({ active, openId, onOpen, loaded, current, savedClips, onPickVideo, clipExportBusy = false, onExportBusyChange }: MontageModeProps) {
  const exportSession = useExportSession();
  const exporting = exportSession.phase === "running";
  useEffect(() => {
    onExportBusyChange?.(exporting);
  }, [exporting, onExportBusyChange]);
  const initial = useMemo(() => loadMontages(), []);
  const [store, setStore] = useState<MontageStoreV1>(initial.store);
  const storeRef = useRef(initial.store);
  const [unreadable] = useState(initial.status === "unreadable");
  const [saveResult, setSaveResult] = useState<MontageSave>({ ok: true });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);

  const sync = (next: MontageStoreV1) => {
    storeRef.current = next;
    setStore(next);
  };
  const latestStore = (): MontageStoreV1 | null => {
    const l = loadMontages();
    return l.status === "unreadable" ? null : l.store;
  };

  // Clips may have been added from Clip mode while this was hidden: re-read.
  useEffect(() => {
    if (!active || unreadable) return;
    const latest = latestStore();
    if (latest) sync(latest);
    setConfirmDelete(null);
  }, [active, unreadable]);

  // Another tab of PáircVision changed montages: show its version.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MONTAGE_STORAGE_KEY || unreadable) return;
      const latest = latestStore();
      if (latest) sync(latest);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [unreadable]);

  /**
   * Every change is applied to the latest saved montages (not to this
   * screen's copy, which may be older) and only shown once it is saved, so an
   * out-of-date copy can never overwrite newer edits such as a confirmed trim.
   */
  const commit = (change: (s: MontageStoreV1) => MontageStoreV1): MontageSave => {
    const base = unreadable ? null : latestStore();
    if (!base) {
      const refused: MontageSave = { ok: false, reason: "unreadable" };
      setSaveResult(refused);
      return refused;
    }
    const next = change(base);
    const result: MontageSave = next === base ? { ok: true } : saveMontages(next);
    setSaveResult(result);
    sync(result.ok ? next : base);
    return result;
  };
  const edit = (id: string, change: (p: MontageProject) => MontageProject): MontageSave =>
    commit((s) => {
      const cur = s.projects.find((p) => p.id === id);
      if (!cur) return s;
      const next = change(cur);
      return next === cur ? s : upsertMontage(s, next);
    });

  const startNew = () => {
    setNewName(defaultMontageName(new Date()));
    setCreating(true);
  };
  const create = () => {
    if (!current) return;
    const m = createMontage(newName, { ...current, duration: loaded?.key === current.key ? loaded.duration : current.duration });
    if (!commit((s) => upsertMontage(s, m)).ok) return;
    setCreating(false);
    onOpen(m.id);
  };

  const project = openId ? store.projects.find((p) => p.id === openId) ?? null : null;
  const sorted = [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="mw-root">
      <style>{CSS}</style>
      {unreadable && (
        <p className="mw-banner mw-bad" role="alert">Saved montages on this device couldn't be read. They've been left untouched, and changes can't be saved until this is fixed.</p>
      )}
      {!saveResult.ok && !unreadable && (
        <p className="mw-banner mw-bad" role="alert">
          {"reason" in saveResult && saveResult.reason === "full" ? "This device's storage is full — the latest montage changes weren't saved." : "The latest montage changes couldn't be saved on this device."}
        </p>
      )}

      {openId && !project && (
        <p className="mw-banner" role="alert">That montage no longer exists. <button type="button" className="mw-link" onClick={() => onOpen(null)}>Show my montages</button></p>
      )}

      {!openId && (
        <>
          <div className="mw-head">
            <h2 className="mw-title">My Montages</h2>
            {!creating && (
              <button type="button" className="mw-primary" onClick={startNew} disabled={unreadable}>New Montage</button>
            )}
          </div>

          {creating && (
            <div className="mw-card">
              {current ? (
                <>
                  <label className="mw-label">
                    Montage name
                    <input className="mw-input" value={newName} maxLength={60} aria-label="New montage name" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
                  </label>
                  <p className="mw-muted">From “{current.fileName}”. Add its saved clips next.</p>
                  <div className="mw-row">
                    <button type="button" className="mw-primary" onClick={create}>Create montage</button>
                    <button type="button" className="mw-ghost" onClick={() => setCreating(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mw-strong">Open the match video first</p>
                  <p className="mw-muted">A montage is made from clips of one match video. It stays on your phone — nothing is uploaded.</p>
                  <div className="mw-row">
                    <label className="mw-file">
                      Open match video
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/*"
                        className="mw-hidden"
                        aria-label="Open match video for a new montage"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) setPickError(onPickVideo(f));
                        }}
                      />
                    </label>
                    <button type="button" className="mw-ghost" onClick={() => setCreating(false)}>Cancel</button>
                  </div>
                  {pickError && <p className="mw-banner mw-bad" role="alert">{pickError}</p>}
                </>
              )}
            </div>
          )}

          {sorted.length === 0 ? (
            !creating && (
              <div className="mw-card">
                <p className="mw-strong">No montages yet</p>
                <p className="mw-muted">Tap “New Montage”, or in Match Clipper tap “＋ Montage” on a saved clip.</p>
              </div>
            )
          ) : (
            <ul className="mw-list" aria-label="My montages">
              {sorted.map((m) => {
                const t = totals(m);
                return (
                  <li key={m.id} className="mw-card mw-row-card">
                    <button type="button" className="mw-open" onClick={() => onOpen(m.id)} aria-label={`Open ${m.name}`}>
                      <span className="mw-strong">{m.name}</span>
                      <span className="mw-muted">{clipsWord(t.count)} · {fmtLength(t.seconds)} · {m.sourceName}</span>
                    </button>
                    <button
                      type="button"
                      className={confirmDelete === m.id ? "mw-danger" : "mw-ghost"}
                      onClick={() => {
                        if (confirmDelete === m.id) {
                          commit((s) => deleteMontage(s, m.id));
                          setConfirmDelete(null);
                        } else setConfirmDelete(m.id);
                      }}
                      aria-label={confirmDelete === m.id ? `Confirm delete ${m.name}` : `Delete ${m.name}`}
                    >
                      {confirmDelete === m.id ? "Tap again to delete" : "Delete"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mw-muted">Deleting a montage never deletes the clips in Match Clipper.</p>
        </>
      )}

      {project && (
        <MontageDetail
          key={project.id}
          project={project}
          active={active}
          loaded={loaded}
          savedClips={savedClips(project.sourceKey)}
          onPickVideo={onPickVideo}
          clipExportBusy={clipExportBusy}
          exporting={exporting}
          onBack={() => onOpen(null)}
          onEdit={(change) => edit(project.id, change)}
        />
      )}
    </div>
  );
}

function MontageDetail({
  project,
  active,
  loaded,
  savedClips,
  onPickVideo,
  clipExportBusy,
  exporting,
  onBack,
  onEdit,
}: {
  project: MontageProject;
  active: boolean;
  loaded: LoadedVideo | null;
  savedClips: ClipSelection[];
  onPickVideo: (file: File) => string | null;
  clipExportBusy: boolean;
  /** An MP4 export is running: the preview player is released meanwhile. */
  exporting: boolean;
  onBack: () => void;
  /** Applies a change to the latest saved copy of this montage and saves it. */
  onEdit: (change: (p: MontageProject) => MontageProject) => MontageSave;
}) {
  const [name, setName] = useState(project.name);
  const [fileError, setFileError] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const resumeIndex = useRef(0);
  const t = totals(project);

  // Same video as Match Clipper has open: preview straight from it.
  const video = loaded && loaded.key === project.sourceKey ? loaded : null;
  const playerUrl = active && video && !exporting ? video.url : null;

  useEffect(() => setName(project.name), [project.name]);

  // Preview controller follows the item order and trims.
  const segments = project.items.map((i) => ({ start: i.start, end: i.end }));
  const segKey = segments.map((s) => `${s.start}-${s.end}`).join(",");
  useEffect(() => {
    controller.current?.setSegments(segments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey]);

  // Leaving Montage mode (or a new video) stops the preview and releases the
  // player; coming back resumes at the same clip.
  useEffect(() => {
    // The same file is often already loaded by Match Clipper's player, so the
    // metadata can be ready before React is listening: start from it directly.
    const v = videoRef.current;
    if (playerUrl && v && v.readyState >= 1 && !controller.current) onLoadedMetadata();
    return () => {
      const c = controller.current;
      if (c) {
        resumeIndex.current = c.state.index;
        c.pause();
        c.dispose();
      }
      controller.current = null;
      setPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerUrl]);

  const pickVideo = (f: File | null) => {
    if (!f) return;
    if (sourceKey(f.name, f.size) !== project.sourceKey) {
      setFileError(`That's a different video (${f.name}, ${fmtBytes(f.size)}). This montage was made from “${project.sourceName}” (${fmtBytes(project.sourceSize)}).`);
      return;
    }
    setFileError(onPickVideo(f));
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || controller.current) return;
    if (Number.isFinite(v.duration) && project.sourceDuration === null) onEdit((p) => (p.sourceDuration === null ? setSourceDuration(p, v.duration) : p));
    const c = new PreviewController(v, segments, setPreview);
    controller.current = c;
    if (resumeIndex.current > 0 && resumeIndex.current < segments.length) c.select(resumeIndex.current);
    setPreview(c.state);
  };

  const inMontage = new Set(project.items.map((i) => i.clipId));
  const addable = savedClips.filter((c) => !inMontage.has(c.id));

  const current = preview ? project.items[preview.index] : undefined;
  const ctl = controller.current;
  const playing = preview?.phase === "playing";

  return (
    <>
      <div className="mw-head">
        <button type="button" className="mw-ghost" onClick={onBack}>← My Montages</button>
      </div>
      <div className="mw-card">
        <label className="mw-label">
          Montage name
          <input
            className="mw-input"
            value={name}
            maxLength={60}
            aria-label="Montage name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onEdit((p) => renameMontage(p, name))}
            onKeyDown={(e) => e.key === "Enter" && onEdit((p) => renameMontage(p, name))}
          />
        </label>
        <p className="mw-strong" data-testid="montage-totals">
          {clipsWord(t.count)} · {fmtLength(t.seconds)} total
        </p>
        {t.seconds > LONG_MONTAGE_SECONDS && (
          <p className="mw-banner mw-warn">This montage is over {LONG_MONTAGE_SECONDS / 60} minutes. Long montages will take longer to export and make large files.</p>
        )}
        <p className="mw-muted">From “{project.sourceName}” ({fmtBytes(project.sourceSize)}).</p>
      </div>

      <div className="mw-card">
        {!video && (
          <>
            <p className="mw-strong">Select the match video to preview</p>
            <p className="mw-muted">
              {loaded
                ? `Match Clipper has “${loaded.fileName}” open, but this montage was made from “${project.sourceName}”. Selecting it opens it in Match Clipper too.`
                : `The video stays on your phone and isn't saved in PáircVision, so choose “${project.sourceName}” again after reopening.`}
            </p>
            <label className="mw-file">
              Select match video
              <input type="file" accept="video/mp4,video/quicktime,video/*" className="mw-hidden" aria-label="Select match video" onChange={(e) => { pickVideo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            {fileError && <p className="mw-banner mw-bad" role="alert">{fileError}</p>}
          </>
        )}

        {video && exporting && <p className="mw-muted">The preview is paused while an MP4 is being created.</p>}
        {playerUrl && (
          <div className="mw-player">
            <video
              key={playerUrl}
              ref={videoRef}
              className="mw-video"
              src={playerUrl}
              playsInline
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onSeeked={() => controller.current?.onSeeked()}
              onEnded={() => controller.current?.onMediaEnded()}
              onTimeUpdate={() => ctl && setPreview(ctl.state)}
            />
            {preview?.phase === "seeking" && current && (
              <p className="mw-overlay" role="status">Clip {preview.index + 1} of {preview.count}…</p>
            )}
            {preview && current ? (
              <>
                <p className="mw-now" data-testid="preview-now">
                  Clip {preview.index + 1} of {preview.count} · {current.name}
                  {preview.phase === "ended" ? " · end of montage" : ""}
                </p>
                <input
                  type="range"
                  className="mw-range"
                  min={0}
                  max={Math.max(0.1, preview.clipDuration)}
                  step={0.1}
                  value={Math.min(preview.clipTime, preview.clipDuration)}
                  onChange={(e) => ctl?.seekWithin(Number(e.target.value))}
                  aria-label="Position in current clip"
                />
                <p className="mw-times">
                  <span>{formatPrecise(preview.clipTime)} / {formatPrecise(preview.clipDuration)} in clip</span>
                  <span>{fmtLength(preview.montageTime)} / {fmtLength(preview.montageDuration)} montage</span>
                </p>
                <div className="mw-controls">
                  <button type="button" className="mw-ctl" onClick={() => ctl?.previous()} aria-label="Previous clip">◀◀</button>
                  <button type="button" className="mw-ctl mw-play" onClick={() => ctl?.toggle()} aria-label={playing ? "Pause" : "Play"}>{playing ? "Pause" : "Play"}</button>
                  <button type="button" className="mw-ctl" onClick={() => ctl?.next()} disabled={preview.index >= preview.count - 1} aria-label="Next clip">▶▶</button>
                </div>
              </>
            ) : (
              project.items.length === 0 && <p className="mw-muted">Add clips to preview them here.</p>
            )}
          </div>
        )}
      </div>

      <MontageExportPanel
        project={project}
        source={video?.file ?? null}
        audioTrackId={video?.audioTrackId ?? null}
        clipExportBusy={clipExportBusy}
        onPickVideo={onPickVideo}
      />

      <div className="mw-card">
        <div className="mw-head">
          <p className="mw-strong">Clips in order</p>
          <button type="button" className="mw-ghost" onClick={() => setAdding(!adding)} aria-expanded={adding} disabled={project.items.length >= MAX_MONTAGE_ITEMS}>
            {adding ? "Done adding" : "＋ Add clips"}
          </button>
        </div>
        {adding && <AddSavedClips clips={addable} anySaved={savedClips.length > 0} onAdd={(chosen) => onEdit((p) => addClips(p, chosen).project)} />}
        {project.items.length === 0 && !adding && <p className="mw-muted">No clips yet. Tap “＋ Add clips” to choose from this match's saved clips.</p>}
      </div>

      <ol className="mw-items">
        {project.items.map((item, i) => (
          <li key={item.id} className={`mw-card mw-item${preview?.index === i ? " mw-current" : ""}`}>
            <button type="button" className="mw-open" onClick={() => ctl?.select(i)} disabled={!ctl} aria-label={`Preview from ${item.name}`}>
              <span className="mw-strong">{i + 1}. {item.name}</span>
              <span className="mw-muted">{categoryLabel(item.category)} · {formatPrecise(item.start)}–{formatPrecise(item.end)} ({(item.end - item.start).toFixed(1)}s)</span>
            </button>
            <div className="mw-actions">
              <button type="button" className="mw-mini" onClick={() => onEdit((p) => moveItem(p, item.id, -1))} disabled={i === 0} aria-label={`Move ${item.name} up`}>↑</button>
              <button type="button" className="mw-mini" onClick={() => onEdit((p) => moveItem(p, item.id, 1))} disabled={i === project.items.length - 1} aria-label={`Move ${item.name} down`}>↓</button>
              <button type="button" className="mw-mini" onClick={() => setTrimming(trimming === item.id ? null : item.id)} aria-expanded={trimming === item.id} aria-label={`Trim ${item.name}`} disabled={trimming !== null && trimming !== item.id}>Trim</button>
              <button
                type="button"
                className={confirmRemove === item.id ? "mw-mini mw-danger" : "mw-mini"}
                onClick={() => {
                  if (confirmRemove === item.id) {
                    onEdit((p) => removeItem(p, item.id));
                    setConfirmRemove(null);
                  } else setConfirmRemove(item.id);
                }}
                aria-label={confirmRemove === item.id ? `Confirm remove ${item.name}` : `Remove ${item.name}`}
              >
                {confirmRemove === item.id ? "Tap again" : "Remove"}
              </button>
            </div>
            {trimming === item.id && (
              <TrimEditor
                item={item}
                currentTime={() => videoRef.current?.currentTime ?? null}
                validate={(range) => {
                  const r = trimItem(project, item.id, range);
                  return r.ok ? null : r.reason;
                }}
                onConfirm={(range) => {
                  let refused: string | null = null;
                  const saved = onEdit((p) => {
                    const r = trimItem(p, item.id, range);
                    if (r.ok) return r.project;
                    refused = r.reason;
                    return p;
                  });
                  if (refused) return refused;
                  if (!saved.ok) return "The trim couldn't be saved on this device, so it wasn't applied.";
                  setTrimming(null);
                  return null;
                }}
                onCancel={() => setTrimming(null)}
              />
            )}
          </li>
        ))}
      </ol>
      {project.items.length > 0 && <p className="mw-muted">Removing or trimming here changes only this montage — the clips in Match Clipper stay as they are.</p>}
    </>
  );
}

/** Pick saved Match Clipper clips (not already in this montage) to append. */
function AddSavedClips({ clips, anySaved, onAdd }: { clips: ClipSelection[]; anySaved: boolean; onAdd: (clips: ClipSelection[]) => void }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  if (!clips.length) {
    return (
      <p className="mw-muted">
        {anySaved ? "Every saved clip for this match is already in this montage." : "No saved clips for this match yet — mark and save clips in Match Clipper first."}
      </p>
    );
  }
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  const picked = clips.filter((c) => chosen.has(c.id));
  return (
    <div className="mw-add">
      <div className="mw-row">
        <button type="button" className="mw-mini" onClick={() => setChosen(new Set(clips.map((c) => c.id)))}>Choose all</button>
        <button type="button" className="mw-mini" onClick={() => setChosen(new Set())} disabled={!chosen.size}>Clear</button>
      </div>
      <ul className="mw-list">
        {clips.map((c) => (
          <li key={c.id}>
            <label className="mw-check">
              <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Choose ${c.name}`} />
              <span>
                <span className="mw-strong">{c.name}</span>
                <span className="mw-muted"> · {formatPrecise(c.start)}–{formatPrecise(c.end)} ({(c.end - c.start).toFixed(1)}s)</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mw-primary"
        disabled={!picked.length}
        onClick={() => {
          onAdd(picked);
          setChosen(new Set());
        }}
      >
        {picked.length ? `Add ${clipsWord(picked.length)}` : "Choose clips to add"}
      </button>
    </div>
  );
}

const round1 = (n: number) => Math.round(Math.max(0, n) * 10) / 10;
const FORMAT_HINT = "Use MM:SS or HH:MM:SS, e.g. 25:29.5";

/**
 * Edits a draft start/end, kept apart from the saved item. Nothing is saved
 * until Confirm Trim; Cancel throws the draft away.
 */
function TrimEditor({
  item,
  currentTime,
  validate,
  onConfirm,
  onCancel,
}: {
  item: MontageItem;
  currentTime: () => number | null;
  /** Why a range can't be saved, or null if it can. Saves nothing. */
  validate: (range: { start: number; end: number }) => string | null;
  /** Saves the range. Returns why it wasn't saved, or null on success. */
  onConfirm: (range: { start: number; end: number }) => string | null;
  onCancel: () => void;
}) {
  const [text, setText] = useState({ start: formatPrecise(item.start), end: formatPrecise(item.end) });
  const [saveError, setSaveError] = useState<string | null>(null);
  const start = parseTimestamp(text.start);
  const end = parseTimestamp(text.end);
  const range = start !== null && end !== null ? { start: round1(start), end: round1(end) } : null;
  const problem = range ? validate(range) : FORMAT_HINT;
  const changed = !range || range.start !== item.start || range.end !== item.end;

  const set = (key: "start" | "end", value: number) => {
    setSaveError(null);
    setText((t) => ({ ...t, [key]: formatPrecise(round1(value)) }));
  };
  const nudge = (key: "start" | "end", delta: number) => set(key, (parseTimestamp(text[key]) ?? item[key]) + delta);
  const tidy = (key: "start" | "end") => {
    const v = parseTimestamp(text[key]);
    if (v !== null) set(key, v);
  };

  const row = (key: "start" | "end") => (
    <div className="mw-trim-row">
      <span className="mw-muted mw-trim-label">{key === "start" ? "Start" : "End"}</span>
      <input
        className="mw-input mw-time"
        value={text[key]}
        inputMode="decimal"
        aria-label={`Montage clip ${key}`}
        onChange={(e) => {
          setSaveError(null);
          setText({ ...text, [key]: e.target.value });
        }}
        onBlur={() => tidy(key)}
      />
      <button type="button" className="mw-mini" aria-label={`${key} back half a second`} onClick={() => nudge(key, -0.5)}>−½</button>
      <button type="button" className="mw-mini" aria-label={`${key} forward half a second`} onClick={() => nudge(key, 0.5)}>+½</button>
      <button
        type="button"
        className="mw-mini"
        aria-label={`Set ${key} to current position`}
        onClick={() => {
          const now = currentTime();
          if (now !== null) set(key, now);
        }}
      >
        Now
      </button>
    </div>
  );
  return (
    <div className="mw-trim" role="group" aria-label={`Trim ${item.name}`}>
      {row("start")}
      {row("end")}
      <p className="mw-muted" data-testid="trim-draft">
        {range ? `${formatPrecise(range.start)}–${formatPrecise(range.end)} (${(range.end - range.start).toFixed(1)}s)` : "—"}
        {changed && !problem ? " · not saved yet — tap Confirm Trim" : ""}
      </p>
      {changed && problem && <p className="mw-error" role="alert">{problem}</p>}
      {saveError && <p className="mw-error" role="alert">{saveError}</p>}
      <div className="mw-row">
        <button
          type="button"
          className="mw-primary"
          disabled={!changed || problem !== null}
          onClick={() => range && setSaveError(onConfirm(range))}
        >
          Confirm Trim
        </button>
        <button type="button" className="mw-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const CSS = `
.mw-root { --border:#275C3B; --card:rgba(23,61,40,0.7); --text:#F1F7F0; --muted:#8FA099; --primary:#7CFF72; --bad:#ef4444; --warn:#fbbf24;
  display:grid; gap:10px; color:var(--text); }
.mw-root * { box-sizing:border-box; }
.mw-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.mw-title { margin:0; font-size:18px; font-weight:800; }
.mw-card { border:1px solid var(--border); background:var(--card); border-radius:14px; padding:12px; display:grid; gap:8px; }
.mw-strong { margin:0; font-weight:700; }
.mw-muted { margin:0; color:var(--muted); font-size:13px; line-height:1.4; }
.mw-banner { margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--border); font-size:13.5px; }
.mw-bad { border-color:var(--bad); background:rgba(239,68,68,0.12); }
.mw-warn { border-color:var(--warn); background:rgba(251,191,36,0.1); }
.mw-root button { font-family:inherit; cursor:pointer; }
.mw-root button:disabled { opacity:0.4; cursor:default; }
.mw-ghost, .mw-danger, .mw-primary { min-height:44px; border-radius:10px; padding:0 14px; font-size:14px; font-weight:700; }
.mw-ghost { background:transparent; color:var(--muted); border:1px solid var(--border); }
.mw-primary { background:var(--primary); color:#03100B; border:0; }
.mw-danger { background:var(--bad); color:#fff; border:0; }
.mw-link { background:none; border:0; color:var(--primary); text-decoration:underline; font-size:inherit; padding:0; }
.mw-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.mw-list, .mw-items { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.mw-row-card { grid-template-columns:1fr auto; align-items:center; }
.mw-open { background:none; border:0; color:inherit; text-align:left; padding:0; display:grid; gap:2px; min-height:44px; }
.mw-label { display:grid; gap:4px; font-size:12px; color:var(--muted); }
.mw-input { min-height:44px; border-radius:8px; border:1px solid var(--border); background:#03100B; color:var(--text); padding:8px 10px; font-size:16px; font-family:inherit; }
.mw-file { display:inline-flex; align-items:center; justify-content:center; min-height:48px; border-radius:10px; background:var(--primary); color:#03100B; font-weight:700; font-size:14px; padding:0 16px; cursor:pointer; justify-self:start; }
.mw-hidden { display:none; }
.mw-player { position:relative; display:grid; gap:8px; }
.mw-video { width:100%; max-height:40dvh; background:#000; border-radius:10px; display:block; }
.mw-overlay { position:absolute; top:8px; left:8px; margin:0; padding:6px 10px; border-radius:8px; background:rgba(3,16,11,0.85); font-size:13px; font-weight:700; }
.mw-now { margin:0; font-weight:750; font-size:15px; }
.mw-range { width:100%; accent-color:var(--primary); min-height:32px; }
.mw-times { margin:0; display:flex; justify-content:space-between; color:var(--muted); font-size:12.5px; font-variant-numeric:tabular-nums; }
.mw-controls { display:grid; grid-template-columns:1fr 1.4fr 1fr; gap:6px; }
.mw-ctl { min-height:52px; border-radius:10px; border:1px solid var(--border); background:#10291B; color:var(--text); font-size:16px; font-weight:800; }
.mw-play { background:var(--primary); color:#03100B; border:0; }
.mw-item { gap:6px; }
.mw-current { border-color:var(--primary); }
.mw-actions { display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; }
.mw-mini { min-height:40px; min-width:44px; padding:0 10px; border-radius:8px; border:1px solid var(--border); background:#10291B; color:var(--text); font-size:13px; font-weight:700; }
.mw-mini.mw-danger { background:var(--bad); border:0; }
.mw-add { display:grid; gap:8px; }
.mw-check { display:flex; gap:10px; align-items:center; min-height:44px; font-size:14px; }
.mw-check input { width:22px; height:22px; accent-color:var(--primary); flex:none; }
.mw-trim { display:grid; gap:6px; border-top:1px solid var(--border); padding-top:8px; }
.mw-trim-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.mw-trim-label { min-width:36px; }
.mw-time { width:110px; font-variant-numeric:tabular-nums; }
.mw-error { margin:0; color:#fca5a5; font-size:13px; }
.mw-progress { width:100%; height:12px; accent-color:var(--primary); }
.mw-root details summary { cursor:pointer; }
`;
