// Visual correction regression coverage: the Squad Setup lineup pitch must
// reproduce PáircVision's real Event Stats tagging pitch — the same
// marking data ProTaggerPitchView.tsx renders from (getPitchConfig
// ("gaelic"), pitch-config.ts) — rather than an independently invented
// decorative subset, while creating zero runtime dependency on
// ProTaggerPitchView.tsx itself or its coordinate-capture logic.
//
// ProTaggerLineupPitchBackground.tsx has no React rendering harness in this
// repo (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same
// constraint), so this suite verifies the underlying data it renders from
// (identical to what the real tagging pitch uses) plus a source-level check
// that no interactive/capture logic was pulled in.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPitchConfig } from "../core/pitch/pitch-config";
import { LINEUP_PITCH_PORTRAIT_VIEWBOX } from "./ProTaggerLineupPitchBackground";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerLineupPitchBackground.tsx", import.meta.url)), "utf8");
// Strips `//` line comments so the "no capture logic" check below matches
// actual code, not documentation prose that legitimately names the exact
// APIs this file deliberately does NOT import/use.
const codeOnly = source.replace(/\/\/.*$/gm, "");

describe("ProTaggerLineupPitchBackground — reproduces the real tagging pitch (visual correction)", () => {
  it("its portrait viewBox is the real Gaelic pitch config's viewBox, swapped for portrait — not an invented size", () => {
    const realConfig = getPitchConfig("gaelic");
    expect(LINEUP_PITCH_PORTRAIT_VIEWBOX.w).toBe(realConfig.viewBox.h);
    expect(LINEUP_PITCH_PORTRAIT_VIEWBOX.h).toBe(realConfig.viewBox.w);
  });

  it("the real Gaelic pitch config has more than a trivial handful of markings (so this component is drawing the full real pitch, not a placeholder)", () => {
    const realConfig = getPitchConfig("gaelic");
    expect(realConfig.markings.length).toBeGreaterThan(10);
  });

  it("imports pitch-config.ts (the shared marking DATA module) but never ProTaggerPitchView.tsx itself", () => {
    expect(source).toMatch(/from ["']\.\.\/core\/pitch\/pitch-config["']/);
    expect(source).not.toMatch(/from ["']\.\/ProTaggerPitchView["']/);
  });

  it("contains no capture-coordinate or interactive logic in actual code (comments may name what's deliberately excluded)", () => {
    for (const forbidden of [
      "onTap",
      "onPointerDown",
      "svgPointToPitchNorm",
      "clientPointToPitchNorm",
      "attackDirection",
      "feedbackDot",
      "wrongWay",
    ]) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });

  it("takes no props — it is a fixed, parameterless decoration", () => {
    expect(source).toMatch(/export function ProTaggerLineupPitchBackground\(\)/);
  });
});

// MATCHDAY PITCH final visual polish pass: the pitch is slightly quietened
// (fill/line opacity only) so the jerseys read as the focal point, with no
// change to marking geometry, colours, or the real pitch-config data.
describe("ProTaggerLineupPitchBackground — MATCHDAY PITCH polish: quietened, not redrawn", () => {
  it("reduces the base grass fill's opacity and the markings' opacity rather than leaving both fully opaque", () => {
    expect(source).toMatch(/fillOpacity=\{[\d.]+\}/);
    const fillOpacityMatch = source.match(/fillOpacity=\{([\d.]+)\}/);
    expect(fillOpacityMatch).not.toBeNull();
    expect(Number(fillOpacityMatch![1])).toBeLessThan(1);
    expect(Number(fillOpacityMatch![1])).toBeGreaterThan(0.5);

    const groupOpacityMatch = source.match(/PORTRAIT_MARKINGS_TRANSFORM\}\s*opacity=\{([\d.]+)\}/);
    expect(groupOpacityMatch).not.toBeNull();
    expect(Number(groupOpacityMatch![1])).toBeLessThan(1);
    expect(Number(groupOpacityMatch![1])).toBeGreaterThan(0.5);
  });

  it("still draws every real marking with no geometry/colour override — only an opacity change on the wrapping group", () => {
    expect(source).toMatch(/GAELIC_PITCH_CONFIG\.markings\.map\(renderPitchMarking\)/);
  });

  it("the base grass colour itself is unchanged (still the real pitch green, only its opacity is reduced)", () => {
    expect(source).toMatch(/fill="#166534"/);
  });
});
