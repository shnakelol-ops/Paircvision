import { describe, expect, it } from "vitest";
import { createMatchEvent } from "../core/stats/stats-event-model";
import { createReviewSession } from "../stats/reviewSession";
import type { RapidSession } from "./rapid-session";
import type { RapidMatchEvent } from "./rapid-capture-events";
import { deriveHalfAndClockFromEvents, parseImportedMatchFile } from "./rapid-match-import";
import { buildRapidExportPayload } from "./rapid-capture-storage";

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
    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    expect(result.format).toBe("RAPID_CAPTURE");
    expect(result.match.session.forTeamName).toBe("Ballyboden");
    expect(result.match.events.map((e) => e.kind)).toEqual(["KICKOUT_WON", "POINT"]);
    expect(result.match.events.map((e) => e.timestamp)).toEqual([12, 950]);
  });

  // Regression: "Export JSON" (RapidCaptureLitePage.tsx's handleExport, via
  // buildRapidExportPayload) must round-trip through its own "Import JSON"
  // path without losing the squad roster. Losing forSquad/oppSquad here means
  // every player in Review, Player Breakdown, Player Influence, and every PDF
  // falls back to a bare jersey number — no name survives the reload, even
  // though playerNumber-level attribution on each event is untouched.
  it("round-trips forSquad/oppSquad through export -> JSON -> import", () => {
    const sessionWithSquads: RapidSession = {
      ...session,
      forSquad: [{ id: "p1", number: 3, name: "A. Player" }, { id: "p2", number: 9, name: "B. Player" }],
      oppSquad: [{ id: "p3", number: 5, name: "C. Player" }],
    };
    const events: RapidMatchEvent[] = sampleEvents as unknown as RapidMatchEvent[];

    const payload = buildRapidExportPayload(sessionWithSquads, events);
    const raw = JSON.stringify(payload);
    const result = parseImportedMatchFile(raw);

    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    expect(result.match.session.forSquad).toEqual(sessionWithSquads.forSquad);
    expect(result.match.session.oppSquad).toEqual(sessionWithSquads.oppSquad);
  });

  it("omits forSquad/oppSquad on export when no roster was ever set, rather than emitting an empty array", () => {
    const payload = buildRapidExportPayload(session, sampleEvents as unknown as RapidMatchEvent[]);
    expect(payload.session.forSquad).toBeUndefined();
    expect(payload.session.oppSquad).toBeUndefined();
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
    expect(result.status).toBe("ok");
    if (result.status === "error") return;
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
    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    expect(result.format).toBe("EVENT_STATS");
    expect(result.match.session.forTeamName).toBe("St Judes");
    // No distinct Rapid Capture sport for ladies football — falls back to gaelic.
    expect(result.match.session.sport).toBe("gaelic");
    expect(result.match.session.attackDirection).toBe("left");
    expect(result.match.session.halfDurationMinutes).toBe(25);
  });

  it("extracts squad rosters for the Player Recognition bar when present", () => {
    const raw = JSON.stringify({
      id: "pro-match-2",
      createdAt: Date.now(),
      homeTeamName: "St Judes",
      awayTeamName: "Ballinteer St Johns",
      venue: "",
      sport: "gaelic",
      matchType: "league",
      halfDurationMinutes: 30,
      scorelineSnapshot: "",
      eventCount: sampleEvents.length,
      events: sampleEvents,
      homeSquad: {
        id: "h",
        teamSide: "HOME",
        players: [
          { id: "p1", number: 3, name: "A. Player", position: "FB" },
          { id: "p2", number: 9, name: "B. Player", position: "MF" },
        ],
      },
      awaySquad: { id: "a", teamSide: "AWAY", players: [] },
      homeSquadLiveState: [],
      awaySquadLiveState: [],
      restoreContext: {
        matchState: "FIRST_HALF",
        currentHalf: 1,
        matchTimeSeconds: 0,
        firstHalfAttackingDirection: "right",
      },
    });
    const result = parseImportedMatchFile(raw);
    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    expect(result.match.session.forSquad).toEqual([
      { id: "p1", number: 3, name: "A. Player" },
      { id: "p2", number: 9, name: "B. Player" },
    ]);
    // An empty players array yields no roster — falls back to default jersey numbers.
    expect(result.match.session.oppSquad).toBeUndefined();
  });
});

describe("rejection", () => {
  it("rejects invalid JSON gracefully", () => {
    const result = parseImportedMatchFile("{not json");
    expect(result.status).toBe("error");
  });

  it("rejects an unrecognised shape gracefully", () => {
    const result = parseImportedMatchFile(JSON.stringify({ hello: "world" }));
    expect(result.status).toBe("error");
  });

  it("rejects a Rapid Capture file containing a structurally invalid event", () => {
    const raw = JSON.stringify({
      version: 2,
      session,
      events: [...sampleEvents, { id: "bad", kind: "NOT_REAL" }],
      exportedAt: new Date().toISOString(),
    });
    const result = parseImportedMatchFile(raw);
    expect(result.status).toBe("error");
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
