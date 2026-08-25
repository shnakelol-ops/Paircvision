// Regression coverage for Quick Review Page 1's singular/plural display
// grammar (previously hardcoded plural, e.g. "1 shots"/"1 scores" —
// unprofessional-looking with a coach reading the screen aloud).
import { describe, it, expect } from "vitest";
import { pluralize } from "./QuickReviewPage1";

describe("Quick Review Page 1: pluralize (shot/shots, score/scores agreement)", () => {
  it("0 is plural", () => {
    expect(pluralize(0, "shot")).toBe("shots");
    expect(pluralize(0, "score")).toBe("scores");
  });

  it("1 is singular", () => {
    expect(pluralize(1, "shot")).toBe("shot");
    expect(pluralize(1, "score")).toBe("score");
  });

  it("2+ is plural", () => {
    expect(pluralize(2, "shot")).toBe("shots");
    expect(pluralize(3, "score")).toBe("scores");
    expect(pluralize(11, "shot")).toBe("shots");
  });

  it("composes into the exact inline strings Page 1 renders", () => {
    const withCount = (count: number, noun: string, against = false) =>
      `${count} ${pluralize(count, noun)}${against ? " against" : ""}`;

    expect(withCount(0, "shot")).toBe("0 shots");
    expect(withCount(1, "shot")).toBe("1 shot");
    expect(withCount(2, "shot")).toBe("2 shots");
    expect(withCount(0, "score")).toBe("0 scores");
    expect(withCount(1, "score")).toBe("1 score");
    expect(withCount(2, "score")).toBe("2 scores");
    expect(withCount(1, "shot", true)).toBe("1 shot against");
    expect(withCount(2, "score", true)).toBe("2 scores against");
  });
});
