import { useRef, useState } from "react";
import {
  type SlateCoachingCard,
  type CoachingCardType,
  CARD_TYPE_CONFIG,
  COACHING_CARD_TYPES,
  createCoachingCard,
} from "./slateCoachingCard";

interface SlateCoachingCardOverlayProps {
  cards: SlateCoachingCard[];
  active: boolean;
  onCardsChange: (updated: SlateCoachingCard[]) => void;
}

type EditState = {
  cardId: string;
  title: string;
  body: string;
  cardType: CoachingCardType;
  isNew: boolean;
};

type DragState = {
  cardId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCardX: number;
  startCardY: number;
  containerW: number;
  containerH: number;
  moved: boolean;
};

const DRAG_THRESHOLD_PX = 5;
const COMPACT_CARD_H = 32;

export default function SlateCoachingCardOverlay({
  cards,
  active,
  onCardsChange,
}: SlateCoachingCardOverlayProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const commitEdit = (state: EditState) => {
    const trimTitle = state.title.trim();
    if (!trimTitle) {
      onCardsChange(cards.filter((c) => c.id !== state.cardId));
    } else {
      onCardsChange(
        cards.map((c) =>
          c.id === state.cardId
            ? { ...c, title: trimTitle, body: state.body.trim(), cardType: state.cardType, updatedAt: Date.now() }
            : c,
        ),
      );
    }
    setEditing(null);
  };

  const discardEdit = (state: EditState) => {
    if (state.isNew) {
      onCardsChange(cards.filter((c) => c.id !== state.cardId));
    }
    setEditing(null);
  };

  const deleteCard = (cardId: string) => {
    onCardsChange(cards.filter((c) => c.id !== cardId));
    setEditing(null);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    if (event.target !== event.currentTarget) return;
    if (editing !== null) {
      commitEdit(editing);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
    const newCard = createCoachingCard(x, y);
    onCardsChange([...cards, newCard]);
    setEditing({ cardId: newCard.id, title: "", body: "", cardType: "note", isNew: true });
  };

  const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>, cardId: string) => {
    if (!active) return;
    event.stopPropagation();
    if (editing !== null && editing.cardId !== cardId) {
      commitEdit(editing);
    }
    if (editing?.cardId === cardId) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragRef.current = {
      cardId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCardX: card.x,
      startCardY: card.y,
      containerW: rect.width,
      containerH: rect.height,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDraggingId(cardId);
  };

  const handleCardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const newX = Math.max(2, Math.min(98, drag.startCardX + (dx / drag.containerW) * 100));
    const newY = Math.max(2, Math.min(98, drag.startCardY + (dy / drag.containerH) * 100));
    onCardsChange(cards.map((c) => (c.id === drag.cardId ? { ...c, x: newX, y: newY } : c)));
  };

  const handleCardPointerUp = (event: React.PointerEvent<HTMLDivElement>, cardId: string) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDrag = drag.moved;
    dragRef.current = null;
    setDraggingId(null);
    if (!wasDrag) {
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        setEditing({
          cardId: card.id,
          title: card.title,
          body: card.body,
          cardType: card.cardType,
          isNew: false,
        });
      }
    }
  };

  const handleCardPointerCancel = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  return (
    <div
      ref={containerRef}
      data-slate-card-overlay="true"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "12px",
        overflow: "visible",
        zIndex: 11,
        pointerEvents: "none",
      }}
    >
      {/* Capture layer — intercepts taps on empty pitch when card tool active */}
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
        />
      )}

      {cards.map((card) => {
        const cfg = CARD_TYPE_CONFIG[card.cardType];
        const isEditing = editing?.cardId === card.id;
        const isDragging = draggingId === card.id;
        const editState = isEditing ? editing! : null;

        // Editor opens above or below depending on card's vertical position
        const openUpward = card.y > 58;

        return (
          <div
            key={card.id}
            style={{
              position: "absolute",
              left: `${card.x}%`,
              top: `${card.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: isEditing ? 20 : isDragging ? 5 : 2,
              pointerEvents: active ? "auto" : "none",
              userSelect: "none",
              touchAction: "none",
            }}
          >
            {/* ── Compact card ── always rendered for drag handle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                maxWidth: "180px",
                height: `${COMPACT_CARD_H}px`,
                background: isEditing
                  ? "rgba(8, 18, 24, 0.0)"
                  : "rgba(8, 18, 24, 0.78)",
                backdropFilter: isEditing ? "none" : "blur(10px)",
                WebkitBackdropFilter: isEditing ? "none" : "blur(10px)",
                border: isEditing
                  ? "none"
                  : "1px solid rgba(215,228,224,0.15)",
                borderLeft: isEditing ? "none" : `2.5px solid ${cfg.color}`,
                borderRadius: "7px",
                padding: isEditing ? 0 : "4px 8px 4px 6px",
                boxShadow: isEditing ? "none" : "0 2px 10px rgba(0,0,0,0.45)",
                cursor: active ? (isDragging ? "grabbing" : "grab") : "default",
                whiteSpace: "nowrap",
                overflow: "hidden",
                visibility: isEditing ? "hidden" : "visible",
              }}
              onPointerDown={(e) => handleCardPointerDown(e, card.id)}
              onPointerMove={handleCardPointerMove}
              onPointerUp={(e) => handleCardPointerUp(e, card.id)}
              onPointerCancel={handleCardPointerCancel}
            >
              <span style={{ fontSize: "12px", lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#d8eaf6",
                  fontFamily: "Inter, system-ui, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {card.title || (
                  <span style={{ opacity: 0.45, fontStyle: "italic" }}>Untitled</span>
                )}
              </span>
            </div>

            {/* ── Editor panel ── absolutely positioned above/below the compact card */}
            {isEditing && editState && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  ...(openUpward
                    ? { bottom: `${COMPACT_CARD_H / 2 + 6}px` }
                    : { top: `${COMPACT_CARD_H / 2 + 6}px` }),
                  transform: "translateX(-50%)",
                  width: "220px",
                  background: "rgba(8, 18, 24, 0.94)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  border: "1px solid rgba(215,228,224,0.18)",
                  borderRadius: "12px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
                  padding: "10px",
                  pointerEvents: "auto",
                  touchAction: "auto",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Type selector */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                  {COACHING_CARD_TYPES.map((type) => {
                    const c = CARD_TYPE_CONFIG[type];
                    const isActive = editState.cardType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-label={c.label}
                        title={c.label}
                        style={{
                          flex: 1,
                          height: "30px",
                          borderRadius: "6px",
                          border: isActive
                            ? `1.5px solid ${c.color}`
                            : "1px solid rgba(255,255,255,0.12)",
                          background: isActive
                            ? `${c.color}22`
                            : "rgba(255,255,255,0.04)",
                          fontSize: "13px",
                          lineHeight: 1,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setEditing((prev) => prev ? { ...prev, cardType: type } : prev);
                        }}
                      >
                        {c.icon}
                      </button>
                    );
                  })}
                </div>

                {/* Title */}
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={editState.isNew}
                  type="text"
                  placeholder="Title…"
                  maxLength={60}
                  value={editState.title}
                  onChange={(e) =>
                    setEditing((prev) => prev ? { ...prev, title: e.target.value } : prev)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") discardEdit(editing!);
                    else if (e.key === "Enter") commitEdit(editing!);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(215,228,224,0.18)",
                    borderRadius: "6px",
                    color: "#e8f2fd",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "Inter, system-ui, sans-serif",
                    padding: "6px 8px",
                    outline: "none",
                    marginBottom: "6px",
                    caretColor: "#7dd3fc",
                  }}
                />

                {/* Body */}
                <textarea
                  placeholder="Notes…"
                  maxLength={300}
                  rows={3}
                  value={editState.body}
                  onChange={(e) =>
                    setEditing((prev) => prev ? { ...prev, body: e.target.value } : prev)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") discardEdit(editing!);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(215,228,224,0.18)",
                    borderRadius: "6px",
                    color: "#c8dae8",
                    fontSize: "12px",
                    fontFamily: "Inter, system-ui, sans-serif",
                    padding: "6px 8px",
                    outline: "none",
                    resize: "none",
                    lineHeight: 1.4,
                    marginBottom: "8px",
                    caretColor: "#7dd3fc",
                  }}
                />

                {/* Footer */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    aria-label="Delete card"
                    style={{
                      height: "28px",
                      padding: "0 10px",
                      borderRadius: "6px",
                      border: "1px solid rgba(220,38,38,0.4)",
                      background: "rgba(90,10,10,0.6)",
                      color: "#fca5a5",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "Inter, system-ui, sans-serif",
                      flexShrink: 0,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      deleteCard(editState.cardId);
                    }}
                  >
                    Delete
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    aria-label="Cancel"
                    style={{
                      height: "28px",
                      padding: "0 10px",
                      borderRadius: "6px",
                      border: "1px solid rgba(200,220,230,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#94a3b8",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "Inter, system-ui, sans-serif",
                      flexShrink: 0,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      discardEdit(editing!);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    aria-label="Save card"
                    style={{
                      height: "28px",
                      padding: "0 12px",
                      borderRadius: "6px",
                      border: `1px solid ${cfg.color}66`,
                      background: `${cfg.color}22`,
                      color: cfg.color,
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "Inter, system-ui, sans-serif",
                      flexShrink: 0,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      commitEdit(editing!);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
