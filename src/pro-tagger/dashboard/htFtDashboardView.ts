/**
 * htFtDashboardView.ts
 *
 * Display model for the portrait HT / FT dashboard PNG (Event Stats).
 *
 * STATISTICS: every number on the dashboard comes from the same pipeline the
 * HT / FT Snapshot PDF dashboard page uses — toEventStatsReportEvents() →
 * buildMatchReport({ scope }) → buildSnapshotDashboardModel() — with the
 * same HT scoping (first-half events only, scope "1H") and FT scoping (every
 * event, scope "FULL"). This module adds no statistical definitions: it only
 * formats the model's fields into labels and chooses honest empty states.
 *
 * Pure: no canvas, no DOM, no React, no storage, and it never mutates the
 * events or squads it is given.
 */

import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { buildMatchReport } from "../../stats/reporting/matchReport";
import {
  buildSnapshotDashboardModel,
  snapshotMarginLabel,
  type SnapshotDashboardModel,
  type SnapshotDashboardTeam,
} from "../../stats/reporting/snapshotDashboardModel";
import { getRestartTerm } from "../pro-tagger-families";
import { toEventStatsReportEvents } from "../pro-tagger-review-adapter";
import { fmtGP } from "../pro-tagger-score";
import type { ProTaggerMatchType, ProTaggerSession, ProTaggerSport } from "../pro-tagger-session";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";

export type DashboardPeriod = "HT" | "FT";

export type DashboardMatchState = ProTaggerSavedMatch["restoreContext"]["matchState"];

/** Everything the dashboard needs, from either the live session or a saved match. */
export type HtFtDashboardSource = {
  events: readonly LoggedMatchEvent[];
  matchState: DashboardMatchState;
  sport: ProTaggerSport;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  matchType?: ProTaggerMatchType;
  /** Match creation time (ms) — the only date the match records. */
  createdAt?: number;
  homeColours: { primary?: string; secondary?: string };
  awayColours: { primary?: string; secondary?: string };
};

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * HT: once the first half has been completed (Half Time, Second Half, Full
 * Time) — never while the first half is still being played. FT: only once
 * the match has been marked Full Time.
 */
export function dashboardAvailability(matchState: DashboardMatchState): { ht: boolean; ft: boolean } {
  return {
    ht: matchState === "HALF_TIME" || matchState === "SECOND_HALF" || matchState === "FULL_TIME",
    ft: matchState === "FULL_TIME",
  };
}

// ─── Source adapters ──────────────────────────────────────────────────────────

function teamLabel(matchName: string, squadName: string | undefined, fallback: string): string {
  return matchName.trim() || squadName?.trim() || fallback;
}

/** Saved match (Review) → dashboard source. Reads only; never copies back. */
export function dashboardSourceFromSavedMatch(m: ProTaggerSavedMatch): HtFtDashboardSource {
  return {
    events: m.events,
    matchState: m.restoreContext.matchState,
    sport: m.sport,
    homeTeamName: teamLabel(m.homeTeamName, m.homeSquad?.teamName, "Home"),
    awayTeamName: teamLabel(m.awayTeamName, m.awaySquad?.teamName, "Away"),
    venue: m.venue,
    matchType: m.matchType,
    createdAt: m.createdAt,
    homeColours: { primary: m.homeSquad?.primaryColour, secondary: m.homeSquad?.secondaryColour },
    awayColours: { primary: m.awaySquad?.primaryColour, secondary: m.awaySquad?.secondaryColour },
  };
}

/** Live Event Stats session → dashboard source (same team labels as the live scoreboard). */
export function dashboardSourceFromLive(
  session: ProTaggerSession,
  events: readonly LoggedMatchEvent[],
  matchState: DashboardMatchState,
): HtFtDashboardSource {
  return {
    events,
    matchState,
    sport: session.sport,
    homeTeamName: teamLabel(session.homeTeamName, session.homeSquad?.teamName, "Home"),
    awayTeamName: teamLabel(session.awayTeamName, session.awaySquad?.teamName, "Away"),
    venue: session.venue,
    matchType: session.matchType,
    createdAt: session.createdAt,
    homeColours: { primary: session.homeSquad?.primaryColour, secondary: session.homeSquad?.secondaryColour },
    awayColours: { primary: session.awaySquad?.primaryColour, secondary: session.awaySquad?.secondaryColour },
  };
}

// ─── Colour helpers (presentation only) ───────────────────────────────────────

/** Dashboard background behind badges and bars. */
export const DASHBOARD_BG = "#0b1428";

/** Same fallbacks as the live scoreboard (ProTaggerLiveScreen). */
const DEFAULT_COLOURS = {
  home: { primary: "#16a34a", secondary: "#ffffff" },
  away: { primary: "#dc2626", secondary: "#ffffff" },
};

export function normaliseHex(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return fallback;
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#0b1020";

/** Monogram text colour with the better contrast against the badge fill. */
export function readableTextOn(fill: string): string {
  return contrastRatio(fill, LIGHT_TEXT) >= contrastRatio(fill, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** Below this, a team colour would melt into the dashboard background. */
export const MIN_BG_CONTRAST = 1.8;

// ─── Monogram ─────────────────────────────────────────────────────────────────

const CLUB_SUFFIXES = new Set(["GAA", "CLG", "GAC", "GFC", "HC", "HURLING", "CAMOGIE", "LGFA", "CLUB"]);

/** "Ballylanders" → "B", "Na Fianna" → "NF", "Cill Chainnigh GAA" → "CC",
 *  "CLG Ó Donnabháin Rossa" / "Cumann Lúthchleas Gael Ó Donnabháin Rossa" → "ÓD". */
function monogramWords(name: string): string[] {
  return name
    .split(/[\s\-–/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);
}

export function teamMonogram(name: string): string {
  const words = monogramWords(name);
  const meaningful = monogramWords(name.replace(/cumann\s+l[uú]thchleas\s+gael/giu, " ")).filter(
    (w) => !CLUB_SUFFIXES.has(w.toLocaleUpperCase("en-IE")),
  );
  const use = meaningful.length > 0 ? meaningful : words;
  if (use.length === 0) return "?";
  const letters = use.slice(0, 2).map((w) => [...w][0].toLocaleUpperCase("en-IE"));
  return letters.join("");
}

// ─── Display model ────────────────────────────────────────────────────────────

/** A stat cell: a headline value, a supporting line, and a 0–1 bar ratio (null = no bar). */
/** Headline shown when a figure has no data (no shots, no restarts, taker not recorded). */
export const NO_VALUE = "—";

export type DashboardStat = {
  value: string;
  detail: string;
  ratio: number | null;
};

export type DashboardTeamView = {
  name: string;
  monogram: string;
  primary: string;
  secondary: string;
  monogramText: string;
  /** True when the team colour needs a light outline to stand out on the background. */
  needsOutline: boolean;
  score: { goals: number; points: number; total: number };
  scoreText: string;
  totalText: string;
  shooting: DashboardStat;
  restarts: DashboardStat;
  turnoversWon: DashboardStat;
};

export type HtFtDashboardView = {
  period: DashboardPeriod;
  stageLabel: "HALF-TIME" | "FULL-TIME";
  /** HT: "Ballylanders lead by 3" / "Level". FT: "Ballylanders won by 3" / "Draw". Always names the team. */
  marginText: string;
  /** "Venue · League · 9 Nov 2026" — only fields the match actually has; null when none. */
  metaLine: string | null;
  restartTitle: string;
  /**
   * Set when some restarts in scope have no recorded taker. Those restarts
   * are excluded from both teams' own-retention figures, so the percentages
   * cover only the restarts whose taker is known.
   */
  restartOwnerNote: string | null;
  home: DashboardTeamView;
  away: DashboardTeamView;
};

const MATCH_TYPE_LABELS: Record<ProTaggerMatchType, string> = {
  league: "League",
  championship: "Championship",
  friendly: "Friendly",
  training: "Training",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDashboardDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function buildMetaLine(source: HtFtDashboardSource): string | null {
  const parts: string[] = [];
  const venue = source.venue?.trim();
  if (venue) parts.push(venue);
  if (source.matchType && MATCH_TYPE_LABELS[source.matchType]) parts.push(MATCH_TYPE_LABELS[source.matchType]);
  if (typeof source.createdAt === "number" && Number.isFinite(source.createdAt) && source.createdAt > 0) {
    parts.push(formatDashboardDate(source.createdAt));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function shootingStat(team: SnapshotDashboardTeam): DashboardStat {
  const { num, den, pct } = team.shooting;
  if (den === 0) return { value: NO_VALUE, detail: "No shots", ratio: null };
  return { value: `${pct}%`, detail: `${num} of ${den} ${den === 1 ? "shot" : "shots"} scored`, ratio: num / den };
}

function restartStat(team: SnapshotDashboardTeam, restartWordLower: string): DashboardStat {
  const { retained, total, pct } = team.ownKickouts;
  if (total === 0) {
    return team.restartOwnerUnknown > 0
      ? { value: NO_VALUE, detail: "Taker not recorded", ratio: null }
      : { value: NO_VALUE, detail: `No own ${restartWordLower}`, ratio: null };
  }
  return { value: `${pct}%`, detail: `${retained} of ${total} retained`, ratio: retained / total };
}

function turnoverStat(team: SnapshotDashboardTeam): DashboardStat {
  const won = team.turnovers.won;
  return { value: String(won), detail: won === 1 ? "turnover won" : "turnovers won", ratio: null };
}

function teamView(
  name: string,
  colours: { primary?: string; secondary?: string },
  defaults: { primary: string; secondary: string },
  team: SnapshotDashboardTeam,
  restartWordLower: string,
): DashboardTeamView {
  const primary = normaliseHex(colours.primary, defaults.primary);
  const secondary = normaliseHex(colours.secondary, defaults.secondary);
  return {
    name,
    monogram: teamMonogram(name),
    primary,
    secondary,
    monogramText: readableTextOn(primary),
    needsOutline: contrastRatio(primary, DASHBOARD_BG) < MIN_BG_CONTRAST,
    score: { ...team.score },
    scoreText: fmtGP(team.score.goals, team.score.points),
    totalText: `(${team.score.total})`,
    shooting: shootingStat(team),
    restarts: restartStat(team, restartWordLower),
    turnoversWon: turnoverStat(team),
  };
}

/**
 * Full-time result line from the same scored totals the Snapshot margin label
 * uses — only the tense differs: "Ballylanders won by 7" / "Draw".
 */
export function fullTimeResultLabel(model: Pick<SnapshotDashboardModel, "homeTeam" | "awayTeam" | "us" | "them">): string {
  const diff = model.us.score.total - model.them.score.total;
  if (diff === 0) return "Draw";
  return diff > 0 ? `${model.homeTeam} won by ${diff}` : `${model.awayTeam} won by ${Math.abs(diff)}`;
}

/**
 * Builds the dashboard display model. HT uses first-half events only (the
 * same pre-filter + "1H" scope as the HT Snapshot PDF); FT uses every event
 * (scope "FULL"). Score and statistics always come from the same scoped
 * report, so they can never disagree with each other.
 */
export function buildHtFtDashboardView(source: HtFtDashboardSource, period: DashboardPeriod): HtFtDashboardView {
  const scoped = period === "HT" ? source.events.filter((e) => e.period === "1H") : source.events;
  const report = buildMatchReport({
    events: toEventStatsReportEvents(scoped),
    homeTeam: source.homeTeamName,
    awayTeam: source.awayTeamName,
    scope: period === "HT" ? "1H" : "FULL",
  });
  const model = buildSnapshotDashboardModel(report, period);

  const restartWord = getRestartTerm(source.sport); // "Kickout" | "Puckout"
  const restartWordLower = `${restartWord.toLowerCase()}s`;
  // Match-wide count (the same value on both teams' model entries).
  const unknownOwner = model.us.restartOwnerUnknown;

  return {
    period,
    stageLabel: period === "HT" ? "HALF-TIME" : "FULL-TIME",
    marginText: period === "HT" ? snapshotMarginLabel(model) : fullTimeResultLabel(model),
    metaLine: buildMetaLine(source),
    restartTitle: `Own ${restartWordLower} retained`,
    restartOwnerNote:
      unknownOwner > 0
        ? `${unknownOwner} ${unknownOwner === 1 ? restartWord.toLowerCase() : restartWordLower} with no recorded taker — not included above`
        : null,
    home: teamView(source.homeTeamName, source.homeColours, DEFAULT_COLOURS.home, model.us, restartWordLower),
    away: teamView(source.awayTeamName, source.awayColours, DEFAULT_COLOURS.away, model.them, restartWordLower),
  };
}

/** "ballylanders-v-galbally-ht-dashboard.png" — ASCII-only, fadas folded. */
export function dashboardFilename(view: Pick<HtFtDashboardView, "period" | "home" | "away">): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);
  const home = slug(view.home.name) || "home";
  const away = slug(view.away.name) || "away";
  return `${home}-v-${away}-${view.period.toLowerCase()}-dashboard.png`;
}
