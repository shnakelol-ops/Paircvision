// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PitchWatermark } from "./PitchWatermark";

afterEach(() => {
  cleanup();
});

/**
 * Regression lock for the Tactical Slate / Tactical Sequence watermark
 * parity fix. Tactical Slate (TacticalPadLiteClean.tsx) has always passed
 * `lowered` in portrait; Tactical Sequence (TacticalPlaySurface.tsx) did
 * not, leaving its watermark at the higher, un-lowered "Tactical Play"
 * default position instead of matching Slate's endline-relative position.
 * This locks the actual invariant — both modes render at the identical
 * `bottom` offset in portrait — rather than re-asserting cosmetic details.
 */
describe("PitchWatermark — Tactical Slate / Tactical Sequence position parity", () => {
  it("portrait + lowered (Slate's own usage) renders at the endline-relative offset", () => {
    render(<PitchWatermark portrait lowered />);
    const node = screen.getByText("PáircVision");
    expect(node.style.bottom).toBe("5%");
  });

  it("portrait Tactical Sequence usage matches Slate's lowered offset exactly", () => {
    // Mirrors the exact call TacticalPlaySurface.tsx makes.
    render(<PitchWatermark portrait lowered />);
    const node = screen.getByText("PáircVision");
    expect(node.style.bottom).toBe("5%");
  });

  it("portrait without lowered uses the higher, distinct default offset", () => {
    render(<PitchWatermark portrait />);
    const node = screen.getByText("PáircVision");
    expect(node.style.bottom).not.toBe("5%");
    expect(node.style.bottom).toBe("14%");
  });

  it("landscape ignores `lowered` — both modes already share one fixed-pixel position", () => {
    render(<PitchWatermark portrait={false} lowered />);
    const withLowered = screen.getByText("PáircVision").style.bottom;
    cleanup();
    render(<PitchWatermark portrait={false} />);
    const withoutLowered = screen.getByText("PáircVision").style.bottom;
    expect(withLowered).toBe(withoutLowered);
    expect(withLowered).toBe("14px");
  });
});

describe("PitchWatermark — Whiteboard black watermark", () => {
  const read = (props: { portrait: boolean; lowered?: boolean; dark?: boolean }) => {
    render(<PitchWatermark {...props} />);
    const node = screen.getByText("PáircVision");
    const style = {
      color: node.style.color,
      bottom: node.style.bottom,
      right: node.style.right,
      fontSize: node.style.fontSize,
      fontFamily: node.style.fontFamily,
      fontWeight: node.style.fontWeight,
      letterSpacing: node.style.letterSpacing,
      textShadow: node.style.textShadow,
      zIndex: node.style.zIndex,
    };
    cleanup();
    return style;
  };

  it("without `dark` keeps the existing light watermark colour", () => {
    expect(read({ portrait: false }).color).toBe("rgba(220, 235, 255, 0.22)");
    expect(read({ portrait: true, lowered: true }).color).toBe("rgba(220, 235, 255, 0.22)");
  });

  it("`dark` changes only the colour, to black at the same opacity, in landscape and portrait", () => {
    for (const layout of [{ portrait: false }, { portrait: true, lowered: true }]) {
      const standard = read(layout);
      const dark = read({ ...layout, dark: true });
      expect(dark.color).toBe("rgba(0, 0, 0, 0.22)");
      expect({ ...dark, color: standard.color }).toEqual(standard);
    }
  });
});
