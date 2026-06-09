import { type SlateTextAnnotation, sanitizeTextAnnotations } from "../annotations/slateTextAnnotation";

export const QUICKBOARD_STORAGE_KEY = "pitchflow_quickboard_boards_v1";
const MAX_BOARD_NAME_LENGTH = 48;
export const MAX_QUICKBOARD_SAVES = 100;

export type QuickBoardBoardState = {
  players: unknown[];
  items: unknown[];
  drawings: unknown[];
  phases: unknown[];
  movementPaths: unknown[];
  routes?: unknown;
  kits?: unknown;
  teamKits?: unknown;
  teamState?: unknown;
  viewport?: unknown;
  startSnapshot?: unknown;
  drawTool?: unknown;
  drawColor?: unknown;
  itemMode?: unknown;
  textAnnotations?: SlateTextAnnotation[];
};

export type SavedQuickBoard = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  boardState: QuickBoardBoardState;
  thumbnail?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function sanitizeBoardName(value: string | undefined): string {
  if (typeof value !== "string") return "Untitled Board";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 0) return "Untitled Board";
  return trimmed.slice(0, MAX_BOARD_NAME_LENGTH);
}

export function sanitizeQuickBoardState(value: unknown): QuickBoardBoardState | null {
  if (!isRecord(value)) return null;
  return {
    players: sanitizeArray(value.players),
    items: sanitizeArray(value.items),
    drawings: sanitizeArray(value.drawings),
    phases: sanitizeArray(value.phases),
    movementPaths: sanitizeArray(value.movementPaths),
    ...(value.routes !== undefined ? { routes: value.routes } : {}),
    ...(value.kits !== undefined ? { kits: value.kits } : {}),
    ...(value.teamKits !== undefined ? { teamKits: value.teamKits } : {}),
    ...(value.teamState !== undefined ? { teamState: value.teamState } : {}),
    ...(value.viewport !== undefined ? { viewport: value.viewport } : {}),
    ...(value.startSnapshot !== undefined ? { startSnapshot: value.startSnapshot } : {}),
    ...(value.drawTool !== undefined ? { drawTool: value.drawTool } : {}),
    ...(value.drawColor !== undefined ? { drawColor: value.drawColor } : {}),
    ...(value.itemMode !== undefined ? { itemMode: value.itemMode } : {}),
    textAnnotations: sanitizeTextAnnotations(value.textAnnotations),
  };
}

export function sanitizeSavedQuickBoard(value: unknown): SavedQuickBoard | null {
  if (!isRecord(value)) return null;
  const rawId = value.id;
  const rawCreatedAt = value.createdAt;
  const rawUpdatedAt = value.updatedAt;
  const rawVersion = value.version;
  const boardState = sanitizeQuickBoardState(value.boardState);
  if (typeof rawId !== "string" || rawId.trim().length <= 0 || boardState == null) return null;

  const createdAt =
    typeof rawCreatedAt === "number" && Number.isFinite(rawCreatedAt)
      ? Math.max(0, Math.floor(rawCreatedAt))
      : Date.now();
  const updatedAt =
    typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt)
      ? Math.max(createdAt, Math.floor(rawUpdatedAt))
      : createdAt;
  const version =
    typeof rawVersion === "number" && Number.isFinite(rawVersion)
      ? Math.max(1, Math.floor(rawVersion))
      : 1;
  const thumbnail =
    typeof value.thumbnail === "string" && value.thumbnail.startsWith("data:image/")
      ? value.thumbnail
      : undefined;

  return {
    id: rawId,
    name: sanitizeBoardName(typeof value.name === "string" ? value.name : undefined),
    createdAt,
    updatedAt,
    version,
    boardState,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

export function cloneQuickBoardState(state: QuickBoardBoardState): QuickBoardBoardState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as QuickBoardBoardState;
}
