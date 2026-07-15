/**
 * scoreLedger.test.ts
 *
 * "Where the Points Went" acceptance tests against the spec fixture values
 * (Ballylanders 0-07 (7) v St.Patricks 1-08 (11) — St.Patricks by 4):
 *
 *   - Ledger row nets must sum to the final margin (−4)
 *   - Placed-ball net must be −1 (1/3 scored against 2/2)
 *   - Turnover net must be −2 (1 point from turnovers won against 3 conceded)
 *   - Every score appears in exactly one row
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "../chains/chain-engine";
import type { ChainableEvent } from "../chains/chain-types";
import {
  buildScoreLedger,
  countPlacedRestartOriginScores,
  fmtMarginLabel,
  fmtScoreLine,
  LEDGER_ROW_LABELS,
  restartOriginBridgeNote,
} from "./scoreLedger";

type FixtureEvent = ChainableEvent & { tags?: string[] };

let nextId = 0;
function mk(partial: Partial<FixtureEvent> & Pick<FixtureEvent, "kind" | "teamSide">): FixtureEvent {
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `ledger-${nextId++}`,
    period: partial.period ?? "1H",
    segment: partial.segment ?? 1,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

/**
 * Fixture: Ballylanders (FOR) 0-07 v St.Patricks (OPP) 1-08.
 *
 * FOR (7 pts):  1 placed (1/3), 5 off restarts won, 1 off turnovers won.
 * OPP (11 pts): 2 placed (2/2), 1-01 off restarts won (4 pts),
 *               3 off turnovers won, 2 from play.
 *
 * Events are spaced so each chain window contains exactly its own score.
 */
function buildLedgerFixture(): FixtureEvent[] {
  const events: FixtureEvent[] = [];
  let clock = 0;

  function at(fn: () => void): void {
    clock += 200; // outside every chain window (kickout 90s / turnover 60s)
    fn();
  }

  // ── FOR placed balls: 1/3 ─────────────────────────────────────────────────
  at(() => events.push(mk({ kind: "FREE_SCORED", teamSide: "FOR", matchClockSeconds: clock })));
  at(() => events.push(mk({ kind: "FREE_MISSED", teamSide: "FOR", matchClockSeconds: clock })));
  at(() => events.push(mk({ kind: "FREE_MISSED", teamSide: "FOR", matchClockSeconds: clock })));

  // ── OPP placed balls: 2/2 ─────────────────────────────────────────────────
  at(() => events.push(mk({ kind: "FREE_SCORED", teamSide: "OPP", matchClockSeconds: clock })));
  at(() => events.push(mk({ kind: "FREE_SCORED", teamSide: "OPP", matchClockSeconds: clock })));

  // ── FOR: 5 points off restarts won ────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    at(() => {
      events.push(mk({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: clock }));
      events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock + 20, tags: ["SOURCE_PLAY"] }));
    });
  }

  // ── OPP: 1-01 off restarts won (goal + point = 4 pts) ─────────────────────
  at(() => {
    events.push(mk({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", matchClockSeconds: clock }));
    events.push(mk({ kind: "GOAL", teamSide: "OPP", matchClockSeconds: clock + 20, tags: ["SOURCE_PLAY"] }));
  });
  at(() => {
    events.push(mk({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", matchClockSeconds: clock }));
    events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock + 20, tags: ["SOURCE_PLAY"] }));
  });

  // ── FOR: 1 point off turnovers won (6 won in total) ──────────────────────
  at(() => {
    events.push(mk({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: clock }));
    events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock + 15, tags: ["SOURCE_PLAY"] }));
  });
  for (let i = 0; i < 5; i++) {
    at(() => events.push(mk({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: clock })));
  }

  // ── OPP: 3 points off turnovers won (FOR lost 10 in total) ───────────────
  for (let i = 0; i < 3; i++) {
    at(() => {
      events.push(mk({ kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: clock }));
      events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock + 15, tags: ["SOURCE_PLAY"] }));
    });
  }
  for (let i = 0; i < 7; i++) {
    at(() => events.push(mk({ kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: clock })));
  }

  // ── OPP: 2 points from play ───────────────────────────────────────────────
  at(() => events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, tags: ["SOURCE_PLAY"] })));
  at(() => events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, tags: ["SOURCE_PLAY"] })));

  return events;
}

describe("buildScoreLedger — spec fixture acceptance", () => {
  const events = buildLedgerFixture();
  const analysis = analyseChains(events);
  const ledger = buildScoreLedger(events, analysis, "Ballylanders", "St.Patricks");

  it("final score is 0-07 v 1-08, margin −4", () => {
    expect(fmtScoreLine(ledger.forScore)).toBe("0-07 (7)");
    expect(fmtScoreLine(ledger.oppScore)).toBe("1-08 (11)");
    expect(ledger.margin).toBe(-4);
    expect(fmtMarginLabel(ledger.margin, "Ballylanders", "St.Patricks")).toBe("St.Patricks by 4");
  });

  it("row nets sum exactly to the final margin", () => {
    const netSum = ledger.rows.reduce((s, r) => s + r.net, 0);
    expect(netSum).toBe(ledger.margin);
  });

  it("placed-ball net is −1 (1/3 scored against 2/2)", () => {
    const placed = ledger.rows.find((r) => r.id === "PLACED")!;
    expect(placed.us.scores).toBe(1);
    expect(placed.us.attempts).toBe(3);
    expect(placed.them.scores).toBe(2);
    expect(placed.them.attempts).toBe(2);
    expect(placed.net).toBe(-1);
  });

  it("turnover net is −2 (1 scored against 3 conceded)", () => {
    const to = ledger.rows.find((r) => r.id === "TURNOVER_WON")!;
    expect(to.us.value).toBe(1);
    expect(to.them.value).toBe(3);
    expect(to.net).toBe(-2);
  });

  it("restart net is +1 (5 against 1-01) and the loss-context row mirrors it", () => {
    const ko = ledger.rows.find((r) => r.id === "RESTART_WON")!;
    expect(ko.us.value).toBe(5);
    expect(ko.them.value).toBe(4);
    expect(ko.them.goals).toBe(1);
    expect(ko.net).toBe(1);
    expect(ledger.restartLossContext.usConcededValue).toBe(4);
    expect(ledger.restartLossContext.themConcededValue).toBe(5);
  });

  it("every score appears in exactly one row", () => {
    const usScores   = ledger.rows.reduce((s, r) => s + r.us.scores, 0);
    const themScores = ledger.rows.reduce((s, r) => s + r.them.scores, 0);
    expect(usScores).toBe(7);    // 0-07 = 7 scoring events
    expect(themScores).toBe(9);  // 1-08 = 9 scoring events
    const usValue   = ledger.rows.reduce((s, r) => s + r.us.value, 0);
    const themValue = ledger.rows.reduce((s, r) => s + r.them.value, 0);
    expect(usValue).toBe(ledger.forScore.total);
    expect(themValue).toBe(ledger.oppScore.total);
  });

  it("verdicts cover the largest negative and positive rows in the locked tone", () => {
    expect(ledger.verdicts.length).toBeGreaterThanOrEqual(1);
    const joined = ledger.verdicts.join(" ");
    // Largest negative row is turnovers (−2)
    expect(joined).toContain("Turnover exchanges netted -2 for Ballylanders");
    expect(joined).toContain("Worth reviewing");
    // No prescriptive language
    expect(joined).not.toMatch(/must|should|failed|poor|weak/i);
  });

  it("ledger rows use the direct-attribution vocabulary", () => {
    expect(LEDGER_ROW_LABELS.RESTART_WON).toBe("Direct scores attributed to restarts");
    expect(LEDGER_ROW_LABELS.TURNOVER_WON).toBe("Direct scores attributed to turnovers");
  });

  it("direct-attribution labels stay textually distinct from origin-possession wording", () => {
    // Direct (ledger) and origin (chain) are two legitimate but different
    // attribution models — a coach must never be able to mistake one row
    // for the other because the wording overlapped.
    expect(LEDGER_ROW_LABELS.RESTART_WON).not.toContain("origin");
    expect(LEDGER_ROW_LABELS.TURNOVER_WON).not.toContain("origin");
    const footnote = restartOriginBridgeNote({ us: 0, them: 0 }, "A", "B");
    expect(footnote).toContain("Origin possessions");
    expect(footnote).not.toBe(LEDGER_ROW_LABELS.RESTART_WON);
    expect(footnote).not.toBe(LEDGER_ROW_LABELS.TURNOVER_WON);
  });

  it("renders an unattributed row only when a score cannot be classified", () => {
    expect(ledger.rows.find((r) => r.id === "UNATTRIBUTED")).toBeUndefined();

    const withMystery = [
      ...events,
      mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: 9000 }), // no source, no chain
    ];
    const ledger2 = buildScoreLedger(withMystery, analyseChains(withMystery), "A", "B");
    const unattributed = ledger2.rows.find((r) => r.id === "UNATTRIBUTED");
    expect(unattributed?.us.scores).toBe(1);
    const netSum = ledger2.rows.reduce((s, r) => s + r.net, 0);
    expect(netSum).toBe(ledger2.margin);
  });
});

describe("origin ↔ direct reconciliation bridge", () => {
  // A placed free won inside a kickout-origin possession: the chain engine
  // counts it as a restart-origin score; the ledger buckets it under Placed
  // balls. The bridge count is the exact off-by-n between the two layers.
  function buildBridgeFixture(): FixtureEvent[] {
    return [
      // Ballylanders: kickout won → free scored 30s later (origin, placed)
      mk({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 100 }),
      mk({ kind: "FREE_SCORED", teamSide: "FOR", matchClockSeconds: 130 }),
      // St.Patricks: same shape
      mk({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", matchClockSeconds: 400 }),
      mk({ kind: "FREE_SCORED", teamSide: "OPP", matchClockSeconds: 430 }),
      // A plain open-play restart-origin score — must NOT count toward the bridge
      mk({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 700 }),
      mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: 720, tags: ["SOURCE_PLAY"] }),
    ];
  }

  it("counts exactly the placed scores inside restart-origin possessions", () => {
    const events = buildBridgeFixture();
    const analysis = analyseChains(events);
    const bridge = countPlacedRestartOriginScores(analysis.kickouts.outcomes);
    expect(bridge).toEqual({ us: 1, them: 1 });

    // Chain layer sees 2 FOR origin scores; the ledger's direct restart row
    // holds only 1 — the bridge is the difference, and the placed free stays
    // under Placed balls (direct attribution untouched).
    expect(analysis.kickouts.wonToScore).toBe(2);
    const ledger = buildScoreLedger(events, analysis, "Ballylanders", "St.Patricks");
    const restartRow = ledger.rows.find((r) => r.id === "RESTART_WON")!;
    const placedRow  = ledger.rows.find((r) => r.id === "PLACED")!;
    expect(restartRow.us.scores).toBe(1);
    expect(placedRow.us.scores).toBe(1);
    expect(placedRow.them.scores).toBe(1);
  });

  it("words the bridging footnote with the computed counts", () => {
    expect(restartOriginBridgeNote({ us: 1, them: 1 }, "Ballylanders", "St.Patricks")).toBe(
      "Origin possessions include 2 placed frees won during kickout-origin possessions " +
      "(Ballylanders 1 · St.Patricks 1) — the scoring ledger attributes those scores to placed balls.",
    );
    // Zero bridge falls back to the generic attribution wording
    expect(restartOriginBridgeNote({ us: 0, them: 0 }, "A", "B")).toBe(
      "Origin possessions include later frees won during the same possession. The scoring ledger attributes those scores to placed balls.",
    );
  });
});
