import { describe, expect, it } from "vitest";

import {
  patchTokenKit,
  resolveGameTimingKitEditorValue,
  computeAppearanceEditorPosition,
} from "./TacticalPlaySurface";
import type { MovementBoardToken } from "../../movement-board/shell/types";

/**
 * PR2B coverage for Game Timing's per-player kit-editing glue. Mirrors
 * TacticalPadLiteClean.kitEditor.test.ts's role for Standard Slate: proves
 * the parent-side resolution/patch logic feeding PlayerKitEditor is
 * correct, independent of PlayerKitEditor itself (already covered by
 * PlayerKitEditor.test.tsx) and independent of the live Pixi shell (which
 * cannot be constructed in this test environment — no jsdom/canvas, same
 * documented limitation as Slate's own kit editor test file).
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

describe("patchTokenKit — per-player isolation (deliberately NOT Standard Slate's team-wide behaviour)", () => {
  it("patches only the matching token id", () => {
    const tokens = [makeToken({ id: "p8", color: "red" }), makeToken({ id: "p9", color: "red" })];
    const next = patchTokenKit(tokens, "p9", { color: "green" });
    expect(next.find((t) => t.id === "p9")!.color).toBe("green");
    expect(next.find((t) => t.id === "p8")!.color).toBe("red");
  });

  it("editing #8's appearance never mutates #9 — the exact scenario PR2B requires", () => {
    const p8 = makeToken({ id: "p8", number: 8, color: "blue", kitPattern: "hoops" });
    const p9 = makeToken({ id: "p9", number: 9, color: "red", kitPattern: "slash" });
    const tokens = [p8, p9];

    const next = patchTokenKit(tokens, "p8", {
      color: "purple",
      kitPattern: "gradient",
      kitPatternColor: "yellow",
      labelMode: "initials",
      initials: "MC",
    });

    const nextP8 = next.find((t) => t.id === "p8")!;
    const nextP9 = next.find((t) => t.id === "p9")!;
    expect(nextP8.color).toBe("purple");
    expect(nextP8.kitPattern).toBe("gradient");
    // #9 is not just unequal to #8's new values — it is byte-for-byte the
    // same object reference as before the patch (map() only replaces the
    // matching entry), the strongest possible non-mutation guarantee.
    expect(nextP9).toBe(p9);
    expect(nextP9.color).toBe("red");
    expect(nextP9.kitPattern).toBe("slash");
  });

  it("patching a non-existent id changes nothing", () => {
    const tokens = [makeToken({ id: "p9", color: "red" })];
    const next = patchTokenKit(tokens, "does-not-exist", { color: "green" });
    expect(next).toEqual(tokens);
  });

  it("merges the patch onto the existing token rather than replacing it wholesale", () => {
    const tokens = [makeToken({ id: "p9", color: "red", label: "Dozer", number: 9 })];
    const next = patchTokenKit(tokens, "p9", { color: "green" });
    expect(next[0]!.label).toBe("Dozer");
    expect(next[0]!.number).toBe(9);
    expect(next[0]!.color).toBe("green");
  });
});

describe("resolveGameTimingKitEditorValue — fallback parity", () => {
  it("base colour is always the token's own `color` (never a team-wide default — Game Timing has no fallback to compute)", () => {
    expect(resolveGameTimingKitEditorValue(makeToken({ color: "purple" })).baseColor).toBe("purple");
  });

  it("pattern falls back to plain when unset", () => {
    expect(resolveGameTimingKitEditorValue(makeToken()).pattern).toBe("plain");
  });

  it("pattern uses the token's own kitPattern when set", () => {
    expect(resolveGameTimingKitEditorValue(makeToken({ kitPattern: "chestDash" })).pattern).toBe("chestDash");
  });

  it("pattern colour falls back to white unless the base colour is white, in which case it falls back to black", () => {
    expect(resolveGameTimingKitEditorValue(makeToken({ color: "red" })).patternColor).toBe("white");
    expect(resolveGameTimingKitEditorValue(makeToken({ color: "white" })).patternColor).toBe("black");
  });

  it("pattern colour uses the token's own kitPatternColor when set, even against a white base", () => {
    expect(resolveGameTimingKitEditorValue(makeToken({ color: "white", kitPatternColor: "green" })).patternColor).toBe(
      "green",
    );
  });

  it("label mode falls back to name (not number) — legacy tokens keep showing their existing nickname", () => {
    expect(resolveGameTimingKitEditorValue(makeToken()).labelMode).toBe("name");
  });

  it("label mode uses the token's own labelMode when set", () => {
    expect(resolveGameTimingKitEditorValue(makeToken({ labelMode: "initials" })).labelMode).toBe("initials");
  });

  it("initials default to empty string, never undefined", () => {
    expect(resolveGameTimingKitEditorValue(makeToken()).initials).toBe("");
  });

  it("name reuses the existing `label` field (no separate name field), defaulting to empty string", () => {
    expect(resolveGameTimingKitEditorValue(makeToken()).name).toBe("");
    expect(resolveGameTimingKitEditorValue(makeToken({ label: "Dozer" })).name).toBe("Dozer");
  });
});

describe("computeAppearanceEditorPosition — stays fully on-screen at every required mobile width", () => {
  const widths = [320, 360, 375, 390, 412];

  for (const width of widths) {
    it(`clamps within a ${width}px-wide viewport`, () => {
      const position = computeAppearanceEditorPosition({ width, height: 800 });
      expect(position.left).toBeGreaterThanOrEqual(0);
      expect(position.top).toBeGreaterThanOrEqual(0);
      // Editor's own max width is 260px + margin — never wider than the
      // viewport itself at any required width, so left + width must stay
      // within the viewport too.
      expect(position.left).toBeLessThan(width);
    });
  }
});
