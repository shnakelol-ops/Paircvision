import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY,
  duplicateBoard,
  loadAllBoards,
  loadBoard,
  loadQuickBoardDraft,
  renameBoard,
  saveBoard,
  saveQuickBoardDraft,
} from "./quickboard-storage";
import {
  QUICKBOARD_STORAGE_KEY,
  sanitizeQuickBoardState,
  sanitizeSavedQuickBoard,
  withQuickBoardSurface,
  withTokenSettingsDefault,
  type QuickBoardBoardState,
} from "./quickboard-types";
import { resolveBoardStorageNamespace } from "../../../pages/tacticalSlateSurface";

// vitest runs this file under Node, not jsdom — same minimal in-memory
// localStorage as quickboard-storage.test.ts.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let memoryStorage: Storage;

beforeEach(() => {
  memoryStorage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = {
    localStorage: memoryStorage,
  } as unknown as Window;
});

function board(label: string): QuickBoardBoardState {
  return {
    players: [{ id: label }],
    items: [],
    drawings: [],
    phases: [],
    movementPaths: [],
  };
}

const PITCH_NS = resolveBoardStorageNamespace("gaelic", "pitch");
const TRAINING_NS = resolveBoardStorageNamespace("gaelic", "training");
const TACTICAL_BOARD_NS = resolveBoardStorageNamespace("gaelic", "tacticalBoard");
const WHITEBOARD_NS = resolveBoardStorageNamespace("gaelic", "whiteboard");

describe("board surface metadata", () => {
  it("never stamps Pitch boards — the exact same object is returned", () => {
    const state = board("pitch");
    expect(withQuickBoardSurface(state, "pitch")).toBe(state);
    expect("surface" in withQuickBoardSurface(state, "pitch")).toBe(false);
  });

  it("stamps Training and Whiteboard boards without mutating the input", () => {
    const state = board("t");
    expect(withQuickBoardSurface(state, "training").surface).toBe("training");
    expect(withQuickBoardSurface(state, "whiteboard").surface).toBe("whiteboard");
    expect("surface" in state).toBe(false);
  });

  it("stamps Tactical Board boards and the strict sanitiser keeps the stamp", () => {
    const state = board("tb");
    expect(withQuickBoardSurface(state, "tacticalBoard").surface).toBe("tacticalBoard");
    expect("surface" in state).toBe(false);
    expect(sanitizeQuickBoardState({ ...board("tb"), surface: "tacticalBoard" })?.surface).toBe("tacticalBoard");
  });

  it("a board with no surface metadata reads as a Gaelic Pitch board", () => {
    const sanitized = sanitizeQuickBoardState(board("legacy"));
    expect(sanitized).not.toBeNull();
    expect("surface" in sanitized!).toBe(false);
    expect(sanitizeQuickBoardState({ ...board("odd"), surface: "pitch" })?.surface).toBeUndefined();
  });

  it("Tactical Board boards and drafts live under :tacticalBoard, never the Gaelic Pitch keys, and reopen there", () => {
    saveBoard({ name: "Gaelic", boardState: board("p") }, PITCH_NS);
    const saved = saveBoard({ name: "Press", boardState: withQuickBoardSurface(board("tb"), "tacticalBoard") }, TACTICAL_BOARD_NS)!;
    saveQuickBoardDraft(withQuickBoardSurface(board("tb-draft"), "tacticalBoard"), TACTICAL_BOARD_NS);

    expect(JSON.parse(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:tacticalBoard`)!)).toHaveLength(1);
    expect(memoryStorage.getItem(`${QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY}:tacticalBoard`)).not.toBeNull();
    expect(loadAllBoards(PITCH_NS).map((b) => b.name)).toEqual(["Gaelic"]);
    expect("surface" in loadAllBoards(PITCH_NS)[0]!.boardState).toBe(false);
    expect(loadAllBoards(TACTICAL_BOARD_NS).map((b) => b.name)).toEqual(["Press"]);
    expect(loadBoard(saved.id, TACTICAL_BOARD_NS)?.boardState.surface).toBe("tacticalBoard");
    expect(loadQuickBoardDraft(PITCH_NS).draft).toBeNull();
    expect(loadQuickBoardDraft(TACTICAL_BOARD_NS).draft?.boardState.surface).toBe("tacticalBoard");
  });

  it("the strict sanitiser preserves training/whiteboard metadata", () => {
    expect(sanitizeQuickBoardState({ ...board("t"), surface: "training" })?.surface).toBe("training");
    expect(sanitizeQuickBoardState({ ...board("w"), surface: "whiteboard" })?.surface).toBe("whiteboard");
  });

  it("the sanitiser drops missing, \"pitch\" and unrecognised surface values (all resolve to Pitch)", () => {
    for (const surface of [undefined, "pitch", "grass", 42, null]) {
      const sanitized = sanitizeQuickBoardState({ ...board("x"), surface });
      expect(sanitized).not.toBeNull();
      expect("surface" in sanitized!).toBe(false);
    }
  });

  it("a legacy GAA board with no surface metadata round-trips byte-for-byte unchanged", () => {
    const legacy = {
      id: "legacy-1",
      name: "Kickout press",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
      version: 1,
      boardState: { ...board("legacy"), textAnnotations: [] },
    };
    const sanitized = sanitizeSavedQuickBoard(JSON.parse(JSON.stringify(legacy)));
    expect(JSON.stringify(sanitized)).toBe(JSON.stringify(legacy));
  });
});

describe("surface storage isolation", () => {
  it("Pitch keeps writing the exact existing GAA keys, with no surface field", () => {
    saveQuickBoardDraft(withQuickBoardSurface(board("p"), "pitch"), PITCH_NS);
    saveBoard({ name: "Pitch", boardState: withQuickBoardSurface(board("p"), "pitch") }, PITCH_NS);

    expect(memoryStorage.getItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY)).not.toBeNull();
    const stored = JSON.parse(memoryStorage.getItem(QUICKBOARD_STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect("surface" in stored[0].boardState).toBe(false);
    expect(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:training`)).toBeNull();
    expect(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:whiteboard`)).toBeNull();
  });

  it("Training and Whiteboard boards and drafts live under their own keys, never the GAA keys", () => {
    saveBoard({ name: "Rondo", boardState: withQuickBoardSurface(board("t"), "training") }, TRAINING_NS);
    saveQuickBoardDraft(withQuickBoardSurface(board("t"), "training"), TRAINING_NS);
    saveBoard({ name: "Sketch", boardState: withQuickBoardSurface(board("w"), "whiteboard") }, WHITEBOARD_NS);
    saveQuickBoardDraft(withQuickBoardSurface(board("w"), "whiteboard"), WHITEBOARD_NS);

    expect(memoryStorage.getItem(QUICKBOARD_STORAGE_KEY)).toBeNull();
    expect(memoryStorage.getItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:training`)!)).toHaveLength(1);
    expect(JSON.parse(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:whiteboard`)!)).toHaveLength(1);
    expect(memoryStorage.getItem(`${QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY}:training`)).not.toBeNull();
    expect(memoryStorage.getItem(`${QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY}:whiteboard`)).not.toBeNull();
  });

  it("each surface's My Boards list only shows its own boards", () => {
    saveBoard({ name: "Pitch", boardState: board("p") }, PITCH_NS);
    saveBoard({ name: "Rondo", boardState: withQuickBoardSurface(board("t"), "training") }, TRAINING_NS);
    saveBoard({ name: "Sketch", boardState: withQuickBoardSurface(board("w"), "whiteboard") }, WHITEBOARD_NS);

    expect(loadAllBoards(PITCH_NS).map((b) => b.name)).toEqual(["Pitch"]);
    expect(loadAllBoards(TRAINING_NS).map((b) => b.name)).toEqual(["Rondo"]);
    expect(loadAllBoards(WHITEBOARD_NS).map((b) => b.name)).toEqual(["Sketch"]);
  });

  it("Training save -> close -> reopen keeps its surface metadata, including through rename and duplicate", () => {
    const saved = saveBoard({ name: "Rondo", boardState: withQuickBoardSurface(board("t"), "training") }, TRAINING_NS)!;
    expect(loadBoard(saved.id, TRAINING_NS)?.boardState.surface).toBe("training");

    renameBoard(saved.id, "Rondo 4v2", TRAINING_NS);
    expect(loadBoard(saved.id, TRAINING_NS)?.boardState.surface).toBe("training");

    const copy = duplicateBoard(saved.id, TRAINING_NS)!;
    expect(loadBoard(copy.id, TRAINING_NS)?.boardState.surface).toBe("training");
  });

  it("Whiteboard save -> reopen keeps its surface metadata", () => {
    const saved = saveBoard({ name: "Sketch", boardState: withQuickBoardSurface(board("w"), "whiteboard") }, WHITEBOARD_NS)!;
    expect(loadBoard(saved.id, WHITEBOARD_NS)?.boardState.surface).toBe("whiteboard");
  });

  it("draft recovery is per surface: Pitch -> Training -> Pitch leaves both drafts intact", () => {
    saveQuickBoardDraft(board("pitch-draft"), PITCH_NS);
    saveQuickBoardDraft(withQuickBoardSurface(board("training-draft"), "training"), TRAINING_NS);

    expect(loadQuickBoardDraft(PITCH_NS).draft?.boardState.players).toEqual([{ id: "pitch-draft" }]);
    expect(loadQuickBoardDraft(TRAINING_NS).draft?.boardState.players).toEqual([{ id: "training-draft" }]);
    expect(loadQuickBoardDraft(TRAINING_NS).draft?.boardState.surface).toBe("training");
    expect(loadQuickBoardDraft(WHITEBOARD_NS).draft).toBeNull();
  });
});

describe("Training player presentation persistence", () => {
  it("the strict sanitiser preserves each presentation", () => {
    // "practice" is legacy-only (never written now) but is still read as stored.
    for (const playerPresentation of ["normal", "compact", "mini", "practice"] as const) {
      expect(sanitizeQuickBoardState({ ...board("t"), playerPresentation })?.playerPresentation).toBe(playerPresentation);
    }
  });

  it("drops missing or invalid presentation values", () => {
    for (const playerPresentation of [undefined, "Practice", "small", 3, null]) {
      const sanitized = sanitizeQuickBoardState({ ...board("t"), playerPresentation })!;
      expect("playerPresentation" in sanitized).toBe(false);
    }
  });

  it("a Training board saved as Compact reopens as Compact, through rename and duplicate too", () => {
    const state = withQuickBoardSurface({ ...board("t"), playerPresentation: "compact" }, "training");
    const saved = saveBoard({ name: "Rondo", boardState: state }, TRAINING_NS)!;
    expect(loadBoard(saved.id, TRAINING_NS)?.boardState.playerPresentation).toBe("compact");
    renameBoard(saved.id, "Rondo 2", TRAINING_NS);
    expect(loadBoard(saved.id, TRAINING_NS)?.boardState.playerPresentation).toBe("compact");
    const copy = duplicateBoard(saved.id, TRAINING_NS)!;
    expect(loadBoard(copy.id, TRAINING_NS)?.boardState.playerPresentation).toBe("compact");
  });

  it("a recovered Training draft keeps its presentation", () => {
    saveQuickBoardDraft(withQuickBoardSurface({ ...board("t"), playerPresentation: "normal" }, "training"), TRAINING_NS);
    expect(loadQuickBoardDraft(TRAINING_NS).draft?.boardState.playerPresentation).toBe("normal");
  });

  it("keeps a valid stored token style and drops unknown ones", () => {
    for (const playerTokenStyle of ["vision-v3", "pixi", "phosphor", "pill-under", "bib"] as const) {
      expect(sanitizeQuickBoardState({ ...board("t"), playerTokenStyle })?.playerTokenStyle).toBe(playerTokenStyle);
    }
    for (const playerTokenStyle of [undefined, "Bib", "torso", "unknown", 3, null]) {
      expect("playerTokenStyle" in sanitizeQuickBoardState({ ...board("t"), playerTokenStyle })!).toBe(false);
    }
  });

  it("a Training board's style and size survive save, rename, duplicate and draft", () => {
    const state = withQuickBoardSurface({ ...board("t"), playerPresentation: "mini", playerTokenStyle: "pixi" }, "training");
    const saved = saveBoard({ name: "Rondo", boardState: state }, TRAINING_NS)!;
    renameBoard(saved.id, "Rondo 2", TRAINING_NS);
    const copy = duplicateBoard(saved.id, TRAINING_NS)!;
    for (const id of [saved.id, copy.id]) {
      const stored = loadBoard(id, TRAINING_NS)!.boardState;
      expect([stored.playerPresentation, stored.playerTokenStyle]).toEqual(["mini", "pixi"]);
    }
    saveQuickBoardDraft(state, TRAINING_NS);
    const draft = loadQuickBoardDraft(TRAINING_NS).draft!.boardState;
    expect([draft.playerPresentation, draft.playerTokenStyle]).toEqual(["mini", "pixi"]);
  });

  it("legacy Practice boards and boards with no presentation are compared as Bib Token at Compact", () => {
    for (const legacy of [
      withQuickBoardSurface(board("t"), "training"),
      withQuickBoardSurface({ ...board("t"), playerPresentation: "practice" }, "training"),
    ]) {
      const compared = withTokenSettingsDefault(legacy, "training");
      expect([compared.playerPresentation, compared.playerTokenStyle]).toEqual(["compact", "bib"]);
    }
  });

  it("legacy Normal / Compact boards without a style are compared as Vision V3, never as another board's style", () => {
    const legacyCompact = withQuickBoardSurface({ ...board("t"), playerPresentation: "compact" }, "training");
    const compared = withTokenSettingsDefault(legacyCompact, "training");
    expect([compared.playerPresentation, compared.playerTokenStyle]).toEqual(["compact", "vision-v3"]);
    const current = withQuickBoardSurface({ ...board("t"), playerPresentation: "normal", playerTokenStyle: "phosphor" }, "training");
    expect(withTokenSettingsDefault(current, "training")).toEqual(current);
  });

  it("comparing never rewrites the stored legacy board", () => {
    const legacy = withQuickBoardSurface({ ...board("t"), playerPresentation: "practice" }, "training");
    const saved = saveBoard({ name: "Old drill", boardState: legacy }, TRAINING_NS)!;
    const loaded = loadBoard(saved.id, TRAINING_NS)!;
    withTokenSettingsDefault(loaded.boardState, "training");
    const reloaded = loadBoard(saved.id, TRAINING_NS)!.boardState;
    expect(reloaded.playerPresentation).toBe("practice");
    expect("playerTokenStyle" in reloaded).toBe(false);
  });

  it("older Pitch / Tactical Board / Whiteboard boards are compared at today's default, Vision V3 at Normal", () => {
    const pitch = board("p");
    const comparedPitch = withTokenSettingsDefault(pitch, "pitch");
    expect([comparedPitch.playerPresentation, comparedPitch.playerTokenStyle]).toEqual(["normal", "vision-v3"]);
    for (const surface of ["tacticalBoard", "whiteboard"] as const) {
      const compared = withTokenSettingsDefault(withQuickBoardSurface(board("x"), surface), surface);
      expect([compared.playerPresentation, compared.playerTokenStyle]).toEqual(["normal", "vision-v3"]);
    }
    // comparison only: the input object is untouched
    expect("playerPresentation" in pitch).toBe(false);
  });

  it("a Pitch board's style and size survive save, rename, duplicate and draft, in the Pitch namespace only", () => {
    const state = { ...board("p"), playerPresentation: "compact" as const, playerTokenStyle: "phosphor" as const };
    const saved = saveBoard({ name: "Kickout", boardState: state }, PITCH_NS)!;
    renameBoard(saved.id, "Kickout 2", PITCH_NS);
    const copy = duplicateBoard(saved.id, PITCH_NS)!;
    for (const id of [saved.id, copy.id]) {
      const stored = loadBoard(id, PITCH_NS)!.boardState;
      expect([stored.playerPresentation, stored.playerTokenStyle]).toEqual(["compact", "phosphor"]);
    }
    saveQuickBoardDraft(state, PITCH_NS);
    const draft = loadQuickBoardDraft(PITCH_NS).draft!.boardState;
    expect([draft.playerPresentation, draft.playerTokenStyle]).toEqual(["compact", "phosphor"]);
    expect(loadQuickBoardDraft(TRAINING_NS).draft).toBeNull();
  });
});
