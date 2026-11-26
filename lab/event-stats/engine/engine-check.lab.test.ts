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
import { getFamiliesForSport, getTileLabel, resolveTileRestartOwner } from "../../../src/pro-tagger/pro-tagger-families";
import { applyReviewKindEdit, editableKindsFor } from "../../../src/pro-tagger/pro-tagger-review-edit";
import { toEventStatsReportEvents } from "../../../src/pro-tagger/pro-tagger-review-adapter";
import type { ProTaggerSport } from "../../../src/pro-tagger/pro-tagger-session";
import type { LoggedMatchEvent } from "../../../src/core/stats/saved-match";
import type { MatchEventKind } from "../../../src/core/stats/stats-event-model";
import { normalizeEventsForReporting } from "../../../src/stats/reporting/eventTagClassification";
import { buildMatchReport } from "../../../src/stats/reporting/matchReport";
import { buildTeamSummaryBlock, viewShootingConversion } from "../../../src/stats/reporting/teamStatsViews";
import type { ReportScope } from "../../../src/stats/reporting/report-types";

const LAB = new URL("../", import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, LAB), "utf8"));

type Team = "FOR" | "OPP";
type FixtureEv = {
  id: string; half: 1 | 2; clock: number; family: string; row: Team; tile: string; owner?: Team;
  player: { team: Team; number: number } | null; nx: number; ny: number;
};
type Step = { op: string; ev?: FixtureEv; undoes?: string };
type ReviewOp = { op: "edit" | "delete" | "probe"; targetId: string; newKind?: MatchEventKind; clearPlayer?: boolean; expect?: string; attemptKinds?: MatchEventKind[] };
type Fixture = {
  matchId: string; sport: "football" | "hurling"; homeTeam: string; awayTeam: string;
  squads: Record<Team, { number: number; name: string }[]>; steps: Step[]; reviewOps: ReviewOp[];
};

type Status = "PASS" | "FAIL";
type Check = { key: string; match: string; ledger: string; scope: string; team: string; stat: string; expected: unknown; actual: unknown; status: Status; classification?: string };

const SQUAD_IDS = { home: "home-squad", away: "away-squad" };
const CLASSIFICATIONS: Record<string, { category: string; evidence: string }> = readJson("engine/classifications.json").checks ?? {};

/** One fixture tap → the same ProTaggerAction the live screen builds (ProTaggerLiveScreen handleTileTap/handlePitchTap). */
function capture(fx: Fixture, sport: ProTaggerSport, ev: FixtureEv): LoggedMatchEvent {
  const family = getFamiliesForSport(sport).find((f) => f.id === ev.family);
  if (!family) throw new Error(`${ev.id}: family ${ev.family} is not offered for ${sport}`);
  const tile = family.tiles.find((t) => getTileLabel(t, sport) === ev.tile || t.label === ev.tile);
  if (!tile) throw new Error(`${ev.id}: tile ${ev.tile} not in ${ev.family}`);
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
  const sport: ProTaggerSport = fx.sport === "hurling" ? "hurling" : "gaelic";
  const byFixtureId = new Map<string, LoggedMatchEvent>();
  const order: string[] = [];
  const notes: string[] = [];
  for (const step of fx.steps) {
    if (step.op === "tag" && step.ev) {
      byFixtureId.set(step.ev.id, capture(fx, sport, step.ev));
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
  return { sport, live, final, probes, edits, notes, byFixtureId };
}

function engineFor(events: readonly LoggedMatchEvent[], fx: Fixture, scope: ReportScope) {
  const reportEvents = normalizeEventsForReporting(toEventStatsReportEvents(events));
  return buildMatchReport({ events: reportEvents, homeTeam: fx.homeTeam, awayTeam: fx.awayTeam, scope });
}

const SCOPES: [ReportScope, "FULL" | "H1" | "H2"][] = [["FULL", "FULL"], ["1H", "H1"], ["2H", "H2"]];
const ROW_MAP: Record<string, string> = { FROM_PLAY: "FROM_PLAY", PLACED: "PLACED", RESTART: "RESTART_WON", TURNOVER: "TURNOVER_WON", UNATTRIBUTED: "UNATTRIBUTED" };

function compare(fx: Fixture, ledgerName: string, events: readonly LoggedMatchEvent[]): Check[] {
  const L = readJson(`expected-authoritative/${ledgerName}.json`);
  const checks: Check[] = [];
  const add = (scope: string, team: string, stat: string, expected: unknown, actual: unknown) => {
    const key = `${ledgerName}|${scope}|${team}|${stat}`;
    const status: Status = JSON.stringify(expected) === JSON.stringify(actual) ? "PASS" : "FAIL";
    checks.push({ key, match: fx.matchId, ledger: ledgerName, scope, team, stat, expected, actual, status, classification: status === "FAIL" ? CLASSIFICATIONS[key]?.category : undefined });
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
  }
  return checks;
}

const MATCHES: { id: string; ledgers: { name: string; stage: "live" | "final" }[] }[] = [
  { id: "A", ledgers: [{ name: "ledger-A", stage: "final" }] },
  { id: "B", ledgers: [{ name: "ledger-B-live", stage: "live" }, { name: "ledger-B", stage: "final" }] },
  { id: "C", ledgers: [{ name: "ledger-C", stage: "final" }] },
];

function runAll() {
  const all: Check[] = [];
  const extras: Record<string, unknown> = {};
  for (const m of MATCHES) {
    const fx = readJson(`fixtures/match-${m.id}.json`) as Fixture;
    const played = playMatch(fx);
    extras[m.id] = { notExercised: [...new Set(played.notes)], reviewEdits: played.edits, reviewProbes: played.probes };
    for (const edit of played.edits) {
      all.push({ key: `review|${m.id}|edit ${edit.targetId}`, match: m.id, ledger: "-", scope: "-", team: "-", stat: `Review edit ${edit.targetId} accepted`, expected: true, actual: edit.ok, status: edit.ok ? "PASS" : "FAIL" });
    }
    for (const p of played.probes) {
      all.push({ key: `review|${m.id}|probe ${p.targetId}`, match: m.id, ledger: "-", scope: "-", team: "-", stat: `Review probe ${p.targetId}: listed kinds not offered`, expected: [], actual: p.forbidden, status: p.forbidden.length ? "FAIL" : "PASS" });
    }
    for (const l of m.ledgers) all.push(...compare(fx, l.name, l.stage === "live" ? played.live : played.final));
  }
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
  const defects = fails.filter((c) => c.classification === "confirmed-application-defect" || c.classification === "unresolved");
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
      "| Match | Ledger | Scope | Team | Statistic | Expected (independent) | Engine | Classification |",
      "|---|---|---|---|---|---|---|---|",
      ...fails.map((c) => `| ${c.match} | ${c.ledger} | ${c.scope} | ${c.team} | ${c.stat} | ${JSON.stringify(c.expected)} | ${JSON.stringify(c.actual)} | ${c.classification ?? "**UNCLASSIFIED**"} |`),
    ].join("\n");
    writeFileSync(new URL("out/engine-report.md", LAB), `${md}\n`);
    console.log(`ENGINE PATH: ${v.verdict} — ${v.passed}/${v.total} passed, ${v.failed} failed, ${v.unclassified} unclassified`);
  });

  it("has no failed check that is unclassified or a confirmed application defect", () => {
    const bad = all.filter((c) => c.status === "FAIL" && (!c.classification || c.classification === "confirmed-application-defect" || c.classification === "unresolved"));
    expect(bad.map((c) => `${c.key}: expected ${JSON.stringify(c.expected)}, engine ${JSON.stringify(c.actual)}`)).toEqual([]);
  });
});
