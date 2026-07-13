import { describe, expect, it } from "vitest";
import {
  getTeamRelativeZoneCounts,
  getTeamRelativeZoneHotspots,
  resolveEventAttackingDirection,
  resolveForAttackingDirection,
  toTeamRelativeZoneEvent,
} from "./zone-orientation";
import { getZoneCounts, getZoneHotspots } from "./zone-engine";
import { ZONE_MAP_V1_NINE_GRID } from "./zone-maps";

describe("resolveForAttackingDirection", () => {
  it("keeps the first-half direction in 1H", () => {
    expect(resolveForAttackingDirection("1H", "RIGHT")).toBe("RIGHT");
    expect(resolveForAttackingDirection("1H", "LEFT")).toBe("LEFT");
  });

  it("flips in 2H — teams swap ends at half-time", () => {
    expect(resolveForAttackingDirection("2H", "RIGHT")).toBe("LEFT");
    expect(resolveForAttackingDirection("2H", "LEFT")).toBe("RIGHT");
  });

  it("treats a missing period as 1H", () => {
    expect(resolveForAttackingDirection(null, "LEFT")).toBe("LEFT");
    expect(resolveForAttackingDirection(undefined, "RIGHT")).toBe("RIGHT");
  });
});

describe("resolveEventAttackingDirection — a report has one owner and one orientation", () => {
  // Zone labels always describe the reporting (FOR/home) team's own
  // attacking/defensive thirds — for every event, FOR or OPP. teamSide never
  // flips the resolved direction; only period does (ends swap at half-time).
  it("FOR and OPP resolve identically in every half x direction combination", () => {
    for (const period of ["1H", "2H"] as const) {
      for (const firstHalfAttackingDirection of ["LEFT", "RIGHT"] as const) {
        const forDir = resolveEventAttackingDirection("FOR", period, firstHalfAttackingDirection);
        const oppDir = resolveEventAttackingDirection("OPP", period, firstHalfAttackingDirection);
        expect(oppDir).toBe(forDir);
      }
    }
  });

  it("FOR H1: matches firstHalfAttackingDirection", () => {
    expect(resolveEventAttackingDirection("FOR", "1H", "RIGHT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("FOR", "1H", "LEFT")).toBe("LEFT");
  });

  it("FOR H2: opposite of firstHalfAttackingDirection (ends swap)", () => {
    expect(resolveEventAttackingDirection("FOR", "2H", "RIGHT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("FOR", "2H", "LEFT")).toBe("RIGHT");
  });

  it("OPP H1: matches firstHalfAttackingDirection — same as FOR, not flipped", () => {
    expect(resolveEventAttackingDirection("OPP", "1H", "RIGHT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("OPP", "1H", "LEFT")).toBe("LEFT");
  });

  it("OPP H2: opposite of firstHalfAttackingDirection — same as FOR, not flipped", () => {
    expect(resolveEventAttackingDirection("OPP", "2H", "RIGHT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("OPP", "2H", "LEFT")).toBe("RIGHT");
  });

  it("treats a missing/unrecognised teamSide the same as any other event", () => {
    expect(resolveEventAttackingDirection(undefined, "1H", "LEFT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("something-else", "1H", "LEFT")).toBe("LEFT");
  });
});

describe("toTeamRelativeZoneEvent", () => {
  it("is a no-op when the reporting team's effective direction is RIGHT", () => {
    const event = { nx: 0.2, ny: 0.7, x: 0.2, y: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    const result = toTeamRelativeZoneEvent(event, "RIGHT");
    expect(result).toBe(event); // same reference — genuinely untouched
  });

  it("rotates nx/ny/x/y 180° (both axes) when the effective direction is LEFT", () => {
    const event = { nx: 0.2, ny: 0.7, x: 0.2, y: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    const result = toTeamRelativeZoneEvent(event, "LEFT");
    expect(result.nx).toBeCloseTo(0.8, 9);
    expect(result.ny).toBeCloseTo(0.3, 9);
    expect(result.x).toBeCloseTo(0.8, 9);
    expect(result.y).toBeCloseTo(0.3, 9);
  });

  it("rotates an OPP event identically to a FOR event at the same coordinate/period", () => {
    const forEvent = { nx: 0.2, ny: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    const oppEvent = { nx: 0.2, ny: 0.7, teamSide: "OPP" as const, period: "1H" as const };
    const forResult = toTeamRelativeZoneEvent(forEvent, "LEFT");
    const oppResult = toTeamRelativeZoneEvent(oppEvent, "LEFT");
    expect(oppResult.nx).toBeCloseTo(forResult.nx, 9);
    expect(oppResult.ny).toBeCloseTo(forResult.ny, 9);
  });

  it("never mutates the original event", () => {
    const event = { nx: 0.2, ny: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    toTeamRelativeZoneEvent(event, "LEFT");
    expect(event.nx).toBe(0.2);
    expect(event.ny).toBe(0.7);
  });

  it("preserves every non-coordinate field", () => {
    const event = { nx: 0.2, ny: 0.7, teamSide: "OPP" as const, period: "1H" as const, id: "e1", kind: "POINT" };
    const result = toTeamRelativeZoneEvent(event, "LEFT");
    expect(result.id).toBe("e1");
    expect(result.kind).toBe("POINT");
    expect(result.teamSide).toBe("OPP");
    expect(result.period).toBe("1H");
  });
});

describe("getTeamRelativeZoneCounts / getTeamRelativeZoneHotspots — matches canonical engine when no rotation is needed", () => {
  it("FOR events in 1H with firstHalfAttackingDirection RIGHT need no rotation — identical to the raw engine", () => {
    const events = [
      { nx: 0.15, ny: 0.12, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.83, ny: 0.87, teamSide: "FOR" as const, period: "1H" as const },
    ];
    expect(getTeamRelativeZoneCounts(events, "RIGHT")).toEqual(getZoneCounts(events));
    expect(getTeamRelativeZoneHotspots(events, "RIGHT")).toEqual(getZoneHotspots(events));
  });

  it("OPP events in 1H with firstHalfAttackingDirection RIGHT also need no rotation — same orientation as FOR", () => {
    const events = [
      { nx: 0.15, ny: 0.12, teamSide: "OPP" as const, period: "1H" as const },
      { nx: 0.83, ny: 0.87, teamSide: "OPP" as const, period: "1H" as const },
    ];
    expect(getTeamRelativeZoneCounts(events, "RIGHT")).toEqual(getZoneCounts(events));
  });
});

describe("regression: the same physical coordinate resolves to the same zone for FOR H1 / FOR H2 / OPP H1 / OPP H2, per attacking direction", () => {
  const POINT = { nx: 0.15, ny: 0.5 }; // low nx, centre channel

  it("firstHalfAttackingDirection RIGHT: 1H stays put (Defensive Centre — low nx untouched), 2H flips (Attacking Centre)", () => {
    for (const teamSide of ["FOR", "OPP"] as const) {
      const h1 = toTeamRelativeZoneEvent({ ...POINT, teamSide, period: "1H" as const }, "RIGHT");
      const h2 = toTeamRelativeZoneEvent({ ...POINT, teamSide, period: "2H" as const }, "RIGHT");
      expect(h1.nx).toBeCloseTo(POINT.nx, 9); // no rotation — matches canonical low-x
      expect(h2.nx).toBeCloseTo(1 - POINT.nx, 9); // rotated — ends swapped in 2H
    }
  });

  it("firstHalfAttackingDirection LEFT: 1H flips (Attacking Centre), 2H stays put (Defensive Centre)", () => {
    for (const teamSide of ["FOR", "OPP"] as const) {
      const h1 = toTeamRelativeZoneEvent({ ...POINT, teamSide, period: "1H" as const }, "LEFT");
      const h2 = toTeamRelativeZoneEvent({ ...POINT, teamSide, period: "2H" as const }, "LEFT");
      expect(h1.nx).toBeCloseTo(1 - POINT.nx, 9);
      expect(h2.nx).toBeCloseTo(POINT.nx, 9);
    }
  });

  it("FOR and OPP always land in the identical zone for every (period, direction) combination", () => {
    for (const period of ["1H", "2H"] as const) {
      for (const direction of ["LEFT", "RIGHT"] as const) {
        const forZone = toTeamRelativeZoneEvent({ ...POINT, teamSide: "FOR" as const, period }, direction);
        const oppZone = toTeamRelativeZoneEvent({ ...POINT, teamSide: "OPP" as const, period }, direction);
        expect(oppZone.nx).toBeCloseTo(forZone.nx, 9);
        expect(oppZone.ny).toBeCloseTo(forZone.ny, 9);
      }
    }
  });
});

describe("regression: all nine 3x3 zones resolve correctly under rotation", () => {
  // One representative point per zone (matches zone-maps.ts's V1_ZONE_STEP thirds).
  const ZONE_POINTS: ReadonlyArray<{ id: string; nx: number; ny: number }> = [
    { id: "DEFENSIVE_LEFT",   nx: 0.10, ny: 0.10 },
    { id: "DEFENSIVE_CENTRE", nx: 0.10, ny: 0.50 },
    { id: "DEFENSIVE_RIGHT",  nx: 0.10, ny: 0.90 },
    { id: "MIDDLE_LEFT",      nx: 0.50, ny: 0.10 },
    { id: "MIDDLE_CENTRE",    nx: 0.50, ny: 0.50 },
    { id: "MIDDLE_RIGHT",     nx: 0.50, ny: 0.90 },
    { id: "ATTACKING_LEFT",   nx: 0.90, ny: 0.10 },
    { id: "ATTACKING_CENTRE", nx: 0.90, ny: 0.50 },
    { id: "ATTACKING_RIGHT",  nx: 0.90, ny: 0.90 },
  ];

  // Rotating 180° about the centre maps each zone to its point-symmetric
  // opposite: DEFENSIVE_LEFT <-> ATTACKING_RIGHT, DEFENSIVE_CENTRE <->
  // ATTACKING_CENTRE, DEFENSIVE_RIGHT <-> ATTACKING_LEFT, MIDDLE_LEFT <->
  // MIDDLE_RIGHT, MIDDLE_CENTRE <-> MIDDLE_CENTRE.
  const ROTATED_ZONE_ID: Record<string, string> = {
    DEFENSIVE_LEFT:   "ATTACKING_RIGHT",
    DEFENSIVE_CENTRE: "ATTACKING_CENTRE",
    DEFENSIVE_RIGHT:  "ATTACKING_LEFT",
    MIDDLE_LEFT:      "MIDDLE_RIGHT",
    MIDDLE_CENTRE:    "MIDDLE_CENTRE",
    MIDDLE_RIGHT:     "MIDDLE_LEFT",
    ATTACKING_LEFT:   "DEFENSIVE_RIGHT",
    ATTACKING_CENTRE: "DEFENSIVE_CENTRE",
    ATTACKING_RIGHT:  "DEFENSIVE_LEFT",
  };

  it("firstHalfAttackingDirection RIGHT — every zone's point resolves to its own zone (no rotation)", () => {
    for (const point of ZONE_POINTS) {
      const [hotspot] = getTeamRelativeZoneHotspots(
        [{ nx: point.nx, ny: point.ny, teamSide: "FOR" as const, period: "1H" as const }],
        "RIGHT",
      );
      expect(hotspot!.zoneId).toBe(point.id);
    }
  });

  it("firstHalfAttackingDirection LEFT — every zone's point resolves to its point-symmetric opposite zone", () => {
    for (const point of ZONE_POINTS) {
      const [hotspot] = getTeamRelativeZoneHotspots(
        [{ nx: point.nx, ny: point.ny, teamSide: "FOR" as const, period: "1H" as const }],
        "LEFT",
      );
      expect(hotspot!.zoneId).toBe(ROTATED_ZONE_ID[point.id]);
    }
  });

  it("all nine zone ids are covered by ZONE_MAP_V1_NINE_GRID (fixture stays in sync with the zone map)", () => {
    const mapZoneIds = ZONE_MAP_V1_NINE_GRID.zones.map((z) => z.id).sort();
    const fixtureZoneIds = ZONE_POINTS.map((p) => p.id).sort();
    expect(fixtureZoneIds).toEqual(mapZoneIds);
  });
});

describe("Adare v Mungret — Required behaviour from the audit", () => {
  // Adare (FOR/home) attacks LEFT in the first half.
  const FIRST_HALF_ATTACKING_DIRECTION = "LEFT" as const;

  it("Adare's scoring hotspot in H1 reads Attacking Centre", () => {
    const adareShots = [
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.18, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
    ];
    const [hotspot] = getTeamRelativeZoneHotspots(adareShots, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspot!.label).toBe("Attacking Centre");
  });

  it("Mungret's scoring hotspot, viewed from Adare's perspective, reads Defensive Centre — not Mungret's own Attacking Centre", () => {
    // Mungret scores land near Adare's own goal (physically low nx here,
    // since Adare attacks LEFT — i.e. defends the high-nx end).
    const mungretShots = [
      { nx: 0.85, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
      { nx: 0.9, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
    ];
    const [hotspot] = getTeamRelativeZoneHotspots(mungretShots, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspot!.label).toBe("Defensive Centre");
    expect(hotspot!.label).not.toBe("Attacking Centre");
  });

  it("a Turnover & Territory-style mixed FOR+OPP subset (e.g. 'lost the ball' = FOR's TURNOVER_LOST + OPP's TURNOVER_WON) resolves consistently regardless of which team logged each event", () => {
    // Same physical turnover, tagged once from each team's own perspective —
    // both must land in the same zone now that teamSide never flips direction.
    const mixedTurnoverEvents = [
      { nx: 0.85, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const }, // "we lost it"
      { nx: 0.85, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const }, // "they won it" — same spot
    ];
    const counts = getTeamRelativeZoneCounts(mixedTurnoverEvents, FIRST_HALF_ATTACKING_DIRECTION);
    const defensiveCentre = counts.find((z) => z.id === "DEFENSIVE_CENTRE")!;
    expect(defensiveCentre.count).toBe(2); // both events, same zone
    expect(counts.find((z) => z.id === "ATTACKING_CENTRE")!.count).toBe(0);
  });

  it("flips correctly in the second half when Adare switches ends", () => {
    const adareSecondHalfShot = [{ nx: 0.88, ny: 0.5, teamSide: "FOR" as const, period: "2H" as const }];
    const [hotspot] = getTeamRelativeZoneHotspots(adareSecondHalfShot, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspot!.label).toBe("Attacking Centre");
  });

  it("a mixed full-match event set (1H + 2H) resolves each event by its own half — not one match-wide flip", () => {
    const events = [
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "2H" as const },
    ];
    const counts = getTeamRelativeZoneCounts(events, FIRST_HALF_ATTACKING_DIRECTION);
    expect(counts.find((z) => z.id === "ATTACKING_CENTRE")!.count).toBe(1);
    expect(counts.find((z) => z.id === "DEFENSIVE_CENTRE")!.count).toBe(1);
  });
});
