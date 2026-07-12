import { describe, expect, it } from "vitest";
import { createMatchEvent } from "../core/stats/stats-event-model";
import { createReviewSession } from "../stats/reviewSession";
import type { RapidSession } from "./rapid-session";
import { deriveHalfAndClockFromEvents, parseImportedMatchFile } from "./rapid-match-import";

const session: RapidSession = {
  sport: "hurling",
  forTeamName: "Ballyboden",
  oppTeamName: "Na Fianna",
  venue: "Croke Park",
  matchType: "championship",
  forTeamColour: "#1f6feb",
  oppTeamColour: "#b91c1c",
  attackDirection: "right",
  halfDurationMinutes: 30,
};

const sampleEvents = [
  createMatchEvent({ kind: "KICKOUT_WON", nx: 0.3, ny: 0.5, half: 1, timestamp: 12, teamSide: "FOR" }),
  createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 2, timestamp: 950, teamSide: "OPP" }),
];

describe("Rapid Capture format", () => {
  it("recognises and loads its own export shape", () => {
    const raw = JSON.stringify({
      version: 2,
      session,
      events: sampleEvents,
      exportedAt: new Date().toISOString(),
    });
    const result = parseImportedMatchFile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("RAPID_CAPTURE");
    expect(result.match.session.forTeamName).toBe("Ballyboden");
    expect(result.match.events.map((e) => e.kind)).toEqual(["KICKOUT_WON", "POINT"]);
    expect(result.match.events.map((e) => e.timestamp)).toEqual([12, 950]);
  });
});

describe("Match Stats format", () => {
  it("recognises a ReviewSession export and maps team names", () => {
    const reviewSession = createReviewSession({
      matchInfo: { homeTeam: "Kilmacud Crokes", awayTeam: "Cuala", venue: "Parnell Park" },
      events: sampleEvents,
      reviewContext: { period: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL" },
    });
    const raw = JSON.stringify(reviewSession);
    const result = parseImportedMatchFile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("MATCH_STATS");
    expect(result.match.session.forTeamName).toBe("Kilmacud Crokes");
    expect(result.match.session.oppTeamName).toBe("Cuala");
    expect(result.match.session.venue).toBe("Parnell Park");
    expect(result.match.events).toHaveLength(2);
  });
});

describe("Event Stats (Pro Tagger) format", () => {
  it("recognises a versionless Pro Tagger export and maps sport/attack direction", () => {
    const raw = JSON.stringify({
      id: "pro-match-1",
      createdAt: Date.now(),
      homeTeamName: "St Judes",
      awayTeamName: "Ballinteer St Johns",
      venue: "",
      sport: "ladies_football",
      matchType: "league",
      halfDurationMinutes: 25,
      scorelineSnapshot: "0-05 to 0-03",
      eventCount: sampleEvents.length,
      events: sampleEvents,
      homeSquad: { id: "h", teamSide: "HOME", players: [] },
      awaySquad: { id: "a", teamSide: "AWAY", players: [] },
      homeSquadLiveState: [],
      awaySquadLiveState: [],
      restoreContext: {
        matchState: "FIRST_HALF",
        currentHalf: 1,
        matchTimeSeconds: 0,
        firstHalfAttackingDirection: "left",
      },
    });
    const result = parseImportedMatchFile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("EVENT_STATS");
    expect(result.match.session.forTeamName).toBe("St Judes");
    // No distinct Rapid Capture sport for ladies football — falls back to gaelic.
    expect(result.match.session.sport).toBe("gaelic");
    expect(result.match.session.attackDirection).toBe("left");
    expect(result.match.session.halfDurationMinutes).toBe(25);
  });
});

describe("rejection", () => {
  it("rejects invalid JSON gracefully", () => {
    const result = parseImportedMatchFile("{not json");
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognised shape gracefully", () => {
    const result = parseImportedMatchFile(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a Rapid Capture file containing a structurally invalid event", () => {
    const raw = JSON.stringify({
      version: 2,
      session,
      events: [...sampleEvents, { id: "bad", kind: "NOT_REAL" }],
      exportedAt: new Date().toISOString(),
    });
    const result = parseImportedMatchFile(raw);
    expect(result.ok).toBe(false);
  });
});

describe("deriveHalfAndClockFromEvents", () => {
  it("defaults to half 1 / 0 seconds for an empty match", () => {
    expect(deriveHalfAndClockFromEvents([])).toEqual({ half: 1, clockSeconds: 0 });
  });

  it("picks the latest half present and the max clock within that half", () => {
    expect(deriveHalfAndClockFromEvents(sampleEvents)).toEqual({ half: 2, clockSeconds: 950 });
  });
});
