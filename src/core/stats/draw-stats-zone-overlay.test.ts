/**
 * draw-stats-zone-overlay.test.ts — optional-style contract for the shared
 * zone overlay renderer.
 *
 * PR #303 reconciliation: Event Stats Review's Zones overlay was found too
 * subtle (a barely-visible grid unless deliberately searched for). The fix
 * adds an optional third `style` argument to drawStatsZoneOverlay — but the
 * contract that makes this safe is: no style supplied must render exactly
 * as before, so Match Stats' StatsModeSurface.tsx and Rapid Capture's
 * RapidReviewScreen.tsx (which both call setZoneOverlayModel with a single
 * argument) are provably unaffected.
 *
 * These tests execute the real drawStatsZoneOverlay against a real pixi.js
 * Graphics object (no WebGL/canvas needed — Graphics/Container/Text build an
 * in-memory instruction list until an actual renderer draws them) and
 * inspect the resulting fill/stroke alpha values directly, rather than
 * relying on source-string assertions alone.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Graphics } from "pixi.js";

import {
  DEFAULT_ZONE_OVERLAY_STYLE,
  drawStatsZoneOverlay,
} from "./draw-stats-zone-overlay";
import type { ZoneOverlayModel, ZoneOverlayZone } from "../../stats/zones/zone-types";

function zone(overrides: Partial<ZoneOverlayZone> & { id: ZoneOverlayZone["id"] }): ZoneOverlayZone {
  return {
    label: overrides.id,
    bounds: { xMin: 0, xMax: 33.33, yMin: 0, yMax: 33.33 },
    count: 0,
    percentage: 0,
    hotspotRank: null,
    isHotspot: false,
    ...overrides,
  };
}

function fixtureModel(): ZoneOverlayModel {
  return {
    zoneMapId: "v1-nine-zone-grid",
    totalEvents: 10,
    zones: [
      zone({ id: "DEFENSIVE_LEFT", count: 0, percentage: 0 }), // empty zone
      zone({ id: "MIDDLE_CENTRE", count: 3, percentage: 30 }), // occupied, non-hotspot
      zone({ id: "ATTACKING_RIGHT", count: 7, percentage: 70, hotspotRank: 1, isHotspot: true }), // hotspot
    ],
    hotspots: [],
  };
}

type DrawInstruction = { action: string; data?: { style?: { alpha?: number; color?: number } } };

/**
 * pixi.js v8's Graphics.context.instructions bakes each shape call directly
 * into "fill"/"stroke" entries (no separate "rect"/"roundRect" marker), in
 * emission order. drawZoneCell emits, per zone in fixtureModel()'s order
 * [empty, occupied non-hotspot, hotspot]:
 *   zone0 (empty):              fill, stroke                     -> fills[0], strokes[0]
 *   zone1 (occupied, non-hot):  fill, stroke                     -> fills[1], strokes[1]
 *   zone2 (hotspot):            fill(glow), fill(main), stroke(main), stroke(ring)
 *                                                                 -> fills[2]=glow, fills[3]=main,
 *                                                                    strokes[2]=main, strokes[3]=ring
 * So strokes[0..2] are always each zone's *main cell* boundary alpha, in
 * zone order — the value this audit is about (the empty-zone floor and the
 * general boundary-strength doubling).
 */
function rectFillStrokeAlphas(layer: Graphics): { fillAlphas: number[]; strokeAlphas: number[] } {
  const instructions = (layer.context as unknown as { instructions: DrawInstruction[] }).instructions;
  const fillAlphas = instructions
    .filter((inst) => inst.action === "fill")
    .map((inst) => inst.data?.style?.alpha as number);
  const strokeAlphas = instructions
    .filter((inst) => inst.action === "stroke")
    .map((inst) => inst.data?.style?.alpha as number);
  return { fillAlphas, strokeAlphas };
}

describe("DEFAULT_ZONE_OVERLAY_STYLE — regression lock for Match Stats / Rapid Capture", () => {
  it("matches the exact values this overlay has always rendered with", () => {
    // These are the literal constants that existed inline in drawZoneCell/
    // drawZoneCountBadge before the style parameter was introduced. Any
    // change to this object changes Match Stats' and Rapid Capture's
    // rendered appearance and must not happen as part of the Event Stats
    // Zones work.
    expect(DEFAULT_ZONE_OVERLAY_STYLE).toEqual({
      emptyBorderAlpha: 0.02,
      emptyFillAlpha: 0.0011,
      borderAlphaBase: 0.045,
      borderAlphaActivity: 0.11,
      fillAlphaBase: 0.0038,
      fillAlphaActivity: 0.026,
      hotspotBorderBoost: 0.06,
      hotspotFillBoost: 0.014,
      hotspotGlowBase: 0.022,
      hotspotGlowActivity: 0.038,
      hotspotRingBase: 0.13,
      hotspotRingActivity: 0.08,
      badgeBackgroundAlpha: 0.36,
      badgeBackgroundAlphaHotspot: 0.48,
      badgeBorderAlpha: 0.24,
      badgeBorderAlphaHotspot: 0.34,
    });
  });
});

describe("drawStatsZoneOverlay — no style argument renders with default alphas", () => {
  it("omitting style produces the same rect fill/stroke alphas as explicitly passing DEFAULT_ZONE_OVERLAY_STYLE", () => {
    const model = fixtureModel();
    const noStyleLayer = new Graphics();
    const explicitDefaultLayer = new Graphics();

    drawStatsZoneOverlay(noStyleLayer, model);
    drawStatsZoneOverlay(explicitDefaultLayer, model, DEFAULT_ZONE_OVERLAY_STYLE);

    expect(rectFillStrokeAlphas(noStyleLayer)).toEqual(rectFillStrokeAlphas(explicitDefaultLayer));
  });

  it("the empty zone's border alpha, with no style argument, is exactly DEFAULT_ZONE_OVERLAY_STYLE.emptyBorderAlpha (0.02) — today's barely-visible floor", () => {
    const model = fixtureModel();
    const layer = new Graphics();
    drawStatsZoneOverlay(layer, model);

    const { strokeAlphas } = rectFillStrokeAlphas(layer);
    // zones[] order is preserved: DEFENSIVE_LEFT (empty) drawn first.
    expect(strokeAlphas[0]).toBeCloseTo(DEFAULT_ZONE_OVERLAY_STYLE.emptyBorderAlpha, 10);
  });

  it("passing null model still no-ops safely with no style argument (existing contract unchanged)", () => {
    const layer = new Graphics();
    expect(() => drawStatsZoneOverlay(layer, null)).not.toThrow();
  });
});

describe("drawStatsZoneOverlay — style argument contract (partial override, rest fall back to defaults)", () => {
  it("a partial style overrides only the fields it sets; every omitted field keeps the default alpha", () => {
    const model = fixtureModel();
    const defaultLayer = new Graphics();
    const overrideLayer = new Graphics();

    drawStatsZoneOverlay(defaultLayer, model);
    drawStatsZoneOverlay(overrideLayer, model, { emptyBorderAlpha: 0.5 });

    const defaultAlphas = rectFillStrokeAlphas(defaultLayer);
    const overrideAlphas = rectFillStrokeAlphas(overrideLayer);

    // The empty zone's border alpha changed to the override...
    expect(overrideAlphas.strokeAlphas[0]).toBeCloseTo(0.5, 10);
    expect(overrideAlphas.strokeAlphas[0]).not.toBeCloseTo(defaultAlphas.strokeAlphas[0], 10);
    // ...but the occupied zones' fill alphas (untouched fields) are unchanged.
    expect(overrideAlphas.fillAlphas[1]).toBeCloseTo(defaultAlphas.fillAlphas[1], 10);
    expect(overrideAlphas.fillAlphas[2]).toBeCloseTo(defaultAlphas.fillAlphas[2], 10);
  });

  it("a full Event-Stats-strength style produces strictly stronger boundary alphas on every zone, including the empty one", () => {
    const model = fixtureModel();
    const defaultLayer = new Graphics();
    const strongLayer = new Graphics();
    const eventStatsStyle = {
      emptyBorderAlpha: 0.05,
      emptyFillAlpha: 0.003,
      borderAlphaBase: 0.09,
      borderAlphaActivity: 0.22,
      fillAlphaBase: 0.006,
      fillAlphaActivity: 0.04,
      hotspotBorderBoost: 0.08,
      hotspotFillBoost: 0.02,
      hotspotGlowBase: 0.032,
      hotspotGlowActivity: 0.055,
      hotspotRingBase: 0.16,
      hotspotRingActivity: 0.1,
      badgeBackgroundAlpha: 0.6,
      badgeBackgroundAlphaHotspot: 0.72,
      badgeBorderAlpha: 0.4,
      badgeBorderAlphaHotspot: 0.5,
    };

    drawStatsZoneOverlay(defaultLayer, model);
    drawStatsZoneOverlay(strongLayer, model, eventStatsStyle);

    const defaultAlphas = rectFillStrokeAlphas(defaultLayer);
    const strongAlphas = rectFillStrokeAlphas(strongLayer);

    for (let i = 0; i < 3; i++) {
      expect(strongAlphas.strokeAlphas[i]).toBeGreaterThan(defaultAlphas.strokeAlphas[i]);
    }
    // The empty zone specifically must not stay at the near-invisible default.
    expect(strongAlphas.strokeAlphas[0]).toBeGreaterThanOrEqual(0.05);
  });
});

describe("Zone overlay style — Match Stats / Rapid Capture call sites are provably unaffected", () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const statsModeSurfaceSource = readFileSync(path.join(repoRoot, "src", "StatsModeSurface.tsx"), "utf8");
  const rapidReviewSource = readFileSync(
    path.join(repoRoot, "src", "rapid-capture", "RapidReviewScreen.tsx"),
    "utf8",
  );

  it("StatsModeSurface.tsx's setZoneOverlayModel call is unchanged — single argument, no style", () => {
    expect(statsModeSurfaceSource).toContain(
      "handleRef.current?.setZoneOverlayModel(\n      isReviewModeActive && showReviewZones ? reviewZoneOverlayModel : null,\n    );",
    );
    expect(statsModeSurfaceSource).not.toContain("ZoneOverlayStyle");
    expect(statsModeSurfaceSource).not.toContain("EVENT_MAP_ZONE_OVERLAY_STYLE");
  });

  it("RapidReviewScreen.tsx's setZoneOverlayModel call is unchanged — single argument, no style", () => {
    expect(rapidReviewSource).toContain(
      "handleRef.current?.setZoneOverlayModel(zoneOverlayModel ?? null);",
    );
    expect(rapidReviewSource).not.toContain("ZoneOverlayStyle");
    expect(rapidReviewSource).not.toContain("EVENT_MAP_ZONE_OVERLAY_STYLE");
  });

  it("ProTaggerReviewScreen.tsx is the only caller that supplies a style — and it uses its own named constant, not the shared default", () => {
    const proTaggerReviewSource = readFileSync(
      path.join(repoRoot, "src", "pro-tagger", "ProTaggerReviewScreen.tsx"),
      "utf8",
    );
    expect(proTaggerReviewSource).toContain(
      "handleRef.current?.setZoneOverlayModel(zoneOverlayModel ?? null, EVENT_MAP_ZONE_OVERLAY_STYLE);",
    );
  });
});
