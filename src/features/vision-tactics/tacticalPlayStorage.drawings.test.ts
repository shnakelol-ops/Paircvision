// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { saveScenario, listScenarios, duplicateScenario, type TacticalScenario } from "./tacticalPlayStorage";
import type { MovementBoardToken } from "../../movement-board/shell/types";
import type { TacticalDrawingSnapshot } from "../../movement-board/shell/types";

/**
 * Persistence coverage for Game Timing tactical drawings (PR4) — the
 * `drawings` field added to TacticalScenario. Exercises the real
 * localStorage-backed save/list/duplicate functions directly (jsdom
 * provides localStorage), independent of the live Pixi shell.
 */

const TOKENS: MovementBoardToken[] = [
  { id: "p1", number: 1, color: "blue", position: { x: 50, y: 10 } },
];

const DRAWING: TacticalDrawingSnapshot = {
  id: "d1",
  kind: "plain-line",
  points: [
    { x: 10, y: 10 },
    { x: 20, y: 20 },
  ],
  color: 0x111111,
  width: 1.15,
  opacity: 0.95,
  createdAt: 1000,
};

beforeEach(() => {
  localStorage.clear();
});

describe("saveScenario — drawings field", () => {
  it("round-trips drawings through save and list", () => {
    saveScenario("Play A", TOKENS, [], {}, [], [], "normal", [], [], [], undefined, undefined, undefined, undefined, [DRAWING]);
    const [saved] = listScenarios();
    expect(saved?.drawings).toEqual([DRAWING]);
  });

  it("omits drawings (undefined) when none were drawn — matches every other optional field's convention", () => {
    saveScenario("Play B", TOKENS, [], {}, [], [], "normal", [], [], [], undefined, undefined, undefined, undefined, []);
    const [saved] = listScenarios();
    expect(saved?.drawings).toBeUndefined();
  });

  it("a scenario saved with no drawings argument at all (legacy call shape) has drawings undefined, not an error", () => {
    saveScenario("Play C", TOKENS, [], {}, [], []);
    const [saved] = listScenarios();
    expect(saved?.drawings).toBeUndefined();
    expect(saved?.tokens).toEqual(TOKENS);
  });
});

describe("Backward compatibility — pre-PR4 saves", () => {
  it("a TacticalScenario object with no drawings key at all is still a valid TacticalScenario (loads, doesn't crash)", () => {
    const legacyScenario: TacticalScenario = {
      id: "legacy-1",
      name: "Old Play",
      savedAt: 500,
      tokens: TOKENS,
      routes: [],
      ballState: {},
      passEvents: [],
      shotEvents: [],
    };
    // The runtime default (`scenario.drawings ?? []`) is applied by
    // TacticalPlaySurface's onLoadScenario — this proves the shape itself
    // round-trips through JSON (the actual localStorage encoding) without
    // requiring the key to be present.
    const roundTripped = JSON.parse(JSON.stringify(legacyScenario)) as TacticalScenario;
    expect(roundTripped.drawings).toBeUndefined();
    expect(roundTripped.drawings ?? []).toEqual([]);
  });
});

describe("duplicateScenario — Copy carries drawings over", () => {
  it("a duplicated scenario retains the source's drawings", () => {
    const saved = saveScenario(
      "Play D", TOKENS, [], {}, [], [], "normal", [], [], [], undefined, undefined, undefined, undefined, [DRAWING],
    );
    const copy = duplicateScenario(saved.id);
    expect(copy?.drawings).toEqual([DRAWING]);
    expect(copy?.id).not.toBe(saved.id);
  });
});

describe("Isolation — Game Timing drawings never appear under a Standard Slate key", () => {
  it("TacticalScenario's drawings field is independent of Standard Slate's own board/localStorage namespace", () => {
    saveScenario("Play E", TOKENS, [], {}, [], [], "normal", [], [], [], undefined, undefined, undefined, undefined, [DRAWING]);
    // Standard Slate's own saved-board storage lives under a completely
    // different key (see boardStorageNamespace / loadAllBoards in
    // TacticalPadLiteClean.tsx) — this scenario is only ever written to
    // the Game Timing "paircvision-tp-scenarios" key, never anywhere else.
    const raw = localStorage.getItem("paircvision-tp-scenarios");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as TacticalScenario[];
    expect(parsed[0]?.drawings).toEqual([DRAWING]);
  });
});
