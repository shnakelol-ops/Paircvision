import { useState } from "react";
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
  onTileTap: (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP", restartOwner?: "FOR" | "OPP") => void;
}

export function ProTaggerFamilyGrid({ sport, onTileTap }: Props) {
  const families = getFamiliesForSport(sport);
  const [restartOwner, setRestartOwner] = useState<"FOR" | "OPP">("FOR");

  return (
    <div style={S.scroll}>
      {families.map((family) => {
        const familyLabel = getFamilyLabel(family, sport);
        const isRestart = family.id === "RESTART";
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
                    OUR K/O
                  </button>
                  <button
                    style={{ ...S.ownerBtn, ...(restartOwner === "OPP" ? S.ownerBtnActive : {}) }}
                    onClick={() => setRestartOwner("OPP")}
                  >
                    THEIR K/O
                  </button>
                </div>
              )}
            </div>

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
              <div style={S.tileRow}>
                {family.tiles.map((tile) => {
                  const label = getTileLabel(tile, sport);
                  return (
                    <button
                      key={label}
                      style={S.minusTile}
                      onClick={() => onTileTap(family.id, label, "OPP", isRestart ? restartOwner : undefined)}
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
