import { describe, expect, it } from "vitest";
import { buildCapturedEvent, type RapidMatchEvent } from "./rapid-capture-events";
import {
  rapidMatchToIntelligencePackInput,
  rapidMatchToSnapshotPdfInput,
  rapidSessionToReviewPdfInput,
} from "./rapid-capture-review-adapter";
import type { RapidSavedMatch } from "./rapid-capture-storage";
import type { RapidSession } from "./rapid-session";

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

function buildMatch(overrides: Partial<RapidSavedMatch> = {}): RapidSavedMatch {
  return {
    schemaVersion: 1,
    id: "match-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "IN_PROGRESS",
    session,
    events: [],
    half: 1,
    clockSeconds: 0,
    matchState: "FIRST_HALF",
    ...overrides,
  };
}

describe("rapidSessionToReviewPdfInput — field mapping", () => {
  it("maps session metadata into the ReviewPdfExportInput contract", () => {
    const match = buildMatch();
    const input = rapidSessionToReviewPdfInput(match);
    expect(input.homeTeamName).toBe("Ballyboden");
    expect(input.awayTeamName).toBe("Na Fianna");
    expect(input.venueName).toBe("Croke Park");
    expect(input.sport).toBe("hurling");
  });

  it("omits venueName when venue is blank", () => {
    const match = buildMatch({ session: { ...session, venue: "" } });
    expect(rapidSessionToReviewPdfInput(match).venueName).toBeUndefined();
  });

  it("maps every RapidSession sport to the identical PitchSport value", () => {
    (["hurling", "camogie", "gaelic", "soccer"] as const).forEach((sport) => {
      const match = buildMatch({ session: { ...session, sport } });
      expect(rapidSessionToReviewPdfInput(match).sport).toBe(sport);
    });
  });

  it("maps squad rosters, synthesising id/name when the roster entry lacks them", () => {
    const match = buildMatch({
      session: {
        ...session,
        forSquad: [{ number: 3, name: "A. Player", id: "p1" }, { number: 9 }],
        oppSquad: [{ number: 5 }],
      },
    });
    const input = rapidSessionToReviewPdfInput(match);
    expect(input.homeSquadPlayers).toEqual([
      { id: "p1", number: 3, name: "A. Player" },
      { id: "rapid-squad-9", number: 9, name: "" },
    ]);
    expect(input.awaySquadPlayers).toEqual([{ id: "rapid-squad-5", number: 5, name: "" }]);
  });

  it("leaves homeSquadPlayers/awaySquadPlayers undefined when no roster exists", () => {
    const match = buildMatch();
    const input = rapidSessionToReviewPdfInput(match);
    expect(input.homeSquadPlayers).toBeUndefined();
    expect(input.awaySquadPlayers).toBeUndefined();
  });
});

describe("rapidSessionToReviewPdfInput — event field passthrough", () => {
  it("preserves event order, timestamps, coordinates, tags, restartOwner, and player data unchanged", () => {
    const kickout = buildCapturedEvent({ kind: "KICKOUT_WON", nx: 0.31, ny: 0.62, half: 1, timestamp: 45, teamSide: "FOR" });
    const enrichedKickout: RapidMatchEvent = {
      ...kickout,
      playerId: "p9",
      playerName: "Shane",
      playerNumber: 9,
      squadId: "squad-1",
    };
    const point = buildCapturedEvent({ kind: "POINT", nx: 0.88, ny: 0.5, half: 1, timestamp: 120, teamSide: "OPP" });
    const match = buildMatch({ events: [enrichedKickout, point] });

    const input = rapidSessionToReviewPdfInput(match);
    expect(input.events).toHaveLength(2);

    const [pdfKickout, pdfPoint] = input.events;
    expect(pdfKickout.id).toBe(enrichedKickout.id);
    expect(pdfKickout.nx).toBe(0.31);
    expect(pdfKickout.ny).toBe(0.62);
    expect(pdfKickout.matchClockSeconds).toBe(45);
    expect(pdfKickout.restartOwner).toBe("FOR");
    expect(pdfKickout.playerId).toBe("p9");
    expect(pdfKickout.playerName).toBe("Shane");
    expect(pdfKickout.playerNumber).toBe(9);
    expect(pdfKickout.squadId).toBe("squad-1");
    expect(pdfKickout.tags).toEqual(enrichedKickout.tags);

    expect(pdfPoint.id).toBe(point.id);
    expect(pdfPoint.teamSide).toBe("OPP");
    expect(pdfPoint.matchClockSeconds).toBe(120);
  });

  it("normalises teamSide, defaulting to FOR for a missing/legacy value", () => {
    const legacyEvent = { ...buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 5, teamSide: "FOR" }), teamSide: undefined };
    const match = buildMatch({ events: [legacyEvent as RapidMatchEvent] });
    expect(rapidSessionToReviewPdfInput(match).events[0].teamSide).toBe("FOR");
  });
});

describe("rapidSessionToReviewPdfInput — segment derivation", () => {
  it("derives segment using the canonical deriveSegmentFromPeriodClock helper (1H, 10-minute buckets)", () => {
    const early = buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 30, teamSide: "FOR" });
    const mid = buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 650, teamSide: "FOR" });
    const late = buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 1300, teamSide: "FOR" });
    const match = buildMatch({ events: [early, mid, late] });
    const [e1, e2, e3] = rapidSessionToReviewPdfInput(match).events;
    expect(e1.segment).toBe(1);
    expect(e2.segment).toBe(2);
    expect(e3.segment).toBe(3);
  });

  it("offsets second-half segments by 3", () => {
    const secondHalf = buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 2, timestamp: 30, teamSide: "FOR" });
    const match = buildMatch({ events: [secondHalf] });
    expect(rapidSessionToReviewPdfInput(match).events[0].segment).toBe(4);
  });

  it("respects an explicit segment already present on the event instead of re-deriving it", () => {
    const withSegment: RapidMatchEvent = {
      ...buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 30, teamSide: "FOR" }),
      segment: 6,
    };
    const match = buildMatch({ events: [withSegment] });
    expect(rapidSessionToReviewPdfInput(match).events[0].segment).toBe(6);
  });
});

describe("rapidSessionToReviewPdfInput / rapidMatchToSnapshotPdfInput — immutability", () => {
  it("never mutates the source RapidSavedMatch, its session, or its events", () => {
    const event = buildCapturedEvent({ kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    const match = buildMatch({ events: [event] });
    const beforeMatch = JSON.parse(JSON.stringify(match));
    const beforeSession = JSON.parse(JSON.stringify(session));

    rapidSessionToReviewPdfInput(match);
    rapidMatchToSnapshotPdfInput(match, "HALF_TIME_SNAPSHOT");

    expect(match).toEqual(beforeMatch);
    expect(session).toEqual(beforeSession);
  });

  it("returns a fresh events array — not a reference into match.events", () => {
    const event = buildCapturedEvent({ kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    const match = buildMatch({ events: [event] });
    const input = rapidSessionToReviewPdfInput(match);
    expect(input.events).not.toBe(match.events);
    expect(input.events[0]).not.toBe(match.events[0]);
  });
});

describe("rapidMatchToSnapshotPdfInput — HT/FT filtering delegation", () => {
  it("never pre-filters events by half — exportSnapshotPdf owns HT/FT restriction internally", () => {
    // Mirrors pro-tagger-review-adapter.ts's buildLiveSnapshotInput: the
    // adapter always passes every event through; exportSnapshotPdf itself
    // filters to period === "1H" for HALF_TIME_SNAPSHOT. Pre-filtering here
    // would duplicate that logic and risk drifting out of sync with it.
    const firstHalf = buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half: 1, timestamp: 30, teamSide: "FOR" });
    const secondHalf = buildCapturedEvent({ kind: "WIDE", nx: 0.5, ny: 0.5, half: 2, timestamp: 900, teamSide: "OPP" });
    const match = buildMatch({ events: [firstHalf, secondHalf] });

    const ht = rapidMatchToSnapshotPdfInput(match, "HALF_TIME_SNAPSHOT");
    const ft = rapidMatchToSnapshotPdfInput(match, "FULL_TIME_SNAPSHOT");
    expect(ht.events).toHaveLength(2);
    expect(ft.events).toHaveLength(2);
    expect(ht.events.map((e) => e.period)).toEqual(["1H", "2H"]);
  });
});

describe("rapidMatchToSnapshotPdfInput", () => {
  it("adds snapshotMode and maps attackDirection to homeAttackingDirection", () => {
    const match = buildMatch({ session: { ...session, attackDirection: "left" } });
    const ht = rapidMatchToSnapshotPdfInput(match, "HALF_TIME_SNAPSHOT");
    expect(ht.snapshotMode).toBe("HALF_TIME_SNAPSHOT");
    expect(ht.homeAttackingDirection).toBe("LEFT");

    const rightMatch = buildMatch({ session: { ...session, attackDirection: "right" } });
    const ft = rapidMatchToSnapshotPdfInput(rightMatch, "FULL_TIME_SNAPSHOT");
    expect(ft.snapshotMode).toBe("FULL_TIME_SNAPSHOT");
    expect(ft.homeAttackingDirection).toBe("RIGHT");
  });

  it("carries every base field from rapidSessionToReviewPdfInput through unchanged", () => {
    const event = buildCapturedEvent({ kind: "POINT", nx: 0.7, ny: 0.4, half: 1, timestamp: 30, teamSide: "FOR" });
    const match = buildMatch({ events: [event] });
    const base = rapidSessionToReviewPdfInput(match);
    const snapshot = rapidMatchToSnapshotPdfInput(match, "FULL_TIME_SNAPSHOT");
    expect(snapshot.homeTeamName).toBe(base.homeTeamName);
    expect(snapshot.awayTeamName).toBe(base.awayTeamName);
    expect(snapshot.events).toEqual(base.events);
  });
});

describe("rapidMatchToIntelligencePackInput", () => {
  it("maps score and team names correctly", () => {
    const goal = buildCapturedEvent({ kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    const point = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 20, teamSide: "OPP" });
    const match = buildMatch({ events: [goal, point] });

    const input = rapidMatchToIntelligencePackInput(match, "Half Time");
    expect(input.stageLabel).toBe("Half Time");
    expect(input.clockLabel).toBe("Half Time");
    expect(input.homeTeamName).toBe("Ballyboden");
    expect(input.awayTeamName).toBe("Na Fianna");
    expect(input.homeScore).toEqual({ goals: 1, points: 0, total: 3 });
    expect(input.awayScore).toEqual({ goals: 0, points: 1, total: 1 });
    expect(input.events).toHaveLength(2);
  });

  it("falls back to FOR/OPP labels when team names are blank", () => {
    const match = buildMatch({ session: { ...session, forTeamName: "", oppTeamName: "" } });
    const input = rapidMatchToIntelligencePackInput(match, "Full Time");
    expect(input.homeTeamName).toBe("FOR");
    expect(input.awayTeamName).toBe("OPP");
  });
});
