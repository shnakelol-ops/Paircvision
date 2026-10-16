// Goal View inside the real Tactical Sequence and Tactical Slate surfaces.
//
// Everything the boards need lives here so each surface only carries a
// handful of gated lines:
//   - GOAL_VIEW_ENABLED: Goal View on the boards. Public release
//     (GOAL_VIEW_PUBLIC_ENABLED) or an internal testing build.
//   - GOAL_VIEW_INTERNAL_TOOLS_ENABLED: internal testing only (the
//     /internal/goal-view prototype route and the ?goalviewSampling override).
//     A literal `false` in production builds, so those are compiled out.
//   - useSequenceGoalView: attaches the existing read-only lens to the live
//     shell, owns board orientation while a goal view is active, and releases
//     the lens before the shell is destroyed (unmount or WebGL remount).
//   - GoalViewModeRow / GoalViewReadOnlyShield: TOOLS-panel control and the
//     pitch-input shield (read-only; playback and recording stay available).
//     With a camera, the shield is also the one-finger orbit surface.
//   - GoalViewCameraControls: camera distance, Fit pitch and Reset Camera,
//     beside the selector.
//
// Internal tools: automatically on the experimental branch's Vercel preview
// (any of its URLs); VITE_EXPERIMENTAL_GOAL_VIEW=true at build time; or
// `?goalview` in a dev build (`npm run dev`). Never persisted; no saved-board
// fields are read or written.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { GoalViewLens, GoalViewLensOptions, GoalViewRenderTargets } from "./createGoalViewLens";
import {
  DEFAULT_GOAL_VIEW_CAMERA,
  DEFAULT_GOAL_VIEW_DISTANCE,
  DEFAULT_GOAL_VIEW_ORBIT,
  GOAL_VIEW_DISTANCES,
  cameraForDistance,
  isIdentityOrbit,
  quarterTurnsForMode,
  wholePitchFitZoom,
  type GoalViewDistance,
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

/**
 * The experimental branch's Vercel preview (branch alias). Goal View can be
 * switched on with `?goalview` on this exact host only — never on production,
 * on per-commit deployment URLs or on any other branch's preview.
 */
export const GOAL_VIEW_PREVIEW_HOST = "paircvision-git-claude-paircvision-g-916a4b-shnakelol-pitchisde.vercel.app";

// Injected by vite.config.ts (`define`). False for Vercel production builds and
// for previews of any other branch, so the feature is compiled out there.
// Undefined under vitest (no vite.config define), hence the typeof guard.
declare const __GOAL_VIEW_PREVIEW_ELIGIBLE__: boolean;
declare const __GOAL_VIEW_BRANCH_PREVIEW__: boolean;
const PREVIEW_ELIGIBLE_BUILD: boolean =
  typeof __GOAL_VIEW_PREVIEW_ELIGIBLE__ !== "undefined" && __GOAL_VIEW_PREVIEW_ELIGIBLE__;
// Vercel confirmed at build time: a preview of the experimental branch. Such a
// bundle is only ever served from that branch's deployments.
const BRANCH_PREVIEW_BUILD: boolean =
  typeof __GOAL_VIEW_BRANCH_PREVIEW__ !== "undefined" && __GOAL_VIEW_BRANCH_PREVIEW__;

export function computeGoalViewExperimentEnabled(input: {
  envFlag: string | undefined;
  isDevBuild: boolean;
  branchPreviewBuild: boolean;
  previewEligibleBuild: boolean;
  hostname: string;
  search: string;
}): boolean {
  if (input.envFlag === "true") return true;
  // The experimental branch's preview: always on, on any of its URLs.
  if (input.branchPreviewBuild) return true;
  if (input.previewEligibleBuild && input.hostname === GOAL_VIEW_PREVIEW_HOST) return true;
  return input.isDevBuild && new URLSearchParams(input.search).has("goalview");
}

/**
 * Internal testing gate: the /internal/goal-view prototype route and the
 * ?goalviewSampling override. False in production builds.
 */
export const GOAL_VIEW_INTERNAL_TOOLS_ENABLED: boolean =
  import.meta.env.VITE_EXPERIMENTAL_GOAL_VIEW === "true" ||
  ((import.meta.env.DEV || PREVIEW_ELIGIBLE_BUILD || BRANCH_PREVIEW_BUILD) &&
    typeof window !== "undefined" &&
    computeGoalViewExperimentEnabled({
      envFlag: import.meta.env.VITE_EXPERIMENTAL_GOAL_VIEW,
      isDevBuild: import.meta.env.DEV,
      branchPreviewBuild: BRANCH_PREVIEW_BUILD,
      previewEligibleBuild: PREVIEW_ELIGIBLE_BUILD,
      hostname: window.location.hostname,
      search: window.location.search,
    }));

/**
 * Public release gate: Goal View in Tactical Slate and Tactical Sequence.
 * On in every build. Rollback without a code change: build with
 * VITE_GOAL_VIEW_PUBLIC=false (then only internal testing builds show it).
 */
export const GOAL_VIEW_PUBLIC_ENABLED: boolean = import.meta.env.VITE_GOAL_VIEW_PUBLIC !== "false";

/** Goal View on the boards: the public release, or an internal testing build. */
export const GOAL_VIEW_ENABLED: boolean = GOAL_VIEW_PUBLIC_ENABLED || GOAL_VIEW_INTERNAL_TOOLS_ENABLED;

// One shared load of the lens module. Loading it also registers Pixi's mesh
// render pipe (pixi.js Mesh.mjs imports scene/mesh/init as a side effect).
// Pixi only gives a renderer the pipes registered BEFORE it is created, so in
// production builds (where the lens is a lazy chunk) this module must be
// loaded before the Sequence shell creates its renderer — otherwise the
// perspective mesh has no pipe and the Goal View pitch renders blank.
let lensModulePromise: Promise<typeof import("./createGoalViewLens")> | null = null;
function loadGoalViewLensModule() {
  lensModulePromise ??= import("./createGoalViewLens");
  return lensModulePromise;
}

/**
 * Call (and await) before creating the Sequence shell while the experiment is
 * enabled. Always resolves — a failed load must never stop the board mounting.
 */
export function preloadGoalViewBeforeShell(): Promise<void> {
  return loadGoalViewLensModule().then(
    () => undefined,
    () => undefined,
  );
}

export const GOAL_VIEW_MODE_OPTIONS: ReadonlyArray<{ id: GoalViewMode; label: string }> = [
  { id: "top-down", label: "Top-Down" },
  { id: "left-end", label: "Left End" },
  { id: "right-end", label: "Right End" },
];

/** Pointer handlers for the Goal View shield: one-finger orbit. */
export type GoalViewOrbitSurfaceProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
};

export type GoalViewCamera = {
  /** Presentation-only camera state; never part of any board data. */
  orbit: GoalViewOrbit;
  /** False while the selected end's Camera C preset is showing. */
  moved: boolean;
  /** True while "Fit pitch" (one fixed zoom-out) is on. */
  fitted: boolean;
  reset: () => void;
  /** Toggles one fixed zoom at which the whole pitch fits at every angle. */
  toggleFit: () => void;
  /** Camera distance preset (Wide / Balanced / Near). Kept across Reset Camera and view changes. */
  distance: GoalViewDistance;
  /** Next distance preset; keeps the current camera direction and tilt. */
  cycleDistance: () => void;
  surfaceProps: GoalViewOrbitSurfaceProps;
};

export type SequenceGoalView = {
  mode: GoalViewMode;
  setMode: (mode: GoalViewMode) => void;
  /** True while a Left/Right End view is showing (always false when the flag is off). */
  isGoalView: boolean;
  /** Must run before the shell it is attached to is destroyed. Stable identity. */
  releaseBeforeShellDestroy: () => void;
  camera: GoalViewCamera;
};

/**
 * Sampling override for real-device testing in internal testing builds only:
 * `?goalviewSampling=mip` or `=mip-aniso`. Default (and production): off.
 */
function readSamplingOverride(): Partial<GoalViewLensOptions> {
  if (!GOAL_VIEW_INTERNAL_TOOLS_ENABLED || typeof window === "undefined") return {};
  const value = new URLSearchParams(window.location.search).get("goalviewSampling");
  if (value === "mip") return { mipmaps: true, anisotropy: 1 };
  if (value === "mip-aniso") return { mipmaps: true, anisotropy: 8 };
  return {};
}

/**
 * Anything the shared lens can attach to: the Tactical Sequence shell handle
 * as-is, or a Tactical Slate surface via createSlateGoalViewHost.
 */
export type GoalViewHost = {
  setOrientation: (quarterTurns: number) => void;
  getExperimentalRenderTargets: () => GoalViewRenderTargets;
  /** Board-specific lens options (e.g. no upright goals on a goal-less board). */
  lensOptions?: Partial<GoalViewLensOptions>;
};

export function useGoalView(shell: GoalViewHost | null): SequenceGoalView {
  const [mode, setModeState] = useState<GoalViewMode>("top-down");
  const [orbit, setOrbit] = useState<GoalViewOrbit>(DEFAULT_GOAL_VIEW_ORBIT);
  // Presentation-only, like the orbit: never saved with the board.
  const [distance, setDistance] = useState<GoalViewDistance>(DEFAULT_GOAL_VIEW_DISTANCE);
  const distanceRef = useRef(distance);
  distanceRef.current = distance;
  const lensRef = useRef<{ lens: GoalViewLens; shell: GoalViewHost } | null>(null);
  const orbitRef = useRef(orbit);
  orbitRef.current = orbit;
  const gestureRef = useRef<OrbitGestureState>(IDLE_ORBIT_GESTURE);
  const pendingOrbitRef = useRef<GoalViewOrbit | null>(null);
  const frameRef = useRef(0);

  const release = useCallback(() => {
    lensRef.current?.lens.destroy();
    lensRef.current = null;
  }, []);

  // Drop a drag update still queued for the next frame, so it can never land
  // after Reset Camera or a view change.
  const cancelPendingOrbit = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    pendingOrbitRef.current = null;
  }, []);

  // Safe fallback: if the lens cannot load or attach, or fails after Goal View
  // has started (e.g. limited graphics), release it (which restores the
  // board's own scene) and return to Top-Down.
  const fallBackToTopDown = useCallback(
    (error: unknown) => {
      console.warn("[GoalView] unavailable, staying in Top-Down", error);
      try {
        release();
      } catch {
        // The board must never be left half-attached; nothing else to undo.
      }
      cancelPendingOrbit();
      gestureRef.current = IDLE_ORBIT_GESTURE;
      setOrbit(DEFAULT_GOAL_VIEW_ORBIT);
      setModeState("top-down");
    },
    [release, cancelPendingOrbit],
  );

  // Choosing a view always starts from that end's Camera C preset.
  const setMode = useCallback((next: GoalViewMode) => {
    if (!GOAL_VIEW_ENABLED) return;
    cancelPendingOrbit();
    gestureRef.current = IDLE_ORBIT_GESTURE;
    setOrbit(DEFAULT_GOAL_VIEW_ORBIT);
    setModeState(next);
  }, [cancelPendingOrbit]);

  useEffect(() => {
    if (!GOAL_VIEW_ENABLED || !shell) return;
    // A lens bound to a previous shell must never be reused.
    if (lensRef.current && lensRef.current.shell !== shell) release();
    if (mode === "top-down") {
      lensRef.current?.lens.setEnd(null);
      return;
    }
    // Goal View owns orientation while active: the quarter-turn the shell's
    // existing token/ball counter-rotation needs for this end.
    shell.setOrientation(quarterTurnsForMode(mode));
    let cancelled = false;
    const fail = (error: unknown) => {
      if (!cancelled) fallBackToTopDown(error);
    };
    void loadGoalViewLensModule().then(({ createGoalViewLens }) => {
      if (cancelled) return;
      try {
        if (!lensRef.current) {
          const lens = createGoalViewLens(shell.getExperimentalRenderTargets(), fallBackToTopDown);
          lensRef.current = { lens, shell };
          lens.setOptions({ ...shell.lensOptions, ...readSamplingOverride(), camera: cameraForDistance(distanceRef.current) });
        }
        lensRef.current.lens.setEnd(mode);
        lensRef.current.lens.setOptions({ orbit: orbitRef.current });
      } catch (error) {
        fail(error);
      }
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [shell, mode, release, fallBackToTopDown]);

  if (import.meta.env.DEV && typeof window !== "undefined") {
    // Dev-server test hook only (compiled out of every build): browser tests
    // read token positions and the camera state to drive real gestures.
    (window as unknown as { __goalViewDebug?: unknown }).__goalViewDebug = {
      getTargets: () => shell?.getExperimentalRenderTargets() ?? null,
      getOrbit: () => orbitRef.current,
      getDistance: () => distanceRef.current,
      getMetrics: () => lensRef.current?.lens.getMetrics() ?? null,
    };
  }

  // Camera moves only change the lens's projection: never the board.
  useEffect(() => {
    if (!GOAL_VIEW_ENABLED) return;
    lensRef.current?.lens.setOptions({ orbit });
  }, [orbit]);

  // Distance only changes the framing; the orbit (direction, tilt) is untouched.
  useEffect(() => {
    if (!GOAL_VIEW_ENABLED) return;
    lensRef.current?.lens.setOptions({ camera: cameraForDistance(distance) });
  }, [distance]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const reset = useCallback(() => {
    cancelPendingOrbit();
    gestureRef.current = IDLE_ORBIT_GESTURE;
    setOrbit(DEFAULT_GOAL_VIEW_ORBIT);
  }, [cancelPendingOrbit]);

  const toggleFit = useCallback(() => {
    const current = orbitRef.current;
    if (current.zoom !== 1) {
      setOrbit({ ...current, zoom: 1 });
      return;
    }
    const screen = lensRef.current?.lens.getProjection()?.screen;
    if (!screen) return;
    setOrbit({ ...current, zoom: wholePitchFitZoom(cameraForDistance(distanceRef.current), screen, current.elevationDeg) });
  }, []);

  const cycleDistance = useCallback(() => {
    const index = GOAL_VIEW_DISTANCES.findIndex((d) => d.id === distanceRef.current);
    const next = GOAL_VIEW_DISTANCES[(index + 1) % GOAL_VIEW_DISTANCES.length].id;
    setDistance(next);
    // Fit Pitch stays a whole-pitch fit: its zoom is relative to the framing,
    // so recompute it for the new distance. Direction and tilt are unchanged.
    const current = orbitRef.current;
    const screen = lensRef.current?.lens.getProjection()?.screen;
    if (current.zoom !== 1 && screen) {
      setOrbit({ ...current, zoom: wholePitchFitZoom(cameraForDistance(next), screen, current.elevationDeg) });
    }
  }, []);

  const surfaceProps = useMemo<GoalViewOrbitSurfaceProps>(() => {
    // One state update per animation frame, however fast pointer events arrive.
    const queue = (next: GoalViewOrbit) => {
      pendingOrbitRef.current = next;
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const pending = pendingOrbitRef.current;
        pendingOrbitRef.current = null;
        if (pending) setOrbit(pending);
      });
    };
    const end = (e: ReactPointerEvent<HTMLElement>) => {
      gestureRef.current = orbitGestureUp(gestureRef.current, { id: e.pointerId });
    };
    return {
      onPointerDown: (e) => {
        gestureRef.current = orbitGestureDown(gestureRef.current, { id: e.pointerId, x: e.clientX, y: e.clientY }, orbitRef.current);
        if (gestureRef.current.pointerId === e.pointerId) e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e) => {
        const result = orbitGestureMove(gestureRef.current, { id: e.pointerId, x: e.clientX, y: e.clientY }, DEFAULT_GOAL_VIEW_CAMERA);
        gestureRef.current = result.state;
        if (result.orbit) queue(result.orbit);
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  }, []);

  const camera = useMemo<GoalViewCamera>(
    () => ({ orbit, moved: !isIdentityOrbit(orbit), fitted: orbit.zoom !== 1, reset, toggleFit, distance, cycleDistance, surfaceProps }),
    [orbit, reset, toggleFit, distance, cycleDistance, surfaceProps],
  );

  return {
    mode,
    setMode,
    isGoalView: GOAL_VIEW_ENABLED && mode !== "top-down",
    releaseBeforeShellDestroy: release,
    camera,
  };
}

/** Tactical Sequence's name for the shared hook (unchanged behaviour). */
export const useSequenceGoalView = useGoalView;

export function GoalViewModeRow(props: {
  mode: GoalViewMode;
  onChange: (mode: GoalViewMode) => void;
  rowStyle: CSSProperties;
  labelStyle: CSSProperties;
  buttonStyle: CSSProperties;
  activeButtonStyle: CSSProperties;
}) {
  return (
    <div style={props.rowStyle} data-experimental="goal-view">
      <span style={props.labelStyle}>Goal View (beta)</span>
      {GOAL_VIEW_MODE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={opt.id === props.mode}
          style={opt.id === props.mode ? props.activeButtonStyle : props.buttonStyle}
          onClick={() => props.onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// The selector sits OUTSIDE the pitch box (never over markings, players, goals
// or equipment) and takes no layout space, so the pitch is not shrunk:
// "above" anchors it right-aligned just above the pitch's top edge; "side"
// (short landscape screens with no room above) anchors it just right of the
// pitch's top-right corner. The 44px-tall button is the touch target; the
// visible pill inside it stays compact. In a goal view the selector drops the
// "View:" prefix ("Left End ▸") and is narrower, leaving room for the camera
// controls beside it without reaching the board's top-left buttons. On a
// height-limited portrait phone the (centred) pitch is narrower than the
// screen, so in a goal view the "above" row also moves up to 24px into the
// free margin right of the pitch, stopping 4px from the screen edge.
const QUICK_TOGGLE_HIT_HEIGHT = 44;
const QUICK_TOGGLE_WIDTH = 136;
const QUICK_TOGGLE_GOAL_VIEW_WIDTH = 92;
const GOAL_VIEW_ROW_RIGHT = "max(-24px, min(0px, calc((100% - 100vw) / 2 + 4px)))";

const QUICK_TOGGLE_BUTTON_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 3,
  width: QUICK_TOGGLE_WIDTH,
  height: QUICK_TOGGLE_HIT_HEIGHT,
  padding: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

const QUICK_TOGGLE_PLACEMENT: Record<"above" | "side", CSSProperties> = {
  above: { right: 0, bottom: "calc(100% + 2px)" },
  side: { left: "calc(100% + 6px)", top: 0, justifyContent: "flex-start" },
};

const QUICK_TOGGLE_PILL_STYLE: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  height: 32,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(6, 21, 15, 0.86)",
  border: "1px solid rgba(124, 255, 114, 0.6)",
  color: "#E9FBE7",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
};

const QUICK_TOGGLE_GOAL_VIEW_PILL_STYLE: CSSProperties = {
  ...QUICK_TOGGLE_PILL_STYLE,
  padding: "0 8px",
};

/**
 * Goal View switch shown outside the pitch box: one tap cycles
 * Top-Down → Left End → Right End. Must be rendered inside the pitch box's
 * positioned container (it is anchored to that box's edges).
 */
export function GoalViewQuickToggle(props: {
  mode: GoalViewMode;
  onChange: (mode: GoalViewMode) => void;
  placement?: "above" | "side";
  /** Shows the camera controls (Fit pitch, Reset Camera) beside the selector in a goal view. */
  camera?: GoalViewCamera;
}) {
  const index = GOAL_VIEW_MODE_OPTIONS.findIndex((o) => o.id === props.mode);
  const current = GOAL_VIEW_MODE_OPTIONS[index] ?? GOAL_VIEW_MODE_OPTIONS[0];
  const next = GOAL_VIEW_MODE_OPTIONS[(index + 1) % GOAL_VIEW_MODE_OPTIONS.length];
  const placement = props.placement ?? "above";
  const goalView = props.mode !== "top-down";
  const camera = goalView ? props.camera : undefined;
  return (
    <>
    {camera ? <GoalViewCameraControls camera={camera} placement={placement} /> : null}
    <button
      type="button"
      style={{
        ...QUICK_TOGGLE_BUTTON_STYLE,
        ...QUICK_TOGGLE_PLACEMENT[placement],
        ...(goalView ? { width: QUICK_TOGGLE_GOAL_VIEW_WIDTH } : null),
        ...(goalView && placement === "above" ? { right: GOAL_VIEW_ROW_RIGHT } : null),
      }}
      data-experimental="goal-view-quick-toggle"
      data-placement={placement}
      aria-label={`Goal View: ${current.label}. Tap for ${next.label}`}
      onClick={() => props.onChange(next.id)}
    >
      <span style={goalView ? QUICK_TOGGLE_GOAL_VIEW_PILL_STYLE : QUICK_TOGGLE_PILL_STYLE}>
        {goalView ? current.label : `View: ${current.label}`} ▸
      </span>
    </button>
    </>
  );
}

// Camera controls: distance, Fit pitch and Reset Camera as three compact
// buttons (44×44px touch targets) in the same row as the selector, directly
// to its left ("above"), or directly under it ("side"). Outside the pitch
// box, like the selector; the row stays clear of the board's top-left
// buttons on a 360px phone.
const CAMERA_BUTTON_WIDTH = 44;
const CAMERA_BUTTON_HEIGHT = 44;
const CAMERA_CONTROLS_PLACEMENT: Record<"above" | "side", CSSProperties> = {
  above: { right: `calc(${GOAL_VIEW_ROW_RIGHT} + ${QUICK_TOGGLE_GOAL_VIEW_WIDTH + 2}px)`, bottom: "calc(100% + 2px)", flexDirection: "row" },
  side: { left: "calc(100% + 6px)", top: QUICK_TOGGLE_HIT_HEIGHT + 2, flexDirection: "row" },
};
const CAMERA_CONTROLS_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 3,
  display: "flex",
  gap: 0,
};
const CAMERA_BUTTON_STYLE: CSSProperties = {
  width: CAMERA_BUTTON_WIDTH,
  height: CAMERA_BUTTON_HEIGHT,
  padding: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};
const CAMERA_PILL_STYLE: CSSProperties = {
  ...QUICK_TOGGLE_PILL_STYLE,
  width: 36,
  padding: 0,
  fontSize: 16,
};

const DISTANCE_PILL_STYLE: CSSProperties = {
  ...CAMERA_PILL_STYLE,
  fontSize: 10,
  letterSpacing: 0,
};

export function GoalViewCameraControls({ camera, placement }: { camera: GoalViewCamera; placement: "above" | "side" }) {
  const distanceIndex = Math.max(0, GOAL_VIEW_DISTANCES.findIndex((d) => d.id === camera.distance));
  const distanceInfo = GOAL_VIEW_DISTANCES[distanceIndex];
  const nextDistance = GOAL_VIEW_DISTANCES[(distanceIndex + 1) % GOAL_VIEW_DISTANCES.length];
  const activePill = (on: boolean): CSSProperties =>
    on ? { ...CAMERA_PILL_STYLE, background: "rgba(124, 255, 114, 0.9)", color: "#06150F" } : CAMERA_PILL_STYLE;
  return (
    <div style={{ ...CAMERA_CONTROLS_STYLE, ...CAMERA_CONTROLS_PLACEMENT[placement] }} data-experimental="goal-view-camera-controls">
      <button
        type="button"
        style={CAMERA_BUTTON_STYLE}
        aria-label={`Camera distance: ${distanceInfo.label}. Tap for ${nextDistance.label}`}
        title={`Camera distance: ${distanceInfo.label}`}
        data-action="goal-view-distance"
        data-distance={camera.distance}
        onClick={camera.cycleDistance}
      >
        <span style={DISTANCE_PILL_STYLE} aria-hidden="true">{distanceInfo.short}</span>
      </button>
      <button
        type="button"
        style={CAMERA_BUTTON_STYLE}
        aria-label={camera.fitted ? "Fit pitch: on. Tap for the normal framing" : "Fit pitch: show the whole pitch at every angle"}
        aria-pressed={camera.fitted}
        title="Fit pitch"
        data-action="goal-view-fit"
        onClick={camera.toggleFit}
      >
        <span style={activePill(camera.fitted)} aria-hidden="true">⤢</span>
      </button>
      <button
        type="button"
        style={{ ...CAMERA_BUTTON_STYLE, opacity: camera.moved ? 1 : 0.45 }}
        aria-label="Reset Camera"
        title="Reset Camera"
        data-action="goal-view-reset-camera"
        disabled={!camera.moved}
        onClick={camera.reset}
      >
        <span style={CAMERA_PILL_STYLE} aria-hidden="true">⟲</span>
      </button>
    </div>
  );
}

const SHIELD_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  touchAction: "none",
  borderRadius: "12px",
};

const BADGE_STYLE: CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 8,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(6, 21, 15, 0.78)",
  border: "1px solid rgba(124, 255, 114, 0.45)",
  color: "#E9FBE7",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

/**
 * Read-only Goal View: swallows pitch input at the DOM level (the shell's
 * own pointer handlers would otherwise receive flat-board coordinates).
 * Playback, recording and all panel controls sit outside the pitch box and
 * keep working.
 */
export function GoalViewReadOnlyShield({ mode, camera }: { mode: GoalViewMode; camera?: GoalViewCamera }) {
  const label = GOAL_VIEW_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? "Goal View";
  return (
    <div
      style={camera ? { ...SHIELD_STYLE, cursor: "grab" } : SHIELD_STYLE}
      data-experimental="goal-view-shield"
      aria-hidden="true"
      {...camera?.surfaceProps}
    >
      <div style={BADGE_STYLE}>
        {camera ? `${label} · drag to rotate · Top-Down to edit` : `${label} · view only — switch to Top-Down to edit`}
      </div>
    </div>
  );
}
