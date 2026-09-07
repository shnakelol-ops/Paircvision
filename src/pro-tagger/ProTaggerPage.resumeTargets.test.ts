// P1-A regression coverage: savedMatchToSession must preserve MatchTargets
// on reopen. Every subsequent save (autosave, manual Save, Save & Finish —
// see buildSaveRecords, ProTaggerLiveScreen.tsx) writes session.targets back
// out unconditionally, so a resumed session that never hydrated targets from
// the saved match would silently drop them from that point on.
import { describe, expect, it } from "vitest";
import { savedMatchToSession } from "./ProTaggerPage";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { MatchTargets } from "../stats/matchTargets";

function buildMatch(overrides: Partial<ProTaggerSavedMatch> = {}): ProTaggerSavedMatch {
  return {
    id: "match-1",
    createdAt: 1000,
    homeTeamName: "Adare",
    awayTeamName: "Mungret",
    venue: "Adare GAA Grounds",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Adare 0-04 (4) v Mungret 0-02 (2)",
    eventCount: 0,
    events: [],
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "SECOND_HALF",
      currentHalf: 2,
      matchTimeSeconds: 900,
      firstHalfAttackingDirection: "right",
    },
    ...overrides,
  };
}

const targets: MatchTargets = {
  targets: [
    { metric: "shots", targetValue: 20, direction: "atLeast", enabled: true },
    { metric: "turnoversLost", targetValue: 5, direction: "atMost", enabled: true },
  ],
};

describe("savedMatchToSession — MatchTargets round-trip (P1-A)", () => {
  it("carries MatchTargets through to the resumed session unchanged", () => {
    const match = buildMatch({ targets });
    const session = savedMatchToSession(match);
    expect(session.targets).toEqual(targets);
  });

  it("a match saved with no targets resumes with no targets (no fabricated defaults)", () => {
    const match = buildMatch(); // targets omitted
    const session = savedMatchToSession(match);
    expect(session.targets).toBeUndefined();
  });

  it("resumed session.targets round-trips through a second save-record build unchanged (matches buildSaveRecords' `targets: session.targets` pass-through)", () => {
    const match = buildMatch({ targets });
    const session = savedMatchToSession(match);
    // Mirrors exactly what buildSaveRecords (ProTaggerLiveScreen.tsx) does
    // with session.targets when re-saving a resumed match.
    const reSaved = { ...match, targets: session.targets };
    expect(reSaved.targets).toEqual(targets);
  });
});
