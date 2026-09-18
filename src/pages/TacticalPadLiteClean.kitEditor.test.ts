import { describe, expect, it } from "vitest";

import { resolveActiveKitEditorValue } from "./TacticalPadLiteClean";
import type { TacticalPlayerKitSnapshot } from "../engine/pixi/createTacticalPadLiteSurface";

/**
 * Parity/regression lock for Standard Slate's Kit Editor. This is the one
 * piece of Slate-specific state manipulation PR2A's extraction touched
 * (moving it out of inline JSX into its own function) — every fallback
 * expression here must remain byte-for-byte what the original inline JSX
 * computed. A live createTacticalPadLiteSurface() instance cannot be
 * constructed in this test environment (no jsdom/canvas — see the same
 * documented limitation in drawRoutePlayerStart.test.ts), so this is the
 * practical boundary: it proves the parent-side resolution logic that feeds
 * PlayerKitEditor's `value` prop is unchanged, independent of PlayerKitEditor
 * itself (already covered by PlayerKitEditor.test.tsx).
 */
function makePlayer(overrides: Partial<TacticalPlayerKitSnapshot> = {}): TacticalPlayerKitSnapshot {
  return {
    id: "p1",
    number: 8,
    team: "BLUE",
    ...overrides,
  };
}

describe("resolveActiveKitEditorValue — Standard Slate fallback parity", () => {
  it("base colour falls back to blue for BLUE team, red for RED team, when unset", () => {
    expect(resolveActiveKitEditorValue(makePlayer({ team: "BLUE" })).baseColor).toBe("blue");
    expect(resolveActiveKitEditorValue(makePlayer({ team: "RED" })).baseColor).toBe("red");
  });

  it("base colour uses the player's own kitBaseColor when set, regardless of team", () => {
    expect(resolveActiveKitEditorValue(makePlayer({ team: "RED", kitBaseColor: "lime" })).baseColor).toBe("lime");
  });

  it("pattern falls back to plain when unset", () => {
    expect(resolveActiveKitEditorValue(makePlayer()).pattern).toBe("plain");
  });

  it("pattern uses the player's own kitPattern when set", () => {
    expect(resolveActiveKitEditorValue(makePlayer({ kitPattern: "slash" })).pattern).toBe("slash");
  });

  it("pattern colour falls back to white unless the resolved base colour is white, in which case it falls back to black", () => {
    expect(resolveActiveKitEditorValue(makePlayer({ team: "BLUE" })).patternColor).toBe("white");
    expect(resolveActiveKitEditorValue(makePlayer({ kitBaseColor: "white" })).patternColor).toBe("black");
  });

  it("pattern colour uses the player's own kitPatternColor when set, even against a white base", () => {
    expect(
      resolveActiveKitEditorValue(makePlayer({ kitBaseColor: "white", kitPatternColor: "navy" })).patternColor,
    ).toBe("navy");
  });

  it("label mode falls back to number when unset", () => {
    expect(resolveActiveKitEditorValue(makePlayer()).labelMode).toBe("number");
  });

  it("label mode uses the player's own labelMode when set", () => {
    expect(resolveActiveKitEditorValue(makePlayer({ labelMode: "name" })).labelMode).toBe("name");
  });

  it("initials/name are sanitized and default to empty string, never undefined", () => {
    const resolved = resolveActiveKitEditorValue(makePlayer());
    expect(resolved.initials).toBe("");
    expect(resolved.name).toBe("");
  });

  it("initials/name pass through the same sanitizers Slate has always used", () => {
    const resolved = resolveActiveKitEditorValue(makePlayer({ initials: "  ab  ", name: "  Dozer  " }));
    expect(resolved.initials).toBe("AB");
    expect(resolved.name).toBe("Dozer");
  });
});
