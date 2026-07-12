import type { CSSProperties } from "react";

// Shown in place of the tagging grid at HALF_TIME and FULL_TIME — tagging is
// locked in both, so the same panel serves both checkpoints, distinguished
// only by which primary action and heading it offers. The pitch and
// scoreboard above this panel stay visible throughout (never covered).
//
// "Review" opens the full shared Review screen (RapidReviewScreen) — Event
// Map, filters, marker inspect/edit/delete, and report exports — rather than
// a lightweight inline list, so the coach gets the same review experience
// reachable from the Match Hub or Saved Matches.
export function RapidHalfBreakPanel({
  matchState,
  forLabel,
  oppLabel,
  scoreLine,
  onStartSecondHalf,
  onDone,
  onOpenReview,
  onOpenActions,
}: {
  matchState: "HALF_TIME" | "FULL_TIME";
  forLabel: string;
  oppLabel: string;
  scoreLine: string;
  onStartSecondHalf?: () => void;
  onDone?: () => void;
  onOpenReview: () => void;
  onOpenActions: () => void;
}) {
  return (
    <div style={S.panel}>
      <span style={S.heading}>{matchState === "HALF_TIME" ? "Half Time" : "Full Time"}</span>
      <span style={S.score}>
        {forLabel} {scoreLine} {oppLabel}
      </span>

      <div style={S.actionsRow}>
        {onStartSecondHalf && (
          <button onClick={onStartSecondHalf} style={S.primaryBtn}>
            Start Second Half
          </button>
        )}
        {onDone && (
          <button onClick={onDone} style={S.primaryBtn}>
            Done
          </button>
        )}
        <button onClick={onOpenReview} style={S.secondaryBtn}>
          Review
        </button>
        <button onClick={onOpenActions} style={S.secondaryBtn}>
          Actions
        </button>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    // Extra right padding keeps every action clear of the fixed Match Hub
    // FAB (52px circle, 14px inset) that floats over this same corner.
    padding: "18px 84px 18px 16px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
  },
  heading: {
    fontSize: 17,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
  },
  score: {
    fontSize: 13,
    color: "#8b949e",
    fontVariantNumeric: "tabular-nums",
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    justifyContent: "center",
  },
  primaryBtn: {
    flex: "1 1 auto",
    minWidth: 140,
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: "14px 10px",
    cursor: "pointer",
    outline: "none",
  },
  secondaryBtn: {
    flex: "1 1 auto",
    minWidth: 100,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    padding: "14px 10px",
    cursor: "pointer",
    outline: "none",
  },
};
