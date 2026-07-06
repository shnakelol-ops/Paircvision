/**
 * influence.test.ts
 *
 * Player Influence acceptance tests against the spec fixture behaviour
 * (Ballylanders v St.Patricks):
 *
 *   - St.Patricks #15 flagged: Scoring Share 64%, dependency insight fires
 *   - Shane efficiency flag fires (1/5); Danny does NOT (2/3)
 *   - Ballylanders dependency flag does NOT fire (top share 2/7 ≈ 29%)
 *   - Quiet influence credits chain involvement without shooting
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "../chains/chain-engine";
import type { ChainableEvent } from "../chains/chain-types";
import {
  buildInfluenceAnalysis,
  influenceEvidenceLine,
  type InfluenceEvent,
} from "./influence";

type FixtureEvent = InfluenceEvent & ChainableEvent;

let nextId = 0;
function mk(partial: Partial<FixtureEvent> & Pick<FixtureEvent, "kind" | "teamSide">): FixtureEvent {
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `inf-${nextId++}`,
    period: partial.period ?? "1H",
    segment: partial.segment ?? 1,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

/**
 * Fixture:
 *
 * Ballylanders (FOR) 0-07 — 7 scores by 6 different players; top share 29%.
 *   Shane:  1 point from 5 shots (4 wides) → efficiency flag
 *   Danny:  2 points from 3 shots (1 wide) → NO efficiency flag, top share 2/7 = 29%
 *   Johnno: 0 shots, but TURNOVER_WON feeding a score → quiet influence
 *   4 more players: 1 point each
 *
 * St.Patricks (OPP) 1-08 (11 pts) — 9 scores.
 *   #15: 1-04 from 6 shots (7 of 11 pts = 64%) → dependency flag
 *   #11: 4 points
 */
function buildInfluenceFixture(): FixtureEvent[] {
  const events: FixtureEvent[] = [];
  let clock = 0;
  const at = () => (clock += 200);

  const shane  = { playerId: "p-shane",  playerName: "Shane",  playerNumber: 13 };
  const danny  = { playerId: "p-danny",  playerName: "Danny",  playerNumber: 14 };
  const johnno = { playerId: "p-johnno", playerName: "Johnno", playerNumber: 9 };

  // Shane: 1 point + 4 wides (5 shots)
  at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, ...shane }));
  for (let i = 0; i < 4; i++) {
    at(); events.push(mk({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: clock, ...shane }));
  }

  // Danny: 2 points + 1 wide (3 shots); one point fed by Johnno's turnover win
  at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, ...danny }));
  at(); events.push(mk({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: clock, ...danny }));
  at();
  events.push(mk({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: clock, ...johnno }));
  events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock + 20, ...danny }));

  // Four more Ballylanders scorers — 1 point each
  for (let n = 1; n <= 4; n++) {
    at();
    events.push(mk({
      kind: "POINT", teamSide: "FOR", matchClockSeconds: clock,
      playerId: `p-bl-${n}`, playerName: `Player${n}`, playerNumber: n,
    }));
  }

  // St.Patricks #15 (number-only attribution): 1-04 from 6 shots
  at(); events.push(mk({ kind: "GOAL", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 15 }));
  for (let i = 0; i < 4; i++) {
    at(); events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 15 }));
  }
  at(); events.push(mk({ kind: "WIDE", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 15 }));

  // St.Patricks #11: 4 points
  for (let i = 0; i < 4; i++) {
    at(); events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 11 }));
  }

  return events;
}

describe("buildInfluenceAnalysis — spec fixture acceptance", () => {
  const events = buildInfluenceFixture();
  const analysis = analyseChains(events);
  const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks");

  it("St.Patricks #15 has 64% Scoring Share and the dependency insight fires", () => {
    const p15 = influence.away.players.find((p) => p.number === 15)!;
    expect(p15.goals).toBe(1);
    expect(p15.points).toBe(4);
    expect(p15.scoreValue).toBe(7);
    expect(p15.shots).toBe(6);
    expect(p15.scoringSharePct).toBe(64);
    expect(influence.away.dependencyPlayer?.number).toBe(15);
    expect(influence.away.dependencyInsight?.text).toContain("St.Patricks scoring ran through #15");
    expect(influence.away.dependencyInsight?.text).toContain("1-04 of 1-08 (64%)");
    expect(influence.away.dependencyInsight?.text).toContain("Worth reviewing matchup options");
  });

  it("#15 tops the away influence ranking and the evidence line reads correctly", () => {
    const top = influence.away.top3[0];
    expect(top.number).toBe(15);
    expect(influenceEvidenceLine(top, influence.away)).toContain(
      "#15: 1-04 (64% of St.Patricks total) · from 6 shots",
    );
  });

  it("Shane gets an efficiency flag (1/5); Danny does not (2/3)", () => {
    const texts = influence.home.efficiencyWatch.map((f) => f.text);
    expect(texts.some((t) => t.startsWith("Shane (Ballylanders): 1 from 5 attempts"))).toBe(true);
    expect(texts.some((t) => t.includes("Danny"))).toBe(false);
    expect(texts.join(" ")).toContain("Worth reviewing shot selection or supply");
  });

  it("Ballylanders dependency flag does NOT fire — spread insight instead (top share 29%)", () => {
    expect(influence.home.dependencyPlayer).toBeNull();
    expect(influence.home.dependencyInsight?.text).toBe(
      "Ballylanders scoring was spread — top scorer share 29%.",
    );
  });

  it("Johnno's turnover win earns quiet influence without shooting", () => {
    const johnno = influence.home.players.find((p) => p.name === "Johnno")!;
    expect(johnno.scores).toBe(0);
    expect(johnno.chainInvolvementCount).toBe(1);
    expect(johnno.assistsProxy).toBe(1);
    expect(influence.home.quietInfluence?.text).toContain(
      "Johnno (Ballylanders) appeared in 1 of 7 Ballylanders scoring chains without shooting",
    );
  });

  it("players with zero events never appear", () => {
    for (const team of [influence.home, influence.away]) {
      for (const p of team.players) {
        expect(
          p.scores + p.shots + p.toWon + p.toLost + p.koWon + p.koLost +
          p.freesWon + p.freesConceded + p.chainInvolvementCount,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("net ball impact and influence index follow the printed formula", () => {
    const johnno = influence.home.players.find((p) => p.name === "Johnno")!;
    expect(johnno.netBallImpact).toBe(1);   // 1 turnover won
    expect(johnno.influenceIndex).toBe(2);  // 1 T/O won + 1 assist proxy
    const danny = influence.home.players.find((p) => p.name === "Danny")!;
    expect(danny.scoreValue).toBe(2);
    expect(danny.shotEfficiencyPct).toBe(67);
    expect(danny.influenceIndex).toBe(2);   // 2 points value, no ball-winning events
  });
});

describe("player identity regression — mixed playerId / number-only tagging", () => {
  /**
   * Reproduces the reported bug exactly: "Shane" (#14) is tagged with a
   * playerId on some events (via the player picker) and with only a jersey
   * number on others (quick number-tag). Before the identity-merge fix this
   * split into two rows — a named "Shane" bucket (whichever events carried
   * playerId) and an unnamed "#14" bucket (the number-only events) — so the
   * ranked table and any insight built from a different bucket could name
   * the same player two different ways, or an insight could name a player
   * the table showed only as a number.
   */
  function buildMixedTaggingFixture(): FixtureEvent[] {
    const events: FixtureEvent[] = [];
    let clock = 0;
    const at = () => (clock += 200);

    // Scoring events tagged via the player picker (playerId + name present)
    at();
    events.push(mk({
      kind: "POINT", teamSide: "FOR", matchClockSeconds: clock,
      playerId: "p-shane", playerNumber: 14, playerName: "Shane",
    }));

    // Four wides for the same player, tagged number-only (no playerId, no name)
    // — exactly how a sideline quick-tag would log a shot without opening the picker.
    for (let i = 0; i < 4; i++) {
      at();
      events.push(mk({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: clock, playerNumber: 14 }));
    }

    // A team-mate so the fixture isn't a single-player match
    at();
    events.push(mk({
      kind: "POINT", teamSide: "FOR", matchClockSeconds: clock,
      playerId: "p-danny", playerNumber: 8, playerName: "Danny",
    }));

    return events;
  }

  it("collapses the mixed-tagged player into one row with the full, merged stat line", () => {
    const events = buildMixedTaggingFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks");

    const shaneRows = influence.home.players.filter((p) => p.number === 14);
    expect(shaneRows.length).toBe(1); // not split into a named row + a "#14" row

    const shane = shaneRows[0];
    expect(shane.displayName).toBe("Shane");
    expect(shane.name).toBe("Shane");
    expect(shane.scores).toBe(1);
    expect(shane.shots).toBe(5); // 1 point + 4 wides, all attributed to the same player
  });

  it("an efficiency-watch insight never names a player the ranked table shows only by number", () => {
    const events = buildMixedTaggingFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks");

    const shane = influence.home.players.find((p) => p.number === 14)!;
    expect(influence.home.efficiencyWatch.some((f) => f.text.startsWith("Shane"))).toBe(true);

    // The exact same displayName the table renders is the one the insight used.
    const insight = influence.home.efficiencyWatch.find((f) => f.text.includes(shane.displayName));
    expect(insight).toBeDefined();
  });
});
