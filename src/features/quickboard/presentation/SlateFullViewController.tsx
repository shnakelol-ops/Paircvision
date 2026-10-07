import type { CSSProperties } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import type { RecordPhase } from "../../shared/useCanvasRecorder";
import { resolveFullViewPhaseView } from "./fullViewPresentation";

// Minimal Full View controller:  ‹  Phase N/M  ▶/⏸  ›  ●  ✕
//
// Another control surface over the existing Slate engine and the existing
// canvas recorder — it owns no phase, playback or recording state. Everything
// it shows comes from props mirrored from those systems, and every action
// calls an existing surface method or the page's existing handlers.

export type SlateFullViewControllerSurface = Pick<TacticalPadLiteSurface, "goToPhase" | "reset">;

export type SlateFullViewControllerProps = {
  getSurface: () => SlateFullViewControllerSurface | null;
  phaseCursor: number;
  phaseCount: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onExit: () => void;
  /** Existing Slate recorder state (useCanvasRecorder). */
  recordPhase: RecordPhase;
  recordCountdown: number;
  canRecord: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
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

const RECORD_DOT_STYLE: CSSProperties = {
  width: "14px",
  height: "14px",
  borderRadius: "50%",
  background: "#ff3030",
  boxShadow: "0 0 6px 1px rgba(255, 48, 48, 0.55)",
};

const STOP_SQUARE_STYLE: CSSProperties = {
  width: "13px",
  height: "13px",
  borderRadius: "2px",
  background: "#ff3030",
  animation: "tp-rec-pulse 1.1s ease-in-out infinite",
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
  recordPhase,
  recordCountdown,
  canRecord,
  onStartRecording,
  onStopRecording,
}: SlateFullViewControllerProps) {
  const view = resolveFullViewPhaseView(phaseCursor, phaseCount);
  const isRecording = recordPhase === "recording";
  const isCountingDown = recordPhase === "countdown";

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
      {isRecording ? (
        <button type="button" style={BUTTON_STYLE} aria-label="Stop recording" onClick={onStopRecording}>
          <span style={STOP_SQUARE_STYLE} />
        </button>
      ) : isCountingDown ? (
        <button type="button" style={DISABLED_BUTTON_STYLE} aria-label="Recording starts soon" disabled>
          {recordCountdown}
        </button>
      ) : (
        <button
          type="button"
          style={canRecord ? BUTTON_STYLE : DISABLED_BUTTON_STYLE}
          aria-label="Start recording"
          title={canRecord ? "Record the board" : "Recording not supported in this browser"}
          disabled={!canRecord}
          onClick={onStartRecording}
        >
          <span style={RECORD_DOT_STYLE} />
        </button>
      )}
      <button type="button" style={BUTTON_STYLE} aria-label="Exit Full View" onClick={onExit}>
        ✕
      </button>
    </div>
  );
}
