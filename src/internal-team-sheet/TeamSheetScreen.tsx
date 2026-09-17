import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ProTaggerLineupPitchBackground,
  LINEUP_PITCH_PORTRAIT_VIEWBOX,
} from "../pro-tagger/ProTaggerLineupPitchBackground";
import { LINEUP_FORMATION_POSITIONS } from "../pro-tagger/pro-tagger-lineup-geometry";
import { TeamSheetJerseyTile } from "./TeamSheetJerseyTile";
import { TeamSheetSubTile } from "./TeamSheetSubTile";
import { buildSubstitute, loadTeamSheet, saveTeamSheet } from "./team-sheet-storage";
import type { TeamSheetPlayer } from "./team-sheet-types";
import { captureTeamSheetBlob } from "./team-sheet-export";
import { ShareSheet } from "../features/shared/ShareSheet";
import type { ShareImageInput } from "../features/shared/imageShare";

// Ballylanders internal Team Sheet — personal tool, not a public PáircVision
// feature. Reuses only the pure, stateless pitch/formation primitives from
// Event Stats' Squad Builder (ProTaggerLineupPitchBackground.tsx,
// LINEUP_FORMATION_POSITIONS) — both take no session/match state, so this
// screen has zero coupling to ProTaggerSession or Event Stats state. It
// defines its own local player type and its own localStorage key rather
// than reusing any pro-tagger squad/session module.

const JERSEY_SIZE = 46;

function navigateToInternal() {
  if (typeof window !== "undefined") window.location.assign("/internal");
}

export default function TeamSheetScreen() {
  const initial = useState(() => loadTeamSheet())[0];
  const [players, setPlayers] = useState<TeamSheetPlayer[]>(initial.players);
  const [substitutes, setSubstitutes] = useState<TeamSheetPlayer[]>(initial.substitutes);
  const [screenshotMode, setScreenshotMode] = useState(false);

  useEffect(() => {
    saveTeamSheet({ players, substitutes });
  }, [players, substitutes]);

  const setName = useCallback((slotIndex: number, name: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], name };
      return next;
    });
  }, []);

  const addSubstitute = useCallback(() => {
    setSubstitutes((prev) => {
      const nextNumber = prev.length === 0 ? 16 : Math.max(...prev.map((s) => s.number)) + 1;
      return [...prev, buildSubstitute(nextNumber)];
    });
  }, []);

  const setSubNumber = useCallback((id: string, number: number) => {
    setSubstitutes((prev) => prev.map((s) => (s.id === id ? { ...s, number } : s)));
  }, []);

  const setSubName = useCallback((id: string, name: string) => {
    setSubstitutes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const removeSubstitute = useCallback((id: string) => {
    setSubstitutes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Screenshot Mode never shows a blank sub with no name typed in yet —
  // only substitutes the coach actually entered appear in the capture.
  const subsForScreenshot = substitutes.filter((s) => s.name.trim());

  // --- Share Team Sheet ---------------------------------------------------
  // `content` (not `shell`) is the capture root — see team-sheet-export.ts's
  // header comment for why. Sharing must never leave the user permanently
  // stuck in Screenshot Mode just because they pressed the button: the flow
  // remembers whatever mode they were already in (wasScreenshotModeRef),
  // temporarily forces Screenshot Mode on for the capture if they weren't
  // already in it, and restores their prior mode once the capture settles
  // (success or failure) — before the ShareSheet ever opens, so nothing
  // flashes visibly behind it. `captureToken` exists only to give the effect
  // below a fresh dependency to fire on for every press, including a second
  // press while already in Screenshot Mode (where flipping the boolean
  // wouldn't itself produce a new render to key off).
  const contentRef = useRef<HTMLDivElement>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const wasScreenshotModeRef = useRef(false);
  const [captureToken, setCaptureToken] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const handleShareTeamSheet = useCallback(() => {
    if (isCapturing) return;
    wasScreenshotModeRef.current = screenshotMode;
    if (!screenshotMode) setScreenshotMode(true);
    setShareError(null);
    setIsCapturing(true);
    setCaptureToken((t) => t + 1);
  }, [isCapturing, screenshotMode]);

  useEffect(() => {
    if (captureToken === 0) return;
    let cancelled = false;
    (async () => {
      const root = contentRef.current;
      if (!root) {
        if (!cancelled) setIsCapturing(false);
        return;
      }
      try {
        const blob = await captureTeamSheetBlob(root);
        if (cancelled) return;
        capturedBlobRef.current = blob;
        setShareOpen(true);
      } catch {
        if (cancelled) return;
        setShareError("Couldn't generate the Team Sheet image. Try again.");
      } finally {
        if (!cancelled) {
          if (!wasScreenshotModeRef.current) setScreenshotMode(false);
          setIsCapturing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureToken]);

  const shareInput: ShareImageInput = {
    getBlob: async () => {
      if (!capturedBlobRef.current) throw new Error("No Team Sheet image captured yet");
      return capturedBlobRef.current;
    },
    filename: "ballylanders-team-sheet.png",
    title: "Ballylanders Team Sheet",
  };

  return (
    <div
      style={S.shell}
      onClick={screenshotMode ? () => setScreenshotMode(false) : undefined}
    >
      {!screenshotMode && (
        <div style={S.header}>
          <button type="button" style={S.backBtn} onClick={navigateToInternal}>
            ← Internal
          </button>
          <span style={S.title}>Team Sheet</span>
          <button
            type="button"
            style={S.screenshotBtn}
            onClick={(e) => {
              e.stopPropagation();
              setScreenshotMode(true);
            }}
          >
            Screenshot Mode
          </button>
        </div>
      )}

      <div style={S.content}>
        {!screenshotMode && (
          <div style={S.shareRow} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              style={{ ...S.shareBtn, ...(isCapturing ? S.shareBtnDisabled : {}) }}
              disabled={isCapturing}
              onClick={handleShareTeamSheet}
            >
              {isCapturing ? "Preparing…" : "Share Team Sheet"}
            </button>
            {shareError && <span style={S.shareErrorText}>{shareError}</span>}
          </div>
        )}

        {/* `content` above (flex:1 + justifyContent:center) positions the
            sheet within the viewport — its own box stretches to fill
            leftover space regardless of how tall its children actually are,
            which is correct for centring a short sheet on-screen but would
            bake a lot of empty navy padding into an exported image if
            captured directly. `contentCapture` below is the actual capture
            root (see team-sheet-export.ts / handleShareTeamSheet): a plain
            column with no flex-grow of its own, so its rendered height is
            exactly the sheet's natural content height — short with 0 subs,
            taller with more, never viewport-stretched either way. The Share
            button/error above are deliberately siblings of this div, not
            children, so they can never end up inside a captured image even
            if the screenshotMode guard around them is ever changed. */}
        <div style={S.contentCapture} ref={contentRef}>
          <div style={S.heading}>
            <span style={S.headingClub}>BALLYLANDERS</span>
            <span style={S.headingSub}>Starting XV</span>
          </div>

          <div
            style={{
              ...S.pitchBox,
              aspectRatio: `${LINEUP_PITCH_PORTRAIT_VIEWBOX.w} / ${LINEUP_PITCH_PORTRAIT_VIEWBOX.h}`,
            }}
          >
            <ProTaggerLineupPitchBackground />
            {Object.entries(LINEUP_FORMATION_POSITIONS).map(([slotKey, pos]) => {
              const slot = Number(slotKey);
              const player = players[slot - 1];
              if (!player) return null;
              return (
                <div key={player.id} style={{ ...S.slot, left: `${pos.x}%`, top: `${pos.y}%` }}>
                  <TeamSheetJerseyTile
                    player={player}
                    editable={!screenshotMode}
                    size={JERSEY_SIZE}
                    onNameChange={(name) => setName(slot - 1, name)}
                    showNumberOverlay={false}
                  />
                </div>
              );
            })}
          </div>

          {screenshotMode ? (
            subsForScreenshot.length > 0 && (
              <div style={S.subsSection}>
                <span style={S.subsLabel}>Substitutes</span>
                <div style={S.subsRow}>
                  {subsForScreenshot.map((sub) => (
                    <TeamSheetSubTile key={sub.id} player={sub} editable={false} />
                  ))}
                </div>
              </div>
            )
          ) : substitutes.length === 0 ? (
            <button type="button" style={S.addSubsBtn} onClick={(e) => { e.stopPropagation(); addSubstitute(); }}>
              + Add Subs
            </button>
          ) : (
            <div style={S.subsSection} onClick={(e) => e.stopPropagation()}>
              <span style={S.subsLabel}>Substitutes</span>
              <div style={S.subsList}>
                {substitutes.map((sub) => (
                  <TeamSheetSubTile
                    key={sub.id}
                    player={sub}
                    editable
                    onNumberChange={(number) => setSubNumber(sub.id, number)}
                    onNameChange={(name) => setSubName(sub.id, name)}
                    onRemove={() => removeSubstitute(sub.id)}
                  />
                ))}
              </div>
              <button type="button" style={S.addSubBtn} onClick={addSubstitute}>
                + Add Sub
              </button>
            </div>
          )}
        </div>

        {!screenshotMode && (
          <p style={S.hint}>Tap a name to edit it. Screenshot Mode hides every control — tap anywhere to exit it.</p>
        )}
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          capturedBlobRef.current = null;
        }}
        input={shareInput}
        heading="Share Team Sheet"
      />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100dvh",
    width: "100%",
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none" as const,
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px 8px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "-0.3px",
    flex: 1,
    textAlign: "center" as const,
  },
  screenshotBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 12px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  shareRow: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  shareBtn: {
    background: "#1d4ed8",
    border: "1px solid #3b82f6",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 20px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    maxWidth: 380,
    boxSizing: "border-box" as const,
  },
  shareBtnDisabled: {
    opacity: 0.6,
    cursor: "default" as const,
  },
  shareErrorText: {
    fontSize: 11,
    color: "#f85149",
    textAlign: "center" as const,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
  },
  // The actual capture root (see the comment above its JSX usage) — a plain
  // column with its own natural height, deliberately with no flex-grow/
  // justifyContent of its own so it never stretches to fill `content`'s
  // viewport-centring box.
  contentCapture: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  heading: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
  },
  headingClub: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: "0.04em",
    color: "#f1f7f0",
  },
  headingSub: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
  },
  pitchBox: {
    position: "relative",
    width: "100%",
    maxWidth: 380,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #17324a",
  },
  slot: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
  },
  hint: {
    margin: 0,
    fontSize: 11,
    color: "#5e7a8a",
    textAlign: "center" as const,
    maxWidth: 300,
  },
  addSubsBtn: {
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 16px",
    cursor: "pointer",
    outline: "none",
  },
  subsSection: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 380,
  },
  subsLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
  },
  subsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  subsList: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
  },
  addSubBtn: {
    marginTop: 6,
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 16px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
  },
};
