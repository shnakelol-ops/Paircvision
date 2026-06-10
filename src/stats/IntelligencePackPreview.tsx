/**
 * IntelligencePackPreview.tsx
 *
 * Swipeable fullscreen preview for an Intelligence Pack (3 coaching cards).
 * Renders each card as an <img> from an object URL and lets the coach swipe
 * through them before sharing.
 *
 * Design rules:
 *   - position:fixed overlay at zIndex:1000 (above all existing UI)
 *   - Touch swipe (left/right) to navigate between cards
 *   - Page dots for current position
 *   - Two share actions: all 3 cards, or current card only
 *   - Falls back to download links when Web Share API is unavailable
 *   - Entirely additive — no existing files modified
 */

import { useState, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { IntelligencePack } from "./intelligencePack";
import { packToFiles } from "./intelligencePack";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntelligencePackPreviewProps = {
  pack: IntelligencePack;
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: string;
  onClose: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_NAMES = [
  "Match Summary",
  "Possession Outcomes",
  "Match Intelligence",
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function IntelligencePackPreview({
  pack,
  homeTeamName,
  awayTeamName,
  stageLabel,
  onClose,
}: IntelligencePackPreviewProps) {
  const files = useMemo(() => packToFiles(pack), [pack]);
  const totalCards = files.length;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);
  const touchStartXRef = useRef<number | null>(null);

  // Create object URLs once per mount; revoke on unmount.
  useEffect(() => {
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);
    return () => {
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  // files reference is stable (same pack → same useMemo result)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeIdx = Math.min(currentIdx, Math.max(0, totalCards - 1));

  function goNext() {
    setCurrentIdx((i) => Math.min(i + 1, totalCards - 1));
  }

  function goPrev() {
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const delta = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (delta < -50) goNext();
    else if (delta > 50) goPrev();
  }

  async function shareAll() {
    if (!files.length) return;
    const title = `${homeTeamName} v ${awayTeamName} · PáircVision`;
    const canShareFiles =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files });
    if (canShareFiles) {
      try {
        await navigator.share({ title, files });
      } catch {
        // user cancelled — no action needed
      }
    } else {
      for (const f of files) {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }

  async function shareCurrent() {
    const file = files[safeIdx];
    if (!file) return;
    const title = `${homeTeamName} v ${awayTeamName} · PáircVision`;
    const singleFiles = [file];
    const canShareFile =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: singleFiles });
    if (canShareFile) {
      try {
        await navigator.share({ title, files: singleFiles });
      } catch {
        // user cancelled — no action needed
      }
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const currentUrl = urls[safeIdx];
  const currentName = CARD_NAMES[safeIdx] ?? "";

  return (
    <div style={SS.overlay}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={SS.header}>
        <div style={SS.headerInfo}>
          <span style={SS.brand}>PÁIRCVISION</span>
          <span style={SS.dot}>·</span>
          <span style={SS.matchLabel}>
            {homeTeamName || "Home"} v {awayTeamName || "Away"}
          </span>
          <span style={SS.stageBadge}>{stageLabel}</span>
        </div>
        <button style={SS.closeBtn} onClick={onClose} aria-label="Close preview">
          ✕
        </button>
      </div>

      {/* ── Card name ────────────────────────────────────────────────── */}
      <div style={SS.cardLabel}>{currentName}</div>

      {/* ── Image area — swipeable ───────────────────────────────────── */}
      <div
        style={SS.imageArea}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={currentName}
            style={SS.cardImg}
            draggable={false}
          />
        ) : (
          <div style={SS.imgPlaceholder} />
        )}

        {/* Arrow navigation — visible on non-touch devices */}
        {safeIdx > 0 && (
          <button
            style={SS.navLeft}
            onClick={goPrev}
            aria-label="Previous card"
          >
            ‹
          </button>
        )}
        {safeIdx < totalCards - 1 && (
          <button
            style={SS.navRight}
            onClick={goNext}
            aria-label="Next card"
          >
            ›
          </button>
        )}
      </div>

      {/* ── Page dots ────────────────────────────────────────────────── */}
      <div style={SS.dotsRow}>
        {Array.from({ length: totalCards }).map((_, i) => (
          <button
            key={i}
            style={i === safeIdx ? SS.dotFilled : SS.dotEmpty}
            onClick={() => setCurrentIdx(i)}
            aria-label={`Go to card ${i + 1}`}
          />
        ))}
      </div>

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div style={SS.actions}>
        <button style={SS.primaryBtn} onClick={() => void shareAll()}>
          Share Intelligence Pack
        </button>
        <button style={SS.secondaryBtn} onClick={() => void shareCurrent()}>
          Share This Card
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAV_BTN_BASE: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(0, 0, 0, 0.55)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "50%",
  color: "#e6edf3",
  fontSize: 30,
  fontWeight: 300,
  width: 46,
  height: 46,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  outline: "none",
  zIndex: 2,
  lineHeight: 1,
  paddingBottom: 2,
};

const DOT_BASE: CSSProperties = {
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  padding: 0,
  outline: "none",
  flexShrink: 0,
  transition: "all 0.18s",
};

const SS: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.96)",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 10px",
    flexShrink: 0,
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
    gap: 10,
  },
  headerInfo: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
    flexWrap: "wrap" as const,
  },
  brand: {
    fontSize: 12,
    fontWeight: 700,
    color: "#22c55e",
    letterSpacing: "0.1em",
    flexShrink: 0,
  },
  dot: {
    color: "#4b5563",
    fontSize: 12,
    flexShrink: 0,
  },
  matchLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e6edf3",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flexShrink: 1,
    minWidth: 0,
  },
  stageBadge: {
    background: "rgba(34, 197, 94, 0.12)",
    border: "1px solid rgba(34, 197, 94, 0.30)",
    borderRadius: 5,
    color: "#22c55e",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 7px",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.02em",
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    color: "#9ca3af",
    fontSize: 15,
    fontWeight: 500,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    outline: "none",
  },

  // ── Card name ─────────────────────────────────────────────────────────────
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6e7681",
    textAlign: "center" as const,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    padding: "7px 16px 4px",
    flexShrink: 0,
  },

  // ── Image area ────────────────────────────────────────────────────────────
  imageArea: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    padding: "0 44px",
    overflow: "hidden",
  },
  cardImg: {
    maxHeight: "100%",
    maxWidth: "100%",
    objectFit: "contain" as const,
    borderRadius: 6,
    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.85)",
    display: "block",
  },
  imgPlaceholder: {
    width: "55%",
    height: "85%",
    background: "#161b22",
    borderRadius: 6,
    border: "1px solid #21262d",
  },

  // Nav arrows
  navLeft: {
    ...NAV_BTN_BASE,
    left: 4,
  },
  navRight: {
    ...NAV_BTN_BASE,
    right: 4,
  },

  // ── Dots ──────────────────────────────────────────────────────────────────
  dotsRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    padding: "10px 16px 8px",
    flexShrink: 0,
  },
  dotEmpty: {
    ...DOT_BASE,
    width: 7,
    height: 7,
    background: "rgba(255, 255, 255, 0.18)",
  },
  dotFilled: {
    ...DOT_BASE,
    width: 10,
    height: 10,
    background: "#22c55e",
    boxShadow: "0 0 8px rgba(34, 197, 94, 0.55)",
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "6px 16px 28px",
    flexShrink: 0,
  },
  primaryBtn: {
    background: "#22c55e",
    border: "none",
    borderRadius: 12,
    color: "#050d09",
    fontSize: 16,
    fontWeight: 700,
    padding: "15px 16px",
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.2px",
    width: "100%",
  },
  secondaryBtn: {
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: 12,
    color: "#e6edf3",
    fontSize: 15,
    fontWeight: 600,
    padding: "13px 16px",
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.2px",
    width: "100%",
  },
};
