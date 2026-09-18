import { describe, expect, it } from "vitest";

import { sanitizeToken, resolveTokenDisplayLabel } from "./token-layer";
import type { MovementBoardToken } from "../shell/types";

/**
 * Coverage for the token-layer presentation boundary: sanitizeToken's
 * whitelist (the exact class of bug documented inline for `team` — a field
 * left out of sanitizeToken is silently stripped on every setTokens()
 * round-trip) and resolveTokenDisplayLabel's identity-string resolution.
 *
 * kitPattern/kitPatternColor are team-derived (see
 * features/vision-tactics/teamKit.ts) — never edited directly on a token by
 * a coach — but still whitelisted here since this function is the one
 * choke point every token passes through before rendering, regardless of
 * where its fields came from.
 */
function makeToken(overrides: Partial<MovementBoardToken> = {}): MovementBoardToken {
  return {
    id: "p9",
    number: 9,
    color: "red",
    position: { x: 50, y: 50 },
    ...overrides,
  };
}

describe("sanitizeToken — kit-appearance field whitelist", () => {
  it("preserves a valid kitPattern", () => {
    expect(sanitizeToken(makeToken({ kitPattern: "slash" })).kitPattern).toBe("slash");
  });

  it("preserves every one of the six canonical Vision V3 patterns", () => {
    const patterns = ["plain", "hoops", "stripes", "slash", "chestDash", "gradient"] as const;
    for (const pattern of patterns) {
      expect(sanitizeToken(makeToken({ kitPattern: pattern })).kitPattern).toBe(pattern);
    }
  });

  it("drops an invalid kitPattern to undefined rather than silently keeping garbage", () => {
    expect(sanitizeToken(makeToken({ kitPattern: "not-a-pattern" as never })).kitPattern).toBeUndefined();
  });

  it("preserves a valid kitPatternColor", () => {
    expect(sanitizeToken(makeToken({ kitPatternColor: "white" })).kitPatternColor).toBe("white");
  });

  it("leaves kitPatternColor undefined when unset (no forced default at the sanitize boundary)", () => {
    expect(sanitizeToken(makeToken()).kitPatternColor).toBeUndefined();
  });

  it("leaves a token with neither kit field set producing both as undefined (legacy scenario shape)", () => {
    const sanitized = sanitizeToken(makeToken());
    expect(sanitized.kitPattern).toBeUndefined();
    expect(sanitized.kitPatternColor).toBeUndefined();
  });

  it("label (player identity, never part of a kit) keeps its permissive, charset-unrestricted sanitization — trim only", () => {
    expect(sanitizeToken(makeToken({ label: "  Dozer 123!  " })).label).toBe("Dozer 123!");
  });

  it("still preserves `team` (the pre-existing gap this function's own comment documents) alongside the kit fields", () => {
    expect(sanitizeToken(makeToken({ team: "away" })).team).toBe("away");
  });

  it("round-trips cleanly through JSON (the exact shape scenario save/load and copy-scenario rely on)", () => {
    const token = makeToken({
      kitPattern: "hoops",
      kitPatternColor: "black",
      label: "Dozer",
    });
    const roundTripped = JSON.parse(JSON.stringify(token)) as MovementBoardToken;
    expect(sanitizeToken(roundTripped)).toEqual(sanitizeToken(token));
  });
});

describe("resolveTokenDisplayLabel", () => {
  it("returns the trimmed label", () => {
    expect(resolveTokenDisplayLabel(makeToken({ label: "Dozer" }))).toBe("Dozer");
  });

  it("returns empty string when there is no label (renderer's own fallback then shows the jersey number)", () => {
    expect(resolveTokenDisplayLabel(makeToken())).toBe("");
  });
});
