import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY,
  clearQuickBoardDraft,
  loadAllBoards,
  loadQuickBoardDraft,
  saveBoard,
  saveQuickBoardDraft,
} from "./quickboard-storage";
import { QUICKBOARD_STORAGE_KEY, type QuickBoardBoardState } from "./quickboard-types";

// vitest runs this file under Node, not jsdom — supply a minimal in-memory
// localStorage, mirroring pro-tagger-storage.test.ts's setup.
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

describe("quickboard-storage sport isolation", () => {
  it("uses the exact existing GAA key strings when no namespace is passed", () => {
    saveQuickBoardDraft(board("gaa"));
    expect(memoryStorage.getItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(memoryStorage.getItem(`${QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY}:rugby`)).toBeNull();

    saveBoard({ name: "GAA Board", boardState: board("gaa") });
    expect(memoryStorage.getItem(QUICKBOARD_STORAGE_KEY)).not.toBeNull();
    expect(memoryStorage.getItem(`${QUICKBOARD_STORAGE_KEY}:rugby`)).toBeNull();
  });

  it("writes a rugby draft under a separate namespaced key, never the GAA key", () => {
    saveQuickBoardDraft(board("rugby"), "rugby");
    expect(memoryStorage.getItem(`${QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY}:rugby`)).not.toBeNull();
    expect(memoryStorage.getItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("keeps GAA and rugby saved-board libraries in separate lists", () => {
    saveBoard({ name: "GAA Board", boardState: board("gaa") }, "");
    saveBoard({ name: "Rugby Board", boardState: board("rugby") }, "rugby");

    const gaaBoards = loadAllBoards("");
    const rugbyBoards = loadAllBoards("rugby");

    expect(gaaBoards).toHaveLength(1);
    expect(gaaBoards[0]?.name).toBe("GAA Board");
    expect(rugbyBoards).toHaveLength(1);
    expect(rugbyBoards[0]?.name).toBe("Rugby Board");
  });

  it("Save GAA -> open Rugby -> save Rugby -> return GAA leaves the original GAA draft intact", () => {
    // Coach saves a GAA draft.
    saveQuickBoardDraft(board("gaa-original"));
    const gaaDraftAfterFirstSave = loadQuickBoardDraft().draft;
    expect(gaaDraftAfterFirstSave?.boardState.players).toEqual([{ id: "gaa-original" }]);

    // Coach opens Rugby Slate — it must not see the GAA draft at all.
    const rugbyDraftOnOpen = loadQuickBoardDraft("rugby").draft;
    expect(rugbyDraftOnOpen).toBeNull();

    // Coach saves a Rugby draft.
    saveQuickBoardDraft(board("rugby-original"), "rugby");
    const rugbyDraftAfterSave = loadQuickBoardDraft("rugby").draft;
    expect(rugbyDraftAfterSave?.boardState.players).toEqual([{ id: "rugby-original" }]);

    // Coach returns to GAA — the original GAA draft must be exactly as they left it.
    const gaaDraftAfterReturn = loadQuickBoardDraft().draft;
    expect(gaaDraftAfterReturn?.boardState.players).toEqual([{ id: "gaa-original" }]);
  });

  it("clearing the Rugby draft never clears the GAA draft", () => {
    saveQuickBoardDraft(board("gaa"));
    saveQuickBoardDraft(board("rugby"), "rugby");

    clearQuickBoardDraft("rugby");

    expect(loadQuickBoardDraft("rugby").draft).toBeNull();
    expect(loadQuickBoardDraft().draft?.boardState.players).toEqual([{ id: "gaa" }]);
  });
});
