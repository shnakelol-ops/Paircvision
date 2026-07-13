import { describe, expect, it } from "vitest";
import { svgPointToPitchNorm, clientPointToPitchNorm } from "./ProTaggerPitchView";
import { boardNormToWorld } from "../core/coordinates/pitch-coordinates";
import { getPitchConfig } from "../core/pitch/pitch-config";

// Coordinate integrity audit (release blocker): a tap on the Pro Tagger portrait
// pitch was stored with the sideline (Y / ny) axis mirrored relative to the
// canonical landscape frame every other renderer (Review's Pixi surface,
// reviewPdfExport.ts, zone analysis) assumes. See ProTaggerPitchView.tsx's
// PORTRAIT_MARKINGS_TRANSFORM / svgPointToPitchNorm comments for the fix.
//
// These tests pin the *rotation* (not reflection) contract: taking a canonical
// (nx, ny), rendering it forward through the same 90°-clockwise rule the SVG
// markings/feedback dot use, then decoding that portrait point back through
// svgPointToPitchNorm, must return the original (nx, ny).

const LANDSCAPE_VIEWBOX = getPitchConfig("gaelic").viewBox; // { w: 160, h: 100 }

// Mirrors the production `PORTRAIT_MARKINGS_TRANSFORM` SVG matrix
// (matrix(0 1 -1 0 landscapeH 0)): screenX = landscapeH - Y, screenY = X.
function forwardToPortraitScreen(nx: number, ny: number): { svgX: number; svgY: number } {
  const world = boardNormToWorld(nx, ny, LANDSCAPE_VIEWBOX);
  return { svgX: LANDSCAPE_VIEWBOX.h - world.y, svgY: world.x };
}

const ASYMMETRIC_POINTS: ReadonlyArray<{ nx: number; ny: number }> = [
  { nx: 0.15, ny: 0.12 },
  { nx: 0.82, ny: 0.18 },
  { nx: 0.83, ny: 0.87 },
  { nx: 0.21, ny: 0.91 },
];

describe("svgPointToPitchNorm — capture is the inverse of the portrait render", () => {
  for (const point of ASYMMETRIC_POINTS) {
    it(`round-trips (nx=${point.nx}, ny=${point.ny}) through the portrait screen`, () => {
      const { svgX, svgY } = forwardToPortraitScreen(point.nx, point.ny);
      const recovered = svgPointToPitchNorm(svgX, svgY, LANDSCAPE_VIEWBOX);
      expect(recovered.nx).toBeCloseTo(point.nx, 6);
      expect(recovered.ny).toBeCloseTo(point.ny, 6);
    });
  }

  it("keeps the length axis (nx) reading the same physical end regardless of sideline (ny)", () => {
    // Two taps at the same length position but opposite sidelines must
    // disagree only on ny, never bleed into nx (guards against an axis swap
    // being reintroduced instead of a same-axis mirror).
    const near = forwardToPortraitScreen(0.3, 0.1);
    const far = forwardToPortraitScreen(0.3, 0.9);
    const recoveredNear = svgPointToPitchNorm(near.svgX, near.svgY, LANDSCAPE_VIEWBOX);
    const recoveredFar = svgPointToPitchNorm(far.svgX, far.svgY, LANDSCAPE_VIEWBOX);
    expect(recoveredNear.nx).toBeCloseTo(recoveredFar.nx, 6);
    expect(recoveredNear.ny).toBeLessThan(recoveredFar.ny);
  });

  it("is a genuine 90° rotation, not a mirror reflection", () => {
    // A landscape top-left corner (nx=0, ny=0) must rotate clockwise to the
    // portrait top-right corner, matching PORTRAIT_MARKINGS_TRANSFORM. A bare
    // axis swap (the historical bug) instead sends it to portrait top-left —
    // visually plausible (GAA markings are close to bilaterally symmetric)
    // but physically the wrong touchline.
    const topLeft = forwardToPortraitScreen(0, 0);
    expect(topLeft.svgX).toBeCloseTo(LANDSCAPE_VIEWBOX.h, 6); // right edge of portrait
    expect(topLeft.svgY).toBeCloseTo(0, 6); // top edge of portrait

    const recovered = svgPointToPitchNorm(topLeft.svgX, topLeft.svgY, LANDSCAPE_VIEWBOX);
    expect(recovered.nx).toBeCloseTo(0, 6);
    expect(recovered.ny).toBeCloseTo(0, 6);
  });

  it("clamps out-of-bounds taps into the portrait viewbox before decoding", () => {
    const recovered = svgPointToPitchNorm(-50, 5000, LANDSCAPE_VIEWBOX);
    expect(recovered.nx).toBeGreaterThanOrEqual(0);
    expect(recovered.nx).toBeLessThanOrEqual(1);
    expect(recovered.ny).toBeGreaterThanOrEqual(0);
    expect(recovered.ny).toBeLessThanOrEqual(1);
  });
});

describe("clientPointToPitchNorm — DOM tap coordinates decode through the same rotation", () => {
  it("recovers an asymmetric tap through a scaled, offset client rect", () => {
    for (const point of ASYMMETRIC_POINTS) {
      const { svgX, svgY } = forwardToPortraitScreen(point.nx, point.ny);
      const scale = 3.4;
      const rect = { left: 12, top: 40, width: 100 * scale, height: 160 * scale };
      const clientX = rect.left + svgX * scale;
      const clientY = rect.top + svgY * scale;
      const recovered = clientPointToPitchNorm(clientX, clientY, rect, LANDSCAPE_VIEWBOX);
      expect(recovered.nx).toBeCloseTo(point.nx, 4);
      expect(recovered.ny).toBeCloseTo(point.ny, 4);
    }
  });
});
