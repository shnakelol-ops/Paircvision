/**
 * quickReviewMatchOverview.provenance.test.ts
 *
 * Structural provenance guard for Quick Review Page 1, mirroring
 * snapshotDashboardModel.test.ts's forbidden-key scan, PLUS the specific
 * regression this audit called out as "especially important": a fixture
 * where the immediate-possession-outcome figure and the chain-origin
 * figure for the SAME restart/turnover genuinely disagree, so a future
 * change that accidentally wires report.restarts.restartToScore /
 * report.turnovers.turnoverWinsToScore into Quick Review (instead of
 * report.possessions.*) fails this test immediately rather than merely
 * "looking plausible" on data where the two models happen to agree.
 */
import { describe, expect, it } from "vitest";
import type { ChainableEvent } from "../chains/chain-types";
import { buildMatchReport } from "./matchReport";
import {
  buildQuickReviewMatchOverview,
  QUICK_REVIEW_FORBIDDEN_KEYS,
} from "./quickReviewMatchOverview";
import { scanForForbiddenKeys, containsCoachingLanguage } from "./reportProvenance";
import { buildBallylandersFrCaseysFixture, BALLYLANDERS_FRCASEYS_TEAMS } from "./ballylanders-frcaseys-fixture";

function e(partial: Partial<ChainableEvent> & Pick<ChainableEvent, "id" | "kind" | "teamSide" | "matchClockSeconds">): ChainableEvent {
  return {
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("quickReviewMatchOverview — structural provenance guard", () => {
  it("the built model never contains a chain-origin/rule-match field name at any depth", () => {
    const events = buildBallylandersFrCaseysFixture();
    const model = buildQuickReviewMatchOverview(
      events,
      BALLYLANDERS_FRCASEYS_TEAMS.home,
      BALLYLANDERS_FRCASEYS_TEAMS.away,
    );
    const hits = scanForForbiddenKeys(model, [...QUICK_REVIEW_FORBIDDEN_KEYS]);
    expect(hits).toEqual([]);
  });

  it("no Page 1 display text contains recommendation/tactical/coaching language", () => {
    const events = buildBallylandersFrCaseysFixture();
    const model = buildQuickReviewMatchOverview(
      events,
      BALLYLANDERS_FRCASEYS_TEAMS.home,
      BALLYLANDERS_FRCASEYS_TEAMS.away,
    );
    const texts = [
      model.score.text,
      model.score.home.text,
      model.score.away.text,
      model.shooting.for.text,
      model.shooting.opp.text,
      model.restarts.ours.text,
      model.restarts.theirs.text,
      model.frees.placed.text,
    ];
    for (const text of texts) {
      expect(containsCoachingLanguage(text)).toBe(false);
    }
  });

  describe("restart won → shots/scores: immediate possession outcome vs chain-origin genuinely disagree on this fixture", () => {
    // FOR wins a kickout, immediately turns it over (no shot), then — much
    // later in the same 90s window — scores from an unrelated phase. The
    // immediate consequence of THIS kickout was a turnover, not a score.
    const events: ChainableEvent[] = [
      e({ id: "k1", kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 0 }),
      e({ id: "t1", kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 10 }),
      e({ id: "p1", kind: "POINT", teamSide: "FOR", matchClockSeconds: 50 }),
    ];

    it("possession-outcomes engine (correct, immediate) reports zero shots/scores from this kickout win", () => {
      const report = buildMatchReport({ events, scope: "FULL", homeTeam: "Home", awayTeam: "Away" });
      expect(report.possessions.kickouts.retained.goals + report.possessions.kickouts.retained.points).toBe(0);
    });

    it("chain-origin engine (wrong source for Quick Review) DOES attribute the later score to this kickout — proving the two are not interchangeable", () => {
      const report = buildMatchReport({ events, scope: "FULL", homeTeam: "Home", awayTeam: "Away" });
      expect(report.restarts.restartToScore.num).toBe(1);
    });

    it("Quick Review's restart won → scores matches the possession-outcome figure (0), not the chain-origin figure (1)", () => {
      const model = buildQuickReviewMatchOverview(events, "Home", "Away");
      expect(model.restarts.won.scores).toBe(0);
      expect(model.restarts.won.shots).toBe(0);
    });
  });

  describe("turnovers won → shots/scores: immediate possession outcome vs chain-origin genuinely disagree on this fixture", () => {
    // FOR wins a turnover; the very next event is an unrelated opposition
    // restart (a new possession phase begins) before FOR eventually scores
    // from that unrelated phase. The immediate consequence of THIS turnover
    // was neither a shot nor a score — possession had already moved on.
    const events: ChainableEvent[] = [
      e({ id: "to1", kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 300 }),
      e({ id: "ko1", kind: "KICKOUT_CONCEDED", teamSide: "OPP", matchClockSeconds: 310 }),
      e({ id: "p2", kind: "POINT", teamSide: "FOR", matchClockSeconds: 340 }),
    ];

    it("possession-outcomes engine (correct, immediate) reports zero shots/scores from this turnover win", () => {
      const report = buildMatchReport({ events, scope: "FULL", homeTeam: "Home", awayTeam: "Away" });
      expect(report.possessions.turnovers.retained.goals + report.possessions.turnovers.retained.points).toBe(0);
    });

    it("chain-origin engine (wrong source for Quick Review) DOES attribute the later score to this turnover — proving the two are not interchangeable", () => {
      const report = buildMatchReport({ events, scope: "FULL", homeTeam: "Home", awayTeam: "Away" });
      expect(report.turnovers.turnoverWinsToScore.num).toBe(1);
    });

    it("Quick Review's turnovers won → scores matches the possession-outcome figure (0), not the chain-origin figure (1)", () => {
      const model = buildQuickReviewMatchOverview(events, "Home", "Away");
      expect(model.turnovers.won.scores).toBe(0);
      expect(model.turnovers.won.shots).toBe(0);
    });
  });
});
