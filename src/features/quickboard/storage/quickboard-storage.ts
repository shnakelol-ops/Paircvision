import {
  QUICKBOARD_STORAGE_KEY,
  MAX_QUICKBOARD_SAVES,
  cloneQuickBoardState,
  sanitizeBoardName,
  sanitizeQuickBoardState,
  sanitizeSavedQuickBoard,
  type QuickBoardBoardState,
  type SavedQuickBoard,
} from "./quickboard-types";

type SaveBoardInput = {
  name?: string;
  boardState: QuickBoardBoardState;
};

export const QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY = "paircvision_board_active_draft_v1";

export type QuickBoardActiveDraft = {
  version: 1;
  updatedAt: number;
  boardState: QuickBoardBoardState;
};

function createBoardId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `qb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type ReadBoardsResult = {
  boards: SavedQuickBoard[];
  isCorrupt: boolean;
};

function readBoardsFromStorage(): ReadBoardsResult {
  if (typeof window === "undefined") return { boards: [], isCorrupt: false };
  try {
    const raw = window.localStorage.getItem(QUICKBOARD_STORAGE_KEY);
    if (!raw) return { boards: [], isCorrupt: false };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { boards: [], isCorrupt: true };
    return {
      boards: parsed
        .map((entry) => sanitizeSavedQuickBoard(entry))
        .filter((entry): entry is SavedQuickBoard => entry != null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_QUICKBOARD_SAVES),
      isCorrupt: false,
    };
  } catch {
    return { boards: [], isCorrupt: true };
  }
}

function readWritableBoardsFromStorage(): SavedQuickBoard[] | null {
  const result = readBoardsFromStorage();
  if (!result.isCorrupt) return result.boards;
  console.warn("[quickboard-storage] Saved boards storage is corrupt; refusing to overwrite.", {
    key: QUICKBOARD_STORAGE_KEY,
  });
  return null;
}

function writeBoardsToStorage(boards: SavedQuickBoard[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      QUICKBOARD_STORAGE_KEY,
      JSON.stringify(
        boards
          .slice(0, MAX_QUICKBOARD_SAVES)
          .map((board) => ({
            ...board,
            boardState: cloneQuickBoardState(board.boardState),
          })),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadAllBoards(): SavedQuickBoard[] {
  return readBoardsFromStorage().boards;
}

export function loadBoard(boardId: string): SavedQuickBoard | null {
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return null;
  return readBoardsFromStorage().boards.find((board) => board.id === normalizedId) ?? null;
}

export function hasReachedQuickBoardSaveLimit(): boolean {
  return readBoardsFromStorage().boards.length >= MAX_QUICKBOARD_SAVES;
}

export function saveBoard(input: SaveBoardInput): SavedQuickBoard | null {
  const boardState = sanitizeQuickBoardState(input.boardState);
  if (!boardState) return null;
  const existingBoards = readWritableBoardsFromStorage();
  if (!existingBoards) return null;
  if (existingBoards.length >= MAX_QUICKBOARD_SAVES) return null;
  const now = Date.now();
  const nextBoard: SavedQuickBoard = {
    id: createBoardId(),
    name: sanitizeBoardName(input.name),
    createdAt: now,
    updatedAt: now,
    version: 1,
    boardState: cloneQuickBoardState(boardState),
  };
  const boards = [nextBoard, ...existingBoards].slice(0, MAX_QUICKBOARD_SAVES);
  if (!writeBoardsToStorage(boards)) return null;
  return nextBoard;
}

export function renameBoard(boardId: string, nextName: string): SavedQuickBoard | null {
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return null;
  const boards = readWritableBoardsFromStorage();
  if (!boards) return null;
  const boardIndex = boards.findIndex((board) => board.id === normalizedId);
  if (boardIndex < 0) return null;
  const current = boards[boardIndex];
  if (!current) return null;
  const renamed: SavedQuickBoard = {
    ...current,
    name: sanitizeBoardName(nextName),
    updatedAt: Date.now(),
  };
  boards.splice(boardIndex, 1, renamed);
  boards.sort((a, b) => b.updatedAt - a.updatedAt);
  if (!writeBoardsToStorage(boards)) return null;
  return renamed;
}

export function duplicateBoard(boardId: string): SavedQuickBoard | null {
  const source = loadBoard(boardId);
  if (!source) return null;
  const existingBoards = readWritableBoardsFromStorage();
  if (!existingBoards) return null;
  if (existingBoards.length >= MAX_QUICKBOARD_SAVES) return null;
  const now = Date.now();
  const duplicate: SavedQuickBoard = {
    ...source,
    id: createBoardId(),
    name: sanitizeBoardName(`${source.name} Copy`),
    createdAt: now,
    updatedAt: now,
    boardState: cloneQuickBoardState(source.boardState),
  };
  const boards = [duplicate, ...existingBoards].slice(0, MAX_QUICKBOARD_SAVES);
  if (!writeBoardsToStorage(boards)) return null;
  return duplicate;
}

export function deleteBoard(boardId: string): boolean {
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return false;
  const boards = readWritableBoardsFromStorage();
  if (!boards) return false;
  const filtered = boards.filter((board) => board.id !== normalizedId);
  if (filtered.length === boards.length) return false;
  return writeBoardsToStorage(filtered);
}

export function setBoardThumbnail(boardId: string, thumbnail: string): SavedQuickBoard | null {
  if (typeof thumbnail !== "string" || !thumbnail.startsWith("data:image/")) return null;
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return null;
  const boards = readWritableBoardsFromStorage();
  if (!boards) return null;
  const boardIndex = boards.findIndex((board) => board.id === normalizedId);
  if (boardIndex < 0) return null;
  const current = boards[boardIndex];
  if (!current) return null;
  const updated: SavedQuickBoard = {
    ...current,
    thumbnail,
  };
  boards.splice(boardIndex, 1, updated);
  boards.sort((a, b) => b.updatedAt - a.updatedAt);
  if (!writeBoardsToStorage(boards)) return null;
  return updated;
}

export function formatBoardUpdatedAt(updatedAt: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "Unknown";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function loadQuickBoardDraft(): { draft: QuickBoardActiveDraft | null; isCorrupt: boolean } {
  if (typeof window === "undefined") return { draft: null, isCorrupt: false };
  try {
    const raw = window.localStorage.getItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY);
    if (!raw) return { draft: null, isCorrupt: false };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { draft: null, isCorrupt: true };
    const source = parsed as Record<string, unknown>;
    const boardState = sanitizeQuickBoardState(source.boardState);
    if (!boardState) return { draft: null, isCorrupt: true };
    const updatedAt =
      typeof source.updatedAt === "number" && Number.isFinite(source.updatedAt)
        ? Math.max(0, Math.floor(source.updatedAt))
        : Date.now();
    return {
      draft: {
        version: 1,
        updatedAt,
        boardState,
      },
      isCorrupt: false,
    };
  } catch {
    return { draft: null, isCorrupt: true };
  }
}

export function saveQuickBoardDraft(boardState: QuickBoardBoardState): boolean {
  if (typeof window === "undefined") return false;
  const sanitized = sanitizeQuickBoardState(boardState);
  if (!sanitized) return false;
  try {
    const payload: QuickBoardActiveDraft = {
      version: 1,
      updatedAt: Date.now(),
      boardState: cloneQuickBoardState(sanitized),
    };
    window.localStorage.setItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearQuickBoardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUICKBOARD_ACTIVE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
