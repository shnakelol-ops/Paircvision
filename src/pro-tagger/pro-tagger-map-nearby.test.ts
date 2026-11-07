import { describe, expect, it } from "vitest";
import { findNearbyMapEvents, NEARBY_MARKER_RADIUS_PX } from "./pro-tagger-map-nearby";
import { getStatsMarkerStyle } from "../core/stats/stats-marker-style";
import { letterboxPitchWorld } from "../core/coordinates/pitch-coordinates";
import { BOARD_PITCH_VIEWBOX } from "../core/pitch/pitch-space";
import type { MatchEvent, MatchEventKind } from "../core/stats/stats-event-model";

const PHONE = { width: 430, height: 804 }; // Event Map canvas on a 430 × 932 phone layout
const pxPerNx = (size: { width: number; height: number }) => BOARD_PITCH_VIEWBOX.w * letterboxPitchWorld(size.width, size.height).scale;
const at = (id: string, nx: number, ny: number) => ({ id, nx, ny });

describe("findNearbyMapEvents", () => {
  it("returns events at identical coordinates, each independently (anchor's visible order kept on ties)", () => {
    const events = [at("free", 0.5, 0.5), at("card", 0.5, 0.5), at("far", 0.9, 0.9)];
    expect(findNearbyMapEvents(events[1], events, PHONE).map((e) => e.id)).toEqual(["free", "card"]);
    expect(findNearbyMapEvents(events[0], events, PHONE).map((e) => e.id)).toEqual(["free", "card"]);
  });

  it("measures distance in rendered pixels, nearest first", () => {
    const k = pxPerNx(PHONE);
    const events = [at("a", 0.5, 0.5), at("b30", 0.5 + 30 / k, 0.5), at("b10", 0.5 + 10 / k, 0.5), at("b40", 0.5 + 40 / k, 0.5)];
    expect(findNearbyMapEvents(events[0], events, PHONE).map((e) => e.id)).toEqual(["a", "b10", "b30"]);
  });

  it("follows the rendered pitch scale: the same pitch distance is further apart on a larger screen", () => {
    const events = [at("a", 0.5, 0.5), at("b", 0.5 + 30 / pxPerNx(PHONE), 0.5)];
    expect(findNearbyMapEvents(events[0], events, PHONE)).toHaveLength(2);
    expect(findNearbyMapEvents(events[0], events, { width: 1280, height: 800 })).toHaveLength(1);
  });

  it("only considers the events it is given (the Event Map's active filters)", () => {
    const filtered = [at("a", 0.5, 0.5)];
    expect(findNearbyMapEvents(at("a", 0.5, 0.5), filtered, PHONE).map((e) => e.id)).toEqual(["a"]);
  });

  it("returns nothing before the pitch has a size", () => {
    expect(findNearbyMapEvents(at("a", 0.5, 0.5), [at("a", 0.5, 0.5), at("b", 0.5, 0.5)], { width: 0, height: 0 })).toEqual([]);
  });
});

// Threshold validation against the real marker sizing.
// Mirrors draw-stats-markers.ts (Review calls it with min 4 px / max 10 px dot
// radius): dot = clamp(styleRadius × scale, 4, 10) (×1.06 for TWO_POINTER);
// tap = scoring ? max(dot × 1.8, 16) : max(dot × 2.4, 16). A tap on event T's
// dot can open marker L only when |T − L| ≤ dot(T) + tap(L).
describe("NEARBY_MARKER_RADIUS_PX covers every marker that can take a tap meant for another", () => {
  const KINDS: MatchEventKind[] = [
    "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE", "SHOT", "TURNOVER_WON", "TURNOVER_LOST",
    "KICKOUT_WON", "KICKOUT_CONCEDED", "FREE_WON", "FREE_CONCEDED", "FORTY_FIVE_WON", "SIDELINE_WON",
    "YELLOW_CARD", "SIN_BIN", "RED_CARD",
  ];
  const SCORING = new Set<MatchEventKind>(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"]);
  const sizes = (n: number) => {
    const out: { width: number; height: number }[] = [];
    for (let w = 280; w <= 2560; w += 80) for (const h of [400, 600, 804, 1000, 1400]) out.push({ width: w, height: h });
    return out.slice(0, n);
  };
  const geometry = (kind: MatchEventKind, scale: number) => {
    const style = getStatsMarkerStyle({ kind } as MatchEvent);
    const styleR = kind === "TWO_POINTER" ? style.radius * 1.06 : style.radius;
    const dot = Math.min(Math.max(styleR * scale, 4), 10);
    const tap = SCORING.has(kind) ? Math.max(dot * 1.8, 16) : Math.max(dot * 2.4, 16);
    return { dot, tap };
  };

  it("on every screen size from phone to large desktop, for every pair of kinds", () => {
    let worst = 0;
    for (const size of sizes(1000)) {
      const { scale } = letterboxPitchWorld(size.width, size.height);
      for (const t of KINDS) for (const l of KINDS) worst = Math.max(worst, geometry(t, scale).dot + geometry(l, scale).tap);
    }
    expect(worst).toBeLessThanOrEqual(NEARBY_MARKER_RADIUS_PX);
    expect(worst).toBeGreaterThan(32); // a flat 32 px would miss covered markers on larger screens
  });

  it("on the phone layout the reach is smaller than the threshold (the list may include a few extra neighbours, never miss one)", () => {
    const { scale } = letterboxPitchWorld(PHONE.width, PHONE.height);
    let worst = 0;
    for (const t of KINDS) for (const l of KINDS) worst = Math.max(worst, geometry(t, scale).dot + geometry(l, scale).tap);
    expect(worst).toBeLessThan(NEARBY_MARKER_RADIUS_PX);
  });
});
