// EXPERIMENTAL — Goal View inside the real Tactical Sequence surface.
//
// Everything Tactical Sequence needs for the experiment lives here so the
// surface itself only carries a handful of flag-gated lines:
//   - GOAL_VIEW_EXPERIMENT_ENABLED: build-time flag. Off in normal production
//     builds (a literal `false` after Vite's env replacement, so the gated JSX
//     and the dynamic lens import are dropped from the bundle).
//   - useSequenceGoalView: attaches the existing read-only lens to the live
//     shell, owns board orientation while a goal view is active, and releases
//     the lens before the shell is destroyed (unmount or WebGL remount).
//   - GoalViewModeRow / GoalViewReadOnlyShield: TOOLS-panel control and the
//     pitch-input shield (read-only; playback and recording stay available).
//
// Enable: automatically on the experimental branch's Vercel preview (any of
// its URLs); VITE_EXPERIMENTAL_GOAL_VIEW=true at build time; or `?goalview` in
// a dev build (`npm run dev`). Never persisted; no saved-board fields are read
// or written.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { MovementCanvasShellHandle } from "../../movement-board/shell/types";
import type { GoalViewLens } from "./createGoalViewLens";
import { quarterTurnsForMode, type GoalViewMode } from "./goalViewCamera";

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

export const GOAL_VIEW_EXPERIMENT_ENABLED: boolean =
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

export type SequenceGoalView = {
  mode: GoalViewMode;
  setMode: (mode: GoalViewMode) => void;
  /** True while a Left/Right End view is showing (always false when the flag is off). */
  isGoalView: boolean;
  /** Must run before the shell it is attached to is destroyed. Stable identity. */
  releaseBeforeShellDestroy: () => void;
};

export function useSequenceGoalView(shell: MovementCanvasShellHandle | null): SequenceGoalView {
  const [mode, setModeState] = useState<GoalViewMode>("top-down");
  const lensRef = useRef<{ lens: GoalViewLens; shell: MovementCanvasShellHandle } | null>(null);

  const release = useCallback(() => {
    lensRef.current?.lens.destroy();
    lensRef.current = null;
  }, []);

  const setMode = useCallback((next: GoalViewMode) => {
    if (GOAL_VIEW_EXPERIMENT_ENABLED) setModeState(next);
  }, []);

  useEffect(() => {
    if (!GOAL_VIEW_EXPERIMENT_ENABLED || !shell) return;
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
    void loadGoalViewLensModule().then(({ createGoalViewLens }) => {
      if (cancelled) return;
      if (!lensRef.current) {
        lensRef.current = { lens: createGoalViewLens(shell.getExperimentalRenderTargets()), shell };
      }
      lensRef.current.lens.setEnd(mode);
    });
    return () => {
      cancelled = true;
    };
  }, [shell, mode, release]);

  return { mode, setMode, isGoalView: GOAL_VIEW_EXPERIMENT_ENABLED && mode !== "top-down", releaseBeforeShellDestroy: release };
}

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

const QUICK_TOGGLE_STYLE: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 3,
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(6, 21, 15, 0.86)",
  border: "1px solid rgba(124, 255, 114, 0.6)",
  color: "#E9FBE7",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
  cursor: "pointer",
  touchAction: "manipulation",
};

/**
 * On-pitch Goal View switch: one tap cycles Top-Down → Left End → Right End.
 * Sits above the read-only shield so it works in every view.
 */
export function GoalViewQuickToggle(props: { mode: GoalViewMode; onChange: (mode: GoalViewMode) => void }) {
  const index = GOAL_VIEW_MODE_OPTIONS.findIndex((o) => o.id === props.mode);
  const current = GOAL_VIEW_MODE_OPTIONS[index] ?? GOAL_VIEW_MODE_OPTIONS[0];
  const next = GOAL_VIEW_MODE_OPTIONS[(index + 1) % GOAL_VIEW_MODE_OPTIONS.length];
  return (
    <button
      type="button"
      style={QUICK_TOGGLE_STYLE}
      data-experimental="goal-view-quick-toggle"
      aria-label={`Goal View: ${current.label}. Tap for ${next.label}`}
      onClick={() => props.onChange(next.id)}
    >
      View: {current.label} ▸
    </button>
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
export function GoalViewReadOnlyShield({ mode }: { mode: GoalViewMode }) {
  const label = GOAL_VIEW_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? "Goal View";
  return (
    <div style={SHIELD_STYLE} data-experimental="goal-view-shield" aria-hidden="true">
      <div style={BADGE_STYLE}>{label} · view only — switch to Top-Down to edit</div>
    </div>
  );
}
