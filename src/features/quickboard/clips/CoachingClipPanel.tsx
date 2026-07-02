import { type CSSProperties, type RefObject } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import type { SlateTextAnnotation } from "../annotations/slateTextAnnotation";
import { MAX_COACHING_CLIP_FRAMES, type CoachingClipHandle } from "./useCoachingClip";

type CoachingClipPanelProps = {
  clip: CoachingClipHandle;
  onClose: () => void;
  getSurface: () => TacticalPadLiteSurface | null;
  getTextAnnotations: () => SlateTextAnnotation[];
  panelRef?: RefObject<HTMLDivElement | null>;
};

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  top: "max(56px, calc(env(safe-area-inset-top, 0px) + 54px))",
  width: "min(280px, calc(100vw - 24px))",
  maxHeight: "min(78vh, 620px)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "9px",
  borderRadius: "12px",
  overflowY: "auto",
  overflowX: "hidden",
  background: "rgba(20, 28, 36, 0.92)",
  border: "1px solid rgba(212, 228, 244, 0.24)",
  boxShadow: "0 12px 26px rgba(0, 0, 0, 0.34)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  zIndex: 26,
  fontFamily: "Inter, system-ui, sans-serif",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#eef7ff",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.14px",
};

const SECTION_LABEL_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(200, 222, 240, 0.86)",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const BUTTON_STYLE: CSSProperties = {
  border: "1px solid rgba(212, 228, 244, 0.28)",
  borderRadius: "8px",
  background: "rgba(38, 58, 78, 0.7)",
  color: "#eef7ff",
  fontSize: "10.5px",
  fontWeight: 650,
  padding: "6px 9px",
  cursor: "pointer",
  minWidth: 0,
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  border: "1px solid rgba(100, 200, 140, 0.5)",
  background: "rgba(20, 70, 45, 0.78)",
  color: "rgba(190, 255, 210, 0.96)",
};

const DANGER_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  border: "1px solid rgba(220, 90, 90, 0.4)",
  background: "rgba(70, 22, 22, 0.6)",
  color: "rgba(255, 190, 190, 0.94)",
};

const DISABLED_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  opacity: 0.45,
  cursor: "default",
};

const CLOSE_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  padding: "4px 9px",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
};

const FRAME_STRIP_STYLE: CSSProperties = {
  display: "flex",
  gap: "6px",
  overflowX: "auto",
  padding: "2px 0",
};

const FRAME_THUMB_WRAP_STYLE: CSSProperties = {
  position: "relative",
  flexShrink: 0,
  width: "64px",
  height: "64px",
};

const FRAME_THUMB_STYLE: CSSProperties = {
  width: "64px",
  height: "64px",
  objectFit: "cover",
  borderRadius: "7px",
  border: "1px solid rgba(183, 207, 230, 0.28)",
  background: "rgba(13, 22, 30, 0.72)",
  display: "block",
};

const FRAME_INDEX_STYLE: CSSProperties = {
  position: "absolute",
  left: "3px",
  top: "3px",
  fontSize: "8px",
  fontWeight: 700,
  color: "#eef7ff",
  background: "rgba(0, 0, 0, 0.6)",
  borderRadius: "4px",
  padding: "1px 4px",
};

const FRAME_REMOVE_STYLE: CSSProperties = {
  position: "absolute",
  right: "3px",
  top: "3px",
  width: "16px",
  height: "16px",
  borderRadius: "999px",
  border: "none",
  background: "rgba(70, 12, 12, 0.85)",
  color: "#ffd8d8",
  fontSize: "10px",
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const EMPTY_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(188, 210, 228, 0.8)",
  fontSize: "9.5px",
  lineHeight: 1.4,
};

const ERROR_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(255, 170, 150, 0.94)",
  fontSize: "9.5px",
  lineHeight: 1.4,
};

const PROGRESS_TRACK_STYLE: CSSProperties = {
  width: "100%",
  height: "6px",
  borderRadius: "999px",
  background: "rgba(255, 255, 255, 0.12)",
  overflow: "hidden",
};

const DIVIDER_STYLE: CSSProperties = {
  height: "1px",
  background: "rgba(212, 228, 244, 0.14)",
  margin: "1px 0",
};

const PREVIEW_VIDEO_STYLE: CSSProperties = {
  width: "100%",
  borderRadius: "8px",
  background: "#000",
  display: "block",
};

export default function CoachingClipPanel({
  clip,
  onClose,
  getSurface,
  getTextAnnotations,
  panelRef,
}: CoachingClipPanelProps) {
  const handleAddFrame = () => {
    const surface = getSurface();
    if (!surface) return;
    void clip.addFrame(surface, getTextAnnotations());
  };

  const frameCountLabel = `${clip.frames.length} / ${MAX_COACHING_CLIP_FRAMES}`;
  const isRendering = clip.exportPhase === "rendering";

  return (
    <div ref={panelRef} style={PANEL_STYLE} role="dialog" aria-modal="false" aria-label="Coaching Clip">
      <div style={HEADER_STYLE}>
        <p style={TITLE_STYLE}>🎬 Coaching Clip</p>
        <button type="button" className="control-button" style={CLOSE_BUTTON_STYLE} onClick={onClose}>
          Close
        </button>
      </div>

      <p style={SECTION_LABEL_STYLE}>Frames · {frameCountLabel}</p>
      <div style={ROW_STYLE}>
        <button
          type="button"
          className="control-button"
          style={
            clip.isCapturing || clip.frames.length >= MAX_COACHING_CLIP_FRAMES
              ? DISABLED_BUTTON_STYLE
              : BUTTON_STYLE
          }
          onClick={handleAddFrame}
          disabled={clip.isCapturing || clip.frames.length >= MAX_COACHING_CLIP_FRAMES}
        >
          {clip.isCapturing ? "Capturing…" : "+ Add Frame"}
        </button>
        <button
          type="button"
          className="control-button"
          style={clip.frames.length <= 0 ? DISABLED_BUTTON_STYLE : BUTTON_STYLE}
          onClick={clip.clearFrames}
          disabled={clip.frames.length <= 0}
        >
          Clear Frames
        </button>
      </div>
      {clip.captureError ? <p style={ERROR_TEXT_STYLE}>{clip.captureError}</p> : null}
      {clip.frames.length > 0 ? (
        <div style={FRAME_STRIP_STYLE}>
          {clip.frames.map((frame, index) => (
            <div key={frame.id} style={FRAME_THUMB_WRAP_STYLE}>
              <img src={frame.url} alt={`Frame ${index + 1}`} style={FRAME_THUMB_STYLE} />
              <span style={FRAME_INDEX_STYLE}>{index + 1}</span>
              <button
                type="button"
                aria-label={`Remove frame ${index + 1}`}
                style={FRAME_REMOVE_STYLE}
                onClick={() => clip.removeFrame(frame.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={EMPTY_TEXT_STYLE}>No frames yet. Set up the board, then Add Frame to capture it.</p>
      )}

      <div style={DIVIDER_STYLE} />

      <p style={SECTION_LABEL_STYLE}>Narration</p>
      <div style={ROW_STYLE}>
        {clip.narrationPhase === "recording" ? (
          <button type="button" className="control-button" style={DANGER_BUTTON_STYLE} onClick={clip.stopNarration}>
            ⏹ Stop
          </button>
        ) : (
          <button
            type="button"
            className="control-button"
            style={clip.narrationPhase === "requesting" ? DISABLED_BUTTON_STYLE : BUTTON_STYLE}
            onClick={() => void clip.startNarration()}
            disabled={clip.narrationPhase === "requesting"}
          >
            🎙 {clip.narrationPhase === "recorded" ? "Re-record" : "Record"}
          </button>
        )}
        {clip.narrationPhase === "recorded" ? (
          <button type="button" className="control-button" style={BUTTON_STYLE} onClick={clip.clearNarration}>
            Clear
          </button>
        ) : null}
      </div>
      {clip.narrationError ? <p style={ERROR_TEXT_STYLE}>{clip.narrationError}</p> : null}
      {clip.narrationPhase === "recorded" && clip.narrationUrl ? (
        <audio src={clip.narrationUrl} controls style={{ width: "100%", height: "32px" }} />
      ) : null}

      <div style={DIVIDER_STYLE} />

      <p style={SECTION_LABEL_STYLE}>Export</p>
      {clip.exportPhase === "idle" || clip.exportPhase === "error" ? (
        <>
          <button
            type="button"
            className="control-button"
            style={clip.frames.length <= 0 ? DISABLED_BUTTON_STYLE : PRIMARY_BUTTON_STYLE}
            onClick={() => void clip.generateClip()}
            disabled={clip.frames.length <= 0}
          >
            Generate Clip
          </button>
          {clip.exportError ? <p style={ERROR_TEXT_STYLE}>{clip.exportError}</p> : null}
        </>
      ) : null}
      {isRendering ? (
        <>
          <p style={EMPTY_TEXT_STYLE}>Rendering clip…</p>
          <div style={PROGRESS_TRACK_STYLE}>
            <div
              style={{
                width: `${Math.round(clip.exportProgress * 100)}%`,
                height: "100%",
                background: "rgba(100, 220, 150, 0.85)",
                transition: "width 0.15s linear",
              }}
            />
          </div>
        </>
      ) : null}
      {clip.exportPhase === "done" && clip.exportUrl ? (
        <div style={{ display: "grid", gap: "6px" }}>
          <video src={clip.exportUrl} controls playsInline style={PREVIEW_VIDEO_STYLE} />
          <div style={ROW_STYLE}>
            <button type="button" className="control-button" style={BUTTON_STYLE} onClick={clip.saveClip}>
              💾 Save
            </button>
            <button
              type="button"
              className="control-button"
              style={clip.isSharing ? DISABLED_BUTTON_STYLE : BUTTON_STYLE}
              onClick={() => void clip.shareClip()}
              disabled={clip.isSharing}
            >
              {clip.isSharing ? "Sharing…" : "📤 Share"}
            </button>
            <button type="button" className="control-button" style={BUTTON_STYLE} onClick={clip.resetExport}>
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
