import { useRef, useState } from "react";
import {
  type SlateTextAnnotation,
  type SlateTextFontSize,
  createTextAnnotation,
  FONT_SIZE_PX,
  TEXT_COLOR_CHOICES,
} from "./textAnnotation";

type PlacementDraft = {
  text: string;
  fontSize: SlateTextFontSize;
  color: string;
};

interface TextAnnotationOverlayProps {
  annotations: SlateTextAnnotation[];
  active: boolean;
  onAnnotationsChange: (updated: SlateTextAnnotation[]) => void;
  /** When false, hides font-size and colour controls. Defaults to true. */
  showFormatting?: boolean;
  /**
   * When set, a tap places a pre-composed label (text/fontSize/color already
   * chosen via a modal) instead of opening the inline editor immediately.
   * Callers that omit this prop keep the original tap-to-place-then-edit flow.
   */
  placementDraft?: PlacementDraft | null;
  onPlacementDone?: () => void;
}

type DragState = {
  annotationId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startAnnX: number;
  startAnnY: number;
  containerW: number;
  containerH: number;
  moved: boolean;
};

const DRAG_THRESHOLD_PX = 5;

export default function TextAnnotationOverlay({
  annotations,
  active,
  onAnnotationsChange,
  showFormatting = true,
  placementDraft,
  onPlacementDone,
}: TextAnnotationOverlayProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const updateAnnotation = (id: string, patch: Partial<SlateTextAnnotation>) => {
    onAnnotationsChange(annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const deleteAnnotation = (id: string) => {
    onAnnotationsChange(annotations.filter((a) => a.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    if (event.target !== event.currentTarget) return;
    if (editingId !== null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
    if (placementDraft) {
      const newAnn = {
        ...createTextAnnotation(x, y),
        text: placementDraft.text,
        fontSize: placementDraft.fontSize,
        color: placementDraft.color,
      };
      onAnnotationsChange([...annotations, newAnn]);
      onPlacementDone?.();
      return;
    }
    const newAnn = createTextAnnotation(x, y);
    onAnnotationsChange([...annotations, newAnn]);
    setEditingId(newAnn.id);
  };

  const handleAnnotationPointerDown = (event: React.PointerEvent<HTMLDivElement>, annId: string) => {
    if (!active) return;
    event.stopPropagation();
    const ann = annotations.find((a) => a.id === annId);
    if (!ann) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragRef.current = {
      annotationId: annId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAnnX: ann.x,
      startAnnY: ann.y,
      containerW: rect.width,
      containerH: rect.height,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDraggingId(annId);
  };

  const handleAnnotationPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const newX = Math.max(2, Math.min(98, drag.startAnnX + (dx / drag.containerW) * 100));
    const newY = Math.max(2, Math.min(98, drag.startAnnY + (dy / drag.containerH) * 100));
    updateAnnotation(drag.annotationId, { x: newX, y: newY });
  };

  const handleAnnotationPointerUp = (event: React.PointerEvent<HTMLDivElement>, annId: string) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDrag = drag.moved;
    dragRef.current = null;
    setDraggingId(null);
    if (!wasDrag) {
      setEditingId(annId);
    }
  };

  const handleAnnotationPointerCancel = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  const handleTextBlur = (ann: SlateTextAnnotation) => {
    if (!ann.text.trim()) {
      deleteAnnotation(ann.id);
    } else {
      setEditingId(null);
    }
  };

  return (
    <div
      ref={containerRef}
      data-text-annotation-overlay="true"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "12px",
        overflow: "visible",
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {/* Capture layer — intercepts taps on empty pitch when label tool active */}
      {active && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "12px",
            zIndex: 1,
            cursor: "crosshair",
            pointerEvents: "auto",
          }}
          onPointerDown={handleBackgroundPointerDown}
        >
          {placementDraft && (
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(34,197,94,0.88)",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 12px",
                borderRadius: "20px",
                fontFamily: "Inter, system-ui, sans-serif",
                zIndex: 5,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                letterSpacing: "0.2px",
              }}
            >
              Tap to place label
            </div>
          )}
        </div>
      )}

      {annotations.map((ann) => {
        const isEditing = editingId === ann.id;
        const isDragging = draggingId === ann.id;
        const fontSize = FONT_SIZE_PX[ann.fontSize ?? "md"];

        return (
          <div
            key={ann.id}
            style={{
              position: "absolute",
              left: `${ann.x}%`,
              top: `${ann.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: isDragging ? 4 : 2,
              pointerEvents: active ? "auto" : "none",
              cursor: active ? (isDragging ? "grabbing" : "grab") : "default",
              userSelect: "none",
              touchAction: "none",
            }}
            onPointerDown={(e) => handleAnnotationPointerDown(e, ann.id)}
            onPointerMove={handleAnnotationPointerMove}
            onPointerUp={(e) => handleAnnotationPointerUp(e, ann.id)}
            onPointerCancel={handleAnnotationPointerCancel}
          >
            {isEditing ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  pointerEvents: "auto",
                  touchAction: "auto",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <textarea
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  rows={2}
                  value={ann.text}
                  placeholder="Label…"
                  style={{
                    fontSize: `${fontSize}px`,
                    fontWeight: 700,
                    color: ann.color,
                    background: "rgba(0, 0, 0, 0.62)",
                    border: "1px solid rgba(125, 211, 252, 0.7)",
                    borderRadius: "5px",
                    padding: "3px 7px",
                    outline: "none",
                    resize: "none",
                    minWidth: "80px",
                    maxWidth: "180px",
                    width: "120px",
                    fontFamily: "Inter, system-ui, sans-serif",
                    textAlign: "center",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                    boxSizing: "border-box",
                    caretColor: ann.color,
                    lineHeight: 1.3,
                    display: "block",
                  }}
                  onChange={(e) => updateAnnotation(ann.id, { text: e.target.value })}
                  onBlur={() => handleTextBlur(ann)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.currentTarget.blur();
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
                {/* Inline toolbar */}
                <div
                  style={{
                    display: "flex",
                    gap: "3px",
                    alignItems: "center",
                    background: "rgba(10, 20, 25, 0.92)",
                    border: "1px solid rgba(215, 228, 224, 0.2)",
                    borderRadius: "7px",
                    padding: "3px 4px",
                    pointerEvents: "auto",
                    touchAction: "auto",
                    whiteSpace: "nowrap",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {showFormatting && (["sm", "md", "lg"] as SlateTextFontSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-label={`Font size ${size}`}
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "4px",
                        border: ann.fontSize === size
                          ? "1px solid rgba(125, 211, 252, 0.9)"
                          : "1px solid rgba(150, 170, 180, 0.3)",
                        background: ann.fontSize === size
                          ? "rgba(38, 72, 102, 0.9)"
                          : "rgba(20, 30, 38, 0.7)",
                        color: "#e8f2fd",
                        fontSize: size === "sm" ? "9px" : size === "md" ? "11px" : "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        updateAnnotation(ann.id, { fontSize: size });
                      }}
                    >
                      A
                    </button>
                  ))}
                  {showFormatting && (
                    <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.15)", margin: "0 1px", flexShrink: 0 }} />
                  )}
                  {showFormatting && TEXT_COLOR_CHOICES.map((choice) => (
                    <button
                      key={choice.css}
                      type="button"
                      aria-label={`Text colour ${choice.label}`}
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "999px",
                        border: ann.color === choice.css
                          ? "2px solid rgba(125, 211, 252, 0.9)"
                          : "1px solid rgba(255, 255, 255, 0.22)",
                        background: choice.css,
                        cursor: "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        updateAnnotation(ann.id, { color: choice.css });
                      }}
                    />
                  ))}
                  {showFormatting && (
                    <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.15)", margin: "0 1px", flexShrink: 0 }} />
                  )}
                  <button
                    type="button"
                    aria-label="Delete label"
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "4px",
                      border: "1px solid rgba(220, 38, 38, 0.45)",
                      background: "rgba(100, 14, 14, 0.7)",
                      color: "#fca5a5",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      deleteAnnotation(ann.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  color: ann.color,
                  fontFamily: "Inter, system-ui, sans-serif",
                  textAlign: "center",
                  textShadow: "0 1px 4px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.5)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.3,
                  maxWidth: "180px",
                  wordBreak: "break-word",
                  padding: "2px 4px",
                  borderRadius: "3px",
                  background: "transparent",
                  pointerEvents: "none",
                }}
              >
                {ann.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
