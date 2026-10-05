import { describe, expect, it } from "vitest";

import { buildRecordingWatermarkSpec, parseCssColor } from "./recordingWatermark";

describe("parseCssColor", () => {
  it("reads rgb and rgba computed colours", () => {
    expect(parseCssColor("rgba(220, 235, 255, 0.22)")).toEqual({ color: 0xdcebff, alpha: 0.22 });
    expect(parseCssColor("rgba(0, 0, 0, 0.22)")).toEqual({ color: 0x000000, alpha: 0.22 });
    expect(parseCssColor("rgb(255, 255, 255)")).toEqual({ color: 0xffffff, alpha: 1 });
  });

  it("rejects anything else", () => {
    expect(parseCssColor("black")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});

describe("buildRecordingWatermarkSpec", () => {
  const style = {
    color: "rgba(220, 235, 255, 0.22)",
    fontSize: "11px",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "600",
    letterSpacing: "1.32px",
    textShadow: "rgba(0, 0, 0, 0.55) 0px 1px 4px, rgba(0, 0, 0, 0.35) 0px 0px 12px",
  };

  it("places the text at the overlay's bottom-right corner, in canvas coordinates", () => {
    const spec = buildRecordingWatermarkSpec({
      text: "PáircVision",
      elementRect: { right: 870, bottom: 540 },
      canvasRect: { left: 20, top: 10 },
      style,
    });
    expect(spec).toEqual({
      text: "PáircVision",
      right: 850,
      bottom: 530,
      fontSize: 11,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "600",
      letterSpacing: 1.32,
      color: 0xdcebff,
      alpha: 0.22,
      shadow: true,
    });
  });

  it("carries the Whiteboard's clean black watermark through: solid black, no shadow", () => {
    const spec = buildRecordingWatermarkSpec({
      text: "PáircVision",
      elementRect: { right: 100, bottom: 100 },
      canvasRect: { left: 0, top: 0 },
      style: { ...style, color: "rgb(0, 0, 0)", textShadow: "none" },
    });
    expect(spec?.color).toBe(0x000000);
    expect(spec?.alpha).toBe(1);
    expect(spec?.shadow).toBe(false);
  });

  it("treats `normal` letter spacing as none and refuses unusable input", () => {
    const base = { text: "PáircVision", elementRect: { right: 1, bottom: 1 }, canvasRect: { left: 0, top: 0 } };
    expect(buildRecordingWatermarkSpec({ ...base, style: { ...style, letterSpacing: "normal" } })?.letterSpacing).toBe(0);
    expect(buildRecordingWatermarkSpec({ ...base, style: { ...style, color: "transparent" } })).toBeNull();
    expect(buildRecordingWatermarkSpec({ ...base, text: "", style })).toBeNull();
  });
});
