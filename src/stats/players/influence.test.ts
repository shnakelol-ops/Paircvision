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
  influenceFormulaText,
  INFLUENCE_WEIGHTS,
  type InfluenceEvent,
  type PlayerRosterEntry,
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

describe("player identity regression — roster-seeded bridge, no event ever carries both fields", () => {
  /**
   * The gap the mixed-tagging fix (above) didn't cover: a coach who
   * exclusively quick-tags a player by jersey number never logs a single
   * event carrying both playerId and playerNumber, so an events-only alias
   * map has nothing to link the number to the roster's playerId. The squad
   * roster is the ONLY place the id↔number↔name bridge exists for these
   * players — it must seed the alias map, not just backfill names after
   * the fact.
   */
  const homeRoster: PlayerRosterEntry[] = [
    { id: "p-shane", number: 14, name: "Shane" },
    { id: "p-darren", number: 8, name: "Darren" },
  ];

  function buildRosterOnlyFixture(): FixtureEvent[] {
    const events: FixtureEvent[] = [];
    let clock = 0;
    const at = () => (clock += 200);

    // Shane: 1 point + 4 wides — every single event is number-only (14),
    // never playerId. The roster is the only bridge to "p-shane".
    at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, playerNumber: 14 }));
    for (let i = 0; i < 4; i++) {
      at(); events.push(mk({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: clock, playerNumber: 14 }));
    }

    // Darren: 1 point, also number-only.
    at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, playerNumber: 8 }));

    // St.Patricks: no roster supplied for this side — number-only rows
    // must render exactly as before (unchanged behaviour).
    at(); events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 4 }));
    at(); events.push(mk({ kind: "WIDE", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 4 }));

    return events;
  }

  it("Shane resolves to his roster name with 1 point and 1/5 shooting despite never being id-tagged", () => {
    const events = buildRosterOnlyFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks", homeRoster);

    const shaneRows = influence.home.players.filter((p) => p.number === 14);
    expect(shaneRows.length).toBe(1); // no duplicate identity fragments

    const shane = shaneRows[0];
    expect(shane.displayName).toBe("Shane");
    expect(shane.points).toBe(1);
    expect(shane.shots).toBe(5);
  });

  it("Darren resolves to his roster name with 1 point", () => {
    const events = buildRosterOnlyFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks", homeRoster);

    const darrenRows = influence.home.players.filter((p) => p.number === 8);
    expect(darrenRows.length).toBe(1);
    expect(darrenRows[0].displayName).toBe("Darren");
    expect(darrenRows[0].points).toBe(1);
  });

  it("St.Patricks (no roster supplied) still renders number-only rows unchanged", () => {
    const events = buildRosterOnlyFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks", homeRoster);

    const oppRows = influence.away.players.filter((p) => p.number === 4);
    expect(oppRows.length).toBe(1);
    expect(oppRows[0].displayName).toBe("#4");
  });

  it("no duplicate identity fragments survive anywhere and influence scoring shares sum to team total points", () => {
    const events = buildRosterOnlyFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks", homeRoster);

    const homeNumbers = influence.home.players.map((p) => p.number);
    expect(new Set(homeNumbers).size).toBe(homeNumbers.length);

    const homeTeamPoints = influence.home.players.reduce((sum, p) => sum + p.points, 0);
    expect(homeTeamPoints).toBe(2); // Shane's 1 + Darren's 1
    const homeShareSum = influence.home.players.reduce((sum, p) => sum + p.scoringSharePct, 0);
    expect(homeShareSum).toBeGreaterThan(0);
  });
});

describe("duplicate surname disambiguation (P1-6)", () => {
  // Squad contains two different Costellos (#3 and #13) — the Influence
  // table must not render two rows both bare-labelled "Costello" with no
  // way to tell them apart.
  const duplicateSurnameRoster: PlayerRosterEntry[] = [
    { id: "p-costello-3", number: 3, name: "Costello" },
    { id: "p-costello-13", number: 13, name: "Costello" },
    { id: "p-unique", number: 7, name: "Ryan" },
  ];

  function buildDuplicateSurnameFixture(): FixtureEvent[] {
    const events: FixtureEvent[] = [];
    let clock = 0;
    const at = () => (clock += 200);
    at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, playerId: "p-costello-3", playerNumber: 3 }));
    at(); events.push(mk({ kind: "WIDE",  teamSide: "FOR", matchClockSeconds: clock, playerId: "p-costello-3", playerNumber: 3 }));
    at(); events.push(mk({ kind: "GOAL",  teamSide: "FOR", matchClockSeconds: clock, playerId: "p-costello-13", playerNumber: 13 }));
    at(); events.push(mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: clock, playerId: "p-unique", playerNumber: 7 }));
    at(); events.push(mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: clock, playerNumber: 20 }));
    return events;
  }

  it("prefixes the jersey number onto both Costellos, but leaves the unique Ryan bare", () => {
    const events = buildDuplicateSurnameFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Ballylanders", "St.Patricks", duplicateSurnameRoster);

    const costello3  = influence.home.players.find((p) => p.number === 3)!;
    const costello13 = influence.home.players.find((p) => p.number === 13)!;
    const ryan       = influence.home.players.find((p) => p.number === 7)!;

    expect(costello3.displayName).toBe("#3 Costello");
    expect(costello13.displayName).toBe("#13 Costello");
    expect(ryan.displayName).toBe("Ryan");
    // Each Costello keeps their own distinct stats — no cross-attribution.
    expect(costello3.points).toBe(1);
    expect(costello13.goals).toBe(1);
  });

  it("does not disambiguate a shared surname across different teams", () => {
    const rosters: PlayerRosterEntry[] = [{ id: "p-costello-home", number: 3, name: "Costello" }];
    const oppRoster: PlayerRosterEntry[] = [{ id: "p-costello-opp", number: 20, name: "Costello" }];
    const events: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "p-costello-home", playerNumber: 3 }),
      mk({ kind: "POINT", teamSide: "OPP", playerId: "p-costello-opp", playerNumber: 20 }),
    ];
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(
      events, analysis, "Ballylanders", "St.Patricks",
      rosters,
      oppRoster,
    );
    expect(influence.home.players.find((p) => p.number === 3)!.displayName).toBe("Costello");
    expect(influence.away.players.find((p) => p.number === 20)!.displayName).toBe("Costello");
  });
});

describe("Influence Index excludes non-comparable terms (P1-8)", () => {
  // FREE_WON/FREE_CONCEDED are only ever attributed to a FOR-side player
  // (the FREE family has no opposition player picker) and TURNOVER_LOST is
  // never logged by capture sources that only record TURNOVER_WON — so
  // opposition players can never carry either stat. Including them in the
  // index would let FOR players gain/lose points on a feature opposition
  // players structurally can never have.
  it("the weight table no longer contains turnoverLost, freeWon or freeConceded", () => {
    expect(INFLUENCE_WEIGHTS).not.toHaveProperty("turnoverLost");
    expect(INFLUENCE_WEIGHTS).not.toHaveProperty("freeWon");
    expect(INFLUENCE_WEIGHTS).not.toHaveProperty("freeConceded");
  });

  it("the printed formula text does not include frees or turnovers-lost as active weighted terms (a trailing exclusion footnote is fine)", () => {
    const text = influenceFormulaText();
    expect(text).not.toMatch(/frees won ×/i);
    expect(text).not.toMatch(/frees conceded ×/i);
    expect(text).not.toMatch(/turnovers lost ×/i);
    // The footnote explaining the exclusion is expected and useful.
    expect(text).toMatch(/excluded/i);
  });

  it("a FOR player's index is unaffected by frees won/conceded or turnovers lost — same score events either way", () => {
    const withFrees: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "p1", playerNumber: 1 }),
      mk({ kind: "FREE_WON", teamSide: "FOR", playerId: "p1", playerNumber: 1 }),
      mk({ kind: "FREE_CONCEDED", teamSide: "FOR", playerId: "p1", playerNumber: 1 }),
      mk({ kind: "TURNOVER_LOST", teamSide: "FOR", playerId: "p1", playerNumber: 1 }),
    ];
    const withoutFrees: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "p1", playerNumber: 1 }),
    ];
    const a1 = analyseChains(withFrees);
    const a2 = analyseChains(withoutFrees);
    const inf1 = buildInfluenceAnalysis(withFrees, a1, "Home", "Away");
    const inf2 = buildInfluenceAnalysis(withoutFrees, a2, "Home", "Away");
    const p1 = inf1.home.players.find((p) => p.number === 1)!;
    const p2 = inf2.home.players.find((p) => p.number === 1)!;
    expect(p1.influenceIndex).toBe(p2.influenceIndex);
    expect(p1.netBallImpact).toBe(p2.netBallImpact);
    // Raw counts are still tracked for informational display, just not ranked.
    expect(p1.freesWon).toBe(1);
    expect(p1.freesConceded).toBe(1);
    expect(p1.toLost).toBe(1);
  });

  it("an OPP player who can never carry frees/turnover-loss stats is ranked on the same feature set as a FOR player", () => {
    const events: FixtureEvent[] = [
      mk({ kind: "TURNOVER_WON", teamSide: "FOR", playerId: "p-for", playerNumber: 1 }),
      mk({ kind: "TURNOVER_WON", teamSide: "OPP", playerId: "p-opp", playerNumber: 1 }),
    ];
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Home", "Away");
    const forPlayer = influence.home.players.find((p) => p.number === 1)!;
    const oppPlayer = influence.away.players.find((p) => p.number === 1)!;
    // Identical underlying action (one turnover won each) -> identical index,
    // even though only the FOR player could ever structurally carry a
    // freesWon/freesConceded value.
    expect(forPlayer.influenceIndex).toBe(oppPlayer.influenceIndex);
  });
});
