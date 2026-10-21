import { describe, expect, it } from "vitest";
import { analyseChains } from "./chain-engine";
import type { ChainableEvent, ChainRuleId } from "./chain-types";
import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";
import { deriveReviewPrompts } from "./review-prompts";
import { measureHalfCoverage, type HalfCoverage } from "./evidence-gates";
import {
  RATHKEALE_OOLA_CHAIN_TABLE,
  RATHKEALE_OOLA_TEAMS,
  buildRathkealeOolaChainFixture,
} from "../reporting/rathkeale-oola-chain-fixture";
import { ABK_STSENANS_TEAMS, buildAbkDesmondsStSenansFixture } from "../reporting/abk-desmonds-stsenans-fixture";

const RULES: ChainRuleId[] = [
  "KICKOUT_TO_SCORE", "KICKOUT_LOST_TO_SCORE_AGAINST", "TURNOVER_TO_SCORE", "TURNOVER_TO_SHOT", "FREE_WON_TO_GOAL",
];

let nextId = 0;
function ev(
  kind: MatchEventKind,
  teamSide: "FOR" | "OPP",
  period: MatchEventPeriod,
  clock: number,
  extra: Partial<ChainableEvent> = {},
): ChainableEvent {
  return {
    id: `rp-${nextId++}`,
    kind,
    teamSide,
    period,
    segment: (period === "1H" ? 1 : 4) as MatchEventSegment,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...extra,
  };
}

/** Coverage of a fully logged 35-minute match (both halves 1:00–34:00). */
const FULL_COVERAGE: HalfCoverage = measureHalfCoverage(
  (["1H", "2H"] as const).flatMap((p) =>
    Array.from({ length: 30 }, (_, i) => ev("FREE_WON", "FOR", p, 60 + i * 68)),
  ),
  35,
);

describe("Rathkeale v Oola constructed chain fixture", () => {
  const analysis = analyseChains(buildRathkealeOolaChainFixture());

  it("reproduces the chain table printed on the real Rathkeale v Oola report", () => {
    for (const ruleId of RULES) {
      const chains = analysis.byRule[ruleId] ?? [];
      expect(chains.filter((c) => c.teamSide === "FOR").length, `${ruleId} FOR`).toBe(RATHKEALE_OOLA_CHAIN_TABLE.FOR[ruleId]);
      expect(chains.filter((c) => c.teamSide === "OPP").length, `${ruleId} OPP`).toBe(RATHKEALE_OOLA_CHAIN_TABLE.OPP[ruleId]);
    }
    expect(analysis.summary.forChains).toBe(RATHKEALE_OOLA_CHAIN_TABLE.totalFor);
    expect(analysis.summary.oppChains).toBe(RATHKEALE_OOLA_CHAIN_TABLE.totalOpp);
  });

  it("reproduces the report's run shapes: equal 4-score longest runs and an Oola run across half-time", () => {
    expect(analysis.scoringRuns.maxConsecutiveFor).toBe(4);
    expect(analysis.scoringRuns.maxConsecutiveOpp).toBe(4);
    const crossHalf = analysis.scoringRuns.runs.find(
      (r) => r.teamSide === "OPP" && r.period === "1H" && r.events[r.events.length - 1].period === "2H",
    );
    expect(crossHalf?.count).toBe(3);
  });
});

describe("deriveReviewPrompts — Rathkeale v Oola chain attribution errors", () => {
  const prompts = deriveReviewPrompts(
    analyseChains(buildRathkealeOolaChainFixture()),
    RATHKEALE_OOLA_TEAMS.home,
    RATHKEALE_OOLA_TEAMS.away,
    "gaelic",
  );
  const texts = prompts.map((p) => p.text);

  it("never states a 'possession sequences' share (was: 'Rathkeale won 83% of all possession sequences (24 of 29).')", () => {
    expect(texts.some((t) => /possession sequence/i.test(t))).toBe(false);
    expect(texts.some((t) => t.includes("24 of 29"))).toBe(false);
  });

  it("never compares kickout and turnover chain counts (was: '… turnover-to-score chains (7) than kickout-to-score chains (5) …')", () => {
    expect(texts.some((t) => /kickout-to-score chains/i.test(t))).toBe(false);
    expect(texts.some((t) => /turnover-to-score chains/i.test(t))).toBe(false);
  });

  it("generates no GENERAL chain-share observation", () => {
    expect(prompts.filter((p) => p.category === "GENERAL")).toEqual([]);
  });

  it("makes no half-time comparison when coverage is unknown", () => {
    expect(texts.some((t) => /second half/i.test(t))).toBe(false);
  });
});

describe("deriveReviewPrompts — chain sentences only use home-side counts", () => {
  it("does not credit the opposition's free-won-to-goal chains to the home team", () => {
    const events = [
      ev("FREE_WON", "OPP", "1H", 100), ev("GOAL", "OPP", "1H", 110),
      ev("FREE_WON", "OPP", "1H", 400), ev("GOAL", "OPP", "1H", 410),
    ];
    const texts = deriveReviewPrompts(analyseChains(events), "Home", "Away").map((p) => p.text);
    expect(texts.some((t) => t.includes("free-won-to-goal"))).toBe(false);
  });

  it("states the home team's own free-won-to-goal chains", () => {
    const events = [
      ev("FREE_WON", "FOR", "1H", 100), ev("GOAL", "FOR", "1H", 110),
      ev("FREE_WON", "FOR", "1H", 400), ev("GOAL", "FOR", "1H", 410),
    ];
    const texts = deriveReviewPrompts(analyseChains(events), "Home", "Away").map((p) => p.text);
    expect(texts).toContain("Home had 2 free-won-to-goal chains (rule match) — a free won followed by a goal within 30 seconds.");
  });
});

describe("deriveReviewPrompts — kickout sentences", () => {
  it("does not repeat the restart-origin conversion when the Restart Share sentence already states it", () => {
    // 5 of 10 restarts won (50%), 3 of the 5 wins scored (60%).
    const events: ChainableEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const t = 100 + i * 200;
      if (i < 5) {
        events.push(ev("KICKOUT_WON", "FOR", "1H", t));
        if (i < 3) events.push(ev("POINT", "FOR", "1H", t + 20));
      } else {
        events.push(ev("KICKOUT_CONCEDED", "FOR", "1H", t));
      }
    }
    const kickout = deriveReviewPrompts(analyseChains(events), "Home", "Away")
      .filter((p) => p.category === "KICKOUT");
    expect(kickout.map((p) => p.text)).toEqual([
      "Home held 50% Restart Share (5 of 10) — 60% of won kickouts produced restart-origin point value (3 Points (3 pts)).",
    ]);
  });

  it("reports a gated second-half Restart Share rise with counts (Rathkeale v Oola 9/20 → 9/14)", () => {
    const events: ChainableEvent[] = [];
    const add = (period: MatchEventPeriod, won: number, total: number) => {
      for (let i = 0; i < total; i++) {
        events.push(ev(i < won ? "KICKOUT_WON" : "KICKOUT_CONCEDED", "FOR", period, 60 + i * 90));
      }
    };
    add("1H", 9, 20);
    add("2H", 9, 14);
    const texts = deriveReviewPrompts(analyseChains(events), "Rathkeale", "Oola", "gaelic", FULL_COVERAGE)
      .map((p) => p.text);
    expect(texts).toContain(
      "Rathkeale's Restart Share rose to 64% in the second half (9 of 14) from 45% in the first half (9 of 20).",
    );
    // Same events, no coverage information → suppressed.
    const ungated = deriveReviewPrompts(analyseChains(events), "Rathkeale", "Oola").map((p) => p.text);
    expect(ungated.some((t) => t.includes("second half"))).toBe(false);
  });
});

describe("deriveReviewPrompts — turnover sentences", () => {
  it("states won turnovers without a shot using the Turnover Analysis card's figure", () => {
    // 6 turnovers won: 2 lead to a point, 4 lead to nothing within 60 s.
    const events: ChainableEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(ev("TURNOVER_WON", "FOR", "1H", 100 + i * 200));
      if (i < 2) events.push(ev("POINT", "FOR", "1H", 120 + i * 200));
    }
    const texts = deriveReviewPrompts(analyseChains(events), "Home", "Away").map((p) => p.text);
    expect(texts).toContain("Home won 6 turnovers; 4 did not lead to a shot.");
  });

  it("counts home turnover wins logged as the opposition's loss in the half comparison", () => {
    // Home wins are logged as OPP TURNOVER_LOST (mirror logging).
    // 1H: 8 wins, 6 scored. 2H: 8 wins, 1 scored.
    const events: ChainableEvent[] = [];
    for (const [period, scored] of [["1H", 6], ["2H", 1]] as const) {
      for (let i = 0; i < 8; i++) {
        const t = 60 + i * 200;
        events.push(ev("TURNOVER_LOST", "OPP", period, t));
        if (i < scored) events.push(ev("POINT", "FOR", period, t + 20));
      }
    }
    const texts = deriveReviewPrompts(analyseChains(events), "Home", "Away", "gaelic", FULL_COVERAGE)
      .map((p) => p.text);
    expect(texts).toContain(
      "Home's turnover conversion was lower in the second half (1 of 8, 13%) than in the first half (6 of 8, 75%).",
    );
  });

  it("never prints a points breakdown that disagrees with its percentage (ABK: was '(0 pts from 5 losses)')", () => {
    const texts = deriveReviewPrompts(
      analyseChains(buildAbkDesmondsStSenansFixture()),
      ABK_STSENANS_TEAMS.home,
      ABK_STSENANS_TEAMS.away,
    ).map((p) => p.text);
    expect(texts.some((t) => t.includes("0 pts from 5 losses"))).toBe(false);
    expect(texts).toContain(
      "100% of the turnovers St Senans won against ABK Desmonds produced turnover-origin point value (5 of 5 losses).",
    );
  });
});
