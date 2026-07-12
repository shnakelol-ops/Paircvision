import type { CSSProperties } from "react";
import type { PauseAction } from "./rapid-match-state";

// Shown in place of the tagging grid whenever the coach pauses the clock
// mid-half — replaces "just resume silently" with an explicit fork: keep
// playing, or formally end the half/match. Never shown for a fresh,
// never-started match (that's a plain ▶ button, handled by the caller).
export function RapidPausePanel({
  action,
  forLabel,
  oppLabel,
  scoreLine,
  onResume,
  onEndFirstHalf,
  onEndMatch,
}: {
  action: PauseAction;
  forLabel: string;
  oppLabel: string;
  scoreLine: string;
  onResume: () => void;
  onEndFirstHalf: () => void;
  onEndMatch: () => void;
}) {
  return (
    <div style={S.panel}>
      <span style={S.heading}>Match Paused</span>
      <span style={S.score}>
        {forLabel} {scoreLine} {oppLabel}
      </span>
      <div style={S.actionsRow}>
        <button onClick={onResume} style={S.resumeBtn}>
          ▶ Resume Match
        </button>
        <button
          onClick={action === "END_FIRST_HALF" ? onEndFirstHalf : onEndMatch}
          style={S.endBtn}
        >
          {action === "END_FIRST_HALF" ? "End First Half" : "End Match"}
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
    // Extra right padding keeps both actions clear of the fixed Match Hub
    // FAB (52px circle, 14px inset) that floats over this same corner.
    padding: "18px 84px 18px 16px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
  },
  heading: {
    fontSize: 15,
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
    gap: 10,
    width: "100%",
  },
  resumeBtn: {
    flex: 1,
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
  endBtn: {
    flex: 1,
    background: "transparent",
    border: "1.5px solid #f85149",
    borderRadius: 10,
    color: "#f85149",
    fontSize: 14,
    fontWeight: 700,
    padding: "14px 10px",
    cursor: "pointer",
    outline: "none",
  },
};
