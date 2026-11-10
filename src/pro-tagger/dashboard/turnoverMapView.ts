/**
 * turnoverMapView.ts
 *
 * Display model for the Match Analysis Pack's Turnover Map: one selected
 * team's turnovers won and lost, how each happened, and where, on a portrait
 * map on which that team attacks upwards.
 *
 * OWNERSHIP — the critical rule. Event Stats stores every turnover once, from
 * the Home team's point of view (pro-tagger-adapter.ts: TURNOVER_WON /
 * TURNOVER_LOST, always teamSide "FOR", team "HOME"). Filtering by teamSide
 * would give the Away team no turnovers at all. Instead, each turnover's
 * possession winner is resolved with the canonical turnoverGainedByFor()
 * (turnoverMetrics.ts — the rule the chain engine, Quick Review and the
 * dashboard's turnovers-won figure all share) over the report's
 * chain.turnovers.outcomes (one outcome per turnover event). The selected
 * team WON the event when it is the winner, otherwise LOST it — so every
 * turnover appears exactly once on each team's map with the outcome reversed.
 *
 * METHODS come from the stored tile value (TACKLE, INTERCEPTION, HP ERROR,
 * KP ERROR, OVERCARRIED; the report's canonical aliases INTERCEPT /
 * SLACK_HAND_PASS / SLACK_KICK_PASS are accepted as the same method) and are
 * labelled with the capture grid's own row labels via getTileRowLabelFor():
 * the FOR-row label when the selected team won the ball ("Tackle",
 * "Opposition HP Error"), the OPP-row label when it lost it ("Dispossessed",
 * "HP Error"). A turnover with no recognisable method — or with two
 * different ones — stays in the won / lost totals and is counted as
 * "Method not recorded"; no method is ever invented. turnoverMapView.test.ts
 * reconciles the method counts with buildTeamSummaryBlock's grouped totals.
 *
 * Deliberately absent: player names (Away players are never recorded on
 * turnovers, and older lost turnovers may name an opposition player), forced
 * / unforced, pressing, and what happened after the turnover.
 *
 * Pure and serialisable: no canvas, no DOM, no storage; never mutates input.
 */

import { turnoverGainedByFor } from "../../stats/reporting/turnoverMetrics";
import { getTileRowLabelFor } from "../pro-tagger-families";
import { buildMetaLine } from "./htFtDashboardView";
import type { ProTaggerSport } from "../pro-tagger-session";
import {
  buildScopedMapReport,
  mapOrientation,
  otherSide,
  plotEvent,
  recordedClockSeconds,
  scopeLabel,
  scopedScoreline,
  summariseLocations,
  teamIdentity,
  type MapLocationSummary,
  type MapOrientation,
  type MapPoint,
  type MapScope,
  type MapScoreline,
  type MapTeamIdentity,
  type MapTeamSide,
  type MatchMapSource,
} from "./matchMapPerspective";

export type TurnoverMethod = "TACKLE" | "INTERCEPTION" | "HP_ERROR" | "KP_ERROR" | "OVERCARRIED" | "UNKNOWN";

export type TurnoverOutcomeForTeam = "WON" | "LOST";

/** Display order for method rows. */
export const TURNOVER_METHODS: readonly TurnoverMethod[] = [
  "TACKLE", "INTERCEPTION", "HP_ERROR", "KP_ERROR", "OVERCARRIED", "UNKNOWN",
];

export const UNKNOWN_METHOD_LABEL = "Method not recorded";

/** The capture tile each method was recorded with (pro-tagger-families.ts TURNOVER tiles). */
const METHOD_TILE_LABEL: Record<Exclude<TurnoverMethod, "UNKNOWN">, string> = {
  TACKLE: "Tackle",
  INTERCEPTION: "Interception",
  HP_ERROR: "HP Error",
  KP_ERROR: "KP Error",
  OVERCARRIED: "Overcarried",
};

/** Stored tag (normalised: upper case, spaces / underscores collapsed) → method. */
const TAG_METHOD: Record<string, Exclude<TurnoverMethod, "UNKNOWN">> = {
  "TACKLE": "TACKLE",
  "INTERCEPTION": "INTERCEPTION",
  "INTERCEPT": "INTERCEPTION",
  "HP ERROR": "HP_ERROR",
  "SLACK HAND PASS": "HP_ERROR",
  "KP ERROR": "KP_ERROR",
  "SLACK KICK PASS": "KP_ERROR",
  "OVERCARRIED": "OVERCARRIED",
};

function normaliseTag(tag: string): string {
  return tag.trim().toUpperCase().replace(/[\s_]+/g, " ");
}

/** The single method a turnover's tags record, or UNKNOWN (none, or conflicting ones). */
export function turnoverMethodOf(tags: readonly unknown[] | null | undefined): TurnoverMethod {
  const found = new Set<TurnoverMethod>();
  for (const t of tags ?? []) {
    if (typeof t !== "string") continue;
    const m = TAG_METHOD[normaliseTag(t)];
    if (m) found.add(m);
  }
  return found.size === 1 ? [...found][0] : "UNKNOWN";
}

/** The capture grid's label for a method, from the selected team's side of the ball. */
export function turnoverMethodLabel(method: TurnoverMethod, outcome: TurnoverOutcomeForTeam, sport: ProTaggerSport): string {
  if (method === "UNKNOWN") return UNKNOWN_METHOD_LABEL;
  return getTileRowLabelFor("TURNOVER", METHOD_TILE_LABEL[method], sport, outcome === "WON" ? "FOR" : "OPP");
}

export type TurnoverMethodCount = { method: TurnoverMethod; label: string; count: number };

export type TurnoverMarker = {
  id: string;
  outcome: TurnoverOutcomeForTeam;
  method: TurnoverMethod;
  methodLabel: string;
  period: "1H" | "2H" | null;
  clockSeconds: number | null;
  /** null = counted in the statistics but not placed on the map. */
  point: MapPoint | null;
};

export type TurnoverHalf = { won: number; lost: number };

export type TurnoverMapView = {
  scope: MapScope;
  scopeLabel: "HALF-TIME" | "FULL-TIME";
  /** "Venue · League · 7 Nov 2026" — only fields the match records; null when none. */
  metaLine: string | null;
  sport: ProTaggerSport;
  team: MapTeamIdentity;
  opponent: MapTeamIdentity;
  scoreline: MapScoreline;
  totals: { won: number; lost: number; balance: number; total: number };
  /** Every method row in TURNOVER_METHODS order, zero counts included. */
  methods: { won: TurnoverMethodCount[]; lost: TurnoverMethodCount[] };
  /**
   * FT only: won / lost in each half. null at HT, and null whenever any
   * turnover lacks a recorded half (the split would not add up to the totals).
   */
  halves: { firstHalf: TurnoverHalf; secondHalf: TurnoverHalf } | null;
  markers: TurnoverMarker[];
  location: MapLocationSummary;
  orientation: MapOrientation;
};

function turnoverHalf(markers: readonly TurnoverMarker[], period: "1H" | "2H"): TurnoverHalf {
  const inHalf = markers.filter((m) => m.period === period);
  const won = inHalf.filter((m) => m.outcome === "WON").length;
  return { won, lost: inHalf.length - won };
}

/** Turnover Map captions: the map is normalised to the selected team, whatever end it attacked. */
export const TURNOVER_TEAM_RELATIVE_CAPTION = {
  HT: "Team-relative view · first half",
  FT: "Team-relative view · both halves combined",
} as const;
export const TURNOVER_AS_CAPTURED_CAPTION =
  "Attack direction not recorded — positions shown as captured; thirds not shown";

/**
 * The shared orientation (unchanged — same frame, same fallback) with the
 * Turnover Map's own caption. The team is already named in the banner, and
 * "team-relative" says plainly that both halves are shown in the selected
 * team's frame rather than at the ends they physically attacked.
 */
function turnoverOrientation(source: MatchMapSource, side: MapTeamSide, scope: MapScope): MapOrientation {
  const base = mapOrientation(source, side, scope);
  return base.status === "ATTACKING_UP"
    ? { ...base, caption: TURNOVER_TEAM_RELATIVE_CAPTION[scope] }
    : { ...base, caption: TURNOVER_AS_CAPTURED_CAPTION };
}

export function buildTurnoverMapView(source: MatchMapSource, side: MapTeamSide, scope: MapScope): TurnoverMapView {
  const report = buildScopedMapReport(source, scope);
  const orientation = turnoverOrientation(source, side, scope);

  const counts = {
    WON: new Map<TurnoverMethod, number>(),
    LOST: new Map<TurnoverMethod, number>(),
  };
  const markers: TurnoverMarker[] = [];
  const reasons: ReturnType<typeof plotEvent>["reason"][] = [];

  for (const outcome of report.chain.turnovers.outcomes) {
    const e = outcome.turnoverEvent;
    const winner: MapTeamSide = turnoverGainedByFor(outcome) ? "FOR" : "OPP";
    const result: TurnoverOutcomeForTeam = winner === side ? "WON" : "LOST";
    const method = turnoverMethodOf(e.tags);
    counts[result].set(method, (counts[result].get(method) ?? 0) + 1);

    const plotted = plotEvent(e, side, orientation.homeFirstHalfDirection);
    reasons.push(plotted.reason);
    markers.push({
      id: e.id,
      outcome: result,
      method,
      methodLabel: turnoverMethodLabel(method, result, source.sport),
      period: e.period === "1H" || e.period === "2H" ? e.period : null,
      clockSeconds: recordedClockSeconds(e),
      point: plotted.point,
    });
  }

  const rows = (result: TurnoverOutcomeForTeam): TurnoverMethodCount[] =>
    TURNOVER_METHODS.map((method) => ({
      method,
      label: turnoverMethodLabel(method, result, source.sport),
      count: counts[result].get(method) ?? 0,
    }));

  const won = markers.filter((m) => m.outcome === "WON").length;
  const lost = markers.length - won;
  const halves =
    scope === "FT" && markers.every((m) => m.period != null)
      ? { firstHalf: turnoverHalf(markers, "1H"), secondHalf: turnoverHalf(markers, "2H") }
      : null;
  return {
    scope,
    scopeLabel: scopeLabel(scope),
    metaLine: buildMetaLine(source),
    sport: source.sport,
    team: teamIdentity(source, side),
    opponent: teamIdentity(source, otherSide(side)),
    scoreline: scopedScoreline(report, source),
    totals: { won, lost, balance: won - lost, total: markers.length },
    methods: { won: rows("WON"), lost: rows("LOST") },
    halves,
    markers,
    location: summariseLocations(reasons),
    orientation,
  };
}
