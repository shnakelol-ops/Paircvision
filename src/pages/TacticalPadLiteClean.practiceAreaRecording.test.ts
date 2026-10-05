import { describe, expect, it } from "vitest";

import { recordPhaseSuspendsPracticeAreas } from "./TacticalPadLiteClean";

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
