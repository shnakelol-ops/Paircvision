// EXPERIMENTAL — Goal View prototype page. Internal route only
// (/internal/goal-view), lazy-loaded so none of this ships in the main bundle
// path of any production surface. Read-only: no editing, no saved-board fields.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

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
import {
  createTacticalPadLiteSurface,
  type TacticalPadLiteSurface,
} from "../../engine/pixi/createTacticalPadLiteSurface";
import { slateGoalViewLensOptions, toSlateGoalViewTargets } from "./slateGoalView";
import { usePortraitOrientation } from "../../components/OrientationGate";
import {
  DEFAULT_GOAL_VIEW_ORBIT,
  baseElevationDeg,
  clampOrbit,
  quarterTurnsForMode,
  type GoalViewMode,
  type GoalViewOrbit,
} from "./goalViewCamera";
import {
  IDLE_ORBIT_GESTURE,
  orbitGestureDown,
  orbitGestureMove,
  orbitGestureUp,
  type OrbitGestureState,
} from "./goalViewOrbitGesture";
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

// Tactical Slate demo board (?board=slate): the real Slate engine, mounted
// read-only through its existing experimental getter, so upright equipment can
// be checked under the orbit camera. Coordinates are 0–100 percentages.
const SLATE_DEMO_ITEMS = [
  { id: "c1", type: "cone", x: 62, y: 20 },
  { id: "c2", type: "cone", x: 62, y: 80 },
  { id: "c3", type: "cone", x: 74, y: 35 },
  { id: "d1", type: "discCone", x: 74, y: 65 },
  { id: "p1", type: "pole", x: 55, y: 50 },
  { id: "m1", type: "mannequin", x: 86, y: 42 },
  { id: "h1", type: "hurdle", x: 40, y: 30 },
  { id: "t1", type: "tackleBag", x: 40, y: 70 },
  { id: "l1", type: "ladder", x: 30, y: 50 },
  { id: "b1", type: "football", x: 50, y: 52 },
] as const;

type BoardKind = "sequence" | "slate";
const readBoardKind = (): BoardKind =>
  new URLSearchParams(window.location.search).get("board") === "slate" ? "slate" : "sequence";

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

// Angles for the orbit test matrix (yaw relative to the selected end).
const TEST_YAWS = [0, 45, 90, 135, 180, 270, 360] as const;

type Sampling = "off" | "mip" | "mip-aniso";
const SAMPLING: Record<Sampling, { label: string; mipmaps: boolean; anisotropy: number }> = {
  off: { label: "Mipmaps off", mipmaps: false, anisotropy: 1 },
  mip: { label: "Mipmaps", mipmaps: true, anisotropy: 1 },
  "mip-aniso": { label: "Mipmaps + 8× aniso", mipmaps: true, anisotropy: 8 },
};

type FrameStats = { fps: number; frameMsP95: number };

export default function GoalViewPrototypePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const slateRef = useRef<TacticalPadLiteSurface | null>(null);
  const [boardKind] = useState<BoardKind>(readBoardKind);
  const lensRef = useRef<GoalViewLens | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<GoalViewMode>("top-down");
  const [lensOptions, setLensOptions] = useState<GoalViewLensOptions>(DEFAULT_GOAL_VIEW_LENS_OPTIONS);
  const [playback, setPlayback] = useState<MovementPlaybackState>({ isPlaying: false, isPaused: false });
  const [metrics, setMetrics] = useState<GoalViewLensMetrics | null>(null);
  const [frameStats, setFrameStats] = useState<FrameStats>({ fps: 0, frameMsP95: 0 });
  const [diagnostics, setDiagnostics] = useState<GoalViewDiagnostics | null>(null);
  // Orbit camera: presentation-only state, kept apart from every board field.
  const [orbit, setOrbit] = useState<GoalViewOrbit>(DEFAULT_GOAL_VIEW_ORBIT);
  const [sampling, setSampling] = useState<Sampling>("off");
  const gestureRef = useRef<OrbitGestureState>(IDLE_ORBIT_GESTURE);
  const orbitRef = useRef(orbit);
  orbitRef.current = orbit;
  const pendingOrbitRef = useRef<GoalViewOrbit | null>(null);
  const orbitFrameRef = useRef(0);

  // Top-Down mirrors production Tactical Sequence exactly: quarter-turn 1 in
  // portrait, landscape otherwise (TacticalPlaySurface.tsx setOrientation).
  const isPortrait = usePortraitOrientation();
  const recorder = useCanvasRecorder({
    getCanvas: () => shellRef.current?.getCanvas() ?? slateRef.current?.getCanvas() ?? null,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    if (boardKind === "slate") {
      void createTacticalPadLiteSurface(host, { sport: "gaelic", pitchTheme: "gaelicBands", initialRoster: "formation" }).then((surface) => {
        if (disposed) {
          surface.destroy();
          return;
        }
        surface.setItems(SLATE_DEMO_ITEMS.map((item) => ({ ...item })));
        surface.setItemMode("locked");
        slateRef.current = surface;
        lensRef.current = createGoalViewLens(toSlateGoalViewTargets(surface.getExperimentalRenderTargets()));
        lensRef.current.setOptions(slateGoalViewLensOptions("gaelicBands"));
        setReady(true);
      });
      return () => {
        disposed = true;
        lensRef.current?.destroy();
        lensRef.current = null;
        slateRef.current?.destroy();
        slateRef.current = null;
      };
    }
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
  }, [boardKind]);

  // Apply view: orientation (token counter-rotation) + lens.
  useEffect(() => {
    const shell = shellRef.current ?? slateRef.current;
    const lens = lensRef.current;
    if (!ready || !shell || !lens) return;
    shell.setOrientation(view === "top-down" ? (isPortrait ? 1 : 0) : quarterTurnsForMode(view));
    lens.setEnd(view === "top-down" ? null : view);
  }, [view, ready, isPortrait]);

  useEffect(() => {
    lensRef.current?.setOptions({
      ...lensOptions,
      orbit: orbitRef.current,
      ...SAMPLING[sampling],
      ...(boardKind === "slate" ? slateGoalViewLensOptions("gaelicBands") : {}),
    });
  }, [lensOptions, ready, sampling, boardKind]);

  useEffect(() => {
    lensRef.current?.setOptions({ orbit });
  }, [orbit, ready]);

  // Choosing an end (or Top-Down) always returns to that end's exact camera.
  const chooseView = (v: GoalViewMode) => {
    setOrbit(DEFAULT_GOAL_VIEW_ORBIT);
    setView(v);
  };
  const resetCamera = () => setOrbit(DEFAULT_GOAL_VIEW_ORBIT);

  // One-finger orbit on the read-only shield. Updates are coalesced to one per frame.
  const queueOrbit = (next: GoalViewOrbit) => {
    pendingOrbitRef.current = next;
    if (orbitFrameRef.current) return;
    orbitFrameRef.current = requestAnimationFrame(() => {
      orbitFrameRef.current = 0;
      if (pendingOrbitRef.current) setOrbit(pendingOrbitRef.current);
      pendingOrbitRef.current = null;
    });
  };
  useEffect(() => () => cancelAnimationFrame(orbitFrameRef.current), []);
  const shieldHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      gestureRef.current = orbitGestureDown(gestureRef.current, { id: e.pointerId, x: e.clientX, y: e.clientY }, orbitRef.current);
      if (gestureRef.current.pointerId === e.pointerId) e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const result = orbitGestureMove(gestureRef.current, { id: e.pointerId, x: e.clientX, y: e.clientY }, lensOptions.camera);
      gestureRef.current = result.state;
      if (result.orbit) queueOrbit(result.orbit);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      gestureRef.current = orbitGestureUp(gestureRef.current, { id: e.pointerId });
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
      gestureRef.current = orbitGestureUp(gestureRef.current, { id: e.pointerId });
    },
  };

  // Frame-time sampling (independent of the lens so Top-Down is measured identically).
  useEffect(() => {
    if (!ready) return;
    const app = (shellRef.current ?? slateRef.current)?.getExperimentalRenderTargets().app;
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
    if (!shell) {
      slateRef.current?.play();
      return;
    }
    if (playback.isPlaying) shell.pausePlayback();
    else if (playback.isPaused) shell.resumePlayback();
    else shell.playAll();
  };
  const reset = () => (shellRef.current ?? slateRef.current)?.reset();

  // Automation hook for screenshot / recording / diagnostics runs.
  useEffect(() => {
    if (!ready) return;
    const api = {
      setView: (v: GoalViewMode) => chooseView(v),
      setOrbit: (patch: Partial<GoalViewOrbit>) => setOrbit((o) => clampOrbit({ ...o, ...patch })),
      resetCamera: () => setOrbit(DEFAULT_GOAL_VIEW_ORBIT),
      getOrbit: () => orbitRef.current,
      setSampling: (value: Sampling) => setSampling(value),
      getProjection: () => {
        const p = lensRef.current?.getProjection();
        return p ? { corners: p.corners, yawRad: p.yawRad, orbit: p.orbit } : null;
      },
      setLensOptions: (patch: Partial<GoalViewLensOptions>) =>
        setLensOptions((o) => ({ ...o, ...patch, camera: { ...o.camera, ...(patch.camera ?? {}) } })),
      play: () => shellRef.current?.playAll(),
      reset: () => (shellRef.current ?? slateRef.current)?.reset(),
      pause: () => shellRef.current?.pausePlayback(),
      runDiagnostics: () => lensRef.current?.runDiagnostics() ?? null,
      getMetrics: () => lensRef.current?.getMetrics() ?? null,
      getFrameStats: () => frameStatsRef.current,
      getTokens: () => shellRef.current?.getTokens() ?? slateRef.current?.exportBoardState() ?? [],
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
        <strong style={{ fontSize: 12, marginRight: 4 }}>Goal View PoC · internal · {boardKind === "slate" ? "Slate engine" : "Sequence engine"}</strong>
        {(Object.keys(VIEW_LABELS) as GoalViewMode[]).map((v) => (
          <button key={v} type="button" style={view === v ? BTN_ON : BTN} onClick={() => chooseView(v)} data-view={v}>
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

      {isGoalView && (
        <div data-row="orbit-controls" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 8px", alignItems: "center", fontSize: 11, borderBottom: "1px solid #275C3B" }}>
          <button type="button" style={BTN_ON} onClick={resetCamera} data-action="reset-camera">Reset Camera</button>
          <span>Angle</span>
          {TEST_YAWS.map((yaw) => (
            <button
              key={yaw}
              type="button"
              style={Math.round(orbit.yawDeg) === yaw % 360 ? BTN_ON : BTN}
              onClick={() => setOrbit((o) => clampOrbit({ ...o, yawDeg: yaw }))}
              data-yaw={yaw}
            >
              {yaw}°
            </button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Zoom
            <input
              type="range"
              min={60}
              max={200}
              value={Math.round(orbit.zoom * 100)}
              onChange={(e) => setOrbit((o) => clampOrbit({ ...o, zoom: Number(e.target.value) / 100 }))}
            />
            {orbit.zoom.toFixed(2)}×
          </label>
          <select value={sampling} onChange={(e) => setSampling(e.target.value as Sampling)} style={{ ...BTN, padding: "5px 6px" }} data-control="sampling">
            {(Object.keys(SAMPLING) as Sampling[]).map((k) => (
              <option key={k} value={k}>{SAMPLING[k].label}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        {/* Read-only Goal View: swallow pitch input at the DOM level instead of
            overriding Pixi's pointer mapping. The shell's own stage handlers
            would otherwise receive flat-board coordinates. */}
        {isGoalView && (
          <div
            style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }}
            aria-hidden="true"
            data-experimental="goal-view-orbit-surface"
            {...shieldHandlers}
          />
        )}
        <pre style={{ position: "absolute", left: 6, bottom: 6, margin: 0, padding: 6, fontSize: 10, lineHeight: 1.35, background: "rgba(3,16,11,0.78)", borderRadius: 6, pointerEvents: "none", maxWidth: "calc(100% - 12px)", whiteSpace: "pre-wrap" }}>
          {[
            `${VIEW_LABELS[view]} · ${frameStats.fps.toFixed(0)} fps · p95 ${frameStats.frameMsP95.toFixed(1)} ms`,
            isGoalView
              ? `camera yaw ${orbit.yawDeg.toFixed(0)}° · tilt ${(orbit.elevationDeg ?? baseElevationDeg(lensOptions.camera)).toFixed(1)}°${orbit.elevationDeg == null ? " (C)" : ""} · zoom ${orbit.zoom.toFixed(2)}× · ${SAMPLING[sampling].label} · drag to orbit`
              : null,
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
