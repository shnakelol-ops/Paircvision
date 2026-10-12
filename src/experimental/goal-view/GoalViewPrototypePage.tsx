// EXPERIMENTAL — Goal View prototype page. Internal route only
// (/internal/goal-view), lazy-loaded so none of this ships in the main bundle
// path of any production surface. Read-only: no editing, no saved-board fields.

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { createMovementCanvasShell } from "../../movement-board/shell/createMovementCanvasShell";
import { buildDefaultTokens } from "../../movement-board/tokens/default-tokens";
import type {
  MovementBoardRoute,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementPlaybackState,
  TacticalPassEvent,
} from "../../movement-board/shell/types";
import { useCanvasRecorder } from "../../features/shared/useCanvasRecorder";
import { usePortraitOrientation } from "../../components/OrientationGate";
import { quarterTurnsForMode, type GoalViewMode } from "./goalViewCamera";
import {
  DEFAULT_GOAL_VIEW_LENS_OPTIONS,
  createGoalViewLens,
  type GoalViewDiagnostics,
  type GoalViewLens,
  type GoalViewLensMetrics,
  type GoalViewLensOptions,
} from "./createGoalViewLens";

const AWAY_POSITIONS: ReadonlyArray<{ number: number; x: number; y: number }> = [
  { number: 1, x: 94, y: 50 },
  { number: 2, x: 86, y: 70 },
  { number: 3, x: 85, y: 50 },
  { number: 4, x: 86, y: 30 },
  { number: 6, x: 72, y: 50 },
  { number: 7, x: 70, y: 28 },
  { number: 5, x: 70, y: 72 },
];

function buildDemoTokens(): MovementBoardToken[] {
  const home = buildDefaultTokens().map((t) => ({ ...t, team: "home" as const }));
  const away = AWAY_POSITIONS.map((p) => ({
    id: `away-${p.number}`,
    number: p.number,
    color: (p.number === 1 ? "green" : "blue") as MovementBoardToken["color"],
    position: { x: p.x, y: p.y },
    team: "away" as const,
  }));
  return [...home, ...away];
}

// Normalised 0–100 coordinates, attacking the right-hand goal (x = 100).
const DEMO_ROUTES: MovementBoardRoute[] = [
  { playerId: "setup-token-11", points: [{ x: 62, y: 50 }, { x: 70, y: 42 }, { x: 80, y: 40 }] },
  { playerId: "setup-token-14", points: [{ x: 78, y: 50 }, { x: 84, y: 58 }, { x: 88, y: 54 }] },
  { playerId: "setup-token-10", points: [{ x: 62, y: 82 }, { x: 74, y: 76 }, { x: 82, y: 68 }] },
  { playerId: "setup-token-8", points: [{ x: 48, y: 38 }, { x: 58, y: 36 }] },
];

const DEMO_PASSES: TacticalPassEvent[] = [
  { id: "p1", fromPlayerId: "setup-token-8", toPlayerId: "setup-token-11", delayMs: 500 },
  { id: "p2", fromPlayerId: "setup-token-11", toPlayerId: "setup-token-14", delayMs: 1700 },
];

const VIEW_LABELS: Record<GoalViewMode, string> = {
  "top-down": "Top-Down",
  "left-end": "Left End",
  "right-end": "Right End",
};

const BTN: CSSProperties = {
  background: "#173D28",
  color: "#F1F7F0",
  border: "1px solid #275C3B",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const BTN_ON: CSSProperties = { ...BTN, background: "#7CFF72", color: "#06150F", borderColor: "#7CFF72" };

type FrameStats = { fps: number; frameMsP95: number };

export default function GoalViewPrototypePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const lensRef = useRef<GoalViewLens | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<GoalViewMode>("top-down");
  const [lensOptions, setLensOptions] = useState<GoalViewLensOptions>(DEFAULT_GOAL_VIEW_LENS_OPTIONS);
  const [playback, setPlayback] = useState<MovementPlaybackState>({ isPlaying: false, isPaused: false });
  const [metrics, setMetrics] = useState<GoalViewLensMetrics | null>(null);
  const [frameStats, setFrameStats] = useState<FrameStats>({ fps: 0, frameMsP95: 0 });
  const [diagnostics, setDiagnostics] = useState<GoalViewDiagnostics | null>(null);

  // Top-Down mirrors production Tactical Sequence exactly: quarter-turn 1 in
  // portrait, landscape otherwise (TacticalPlaySurface.tsx setOrientation).
  const isPortrait = usePortraitOrientation();
  const recorder = useCanvasRecorder({ getCanvas: () => shellRef.current?.getCanvas() ?? null });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void createMovementCanvasShell(host, {
      initialTokens: buildDemoTokens(),
      mode: "setup",
      dragEnabled: false,
      routeVisibilityMode: "all",
      onPlaybackStateChange: (s) => setPlayback(s),
    }).then((shell) => {
      if (disposed) {
        shell.destroy();
        return;
      }
      shell.setRoutes(DEMO_ROUTES);
      shell.giveBall("setup-token-8");
      shell.setPassEvents(DEMO_PASSES);
      shell.addShotEvent({ id: "s1", shooterId: "setup-token-14", delayMs: 2600 });
      shell.setTrainingItems([
        { id: "c1", type: "cone", x: 70, y: 20 },
        { id: "c2", type: "cone", x: 70, y: 80 },
        { id: "p1", type: "pole", x: 55, y: 50 },
        { id: "m1", type: "mannequin", x: 90, y: 40 },
      ]);
      shell.setStartPositions();
      shellRef.current = shell;
      lensRef.current = createGoalViewLens(shell.getExperimentalRenderTargets());
      setReady(true);
    });
    return () => {
      disposed = true;
      // Lens first: it hands the shell's world back to the stage so the
      // shell's own destroy() cleans it up exactly as in production.
      lensRef.current?.destroy();
      lensRef.current = null;
      shellRef.current?.destroy();
      shellRef.current = null;
    };
  }, []);

  // Apply view: orientation (token counter-rotation) + lens.
  useEffect(() => {
    const shell = shellRef.current;
    const lens = lensRef.current;
    if (!ready || !shell || !lens) return;
    shell.setOrientation(view === "top-down" ? (isPortrait ? 1 : 0) : quarterTurnsForMode(view));
    lens.setEnd(view === "top-down" ? null : view);
  }, [view, ready, isPortrait]);

  useEffect(() => {
    lensRef.current?.setOptions(lensOptions);
  }, [lensOptions, ready]);

  // Frame-time sampling (independent of the lens so Top-Down is measured identically).
  useEffect(() => {
    if (!ready) return;
    const shell = shellRef.current;
    const app = shell?.getExperimentalRenderTargets().app;
    if (!app) return;
    const samples: number[] = [];
    const sample = () => {
      samples.push(app.ticker.deltaMS);
      if (samples.length > 240) samples.shift();
    };
    app.ticker.add(sample);
    const interval = window.setInterval(() => {
      if (samples.length === 0) return;
      const sorted = [...samples].sort((a, b) => a - b);
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      setFrameStats({ fps: 1000 / mean, frameMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0 });
      setMetrics(lensRef.current?.getMetrics() ?? null);
    }, 500);
    return () => {
      window.clearInterval(interval);
      app.ticker.remove(sample);
    };
  }, [ready]);

  const play = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (playback.isPlaying) shell.pausePlayback();
    else if (playback.isPaused) shell.resumePlayback();
    else shell.playAll();
  };
  const reset = () => shellRef.current?.reset();

  // Automation hook for screenshot / recording / diagnostics runs.
  useEffect(() => {
    if (!ready) return;
    const api = {
      setView: (v: GoalViewMode) => setView(v),
      setLensOptions: (patch: Partial<GoalViewLensOptions>) =>
        setLensOptions((o) => ({ ...o, ...patch, camera: { ...o.camera, ...(patch.camera ?? {}) } })),
      play: () => shellRef.current?.playAll(),
      reset: () => shellRef.current?.reset(),
      pause: () => shellRef.current?.pausePlayback(),
      runDiagnostics: () => lensRef.current?.runDiagnostics() ?? null,
      getMetrics: () => lensRef.current?.getMetrics() ?? null,
      getFrameStats: () => frameStatsRef.current,
      getTokens: () => shellRef.current?.getTokens() ?? [],
      getBallState: () => shellRef.current?.getBallState() ?? null,
      startRecording: () => recorder.startCountdown(),
      stopRecording: () => recorder.stopRecording(),
      getRecording: () => ({ phase: recorderRef.current.recordPhase, url: recorderRef.current.recordBlobUrl, mime: recorderRef.current.recordMimeType, size: recorderRef.current.recordBlob?.size ?? 0 }),
    };
    (window as unknown as { __goalView?: typeof api }).__goalView = api;
    return () => {
      delete (window as unknown as { __goalView?: typeof api }).__goalView;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const frameStatsRef = useRef(frameStats);
  frameStatsRef.current = frameStats;
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const isGoalView = view !== "top-down";
  const toggle = (key: "billboards" | "uprightGoals" | "depthSort") =>
    setLensOptions((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#06150F", color: "#F1F7F0", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, alignItems: "center", borderBottom: "1px solid #275C3B" }}>
        <strong style={{ fontSize: 12, marginRight: 4 }}>Goal View PoC · internal</strong>
        {(Object.keys(VIEW_LABELS) as GoalViewMode[]).map((v) => (
          <button key={v} type="button" style={view === v ? BTN_ON : BTN} onClick={() => setView(v)} data-view={v}>
            {VIEW_LABELS[v]}
          </button>
        ))}
        <span style={{ width: 8 }} />
        <button type="button" style={BTN} onClick={play} data-action="play">
          {playback.isPlaying ? "Pause" : playback.isPaused ? "Resume" : "Play"}
        </button>
        <button type="button" style={BTN} onClick={reset}>Reset</button>
        <button
          type="button"
          style={recorder.recordPhase === "recording" ? BTN_ON : BTN}
          onClick={() => (recorder.recordPhase === "recording" ? recorder.stopRecording() : recorder.startCountdown())}
          disabled={!recorder.canRecord()}
        >
          {recorder.recordPhase === "countdown" ? `Rec in ${recorder.recordCountdown}` : recorder.recordPhase === "recording" ? `Stop (${recorder.recordElapsed}s)` : "Record"}
        </button>
        {recorder.recordBlobUrl && (
          <a href={recorder.recordBlobUrl} download="goal-view-clip" style={{ ...BTN, textDecoration: "none" }}>Download clip</a>
        )}
      </div>

      {isGoalView && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 8px", alignItems: "center", fontSize: 11, borderBottom: "1px solid #275C3B" }}>
          <button type="button" style={lensOptions.billboards ? BTN_ON : BTN} onClick={() => toggle("billboards")}>Upright players</button>
          <button type="button" style={lensOptions.uprightGoals ? BTN_ON : BTN} onClick={() => toggle("uprightGoals")}>Upright goals</button>
          <button type="button" style={lensOptions.depthSort ? BTN_ON : BTN} onClick={() => toggle("depthSort")}>Depth sort</button>
          <select
            value={lensOptions.strategy}
            onChange={(e) => setLensOptions((o) => ({ ...o, strategy: e.target.value as GoalViewLensOptions["strategy"] }))}
            style={{ ...BTN, padding: "5px 6px" }}
          >
            <option value="wrapper">Hide: offscreen wrapper</option>
            <option value="alpha">Hide: world.alpha = 0</option>
          </select>
          {(
            [
              ["heightUnits", "Height", 10, 120],
              ["distanceBehindUnits", "Behind", 4, 120],
              ["lookAtUnits", "Aim", 20, 160],
              ["nearCropUnits", "Near crop", 0, 60],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {label}
              <input
                type="range"
                min={min}
                max={max}
                value={lensOptions.camera[key]}
                onChange={(e) =>
                  setLensOptions((o) => ({ ...o, camera: { ...o.camera, [key]: Number(e.target.value) } }))
                }
              />
              {lensOptions.camera[key]}
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Texture px/unit
            <input
              type="range"
              min={3}
              max={16}
              value={lensOptions.textureScale}
              onChange={(e) => setLensOptions((o) => ({ ...o, textureScale: Number(e.target.value) }))}
            />
            {lensOptions.textureScale}
          </label>
          <button type="button" style={BTN} onClick={() => setDiagnostics(lensRef.current?.runDiagnostics() ?? null)}>Diagnostics</button>
        </div>
      )}

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        {/* Read-only Goal View: swallow pitch input at the DOM level instead of
            overriding Pixi's pointer mapping. The shell's own stage handlers
            would otherwise receive flat-board coordinates. */}
        {isGoalView && <div style={{ position: "absolute", inset: 0, touchAction: "none" }} aria-hidden="true" />}
        <pre style={{ position: "absolute", left: 6, bottom: 6, margin: 0, padding: 6, fontSize: 10, lineHeight: 1.35, background: "rgba(3,16,11,0.78)", borderRadius: 6, pointerEvents: "none", maxWidth: "calc(100% - 12px)", whiteSpace: "pre-wrap" }}>
          {[
            `${VIEW_LABELS[view]} · ${frameStats.fps.toFixed(0)} fps · p95 ${frameStats.frameMsP95.toFixed(1)} ms`,
            metrics && isGoalView
              ? `tex ${metrics.textureWidth}×${metrics.textureHeight} (${(metrics.textureBytes / 1048576).toFixed(1)} MB) · pass ${metrics.offscreenPassMs.toFixed(2)} ms · mag near ${metrics.nearMagnification.toFixed(2)} far ${metrics.farMagnification.toFixed(2)}`
              : null,
            diagnostics ? JSON.stringify(diagnostics, null, 1) : null,
          ]
            .filter(Boolean)
            .join("\n")}
        </pre>
      </div>
    </div>
  );
}
