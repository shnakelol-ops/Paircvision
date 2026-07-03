import { type CSSProperties, type RefObject } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import type { SlateTextAnnotation } from "../annotations/slateTextAnnotation";
import {
  MAX_COACHING_SLIDES,
  SLIDE_DURATION_OPTIONS_SECONDS,
  type CoachingClipHandle,
  type SlideAdvanceMode,
} from "./useCoachingClip";

const SLIDE_ADVANCE_MODES: { mode: SlideAdvanceMode; label: string }[] = [
  { mode: "auto", label: "Auto" },
  { mode: "manual", label: "Manual style" },
];

type CoachingClipPanelProps = {
  clip: CoachingClipHandle;
  onClose: () => void;
  /** Opens the existing PR #210 image-upload/background picker so the coach can start a new slide. */
  onAddSlide: () => void;
  getSurface: () => TacticalPadLiteSurface | null;
  getTextAnnotations: () => SlateTextAnnotation[];
  panelRef?: RefObject<HTMLDivElement | null>;
};

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  top: "max(56px, calc(env(safe-area-inset-top, 0px) + 54px))",
  width: "min(280px, calc(100vw - 24px))",
  // `dvh` (not `vh`) so the cap tracks the actual visible viewport on mobile
  // browsers that show/hide a toolbar in landscape — plain `vh` can measure
  // taller than what's really visible, pushing the sticky footer off-screen.
  maxHeight:
    "min(78dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 66px))",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "9px",
  borderRadius: "12px",
  overflow: "hidden",
  background: "rgba(20, 28, 36, 0.92)",
  border: "1px solid rgba(212, 228, 244, 0.24)",
  boxShadow: "0 12px 26px rgba(0, 0, 0, 0.34)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  zIndex: 26,
  fontFamily: "Inter, system-ui, sans-serif",
};

// The slide list can grow arbitrarily long, but the export action (and its
// progress/preview once rendering) must always stay on-screen — especially
// in landscape, where the panel's available height is small. Only this
// middle section scrolls; the header and the export footer are fixed.
const BODY_SCROLL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
};

const HEADER_GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  flexShrink: 0,
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  flexShrink: 0,
};

const HELPER_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(188, 210, 228, 0.78)",
  fontSize: "9.5px",
  lineHeight: 1.4,
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

const SLIDE_LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const SLIDE_CARD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "5px",
  borderRadius: "8px",
  border: "1px solid rgba(183, 207, 230, 0.22)",
  background: "rgba(13, 22, 30, 0.6)",
};

const SLIDE_THUMB_STYLE: CSSProperties = {
  width: "52px",
  height: "52px",
  objectFit: "cover",
  borderRadius: "6px",
  border: "1px solid rgba(183, 207, 230, 0.28)",
  background: "rgba(13, 22, 30, 0.72)",
  display: "block",
  flexShrink: 0,
};

const SLIDE_INDEX_STYLE: CSSProperties = {
  color: "rgba(200, 222, 240, 0.7)",
  fontSize: "10px",
  fontWeight: 700,
  width: "14px",
  flexShrink: 0,
};

const SLIDE_ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  marginLeft: "auto",
  flexShrink: 0,
};

const SLIDE_ACTION_BUTTON_STYLE: CSSProperties = {
  width: "22px",
  height: "18px",
  borderRadius: "4px",
  border: "1px solid rgba(212, 228, 244, 0.28)",
  background: "rgba(38, 58, 78, 0.7)",
  color: "#eef7ff",
  fontSize: "9px",
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const SLIDE_REMOVE_BUTTON_STYLE: CSSProperties = {
  ...SLIDE_ACTION_BUTTON_STYLE,
  border: "1px solid rgba(220, 90, 90, 0.4)",
  background: "rgba(70, 22, 22, 0.6)",
  color: "rgba(255, 190, 190, 0.94)",
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
  // Capped so a tall/portrait-shaped slideshow can't push the Save/Share/
  // Discard row out of the sticky footer — it letterboxes instead.
  maxHeight: "26dvh",
  objectFit: "contain",
  borderRadius: "8px",
  background: "#000",
  display: "block",
};

const DURATION_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: "6px",
};

const DURATION_BUTTON_STYLE: CSSProperties = {
  border: "1px solid rgba(212, 228, 244, 0.28)",
  borderRadius: "8px",
  background: "rgba(38, 58, 78, 0.7)",
  color: "#eef7ff",
  fontSize: "10.5px",
  fontWeight: 650,
  padding: "5px 0",
  cursor: "pointer",
  flex: "1 1 0",
};

const DURATION_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...DURATION_BUTTON_STYLE,
  border: "1px solid rgba(100, 200, 140, 0.5)",
  background: "rgba(20, 70, 45, 0.78)",
  color: "rgba(190, 255, 210, 0.96)",
};

export default function CoachingClipPanel({
  clip,
  onClose,
  onAddSlide,
  getSurface,
  getTextAnnotations,
  panelRef,
}: CoachingClipPanelProps) {
  const handleSaveAsSlide = () => {
    const surface = getSurface();
    if (!surface) return;
    void clip.captureSlide(surface, getTextAnnotations());
  };

  const slideCountLabel = `${clip.slides.length} / ${MAX_COACHING_SLIDES}`;
  const isRendering = clip.exportPhase === "rendering";
  const atSlideLimit = clip.slides.length >= MAX_COACHING_SLIDES;

  return (
    <div ref={panelRef} style={PANEL_STYLE} role="dialog" aria-modal="false" aria-label="Coaching Slideshow">
      <div style={HEADER_GROUP_STYLE}>
        <div style={HEADER_STYLE}>
          <p style={TITLE_STYLE}>🎬 Coaching Slideshow</p>
          <button type="button" className="control-button" style={CLOSE_BUTTON_STYLE} onClick={onClose}>
            Close
          </button>
        </div>
        <p style={HELPER_TEXT_STYLE}>Add a picture, mark it up, then save it as a slide.</p>
      </div>

      <div style={BODY_SCROLL_STYLE}>
        <p style={SECTION_LABEL_STYLE}>Slides · {slideCountLabel}</p>
        <div style={ROW_STYLE}>
          <button
            type="button"
            className="control-button"
            style={atSlideLimit ? DISABLED_BUTTON_STYLE : BUTTON_STYLE}
            onClick={onAddSlide}
            disabled={atSlideLimit}
          >
            + Add Picture Slide
          </button>
          <button
            type="button"
            className="control-button"
            style={clip.isCapturing || atSlideLimit ? DISABLED_BUTTON_STYLE : PRIMARY_BUTTON_STYLE}
            onClick={handleSaveAsSlide}
            disabled={clip.isCapturing || atSlideLimit}
          >
            {clip.isCapturing ? "Saving…" : "💾 Save Current Slide"}
          </button>
          <button
            type="button"
            className="control-button"
            style={clip.slides.length <= 0 ? DISABLED_BUTTON_STYLE : BUTTON_STYLE}
            onClick={clip.clearSlides}
            disabled={clip.slides.length <= 0}
          >
            Clear Slideshow
          </button>
        </div>
        {clip.captureError ? <p style={ERROR_TEXT_STYLE}>{clip.captureError}</p> : null}
        {clip.slides.length > 0 ? (
          <div style={SLIDE_LIST_STYLE}>
            {clip.slides.map((slide, index) => (
              <div key={slide.id} style={SLIDE_CARD_STYLE}>
                <span style={SLIDE_INDEX_STYLE}>{index + 1}</span>
                <img src={slide.url} alt={`Slide ${index + 1}`} style={SLIDE_THUMB_STYLE} />
                <div style={SLIDE_ACTIONS_STYLE}>
                  <button
                    type="button"
                    aria-label={`Move slide ${index + 1} up`}
                    style={index === 0 ? { ...SLIDE_ACTION_BUTTON_STYLE, opacity: 0.35 } : SLIDE_ACTION_BUTTON_STYLE}
                    disabled={index === 0}
                    onClick={() => clip.moveSlideUp(slide.id)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move slide ${index + 1} down`}
                    style={
                      index === clip.slides.length - 1
                        ? { ...SLIDE_ACTION_BUTTON_STYLE, opacity: 0.35 }
                        : SLIDE_ACTION_BUTTON_STYLE
                    }
                    disabled={index === clip.slides.length - 1}
                    onClick={() => clip.moveSlideDown(slide.id)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove slide ${index + 1}`}
                    style={SLIDE_REMOVE_BUTTON_STYLE}
                    onClick={() => clip.removeSlide(slide.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={EMPTY_TEXT_STYLE}>
            No slides yet. Tap Add Picture Slide to upload/position an image, annotate it with Tactical Slate tools,
            then Save Current Slide.
          </p>
        )}
      </div>

      <div style={FOOTER_STYLE}>
        <div style={DIVIDER_STYLE} />
        <p style={SECTION_LABEL_STYLE}>Export</p>
        {clip.exportPhase === "idle" || clip.exportPhase === "error" ? (
          <>
            <p style={SECTION_LABEL_STYLE}>Slide advance</p>
            <div style={DURATION_ROW_STYLE}>
              {SLIDE_ADVANCE_MODES.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  className="control-button"
                  style={clip.slideAdvanceMode === mode ? DURATION_BUTTON_ACTIVE_STYLE : DURATION_BUTTON_STYLE}
                  onClick={() => clip.setSlideAdvanceMode(mode)}
                  aria-pressed={clip.slideAdvanceMode === mode}
                >
                  {label}
                </button>
              ))}
            </div>
            {clip.slideAdvanceMode === "auto" ? (
              <>
                <p style={SECTION_LABEL_STYLE}>Slide length</p>
                <div style={DURATION_ROW_STYLE}>
                  {SLIDE_DURATION_OPTIONS_SECONDS.map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      className="control-button"
                      style={
                        clip.slideDurationSeconds === seconds ? DURATION_BUTTON_ACTIVE_STYLE : DURATION_BUTTON_STYLE
                      }
                      onClick={() => clip.setSlideDurationSeconds(seconds)}
                      aria-pressed={clip.slideDurationSeconds === seconds}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={HELPER_TEXT_STYLE}>
                Holds each slide for 10s with a "tap to pause / swipe to skip" cue baked into the video.
              </p>
            )}
            <button
              type="button"
              className="control-button"
              style={clip.slides.length <= 0 ? DISABLED_BUTTON_STYLE : PRIMARY_BUTTON_STYLE}
              onClick={() => void clip.generateClip()}
              disabled={clip.slides.length <= 0}
            >
              Generate Slideshow
            </button>
            {clip.exportError ? <p style={ERROR_TEXT_STYLE}>{clip.exportError}</p> : null}
          </>
        ) : null}
        {isRendering ? (
          <>
            <p style={EMPTY_TEXT_STYLE}>Rendering slideshow…</p>
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
    </div>
  );
}
