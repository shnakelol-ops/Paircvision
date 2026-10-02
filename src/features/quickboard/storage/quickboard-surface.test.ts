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
