import { useState } from "react";
import type { CSSProperties } from "react";
import type { RapidMatchEvent } from "./rapid-capture-events";

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** "TURNOVER_WON" -> "Turnover Won" — display-only, never touches the stored kind. */
function humanizeKind(kind: string): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Shown in place of the tagging grid at HALF_TIME and FULL_TIME — tagging is
// locked in both, so the same panel serves both checkpoints, distinguished
// only by which primary action and heading it offers. The pitch and
// scoreboard above this panel stay visible throughout (never covered).
export function RapidHalfBreakPanel({
  matchState,
  forLabel,
  oppLabel,
  scoreLine,
  events,
  onStartSecondHalf,
  onDone,
  onOpenActions,
}: {
  matchState: "HALF_TIME" | "FULL_TIME";
  forLabel: string;
  oppLabel: string;
  scoreLine: string;
  events: readonly RapidMatchEvent[];
  onStartSecondHalf?: () => void;
  onDone?: () => void;
  onOpenActions: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <div style={S.panel}>
      <span style={S.heading}>{matchState === "HALF_TIME" ? "Half Time" : "Full Time"}</span>
      <span style={S.score}>
        {forLabel} {scoreLine} {oppLabel}
      </span>

      {reviewOpen ? (
        <>
          <div style={S.reviewList}>
            {events.length === 0 ? (
              <span style={S.reviewEmpty}>No events logged yet.</span>
            ) : (
              events.map((e) => (
                <div key={e.id} style={S.reviewRow}>
                  <span style={S.reviewClock}>{fmtClock(e.matchClockSeconds ?? e.timestamp ?? 0)}</span>
                  <span style={S.reviewTeam}>{e.teamSide === "OPP" ? oppLabel : forLabel}</span>
                  <span style={S.reviewKind}>{humanizeKind(e.kind)}</span>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setReviewOpen(false)} style={S.backBtn}>
            ← Back
          </button>
        </>
      ) : (
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
          <button onClick={() => setReviewOpen(true)} style={S.secondaryBtn}>
            Review
          </button>
          <button onClick={onOpenActions} style={S.secondaryBtn}>
            Actions
          </button>
        </div>
      )}
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
  reviewList: {
    width: "100%",
    maxHeight: 160,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  reviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    padding: "4px 8px",
    background: "#0d1117",
    borderRadius: 6,
  },
  reviewClock: {
    fontVariantNumeric: "tabular-nums",
    color: "#8b949e",
    minWidth: 40,
  },
  reviewTeam: {
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 70,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  reviewKind: {
    color: "#8b949e",
    flex: 1,
  },
  reviewEmpty: {
    fontSize: 12,
    color: "#6e7681",
    padding: "8px 0",
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 14px",
    cursor: "pointer",
    outline: "none",
  },
};
