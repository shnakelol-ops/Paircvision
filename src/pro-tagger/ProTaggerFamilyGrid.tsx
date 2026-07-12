import { useState } from "react";
import type { CSSProperties } from "react";
import {
  getFamiliesForSport,
  getTileLabel,
  getFamilyLabel,
  getRestartOwnerLabel,
  tileNeedsOppositionAttribution,
} from "./pro-tagger-families";
import type { ProTaggerFamilyId } from "./pro-tagger-families";
import type { ProTaggerSport } from "./pro-tagger-session";
import { getShortTeamName, resolveTeamDisplayName } from "./pro-tagger-team-labels";

interface Props {
  sport: ProTaggerSport;
  homeTeamName: string;
  awayTeamName: string;
  onTileTap: (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP", restartOwner?: "FOR" | "OPP") => void;
}

// Families where the two rows can otherwise be misread as generic "us/them"
// tiles rather than "which team actually won the ball" — these get an
// explicit team-name heading above each row. Every other family keeps its
// existing colour + minus-sign distinction unchanged.
const TEAM_HEADING_FAMILY_IDS = new Set<ProTaggerFamilyId>(["TURNOVER", "RESTART"]);

export function ProTaggerFamilyGrid({ sport, homeTeamName, awayTeamName, onTileTap }: Props) {
  const families = getFamiliesForSport(sport);
  const [restartOwner, setRestartOwner] = useState<"FOR" | "OPP">("FOR");

  const homeLabel = resolveTeamDisplayName(homeTeamName, "Home");
  const awayLabel = resolveTeamDisplayName(awayTeamName, "Away");
  const homeShortLabel = getShortTeamName(homeTeamName, "Home");

  return (
    <div style={S.scroll}>
      {families.map((family) => {
        const familyLabel = getFamilyLabel(family, sport);
        const isRestart = family.id === "RESTART";
        const isTurnover = family.id === "TURNOVER";
        const showTeamHeadings = TEAM_HEADING_FAMILY_IDS.has(family.id);
        const ownerSuffix = isRestart ? ` ${getRestartOwnerLabel(sport, restartOwner)}` : "";
        const forHeading = `${homeLabel} WON${ownerSuffix}`;
        const oppHeading = `${awayLabel} WON${ownerSuffix}`;

        return (
          <div key={family.id} style={S.card}>
            {/* Family header */}
            <div style={S.cardHeader}>
              <span style={{ ...S.dot, background: family.colour }} />
              <span style={S.familyLabel}>{familyLabel}</span>

              {/* Restart ownership toggle — RESTART family only */}
              {isRestart && (
                <div style={S.ownerToggle}>
                  <button
                    style={{ ...S.ownerBtn, ...(restartOwner === "FOR" ? S.ownerBtnActive : {}) }}
                    onClick={() => setRestartOwner("FOR")}
                  >
                    {getRestartOwnerLabel(sport, "FOR")}
                  </button>
                  <button
                    style={{ ...S.ownerBtn, ...(restartOwner === "OPP" ? S.ownerBtnActive : {}) }}
                    onClick={() => setRestartOwner("OPP")}
                  >
                    {getRestartOwnerLabel(sport, "OPP")}
                  </button>
                </div>
              )}
            </div>

            {/* FOR row heading — Turnover / Restart only */}
            {showTeamHeadings && <span style={S.rowHeading}>{forHeading}</span>}

            {/* FOR tile row */}
            <div style={S.tileRow}>
              {family.tiles.map((tile) => {
                const label = getTileLabel(tile, sport);
                return (
                  <button
                    key={label}
                    style={{ ...S.tile, background: family.colour, color: family.textColour }}
                    onClick={() => onTileTap(family.id, label, "FOR", isRestart ? restartOwner : undefined)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* OPP minus row */}
            {family.hasMinus && (
              <>
                {showTeamHeadings && (
                  <span style={{ ...S.rowHeading, ...S.rowHeadingOpp }}>{oppHeading}</span>
                )}
                <div style={S.tileRow}>
                  {family.tiles.map((tile) => {
                    const label = getTileLabel(tile, sport);
                    // Display-only: name the team whose mistake this was on the
                    // opposition row. The tap always sends the original `label` —
                    // the stored tile value/tag is never affected.
                    const displayLabel =
                      isTurnover && tileNeedsOppositionAttribution(family.id, label, sport)
                        ? `${homeShortLabel} ${label}`
                        : label;
                    return (
                      <button
                        key={label}
                        style={S.minusTile}
                        onClick={() => onTileTap(family.id, label, "OPP", isRestart ? restartOwner : undefined)}
                        aria-label={`Opposition ${familyLabel} ${label}`}
                      >
                        <span style={S.minusSign}>−</span>
                        {displayLabel}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "4px 10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  card: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 8,
    padding: "4px 8px 5px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  familyLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#8b949e",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  },
  ownerToggle: {
    display: "flex",
    gap: 3,
    marginLeft: "auto",
  },
  ownerBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 4,
    color: "#6e7681",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "2px 6px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    whiteSpace: "nowrap" as const,
  },
  ownerBtnActive: {
    borderColor: "#9333ea",
    color: "#c084fc",
    background: "rgba(147,51,234,0.12)",
  },
  // Team-winner row headings (Turnover / Restart only) — supplements the
  // colour + minus-sign distinction, doesn't replace it.
  rowHeading: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "#c9d1d9",
    lineHeight: "1.25",
    wordBreak: "break-word" as const,
    overflowWrap: "break-word" as const,
    margin: "1px 0 0",
  },
  rowHeadingOpp: {
    color: "#f87171",
  },
  tileRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
  },
  tile: {
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    padding: "7px 10px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    WebkitTapHighlightColor: "transparent",
    lineHeight: "1.2",
    flexShrink: 0,
  },
  minusTile: {
    background: "#161b22",
    border: "1px solid #f87171",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: "#e6edf3",
    padding: "5px 8px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    WebkitTapHighlightColor: "transparent",
    display: "flex",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  minusSign: {
    color: "#f87171",
    fontWeight: 700,
    fontSize: 13,
    lineHeight: "1",
  },
};
