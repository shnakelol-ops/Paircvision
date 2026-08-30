import type { CSSProperties } from "react";
import type { QuickReviewSegmentBreakdown, QuickReviewSegmentSideStats } from "../stats/reporting/quickReviewSegmentBreakdown";

// ── Quick Review Page 3 — Segment Comparison ────────────────────────────────
//
// Pure presentation. Every number and every formatted string comes from
// QuickReviewSegmentBreakdown (quickReviewSegmentBreakdown.ts) — this
// component performs no filtering, no percentage, no zone, no score, and no
// chain calculation of its own. It only decides layout, labelling and colour.
//
// Reports the numbers. Does not interpret them — no momentum/control
// language, no causal claims, matching the same rule Page 1 follows.
//
// Teams are stacked vertically (Home section, then Away section), each with
// its own Early/Mid/Late table, reusing the page-pane's existing vertical
// scroll — no horizontal scrolling, no nested scroll mechanics, matching the
// mobile-layout constraint from the Page 3 audit.
//
// Colours follow CLAUDE.md's locked event-family palette: Turnover Won
// purple (#a78bfa), Turnover Lost orange (#f97316).

export interface QuickReviewPage3Props {
  model: QuickReviewSegmentBreakdown;
  homeColour: string;
  awayColour: string;
}

const CLR = {
  purple: "#a78bfa", // Turnover Won
  orange: "#f97316", // Turnover Lost
  amber:  "#fbbf24", // Restart accent
  text:   "#e6edf3",
  muted:  "#8b949e",
  dim:    "#6e7681",
  border: "#21262d",
  panel:  "#0d1117",
} as const;

const SEGMENT_HEADERS = ["Early", "Mid", "Late"] as const;

export function QuickReviewPage3({ model, homeColour, awayColour }: QuickReviewPage3Props) {
  return (
    <div style={S.page}>
      <div style={S.pageSubtitle}>Early 0–10 · Mid 10–20 · Late 20+</div>
      <TeamSection
        teamName={model.homeTeam}
        colour={homeColour}
        rows={model.segments.map((s) => s.home)}
      />
      <TeamSection
        teamName={model.awayTeam}
        colour={awayColour}
        rows={model.segments.map((s) => s.away)}
      />
    </div>
  );
}

// ── Team section (one Early/Mid/Late table) ─────────────────────────────────

function TeamSection({
  teamName,
  colour,
  rows,
}: {
  teamName: string;
  colour: string;
  rows: readonly QuickReviewSegmentSideStats[];
}) {
  return (
    <section style={S.block}>
      <div style={{ ...S.blockTitle, color: colour }}>{teamName.toUpperCase()}</div>

      <HeaderRow />

      <MetricRow label="Score" values={rows.map((r) => r.score.text)} />
      <MetricRow label="Shots" values={rows.map((r) => String(r.shots))} />
      <MetricRow label="Wides" values={rows.map((r) => String(r.wides))} />

      <MetricRow label="Turnovers Won" values={rows.map((r) => String(r.turnoversWon))} accent={CLR.purple} />
      <MetricRow
        label="↳ Own Half"
        values={rows.map((r) => String(r.turnoversWonHalf.ownHalf))}
        sub
      />
      <MetricRow
        label="↳ Opposition Half"
        values={rows.map((r) => String(r.turnoversWonHalf.oppositionHalf))}
        sub
      />

      <MetricRow label="Turnovers Lost" values={rows.map((r) => String(r.turnoversLost))} accent={CLR.orange} />
      <MetricRow
        label="↳ Own Half"
        values={rows.map((r) => String(r.turnoversLostHalf.ownHalf))}
        sub
      />
      <MetricRow
        label="↳ Opposition Half"
        values={rows.map((r) => String(r.turnoversLostHalf.oppositionHalf))}
        sub
      />

      <MetricRow label="Own KO Retained" values={rows.map((r) => r.ownKORetained.text)} accent={CLR.amber} />
      <MetricRow label="Opposition KO Retained" values={rows.map((r) => r.oppKORetained.text)} accent={CLR.amber} />
    </section>
  );
}

// ── Row helpers (presentation only) ──────────────────────────────────────────

function HeaderRow() {
  return (
    <div style={S.row}>
      <span style={S.metricLabel} />
      {SEGMENT_HEADERS.map((h) => (
        <span key={h} style={S.segHeader}>{h}</span>
      ))}
    </div>
  );
}

function MetricRow({
  label,
  values,
  accent,
  sub,
}: {
  label: string;
  values: readonly string[];
  accent?: string;
  sub?: boolean;
}) {
  return (
    <div style={S.row}>
      <span style={{ ...S.metricLabel, ...(sub ? S.metricLabelSub : {}), color: accent ?? (sub ? CLR.dim : CLR.text) }}>
        {label}
      </span>
      {values.map((v, i) => (
        <span key={i} style={sub ? S.segValueSub : S.segValue}>{v}</span>
      ))}
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
  // Matches QuickReviewPage1.tsx's S.subTitle muted-caption pattern (same
  // dim colour, similar weight/size) — kept sentence case rather than that
  // pattern's uppercase transform, since this is a short explanatory line,
  // not a short label like "Shooting" or "Our kickouts".
  pageSubtitle: {
    fontSize: 10.5,
    fontWeight: 500,
    color: CLR.dim,
    letterSpacing: "0.02em",
  },
  block: {
    background: CLR.panel,
    border: `1px solid ${CLR.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    marginBottom: 6,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1.6fr 0.8fr 0.8fr 0.8fr",
    alignItems: "center",
    gap: 4,
    padding: "3px 0",
    borderBottom: `1px solid ${CLR.border}`,
  },
  metricLabel: {
    fontSize: 12,
    color: CLR.text,
  },
  metricLabelSub: {
    fontSize: 10.5,
    paddingLeft: 6,
  },
  segHeader: {
    fontSize: 9.5,
    fontWeight: 700,
    color: CLR.dim,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    textAlign: "right" as const,
  },
  segValue: {
    fontSize: 12,
    color: CLR.text,
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
  },
  segValueSub: {
    fontSize: 10.5,
    color: CLR.muted,
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
  },
};
