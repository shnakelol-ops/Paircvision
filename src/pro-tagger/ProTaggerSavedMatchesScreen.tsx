import { useState, useCallback } from "react";
import type { CSSProperties } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { readProTaggerMatches, deleteProTaggerMatch } from "./pro-tagger-storage";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import {
  isCoordinateRepairApplied,
  repairProTaggerMatchById,
} from "./pro-tagger-coordinate-repair";

const REPAIR_CONFIRM_MESSAGE =
  "Repair mirrored Event Stats locations?\n\n" +
  "This flips ONLY the touchline (left/right sideline) axis of every event " +
  "in this match back to where it was originally tagged. The length-of-" +
  "pitch position, scores, players, teams, timestamps and halves are not " +
  "changed.\n\n" +
  "A backup of the match is kept before repairing. This action is one-time " +
  "— it cannot be applied twice, and running it again on an already-" +
  "repaired match has no effect.\n\n" +
  "Only apply this to a match you know was tagged with the old, mirrored " +
  "Event Stats pitch view.";

const SPORT_LABEL: Record<string, string> = {
  gaelic:          "Gaelic Football",
  ladies_football: "Ladies Football",
  hurling:         "Hurling",
  camogie:         "Camogie",
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  league:       "League",
  championship: "Championship",
  friendly:     "Friendly",
  training:     "Training",
};

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  onOpen:   (match: ProTaggerSavedMatch) => void;
  onReview: (match: ProTaggerSavedMatch) => void;
  onBack:   () => void;
}

export function ProTaggerSavedMatchesScreen({ onOpen, onReview, onBack }: Props) {
  const [matches, setMatches]           = useState<ProTaggerSavedMatch[]>(() => readProTaggerMatches());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    deleteProTaggerMatch(id);
    setMatches(readProTaggerMatches());
    setConfirmDeleteId(null);
  }, []);

  const handleRepair = useCallback((id: string) => {
    if (!window.confirm(REPAIR_CONFIRM_MESSAGE)) return;
    const result = repairProTaggerMatchById(id);
    if (result.ok) {
      setMatches(readProTaggerMatches());
    } else if (result.reason === "already-repaired") {
      window.alert("This match has already been repaired — it cannot be repaired twice.");
    }
  }, []);

  return (
    <div style={S.shell}>
      <VisionStadiumBackground variant="training" />
      <div style={S.contentWrap}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Back</button>
        <span style={S.title}>Saved Matches</span>
        <span style={S.count}>{matches.length}</span>
      </div>

      {/* List */}
      <div style={S.list}>
        {matches.length === 0 && (
          <div style={S.empty}>
            <span style={S.emptyIcon}>📋</span>
            <span style={S.emptyText}>No saved matches yet.</span>
            <span style={S.emptyHint}>Save a match from the Actions menu during a live session.</span>
          </div>
        )}

        {matches.map((m) => (
          <div key={m.id} style={S.card}>
            {/* Teams + score */}
            <div style={S.cardMain} onClick={() => onOpen(m)}>
              <div style={S.teams}>
                <span style={S.teamName}>{m.homeTeamName}</span>
                <span style={S.vs}>v</span>
                <span style={S.teamName}>{m.awayTeamName}</span>
              </div>
              <div style={S.meta}>
                <span style={S.metaItem}>{SPORT_LABEL[m.sport] ?? m.sport}</span>
                <span style={S.metaDot}>·</span>
                <span style={S.metaItem}>{MATCH_TYPE_LABEL[m.matchType] ?? m.matchType}</span>
                <span style={S.metaDot}>·</span>
                <span style={S.metaItem}>{fmtDate(m.createdAt)}</span>
              </div>
              <div style={S.scoreline}>{m.scorelineSnapshot}</div>
            </div>

            {/* Review + Delete actions */}
            <div style={S.cardActions}>
              {confirmDeleteId === m.id ? (
                <>
                  <button
                    style={S.confirmDeleteBtn}
                    onClick={() => handleDelete(m.id)}
                  >
                    Delete
                  </button>
                  <button
                    style={S.cancelDeleteBtn}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    style={S.reviewBtn}
                    onClick={() => onReview(m)}
                    aria-label="Review match"
                  >
                    Review
                  </button>
                  {isCoordinateRepairApplied(m) ? (
                    <span style={S.repairedBadge} aria-label="Locations already repaired">
                      ✓ Repaired
                    </span>
                  ) : (
                    <button
                      style={S.repairBtn}
                      onClick={() => handleRepair(m.id)}
                      aria-label="Repair mirrored Event Stats locations"
                      title="Repair mirrored Event Stats locations"
                    >
                      Repair locations
                    </button>
                  )}
                  <button
                    style={S.deleteBtn}
                    onClick={() => setConfirmDeleteId(m.id)}
                    aria-label="Delete match"
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    width: "100%",
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    position: "relative",
  },
  contentWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px 10px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 7,
    color: "#7a95ad",
    fontSize: 13,
    fontWeight: 600,
    padding: "5px 10px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 15,
    flex: 1,
    letterSpacing: "-0.3px",
  },
  count: {
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 12,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 8px",
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px 24px",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "48px 24px",
    textAlign: "center" as const,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 600,
    color: "#dce8f4",
  },
  emptyHint: {
    fontSize: 12,
    color: "#5e7a8a",
    lineHeight: "1.5",
  },
  card: {
    background: "#0a2134",
    border: "1px solid #17324a",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    alignItems: "stretch",
  },
  cardMain: {
    flex: 1,
    padding: "12px 14px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  teams: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  teamName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#dce8f4",
  },
  vs: {
    fontSize: 11,
    fontWeight: 600,
    color: "#5e7a8a",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap" as const,
  },
  metaItem: {
    fontSize: 11,
    color: "#7a95ad",
  },
  metaDot: {
    fontSize: 11,
    color: "#1c3a52",
  },
  scoreline: {
    fontSize: 12,
    color: "#58a6ff",
    fontWeight: 600,
    marginTop: 2,
  },
  cardActions: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
    padding: "8px 10px",
    borderLeft: "1px solid #17324a",
    flexShrink: 0,
  },
  reviewBtn: {
    background: "transparent",
    border: "1px solid #1f6feb",
    borderRadius: 6,
    color: "#388bfd",
    fontSize: 11,
    fontWeight: 600,
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#5e7a8a",
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: 6,
    outline: "none",
  },
  repairBtn: {
    background: "transparent",
    border: "1px solid #9e6a03",
    borderRadius: 6,
    color: "#e3b341",
    fontSize: 10,
    fontWeight: 600,
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
  repairedBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: "#3fb950",
    padding: "5px 2px",
    whiteSpace: "nowrap" as const,
  },
  confirmDeleteBtn: {
    background: "#7f1d1d",
    border: "1px solid #991b1b",
    borderRadius: 6,
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
  cancelDeleteBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 11,
    fontWeight: 600,
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
};
