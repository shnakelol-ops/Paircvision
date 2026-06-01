import { useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { readProTaggerMatches, deleteProTaggerMatch } from "./pro-tagger-storage";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";

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
  onOpen: (match: ProTaggerSavedMatch) => void;
  onBack: () => void;
}

export function ProTaggerSavedMatchesScreen({ onOpen, onBack }: Props) {
  const [matches, setMatches]           = useState<ProTaggerSavedMatch[]>(() => readProTaggerMatches());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    deleteProTaggerMatch(id);
    setMatches(readProTaggerMatches());
    setConfirmDeleteId(null);
  }, []);

  return (
    <div style={S.shell}>
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

            {/* Delete button / confirm */}
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
                <button
                  style={S.deleteBtn}
                  onClick={() => setConfirmDeleteId(m.id)}
                  aria-label="Delete match"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
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
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px 10px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 7,
    color: "#8b949e",
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
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 12,
    color: "#8b949e",
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
    color: "#e6edf3",
  },
  emptyHint: {
    fontSize: 12,
    color: "#6e7681",
    lineHeight: "1.5",
  },
  card: {
    background: "#161b22",
    border: "1px solid #21262d",
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
    color: "#e6edf3",
  },
  vs: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6e7681",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap" as const,
  },
  metaItem: {
    fontSize: 11,
    color: "#8b949e",
  },
  metaDot: {
    fontSize: 11,
    color: "#30363d",
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
    borderLeft: "1px solid #21262d",
    flexShrink: 0,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#6e7681",
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: 6,
    outline: "none",
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
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 600,
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
};
