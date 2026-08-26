import { describe, expect, it } from "vitest";
import { resolveEventMapOutcomeFill } from "./pro-tagger-event-map-outcome-color";
import { getStatsMarkerStyle } from "../core/stats/stats-marker-style";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import type { ReviewSelectableEvent } from "../stats/review-types";

const PURPLE = "rgba(167, 139, 250, 1)";
const RED    = "rgba(239, 68, 68, 1)";

function evt(kind: MatchEventKind, teamSide: "FOR" | "OPP"): ReviewSelectableEvent {
  return {
    id: `evt-${kind}-${teamSide}`,
    kind,
    nx: 0.5,
    ny: 0.5,
    half: 1,
    timestamp: 0,
    teamSide,
  };
}

describe("resolveEventMapOutcomeFill — reused colours are the locked ones", () => {
  it("purple matches Turnover Won's existing locked fill", () => {
    expect(PURPLE).toBe(getStatsMarkerStyle(evt("TURNOVER_WON", "FOR")).fill);
  });

  it("red matches Free Missed's existing locked fill (#ef4444)", () => {
    expect(RED).toBe(getStatsMarkerStyle(evt("FREE_MISSED", "FOR")).fill);
  });
});

describe("resolveEventMapOutcomeFill — Kickouts", () => {
  it("Home kickout won/retained (FOR view) → purple", () => {
    const e = evt("KICKOUT_WON", "FOR");
    expect(resolveEventMapOutcomeFill(e, "FOR")).toBe(PURPLE);
  });

  it("Home kickout lost / won by Away (FOR view) → red", () => {
    const e = evt("KICKOUT_CONCEDED", "FOR");
    expect(resolveEventMapOutcomeFill(e, "FOR")).toBe(RED);
  });

  it("Away kickout won/retained (OPP view) → purple", () => {
    const e = evt("KICKOUT_WON", "OPP");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(PURPLE);
  });

  it("Away kickout lost / won by Home (OPP view) → red", () => {
    const e = evt("KICKOUT_CONCEDED", "OPP");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(RED);
  });

  it("Home's own KICKOUT_CONCEDED (Away actually won it) reads as purple from the OPP view", () => {
    // teamSide=FOR on a CONCEDED event names the side that lost it — Home
    // lost, so this same event represents Away winning when viewed as OPP.
    const e = evt("KICKOUT_CONCEDED", "FOR");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(PURPLE);
  });

  it("Away's own KICKOUT_WON (Away retained) reads as red from the FOR view", () => {
    const e = evt("KICKOUT_WON", "OPP");
    expect(resolveEventMapOutcomeFill(e, "FOR")).toBe(RED);
  });
});

describe("resolveEventMapOutcomeFill — Turnovers", () => {
  it("Home turnover won (FOR view) → purple", () => {
    const e = evt("TURNOVER_WON", "FOR");
    expect(resolveEventMapOutcomeFill(e, "FOR")).toBe(PURPLE);
  });

  it("Home turnover lost / won by Away (FOR view) → red", () => {
    const e = evt("TURNOVER_LOST", "FOR");
    expect(resolveEventMapOutcomeFill(e, "FOR")).toBe(RED);
  });

  it("Away turnover won/retained (OPP view) → purple", () => {
    const e = evt("TURNOVER_WON", "OPP");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(PURPLE);
  });

  it("Away turnover lost / won by Home (OPP view) → red", () => {
    const e = evt("TURNOVER_LOST", "OPP");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(RED);
  });

  it("Home's own TURNOVER_LOST (Away actually won it) reads as purple from the OPP view", () => {
    const e = evt("TURNOVER_LOST", "FOR");
    expect(resolveEventMapOutcomeFill(e, "OPP")).toBe(PURPLE);
  });
});

describe("resolveEventMapOutcomeFill — scope fence", () => {
  it("leaves non-Kickout/Turnover kinds untouched (undefined = default marker colour)", () => {
    expect(resolveEventMapOutcomeFill(evt("GOAL", "FOR"), "FOR")).toBeUndefined();
    expect(resolveEventMapOutcomeFill(evt("POINT", "FOR"), "OPP")).toBeUndefined();
    expect(resolveEventMapOutcomeFill(evt("SHOT", "FOR"), "FOR")).toBeUndefined();
    expect(resolveEventMapOutcomeFill(evt("WIDE", "OPP"), "OPP")).toBeUndefined();
  });

  it("leaves Kickout/Turnover markers untouched when no single team is selected (ALL view)", () => {
    expect(resolveEventMapOutcomeFill(evt("KICKOUT_WON", "FOR"), null)).toBeUndefined();
    expect(resolveEventMapOutcomeFill(evt("TURNOVER_LOST", "OPP"), null)).toBeUndefined();
  });
});
