import { describe, expect, it } from "vitest";
import {
  getTeamRelativeZoneCounts,
  getTeamRelativeZoneHotspots,
  resolveEventAttackingDirection,
  resolveForAttackingDirection,
  toTeamRelativeZoneEvent,
} from "./zone-orientation";
import { getZoneCounts, getZoneHotspots } from "./zone-engine";

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

describe("resolveEventAttackingDirection — REPORT perspective", () => {
  it("FOR and OPP resolve identically in every half x direction combination", () => {
    for (const period of ["1H", "2H"] as const) {
      for (const firstHalfAttackingDirection of ["LEFT", "RIGHT"] as const) {
        const forDir = resolveEventAttackingDirection("FOR", period, firstHalfAttackingDirection, "REPORT");
        const oppDir = resolveEventAttackingDirection("OPP", period, firstHalfAttackingDirection, "REPORT");
        expect(oppDir).toBe(forDir);
      }
    }
  });

  it("FOR H1: matches firstHalfAttackingDirection", () => {
    expect(resolveEventAttackingDirection("FOR", "1H", "RIGHT", "REPORT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("FOR", "1H", "LEFT", "REPORT")).toBe("LEFT");
  });

  it("FOR H2: opposite of firstHalfAttackingDirection (ends swap)", () => {
    expect(resolveEventAttackingDirection("FOR", "2H", "RIGHT", "REPORT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("FOR", "2H", "LEFT", "REPORT")).toBe("RIGHT");
  });
});

describe("resolveEventAttackingDirection — OPP perspective", () => {
  it("flips from the FOR team's direction for that half", () => {
    expect(resolveEventAttackingDirection("OPP", "1H", "LEFT", "OPP")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("OPP", "1H", "RIGHT", "OPP")).toBe("LEFT");
    expect(resolveEventAttackingDirection("OPP", "2H", "LEFT", "OPP")).toBe("LEFT");
    expect(resolveEventAttackingDirection("OPP", "2H", "RIGHT", "OPP")).toBe("RIGHT");
  });
});

describe("toTeamRelativeZoneEvent", () => {
  it("is a no-op when the effective direction is RIGHT", () => {
    const event = { nx: 0.2, ny: 0.7, x: 0.2, y: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    const result = toTeamRelativeZoneEvent(event, "RIGHT");
    expect(result).toBe(event);
  });

  it("rotates nx/ny/x/y 180° when REPORT perspective needs LEFT", () => {
    const event = { nx: 0.2, ny: 0.7, x: 0.2, y: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    const result = toTeamRelativeZoneEvent(event, "LEFT", "REPORT");
    expect(result.nx).toBeCloseTo(0.8, 9);
    expect(result.ny).toBeCloseTo(0.3, 9);
  });

  it("never mutates the original event", () => {
    const event = { nx: 0.2, ny: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    toTeamRelativeZoneEvent(event, "LEFT");
    expect(event.nx).toBe(0.2);
    expect(event.ny).toBe(0.7);
  });
});

describe("getTeamRelativeZoneCounts / getTeamRelativeZoneHotspots — parity when no rotation", () => {
  it("FOR events in 1H with firstHalfAttackingDirection RIGHT — identical to raw engine", () => {
    const events = [
      { nx: 0.15, ny: 0.12, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.83, ny: 0.87, teamSide: "FOR" as const, period: "1H" as const },
    ];
    expect(getTeamRelativeZoneCounts(events, "RIGHT")).toEqual(getZoneCounts(events));
    expect(getTeamRelativeZoneHotspots(events, "RIGHT")).toEqual(getZoneHotspots(events));
  });
});

describe("Adare v Mungret — shot profile zone semantics", () => {
  const FIRST_HALF_ATTACKING_DIRECTION = "LEFT" as const;

  it("Adare's scoring hotspot in H1 reads Attacking Centre (Our Shot Profile)", () => {
    const adareShots = [
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.18, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
    ];
    const [hotspot] = getTeamRelativeZoneHotspots(adareShots, FIRST_HALF_ATTACKING_DIRECTION, undefined, "REPORT");
    expect(hotspot!.label).toBe("Attacking Centre");
  });

  it("Mungret's scoring hotspot reads Attacking Centre from OPP perspective (Opposition Shot Profile)", () => {
    const mungretShots = [
      { nx: 0.85, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
      { nx: 0.9, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
    ];
    const [oppHotspot] = getTeamRelativeZoneHotspots(
      mungretShots,
      FIRST_HALF_ATTACKING_DIRECTION,
      undefined,
      "OPP",
    );
    expect(oppHotspot!.label).toBe("Attacking Centre");

    const [reportHotspot] = getTeamRelativeZoneHotspots(
      mungretShots,
      FIRST_HALF_ATTACKING_DIRECTION,
      undefined,
      "REPORT",
    );
    expect(reportHotspot!.label).toBe("Defensive Centre");
  });

  it("mixed FOR+OPP turnover subset resolves consistently under REPORT perspective", () => {
    const mixedTurnoverEvents = [
      { nx: 0.85, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.85, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
    ];
    const counts = getTeamRelativeZoneCounts(mixedTurnoverEvents, FIRST_HALF_ATTACKING_DIRECTION);
    expect(counts.find((z) => z.id === "DEFENSIVE_CENTRE")!.count).toBe(2);
    expect(counts.find((z) => z.id === "ATTACKING_CENTRE")!.count).toBe(0);
  });

  it("flips correctly in the second half when Adare switches ends", () => {
    const adareSecondHalfShot = [{ nx: 0.88, ny: 0.5, teamSide: "FOR" as const, period: "2H" as const }];
    const [hotspot] = getTeamRelativeZoneHotspots(adareSecondHalfShot, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspot!.label).toBe("Attacking Centre");
  });
});
