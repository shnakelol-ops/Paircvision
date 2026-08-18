/**
 * newEventKindsIgnored.test.ts
 *
 * Reporting regression coverage for the new 45/65, Sideline, and Discipline
 * event kinds added for Event Stats (ProTagger) capture. Per the PR's
 * reporting guardrail, none of these kinds were added to any classification
 * set (PDF_KIND_SETS, chain rules, possession outcomes, the score ledger,
 * Match Targets, etc.) — they must simply exist in the raw event stream and
 * be ignored analytically. This proves that on the same canonical report
 * builder every other capture path (PDF export, Intelligence Cards,
 * Coaching Brief) already goes through.
 */
import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./matchReport";
import {
  GOLDEN_RESTART_EXPECTATIONS,
  GOLDEN_TEAMS,
  GOLDEN_TURNOVER_EXPECTATIONS,
  buildGoldenReportingFixture,
  mkGoldenEvent,
} from "./golden-fixture";
import type { GoldenFixtureEvent } from "./golden-fixture";
import type { MatchEventKind } from "../../core/stats/stats-event-model";

const NEW_KINDS: MatchEventKind[] = [
  "FORTY_FIVE_WON",
  "FORTY_FIVE_CONCEDED",
  "SIDELINE_WON",
  "SIDELINE_CONCEDED",
  "YELLOW_CARD",
  "SIN_BIN",
  "RED_CARD",
];

function buildFixtureWithNewKindEvents(): GoldenFixtureEvent[] {
  const base = buildGoldenReportingFixture();
  const extra = NEW_KINDS.flatMap((kind, i) => [
    mkGoldenEvent({ kind, teamSide: "FOR", period: "1H", matchClockSeconds: 100 + i }),
    mkGoldenEvent({ kind, teamSide: "OPP", period: "2H", matchClockSeconds: 3700 + i }),
  ]);
  return [...base, ...extra];
}

describe("new event kinds are ignored by the canonical report builder", () => {
  it("does not throw when the match contains the new event kinds", () => {
    const events = buildFixtureWithNewKindEvents();
    expect(() =>
      buildMatchReport({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away, scope: "FULL" }),
    ).not.toThrow();
  });

  it("restart metrics are byte-for-byte identical with the new events present", () => {
    const baseline = buildMatchReport({
      events: buildGoldenReportingFixture(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const withNewKinds = buildMatchReport({
      events: buildFixtureWithNewKindEvents(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });

    expect(withNewKinds.restarts).toEqual(baseline.restarts);
    expect(withNewKinds.restarts.restartShare.full).toEqual(GOLDEN_RESTART_EXPECTATIONS.restartShare);
  });

  it("turnover metrics are byte-for-byte identical with the new events present", () => {
    const baseline = buildMatchReport({
      events: buildGoldenReportingFixture(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const withNewKinds = buildMatchReport({
      events: buildFixtureWithNewKindEvents(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });

    expect(withNewKinds.turnovers).toEqual(baseline.turnovers);
    expect(withNewKinds.turnovers.turnoverShare.full).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull);
  });

  it("the score ledger, placed-ball metrics and restart-team metrics are unchanged", () => {
    const baseline = buildMatchReport({
      events: buildGoldenReportingFixture(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const withNewKinds = buildMatchReport({
      events: buildFixtureWithNewKindEvents(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });

    expect(withNewKinds.ledger).toEqual(baseline.ledger);
    expect(withNewKinds.placedBalls).toEqual(baseline.placedBalls);
    expect(withNewKinds.restartTeams).toEqual(baseline.restartTeams);
    // Scoreline itself (goals/points) must be completely unaffected — none of
    // the new kinds are score kinds.
    expect(withNewKinds.ledger.forScore).toEqual(baseline.ledger.forScore);
    expect(withNewKinds.ledger.oppScore).toEqual(baseline.ledger.oppScore);
  });

  it("the new events are not classified into any PDF/chain kind set (kickout/turnover totals unmoved)", () => {
    const baseline = buildMatchReport({
      events: buildGoldenReportingFixture(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const withNewKinds = buildMatchReport({
      events: buildFixtureWithNewKindEvents(),
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    // chain.kickouts/turnovers totals come only from KICKOUT_*/TURNOVER_*
    // kinds (see chain-engine.ts KICKOUT_KINDS/TURNOVER_KINDS) — adding 14
    // new-kind events (2 per new kind) must not change either total.
    expect(withNewKinds.chain.kickouts.total).toBe(baseline.chain.kickouts.total);
    expect(withNewKinds.chain.turnovers.total).toBe(baseline.chain.turnovers.total);
  });
});
