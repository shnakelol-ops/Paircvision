/**
 * turnoverMetrics.test.ts
 *
 * Regression tests for canonical turnover metrics on the golden fixture.
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "../chains/chain-engine";
import { computeTurnoverMetrics, turnoverMetricLabel } from "./turnoverMetrics";
import {
  GOLDEN_TURNOVER_EXPECTATIONS,
  buildGoldenReportingFixture,
} from "./golden-fixture";

describe("computeTurnoverMetrics — golden fixture", () => {
  const events = buildGoldenReportingFixture();
  const analysis = analyseChains(events);
  const metrics = computeTurnoverMetrics(analysis.turnovers.outcomes);

  it("Turnover Share is 7/12 = 58% overall", () => {
    expect(metrics.turnoverShare.full).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull);
  });

  it("half splits match golden expectations", () => {
    expect(metrics.turnoverShare.h1).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH1);
    expect(metrics.turnoverShare.h2).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH2);
  });

  it("Turnover Wins → Scores is 3/7 = 43%", () => {
    expect(metrics.turnoverWinsToScore).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.winsToScoreFull);
  });

  it("Turnover Losses → Scored Against is 3/5 = 60%", () => {
    expect(metrics.turnoverLossPunishment).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.lossPunishFull);
  });

  it("display labels match locked vocabulary", () => {
    expect(turnoverMetricLabel("turnoverShare")).toBe("Turnover Share");
    expect(turnoverMetricLabel("turnoverWinsToScore")).toBe("Turnover Wins → Scores");
    expect(turnoverMetricLabel("turnoverLossPunishment")).toBe("Turnover Losses → Scored Against");
  });
});
