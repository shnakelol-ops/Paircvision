import type { CSSProperties } from "react";
import type { QuickReviewMatchOverview } from "../stats/reporting/quickReviewMatchOverview";

// ── Quick Review Page 1 — Match Overview ────────────────────────────────────
//
// Pure presentation. Every number and every formatted string comes from
// QuickReviewMatchOverview (quickReviewMatchOverview.ts) — this component
// performs no percentage/score/shot/consequence calculation of its own. It
// only decides layout, labelling, and colour.
//
// "Our"/"Their" labels are used for the Restarts/Turnovers sections per the
// product spec — safe under the CLAUDE.md pronoun rule because the score
// line at the top of this same page already names both teams explicitly.
//
// Colours follow CLAUDE.md's locked event-family palette: Restart Won cyan
// (#22d3ee), Restart Lost pink (#fb7185), Turnover Won purple (#a78bfa),
// Turnover Lost orange (#f97316).

export interface QuickReviewPage1Props {
  model: QuickReviewMatchOverview;
  homeColour: string;
  awayColour: string;
}

/**
 * "1 shot" / "0 shots" / "2 shots" — the one shared count/noun agreement
 * helper for Quick Review's inline "{count} {noun}" strings (shots/scores).
 * Exported only for pluralize.test.ts; not part of the component's public API.
 */
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

const CLR = {
  cyan:   "#22d3ee", // Restart Won
  pink:   "#fb7185", // Restart Lost
  purple: "#a78bfa", // Turnover Won
  orange: "#f97316", // Turnover Lost
  amber:  "#fbbf24", // Frees / Placed Balls section accent
  text:   "#e6edf3",
  muted:  "#8b949e",
  dim:    "#6e7681",
  border: "#21262d",
  panel:  "#0d1117",
} as const;

export function QuickReviewPage1({ model, homeColour, awayColour }: QuickReviewPage1Props) {
  return (
    <div style={S.page}>

      {/* ── SCORE & SHOOTING ─────────────────────────────────────────── */}
      <section style={S.block}>
        <div style={{ ...S.blockTitle, color: CLR.text }}>SCORE &amp; SHOOTING</div>

        <div style={S.scoreLine}>
          <span style={{ ...S.scoreTeam, color: homeColour }}>{model.homeTeam}</span>
          <span style={S.scoreValue}>{model.score.home.text}</span>
          <span style={S.scoreSep}>—</span>
          <span style={S.scoreValue}>{model.score.away.text}</span>
          <span style={{ ...S.scoreTeam, color: awayColour }}>{model.awayTeam}</span>
        </div>

        <div style={S.subTitle}>Shooting</div>
        <Row label={model.homeTeam} labelColour={homeColour} value={model.shooting.for.text} />
        <Row label={model.awayTeam} labelColour={awayColour} value={model.shooting.opp.text} />

        <div style={S.subTitle}>Longest scoring run</div>
        <Row label={model.homeTeam} labelColour={homeColour} value={String(model.longestRun.for)} />
        <Row label={model.awayTeam} labelColour={awayColour} value={String(model.longestRun.opp)} />
      </section>

      {/* ── RESTARTS ─────────────────────────────────────────────────── */}
      <section style={S.block}>
        <div style={{ ...S.blockTitle, color: CLR.text }}>RESTARTS</div>

        <div style={S.subTitle}>Our kickouts</div>
        <div style={S.bigValue}>{model.restarts.ours.text}</div>

        <div style={S.subTitle}>Their kickouts</div>
        <div style={S.bigValue}>{model.restarts.theirs.text}</div>

        <ConsequenceRow
          label="Restart won"
          accent={CLR.cyan}
          shots={model.restarts.won.shots}
          scores={model.restarts.won.scores}
        />
        <ConsequenceRow
          label="Restart lost"
          accent={CLR.pink}
          shots={model.restarts.lost.shots}
          scores={model.restarts.lost.scores}
          against
        />
      </section>

      {/* ── TURNOVERS ────────────────────────────────────────────────── */}
      <section style={S.block}>
        <div style={{ ...S.blockTitle, color: CLR.text }}>TURNOVERS</div>

        <div style={S.subTitle}>Won</div>
        <div style={S.bigValue}>{model.turnovers.won.count}</div>
        <ConsequenceRow
          label=""
          accent={CLR.purple}
          shots={model.turnovers.won.shots}
          scores={model.turnovers.won.scores}
          compact
        />

        <div style={S.subTitle}>Lost</div>
        <div style={S.bigValue}>{model.turnovers.lost.count}</div>
        <ConsequenceRow
          label=""
          accent={CLR.orange}
          shots={model.turnovers.lost.shots}
          scores={model.turnovers.lost.scores}
          against
          compact
        />
      </section>

      {/* ── FREES / PLACED BALLS ─────────────────────────────────────── */}
      <section style={{ ...S.block, marginBottom: 0 }}>
        <div style={{ ...S.blockTitle, color: CLR.text }}>FREES / PLACED BALLS</div>

        <Row label="Frees won" value={String(model.frees.won)} accent={CLR.amber} />
        <Row label="Placed balls" value={model.frees.placed.text} accent={CLR.amber} />
        <Row label="Frees conceded" value={String(model.frees.conceded)} accent={CLR.amber} />
      </section>

    </div>
  );
}

// ── Small row helpers (presentation only) ───────────────────────────────────

function Row({
  label,
  value,
  labelColour,
  accent,
}: {
  label: string;
  value: string;
  labelColour?: string;
  accent?: string;
}) {
  return (
    <div style={S.row}>
      <span style={{ ...S.rowLabel, color: labelColour ?? accent ?? CLR.muted }}>{label}</span>
      <span style={S.rowValue}>{value}</span>
    </div>
  );
}

function ConsequenceRow({
  label,
  accent,
  shots,
  scores,
  against,
  compact,
}: {
  label: string;
  accent: string;
  shots: number;
  scores: number;
  /** Appends " against" to both nouns (restart/turnover LOST rows). */
  against?: boolean;
  compact?: boolean;
}) {
  const suffix = against ? " against" : "";
  const shotsText = `${shots} ${pluralize(shots, "shot")}${suffix}`;
  const scoresText = `${scores} ${pluralize(scores, "score")}${suffix}`;
  return (
    <div style={compact ? S.consequenceRowCompact : S.consequenceRow}>
      {label && <span style={{ ...S.consequenceLabel, color: accent }}>{label}</span>}
      <span style={S.consequenceArrow}>→</span>
      <span style={S.consequenceValue}>{shotsText}</span>
      <span style={S.consequenceSep}>|</span>
      <span style={S.consequenceValue}>{scoresText}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "2px 2px 4px",
  },
  block: {
    background: CLR.panel,
    border: `1px solid ${CLR.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: CLR.dim,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    marginTop: 4,
  },

  scoreLine: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 2,
  },
  scoreTeam: {
    fontSize: 12,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: 96,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 800,
    color: CLR.text,
    fontVariantNumeric: "tabular-nums",
  },
  scoreSep: {
    fontSize: 13,
    color: CLR.dim,
  },

  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: 700,
    color: CLR.text,
    fontVariantNumeric: "tabular-nums",
  },

  bigValue: {
    fontSize: 18,
    fontWeight: 800,
    color: CLR.text,
    fontVariantNumeric: "tabular-nums",
  },

  consequenceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap" as const,
    marginTop: 2,
  },
  consequenceRowCompact: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  consequenceLabel: {
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  consequenceArrow: {
    fontSize: 11,
    color: CLR.dim,
  },
  consequenceValue: {
    fontSize: 12,
    fontWeight: 700,
    color: CLR.text,
    fontVariantNumeric: "tabular-nums",
  },
  consequenceSep: {
    fontSize: 11,
    color: CLR.dim,
  },
};
