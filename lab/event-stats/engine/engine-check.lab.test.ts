// Guardian V1 — Event Stats laboratory: ENGINE PATH.
//
// Feeds each synthetic match (fixtures/match-*.json) into the CURRENT production
// statistics engine exactly as the live Event Stats screen does — the same family
// table, tile labels, restart-owner rule and capture adapter — applies the match's
// undo and Review operations through the production Review Edit rules, and compares
// the engine's figures with the INDEPENDENT ledgers in expected-authoritative/
// (computed by scripts/reference*.mjs, which import nothing from src/).
//
// The comparison never adjusts an expected value. Every mismatch is reported, and
// listed with its classification (classifications.json) or as UNCLASSIFIED.
// Output: lab/event-stats/out/engine-report.{json,md} (git-ignored).
//
// Not exercised on this path (browser path only): pauses, reloads, tab close,
// storage failure, substitutions, the live clock and the PDFs themselves.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { adaptProTaggerAction } from "../../../src/pro-tagger/pro-tagger-adapter";
import { getFamiliesForSport, getFamilyLabel, getFamilyTiles, getTileLabel, resolveTileRestartOwner } from "../../../src/pro-tagger/pro-tagger-families";
import { buildDisciplineStatusMap } from "../../../src/pro-tagger/pro-tagger-discipline";
import { authoritativeLedger } from "../scripts/reference-kickout-phase.mjs";
import { applyReviewKindEdit, editableKindsFor } from "../../../src/pro-tagger/pro-tagger-review-edit";
import { toEventStatsReportEvents } from "../../../src/pro-tagger/pro-tagger-review-adapter";
import type { ProTaggerSport } from "../../../src/pro-tagger/pro-tagger-session";
import type { LoggedMatchEvent } from "../../../src/core/stats/saved-match";
import type { MatchEventKind } from "../../../src/core/stats/stats-event-model";
import { normalizeEventsForReporting } from "../../../src/stats/reporting/eventTagClassification";
import { buildMatchReport } from "../../../src/stats/reporting/matchReport";
import { buildTeamSummaryBlock, viewCoachingScoringRuns, viewShootingConversion } from "../../../src/stats/reporting/teamStatsViews";
import type { ReportScope } from "../../../src/stats/reporting/report-types";
import { viewScoringPossessionOrigins } from "../../../src/stats/reporting/scoringBreakdownViews";
import { collectPlayerStats, computeDisciplineCounts, type PdfExportEvent, type PdfSquadPlayer } from "../../../src/stats/reviewPdfExport";
import { computeProTaggerCounts } from "../../../src/pro-tagger/ProTaggerLiveScreen";
import { deriveReviewPrompts } from "../../../src/stats/chains/review-prompts";

const LAB = new URL("../", import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, LAB), "utf8"));

type Team = "FOR" | "OPP";
type FixtureEv = {
  id: string; half: 1 | 2; clock: number; family: string; row: Team; tile: string; owner?: Team;
  player: { team: Team; number: number } | null; nx: number; ny: number; erroneous?: boolean;
};
type Step = { op: string; ev?: FixtureEv; undoes?: string };
type ReviewOp = { op: "edit" | "delete" | "probe"; targetId: string; newKind?: MatchEventKind; clearPlayer?: boolean; expect?: string; attemptKinds?: MatchEventKind[] };
type Fixture = {
  matchId: string; sport: "football" | "hurling" | "ladies_football" | "camogie"; homeTeam: string; awayTeam: string; halfMinutes?: number;
  squads: Record<Team, { number: number; name: string }[]>; steps: Step[]; reviewOps: ReviewOp[];
};

type Status = "PASS" | "FAIL";
type Check = { key: string; match: string; ledger: string; scope: string; team: string; stat: string; expected: unknown; actual: unknown; status: Status; classification?: string; finding?: string; effect?: "direct" | "downstream" };

const SQUAD_IDS = { home: "home-squad", away: "away-squad" };
const CLASSIFICATIONS: Record<string, { category: string; evidence: string; finding?: string }> = readJson("engine/classifications.json").checks ?? {};
/** Exact key, or a "re:<regex>" entry (Golden Matches E and F register findings by pattern). */
function classify(key: string): { category: string; finding?: string } | undefined {
  if (CLASSIFICATIONS[key]) return CLASSIFICATIONS[key];
  const hit = Object.entries(CLASSIFICATIONS).find(([k]) => k.startsWith("re:") && new RegExp(k.slice(3)).test(key));
  return hit?.[1];
}
const SPORT_RULES = readJson("rules/sport-rules.json").sports as Record<string, { captureProbes?: { family: string; familyLabel: string; present: string[]; absent: string[]; rule: string }[] }>;
/** Laboratory sport → the app's sport. */
const APP_SPORT: Record<Fixture["sport"], ProTaggerSport> = { football: "gaelic", hurling: "hurling", ladies_football: "ladies_football", camogie: "camogie" };

/** One fixture tap → the same ProTaggerAction the live screen builds (ProTaggerLiveScreen handleTileTap/handlePitchTap). */
function capture(fx: Fixture, sport: ProTaggerSport, ev: FixtureEv): LoggedMatchEvent | { notOffered: string } {
  // An event the app does not offer is reported and left out — never replaced by another event.
  const family = getFamiliesForSport(sport).find((f) => f.id === ev.family);
  if (!family) return { notOffered: `family ${ev.family} is not offered for ${sport}` };
  const tile = getFamilyTiles(family, sport).find((t) => getTileLabel(t, sport) === ev.tile || t.label === ev.tile);
  if (!tile) return { notOffered: `tile ${ev.tile} is not offered in ${ev.family} for ${sport}` };
  const p = ev.player;
  const squadPlayer = p ? fx.squads[p.team].find((s) => s.number === p.number) : null;
  return adaptProTaggerAction({
    familyId: family.id,
    tileLabel: getTileLabel(tile, sport),
    teamSide: ev.row,
    restartOwner: resolveTileRestartOwner(family, ev.row, ev.owner ?? ev.row),
    nx: ev.nx,
    ny: ev.ny,
    half: ev.half,
    matchClockSeconds: ev.clock,
    ...(p
      ? {
          playerId: `${p.team === "FOR" ? "home" : "away"}-${p.number}`,
          playerName: squadPlayer?.name || undefined,
          playerNumber: p.number,
          squadId: p.team === "FOR" ? SQUAD_IDS.home : SQUAD_IDS.away,
        }
      : {}),
  });
}

/** Captured events (after undo) and, separately, after the Review operations. */
function playMatch(fx: Fixture) {
  const sport: ProTaggerSport = APP_SPORT[fx.sport];
  const byFixtureId = new Map<string, LoggedMatchEvent>();
  const order: string[] = [];
  const notes: string[] = [];
  const blocked: { id: string; family: string; tile: string; reason: string }[] = [];
  for (const step of fx.steps) {
    if (step.op === "tag" && step.ev) {
      const got = capture(fx, sport, step.ev);
      if ("notOffered" in got) { if (!step.ev.erroneous) blocked.push({ id: step.ev.id, family: step.ev.family, tile: step.ev.tile, reason: got.notOffered }); continue; }
      byFixtureId.set(step.ev.id, got);
      order.push(step.ev.id);
    } else if (step.op === "undo" && step.undoes) {
      if (!byFixtureId.delete(step.undoes)) throw new Error(`undo of unknown ${step.undoes}`);
    } else {
      notes.push(step.op);
    }
  }
  const live = order.filter((id) => byFixtureId.has(id)).map((id) => byFixtureId.get(id)!);

  const reviewed = new Map(byFixtureId);
  const probes: { targetId: string; offered: MatchEventKind[]; forbidden: MatchEventKind[] }[] = [];
  const edits: { targetId: string; ok: boolean; reason: string | null }[] = [];
  for (const op of fx.reviewOps) {
    const ev = reviewed.get(op.targetId);
    if (!ev && blocked.some((b) => b.id === op.targetId)) { notes.push(`review ${op.op} skipped: target ${op.targetId} could not be entered`); continue; }
    if (!ev) throw new Error(`review op on unknown ${op.targetId}`);
    if (op.op === "delete") reviewed.delete(op.targetId);
    else if (op.op === "probe") {
      const offered = editableKindsFor(ev, sport);
      probes.push({ targetId: op.targetId, offered, forbidden: (op.attemptKinds ?? []).filter((k) => offered.includes(k)) });
    } else if (op.op === "edit" && op.newKind) {
      const base: LoggedMatchEvent = op.clearPlayer ? { ...ev, playerId: undefined, playerName: undefined, playerNumber: undefined } : ev;
      const out = applyReviewKindEdit(base, op.newKind, sport, Boolean(base.playerId), SQUAD_IDS);
      edits.push({ targetId: op.targetId, ok: out.ok, reason: out.reason });
      if (out.ok) reviewed.set(op.targetId, out.event);
    }
  }
  const final = order.filter((id) => reviewed.has(id)).map((id) => reviewed.get(id)!);
  return { sport, live, final, probes, edits, notes, byFixtureId, blocked };
}

function engineFor(events: readonly LoggedMatchEvent[], fx: Fixture, scope: ReportScope) {
  const reportEvents = normalizeEventsForReporting(toEventStatsReportEvents(events));
  return buildMatchReport({ events: reportEvents, homeTeam: fx.homeTeam, awayTeam: fx.awayTeam, scope });
}

const SCOPES: [ReportScope, "FULL" | "H1" | "H2"][] = [["FULL", "FULL"], ["1H", "H1"], ["2H", "H2"]];
const ROW_MAP: Record<string, string> = { FROM_PLAY: "FROM_PLAY", PLACED: "PLACED", RESTART: "RESTART_WON", TURNOVER: "TURNOVER_WON", UNATTRIBUTED: "UNATTRIBUTED" };

function compare(fx: Fixture, ledgerName: string, events: readonly LoggedMatchEvent[], ledger?: Record<string, any>): Check[] {
  const L = ledger ?? readJson(`expected-authoritative/${ledgerName}.json`);
  const checks: Check[] = [];
  const add = (scope: string, team: string, stat: string, expected: unknown, actual: unknown) => {
    const key = `${ledgerName}|${scope}|${team}|${stat}`;
    const status: Status = JSON.stringify(expected) === JSON.stringify(actual) ? "PASS" : "FAIL";
    const c = status === "FAIL" ? classify(key) : undefined;
    checks.push({ key, match: fx.matchId, ledger: ledgerName, scope, team, stat, expected, actual, status, classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined });
  };

  for (const [scope, lk] of SCOPES) {
    const report = engineFor(events, fx, scope);
    const S = L[lk];
    add(lk, "-", "event count", S.eventCount, report.events.length);
    for (const team of ["FOR", "OPP"] as const) {
      const T = S[team];
      const b = buildTeamSummaryBlock(report, team);
      const line = team === "FOR" ? report.ledger.forScore : report.ledger.oppScore;
      add(lk, team, "goals", T.score.goals, b.goals);
      add(lk, team, "score total (points value)", T.score.total, b.scoreTotal);
      add(lk, team, "score line total (ledger)", T.score.total, line.total);
      add(lk, team, "two-point scores", T.twoPointScores, b.twoPointers);
      const conv = viewShootingConversion(report, team);
      add(lk, team, "scores / attempts", `${T.conversion.num}/${T.conversion.den}`, `${conv.num}/${conv.den}`);
      add(lk, team, "attempts (summary block)", T.conversion.den, b.shots);
      add(lk, team, "shooting % label", T.conversion.pct === null ? "—" : `${T.conversion.pct}%`, b.conv);
      add(lk, team, "wides", T.wides, b.wides);
      add(lk, team, "shots short", T.shotShort, b.shotShort);
      add(lk, team, "shots post", T.shotPost, b.shotPost);
      add(lk, team, "shots blocked / saved", T.shotBlockSave, b.shotBlock);
      add(lk, team, "own restarts retained", T.ownRestarts.retained, b.ownRestartsRetained);
      add(lk, team, "own restarts lost", T.ownRestarts.lost, b.ownRestartsLost);
      add(lk, team, "restart share won", T.restartsWon, b.restartShareWon);
      add(lk, team, "restart share conceded", T.restartsLost, b.restartShareConceded);
      add(lk, team, "turnovers won", T.turnoversWon, b.toWon);
      add(lk, team, "turnovers lost", T.turnoversLost, b.toLost);
      add(lk, team, "frees won", T.freesWon, b.freesWon);
      add(lk, team, "frees conceded", T.freesConceded, b.freesCon);
      add(lk, team, "placed-ball attempts", T.placed.attempts, b.placedAttempts);
      add(lk, team, "placed-ball scores", T.placed.scores, b.placedScores);
      add(lk, team, "placed-ball points value", T.placed.pointsValue, b.placedPoints);
      add(lk, team, "placed-ball misses", T.placed.misses, b.placedMisses);
      add(lk, team, "45s / 65s awarded", T.fortyFivesWon, b.shot45);
    }
    // Score origins (ledger partition): count and value per row, both teams.
    for (const [refRow, engineRow] of Object.entries(ROW_MAP)) {
      const r = S.origins.rows[refRow] ?? { FOR: 0, OPP: 0, FORn: 0, OPPn: 0 };
      const e = report.ledger.rows.find((x) => x.id === engineRow);
      add(lk, "FOR", `origin ${refRow}: scores`, r.FORn, e?.us.scores ?? 0);
      add(lk, "FOR", `origin ${refRow}: value`, r.FOR, e?.us.value ?? 0);
      add(lk, "OPP", `origin ${refRow}: scores`, r.OPPn, e?.them.scores ?? 0);
      add(lk, "OPP", `origin ${refRow}: value`, r.OPP, e?.them.value ?? 0);
    }

    for (const team of ["FOR", "OPP"] as const) {
      const T = S[team];
      const b = buildTeamSummaryBlock(report, team);
      // Kickout / puckout methods: every restart the team won or lost (own and opposition).
      add(lk, team, "restarts won clean", T.restartMethods.wonClean, b.koCleanWon);
      add(lk, team, "restarts won from a break", T.restartMethods.wonBreak, b.koBreakWon);
      add(lk, team, "restarts won from a foul", T.restartMethods.wonFoul, b.koFoulWon);
      add(lk, team, "restarts lost clean", T.restartMethods.lostClean, b.koCleanLost);
      add(lk, team, "restarts lost from a break", T.restartMethods.lostBreak, b.koBreakLost);
      add(lk, team, "restarts lost from a foul", T.restartMethods.lostFoul, b.koFoulCon);
      // Discipline (Intelligence Summary team comparison).
      const d = computeDisciplineCounts(report.events as unknown as PdfExportEvent[], team);
      add(lk, team, "yellow cards", T.cards.yellow, d.yellowCards);
      add(lk, team, "sin bins", T.cards.sinBin, d.sinBins);
      add(lk, team, "red cards", T.cards.red, d.redCards);
      // Possession origins of the team's scores (Scoring Origins / coaching brief).
      const o = viewScoringPossessionOrigins(report, team);
      const C = S.chains[team];
      for (const [name, eng, ref] of [["restart", o.restartOrigin, C.origins.restartOrigin], ["turnover", o.turnoverOrigin, C.origins.turnoverOrigin]] as const) {
        add(lk, team, `${name}-origin scores: goals / points / 2-pointers`, [ref.goals, ref.points, ref.twoPointers], [eng.goals, eng.points, eng.twoPointers]);
      }
    }

    // Restart and turnover chain metrics (engine computes them from the home team's view).
    const CF = S.chains.FOR, CO = S.chains.OPP;
    const fr = (f: { num: number; den: number }) => `${f.num}/${f.den}`;
    add(lk, "FOR", "restarts won → score", fr(CF.restartWonToScore), fr(report.restarts.restartToScore));
    add(lk, "FOR", "restarts lost → opposition score", fr(CF.restartLostToScoreAgainst), fr(report.restarts.restartLossPunishment));
    add(lk, "OPP", "restarts won → score (= home restarts lost → opposition score)", fr(CO.restartWonToScore), fr(report.restarts.restartLossPunishment));
    add(lk, "FOR", "own restart retention", fr(S.FOR.ownRestarts.retention), fr(report.restarts.ownKickoutRetention.full));
    add(lk, "FOR", "opposition restarts won", fr(S.FOR.oppRestarts.winRate), fr(report.restarts.oppKickoutWinRate.full));
    add(lk, "FOR", "restart share", fr(S.FOR.restartShare), fr(report.restarts.restartShare.full));
    add(lk, "FOR", "avg seconds restart → score", CF.avgSecsToScoreWon ?? null, report.restarts.avgSecondsToScore.FOR);
    add(lk, "OPP", "avg seconds restart → score", CO.avgSecsToScoreWon ?? null, report.restarts.avgSecondsToScore.OPP);
    add(lk, "FOR", "turnover share", fr(S.FOR.turnoverShare), fr(report.turnovers.turnoverShare.full));
    add(lk, "FOR", "turnovers won → score", fr(CF.turnoverWonToScore), fr(report.turnovers.turnoverWinsToScore));
    add(lk, "FOR", "turnovers lost → opposition score", fr(CF.turnoverLostToScoreAgainst), fr(report.turnovers.turnoverLossPunishment));
    add(lk, "FOR", "turnovers won → attempt, no score", fr(CF.turnoverWonAttemptNoScore), fr(report.turnovers.turnoverWonToShotOnly));
    // Longest scoring run per team (count of consecutive scores).
    const runs = viewCoachingScoringRuns(report);
    add(lk, "FOR", "longest scoring run (scores)", S.longestRun.FOR, runs.longestFor?.count ?? 0);
    add(lk, "OPP", "longest scoring run (scores)", S.longestRun.OPP, runs.longestOpp?.count ?? 0);
  }

  // ── FULL-match only: live counts strip, players, wording ──
  const full = engineFor(events, fx, "FULL");
  const F = L.FULL;
  // Live screen counts strip (computeProTaggerCounts), on the stored events.
  for (const team of ["FOR", "OPP"] as const) {
    const c = computeProTaggerCounts(events, team);
    const T = F[team];
    add("FULL", team, "live strip: goals", T.goals, c.goals);
    add("FULL", team, "live strip: 1-point scores", T.pointScores, c.points);
    add("FULL", team, "live strip: 2-pointers", T.twoPointScores, c.twoPointers);
    add("FULL", team, "live strip: shots (all attempts)", T.conversion.den, c.shots);
    add("FULL", team, "live strip: wides", T.wides, c.wides);
    add("FULL", team, "live strip: turnovers won", T.turnoversWon, c.turnoverWon);
    add("FULL", team, "live strip: restarts won", T.restartsWon, c.kickoutWon);
    add("FULL", team, "live strip: 45s / 65s won", T.fortyFivesWon, c.fortyFiveWon);
    add("FULL", team, "live strip: sidelines won", T.sidelinesWon, c.sidelineWon);
    add("FULL", team, "live strip: yellow cards", T.cards.yellow, c.yellowCards);
    add("FULL", team, "live strip: sin bins", T.cards.sinBin, c.sinBins);
    add("FULL", team, "live strip: red cards", T.cards.red, c.redCards);
    // Every free is stored on the home row (kind says who won it), so the strip's frees are home-row figures.
    if (team === "FOR") {
      add("FULL", team, "live strip: frees won", T.freesWon, c.freeWon);
      add("FULL", team, "live strip: frees conceded", T.freesConceded, c.freeConceded);
    }
  }

  // Player table (Full Review player pages, collectPlayerStats) vs the reference player table.
  const squad = (team: Team): PdfSquadPlayer[] =>
    fx.squads[team].map((p) => ({ id: `${team === "FOR" ? "home" : "away"}-${p.number}`, number: p.number, name: p.name }));
  const enginePlayers = collectPlayerStats(full.events as unknown as PdfExportEvent[], squad("FOR"), squad("OPP")).filter((p) => p.actions > 0);
  const refPlayers: Record<string, number | string>[] = L.players;
  const pkey = (team: string, n: number | null) => `${team} #${n}`;
  const engineByKey = new Map(enginePlayers.map((p) => [pkey(p.teamSide, p.number), p]));
  add("FULL", "-", "players with at least one tagged action", refPlayers.map((p) => pkey(String(p.team), Number(p.number))).sort(), [...engineByKey.keys()].sort());
  for (const r of refPlayers) {
    const e = engineByKey.get(pkey(String(r.team), Number(r.number)));
    const who = `player ${pkey(String(r.team), Number(r.number))}`;
    const pairs: [string, unknown, unknown][] = [
      ["actions", r.actions, e?.actions], ["goals", r.goals, e?.goals], ["points value (excl. goals)", r.pointsValue, e?.scorePoints],
      ["total value", r.totalValue, e?.scoreTotal], ["attempts", r.attempts, e?.shots], ["wides", r.wides, e?.wides],
      ["turnovers won", r.toWon, e?.toWon], ["turnovers lost", r.toLost, e?.toLost],
      ["restarts won", r.koWon, e?.koWon], ["restarts lost", r.koLost, e?.koCon],
      ["frees won", r.freesWon, e?.freesWon], ["frees conceded", r.freesConceded, e?.freesCon],
    ];
    for (const [stat, exp, act] of pairs) add("FULL", String(r.team), `${who}: ${stat}`, exp, act ?? null);
  }

  // Intelligence wording: written rules, not engine values.
  // The PDF / prompt sport: ladies' football reports as football (pro-tagger-review-adapter).
  const sport = fx.sport === "hurling" || fx.sport === "camogie" ? fx.sport : "gaelic";
  const prompts = deriveReviewPrompts(full.chain, fx.homeTeam, fx.awayTeam, sport);
  const home = fx.homeTeam.slice(0, 18), away = fx.awayTeam.slice(0, 18);
  add("FULL", "-", "intelligence prompts produced", true, prompts.length > 0);
  add("FULL", "-", "every prompt names a team (CLAUDE.md attribution rule)", [], prompts.filter((p) => !p.text.includes(home) && !p.text.includes(away)).map((p) => p.text));
  add("FULL", "-", "every prompt states a number", [], prompts.filter((p) => !/\d/.test(p.text)).map((p) => p.text));
  if (fx.sport === "hurling" || fx.sport === "camogie") {
    add("FULL", "-", `${fx.sport} prompts: no kickout / 2-pointer wording`, [], prompts.filter((p) => /kick-?out|2-?point|two-?point/i.test(p.text)).map((p) => p.text));
  }
  // Coverage of the "net restart disadvantage" sentence (the only one using the singular restart
  // term): wherever the REFERENCE shows the home team's restart conversion trailing its restart-loss
  // punishment by more than 10 points (≥ 3 restarts), that sentence must be produced.
  const conv = F.chains.FOR.restartWonToScore, punish = F.chains.FOR.restartLostToScoreAgainst;
  if (F.FOR.restartsWon + F.FOR.restartsLost >= 3 && conv.pct !== null && punish.pct !== null && conv.pct - punish.pct < -10) {
    add("FULL", "FOR", `net restart disadvantage sentence produced (reference: ${conv.pct}% vs ${punish.pct}%)`, true,
      prompts.some((p) => p.text.includes("of their losses produced restart-origin point value")));
  }
  return checks;
}

const MATCHES: { id: string; ledgers: { name: string; stage: "live" | "final" }[] }[] = [
  { id: "A", ledgers: [{ name: "ledger-A", stage: "final" }] },
  { id: "B", ledgers: [{ name: "ledger-B-live", stage: "live" }, { name: "ledger-B", stage: "final" }] },
  { id: "C", ledgers: [{ name: "ledger-C", stage: "final" }] },
  { id: "D", ledgers: [{ name: "ledger-D-live", stage: "live" }, { name: "ledger-D", stage: "final" }] },
  { id: "E", ledgers: [{ name: "ledger-E-live", stage: "live" }, { name: "ledger-E", stage: "final" }] },
  { id: "F", ledgers: [{ name: "ledger-F-live", stage: "live" }, { name: "ledger-F", stage: "final" }] },
];

/**
 * Capture options the rules require (rules/sport-rules.json → captureProbes): every listed tile
 * present in, or absent from, the family the live screen renders for the sport.
 */
function captureOptionChecks(fx: Fixture): Check[] {
  const sport = APP_SPORT[fx.sport];
  const checks: Check[] = [];
  for (const probe of SPORT_RULES[fx.sport]?.captureProbes ?? []) {
    const family = getFamiliesForSport(sport).find((f) => f.id === probe.family);
    const labels = family ? getFamilyTiles(family, sport).map((t) => getTileLabel(t, sport)) : [];
    const add = (stat: string, ok: boolean, actual: unknown) => {
      const key = `options|${fx.sport}|${probe.family}|${stat}`;
      const c = ok ? undefined : classify(key);
      checks.push({ key, match: fx.matchId, ledger: "-", scope: "-", team: "-", stat: `capture option ${probe.family}: ${stat} (${probe.rule})`, expected: true, actual, status: ok ? "PASS" : "FAIL", classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined });
    };
    add("family offered", family != null, family ? getFamilyLabel(family, sport) : "not offered");
    for (const t of probe.present) add(`tile "${t}" offered`, labels.includes(t), labels);
    for (const t of probe.absent) add(`tile "${t}" not offered`, !labels.includes(t), labels);
  }
  return checks;
}

/**
 * Constructed LGFA discipline probes (Official Guide 2026 Rule 327): the live screen's sanction
 * status (buildDisciplineStatusMap) at the moments the rule fixes — shorter halves and the
 * half-time carry-over (a sin bin counts playing time across the interval).
 */
function disciplineProbeChecks(): Check[] {
  const fx = readJson("fixtures/match-E.json") as Fixture;
  const sport = APP_SPORT[fx.sport];
  const card = (id: string, tile: string, half: 1 | 2, clock: number, number: number): LoggedMatchEvent => {
    const got = capture(fx, sport, { id, half, clock, family: "DISCIPLINE", row: "FOR", tile, player: { team: "FOR", number }, nx: 0.5, ny: 0.5 });
    if ("notOffered" in got) throw new Error(got.notOffered);
    return got;
  };
  const probes: { name: string; events: LoggedMatchEvent[]; at: ["1H" | "2H", number]; expected: string | null; note: string }[] = [
    { name: "30-min halves: first yellow at 10:00 — sin bin active at 19:59", events: [card("p1", "Yellow", 1, 600, 6)], at: ["1H", 1199], expected: "SIN_BIN", note: "10 minutes in games of one hour" },
    { name: "30-min halves: first yellow at 10:00 — sin bin over at 20:00", events: [card("p1", "Yellow", 1, 600, 6)], at: ["1H", 1200], expected: null, note: "10 minutes in games of one hour" },
    { name: "25-min halves: first yellow at 10:00 — sin bin active at 14:59", events: [card("p2", "Yellow", 1, 600, 6)], at: ["1H", 899], expected: "SIN_BIN", note: "5 minutes where less than 30 minutes a half" },
    { name: "25-min halves: first yellow at 10:00 — sin bin over at 15:00", events: [card("p2", "Yellow", 1, 600, 6)], at: ["1H", 900], expected: null, note: "5 minutes where less than 30 minutes a half" },
    { name: "15-min halves: first yellow at 05:00 — sin bin active at 07:59", events: [card("p3", "Yellow", 1, 300, 6)], at: ["1H", 479], expected: "SIN_BIN", note: "3 minutes where 15 minutes or less per half" },
    { name: "15-min halves: first yellow at 05:00 — sin bin over at 08:00", events: [card("p3", "Yellow", 1, 300, 6)], at: ["1H", 480], expected: null, note: "3 minutes where 15 minutes or less per half" },
    { name: "first yellow at 27:00 of a 30-min first half (ended 30:00) — 7 minutes left: active at 2H 06:59", events: [card("p4", "Yellow", 1, 1620, 6)], at: ["2H", 419], expected: "SIN_BIN", note: "playing time carries across half-time" },
    { name: "first yellow at 27:00 of a 30-min first half (ended 30:00) — over at 2H 07:00", events: [card("p4", "Yellow", 1, 1620, 6)], at: ["2H", 420], expected: null, note: "playing time carries across half-time" },
    { name: "historical Sin Bin at 27:00 of a 30-min first half (ended 30:00) — over at 2H 07:00", events: [card("p5", "Sin Bin", 1, 1620, 6)], at: ["2H", 420], expected: null, note: "existing half-time behaviour: playing time carries across half-time" },
    { name: "second yellow — dismissed", events: [card("p6a", "Yellow", 1, 300, 6), card("p6b", "Yellow", 2, 300, 6)], at: ["2H", 900], expected: "RED", note: "second yellow followed by a red card" },
  ];
  return probes.map((p) => {
    const status = buildDisciplineStatusMap(p.events, p.at[0], p.at[1]).get("home-6") ?? null;
    const key = `discipline|ladies_football|${p.name}`;
    const ok = status === p.expected;
    const c = ok ? undefined : classify(key);
    return { key, match: "E", ledger: "-", scope: p.at.join(" "), team: "FOR", stat: `discipline probe: ${p.name} (Rule 327: ${p.note})`, expected: p.expected, actual: status, status: ok ? "PASS" : "FAIL", classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined } as Check;
  });
}

function runAll() {
  const all: Check[] = [];
  const extras: Record<string, unknown> = {};
  for (const m of MATCHES) {
    const fx = readJson(`fixtures/match-${m.id}.json`) as Fixture;
    const played = playMatch(fx);
    extras[m.id] = { notExercised: [...new Set(played.notes)], reviewEdits: played.edits, reviewProbes: played.probes };
    for (const edit of played.edits) {
      const key = `review|${m.id}|edit ${edit.targetId}`, c = edit.ok ? undefined : classify(key);
      all.push({ key, match: m.id, ledger: "-", scope: "-", team: "-", stat: `Review edit ${edit.targetId} accepted`, expected: true, actual: edit.ok, status: edit.ok ? "PASS" : "FAIL", classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined });
    }
    for (const p of played.probes) {
      const key = `review|${m.id}|probe ${p.targetId}`, c = p.forbidden.length ? classify(key) : undefined;
      all.push({ key, match: m.id, ledger: "-", scope: "-", team: "-", stat: `Review probe ${p.targetId}: listed kinds not offered`, expected: [], actual: p.forbidden, status: p.forbidden.length ? "FAIL" : "PASS", classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined });
    }
    // Fixture events the app could not record: each is a direct failure (registered by family/tile).
    for (const b of played.blocked) {
      const key = `capture|${m.id}|${b.family}/${b.tile}`;
      const c = classify(key);
      all.push({ key: `${key}|${b.id}`, match: m.id, ledger: "-", scope: "-", team: "-", stat: `event ${b.id} (${b.family} / ${b.tile}) can be entered — ${b.reason}`, expected: true, actual: false, status: "FAIL", classification: c?.category, finding: c?.finding, effect: c ? "direct" : undefined });
    }
    for (const l of m.ledgers) {
      const events = l.stage === "live" ? played.live : played.final;
      const checks = compare(fx, l.name, events);
      if (played.blocked.length) {
        // Downstream of the missing events: a check that fails against the full independent ledger
        // but passes against the same reference computed without the events the app could not
        // record. Anything else is a direct difference and needs its own classification.
        const reduced = authoritativeLedger({ ...fx, ...(l.stage === "live" ? { reviewOps: [] } : {}), excludeIds: played.blocked.map((b) => b.id) }).ledger;
        const passesReduced = new Set(compare(fx, l.name, events, reduced).filter((c) => c.status === "PASS").map((c) => c.key));
        const blockedBy = [...new Set(played.blocked.map((b) => classify(`capture|${m.id}|${b.family}/${b.tile}`)?.finding ?? "unregistered capture failure"))].join("+");
        for (const c of checks) if (c.status === "FAIL" && !c.classification && passesReduced.has(c.key)) Object.assign(c, { classification: "downstream-of-capture-defect", finding: blockedBy, effect: "downstream" });
      }
      all.push(...checks);
    }
    all.push(...captureOptionChecks(fx));
  }
  all.push(...disciplineProbeChecks());
  // Every difference VALIDATION.json records must have an entry in the classification register.
  const validation = readJson("expected-authoritative/VALIDATION.json") as Record<string, { wrong: { restart: string; score: string }[] }>;
  const historical = (readJson("engine/classifications.json").historicalValidation ?? {}) as Record<string, unknown>;
  const unregistered = Object.entries(validation).flatMap(([ledger, v]) => v.wrong.map((w) => `${ledger}: ${w.restart} → ${w.score}`)).filter((k) => !(k in historical));
  all.push({ key: "register|VALIDATION", match: "-", ledger: "VALIDATION.json", scope: "-", team: "-", stat: "every recorded validation difference is classified", expected: [], actual: unregistered, status: unregistered.length ? "FAIL" : "PASS" });

  // Information only: what today's Review Edit rules say about the planned Review edits that
  // were not performed in the as-run match B (fixtures/match-B.planned.json vs match-B.json).
  const planned = readJson("fixtures/match-B.planned.json") as Fixture;
  const asRun = readJson("fixtures/match-B.json") as Fixture;
  const asRunOps = new Set(asRun.reviewOps.map((o) => JSON.stringify(o)));
  const playedB = playMatch(asRun);
  extras.plannedButNotPerformed = planned.reviewOps
    .filter((o) => !asRunOps.has(JSON.stringify(o)) && o.op === "edit" && o.newKind)
    .map((o) => {
      const ev = playedB.byFixtureId.get(o.targetId)!;
      const out = applyReviewKindEdit(ev, o.newKind!, playedB.sport, Boolean(ev.playerId), SQUAD_IDS);
      return { targetId: o.targetId, from: ev.kind, to: o.newKind, offered: editableKindsFor(ev, playedB.sport).includes(o.newKind!), accepted: out.ok, reason: out.reason };
    });
  return { all, extras };
}

function verdict(checks: Check[]) {
  const fails = checks.filter((c) => c.status === "FAIL");
  const unclassified = fails.filter((c) => !c.classification);
  const defects = fails.filter((c) => c.classification === "confirmed-application-defect" || c.classification === "unresolved" || c.classification === "downstream-of-capture-defect");
  return { total: checks.length, passed: checks.length - fails.length, failed: fails.length, unclassified: unclassified.length, verdict: fails.length === 0 ? "GREEN" : unclassified.length || defects.length ? "RED" : "AMBER" };
}

describe("Event Stats laboratory — engine path vs independent ledgers", () => {
  const { all, extras } = runAll();
  const v = verdict(all);

  it("writes a deterministic report", () => {
    const again = runAll();
    expect(JSON.stringify(again.all)).toBe(JSON.stringify(all)); // repeated execution is identical
    mkdirSync(new URL("out/", LAB), { recursive: true });
    writeFileSync(new URL("out/engine-report.json", LAB), JSON.stringify({ ...v, extras, checks: all }, null, 1));
    const fails = all.filter((c) => c.status === "FAIL");
    const md = [
      `# Engine path — ${v.verdict}`,
      "",
      `${v.passed}/${v.total} checks passed; ${v.failed} failed (${v.unclassified} unclassified).`,
      "",
      "| Match | Ledger | Scope | Team | Statistic | Expected (independent) | Engine | Classification | Finding | Effect |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...fails.map((c) => `| ${c.match} | ${c.ledger} | ${c.scope} | ${c.team} | ${c.stat} | ${JSON.stringify(c.expected)} | ${JSON.stringify(c.actual)} | ${c.classification ?? "**UNCLASSIFIED**"} | ${c.finding ?? ""} | ${c.effect ?? ""} |`),
    ].join("\n");
    writeFileSync(new URL("out/engine-report.md", LAB), `${md}\n`);
    console.log(`ENGINE PATH: ${v.verdict} — ${v.passed}/${v.total} passed, ${v.failed} failed, ${v.unclassified} unclassified`);
  });

  it("has no failed check that is unclassified or a confirmed application defect", () => {
    const bad = all.filter((c) => c.status === "FAIL" && (!c.classification || c.classification === "confirmed-application-defect" || c.classification === "unresolved" || c.classification === "downstream-of-capture-defect"));
    expect(bad.map((c) => `${c.key}: expected ${JSON.stringify(c.expected)}, engine ${JSON.stringify(c.actual)}`)).toEqual([]);
  });
});
