/**
 * chain-patterns.test.ts
 *
 * Regression coverage for the KICKOUT RISK (DANGER_CHAIN) candidate's
 * population fix: the own-kickout-loss occurrence count and the paired
 * "opposition scored" breakdown must come from the same kickout population
 * — restartOwner = FOR (we took it), winner = OPP (they won it) — never
 * from the broader all-restarts-lost set, which also includes restarts the
 * opposition took and simply retained (their own kickout, not ours to lose).
 */

import { describe, expect, it } from "vitest";
import type { ChainableEvent } from "./chain-types";
import { rankChainPatterns } from "./chain-patterns";
import { selectChainAnalysis } from "./chain-selectors";
import { computeRestartTeamMetrics } from "../reporting/restartTeamMetrics";

let nextId = 0;
function ev(partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide">): ChainableEvent {
  return {
    id: `cp-${nextId++}`,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

function analyse(events: ChainableEvent[]) {
  const analysis = selectChainAnalysis(events);
  const restartTeams = computeRestartTeamMetrics(analysis.kickouts.outcomes);
  const patterns = rankChainPatterns(analysis, "FT", "Home", "Away", restartTeams);
  return { analysis, restartTeams, patterns };
}

function dangerChain(patterns: ReturnType<typeof analyse>["patterns"]) {
  return patterns.find((p) => p.kind === "DANGER_CHAIN") ?? null;
}

describe("KICKOUT RISK (DANGER_CHAIN) — own-kickout-loss population", () => {
  it("counts a score from our lost kickout", () => {
    // We take a kickout and lose it (restartOwner FOR, kind CONCEDED),
    // immediately followed by an opposition score — this must qualify and
    // be counted, twice over, to clear the FT threshold (scores>=1, occurrences>=2).
    const events: ChainableEvent[] = [
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 0 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 10 }),
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 200 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 210 }),
    ];
    const { patterns, restartTeams } = analyse(events);
    expect(restartTeams.for.ownRestartsLost).toBe(2);

    const risk = dangerChain(patterns);
    expect(risk).not.toBeNull();
    expect(risk!.occurrences).toBe(2);
    expect(risk!.primaryMetric).toBe(2);
    expect(risk!.observation).toContain("2 of 2 own kickouts");
    expect(risk!.observation).toContain("2 Points");
  });

  it("does not count a score from an opposition-retained kickout", () => {
    // Opposition takes and retains their own kickout (restartOwner OPP,
    // logged from our mirror perspective as CONCEDED), immediately followed
    // by an opposition score — this is their restart, not ours to have lost,
    // so it must not inflate the own-kickout-loss score count.
    const events: ChainableEvent[] = [
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "OPP", matchClockSeconds: 0 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 10 }),
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "OPP", matchClockSeconds: 200 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 210 }),
    ];
    const { patterns, restartTeams } = analyse(events);
    expect(restartTeams.for.ownRestartsLost).toBe(0);

    // No own-kickout losses at all, so the card cannot qualify regardless
    // of how many opposition-retained-kickout scores exist.
    expect(dangerChain(patterns)).toBeNull();
  });

  it("separates own-lost scores from opposition-retained scores in the same match", () => {
    // One own-kickout loss that leads to a score, and one opposition-
    // retained kickout that also leads to a score — the DANGER_CHAIN card's
    // score figure must reflect only the first, not their sum.
    const events: ChainableEvent[] = [
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 0 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 10 }),
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 200 }),
      ev({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 210 }),
      ev({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "OPP", matchClockSeconds: 400 }),
      ev({ kind: "GOAL", teamSide: "OPP", matchClockSeconds: 410 }),
    ];
    const { patterns, restartTeams } = analyse(events);
    expect(restartTeams.for.ownRestartsLost).toBe(2);

    const risk = dangerChain(patterns);
    expect(risk).not.toBeNull();
    // Two own-kickout losses, both followed by a score — the opposition's
    // own retained-kickout goal must not be added on top.
    expect(risk!.occurrences).toBe(2);
    expect(risk!.primaryMetric).toBe(2);
    expect(risk!.observation).not.toContain("Goal");
  });

  it("does not qualify with zero own-kickout losses", () => {
    // Every kickout we took, we retained — no own losses at all.
    const events: ChainableEvent[] = [
      ev({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 0 }),
      ev({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 200 }),
    ];
    const { patterns, restartTeams } = analyse(events);
    expect(restartTeams.for.ownRestartsLost).toBe(0);
    expect(dangerChain(patterns)).toBeNull();
  });
});
