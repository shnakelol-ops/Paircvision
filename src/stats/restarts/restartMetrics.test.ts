/**
 * restartMetrics.test.ts
 *
 * Regression fixture derived from the Ballylanders v St.Patricks spec values
 * (the real 82-event match lives in device storage, not in the repo — this
 * fixture reproduces its restart battle exactly):
 *
 *   Restart Share            15/24 = 63%
 *   Own Kickout Retention    1H 4/5 = 80% · 2H 6/8 = 75% · match 10/13 = 77%
 *   Won on Their Kickout     5/11 = 45%
 *   Restarts Won → Scores    5/15 = 33%
 *   Restarts Lost → Scored Against  4/9 = 44%
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "../chains/chain-engine";
import { deriveReviewPrompts } from "../chains/review-prompts";
import type { ChainableEvent } from "../chains/chain-types";
import {
  computeRestartMetrics,
  restartAttributionFootnote,
  restartAttributionFootnoteShort,
  restartExplainerLine,
  restartMetricLabel,
} from "./restartMetrics";

type FixtureEvent = ChainableEvent;

let nextId = 0;
function mkEvent(partial: Partial<FixtureEvent> & Pick<FixtureEvent, "kind" | "teamSide">): FixtureEvent {
  const period = partial.period ?? "1H";
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `fixture-${nextId++}`,
    period,
    segment: partial.segment ?? (clock < 600 ? (period === "1H" ? 1 : 4) : clock < 1200 ? (period === "1H" ? 2 : 5) : (period === "1H" ? 3 : 6)),
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

/**
 * Builds the restart fixture. Restarts are spaced 120s apart; when a restart
 * produces a score, the score lands 20s after it (inside the 90s chain window,
 * before the next restart resets the scan).
 */
function buildRestartFixture(): FixtureEvent[] {
  const events: FixtureEvent[] = [];
  let clock = 0;
  let half: "1H" | "2H" = "1H";

  function restart(
    owner: "FOR" | "OPP",
    winner: "FOR" | "OPP",
    scored: boolean,
  ): void {
    clock += 120;
    // winningSide in the chain engine: KICKOUT_WON → teamSide, KICKOUT_CONCEDED
    // → opposite side. All events are logged from Ballylanders' perspective.
    events.push(
      mkEvent({
        kind: winner === "FOR" ? "KICKOUT_WON" : "KICKOUT_CONCEDED",
        teamSide: "FOR",
        restartOwner: owner,
        period: half,
        matchClockSeconds: clock,
      }),
    );
    if (scored) {
      events.push(
        mkEvent({
          kind: "POINT",
          teamSide: winner,
          period: half,
          matchClockSeconds: clock + 20,
        }),
      );
    }
  }

  // ── 1H: own kickouts 5, retained 4 (80%) ──────────────────────────────────
  restart("FOR", "FOR", true);   // own retained → score
  restart("FOR", "FOR", false);
  restart("FOR", "FOR", true);   // own retained → score
  restart("FOR", "FOR", false);
  restart("FOR", "OPP", true);   // own lost → punished
  // 1H: their kickouts 5, we won 2
  restart("OPP", "FOR", true);   // their kickout won → score
  restart("OPP", "FOR", false);
  restart("OPP", "OPP", true);   // they kept → punished
  restart("OPP", "OPP", false);
  restart("OPP", "OPP", false);

  // ── 2H: own kickouts 8, retained 6 (75%) ──────────────────────────────────
  half = "2H"; clock = 0;
  restart("FOR", "FOR", true);   // own retained → score
  restart("FOR", "FOR", false);
  restart("FOR", "FOR", false);
  restart("FOR", "FOR", true);   // own retained → score
  restart("FOR", "FOR", false);
  restart("FOR", "FOR", false);
  restart("FOR", "OPP", true);   // own lost → punished
  restart("FOR", "OPP", false);
  // 2H: their kickouts 6, we won 3
  restart("OPP", "FOR", false);
  restart("OPP", "FOR", false);
  restart("OPP", "FOR", false);
  restart("OPP", "OPP", true);   // they kept → punished
  restart("OPP", "OPP", false);
  restart("OPP", "OPP", false);

  return events;
}

describe("computeRestartMetrics — spec fixture values", () => {
  const events = buildRestartFixture();
  const analysis = analyseChains(events);
  const metrics = computeRestartMetrics(analysis.kickouts.outcomes);

  it("Restart Share is 15/24 = 63%", () => {
    expect(metrics.restartShare.full).toEqual({ num: 15, den: 24, pct: 63 });
  });

  it("Own Kickout Retention is 4/5 (80%) in 1H, 6/8 (75%) in 2H, 10/13 (77%) overall", () => {
    expect(metrics.ownKickoutRetention.h1).toEqual({ num: 4, den: 5, pct: 80 });
    expect(metrics.ownKickoutRetention.h2).toEqual({ num: 6, den: 8, pct: 75 });
    expect(metrics.ownKickoutRetention.full).toEqual({ num: 10, den: 13, pct: 77 });
  });

  it("Won on Their Kickout is 5/11 = 45%", () => {
    expect(metrics.oppKickoutWinRate.full).toEqual({ num: 5, den: 11, pct: 45 });
  });

  it("Restarts Won → Scores is 5/15 = 33%", () => {
    expect(metrics.restartToScore).toEqual({ num: 5, den: 15, pct: 33 });
  });

  it("Restarts Lost → Scored Against is 4/9 = 44%", () => {
    expect(metrics.restartLossPunishment).toEqual({ num: 4, den: 9, pct: 44 });
  });
});

describe("canonical naming rules", () => {
  it("display labels match the locked vocabulary", () => {
    expect(restartMetricLabel("restartShare")).toBe("Restart Share");
    expect(restartMetricLabel("ownKickoutRetention")).toBe("Own Kickout Retention");
    expect(restartMetricLabel("ownKickoutRetention", "hurling")).toBe("Own Puckout Retention");
    expect(restartMetricLabel("oppKickoutWinRate")).toBe("Won on Their Kickout");
    expect(restartMetricLabel("restartToScore")).toBe("Restarts Won → Scores");
    expect(restartMetricLabel("restartLossPunishment")).toBe("Restarts Lost → Scored Against");
  });

  it("attribution footnotes match the spec verbatim", () => {
    expect(restartAttributionFootnote("gaelic")).toBe(
      "Restart-origin counts every score in a possession that began with a kickout, " +
      "including frees won during it. Direct restart scores attribute placed balls " +
      "separately, so ledger sources sum to the final margin.",
    );
    expect(restartAttributionFootnoteShort()).toBe(
      "Origin possessions include later frees won during the same possession. The scoring ledger attributes those scores to placed balls.",
    );
  });

  it("explainer line replaces the old 'both are correct' disclaimer", () => {
    expect(restartExplainerLine("gaelic")).toBe(
      "Restart Share counts every kickout in the game. Own Kickout Retention counts only our own.",
    );
  });

  it("review prompts label the all-restarts figure as Restart Share and never as retention", () => {
    const events = buildRestartFixture();
    const analysis = analyseChains(events);
    const prompts = deriveReviewPrompts(analysis, "Ballylanders", "St.Patricks");
    const kickoutPrompts = prompts.filter((p) => p.category === "KICKOUT");
    expect(kickoutPrompts.length).toBeGreaterThan(0);
    const shareText = kickoutPrompts.map((p) => p.text).join(" ");
    expect(shareText).toContain("Restart Share");
    expect(shareText).toContain("Ballylanders held 63% Restart Share (15 of 24)");
    for (const p of prompts) {
      expect(p.text.toLowerCase()).not.toContain("retention");
    }
  });
});
