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

describe("resolveEventAttackingDirection — full FOR/OPP × 1H/2H truth table", () => {
  // firstHalfAttackingDirection = RIGHT: FOR attacks RIGHT in 1H, LEFT in 2H.
  // OPP always attacks the opposite end from FOR in the same half.
  it("firstHalfAttackingDirection = RIGHT", () => {
    expect(resolveEventAttackingDirection("FOR", "1H", "RIGHT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("OPP", "1H", "RIGHT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("FOR", "2H", "RIGHT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("OPP", "2H", "RIGHT")).toBe("RIGHT");
  });

  // firstHalfAttackingDirection = LEFT: FOR attacks LEFT in 1H, RIGHT in 2H.
  it("firstHalfAttackingDirection = LEFT", () => {
    expect(resolveEventAttackingDirection("FOR", "1H", "LEFT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("OPP", "1H", "LEFT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("FOR", "2H", "LEFT")).toBe("RIGHT");
    expect(resolveEventAttackingDirection("OPP", "2H", "LEFT")).toBe("LEFT");
  });

  it("treats a missing/unrecognised teamSide as FOR", () => {
    expect(resolveEventAttackingDirection(undefined, "1H", "LEFT")).toBe("LEFT");
    expect(resolveEventAttackingDirection("something-else", "1H", "LEFT")).toBe("LEFT");
  });
});

describe("toTeamRelativeZoneEvent", () => {
  it("is a no-op when the event's effective attacking direction is RIGHT", () => {
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

  it("never mutates the original event", () => {
    const event = { nx: 0.2, ny: 0.7, teamSide: "FOR" as const, period: "1H" as const };
    toTeamRelativeZoneEvent(event, "LEFT");
    expect(event.nx).toBe(0.2);
    expect(event.ny).toBe(0.7);
  });

  it("preserves every non-coordinate field", () => {
    const event = { nx: 0.2, ny: 0.7, teamSide: "FOR" as const, period: "1H" as const, id: "e1", kind: "POINT" };
    const result = toTeamRelativeZoneEvent(event, "LEFT");
    expect(result.id).toBe("e1");
    expect(result.kind).toBe("POINT");
    expect(result.teamSide).toBe("FOR");
    expect(result.period).toBe("1H");
  });
});

describe("getTeamRelativeZoneCounts / getTeamRelativeZoneHotspots — matches canonical engine when no rotation is needed", () => {
  it("FOR events in 1H with firstHalfAttackingDirection RIGHT need no rotation — identical to the raw engine", () => {
    // This is the one (teamSide, period, firstHalfAttackingDirection) combination
    // whose effective direction is RIGHT, i.e. the canonical no-transform case.
    const events = [
      { nx: 0.15, ny: 0.12, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.83, ny: 0.87, teamSide: "FOR" as const, period: "1H" as const },
    ];
    expect(getTeamRelativeZoneCounts(events, "RIGHT")).toEqual(getZoneCounts(events));
    expect(getTeamRelativeZoneHotspots(events, "RIGHT")).toEqual(getZoneHotspots(events));
  });

  it("OPP events in 1H with firstHalfAttackingDirection LEFT need no rotation — OPP attacks RIGHT that half", () => {
    const events = [
      { nx: 0.15, ny: 0.12, teamSide: "OPP" as const, period: "1H" as const },
      { nx: 0.83, ny: 0.87, teamSide: "OPP" as const, period: "1H" as const },
    ];
    expect(getTeamRelativeZoneCounts(events, "LEFT")).toEqual(getZoneCounts(events));
  });
});

describe("Adare v Mungret reproduction — the reported 'Defensive Centre' bug", () => {
  // Adare (FOR/home) attacks LEFT in the first half. Two shots from their
  // attacking third (physically low nx, since they're attacking toward nx=0)
  // must resolve as "Attacking" zones for Adare, not "Defensive".
  const FIRST_HALF_ATTACKING_DIRECTION = "LEFT" as const;

  it("labels Adare's first-half attacking-third shots as Attacking, not Defensive", () => {
    const adareShots = [
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const }, // Attacking Centre from Adare's POV
      { nx: 0.18, ny: 0.15, teamSide: "FOR" as const, period: "1H" as const }, // Attacking Left from Adare's POV
    ];
    const counts = getTeamRelativeZoneCounts(adareShots, FIRST_HALF_ATTACKING_DIRECTION);
    const attackingCentre = counts.find((z) => z.id === "ATTACKING_CENTRE")!;
    const defensiveCentre = counts.find((z) => z.id === "DEFENSIVE_CENTRE")!;
    expect(attackingCentre.count).toBe(1);
    expect(defensiveCentre.count).toBe(0);

    const hotspots = getTeamRelativeZoneHotspots(adareShots, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspots[0]!.label.startsWith("Attacking")).toBe(true);
    expect(hotspots[0]!.label).not.toBe("Defensive Centre");
  });

  it("labels Mungret's (OPP) first-half attacking shots correctly too — they attack the opposite end from Adare", () => {
    // Mungret attacks RIGHT in 1H (opposite of Adare's LEFT) — their
    // attacking-third shots sit at physically high nx.
    const mungretShots = [
      { nx: 0.88, ny: 0.5, teamSide: "OPP" as const, period: "1H" as const },
    ];
    const hotspots = getTeamRelativeZoneHotspots(mungretShots, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspots[0]!.label.startsWith("Attacking")).toBe(true);
  });

  it("flips correctly in the second half when Adare switches ends", () => {
    // In 2H, Adare attacks RIGHT (ends swapped) — a shot at high nx is now
    // their attacking third, matching the canonical (untransformed) map.
    const adareSecondHalfShot = [{ nx: 0.88, ny: 0.5, teamSide: "FOR" as const, period: "2H" as const }];
    const hotspots = getTeamRelativeZoneHotspots(adareSecondHalfShot, FIRST_HALF_ATTACKING_DIRECTION);
    expect(hotspots[0]!.label.startsWith("Attacking")).toBe(true);
  });

  it("a mixed full-match event set (1H + 2H) resolves each event by its own half — not one match-wide flip", () => {
    // Same physical nx (low, near Adare's H1 attacking end) tagged in both
    // halves: in 1H it's Adare's attacking third; in 2H (ends swapped) the
    // identical physical spot is Adare's *defensive* third.
    const events = [
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "1H" as const },
      { nx: 0.12, ny: 0.5, teamSide: "FOR" as const, period: "2H" as const },
    ];
    const counts = getTeamRelativeZoneCounts(events, FIRST_HALF_ATTACKING_DIRECTION);
    expect(counts.find((z) => z.id === "ATTACKING_CENTRE")!.count).toBe(1);
    expect(counts.find((z) => z.id === "DEFENSIVE_CENTRE")!.count).toBe(1);
  });
});
