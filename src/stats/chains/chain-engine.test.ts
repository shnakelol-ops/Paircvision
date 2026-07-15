/**
 * chain-engine.test.ts
 *
 * Regression coverage for buildTurnoverDataset()'s team-scoping fix.
 *
 * won/lost/wonToScore/wonToShot/lostAllowedScore must be FOR-perspective
 * counts — the opposition's own mirror-logged TURNOVER_WON events (their
 * restart, not ours) must be counted as a loss for us, never summed into
 * our own "won" figure. buildKickoutDataset already does this correctly
 * via a derived winningSide; buildTurnoverDataset previously gated only on
 * raw event kind, so a match with mirror-logged opposition turnovers showed
 * "won 16 of 16" (both teams' wins summed) instead of "won 10, lost 6".
 */

import { describe, expect, it } from "vitest";
import type { ChainableEvent } from "./chain-types";
import { selectChainAnalysis } from "./chain-selectors";
import {
  ADARE_MUNGRET_EXPECTATIONS,
  buildAdareMungretFixture,
} from "../reporting/adare-mungret-fixture";

let nextId = 0;
function ev(partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide">): ChainableEvent {
  return {
    id: `ce-${nextId++}`,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("buildTurnoverDataset — FOR-perspective won/lost scoping", () => {
  it("does not sum the opposition's own mirror-logged turnover wins into our won count", () => {
    // FOR's own win, then OPP's own mirror-logged win (their restart, our loss).
    const events: ChainableEvent[] = [
      ev({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 0 }),
      ev({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 60 }),
    ];
    const analysis = selectChainAnalysis(events);
    expect(analysis.turnovers.won).toBe(1);
    expect(analysis.turnovers.lost).toBe(1);
    expect(analysis.turnovers.total).toBe(2);
  });

  it("handles a mix of FOR/OPP mirror-logged wins and FOR-logged losses consistently", () => {
    const events: ChainableEvent[] = [
      ev({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 0 }),
      ev({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 60 }),
      ev({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 120 }),
      ev({ kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 180 }),
    ];
    const analysis = selectChainAnalysis(events);
    // 2 FOR-side wins + 1 OPP-side win (our loss) + 1 FOR-logged loss (also our loss) = won 2, lost 2.
    expect(analysis.turnovers.won).toBe(2);
    expect(analysis.turnovers.lost).toBe(2);
    expect(analysis.turnovers.total).toBe(4);
  });

  it("scores from an opposition-won turnover count toward lostAllowedScore, not wonToScore", () => {
    const events: ChainableEvent[] = [
      ev({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 0 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 10 }),
    ];
    const analysis = selectChainAnalysis(events);
    expect(analysis.turnovers.won).toBe(0);
    expect(analysis.turnovers.lost).toBe(1);
    expect(analysis.turnovers.wonToScore).toBe(0);
    expect(analysis.turnovers.lostAllowedScore).toBe(1);
  });

  it("Adare v Mungret fixture — won 10, lost 6, matching the locked ADARE_MUNGRET_EXPECTATIONS", () => {
    const events = buildAdareMungretFixture();
    const analysis = selectChainAnalysis(events);
    expect(analysis.turnovers.won).toBe(ADARE_MUNGRET_EXPECTATIONS.turnovers.forWon);
    expect(analysis.turnovers.lost).toBe(ADARE_MUNGRET_EXPECTATIONS.turnovers.oppWon);
    expect(analysis.turnovers.total).toBe(
      ADARE_MUNGRET_EXPECTATIONS.turnovers.forWon + ADARE_MUNGRET_EXPECTATIONS.turnovers.oppWon,
    );

    // Turnover share must read 63% (10 of 16), never "16 of 16" / 100%.
    const sharePct = Math.round((analysis.turnovers.won / analysis.turnovers.total) * 100);
    expect(sharePct).toBe(63);

    // wonToScore/lostAllowedScore also FOR-scoped, matching turnoverOriginScore.
    expect(analysis.turnovers.wonToScore).toBe(ADARE_MUNGRET_EXPECTATIONS.turnoverOriginScore.for.num);
  });
});
