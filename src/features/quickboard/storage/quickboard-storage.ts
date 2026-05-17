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

function createBoardId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `qb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readBoardsFromStorage(): SavedQuickBoard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUICKBOARD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => sanitizeSavedQuickBoard(entry))
      .filter((entry): entry is SavedQuickBoard => entry != null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_QUICKBOARD_SAVES);
  } catch {
    return [];
  }
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
  return readBoardsFromStorage();
}

export function loadBoard(boardId: string): SavedQuickBoard | null {
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return null;
  return readBoardsFromStorage().find((board) => board.id === normalizedId) ?? null;
}

export function hasReachedQuickBoardSaveLimit(): boolean {
  return readBoardsFromStorage().length >= MAX_QUICKBOARD_SAVES;
}

export function saveBoard(input: SaveBoardInput): SavedQuickBoard | null {
  const boardState = sanitizeQuickBoardState(input.boardState);
  if (!boardState) return null;
  const existingBoards = readBoardsFromStorage();
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
  const boards = readBoardsFromStorage();
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
  const existingBoards = readBoardsFromStorage();
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
  const boards = readBoardsFromStorage();
  const filtered = boards.filter((board) => board.id !== normalizedId);
  if (filtered.length === boards.length) return false;
  return writeBoardsToStorage(filtered);
}

export function setBoardThumbnail(boardId: string, thumbnail: string): SavedQuickBoard | null {
  if (typeof thumbnail !== "string" || !thumbnail.startsWith("data:image/")) return null;
  const normalizedId = boardId.trim();
  if (normalizedId.length <= 0) return null;
  const boards = readBoardsFromStorage();
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
