import { describe, expect, it } from "vitest";
import { deriveCoachingBrief, type CoachingBriefLine } from "./coachingBrief";
import { buildMatchIntelligenceSummary } from "./matchIntelligenceSummary";
import { loadBallylandersGalballyFixture } from "./reporting/ballylanders-galbally-real-fixture";
import { buildRathkealeOolaChainFixture, RATHKEALE_OOLA_TEAMS } from "./reporting/rathkeale-oola-chain-fixture";
import type { ChainableEvent } from "./chains/chain-types";
import type { MatchEvent } from "../core/stats/stats-event-model";

type BriefEvent = Parameters<typeof deriveCoachingBrief>[0]["loggedEvents"][number];

/** Logged-event shape the in-app notes receive (half + team instead of period + teamSide). */
function toLogged(events: readonly ChainableEvent[]): BriefEvent[] {
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    half: e.period === "1H" ? 1 : 2,
    timestamp: e.matchClockSeconds ?? 0,
    matchClockSeconds: e.matchClockSeconds ?? undefined,
    team: e.teamSide === "FOR" ? "HOME" : "AWAY",
    nx: e.nx,
    ny: e.ny,
    ...("playerNumber" in e ? { playerNumber: (e as { playerNumber?: number }).playerNumber } : {}),
  }));
}

function texts(lines: CoachingBriefLine[]): string[] {
  return lines.flatMap((l) => ("text" in l ? [l.text] : []));
}

const UNSUPPORTED = [
  /led throughout/i,
  /led for most of the match/i,
  /managed the game/i,
  /controlled the tempo/i,
  /controlled the contest/i,
  /territory advantage/i,
  /work rate/i,
  /winning games/i,
  /took the big chances|taking the big chances/i,
  /placed balls/i,
  /\dth min/,
];

describe("deriveCoachingBrief — Ballylanders v Galbally FT Summary", () => {
  const f = loadBallylandersGalballyFixture();
  const intel = buildMatchIntelligenceSummary(f.events as unknown as MatchEvent[], f.homeTeam, f.awayTeam, "FT", "kickout");
  const lines = texts(deriveCoachingBrief({
    loggedEvents: toLogged(f.events),
    matchState: "FULL_TIME",
    homeTeamName: f.homeTeam,
    awayTeamName: f.awayTeam,
    isHurlingMode: false,
    intelligence: intel,
  }));

  it("contains no narrative inferred from the margin and no 'placed balls' for frees", () => {
    for (const pattern of UNSUPPORTED) {
      expect(lines.filter((t) => pattern.test(t)), String(pattern)).toEqual([]);
    }
    expect(lines).not.toContain("MATCH STORY");
  });

  it("keeps the verified result and states frees as possession frees", () => {
    expect(lines).toContain("Ballylanders won — 4 clear");
    expect(lines).toContain("Ballylanders conceded 11 possession frees.");
  });

  it("says whose kickouts Galbally won", () => {
    expect(lines).toContain("Galbally scored from 2 of the 2 Ballylanders kickouts they won");
    expect(lines).toContain("Win the kickout — Galbally scored from 2 of the 2 Ballylanders kickouts they won");
  });
});

describe("deriveCoachingBrief — Ballylanders v Galbally HT Notes", () => {
  const f = loadBallylandersGalballyFixture();
  const firstHalf = f.events.filter((e) => e.period === "1H");
  const intel = buildMatchIntelligenceSummary(firstHalf as unknown as MatchEvent[], f.homeTeam, f.awayTeam, "HT", "kickout");
  const lines = texts(deriveCoachingBrief({
    loggedEvents: toLogged(f.events),
    matchState: "HALF_TIME",
    homeTeamName: f.homeTeam,
    awayTeamName: f.awayTeam,
    isHurlingMode: false,
    intelligence: intel,
  }));

  it("has no MATCH PATTERN section and keeps the factual margin", () => {
    expect(lines).not.toContain("MATCH PATTERN");
    expect(lines).toContain("Ballylanders ahead by 2");
    for (const pattern of UNSUPPORTED) {
      expect(lines.filter((t) => pattern.test(t)), String(pattern)).toEqual([]);
    }
  });
});

describe("deriveCoachingBrief — longest scoring run", () => {
  it("names both teams on a tie and labels minutes the way the Full Report does", () => {
    const lines = texts(deriveCoachingBrief({
      loggedEvents: toLogged(buildRathkealeOolaChainFixture()),
      matchState: "FULL_TIME",
      homeTeamName: RATHKEALE_OOLA_TEAMS.home,
      awayTeamName: RATHKEALE_OOLA_TEAMS.away,
      isHurlingMode: false,
    }));
    expect(lines).toContain("LONGEST SCORING RUN");
    expect(lines).not.toContain("TURNING POINT");
    const run = lines.find((t) => t.includes("unanswered scores"));
    expect(run).toBe("Rathkeale and Oola each hit 4 unanswered scores (Rathkeale 1H 0'–7'; Oola 1H 10'–17').");
  });
});
