import type { BallState, MovementBoardRoute, MovementBoardToken, MovementPlaybackSpeed, TacticalDrawingSnapshot, TacticalPassEvent, TacticalShotEvent, TacticalTrainingItem, ZoneRecord } from "../../movement-board/shell/types";
import type { TacticalUnit } from "./tacticalUnitTypes";
import type { SlateTextAnnotation } from "../../components/annotations/textAnnotation";
import type { TeamKit } from "./teamKit";

const STORAGE_KEY = "paircvision-tp-scenarios";
// Tactical Sequence in-progress autosave draft. Crash-recovery state for the
// current session on this device only — deliberately NOT a backup domain
// (see docs/BACKUP_MANIFEST.md "Must not back up"), exactly like the
// QuickBoard and Match Stats drafts.
export const TP_ACTIVE_DRAFT_STORAGE_KEY = "paircvision-tp-active-draft-v1";
export const MAX_SCENARIOS = 20;

export type TacticalScenario = {
  id: string;
  name: string;
  savedAt: number;
  tokens: MovementBoardToken[];
  routes: MovementBoardRoute[];
  ballState: BallState;
  passEvents: TacticalPassEvent[];
  shotEvents: TacticalShotEvent[];
  playbackSpeed?: MovementPlaybackSpeed;
  // Exact playback-speed multiplier (e.g. 0.75). `playbackSpeed` above is
  // still written alongside it so builds that predate this field reopen the
  // play at the nearest preset, exactly as before. Undefined on any scenario
  // saved before this existed — load then falls back to `playbackSpeed`.
  playbackSpeedMultiplier?: number;
  units?: TacticalUnit[];
  zones?: ZoneRecord[];
  items?: TacticalTrainingItem[];
  textAnnotations?: SlateTextAnnotation[];
  // Game Timing tactical drawings (PR4) — the same shared drawing engine
  // Standard Slate uses. Undefined on any scenario saved before this
  // existed; onLoadScenario applies `?? []`, exactly like every other
  // optional field here. Never read by Standard Slate's own storage.
  drawings?: TacticalDrawingSnapshot[];
  // Team-kit model (KIT belongs to TEAM, not player — see teamKit.ts).
  // Undefined on any scenario saved before this existed; onLoadScenario in
  // TacticalPlaySurface.tsx applies the same sensible defaults teamKit.ts
  // itself exports, exactly like every other optional field above — no
  // migration function, just `?? default` at load time.
  ourTeamKit?: TeamKit;
  goalkeeperKit?: TeamKit;
  bibKit?: TeamKit;
};

/** Everything a scenario stores except its identity (id, name, savedAt). */
export type TacticalScenarioContent = Omit<TacticalScenario, "id" | "name" | "savedAt">;

export type ScenarioWriteFailure = "limit" | "storage" | "missing";

export type ScenarioWriteResult =
  | { status: "saved"; scenario: TacticalScenario }
  | { status: "failed"; reason: ScenarioWriteFailure };

function createScenarioId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listScenarios(): TacticalScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TacticalScenario[]) : [];
  } catch {
    return [];
  }
}

/** True when a write landed. False when storage is full, disabled or unavailable. */
function persistList(list: TacticalScenario[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * Same normalisation the original positional saveScenario always applied:
 * empty optional collections are stored as undefined.
 */
function normalizeContent(content: TacticalScenarioContent): TacticalScenarioContent {
  return {
    ...content,
    textAnnotations: content.textAnnotations && content.textAnnotations.length > 0 ? content.textAnnotations : undefined,
    drawings: content.drawings && content.drawings.length > 0 ? content.drawings : undefined,
  };
}

/**
 * Saves a new play. Never removes an existing play: at MAX_SCENARIOS it
 * refuses with reason "limit", and a failed write reports "storage" instead
 * of pretending to succeed.
 */
export function trySaveScenario(name: string, content: TacticalScenarioContent): ScenarioWriteResult {
  const existing = listScenarios();
  if (existing.length >= MAX_SCENARIOS) return { status: "failed", reason: "limit" };
  const scenario: TacticalScenario = {
    ...normalizeContent(content),
    id: createScenarioId(),
    name: name.trim() || "Untitled",
    savedAt: Date.now(),
  };
  if (!persistList([scenario, ...existing])) return { status: "failed", reason: "storage" };
  return { status: "saved", scenario };
}

/**
 * Replaces an existing play's content in place, keeping its id and list
 * position. The name is kept unless a non-empty one is given.
 */
export function tryUpdateScenario(id: string, content: TacticalScenarioContent, name?: string): ScenarioWriteResult {
  const existing = listScenarios();
  const index = existing.findIndex((s) => s.id === id);
  if (index < 0) return { status: "failed", reason: "missing" };
  const previous = existing[index]!;
  const scenario: TacticalScenario = {
    ...normalizeContent(content),
    id: previous.id,
    name: name?.trim() || previous.name,
    savedAt: Date.now(),
  };
  const next = existing.slice();
  next[index] = scenario;
  if (!persistList(next)) return { status: "failed", reason: "storage" };
  return { status: "saved", scenario };
}

export function tryDuplicateScenario(id: string): ScenarioWriteResult {
  const existing = listScenarios();
  const source = existing.find((s) => s.id === id);
  if (!source) return { status: "failed", reason: "missing" };
  if (existing.length >= MAX_SCENARIOS) return { status: "failed", reason: "limit" };
  const copy: TacticalScenario = {
    ...source,
    id: createScenarioId(),
    name: `${source.name} (copy)`,
    savedAt: Date.now(),
  };
  if (!persistList([copy, ...existing])) return { status: "failed", reason: "storage" };
  return { status: "saved", scenario: copy };
}

/**
 * Original positional save API, kept for existing callers. Unlike before, it
 * never evicts the oldest play: if the save is refused (play limit reached,
 * or storage full) it throws rather than silently losing data.
 * The page uses trySaveScenario so it can show the reason to the coach.
 */
export function saveScenario(
  name: string,
  tokens: MovementBoardToken[],
  routes: MovementBoardRoute[],
  ballState: BallState,
  passEvents: TacticalPassEvent[],
  shotEvents: TacticalShotEvent[],
  playbackSpeed?: MovementPlaybackSpeed,
  units?: TacticalUnit[],
  zones?: ZoneRecord[],
  items?: TacticalTrainingItem[],
  textAnnotations?: SlateTextAnnotation[],
  ourTeamKit?: TeamKit,
  goalkeeperKit?: TeamKit,
  bibKit?: TeamKit,
  drawings?: TacticalDrawingSnapshot[],
): TacticalScenario {
  const result = trySaveScenario(name, {
    tokens,
    routes,
    ballState,
    passEvents,
    shotEvents,
    playbackSpeed,
    units,
    zones,
    items,
    textAnnotations,
    ourTeamKit,
    goalkeeperKit,
    bibKit,
    drawings,
  });
  if (result.status === "failed") {
    throw new Error(`Tactical Sequence play was not saved (${result.reason}).`);
  }
  return result.scenario;
}

/** Returns false if the write failed. Deleting an unknown id is a successful no-op. */
export function deleteScenario(id: string): boolean {
  return persistList(listScenarios().filter((s) => s.id !== id));
}

/** Returns false if the write failed. */
export function renameScenario(id: string, name: string): boolean {
  return persistList(
    listScenarios().map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)),
  );
}

/** Returns null if the play no longer exists, the limit is reached, or storage is full. Never evicts. */
export function duplicateScenario(id: string): TacticalScenario | null {
  const result = tryDuplicateScenario(id);
  return result.status === "saved" ? result.scenario : null;
}

// ---- In-progress autosave draft ---------------------------------------------

export type TacticalScenarioDraft = {
  version: 1;
  updatedAt: number;
  /** The saved play this work started from, if any, so Save can update it after a restore. */
  loadedScenarioId: string | null;
  loadedScenarioName: string | null;
  content: TacticalScenarioContent;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural check only: the draft was written by this module, so this guards
 * against a truncated or foreign value, not against hostile input. Optional
 * fields are passed through and defaulted at load time like a saved play.
 */
export function sanitizeScenarioContent(value: unknown): TacticalScenarioContent | null {
  if (!isObject(value)) return null;
  const { tokens, routes, ballState, passEvents, shotEvents } = value;
  if (!Array.isArray(tokens) || !Array.isArray(routes) || !Array.isArray(passEvents) || !Array.isArray(shotEvents)) {
    return null;
  }
  if (ballState !== undefined && !isObject(ballState)) return null;
  return {
    ...(value as TacticalScenarioContent),
    ballState: (ballState as BallState | undefined) ?? {},
  };
}

export function loadScenarioDraft(): { draft: TacticalScenarioDraft | null; isCorrupt: boolean } {
  try {
    const raw = localStorage.getItem(TP_ACTIVE_DRAFT_STORAGE_KEY);
    if (!raw) return { draft: null, isCorrupt: false };
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { draft: null, isCorrupt: true };
    const content = sanitizeScenarioContent(parsed.content);
    if (!content) return { draft: null, isCorrupt: true };
    return {
      draft: {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now(),
        loadedScenarioId: typeof parsed.loadedScenarioId === "string" ? parsed.loadedScenarioId : null,
        loadedScenarioName: typeof parsed.loadedScenarioName === "string" ? parsed.loadedScenarioName : null,
        content,
      },
      isCorrupt: false,
    };
  } catch {
    return { draft: null, isCorrupt: true };
  }
}

export function saveScenarioDraft(
  content: TacticalScenarioContent,
  source: { loadedScenarioId: string | null; loadedScenarioName: string | null },
): boolean {
  const payload: TacticalScenarioDraft = {
    version: 1,
    updatedAt: Date.now(),
    loadedScenarioId: source.loadedScenarioId,
    loadedScenarioName: source.loadedScenarioName,
    content: normalizeContent(content),
  };
  try {
    localStorage.setItem(TP_ACTIVE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearScenarioDraft(): void {
  try {
    localStorage.removeItem(TP_ACTIVE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
