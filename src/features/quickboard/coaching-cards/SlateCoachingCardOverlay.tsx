import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function getIsMobileOrTablet(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export default function SlateCoachingCardOverlay({
  cards,
  active,
  onCardsChange,
}: SlateCoachingCardOverlayProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(getIsMobileOrTablet);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Respond to external keyboard / device changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const handler = (e: MediaQueryListEvent) => setIsMobileOrTablet(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Track software keyboard height via visualViewport so the sheet stays above it
  useEffect(() => {
    if (!editing || !isMobileOrTablet) {
      setKeyboardOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [editing, isMobileOrTablet]);

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
        setEditing({ cardId: card.id, title: card.title, body: card.body, cardType: card.cardType, isNew: false });
      }
    }
  };

  const handleCardPointerCancel = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  // Bottom sheet rendered into document.body so position:fixed is always viewport-relative,
  // regardless of any transform on ancestor board elements.
  const bottomSheet =
    editing !== null && isMobileOrTablet && typeof document !== "undefined"
      ? createPortal(<MobileBottomSheet
          editState={editing}
          keyboardOffset={keyboardOffset}
          onTypeChange={(type) => setEditing((prev) => prev ? { ...prev, cardType: type } : prev)}
          onTitleChange={(title) => setEditing((prev) => prev ? { ...prev, title } : prev)}
          onBodyChange={(body) => setEditing((prev) => prev ? { ...prev, body } : prev)}
          onCommit={() => commitEdit(editing)}
          onDiscard={() => discardEdit(editing)}
          onDelete={() => deleteCard(editing.cardId)}
        />, document.body)
      : null;

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
        const useBottomSheet = isEditing && isMobileOrTablet;

        // Desktop editor: above or below the card depending on vertical position
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
            {/* ── Compact card ──
                Mobile while editing: stays visible with a type-coloured glow ring.
                Pointer events off so a tap falls through to the capture layer (commits edit).
                Desktop while editing: hidden — the floating editor panel takes its place. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                maxWidth: "180px",
                height: `${COMPACT_CARD_H}px`,
                background: isEditing && !useBottomSheet
                  ? "rgba(8, 18, 24, 0.0)"
                  : "rgba(8, 18, 24, 0.78)",
                backdropFilter: isEditing && !useBottomSheet ? "none" : "blur(10px)",
                WebkitBackdropFilter: isEditing && !useBottomSheet ? "none" : "blur(10px)",
                border: useBottomSheet
                  ? `1px solid ${cfg.color}55`
                  : isEditing
                    ? "none"
                    : "1px solid rgba(215,228,224,0.15)",
                borderLeft: useBottomSheet
                  ? `2.5px solid ${cfg.color}`
                  : isEditing
                    ? "none"
                    : `2.5px solid ${cfg.color}`,
                borderRadius: "7px",
                padding: isEditing && !useBottomSheet ? 0 : "4px 8px 4px 6px",
                boxShadow: useBottomSheet
                  ? `0 0 0 2px ${cfg.color}99, 0 0 14px ${cfg.color}44, 0 2px 10px rgba(0,0,0,0.45)`
                  : isEditing
                    ? "none"
                    : "0 2px 10px rgba(0,0,0,0.45)",
                cursor: active ? (isDragging ? "grabbing" : "grab") : "default",
                whiteSpace: "nowrap",
                overflow: "hidden",
                // Desktop: hide compact card when floating editor is open (editor is its visual replacement).
                // Mobile: always visible — bottom sheet is separate from pitch.
                visibility: isEditing && !useBottomSheet ? "hidden" : "visible",
                // Mobile while editing: pass pointer events through to the capture layer so a
                // tap on the card commits the edit (same behaviour as tapping the empty pitch).
                pointerEvents: useBottomSheet ? "none" : undefined,
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

            {/* ── Desktop floating editor ── only on non-touch devices */}
            {isEditing && !isMobileOrTablet && editState && (
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
                          border: isActive ? `1.5px solid ${c.color}` : "1px solid rgba(255,255,255,0.12)",
                          background: isActive ? `${c.color}22` : "rgba(255,255,255,0.04)",
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
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, title: e.target.value } : prev)}
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
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, body: e.target.value } : prev)}
                  onKeyDown={(e) => { if (e.key === "Escape") discardEdit(editing!); }}
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
                    onPointerDown={(e) => { e.preventDefault(); deleteCard(editState.cardId); }}
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
                    onPointerDown={(e) => { e.preventDefault(); discardEdit(editing!); }}
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
                    onPointerDown={(e) => { e.preventDefault(); commitEdit(editing!); }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Mobile/tablet bottom sheet — portalled to document.body */}
      {bottomSheet}
    </div>
  );
}

// ── Mobile / tablet bottom sheet ──────────────────────────────────────────────

interface MobileBottomSheetProps {
  editState: EditState;
  keyboardOffset: number;
  onTypeChange: (type: CoachingCardType) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onCommit: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}

function MobileBottomSheet({
  editState,
  keyboardOffset,
  onTypeChange,
  onTitleChange,
  onBodyChange,
  onCommit,
  onDiscard,
  onDelete,
}: MobileBottomSheetProps) {
  const activeCfg = CARD_TYPE_CONFIG[editState.cardType];

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: `${keyboardOffset}px`,
        zIndex: 9999,
        background: "rgba(8, 18, 24, 0.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 40px rgba(0,0,0,0.65), 0 -1px 0 rgba(255,255,255,0.07)",
        // Padding under content accounts for the iOS home indicator
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "2px",
            background: "rgba(255,255,255,0.18)",
          }}
        />
      </div>

      <div style={{ padding: "4px 16px 4px" }}>
        {/* Type selector */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
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
                  height: "40px",
                  borderRadius: "8px",
                  border: isActive ? `1.5px solid ${c.color}` : "1px solid rgba(255,255,255,0.11)",
                  background: isActive ? `${c.color}22` : "rgba(255,255,255,0.04)",
                  fontSize: "17px",
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 0,
                  touchAction: "manipulation",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTypeChange(type);
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
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDiscard();
            else if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(215,228,224,0.2)",
            borderRadius: "8px",
            color: "#e8f2fd",
            fontSize: "16px",
            fontWeight: 600,
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "10px 12px",
            outline: "none",
            marginBottom: "8px",
            caretColor: "#7dd3fc",
            // Prevents iOS Safari from zooming on focus (font-size >= 16px avoids it)
          }}
        />

        {/* Body */}
        <textarea
          placeholder="Notes…"
          maxLength={300}
          rows={3}
          value={editState.body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onDiscard(); }}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(215,228,224,0.2)",
            borderRadius: "8px",
            color: "#c8dae8",
            fontSize: "15px",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "10px 12px",
            outline: "none",
            resize: "none",
            lineHeight: 1.5,
            marginBottom: "12px",
            caretColor: "#7dd3fc",
          }}
        />

        {/* Footer actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            aria-label="Delete card"
            style={{
              height: "44px",
              padding: "0 16px",
              borderRadius: "10px",
              border: "1px solid rgba(220,38,38,0.4)",
              background: "rgba(90,10,10,0.65)",
              color: "#fca5a5",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "Inter, system-ui, sans-serif",
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            onPointerDown={(e) => { e.preventDefault(); onDelete(); }}
          >
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Cancel"
            style={{
              height: "44px",
              padding: "0 16px",
              borderRadius: "10px",
              border: "1px solid rgba(200,220,230,0.18)",
              background: "rgba(255,255,255,0.07)",
              color: "#94a3b8",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "Inter, system-ui, sans-serif",
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            onPointerDown={(e) => { e.preventDefault(); onDiscard(); }}
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label="Save card"
            style={{
              height: "44px",
              padding: "0 20px",
              borderRadius: "10px",
              border: `1px solid ${activeCfg.color}66`,
              background: `${activeCfg.color}22`,
              color: activeCfg.color,
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Inter, system-ui, sans-serif",
              flexShrink: 0,
              touchAction: "manipulation",
            }}
            onPointerDown={(e) => { e.preventDefault(); onCommit(); }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
