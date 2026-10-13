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
// Enable: VITE_EXPERIMENTAL_GOAL_VIEW=true at build/dev time; or `?goalview`
// in the URL of a dev build (`npm run dev`); or `?goalview` on the experimental
// branch's own Vercel preview host (GOAL_VIEW_PREVIEW_HOST). Never persisted;
// no saved-board fields are read or written.

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
const PREVIEW_ELIGIBLE_BUILD: boolean =
  typeof __GOAL_VIEW_PREVIEW_ELIGIBLE__ !== "undefined" && __GOAL_VIEW_PREVIEW_ELIGIBLE__;

export function computeGoalViewExperimentEnabled(input: {
  envFlag: string | undefined;
  isDevBuild: boolean;
  previewEligibleBuild: boolean;
  hostname: string;
  search: string;
}): boolean {
  if (input.envFlag === "true") return true;
  if (!new URLSearchParams(input.search).has("goalview")) return false;
  if (input.isDevBuild) return true;
  return input.previewEligibleBuild && input.hostname === GOAL_VIEW_PREVIEW_HOST;
}

export const GOAL_VIEW_EXPERIMENT_ENABLED: boolean =
  import.meta.env.VITE_EXPERIMENTAL_GOAL_VIEW === "true" ||
  ((import.meta.env.DEV || PREVIEW_ELIGIBLE_BUILD) &&
    typeof window !== "undefined" &&
    computeGoalViewExperimentEnabled({
      envFlag: import.meta.env.VITE_EXPERIMENTAL_GOAL_VIEW,
      isDevBuild: import.meta.env.DEV,
      previewEligibleBuild: PREVIEW_ELIGIBLE_BUILD,
      hostname: window.location.hostname,
      search: window.location.search,
    }));

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
    void import("./createGoalViewLens").then(({ createGoalViewLens }) => {
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
