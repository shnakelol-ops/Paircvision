import { describe, expect, it } from "vitest";

import { recordPhaseCapturesWatermark, recordPhaseSuspendsPracticeAreas } from "./TacticalPadLiteClean";

describe("Practice Area editing during clip recording", () => {
  it("is suspended from the countdown until the clip stops", () => {
    expect(recordPhaseSuspendsPracticeAreas("countdown")).toBe(true);
    expect(recordPhaseSuspendsPracticeAreas("recording")).toBe(true);
  });

  it("works normally before recording and once the clip is done", () => {
    expect(recordPhaseSuspendsPracticeAreas("idle")).toBe(false);
    expect(recordPhaseSuspendsPracticeAreas("panel")).toBe(false);
    expect(recordPhaseSuspendsPracticeAreas("done")).toBe(false);
  });
});

describe("Watermark in recorded clips", () => {
  it("is drawn into the recorded canvas from the countdown until the clip stops", () => {
    expect(recordPhaseCapturesWatermark("countdown")).toBe(true);
    expect(recordPhaseCapturesWatermark("recording")).toBe(true);
  });

  it("is a normal DOM overlay otherwise (no second watermark while editing)", () => {
    expect(recordPhaseCapturesWatermark("idle")).toBe(false);
    expect(recordPhaseCapturesWatermark("panel")).toBe(false);
    expect(recordPhaseCapturesWatermark("done")).toBe(false);
  });
});
