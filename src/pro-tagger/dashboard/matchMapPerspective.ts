/**
 * matchMapPerspective.ts
 *
 * Shared, pure building blocks for the Match Analysis Pack's team map pages
 * (Scoring Map, Turnover Map): which team is selected, the HT / FT scoped
 * report, and where each recorded event sits on a portrait map on which the
 * selected team attacks upwards.
 *
 * STATISTICS: the scoped report is built exactly the way the HT / FT
 * dashboard builds it (htFtDashboardView.ts → buildHtFtDashboardView):
 * HT = first-half events only with scope "1H", FT = every event with scope
 * "FULL", both through toEventStatsReportEvents() → buildMatchReport(). No
 * statistical definition lives in this module.
 *
 * COORDINATES (verified against capture, see matchMapPerspective.test.ts):
 *   - Stored nx runs along the pitch length, ny across it (touchline to
 *     touchline), both 0–1, absolute: they record the physical spot tapped
 *     (ProTaggerPitchView.tsx → svgPointToPitchNorm). The Home team attacks
 *     towards nx = 1 in the first half when the recorded first-half direction
 *     is RIGHT, and the teams change ends at half time
 *     (zone-orientation.ts → resolveForAttackingDirection).
 *   - Step 1, team frame: toTeamRelativeZoneEvent() rotates an event 180°
 *     about the pitch centre (both axes together) whenever the selected team
 *     attacked LEFT in that event's half, so the selected team always attacks
 *     towards nx = 1. Home uses the "REPORT" perspective (the Home team's
 *     direction), Away the "OPP" perspective (the opposite end).
 *   - Step 2, portrait: px = ny, py = 1 − nx. A 90° turn (determinant +1, a
 *     rotation, never a mirror) that puts the attacking end (nx = 1) at the
 *     top. The result is exactly the picture the coach saw on the capture
 *     screen whenever the selected team was attacking up the screen — the
 *     capture view (px = 1 − ny, py = nx) turned 180°.
 *
 * Stored events are never modified: every transformation works on copies.
 * Pure: no canvas, no DOM, no React, no storage.
 */

import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { buildMatchReport, type MatchReport } from "../../stats/reporting/matchReport";
import { buildTeamSummaryBlock } from "../../stats/reporting/teamStatsViews";
import { getPitchZone } from "../../stats/zones/zone-engine";
import { ZONE_MAP_V1_NINE_GRID } from "../../stats/zones/zone-maps";
import {
  toTeamRelativeZoneEvent,
  type AttackingDirection,
} from "../../stats/zones/zone-orientation";
import { toEventStatsReportEvents, type EventStatsReportEvent } from "../pro-tagger-review-adapter";
import { fmtGP } from "../pro-tagger-score";
import type { ProTaggerSession } from "../pro-tagger-session";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";
import {
  dashboardSourceFromLive,
  dashboardSourceFromSavedMatch,
  type DashboardMatchState,
  type DashboardPeriod,
  type HtFtDashboardSource,
} from "./htFtDashboardView";

// ─── Selection ────────────────────────────────────────────────────────────────

/** The team a map page is drawn for: "FOR" = the Home team, "OPP" = the Away team
 *  (the same side values every report function takes). */
export type MapTeamSide = "FOR" | "OPP";

/** HT = first half only; FT = the whole match. Same values as the dashboard. */
export type MapScope = DashboardPeriod;

export function otherSide(side: MapTeamSide): MapTeamSide {
  return side === "FOR" ? "OPP" : "FOR";
}

// ─── Source ───────────────────────────────────────────────────────────────────

/**
 * Everything a map page needs: the dashboard's own source (events, state,
 * sport, names, colours, metadata) plus the Home team's recorded first-half
 * attacking direction, kept raw so a missing or invalid value can be reported
 * honestly instead of being guessed.
 */
export type MatchMapSource = HtFtDashboardSource & {
  homeFirstHalfAttackingDirection: unknown;
};

/** Saved match (Review) → map source. Reads only. */
export function mapSourceFromSavedMatch(m: ProTaggerSavedMatch): MatchMapSource {
  return {
    ...dashboardSourceFromSavedMatch(m),
    homeFirstHalfAttackingDirection: m.restoreContext?.firstHalfAttackingDirection,
  };
}

/** Live Event Stats session → map source. Reads only. */
export function mapSourceFromLive(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  matchState: DashboardMatchState,
): MatchMapSource {
  return {
    ...dashboardSourceFromLive(session, events, matchState),
    homeFirstHalfAttackingDirection: session.attackDirection,
  };
}

/** "left" / "right" (stored by Event Stats) or "LEFT" / "RIGHT" → direction; anything else → null. */
export function normaliseAttackDirection(raw: unknown): AttackingDirection | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return v === "LEFT" || v === "RIGHT" ? v : null;
}

// ─── Team identity ────────────────────────────────────────────────────────────

export type MapTeamIdentity = {
  side: MapTeamSide;
  /** "HOME" / "AWAY" — which actual team the side is. */
  role: "HOME" | "AWAY";
  name: string;
  /** Colours as recorded on the squad (unvalidated; the renderer applies the
   *  dashboard's normaliseHex + fallbacks). */
  colours: { primary?: string; secondary?: string };
};

export function teamIdentity(source: MatchMapSource, side: MapTeamSide): MapTeamIdentity {
  return side === "FOR"
    ? { side, role: "HOME", name: source.homeTeamName, colours: { ...source.homeColours } }
    : { side, role: "AWAY", name: source.awayTeamName, colours: { ...source.awayColours } };
}

// ─── Scope and scoreline ──────────────────────────────────────────────────────

/**
 * The scoped report, built the same way as the HT / FT dashboard: HT keeps
 * first-half events only (so it stays a first-half report after the second
 * half has started) and uses scope "1H"; FT uses every event, scope "FULL".
 */
export function buildScopedMapReport(
  source: Pick<MatchMapSource, "events" | "homeTeamName" | "awayTeamName">,
  scope: MapScope,
): MatchReport<EventStatsReportEvent> {
  const scoped = scope === "HT" ? source.events.filter((e) => e.period === "1H") : source.events;
  return buildMatchReport({
    events: toEventStatsReportEvents(scoped),
    homeTeam: source.homeTeamName,
    awayTeam: source.awayTeamName,
    scope: scope === "HT" ? "1H" : "FULL",
  });
}

export type MapScoreSide = { goals: number; points: number; total: number; text: string };

export type MapScoreline = {
  homeName: string;
  awayName: string;
  home: MapScoreSide;
  away: MapScoreSide;
};

/** Scoreline from the scoped report — the same buildTeamSummaryBlock totals the dashboard shows. */
export function scopedScoreline(report: MatchReport<EventStatsReportEvent>, source: MatchMapSource): MapScoreline {
  const side = (team: MapTeamSide): MapScoreSide => {
    const b = buildTeamSummaryBlock(report, team);
    return { goals: b.goals, points: b.points, total: b.scoreTotal, text: fmtGP(b.goals, b.points) };
  };
  return { homeName: source.homeTeamName, awayName: source.awayTeamName, home: side("FOR"), away: side("OPP") };
}

export function scopeLabel(scope: MapScope): "HALF-TIME" | "FULL-TIME" {
  return scope === "HT" ? "HALF-TIME" : "FULL-TIME";
}

// ─── Orientation ──────────────────────────────────────────────────────────────

export const ORIENTATION_UNAVAILABLE_CAPTION = "Attack direction not recorded — positions shown as captured";

export type MapOrientation =
  | {
      /** Every plotted event is shown with the selected team attacking up the page. */
      status: "ATTACKING_UP";
      homeFirstHalfDirection: AttackingDirection;
      caption: string;
    }
  | {
      /** No reliable direction: recorded positions shown as captured (nx = 1 at the top), not team-relative. */
      status: "AS_CAPTURED";
      homeFirstHalfDirection: null;
      caption: string;
    };

export function mapOrientation(source: MatchMapSource, side: MapTeamSide, scope: MapScope): MapOrientation {
  const dir = normaliseAttackDirection(source.homeFirstHalfAttackingDirection);
  if (dir == null) {
    return { status: "AS_CAPTURED", homeFirstHalfDirection: null, caption: ORIENTATION_UNAVAILABLE_CAPTION };
  }
  const name = teamIdentity(source, side).name;
  return {
    status: "ATTACKING_UP",
    homeFirstHalfDirection: dir,
    caption: `${name} attacking ↑ · ${scope === "HT" ? "first half" : "both halves"}`,
  };
}

// ─── Coordinates ──────────────────────────────────────────────────────────────

/** A position on the portrait map: px 0 = left edge, 1 = right; py 0 = top, 1 = bottom. */
export type MapPoint = { px: number; py: number };

/** Why an event has no position on the map. */
export type UnplottableReason = "NO_COORDINATES" | "HALF_NOT_RECORDED";

type CoordinateEvent = Pick<LoggedMatchEvent, "teamSide" | "period"> & {
  nx?: unknown;
  ny?: unknown;
  x?: unknown;
  y?: unknown;
};

function isUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * The recorded position, or null when there is no valid one. Reads nx / ny
 * (what capture and the Event Map use), falling back to x / y only when nx /
 * ny are unusable. Values outside 0–1 are treated as missing, never clamped.
 */
export function recordedPosition(e: CoordinateEvent): { nx: number; ny: number } | null {
  if (isUnit(e.nx) && isUnit(e.ny)) return { nx: e.nx, ny: e.ny };
  if (isUnit(e.x) && isUnit(e.y)) return { nx: e.x, ny: e.y };
  return null;
}

/** Portrait projection of a landscape position whose attacking end is nx = 1: px = ny, py = 1 − nx. */
export function projectToPortrait(p: { nx: number; ny: number }): MapPoint {
  return { px: p.ny, py: 1 - p.nx };
}

/**
 * Where `e` sits on the selected team's map, or why it can't be placed.
 *
 * With a known direction, the position is first put in the selected team's
 * attacking frame (toTeamRelativeZoneEvent: Home → "REPORT", Away → "OPP"),
 * which needs the event's half; an event whose half is not recorded is not
 * placed rather than guessed. With no direction, the recorded position is
 * projected as captured.
 */
export function plotEvent(
  e: CoordinateEvent,
  side: MapTeamSide,
  homeFirstHalfDirection: AttackingDirection | null,
): { point: MapPoint; reason: null } | { point: null; reason: UnplottableReason } {
  const pos = recordedPosition(e);
  if (pos == null) return { point: null, reason: "NO_COORDINATES" };
  if (homeFirstHalfDirection == null) return { point: projectToPortrait(pos), reason: null };
  if (e.period !== "1H" && e.period !== "2H") return { point: null, reason: "HALF_NOT_RECORDED" };
  const framed = toTeamRelativeZoneEvent(
    { nx: pos.nx, ny: pos.ny, teamSide: e.teamSide, period: e.period },
    homeFirstHalfDirection,
    side === "FOR" ? "REPORT" : "OPP",
  );
  return { point: projectToPortrait(framed), reason: null };
}

export type MapLocationSummary = {
  /** Events counted on this page. */
  total: number;
  /** Events with a position on the map. */
  plotted: number;
  /** Events counted in the statistics but not placed on the map. */
  notPlotted: number;
  noCoordinates: number;
  halfNotRecorded: number;
  /** Honest note for the renderer; null when every event is placed. */
  note: string | null;
};

export function summariseLocations(reasons: readonly (UnplottableReason | null)[]): MapLocationSummary {
  const noCoordinates = reasons.filter((r) => r === "NO_COORDINATES").length;
  const halfNotRecorded = reasons.filter((r) => r === "HALF_NOT_RECORDED").length;
  const notPlotted = noCoordinates + halfNotRecorded;
  return {
    total: reasons.length,
    plotted: reasons.length - notPlotted,
    notPlotted,
    noCoordinates,
    halfNotRecorded,
    note: notPlotted === 0 ? null : `${notPlotted} of ${reasons.length} not shown on the map — location not recorded`,
  };
}

/** Recorded match clock in seconds, or null when missing / invalid. */
export function recordedClockSeconds(e: { matchClockSeconds?: unknown }): number | null {
  const v = e.matchClockSeconds;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

// ─── Pitch thirds (presentation) ──────────────────────────────────────────────

export type PitchThird = "ATTACKING" | "MIDDLE" | "DEFENSIVE";

/**
 * Which third of the pitch length a map point sits in, from the selected
 * team's point of view. Only meaningful for a team-relative map
 * (orientation "ATTACKING_UP"). Delegates to the existing zone engine
 * (getPitchZone on ZONE_MAP_V1_NINE_GRID, the same thirds the Snapshot's
 * zone labels use) with the point turned back into its attacking-right
 * frame: nx = 1 − py. Boundaries follow the engine: each third includes its
 * lower edge, so a point exactly on a boundary belongs to the third nearer
 * the attacking goal. Presentation only — it never changes a position.
 */
export function pitchThirdOf(point: MapPoint): PitchThird {
  const zone = getPitchZone(1 - point.py, point.px, ZONE_MAP_V1_NINE_GRID);
  const id = zone?.id ?? "";
  return id.startsWith("ATTACKING") ? "ATTACKING" : id.startsWith("MIDDLE") ? "MIDDLE" : "DEFENSIVE";
}

/**
 * The map's third bands, top to bottom, as py ranges — derived from the same
 * zone map, so the drawn bands and pitchThirdOf can never disagree.
 */
export function pitchThirdBands(): { third: PitchThird; top: number; bottom: number }[] {
  const lengthStart = (prefix: string) => {
    const z = ZONE_MAP_V1_NINE_GRID.zones.find((zone) => zone.id.startsWith(prefix))!;
    return z.bounds.xMin / ZONE_MAP_V1_NINE_GRID.coordinateMax;
  };
  const attackingFrom = 1 - lengthStart("ATTACKING"); // py where the attacking third ends
  const middleFrom = 1 - lengthStart("MIDDLE");
  return [
    { third: "ATTACKING", top: 0, bottom: attackingFrom },
    { third: "MIDDLE", top: attackingFrom, bottom: middleFrom },
    { third: "DEFENSIVE", top: middleFrom, bottom: 1 },
  ];
}
