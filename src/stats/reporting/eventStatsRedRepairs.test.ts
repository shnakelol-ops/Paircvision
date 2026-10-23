/**
 * eventStatsRedRepairs.test.ts
 *
 * Regression tests for the Event Stats Ultra Test RED findings F-01 – F-06.
 * Events are built through the real Event Stats capture adapter
 * (adaptProTaggerAction), so these exercise the stored encoding — not
 * hand-written kinds/tags.
 */

import { describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { toEventStatsReportEvents } from "../../pro-tagger/pro-tagger-review-adapter";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { analyseChains } from "../chains/chain-engine";
import { eventSource } from "../eventSource";
import { isPlacedMiss, isPlacedScore, buildDirectScoringBreakdown } from "../ledger/scoreLedger";
import { collectPlayerStats } from "../reviewPdfExport";
import { isOwnRestartRetained, resolveRestartOwner } from "../restarts/restartMetrics";
import {
  isBlockedOrSavedAttempt,
  normalizeEventsForReporting,
  reportTagsFor,
  withReportTags,
} from "./eventTagClassification";
import { buildMatchReport } from "./matchReport";
import { buildQuickReviewMatchOverview } from "./quickReviewMatchOverview";
import { buildSnapshotDashboardModel } from "./snapshotDashboardModel";
import { buildTeamSummaryBlock } from "./teamStatsViews";

let clock = 0;
function tap(a: Partial<ProTaggerAction> & Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide">): LoggedMatchEvent {
  clock += 10;
  return adaptProTaggerAction({ nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: clock, ...a });
}
const report = (events: readonly Parameters<typeof buildMatchReport>[0]["events"][number][]) =>
  buildMatchReport({ events, homeTeam: "Home", awayTeam: "Away" });

// ─── F-01 — tag translation ──────────────────────────────────────────────────

describe("F-01 — Event Stats tags are translated to report classifications", () => {
  it("translates by kind, keeping the stored tag", () => {
    expect(reportTagsFor("TURNOVER_WON", ["INTERCEPTION"])).toEqual(["INTERCEPTION", "INTERCEPT"]);
    expect(reportTagsFor("TURNOVER_LOST", ["HP ERROR"])).toEqual(["HP ERROR", "SLACK_HAND_PASS"]);
    expect(reportTagsFor("TURNOVER_LOST", ["KP ERROR"])).toEqual(["KP ERROR", "SLACK_KICK_PASS"]);
    expect(reportTagsFor("SHOT", ["BLOCK/SAVE"])).toEqual(["BLOCK/SAVE", "BLOCK_SAVE"]);
    // The same stored tag means different things on different kinds.
    expect(reportTagsFor("KICKOUT_WON", ["FOUL"])).toEqual(["FOUL", "FOUL_WON"]);
    expect(reportTagsFor("KICKOUT_CONCEDED", ["FOUL"])).toEqual(["FOUL", "FOUL_CONCEDED"]);
    // Kinds without a translation are untouched.
    expect(reportTagsFor("POINT", ["FOUL"])).toEqual(["FOUL"]);
  });

  it("is idempotent and leaves canonical / untranslated events as the same object", () => {
    const e = tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" });
    const once = withReportTags(e);
    expect(withReportTags(once)).toBe(once);
    const point = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "FOR" });
    expect(withReportTags(point)).toBe(point);
    const arr = [point];
    expect(normalizeEventsForReporting(arr)).toBe(arr);
    // Stored event is never mutated.
    expect(e.tags).toEqual(["INTERCEPTION"]);
  });

  it("counts each Event Stats turnover method once, for the right team", () => {
    const events = [
      tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" }), // we intercept
      tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "OPP" }), // we are intercepted → they won by interception
      tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" }),     // our HP error
      tap({ familyId: "TURNOVER", tileLabel: "KP Error", teamSide: "OPP" }),     // our KP error
      tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "FOR" }),     // opposition HP error
      tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }),
    ];
    const r = report(events);
    const home = buildTeamSummaryBlock(r, "FOR");
    const away = buildTeamSummaryBlock(r, "OPP");
    expect(home.toSwarmInt).toBe(1);
    expect(away.toSwarmInt).toBe(1);
    expect(home.toSlackKpHp).toBe(2);
    expect(away.toSlackKpHp).toBe(1);
    expect(home.toTacklePress).toBe(1);
    expect(home.toWon + away.toWon).toBe(events.length); // every turnover has exactly one winner
  });

  it("never double counts an event carrying both the stored and canonical tag", () => {
    const e = { ...tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" }), tags: ["INTERCEPTION", "INTERCEPT"] };
    expect(buildTeamSummaryBlock(report([e]), "FOR").toSwarmInt).toBe(1);
  });

  it("counts kickout fouls as Foul Won for the side that kept / won the restart", () => {
    const events = [
      tap({ familyId: "RESTART", tileLabel: "Foul", teamSide: "FOR", restartOwner: "FOR" }), // we keep ours via a foul
      tap({ familyId: "RESTART", tileLabel: "Foul", teamSide: "OPP", restartOwner: "FOR" }), // we lose ours via a foul
      tap({ familyId: "RESTART", tileLabel: "Foul", teamSide: "FOR", restartOwner: "OPP" }), // we win theirs via a foul
    ];
    const r = report(events);
    expect(buildTeamSummaryBlock(r, "FOR").koFoulWon).toBe(2);
    expect(buildTeamSummaryBlock(r, "FOR").koFoulCon).toBe(1);
    expect(buildTeamSummaryBlock(r, "OPP").koFoulWon).toBe(1);
    expect(buildTeamSummaryBlock(r, "OPP").koFoulCon).toBe(2);
  });
});

// ─── F-02 — hurling 65s ──────────────────────────────────────────────────────

describe("F-02 — hurling 65 scores and wides are placed-ball attempts", () => {
  const p65 = tap({ familyId: "POINT", tileLabel: "65", teamSide: "OPP", playerNumber: 10, playerName: "#10" });
  const w65 = tap({ familyId: "WIDE", tileLabel: "65", teamSide: "FOR", playerNumber: 12, playerName: "#12" });
  const play = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "FOR" });

  it("classifies the 65 tag as the 45/65 placed source", () => {
    expect(p65.tags).toEqual(["65"]);
    expect(eventSource(p65)).toBe("45");
    expect(isPlacedScore(p65)).toBe(true);
    expect(isPlacedMiss(w65)).toBe(true);
    expect(isPlacedScore(play)).toBe(false);
  });

  it("puts 65 scores in Placed balls (never Unattributed) and counts conversion", () => {
    const events = [p65, w65, play];
    const direct = buildDirectScoringBreakdown(events);
    const placed = direct.rows.find((r) => r.id === "PLACED")!;
    expect(placed.them.scores).toBe(1);
    expect(placed.us.attempts).toBe(1);
    expect(direct.rows.find((r) => r.id === "UNATTRIBUTED")).toBeUndefined();
    const r = report(events);
    expect(r.placedBalls.opp).toEqual({ attempts: 1, scores: 1, points: 1, misses: 0 });
    expect(r.placedBalls.for).toEqual({ attempts: 1, scores: 0, points: 0, misses: 1 });
  });

  it("keeps player attribution unchanged", () => {
    const rows = collectPlayerStats([p65, w65]);
    expect(rows.find((x) => x.teamSide === "OPP" && x.number === 10)?.scorePoints).toBe(1);
    expect(rows.find((x) => x.teamSide === "FOR" && x.number === 12)?.wides).toBe(1);
  });
});

// ─── F-03 — turnover possession chains ───────────────────────────────────────

describe("F-03 — a turnover's scoring credit ends when possession changes", () => {
  function outcomesFor(events: LoggedMatchEvent[]) {
    return analyseChains(events).turnovers.outcomes.map((o) => ({ id: o.turnoverEvent.id, score: o.resultedInScore }));
  }

  it("opposition: lost → won back → lost again → score credits only the last turnover", () => {
    clock = 0;
    const t1 = tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" });     // they win it
    const t2 = tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" });       // we win it back
    const t3 = tap({ familyId: "TURNOVER", tileLabel: "KP Error", teamSide: "OPP" });     // they win it again
    const s  = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "OPP" });
    const o = outcomesFor([t1, t2, t3, s]);
    expect(o).toEqual([
      { id: t1.id, score: false },
      { id: t2.id, score: false },
      { id: t3.id, score: true },
    ]);
    expect(analyseChains([t1, t2, t3, s]).turnovers.lostAllowedScore).toBe(1);
  });

  it("our side: won → lost → won back → score credits only the last turnover", () => {
    clock = 0;
    const t1 = tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" });
    const t2 = tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" });
    const t3 = tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" });
    const s  = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "FOR" });
    const ch = analyseChains([t1, t2, t3, s]).turnovers;
    expect(ch.wonToScore).toBe(1);
    expect(ch.outcomes.find((o) => o.turnoverEvent.id === t3.id)?.resultedInScore).toBe(true);
    expect(ch.outcomes.find((o) => o.turnoverEvent.id === t1.id)?.resultedInScore).toBe(false);
  });

  it("an uninterrupted possession still scores, for both teams", () => {
    clock = 0;
    const a = tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" });
    const b = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "OPP" });
    const c = tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" });
    const d = tap({ familyId: "GOAL", tileLabel: "Play", teamSide: "FOR" });
    const ch = analyseChains([a, b, c, d]).turnovers;
    expect(ch.lostAllowedScore).toBe(1);
    expect(ch.wonToScore).toBe(1);
  });

  it("feeds the ledger: a later possession's score is not a turnover-origin score for the earlier turnover", () => {
    clock = 0;
    const t1 = tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" });
    const t2 = tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" });
    const r = tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" });
    const s = tap({ familyId: "POINT", tileLabel: "Play", teamSide: "OPP" });
    const ledger = report([t1, t2, r, s]).ledger;
    expect(ledger.rows.find((x) => x.id === "TURNOVER_WON")!.them.scores).toBe(0);
    expect(ledger.rows.find((x) => x.id === "RESTART_WON")!.them.scores).toBe(1);
  });
});

// ─── F-04 — historical restarts with no owner ────────────────────────────────

describe("F-04 — restarts without a recorded owner are UNKNOWN, never inferred", () => {
  clock = 0;
  // Historical Event Stats shape: KICKOUT_WON, teamSide = winner, no owner.
  const legacy = [
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR" }),
    tap({ familyId: "RESTART", tileLabel: "Break", teamSide: "OPP" }),
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR" }),
  ].map(({ restartOwner: _drop, ...e }) => e as LoggedMatchEvent);

  it("marks only owner-less restarts UNKNOWN, without touching stored events", () => {
    const current = tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" });
    const out = toEventStatsReportEvents([...legacy, current]);
    expect(out.slice(0, 3).map((e) => e.restartOwner)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(out[3]).toBe(current);
    expect(legacy.every((e) => e.restartOwner === undefined)).toBe(true);
    const plain = [tap({ familyId: "POINT", tileLabel: "Play", teamSide: "FOR" })];
    expect(toEventStatsReportEvents(plain)).toBe(plain);
  });

  it("reports own-kickout retention as unavailable but keeps Restart Share", () => {
    const r = report(toEventStatsReportEvents(legacy));
    expect(r.restartTeams.for.ownRestartsTaken).toBe(0);
    expect(r.restartTeams.opp.ownRestartsTaken).toBe(0);
    expect(r.restartTeams.for.unknownOwnerRestarts).toBe(3);
    expect(r.restarts.ownKickoutRetention.full.den).toBe(0);
    expect(r.restarts.restartShare.full).toEqual({ num: 2, den: 3, pct: 67 });
    const dash = buildSnapshotDashboardModel(r, "FT");
    expect(dash.us.ownKickouts.total).toBe(0);
    expect(dash.us.restartOwnerUnknown).toBe(3);
    const qr = buildQuickReviewMatchOverview(toEventStatsReportEvents(legacy), "Home", "Away");
    expect(qr.restarts.ours.text).toBe("Not recorded");
    expect(qr.restarts.theirs.text).toBe("Not recorded");
    expect(r.possessions.ourKickouts).toBeNull();
    expect(r.possessions.theirKickouts).toBeNull();
  });

  it("keeps the documented teamSide convention for owner-less Match Stats / Rapid data", () => {
    expect(resolveRestartOwner({ teamSide: "OPP" })).toBe("OPP");
    expect(resolveRestartOwner({ teamSide: "OPP", restartOwner: "UNKNOWN" })).toBeNull();
    expect(resolveRestartOwner({ teamSide: "OPP", restartOwner: "FOR" })).toBe("FOR");
  });
});

// ─── F-05 — Clean Won on own restarts ────────────────────────────────────────

describe("F-05 — own-restart 'Won' counts only restarts the team took and kept", () => {
  clock = 0;
  const keptClean = tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" });
  const lostClean = tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "FOR" });
  const wonTheirs = tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" });
  const unknown = { ...keptClean, restartOwner: "UNKNOWN" as const };

  it("includes own restarts kept and excludes losses, opposition restarts and unknown owners", () => {
    expect(isOwnRestartRetained(keptClean, "FOR")).toBe(true);
    expect(isOwnRestartRetained(lostClean, "FOR")).toBe(false);
    expect(isOwnRestartRetained(wonTheirs, "FOR")).toBe(false);
    expect(isOwnRestartRetained(unknown, "FOR")).toBe(false);
    expect(isOwnRestartRetained(lostClean, "OPP")).toBe(false); // OPP won it, but it was ours
  });
});

// ─── F-06 — Blocked / Saved ──────────────────────────────────────────────────

describe("F-06 — one definition of blocked / saved attempts", () => {
  clock = 0;
  const block = tap({ familyId: "SHOT", tileLabel: "Block/Save", teamSide: "FOR" });
  const short = tap({ familyId: "SHOT", tileLabel: "Short", teamSide: "FOR" });
  const post = tap({ familyId: "SHOT", tileLabel: "Post", teamSide: "FOR" });

  it("is Block/Save only — Short and Post are not blocked or saved", () => {
    expect(isBlockedOrSavedAttempt(block)).toBe(true);
    expect(isBlockedOrSavedAttempt(withReportTags(block))).toBe(true);
    expect(isBlockedOrSavedAttempt(short)).toBe(false);
    expect(isBlockedOrSavedAttempt(post)).toBe(false);
    expect(isBlockedOrSavedAttempt({ kind: "SHOT", tags: ["BLOCK_SAVE"] })).toBe(true); // Match Stats
    expect(isBlockedOrSavedAttempt({ kind: "SHOT", tags: ["BLOCKED"] })).toBe(true);    // legacy
  });

  it("feeds the Match Summary block count", () => {
    const home = buildTeamSummaryBlock(report([block, short, post]), "FOR");
    expect(home.shotBlock).toBe(1);
    expect(home.shotShort).toBe(1);
    expect(home.shotPost).toBe(1);
  });
});
