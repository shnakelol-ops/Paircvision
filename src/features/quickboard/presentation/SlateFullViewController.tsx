import type { CSSProperties } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import { resolveFullViewPhaseView } from "./fullViewPresentation";

// Minimal Full View presentation controller:  ‹  Phase N/M  ▶/⏸  ›  ✕
//
// Another control surface over the existing Slate engine — it owns no phase
// or playback state. Everything it shows comes from props mirrored from the
// engine (phase cursor/count, play state), and every action calls an
// existing surface method or the page's existing play/pause handlers.

export type SlateFullViewControllerSurface = Pick<TacticalPadLiteSurface, "goToPhase" | "reset">;

export type SlateFullViewControllerProps = {
  getSurface: () => SlateFullViewControllerSurface | null;
  phaseCursor: number;
  phaseCount: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onExit: () => void;
};

const BAR_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "max(8px, calc(env(safe-area-inset-bottom, 0px) + 6px))",
  transform: "translateX(-50%)",
  zIndex: 40,
  height: "44px",
  display: "flex",
  alignItems: "center",
  gap: "2px",
  padding: "0 4px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  background: "rgba(8, 14, 20, 0.52)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.32)",
  color: "rgba(241, 245, 249, 0.92)",
  fontFamily: "Inter, system-ui, sans-serif",
  userSelect: "none",
  touchAction: "manipulation",
};

const BUTTON_STYLE: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  border: "none",
  background: "transparent",
  color: "inherit",
  fontSize: "18px",
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const DISABLED_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  opacity: 0.3,
  cursor: "default",
};

const LABEL_STYLE: CSSProperties = {
  minWidth: "84px",
  textAlign: "center",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const DIVIDER_STYLE: CSSProperties = {
  width: "1px",
  height: "22px",
  margin: "0 4px",
  background: "rgba(255, 255, 255, 0.18)",
};

export default function SlateFullViewController({
  getSurface,
  phaseCursor,
  phaseCount,
  isPlaying,
  onPlay,
  onPause,
  onExit,
}: SlateFullViewControllerProps) {
  const view = resolveFullViewPhaseView(phaseCursor, phaseCount);

  const goPrevious = () => {
    const surface = getSurface();
    if (!surface || view.previousTarget === null) return;
    if (view.previousTarget === "start") {
      surface.reset();
      return;
    }
    surface.goToPhase(view.previousTarget);
  };

  const goNext = () => {
    const surface = getSurface();
    if (!surface || view.nextTarget === null) return;
    surface.goToPhase(view.nextTarget);
  };

  return (
    <div style={BAR_STYLE} role="toolbar" aria-label="Full View controls" data-slate-full-view-controller="true">
      <button
        type="button"
        style={view.canPrevious ? BUTTON_STYLE : DISABLED_BUTTON_STYLE}
        aria-label="Previous phase"
        disabled={!view.canPrevious}
        onClick={goPrevious}
      >
        ‹
      </button>
      <span style={LABEL_STYLE} aria-live="polite">
        {view.label}
      </span>
      <button
        type="button"
        style={BUTTON_STYLE}
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={isPlaying ? onPause : onPlay}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button
        type="button"
        style={view.canNext ? BUTTON_STYLE : DISABLED_BUTTON_STYLE}
        aria-label="Next phase"
        disabled={!view.canNext}
        onClick={goNext}
      >
        ›
      </button>
      <span style={DIVIDER_STYLE} aria-hidden="true" />
      <button type="button" style={BUTTON_STYLE} aria-label="Exit Full View" onClick={onExit}>
        ✕
      </button>
    </div>
  );
}
