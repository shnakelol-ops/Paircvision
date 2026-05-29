import type { CSSProperties } from "react";
import {
  getFamiliesForSport,
  getTileLabel,
  getFamilyLabel,
} from "./pro-tagger-families";
import type { ProTaggerFamilyId } from "./pro-tagger-families";
import type { ProTaggerSport } from "./pro-tagger-session";

interface Props {
  sport: ProTaggerSport;
  onTileTap: (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP") => void;
}

export function ProTaggerFamilyGrid({ sport, onTileTap }: Props) {
  const families = getFamiliesForSport(sport);

  return (
    <div style={S.scroll}>
      {families.map((family) => {
        const familyLabel = getFamilyLabel(family, sport);
        return (
          <div key={family.id} style={S.card}>
            {/* Family header */}
            <div style={S.cardHeader}>
              <span style={{ ...S.dot, background: family.colour }} />
              <span style={S.familyLabel}>{familyLabel}</span>
            </div>

            {/* FOR tile row */}
            <div style={S.tileRow}>
              {family.tiles.map((tile) => {
                const label = getTileLabel(tile, sport);
                return (
                  <button
                    key={label}
                    style={{ ...S.tile, background: family.colour, color: family.textColour }}
                    onClick={() => onTileTap(family.id, label, "FOR")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* OPP minus row */}
            {family.hasMinus && (
              <div style={S.tileRow}>
                {family.tiles.map((tile) => {
                  const label = getTileLabel(tile, sport);
                  return (
                    <button
                      key={label}
                      style={S.minusTile}
                      onClick={() => onTileTap(family.id, label, "OPP")}
                      aria-label={`Opposition ${familyLabel} ${label}`}
                    >
                      <span style={S.minusSign}>−</span>
                      {label}
                    </button>
                  );
                })}
              </div>
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
    padding: "8px 10px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  card: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 8,
    padding: "7px 8px 7px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 1,
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
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: "#6e7681",
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
