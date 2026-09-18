import { describe, expect, it } from "vitest";

import { sanitizeToken, resolveTokenDisplayLabel } from "./token-layer";
import type { MovementBoardToken } from "../shell/types";

/**
 * PR2B coverage for the token-layer presentation boundary: sanitizeToken's
 * whitelist (the exact class of bug documented inline for `team` before
 * this PR — a field left out of sanitizeToken is silently stripped on every
 * setTokens() round-trip) and resolveTokenDisplayLabel's labelMode
 * resolution, including the legacy-scenario default.
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

describe("sanitizeToken — PR2B kit-appearance field whitelist", () => {
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

  it("preserves each valid labelMode", () => {
    for (const mode of ["number", "initials", "name"] as const) {
      expect(sanitizeToken(makeToken({ labelMode: mode })).labelMode).toBe(mode);
    }
  });

  it("drops an invalid labelMode to undefined", () => {
    expect(sanitizeToken(makeToken({ labelMode: "nickname" as never })).labelMode).toBeUndefined();
  });

  it("sanitizes initials the same way Standard Slate's Kit Editor does (uppercase, letters only, capped at 3)", () => {
    expect(sanitizeToken(makeToken({ initials: "  ab1! " })).initials).toBe("AB");
  });

  it("leaves a token with none of the PR2B fields set producing them all as undefined (legacy scenario shape)", () => {
    const sanitized = sanitizeToken(makeToken());
    expect(sanitized.kitPattern).toBeUndefined();
    expect(sanitized.kitPatternColor).toBeUndefined();
    expect(sanitized.labelMode).toBeUndefined();
    expect(sanitized.initials).toBeUndefined();
  });

  it("does not alter the pre-existing, more permissive label sanitization (backward compatibility)", () => {
    // Pre-PR2B behaviour: trim only, no charset restriction — must stay
    // exactly this permissive so older stored nicknames are never altered.
    expect(sanitizeToken(makeToken({ label: "  Dozer 123!  " })).label).toBe("Dozer 123!");
  });

  it("still preserves `team` (the pre-existing gap this function's own comment documents) alongside the new fields", () => {
    expect(sanitizeToken(makeToken({ team: "away" })).team).toBe("away");
  });

  it("round-trips cleanly through JSON (the exact shape scenario save/load and copy-scenario rely on)", () => {
    const token = makeToken({
      kitPattern: "hoops",
      kitPatternColor: "black",
      labelMode: "name",
      initials: "DZ",
      label: "Dozer",
    });
    const roundTripped = JSON.parse(JSON.stringify(token)) as MovementBoardToken;
    expect(sanitizeToken(roundTripped)).toEqual(sanitizeToken(token));
  });
});

describe("resolveTokenDisplayLabel — labelMode resolution", () => {
  it("number mode returns empty string (renderer's own fallback then shows the jersey number)", () => {
    expect(resolveTokenDisplayLabel(makeToken({ labelMode: "number", label: "Dozer" }))).toBe("");
  });

  it("initials mode returns the initials field, ignoring label", () => {
    expect(resolveTokenDisplayLabel(makeToken({ labelMode: "initials", initials: "DZ", label: "Dozer" }))).toBe("DZ");
  });

  it("initials mode with no initials set returns empty string (falls back to number, same as number mode)", () => {
    expect(resolveTokenDisplayLabel(makeToken({ labelMode: "initials" }))).toBe("");
  });

  it("name mode returns the full label field", () => {
    expect(resolveTokenDisplayLabel(makeToken({ labelMode: "name", label: "Dozer" }))).toBe("Dozer");
  });

  it("name mode caps at 20 characters (display-time only, never mutates stored data)", () => {
    const longName = "A".repeat(30);
    const token = makeToken({ labelMode: "name", label: longName });
    expect(resolveTokenDisplayLabel(token)).toHaveLength(20);
    expect(token.label).toHaveLength(30); // stored value itself is untouched
  });

  it("legacy default (labelMode undefined) shows the existing label in full — not the old 3-character truncation", () => {
    const legacyToken = makeToken({ label: "Dozer" }); // no labelMode at all, as every pre-PR2B token has
    expect(resolveTokenDisplayLabel(legacyToken)).toBe("Dozer");
  });

  it("legacy default with no label at all returns empty string (renderer falls back to the jersey number)", () => {
    expect(resolveTokenDisplayLabel(makeToken())).toBe("");
  });
});
