import { useMemo, type CSSProperties } from "react";
import type { VisualProConfig, VisualProSection, VisualProTile } from "./visual-pro-types";

export type { VisualProTile };

type Props = {
  config: VisualProConfig;
  armedTile: VisualProTile | null;
  onTileTap: (tile: VisualProTile) => void;
  canLog: boolean;
};

// ─── Per-tone visual tokens ───────────────────────────────────────────────────
// These match the dark tactical palette already in StatsModeSurface so the
// Visual Pro panel reads as the same product family.

const TILE_BG: Record<string, string> = {
  "kickout-won":   "linear-gradient(180deg, rgba(21,50,88,0.92) 0%, rgba(13,28,53,0.96) 100%)",
  "kickout-lost":  "linear-gradient(180deg, rgba(12,25,58,0.92) 0%, rgba(8,15,40,0.96) 100%)",
  "turnover-won":  "linear-gradient(180deg, rgba(87,48,18,0.92) 0%, rgba(50,28,12,0.96) 100%)",
  "turnover-lost": "linear-gradient(180deg, rgba(65,35,12,0.92) 0%, rgba(38,20,8,0.96) 100%)",
  score:           "linear-gradient(180deg, rgba(20,59,44,0.92) 0%, rgba(12,32,24,0.96) 100%)",
  wide:            "linear-gradient(180deg, rgba(21,50,88,0.92) 0%, rgba(13,28,53,0.96) 100%)",
  "free-won":      "linear-gradient(180deg, rgba(66,35,106,0.92) 0%, rgba(37,20,61,0.96) 100%)",
  "free-conceded": "linear-gradient(180deg, rgba(50,20,75,0.92) 0%, rgba(30,12,48,0.96) 100%)",
  shot:            "linear-gradient(180deg, rgba(87,48,18,0.92) 0%, rgba(50,28,12,0.96) 100%)",
};

const TILE_BORDER: Record<string, string> = {
  "kickout-won":   "rgba(96, 165, 250, 0.58)",
  "kickout-lost":  "rgba(71, 130, 220, 0.46)",
  "turnover-won":  "rgba(251, 146, 60, 0.58)",
  "turnover-lost": "rgba(251, 146, 60, 0.40)",
  score:           "rgba(74, 222, 128, 0.46)",
  wide:            "rgba(96, 165, 250, 0.44)",
  "free-won":      "rgba(192, 132, 252, 0.46)",
  "free-conceded": "rgba(167, 100, 232, 0.42)",
  shot:            "rgba(251, 146, 60, 0.44)",
};

const TILE_ARMED_BORDER: Record<string, string> = {
  "kickout-won":   "rgba(147, 210, 255, 0.95)",
  "kickout-lost":  "rgba(120, 180, 255, 0.95)",
  "turnover-won":  "rgba(255, 186, 120, 0.95)",
  "turnover-lost": "rgba(255, 186, 120, 0.78)",
  score:           "rgba(134, 239, 172, 0.95)",
  wide:            "rgba(147, 210, 255, 0.95)",
  "free-won":      "rgba(216, 180, 254, 0.95)",
  "free-conceded": "rgba(200, 150, 240, 0.95)",
  shot:            "rgba(255, 186, 120, 0.95)",
};

const TILE_ARMED_SHADOW: Record<string, string> = {
  "kickout-won":   "0 0 0 1px rgba(147,210,255,0.22), 0 0 14px rgba(96,165,250,0.32)",
  "kickout-lost":  "0 0 0 1px rgba(120,180,255,0.22), 0 0 12px rgba(71,130,220,0.28)",
  "turnover-won":  "0 0 0 1px rgba(255,186,120,0.22), 0 0 14px rgba(251,146,60,0.32)",
  "turnover-lost": "0 0 0 1px rgba(255,186,120,0.18), 0 0 10px rgba(251,146,60,0.24)",
  score:           "0 0 0 1px rgba(134,239,172,0.22), 0 0 14px rgba(74,222,128,0.28)",
  wide:            "0 0 0 1px rgba(147,210,255,0.22), 0 0 14px rgba(96,165,250,0.28)",
  "free-won":      "0 0 0 1px rgba(216,180,254,0.22), 0 0 14px rgba(192,132,252,0.28)",
  "free-conceded": "0 0 0 1px rgba(200,150,240,0.22), 0 0 12px rgba(167,100,232,0.24)",
  shot:            "0 0 0 1px rgba(255,186,120,0.22), 0 0 14px rgba(251,146,60,0.28)",
};

const SECTION_LABEL_COLOR: Record<VisualProSection, string> = {
  KICKOUT:    "rgba(147, 200, 255, 0.82)",
  POSSESSION: "rgba(255, 180, 100, 0.82)",
  SCORING:    "rgba(134, 239, 172, 0.80)",
  FREES:      "rgba(216, 180, 254, 0.80)",
  DELIVERY:   "rgba(148, 163, 184, 0.72)",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  width: "100%",
};

const bannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  padding: "6px 8px",
  borderRadius: "7px",
  background: "rgba(8, 18, 34, 0.88)",
  border: "1px solid rgba(125, 211, 252, 0.42)",
  boxShadow: "0 0 10px rgba(125, 211, 252, 0.14)",
};

const bannerPrefixStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.3px",
  textTransform: "uppercase",
  color: "rgba(125, 211, 252, 0.95)",
};

const bannerMiddleStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  textTransform: "uppercase",
  color: "rgba(226, 236, 255, 0.90)",
  flex: 1,
};

const bannerHintStyle: CSSProperties = {
  fontSize: "8.5px",
  fontWeight: 600,
  letterSpacing: "0.3px",
  textTransform: "uppercase",
  color: "rgba(125, 211, 252, 0.70)",
  animation: "none",
};

const sectionGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
};

const sectionHeadingStyle = (section: VisualProSection): CSSProperties => ({
  fontSize: "7.8px",
  fontWeight: 750,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  color: SECTION_LABEL_COLOR[section] ?? "rgba(148, 163, 184, 0.72)",
  paddingLeft: "2px",
  paddingBottom: "1px",
});

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "3px",
  marginBottom: "2px",
};

const tileBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  minHeight: "52px",
  borderRadius: "8px",
  border: "1px solid transparent",
  cursor: "pointer",
  padding: "4px 3px",
  textAlign: "center",
  transition: "box-shadow 120ms ease, border-color 120ms ease, transform 80ms ease",
  WebkitTapHighlightColor: "transparent",
};

const tilePrefixStyle: CSSProperties = {
  fontSize: "7.5px",
  fontWeight: 800,
  letterSpacing: "0.3px",
  textTransform: "uppercase",
  color: "rgba(203, 213, 225, 0.62)",
  lineHeight: 1,
};

const tileLabelStyle: CSSProperties = {
  fontSize: "9.4px",
  fontWeight: 780,
  letterSpacing: "0.2px",
  textTransform: "uppercase",
  color: "#edf4ff",
  lineHeight: 1.15,
  textShadow: "0 0 6px rgba(2, 6, 23, 0.4)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function VisualProTagPanel({ config, armedTile, onTileTap, canLog }: Props) {
  // Group consecutive rows with the same section under one section header.
  const sectionGroups = useMemo(() => {
    type Group = { section: VisualProSection; rows: typeof config.rows[number][] };
    const groups: Group[] = [];
    for (const row of config.rows) {
      const last = groups[groups.length - 1];
      if (last && last.section === row.section) {
        last.rows.push(row);
      } else {
        groups.push({ section: row.section, rows: [row] });
      }
    }
    return groups;
  }, [config]);

  return (
    <div style={panelStyle}>
      {/* Armed tile status banner — shows after tile tap, prompts pitch tap */}
      {armedTile ? (
        <div style={bannerStyle} role="status" aria-live="polite">
          <span style={bannerPrefixStyle}>{armedTile.prefix}</span>
          <span style={bannerMiddleStyle}>{armedTile.label}</span>
          <span style={bannerHintStyle}>Tap pitch</span>
        </div>
      ) : null}

      {sectionGroups.map(({ section, rows }) => (
        <div key={section} style={sectionGroupStyle}>
          <div style={sectionHeadingStyle(section)}>{section}</div>

          {rows.map((row) => (
            <div key={row.heading} style={rowStyle}>
              {row.tiles.map((tile) => {
                const isArmed =
                  armedTile !== null &&
                  armedTile.kind === tile.kind &&
                  armedTile.detailTag === tile.detailTag;

                const tileStyle: CSSProperties = {
                  ...tileBaseStyle,
                  background: TILE_BG[tile.visualTone] ?? tileBaseStyle.background,
                  borderColor: isArmed
                    ? TILE_ARMED_BORDER[tile.visualTone] ?? "rgba(226, 236, 255, 0.92)"
                    : TILE_BORDER[tile.visualTone] ?? "rgba(148, 163, 184, 0.46)",
                  boxShadow: isArmed
                    ? TILE_ARMED_SHADOW[tile.visualTone] ?? "none"
                    : "none",
                  opacity: canLog ? 1 : 0.42,
                  cursor: canLog ? "pointer" : "default",
                };

                return (
                  <button
                    key={`${tile.kind}-${tile.detailTag}`}
                    type="button"
                    style={tileStyle}
                    disabled={!canLog}
                    onClick={() => {
                      if (!canLog) return;
                      onTileTap(tile);
                    }}
                    aria-pressed={isArmed}
                    aria-label={`${tile.prefix} ${tile.label}`}
                  >
                    <span style={tilePrefixStyle}>{tile.prefix}</span>
                    <span style={tileLabelStyle}>{tile.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
