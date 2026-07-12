import { describe, expect, it } from "vitest";
import { parseCssColorForPixi } from "./draw-stats-markers";

describe("parseCssColorForPixi", () => {
  it("parses 6-digit hex colours (team colours are stored as hex)", () => {
    expect(parseCssColorForPixi("#1f6feb")).toEqual({ color: 0x1f6feb, alpha: 1 });
    expect(parseCssColorForPixi("#b91c1c")).toEqual({ color: 0xb91c1c, alpha: 1 });
  });

  it("parses 3-digit shorthand hex colours", () => {
    expect(parseCssColorForPixi("#fff")).toEqual({ color: 0xffffff, alpha: 1 });
    expect(parseCssColorForPixi("#000")).toEqual({ color: 0x000000, alpha: 1 });
  });

  it("still parses rgba() strings exactly as before (marker kind colours)", () => {
    expect(parseCssColorForPixi("rgba(22, 163, 74, 1)")).toEqual({ color: 0x16a34a, alpha: 1 });
  });

  it("still parses rgb() (3-segment) strings", () => {
    expect(parseCssColorForPixi("rgb(255, 0, 0)")).toEqual({ color: 0xff0000, alpha: 1 });
  });

  it("falls back to white for unparseable input", () => {
    expect(parseCssColorForPixi("not-a-colour")).toEqual({ color: 0xffffff, alpha: 1 });
  });
});
