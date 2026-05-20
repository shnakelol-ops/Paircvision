import { Application, Container, Graphics, Text } from "pixi.js";

import { createWorldViewport } from "./createWorldViewport";
import {
  createPremiumPlayerToken,
  PREMIUM_TOKEN_DRAG_SCALE,
  PREMIUM_TOKEN_DRAG_SHADOW_ALPHA,
  PREMIUM_TOKEN_IDLE_SCALE,
  PREMIUM_TOKEN_IDLE_SHADOW_ALPHA,
  type PremiumPlayerTokenColor,
} from "./createPremiumPlayerToken";
import type { MicroAthleteKitPattern } from "./createMicroAthleteToken";
import {
  resolvePlayerTokenRenderer,
  sanitizePlayerTokenStyle,
  type PlayerTokenStyle,
} from "./playerTokenRenderer";
import {
  createTacticalPitchVisualRoot,
  type TacticalPitchTheme,
} from "../../tactical-lite/pixi/renderTacticalPitch";
import {
  NORMALIZED_MAX,
  NORMALIZED_MIN,
  type NormalizedPoint,
} from "../shared/normalization";
import { createTacticalDrawingController } from "../../features/quickboard/drawing/tacticalDrawingController";
import {
  drawingToolToWhiteboardTool,
  sanitizeDrawingSnapshot,
  sanitizeDrawingTool,
  type TacticalDrawingSnapshot,
  type WhiteboardDrawTool,
} from "../../features/quickboard/drawing/tacticalDrawingTypes";
import {
  createBasicRouteFollowSession,
  type BasicRouteFollowSession,
  type RoutePoint,
} from "./movement/basicRouteFollow";

export type TacticalKitPattern = MicroAthleteKitPattern;
export type TacticalLabelMode = "number" | "initials";
export type TacticalPlayerTokenStyle = PlayerTokenStyle;
export type TacticalPlayerKitFields = {
  kitBaseColor?: string;
  kitPattern?: TacticalKitPattern;
  kitPatternColor?: string;
  labelMode?: TacticalLabelMode;
  initials?: string;
};
export type TacticalPlayerKitPatch = Partial<TacticalPlayerKitFields>;
export type TacticalPlayerKitSnapshot = TacticalPlayerKitFields & {
  id: string;
  number: number;
  team: "BLUE" | "RED";
};

type TacticalPlayer = TacticalPlayerKitFields & {
  id: string;
  number: number;
  team: "BLUE" | "RED";
  teamColor: WhiteboardTokenColor;
  current: NormalizedPoint;
  token: Container;
  tokenShadow: Graphics;
  dragScaleTarget: number;
  dragShadowAlphaTarget: number;
};

export type WhiteboardTokenColor = PremiumPlayerTokenColor;
export type FlowItemType =
  | "cone"
  | "discCone"
  | "pole"
  | "miniGoal"
  | "mannequin"
  | "ladder"
  | "hurdle"
  | "tackleBag"
  | "footballSmall"
  | "football"
  | "footballLarge"
  | "sliotarSmall"
  | "sliotar"
  | "sliotarLarge";
export type ItemMode = "edit" | "locked";
export type TacticalItem = {
  id: string;
  type: FlowItemType;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
};

export type TacticalBoardState = {
  version: number;
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
};

export type TacticalRouteState = {
  isRouteCaptureMode: boolean;
  routeCount: number;
  maxRoutes: number;
};

export type TacticalPadLiteSurface = {
  setStart: () => void;
  addPhase: () => void;
  undoPhase: () => void;
  newBoard: () => void;
  play: () => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  setPlaybackSpeedMultiplier: (multiplier: number) => void;
  setPossessionPassMode: (enabled: boolean) => void;
  freeBall: () => void;
  addTacticalPlayer: (team?: "BLUE" | "RED") => void;
  removeTacticalPlayer: (team?: "BLUE" | "RED") => void;
  getTacticalPlayer: (playerId: string) => TacticalPlayerKitSnapshot | null;
  patchTacticalPlayer: (playerId: string, patch: TacticalPlayerKitPatch) => void;
  setItems: (items: TacticalItem[]) => void;
  setItemMode: (mode: ItemMode) => void;
  setRouteCaptureMode: (enabled: boolean) => void;
  clearRoutes: () => void;
  getRouteState: () => TacticalRouteState;
  reset: () => void;
  reflow: () => void;
  setWhiteboardTeamConfig: (config: {
    counts: { blue: number; red: number };
    colors: { blue: WhiteboardTokenColor; red: WhiteboardTokenColor };
  }) => void;
  setTacticalTokenStyle: (style: TacticalPlayerTokenStyle) => void;
  setWhiteboardDrawTool: (tool: WhiteboardDrawTool) => void;
  setWhiteboardDrawColor: (color: number) => void;
  eraseWhiteboardPenStroke: () => void;
  undoWhiteboardStroke: () => void;
  clearWhiteboardStrokes: () => void;
  exportBoardState: () => TacticalBoardState;
  importBoardState: (state: TacticalBoardState) => boolean;
  exportImageCanvas: () => HTMLCanvasElement | null;
  destroy: () => void;
};

type TacticalPadLiteSurfaceOptions = {
  onPhaseCountChange?: (count: number) => void;
  onPlaybackStateChange?: (state: { isPlaying: boolean; isPaused: boolean }) => void;
  surfaceVariant?: "tactical" | "whiteboard";
  whiteboardTeamCounts?: {
    blue: number;
    red: number;
  };
  whiteboardTeamColors?: {
    blue: WhiteboardTokenColor;
    red: WhiteboardTokenColor;
  };
  whiteboardDrawColor?: number;
  tacticalTokenStyle?: TacticalPlayerTokenStyle;
  onItemMove?: (id: string, x: number, y: number) => void;
  onTacticalPlayerDoubleTap?: (payload: { playerId: string; clientX: number; clientY: number }) => void;
  onRouteStateChange?: (state: TacticalRouteState) => void;
};

type PhaseBallSnapshot = {
  id: string;
  x: number;
  y: number;
  attachedPlayerId: string | null;
  isFree: boolean;
  path?: NormalizedPoint[];
};
type PhaseSnapshot = {
  players: NormalizedPoint[];
  football: PhaseBallSnapshot[];
};

const WORLD_SIZE = { width: 160, height: 100 } as const;
const PLAYER_RADIUS = 4.1;
const PLAYER_TOUCH_HIT_DIAMETER_PX = 48;
const TACTICAL_PLAYER_VISUAL_SCALE = 0.8;
const TACTICAL_ITEM_HALF_SIZE = 2.2;
const TACTICAL_ITEM_DRAG_THRESHOLD_PX = 5;
const TACTICAL_ITEM_TOUCH_HIT_DIAMETER_PX = 46;
const ATTACHED_BALL_OFFSETS_WORLD: ReadonlyArray<Readonly<NormalizedPoint>> = [
  { x: 4.0, y: -3.2 },
  { x: 4.0, y: 3.2 },
  { x: -4.0, y: -3.2 },
  { x: -4.0, y: 3.2 },
  { x: 4.7, y: 0 },
  { x: -4.7, y: 0 },
];
const ATTACHED_BALL_FOLLOW_MAX_LEAD_WORLD = 0.6;
const ATTACHED_BALL_FOLLOW_SMOOTHING = 0.28;
const BALL_DRAG_DEADZONE_WORLD = 0.18;
const BALL_DRAG_SMOOTHING = 0.4;
const BALL_DRAG_FAST_FOLLOW_DISTANCE_WORLD = 1.6;
const BALL_PATH_MIN_POINT_DISTANCE = 0.35;
const POSSESSION_PASS_MIN_DURATION_MS = 900;
const POSSESSION_PASS_MAX_DURATION_MS = 1800;
const POSSESSION_PASS_REFERENCE_DISTANCE = 14;
const BASIC_ROUTE_FOLLOW_SPEED = 18;
const BASIC_ROUTE_MIN_POINT_DISTANCE = 0.9;
const MAX_BASIC_ROUTE_PLAYERS = 6;
const BASIC_ROUTE_PREVIEW_SHADOW_COLOR = 0x1c1205;
const BASIC_ROUTE_PREVIEW_CORE_COLOR = 0xf59e0b;
const BASIC_ROUTE_PREVIEW_HIGHLIGHT_COLOR = 0xffd8a1;
const WHITEBOARD_DEFAULT_STROKE_COLOR = 0x111111;
const WHITEBOARD_BLUE_START_X = 30;
const WHITEBOARD_RED_START_X = 70;
const DOUBLE_TAP_WINDOW_MS = 300;
const PLAYER_ORIGIN_LINE_COLOR_BY_TEAM: Record<WhiteboardTokenColor, number> = {
  blue: 0x60a5fa,
  red: 0xf87171,
  yellow: 0xfacc15,
  black: 0x94a3b8,
};
const KIT_COLOR_NAMES = [
  "navy",
  "blue",
  "sky",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "maroon",
  "purple",
  "pink",
  "white",
  "grey",
  "black",
] as const;
const KIT_COLOR_NUMERIC: Record<(typeof KIT_COLOR_NAMES)[number], number> = {
  navy: 0x1e3a8a,
  blue: 0x2563eb,
  sky: 0x0ea5e9,
  cyan: 0x06b6d4,
  green: 0x16a34a,
  lime: 0x84cc16,
  red: 0xdc2626,
  orange: 0xf97316,
  maroon: 0x7f1d1d,
  purple: 0x7c3aed,
  pink: 0xec4899,
  yellow: 0xfacc15,
  white: 0xffffff,
  grey: 0x6b7280,
  black: 0x111827,
};
type TacticalKitColor = (typeof KIT_COLOR_NAMES)[number];
const GOALKEEPER_KIT_OVERRIDE_BY_TEAM: Record<
  "BLUE" | "RED",
  { baseColor: TacticalKitColor; patternColor: TacticalKitColor }
> = {
  BLUE: {
    baseColor: "black",
    patternColor: "lime",
  },
  RED: {
    baseColor: "navy",
    patternColor: "cyan",
  },
};

type PlayerSeed = {
  id: string;
  number: number;
  team: "BLUE" | "RED";
  color: WhiteboardTokenColor;
  position: NormalizedPoint;
  kitBaseColor?: TacticalKitColor;
  kitPattern?: TacticalKitPattern;
  kitPatternColor?: TacticalKitColor;
};

type ActiveBasicRouteFollow = {
  playerId: string;
  origin: NormalizedPoint;
  segmentIndex: number;
  session: BasicRouteFollowSession;
};

type PlaybackKind = "default" | "possession-pass";

type PlaybackStartOptions = {
  suppressRoutePlayback?: boolean;
  kind?: PlaybackKind;
  possessionReceiverId?: string | null;
};

type TacticalSurfaceItem = TacticalItem & {
  graphic: Graphics;
  selectionGraphic: Graphics;
};

type BallRuntimeState = {
  attachedPlayerId: string | null;
  isFree: boolean;
  path: NormalizedPoint[];
};

type DragPointerState = {
  pointerId: number | null;
  startStagePoint: { x: number; y: number } | null;
  hasCrossedThreshold: boolean;
};

type ActiveDragState =
  | ({
      type: "item";
      itemId: string;
      dragOffset: { x: number; y: number };
      dragOffsetWorld: { x: number; y: number };
      lastAcceptedBallDragWorld: { x: number; y: number } | null;
    } & DragPointerState)
  | ({
      type: "player";
      playerId: string;
    } & DragPointerState)
  | null;

type TacticalBoardPlayerState = TacticalPlayerKitFields & {
  id: string;
  number: number;
  team: "BLUE" | "RED";
  teamColor: WhiteboardTokenColor;
  x: number;
  y: number;
};

type TacticalBoardDrawingSnapshot = TacticalDrawingSnapshot;

type TacticalBoardTeamState = {
  colors: {
    blue: WhiteboardTokenColor;
    red: WhiteboardTokenColor;
  };
  counts: {
    blue: number;
    red: number;
  };
};

type TacticalTeamKitState = {
  primaryColor: TacticalKitColor;
  secondaryColor: TacticalKitColor;
  pattern: TacticalKitPattern;
};

type TacticalBoardTeamKitsState = {
  A: TacticalTeamKitState;
  B: TacticalTeamKitState;
};

const TACTICAL_INITIAL_TEAM_COUNTS = {
  blue: 1,
  red: 1,
} as const;
const DEFAULT_PLAYBACK_SPEED_MULTIPLIER = 1;
const MIN_PLAYBACK_SPEED_MULTIPLIER = 0.25;
const MAX_PLAYBACK_SPEED_MULTIPLIER = 1.5;

function clampWorld(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

function clampTeamCount(value: number | undefined): number {
  const parsed = Number.isFinite(value) ? Math.floor(value as number) : 1;
  return Math.max(1, Math.min(15, parsed));
}

function sanitizePlaybackSpeedMultiplier(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  return Math.max(MIN_PLAYBACK_SPEED_MULTIPLIER, Math.min(MAX_PLAYBACK_SPEED_MULTIPLIER, value));
}

function sanitizeKitColor(value: string | undefined): TacticalKitColor | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if ((KIT_COLOR_NAMES as readonly string[]).includes(normalized)) {
    return normalized as TacticalKitColor;
  }
  return undefined;
}

function sanitizeKitPattern(value: TacticalKitPattern | undefined): TacticalKitPattern | undefined {
  if (!value) return undefined;
  if (value === "plain" || value === "hoops" || value === "slash" || value === "stripes") return value;
  return undefined;
}

function sanitizeLabelMode(value: TacticalLabelMode | undefined): TacticalLabelMode | undefined {
  if (value === "number" || value === "initials") return value;
  return undefined;
}

export function sanitizeInitials(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return sanitized.length > 0 ? sanitized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeWhiteboardTokenColor(value: unknown): WhiteboardTokenColor | null {
  if (value === "blue" || value === "red" || value === "yellow" || value === "black") {
    return value;
  }
  return null;
}

function sanitizeTeam(value: unknown): "BLUE" | "RED" | null {
  if (value === "BLUE" || value === "RED") return value;
  return null;
}

function sanitizeNormalizedPoint(point: unknown): NormalizedPoint | null {
  if (!isRecord(point)) return null;
  const x = typeof point.x === "number" && Number.isFinite(point.x) ? clampNormalizedValue(point.x) : null;
  const y = typeof point.y === "number" && Number.isFinite(point.y) ? clampNormalizedValue(point.y) : null;
  if (x == null || y == null) return null;
  return { x, y };
}

function sanitizeBallPath(input: unknown): NormalizedPoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => sanitizeNormalizedPoint(entry))
    .filter((entry): entry is NormalizedPoint => entry != null);
}

function sanitizeSnapshotFootball(input: unknown): PhaseBallSnapshot[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!id) return null;
      const x = typeof entry.x === "number" && Number.isFinite(entry.x) ? clampNormalizedValue(entry.x) : null;
      const y = typeof entry.y === "number" && Number.isFinite(entry.y) ? clampNormalizedValue(entry.y) : null;
      if (x == null || y == null) return null;
      const attachedPlayerId =
        typeof entry.attachedPlayerId === "string" && entry.attachedPlayerId.trim().length > 0
          ? entry.attachedPlayerId.trim()
          : null;
      const isFree = typeof entry.isFree === "boolean" ? entry.isFree : attachedPlayerId == null;
      const path = isFree ? sanitizeBallPath(entry.path) : [];
      return {
        id,
        x,
        y,
        attachedPlayerId: isFree ? null : attachedPlayerId,
        isFree,
        ...(isFree && path.length > 0 ? { path } : {}),
      };
    })
    .filter((entry): entry is PhaseBallSnapshot => entry != null);
}

function sanitizePhaseSnapshot(input: unknown): PhaseSnapshot | null {
  if (!isRecord(input)) return null;
  const players = Array.isArray(input.players)
    ? input.players
        .map((entry) => sanitizeNormalizedPoint(entry))
        .filter((entry): entry is NormalizedPoint => entry != null)
    : [];
  const football = sanitizeSnapshotFootball(input.football);
  return {
    players,
    football,
  };
}

function sanitizeBoardDrawingSnapshot(
  input: unknown,
  drawingMapper: Pick<ReturnType<typeof createWorldViewport>, "worldToNormalized">,
): TacticalBoardDrawingSnapshot | null {
  return sanitizeDrawingSnapshot(input, drawingMapper);
}

function sanitizeBoardPlayerState(input: unknown): TacticalBoardPlayerState | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id.length <= 0) return null;
  const team = sanitizeTeam(input.team);
  const teamColor = sanitizeWhiteboardTokenColor(input.teamColor);
  if (!team || !teamColor) return null;
  const number =
    typeof input.number === "number" && Number.isFinite(input.number)
      ? Math.max(1, Math.floor(input.number))
      : 1;
  const normalizedPoint = sanitizeNormalizedPoint({ x: input.x, y: input.y });
  if (!normalizedPoint) return null;
  return {
    id,
    number,
    team,
    teamColor,
    x: normalizedPoint.x,
    y: normalizedPoint.y,
    kitBaseColor: sanitizeKitColor(typeof input.kitBaseColor === "string" ? input.kitBaseColor : undefined),
    kitPattern: sanitizeKitPattern((input.kitPattern as TacticalKitPattern | undefined) ?? undefined),
    kitPatternColor: sanitizeKitColor(typeof input.kitPatternColor === "string" ? input.kitPatternColor : undefined),
    labelMode: sanitizeLabelMode((input.labelMode as TacticalLabelMode | undefined) ?? undefined),
    initials: sanitizeInitials(typeof input.initials === "string" ? input.initials : undefined),
  };
}

function sanitizeTacticalItemCandidate(input: unknown): TacticalItem | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id.length <= 0) return null;
  const type = input.type;
  if (
    type !== "cone" &&
    type !== "discCone" &&
    type !== "pole" &&
    type !== "miniGoal" &&
    type !== "mannequin" &&
    type !== "ladder" &&
    type !== "hurdle" &&
    type !== "tackleBag" &&
    type !== "footballSmall" &&
    type !== "football" &&
    type !== "footballLarge" &&
    type !== "sliotarSmall" &&
    type !== "sliotar" &&
    type !== "sliotarLarge"
  ) {
    return null;
  }
  const x = typeof input.x === "number" && Number.isFinite(input.x) ? input.x : null;
  const y = typeof input.y === "number" && Number.isFinite(input.y) ? input.y : null;
  if (x == null || y == null) return null;
  return normalizeTacticalItem({
    id,
    type,
    x,
    y,
    rotation: typeof input.rotation === "number" ? input.rotation : undefined,
    scale: typeof input.scale === "number" ? input.scale : undefined,
  });
}

function sanitizeBoardRoutes(input: unknown): Map<string, RoutePoint[]> {
  if (!Array.isArray(input)) return new Map();
  const parsed = new Map<string, RoutePoint[]>();
  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const playerId = typeof entry.playerId === "string" ? entry.playerId.trim() : "";
    if (playerId.length <= 0) continue;
    if (parsed.has(playerId)) continue;
    const points = Array.isArray(entry.points)
      ? entry.points
          .map((point) => sanitizeNormalizedPoint(point))
          .filter((point): point is NormalizedPoint => point != null)
          .map((point) => ({ x: point.x, y: point.y }))
      : [];
    if (points.length < 2) continue;
    parsed.set(playerId, points);
  }
  return parsed;
}

function sanitizePlayerKitPatch(patch: TacticalPlayerKitPatch): TacticalPlayerKitFields {
  const nextBaseColor = sanitizeKitColor(patch.kitBaseColor);
  const nextPattern = sanitizeKitPattern(patch.kitPattern);
  const nextPatternColor = sanitizeKitColor(patch.kitPatternColor);
  const nextLabelMode = sanitizeLabelMode(patch.labelMode);
  const nextInitials = sanitizeInitials(patch.initials);
  return {
    ...(patch.kitBaseColor !== undefined ? { kitBaseColor: nextBaseColor } : {}),
    ...(patch.kitPattern !== undefined ? { kitPattern: nextPattern } : {}),
    ...(patch.kitPatternColor !== undefined ? { kitPatternColor: nextPatternColor } : {}),
    ...(patch.labelMode !== undefined ? { labelMode: nextLabelMode } : {}),
    ...(patch.initials !== undefined ? { initials: nextInitials } : {}),
  };
}

function defaultKitPatternColor(baseColor: TacticalKitColor): TacticalKitColor {
  return baseColor === "white" ? "black" : "white";
}

function createTeamKitState(primaryColor: TacticalKitColor, pattern: TacticalKitPattern = "plain"): TacticalTeamKitState {
  return {
    primaryColor,
    secondaryColor: defaultKitPatternColor(primaryColor),
    pattern,
  };
}

function createDefaultTacticalTeamKits(
  colors: TacticalPadLiteSurfaceOptions["whiteboardTeamColors"],
): TacticalBoardTeamKitsState {
  const bluePrimary = sanitizeKitColor(colors?.blue) ?? "blue";
  const redPrimary = sanitizeKitColor(colors?.red) ?? "red";
  return {
    A: createTeamKitState(bluePrimary, "plain"),
    B: createTeamKitState(redPrimary, "plain"),
  };
}

function sanitizeTeamKitState(input: unknown): TacticalTeamKitState | null {
  if (!isRecord(input)) return null;
  const primaryColor = sanitizeKitColor(typeof input.primaryColor === "string" ? input.primaryColor : undefined);
  if (!primaryColor) return null;
  const pattern = sanitizeKitPattern((input.pattern as TacticalKitPattern | undefined) ?? undefined) ?? "plain";
  const secondaryColor = sanitizeKitColor(typeof input.secondaryColor === "string" ? input.secondaryColor : undefined)
    ?? defaultKitPatternColor(primaryColor);
  return {
    primaryColor,
    secondaryColor,
    pattern,
  };
}

function sanitizeBoardTeamKitsState(input: unknown): TacticalBoardTeamKitsState | null {
  if (!isRecord(input)) return null;
  const teamA = sanitizeTeamKitState(input.A);
  const teamB = sanitizeTeamKitState(input.B);
  if (!teamA || !teamB) return null;
  return {
    A: teamA,
    B: teamB,
  };
}

function buildTeamKitFromPlayerStates(
  team: "BLUE" | "RED",
  players: TacticalBoardPlayerState[],
  fallback: TacticalTeamKitState,
): TacticalTeamKitState {
  const firstTeamPlayer = players.find((player) => player.team === team);
  if (!firstTeamPlayer) {
    return { ...fallback };
  }
  const primaryColor = sanitizeKitColor(firstTeamPlayer.kitBaseColor) ?? fallback.primaryColor;
  const pattern = sanitizeKitPattern(firstTeamPlayer.kitPattern) ?? fallback.pattern;
  const secondaryColor = sanitizeKitColor(firstTeamPlayer.kitPatternColor) ?? fallback.secondaryColor;
  return {
    primaryColor,
    secondaryColor,
    pattern,
  };
}

function safePlayerNumberLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.max(0, Math.floor(value)));
}

function createWhiteboardPlayerSeeds(
  counts: TacticalPadLiteSurfaceOptions["whiteboardTeamCounts"],
  colors: TacticalPadLiteSurfaceOptions["whiteboardTeamColors"],
): PlayerSeed[] {
  const blueCount = clampTeamCount(counts?.blue);
  const redCount = clampTeamCount(counts?.red);
  const blueColor = colors?.blue ?? "blue";
  const redColor = colors?.red ?? "red";

  const bluePlayers: PlayerSeed[] = Array.from({ length: blueCount }, (_, index) => ({
    id: `B${index + 1}`,
    number: index + 1,
    team: "BLUE",
    color: blueColor,
    position: {
      x: WHITEBOARD_BLUE_START_X,
      y: ((index + 1) * WORLD_SIZE.height) / (blueCount + 1),
    },
  }));

  const redPlayers: PlayerSeed[] = Array.from({ length: redCount }, (_, index) => ({
    id: `R${index + 1}`,
    number: index + 1,
    team: "RED",
    color: redColor,
    position: {
      x: WHITEBOARD_RED_START_X,
      y: ((index + 1) * WORLD_SIZE.height) / (redCount + 1),
    },
  }));

  return [...bluePlayers, ...redPlayers];
}

function teamPrefix(team: "BLUE" | "RED"): "B" | "R" {
  return team === "RED" ? "R" : "B";
}

function teamLaneX(team: "BLUE" | "RED"): number {
  return team === "RED" ? WHITEBOARD_RED_START_X : WHITEBOARD_BLUE_START_X;
}

function teamColor(
  team: "BLUE" | "RED",
  colors: TacticalPadLiteSurfaceOptions["whiteboardTeamColors"],
): WhiteboardTokenColor {
  if (team === "RED") {
    return colors?.red ?? "red";
  }
  return colors?.blue ?? "blue";
}

function setPlayerTouchHitArea(
  player: TacticalPlayer,
  mapper: ReturnType<typeof createWorldViewport>,
): void {
  const touchRadiusInWorld = (PLAYER_TOUCH_HIT_DIAMETER_PX * 0.5) / mapper.transform.scale;
  const hitRadius = Math.max(PLAYER_RADIUS, touchRadiusInWorld);
  const hitRadiusSquared = hitRadius * hitRadius;
  player.token.hitArea = {
    contains: (x: number, y: number) => x * x + y * y <= hitRadiusSquared,
  };
}

function setTokenWorldPositionForPoint(
  player: TacticalPlayer,
  point: NormalizedPoint,
  mapper: ReturnType<typeof createWorldViewport>,
): void {
  const world = mapper.normalizedToWorld(point);
  player.token.position.set(world.x, world.y);
}

function setItemTouchHitArea(
  item: Pick<TacticalSurfaceItem, "graphic" | "type">,
  mapper: ReturnType<typeof createWorldViewport>,
): void {
  const touchRadiusInWorld = (TACTICAL_ITEM_TOUCH_HIT_DIAMETER_PX * 0.5) / mapper.transform.scale;
  const itemVisualRadius =
    item.type === "miniGoal"
      ? TACTICAL_ITEM_HALF_SIZE * 1.9
      : item.type === "mannequin"
        ? TACTICAL_ITEM_HALF_SIZE * 1.75
        : TACTICAL_ITEM_HALF_SIZE * 1.35;
  const hitRadius = Math.max(itemVisualRadius, touchRadiusInWorld);
  const hitRadiusSquared = hitRadius * hitRadius;
  item.graphic.hitArea = {
    contains: (x: number, y: number) => x * x + y * y <= hitRadiusSquared,
  };
}

function clampNormalizedValue(value: number): number {
  if (!Number.isFinite(value)) return NORMALIZED_MIN;
  return Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, value));
}

function normalizeTacticalItem(item: TacticalItem): TacticalItem {
  const normalizedRotation = Number.isFinite(item.rotation) ? Number(item.rotation) : undefined;
  const normalizedScale = Number.isFinite(item.scale) ? Math.max(0.5, Math.min(2, Number(item.scale))) : undefined;
  return {
    id: item.id,
    type: item.type,
    x: clampNormalizedValue(item.x),
    y: clampNormalizedValue(item.y),
    rotation: normalizedRotation,
    scale: normalizedScale,
  };
}

function isBallItem(item: Pick<TacticalItem, "type">): boolean {
  return (
    item.type === "footballSmall" ||
    item.type === "football" ||
    item.type === "footballLarge" ||
    item.type === "sliotarSmall" ||
    item.type === "sliotar" ||
    item.type === "sliotarLarge"
  );
}

function getStagePointFromEvent(
  event: unknown,
  stage: Container,
): { x: number; y: number } | null {
  const stagePoint = (event as {
    data?: { getLocalPosition?: (target: Container) => { x: number; y: number } };
    getLocalPosition?: (target: Container) => { x: number; y: number };
  }).data?.getLocalPosition?.(stage) ??
    (event as { getLocalPosition?: (target: Container) => { x: number; y: number } }).getLocalPosition?.(
      stage,
    );
  return stagePoint ?? null;
}

function getPointerIdFromEvent(event: unknown): number | null {
  const pointerId = (event as { pointerId?: unknown }).pointerId;
  return typeof pointerId === "number" ? pointerId : null;
}

export async function createTacticalPadLiteSurface(
  host: HTMLElement,
  options: TacticalPadLiteSurfaceOptions = {},
): Promise<TacticalPadLiteSurface> {
  const app = new Application();
  await app.init({
    width: host.clientWidth || 800,
    height: host.clientHeight || 520,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });

  host.appendChild(app.canvas as HTMLCanvasElement);
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  app.canvas.style.display = "block";
  app.canvas.style.touchAction = "none";
  app.canvas.style.userSelect = "none";

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const world = new Container();
  app.stage.addChild(world);

  const surfaceVariant = options.surfaceVariant ?? "tactical";
  const pitchTheme: TacticalPitchTheme =
    surfaceVariant === "whiteboard" ? "whiteboard" : "default";
  const pitchMount = createTacticalPitchVisualRoot("gaelic", { theme: pitchTheme });
  world.addChild(pitchMount.root);

  if (surfaceVariant === "whiteboard") {
    const watermarkLabel = new Text({
      text: "P",
      style: {
        fill: 0x202934,
        fontSize: 3.3,
        fontWeight: "800",
        fontFamily: "Inter, Arial Narrow, Arial, system-ui, sans-serif",
        letterSpacing: 0.32,
      },
    });
    watermarkLabel.anchor.set(1, 1);
    watermarkLabel.position.set(WORLD_SIZE.width - 2.2, WORLD_SIZE.height - 1.8);
    watermarkLabel.alpha = 0.15;
    watermarkLabel.eventMode = "none";
    world.addChild(watermarkLabel);

    const watermarkAccent = new Graphics();
    watermarkAccent
      .roundRect(WORLD_SIZE.width - 6.1, WORLD_SIZE.height - 1.35, 3.9, 0.34, 0.2)
      .fill({ color: 0xf2c94c, alpha: 0.15 });
    watermarkAccent.eventMode = "none";
    world.addChild(watermarkAccent);
  }

  const whiteboardDrawingsLayer = new Container();
  whiteboardDrawingsLayer.eventMode = "none";
  world.addChild(whiteboardDrawingsLayer);

  const whiteboardPreviewLayer = new Container();
  whiteboardPreviewLayer.eventMode = "none";
  world.addChild(whiteboardPreviewLayer);

  const whiteboardPreviewGraphic = new Graphics();
  whiteboardPreviewGraphic.eventMode = "none";
  whiteboardPreviewLayer.addChild(whiteboardPreviewGraphic);
  const basicRoutePreviewGraphic = new Graphics();
  basicRoutePreviewGraphic.eventMode = "none";
  whiteboardPreviewLayer.addChild(basicRoutePreviewGraphic);

  const itemsLayer = new Container();
  itemsLayer.eventMode = "passive";
  world.addChild(itemsLayer);

  const playerOriginLayer = new Container();
  playerOriginLayer.eventMode = "none";
  world.addChild(playerOriginLayer);
  const playerOriginGraphic = new Graphics();
  playerOriginGraphic.eventMode = "none";
  playerOriginLayer.addChild(playerOriginGraphic);

  const playersLayer = new Container();
  world.addChild(playersLayer);

  const ballLayer = new Container();
  ballLayer.eventMode = "passive";
  world.addChild(ballLayer);

  const whiteboardInputLayer = new Container();
  whiteboardInputLayer.eventMode = "none";
  whiteboardInputLayer.hitArea = {
    contains: (x: number, y: number) =>
      x >= 0 && y >= 0 && x <= WORLD_SIZE.width && y <= WORLD_SIZE.height,
  };
  world.addChild(whiteboardInputLayer);

  let mapper = createWorldViewport(
    WORLD_SIZE,
    { width: host.clientWidth || 800, height: host.clientHeight || 520 },
  );

  let tacticalTeamColors: TacticalPadLiteSurfaceOptions["whiteboardTeamColors"] = {
    blue: options.whiteboardTeamColors?.blue ?? "blue",
    red: options.whiteboardTeamColors?.red ?? "red",
  };
  let tacticalTeamKits: TacticalBoardTeamKitsState = createDefaultTacticalTeamKits(tacticalTeamColors);
  let tacticalTokenStyle: TacticalPlayerTokenStyle = sanitizePlayerTokenStyle(options.tacticalTokenStyle);

  const playerSeeds =
    surfaceVariant === "whiteboard"
      ? createWhiteboardPlayerSeeds(options.whiteboardTeamCounts, options.whiteboardTeamColors)
      : createWhiteboardPlayerSeeds(TACTICAL_INITIAL_TEAM_COUNTS, tacticalTeamColors);

  function getTeamKitForTeam(team: "BLUE" | "RED"): TacticalTeamKitState {
    return team === "BLUE" ? tacticalTeamKits.A : tacticalTeamKits.B;
  }

  function setTeamKitForTeam(team: "BLUE" | "RED", nextTeamKit: TacticalTeamKitState): void {
    if (team === "BLUE") {
      tacticalTeamKits = {
        ...tacticalTeamKits,
        A: nextTeamKit,
      };
      return;
    }
    tacticalTeamKits = {
      ...tacticalTeamKits,
      B: nextTeamKit,
    };
  }

  function teamKitToPlayerKitFields(teamKit: TacticalTeamKitState): TacticalPlayerKitFields {
    return {
      kitBaseColor: teamKit.primaryColor,
      kitPattern: teamKit.pattern,
      kitPatternColor: teamKit.secondaryColor,
    };
  }

  function syncPlayerKitFromTeamKit(player: TacticalPlayer): void {
    if (surfaceVariant !== "tactical") return;
    const teamKit = getTeamKitForTeam(player.team);
    const kitFields = teamKitToPlayerKitFields(teamKit);
    player.kitBaseColor = kitFields.kitBaseColor;
    player.kitPattern = kitFields.kitPattern;
    player.kitPatternColor = kitFields.kitPatternColor;
  }

  function rerenderAllTacticalPlayersOnTeam(team: "BLUE" | "RED"): void {
    if (surfaceVariant !== "tactical") return;
    for (const teammate of players) {
      if (teammate.team !== team) continue;
      syncPlayerKitFromTeamKit(teammate);
      rerenderTacticalPlayerToken(teammate);
    }
  }

  function rerenderAllTacticalPlayers(): void {
    if (surfaceVariant !== "tactical") return;
    for (const tacticalPlayer of players) {
      rerenderTacticalPlayerToken(tacticalPlayer);
    }
  }

  function getGoalkeeperKitOverride(player: Pick<TacticalPlayer, "team" | "number">):
    | { baseColor: TacticalKitColor; patternColor: TacticalKitColor }
    | null {
    if (player.number !== 1) return null;
    return GOALKEEPER_KIT_OVERRIDE_BY_TEAM[player.team];
  }

  function getEffectiveKitBaseColor(
    player: Pick<TacticalPlayer, "team" | "teamColor" | "kitBaseColor" | "number">,
  ): TacticalKitColor {
    const goalkeeperOverride = getGoalkeeperKitOverride(player);
    if (goalkeeperOverride) {
      return goalkeeperOverride.baseColor;
    }
    const fallbackColor =
      surfaceVariant === "tactical" ? getTeamKitForTeam(player.team).primaryColor : player.teamColor;
    return sanitizeKitColor(player.kitBaseColor) ?? fallbackColor;
  }

  function getEffectiveKitPattern(player: Pick<TacticalPlayer, "team" | "kitPattern">): TacticalKitPattern {
    const fallbackPattern = surfaceVariant === "tactical" ? getTeamKitForTeam(player.team).pattern : "plain";
    return sanitizeKitPattern(player.kitPattern) ?? fallbackPattern;
  }

  function getEffectiveKitPatternColor(
    player: Pick<TacticalPlayer, "team" | "kitPatternColor" | "kitBaseColor" | "teamColor" | "number">,
  ): TacticalKitColor {
    const goalkeeperOverride = getGoalkeeperKitOverride(player);
    if (goalkeeperOverride) {
      return goalkeeperOverride.patternColor;
    }
    const baseColor = getEffectiveKitBaseColor(player);
    if (surfaceVariant === "tactical") {
      return sanitizeKitColor(player.kitPatternColor) ?? getTeamKitForTeam(player.team).secondaryColor;
    }
    return sanitizeKitColor(player.kitPatternColor) ?? defaultKitPatternColor(baseColor);
  }

  function resolvePlayerLabel(player: Pick<TacticalPlayer, "number" | "labelMode" | "initials">): string {
    const labelMode = sanitizeLabelMode(player.labelMode) ?? "number";
    const initials = sanitizeInitials(player.initials);
    if (labelMode === "initials" && initials) {
      return initials;
    }
    return safePlayerNumberLabel(player.number);
  }

  function createTokenPackForPlayer(player: Pick<TacticalPlayer, "number" | "team" | "teamColor" | "kitBaseColor" | "kitPattern" | "kitPatternColor" | "labelMode" | "initials">): {
    token: Container;
    shadow: Graphics;
  } {
    if (surfaceVariant !== "tactical") {
      return createPremiumPlayerToken({
        color: player.teamColor,
        number: player.number,
        radius: PLAYER_RADIUS,
      });
    }
    const baseColor = getEffectiveKitBaseColor(player);
    const pattern = getEffectiveKitPattern(player);
    const patternColor = getEffectiveKitPatternColor(player);
    const label = resolvePlayerLabel(player);
    const renderToken = resolvePlayerTokenRenderer(tacticalTokenStyle);
    return renderToken({
      label,
      number: player.number,
      teamColor: player.teamColor,
      radius: PLAYER_RADIUS * TACTICAL_PLAYER_VISUAL_SCALE,
      scale: (PLAYER_RADIUS / 4.1) * TACTICAL_PLAYER_VISUAL_SCALE,
      style: {
        primaryColor: KIT_COLOR_NUMERIC[baseColor],
        secondaryColor: KIT_COLOR_NUMERIC[baseColor],
        badgeColor: KIT_COLOR_NUMERIC[baseColor],
      },
      kitPattern: pattern,
      kitPatternColor: KIT_COLOR_NUMERIC[patternColor],
    });
  }

  function createSurfacePlayer(base: PlayerSeed, kitFields?: TacticalPlayerKitFields): TacticalPlayer {
    const tokenColor: PremiumPlayerTokenColor = base.color;
    const canonicalTeamKit = surfaceVariant === "tactical" ? getTeamKitForTeam(base.team) : null;
    const seedKitFields: TacticalPlayerKitFields = {
      kitBaseColor: sanitizeKitColor(base.kitBaseColor),
      kitPattern: sanitizeKitPattern(base.kitPattern),
      kitPatternColor: sanitizeKitColor(base.kitPatternColor),
    };
    const fallbackTeamKitFields = canonicalTeamKit == null ? {} : teamKitToPlayerKitFields(canonicalTeamKit);
    const nextKitFields: TacticalPlayerKitFields =
      canonicalTeamKit == null
        ? {
            ...seedKitFields,
            ...(kitFields ?? {}),
          }
        : {
            ...fallbackTeamKitFields,
            ...seedKitFields,
            ...(kitFields ?? {}),
          };
    const tokenPack = createTokenPackForPlayer({
      number: base.number,
      team: base.team,
      teamColor: tokenColor,
      ...nextKitFields,
    });
    const { token, shadow } = tokenPack;
    playersLayer.addChild(token);
    return {
      id: base.id,
      number: base.number,
      team: base.team,
      teamColor: tokenColor,
      current: { ...base.position },
      token,
      tokenShadow: shadow,
      dragScaleTarget: PREMIUM_TOKEN_IDLE_SCALE,
      dragShadowAlphaTarget: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA,
      kitBaseColor: sanitizeKitColor(nextKitFields.kitBaseColor),
      kitPattern: sanitizeKitPattern(nextKitFields.kitPattern),
      kitPatternColor: sanitizeKitColor(nextKitFields.kitPatternColor),
      labelMode: sanitizeLabelMode(nextKitFields.labelMode),
      initials: sanitizeInitials(nextKitFields.initials),
    };
  }

  const players: TacticalPlayer[] = playerSeeds.map((seed) => createSurfacePlayer(seed));

  const PLAY_DURATION_MS = 1200;
  let playbackSpeedMultiplier = DEFAULT_PLAYBACK_SPEED_MULTIPLIER;
  let isPlaying = false;
  let isPaused = false;
  let playElapsedMs = 0;
  let playbackPath: PhaseSnapshot[] = [];
  let activeSegmentIndex = 0;
  let playbackKind: PlaybackKind = "default";
  let playbackPossessionReceiverId: string | null = null;
  let singlePlayTargetSnapshot: PhaseSnapshot | null = null;
  let startPositions: PhaseSnapshot = {
    players: players.map((player) => ({ ...player.current })),
    football: [],
  };
  let phases: PhaseSnapshot[] = [];
  let selectedPlayerId: string | null = null;
  let isRouteCaptureMode = false;
  let routeByPlayerId = new Map<string, RoutePoint[]>();
  let activeRouteRunsByPlayerId = new Map<string, ActiveBasicRouteFollow>();
  let routeControlledPlayerIds = new Set<string>();
  let currentRouteDraftPoints: RoutePoint[] = [];
  let currentRouteDraftPlayerId: string | null = null;
  let routeCapturePointerId: number | null = null;
  let isPossessionPassModeEnabled = false;

  let activeDrag: ActiveDragState = null;
  let selectedItemId: string | null = null;
  let itemMode: ItemMode = "locked";
  const isWhiteboardSurface = surfaceVariant === "whiteboard";
  const isDrawingEnabledSurface = surfaceVariant === "whiteboard" || surfaceVariant === "tactical";
  let activeWhiteboardTool: WhiteboardDrawTool = "move";
  let activeWhiteboardColor = options.whiteboardDrawColor ?? WHITEBOARD_DEFAULT_STROKE_COLOR;
  const tacticalItems: TacticalSurfaceItem[] = [];
  const ballStatesByItemId = new Map<string, BallRuntimeState>();
  const itemSelectionLayer = new Container();
  itemSelectionLayer.eventMode = "none";
  world.addChild(itemSelectionLayer);
  let whiteboardDrawingCounter = 0;
  const tacticalDrawingController = createTacticalDrawingController({
    drawingsLayer: whiteboardDrawingsLayer,
    previewGraphic: whiteboardPreviewGraphic,
    mapperProvider: () => mapper,
    initialTool: "move",
    initialColor: activeWhiteboardColor,
    createDrawingId: () => {
      whiteboardDrawingCounter += 1;
      return `qb-drawing-${whiteboardDrawingCounter}`;
    },
  });
  let lastTappedPlayer: { playerId: string; atMs: number } | null = null;

  function emitPlaybackStateChange(): void {
    syncWhiteboardTokenInputMode();
    options.onPlaybackStateChange?.({ isPlaying, isPaused });
  }

  function emitRouteStateChange(): void {
    options.onRouteStateChange?.({
      isRouteCaptureMode,
      routeCount: routeByPlayerId.size,
      maxRoutes: MAX_BASIC_ROUTE_PLAYERS,
    });
  }

  function isPlaybackInputLocked(): boolean {
    return isPlaying || isPaused;
  }

  function isMatchingActivePointer(event: unknown): boolean {
    if (!activeDrag || activeDrag.pointerId == null) return true;
    const pointerId = getPointerIdFromEvent(event);
    if (pointerId == null) return true;
    return pointerId === activeDrag.pointerId;
  }

  function getClientPointFromEvent(event: unknown): { x: number; y: number } | null {
    const nativeEvent = (event as { nativeEvent?: { clientX?: unknown; clientY?: unknown } }).nativeEvent;
    if (nativeEvent && typeof nativeEvent.clientX === "number" && typeof nativeEvent.clientY === "number") {
      return { x: nativeEvent.clientX, y: nativeEvent.clientY };
    }
    const stagePoint = getStagePointFromEvent(event, app.stage);
    if (!stagePoint) return null;
    const bounds = (app.canvas as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: bounds.left + stagePoint.x,
      y: bounds.top + stagePoint.y,
    };
  }

  function fitToHost(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    app.renderer.resolution = Math.min(2, window.devicePixelRatio || 1);
    app.renderer.resize(width, height);

    mapper = createWorldViewport(WORLD_SIZE, { width, height });
    world.scale.set(mapper.transform.scale, mapper.transform.scale);
    world.position.set(mapper.transform.offsetX, mapper.transform.offsetY);

    for (const player of players) {
      setPlayerTouchHitArea(player, mapper);
      setTokenWorldPositionForPoint(player, player.current, mapper);
    }
    for (const item of tacticalItems) {
      setItemTouchHitArea(item, mapper);
    }
    renderTacticalItems();
    renderAllWhiteboardDrawings();
    renderBasicRoutePreview();
    renderPlayerOriginGraphic();
  }

  function isItemInteractionEnabled(): boolean {
    return (
      surfaceVariant === "tactical" &&
      itemMode === "edit" &&
      activeWhiteboardTool === "move" &&
      !isPlaybackInputLocked()
    );
  }

  function getBallRuntimeState(item: Pick<TacticalItem, "id" | "x" | "y">): BallRuntimeState {
    const existing = ballStatesByItemId.get(item.id);
    if (existing) return existing;
    const created: BallRuntimeState = {
      attachedPlayerId: null,
      isFree: true,
      path: [{ x: clampNormalizedValue(item.x), y: clampNormalizedValue(item.y) }],
    };
    ballStatesByItemId.set(item.id, created);
    return created;
  }

  function syncTacticalItemRenderLayer(item: TacticalSurfaceItem): void {
    const targetLayer = isBallItem(item) ? ballLayer : itemsLayer;
    if (item.graphic.parent !== targetLayer) {
      targetLayer.addChild(item.graphic);
    }
  }

  function getAttachedBallPositionForPlayer(player: TacticalPlayer): NormalizedPoint {
    const playerWorld = mapper.normalizedToWorld(player.current);
    for (const offset of ATTACHED_BALL_OFFSETS_WORLD) {
      const worldPoint = {
        x: playerWorld.x + offset.x,
        y: playerWorld.y + offset.y,
      };
      if (
        worldPoint.x >= 0 &&
        worldPoint.x <= WORLD_SIZE.width &&
        worldPoint.y >= 0 &&
        worldPoint.y <= WORLD_SIZE.height
      ) {
        const normalized = mapper.worldToNormalized(worldPoint);
        return {
          x: clampNormalizedValue(normalized.x),
          y: clampNormalizedValue(normalized.y),
        };
      }
    }

    const fallbackOffset = ATTACHED_BALL_OFFSETS_WORLD[0] ?? { x: 6.4, y: -5.4 };
    const boundedWorld = {
      x: clampWorld(playerWorld.x + fallbackOffset.x, WORLD_SIZE.width),
      y: clampWorld(playerWorld.y + fallbackOffset.y, WORLD_SIZE.height),
    };
    const normalized = mapper.worldToNormalized(boundedWorld);
    return {
      x: clampNormalizedValue(normalized.x),
      y: clampNormalizedValue(normalized.y),
    };
  }

  function getAttachedBallPositionForPlayerId(playerId: string | null): NormalizedPoint | null {
    if (!playerId) return null;
    const player = players.find((entry) => entry.id === playerId);
    if (!player) return null;
    return getAttachedBallPositionForPlayer(player);
  }

  function applyBallRuntimeStateToItem(item: TacticalSurfaceItem): void {
    if (!isBallItem(item)) return;
    const state = getBallRuntimeState(item);
    if (state.isFree) return;
    const attachedPoint = getAttachedBallPositionForPlayerId(state.attachedPlayerId);
    if (!attachedPoint) {
      state.attachedPlayerId = null;
      state.isFree = true;
      state.path = [{ x: clampNormalizedValue(item.x), y: clampNormalizedValue(item.y) }];
      return;
    }
    item.x = attachedPoint.x;
    item.y = attachedPoint.y;
  }

  function resetBallMovementPath(item: TacticalSurfaceItem): void {
    if (!isBallItem(item)) return;
    const state = getBallRuntimeState(item);
    state.path = [{ x: clampNormalizedValue(item.x), y: clampNormalizedValue(item.y) }];
  }

  function resetAllBallMovementPaths(): void {
    for (const item of tacticalItems) {
      if (!isBallItem(item)) continue;
      applyBallRuntimeStateToItem(item);
      resetBallMovementPath(item);
    }
  }

  function appendBallMovementPathPoint(item: TacticalSurfaceItem): void {
    if (!isBallItem(item)) return;
    const state = getBallRuntimeState(item);
    if (!state.isFree) return;
    const nextPoint = {
      x: clampNormalizedValue(item.x),
      y: clampNormalizedValue(item.y),
    };
    const lastPoint = state.path[state.path.length - 1];
    if (
      lastPoint &&
      Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) < BALL_PATH_MIN_POINT_DISTANCE
    ) {
      state.path[state.path.length - 1] = nextPoint;
      return;
    }
    state.path.push(nextPoint);
  }

  function findPrimaryBallItem(): TacticalSurfaceItem | null {
    if (selectedItemId) {
      const selectedItem = findTacticalItemById(selectedItemId);
      if (selectedItem && isBallItem(selectedItem)) return selectedItem;
    }
    return tacticalItems.find((item) => isBallItem(item)) ?? null;
  }

  function detachPrimaryBall(): void {
    if (surfaceVariant !== "tactical" || isPlaybackInputLocked()) return;
    const ball = findPrimaryBallItem();
    if (!ball) return;
    applyBallRuntimeStateToItem(ball);
    const state = getBallRuntimeState(ball);
    state.attachedPlayerId = null;
    state.isFree = true;
    state.path = [{ x: clampNormalizedValue(ball.x), y: clampNormalizedValue(ball.y) }];
    setItemWorldPosition(ball, mapper);
    renderTacticalItems();
    syncWhiteboardTokenInputMode();
  }

  function attachPrimaryBallToPlayer(player: TacticalPlayer): void {
    if (surfaceVariant !== "tactical" || isPlaybackInputLocked()) return;
    const ball = findPrimaryBallItem();
    if (!ball) return;
    const attachedPoint = getAttachedBallPositionForPlayer(player);
    const state = getBallRuntimeState(ball);
    state.attachedPlayerId = player.id;
    state.isFree = false;
    state.path = [];
    ball.x = attachedPoint.x;
    ball.y = attachedPoint.y;
    selectedItemId = null;
    setItemWorldPosition(ball, mapper);
    renderTacticalItems();
    syncWhiteboardTokenInputMode();
  }

  function handlePossessionPassTap(player: TacticalPlayer): void {
    if (surfaceVariant !== "tactical" || isPlaybackInputLocked()) return;
    const ball = findPrimaryBallItem();
    if (!ball) return;
    applyBallRuntimeStateToItem(ball);
    const state = getBallRuntimeState(ball);
    const currentHolderPlayerId = state.isFree ? null : state.attachedPlayerId;
    if (!currentHolderPlayerId || currentHolderPlayerId === player.id) {
      attachPrimaryBallToPlayer(player);
      return;
    }

    const receiverAttachedPoint = getAttachedBallPositionForPlayer(player);
    const passStartSnapshot = captureCurrentSnapshot();
    const passTargetSnapshot = cloneSnapshot(passStartSnapshot);
    const passTargetBall = passTargetSnapshot.football.find((entry) => entry.id === ball.id);
    if (!passTargetBall) {
      attachPrimaryBallToPlayer(player);
      return;
    }
    const passStartPoint = {
      x: clampNormalizedValue(ball.x),
      y: clampNormalizedValue(ball.y),
    };
    const passTargetPoint = {
      x: clampNormalizedValue(receiverAttachedPoint.x),
      y: clampNormalizedValue(receiverAttachedPoint.y),
    };
    passTargetBall.x = passTargetPoint.x;
    passTargetBall.y = passTargetPoint.y;
    passTargetBall.attachedPlayerId = null;
    passTargetBall.isFree = true;
    passTargetBall.path = [passStartPoint, passTargetPoint];
    startPlayback([passStartSnapshot, passTargetSnapshot], {
      suppressRoutePlayback: true,
      kind: "possession-pass",
      possessionReceiverId: player.id,
    });
  }

  function updateAttachedBallsForPlayer(playerId: string): void {
    for (const item of tacticalItems) {
      if (!isBallItem(item)) continue;
      const state = getBallRuntimeState(item);
      if (state.isFree || state.attachedPlayerId !== playerId) continue;
      applyBallRuntimeStateToItem(item);
      setItemWorldPosition(item, mapper);
    }
  }

  function isFreeBallInteractionEnabled(item: TacticalSurfaceItem): boolean {
    if (!isBallItem(item)) return false;
    const state = getBallRuntimeState(item);
    return (
      surfaceVariant === "tactical" &&
      state.isFree &&
      activeWhiteboardTool === "move" &&
      !isPlaybackInputLocked()
    );
  }

  function canInteractWithTacticalItem(item: TacticalSurfaceItem): boolean {
    if (isBallItem(item)) {
      return isFreeBallInteractionEnabled(item);
    }
    return isItemInteractionEnabled();
  }

  function updateDraggedPlayerFromEvent(event: unknown): void {
    if (!activeDrag || activeDrag.type !== "player" || isPlaybackInputLocked()) return;
    const activePlayerId = activeDrag.playerId;
    if (activeWhiteboardTool !== "move") return;
    if (!isMatchingActivePointer(event)) return;

    const stagePoint = getStagePointFromEvent(event, app.stage);
    if (!stagePoint) return;
    if (!hasExceededDragThreshold(event, activeDrag)) return;
    if (!activeDrag.hasCrossedThreshold) {
      activeDrag.hasCrossedThreshold = true;
      const dragPlayer = players.find((player) => player.id === activePlayerId);
      if (dragPlayer) {
        setPlayerDragVisualTarget(dragPlayer, true);
      }
      syncWhiteboardTokenInputMode();
      renderPlayerOriginGraphic();
    }

    const worldPoint = mapper.viewportToWorld({ x: stagePoint.x, y: stagePoint.y });
    const boundedWorld = {
      x: clampWorld(worldPoint.x, WORLD_SIZE.width),
      y: clampWorld(worldPoint.y, WORLD_SIZE.height),
    };

    const normalized = mapper.worldToNormalized(boundedWorld);
    const dragPlayer = players.find((player) => player.id === activePlayerId);
    if (!dragPlayer) {
      activeDrag = null;
      clearPlayerOriginGraphic();
      return;
    }
    dragPlayer.current = {
      x: Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, normalized.x)),
      y: Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, normalized.y)),
    };
    setTokenWorldPositionForPoint(dragPlayer, dragPlayer.current, mapper);
    updateAttachedBallsForPlayer(dragPlayer.id);
    renderPlayerOriginGraphic();
  }

  function syncWhiteboardTokenInputMode(): void {
    if (!isDrawingEnabledSurface) return;
    const canInteractItems = isItemInteractionEnabled();
    const isDrawingInteractionActive = (activeWhiteboardTool !== "move" || isRouteCaptureMode) && !isPlaybackInputLocked();
    let draggingItemId: string | null = null;
    let draggingPlayerId: string | null = null;
    if (activeDrag && activeDrag.type === "item" && activeDrag.hasCrossedThreshold) {
      draggingItemId = activeDrag.itemId;
    }
    if (activeDrag && activeDrag.type === "player" && activeDrag.hasCrossedThreshold) {
      draggingPlayerId = activeDrag.playerId;
    }
    for (const item of tacticalItems) {
      const isCurrentItemDragging = draggingItemId === item.id;
      const canInteractWithItem = canInteractWithTacticalItem(item);
      item.graphic.eventMode = canInteractWithItem ? "static" : "none";
      item.graphic.cursor = isCurrentItemDragging ? "grabbing" : canInteractWithItem ? "grab" : "default";
    }
    if (!canInteractItems && selectedItemId !== null) {
      selectedItemId = null;
      renderTacticalItems();
    }
    const canDragPlayers =
      activeWhiteboardTool === "move" &&
      !isPlaybackInputLocked() &&
      !isRouteCaptureMode &&
      activeRouteRunsByPlayerId.size <= 0;
    const canSelectRoutePlayers = surfaceVariant === "tactical" && isRouteCaptureMode && !isPlaybackInputLocked();
    for (const player of players) {
      const isCurrentPlayerDragging = draggingPlayerId === player.id;
      player.token.eventMode = canDragPlayers || canSelectRoutePlayers ? "static" : "none";
      player.token.cursor = isCurrentPlayerDragging
        ? "grabbing"
        : canDragPlayers
          ? "grab"
          : canSelectRoutePlayers
            ? "pointer"
            : "default";
    }
    whiteboardInputLayer.eventMode = isDrawingInteractionActive ? "static" : "none";
    whiteboardInputLayer.cursor =
      isRouteCaptureMode || activeWhiteboardTool !== "eraser" ? "crosshair" : "not-allowed";
  }

  function clearPlayerOriginGraphic(): void {
    playerOriginGraphic.clear();
  }

  function getCurrentPhaseStartSnapshot(): PhaseSnapshot {
    const latestPhase = phases[phases.length - 1];
    return latestPhase ?? startPositions;
  }

  function getPhaseStartPositionForPlayer(playerId: string): NormalizedPoint | null {
    const playerIndex = players.findIndex((player) => player.id === playerId);
    if (playerIndex < 0) return null;
    const phaseStartSnapshot = getCurrentPhaseStartSnapshot();
    const phaseStartPoint = phaseStartSnapshot.players[playerIndex];
    if (!phaseStartPoint) return null;
    return {
      x: clampNormalizedValue(phaseStartPoint.x),
      y: clampNormalizedValue(phaseStartPoint.y),
    };
  }

  function renderPlayerOriginGraphic(): void {
    clearPlayerOriginGraphic();
    const dragState = activeDrag;
    if (!dragState || dragState.type !== "player") return;
    if (isPlaybackInputLocked()) return;
    if (!dragState.hasCrossedThreshold) return;
    const draggedPlayer = players.find((player) => player.id === dragState.playerId);
    if (!draggedPlayer) return;
    const phaseStartPoint = getPhaseStartPositionForPlayer(dragState.playerId);
    if (!phaseStartPoint) return;
    const startWorld = mapper.normalizedToWorld(phaseStartPoint);
    const currentWorld = mapper.normalizedToWorld(draggedPlayer.current);
    const travelDistance = Math.hypot(currentWorld.x - startWorld.x, currentWorld.y - startWorld.y);
    if (travelDistance < 0.24) return;
    const lineColor = PLAYER_ORIGIN_LINE_COLOR_BY_TEAM[draggedPlayer.teamColor] ?? 0x94a3b8;
    playerOriginGraphic
      .moveTo(startWorld.x, startWorld.y)
      .lineTo(currentWorld.x, currentWorld.y)
      .stroke({
        color: lineColor,
        alpha: 0.18,
        width: 0.84,
        cap: "round",
        join: "round",
        alignment: 0.5,
      })
      .moveTo(startWorld.x, startWorld.y)
      .lineTo(currentWorld.x, currentWorld.y)
      .stroke({
        color: lineColor,
        alpha: 0.42,
        width: 0.34,
        cap: "round",
        join: "round",
        alignment: 0.5,
      })
      .circle(startWorld.x, startWorld.y, 0.6)
      .fill({ color: lineColor, alpha: 0.14 })
      .stroke({
        color: lineColor,
        alpha: 0.46,
        width: 0.16,
        alignment: 0.5,
      });
  }

  function getBoundedWorldPointFromEvent(event: unknown): { x: number; y: number } | null {
    const stagePoint = getStagePointFromEvent(event, app.stage);
    if (!stagePoint) return null;
    const worldPoint = mapper.viewportToWorld({ x: stagePoint.x, y: stagePoint.y });
    return {
      x: clampWorld(worldPoint.x, WORLD_SIZE.width),
      y: clampWorld(worldPoint.y, WORLD_SIZE.height),
    };
  }

  function getBoundedNormalizedPointFromEvent(event: unknown): NormalizedPoint | null {
    const worldPoint = getBoundedWorldPointFromEvent(event);
    if (!worldPoint) return null;
    const normalized = mapper.worldToNormalized(worldPoint);
    return {
      x: clampNormalizedValue(normalized.x),
      y: clampNormalizedValue(normalized.y),
    };
  }

  function setItemWorldPosition(
    item: Pick<TacticalSurfaceItem, "x" | "y" | "rotation" | "scale" | "graphic" | "selectionGraphic">,
    itemMapper: ReturnType<typeof createWorldViewport>,
  ): void {
    const worldPoint = itemMapper.normalizedToWorld({ x: item.x, y: item.y });
    item.graphic.position.set(worldPoint.x, worldPoint.y);
    item.selectionGraphic.position.set(worldPoint.x, worldPoint.y);
    item.graphic.rotation = item.rotation ?? 0;
    item.graphic.scale.set(item.scale ?? 1);
    item.selectionGraphic.rotation = item.rotation ?? 0;
    item.selectionGraphic.scale.set(item.scale ?? 1);
  }

  function findTacticalItemById(itemId: string): TacticalSurfaceItem | null {
    return tacticalItems.find((item) => item.id === itemId) ?? null;
  }

  function clampStrokeWidth(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function drawBallGroundingShadows(
    graphic: Graphics,
    radius: number,
    options: {
      castYOffset: number;
      castXScale: number;
      castYScale: number;
      castAlpha: number;
      contactYOffset: number;
      contactXScale: number;
      contactYScale: number;
      contactAlpha: number;
    },
  ): void {
    graphic
      .ellipse(0, radius * options.castYOffset, radius * options.castXScale, radius * options.castYScale)
      .fill({ color: 0x020617, alpha: options.castAlpha });
    graphic
      .ellipse(0, radius * options.contactYOffset, radius * options.contactXScale, radius * options.contactYScale)
      .fill({ color: 0x020617, alpha: options.contactAlpha });
  }

  // Custom in-house renderer inspired by real GAA football characteristics.
  // This is procedural tactical artwork and does not copy branded ball graphics.
  function drawPremiumFootball(graphic: Graphics, radius: number): void {
    const shellStroke = clampStrokeWidth(radius * 0.12, 0.2, 0.34);
    const panelBandStroke = clampStrokeWidth(radius * 0.12, 0.19, 0.28);
    const seamStroke = clampStrokeWidth(radius * 0.1, 0.17, 0.24);

    drawBallGroundingShadows(graphic, radius, {
      castYOffset: 0.6,
      castXScale: 1.06,
      castYScale: 0.36,
      castAlpha: 0.12,
      contactYOffset: 0.84,
      contactXScale: 0.78,
      contactYScale: 0.23,
      contactAlpha: 0.2,
    });

    // Experiment: token-material-inspired tonal confidence with football panel identity.
    graphic
      .circle(0, 0, radius)
      .fill(0xaab3bb)
      .circle(0, -radius * 0.015, radius * 0.92)
      .fill(0xf5f4ee)
      .stroke({ color: 0x69747e, width: shellStroke, alpha: 0.88, alignment: 0.5 });

    graphic
      .ellipse(radius * 0.03, radius * 0.53, radius * 0.76, radius * 0.34)
      .fill({ color: 0x6c7781, alpha: 0.19 });
    graphic
      .ellipse(-radius * 0.32, -radius * 0.35, radius * 0.48, radius * 0.27)
      .fill({ color: 0xffffff, alpha: 0.45 });
    graphic
      .ellipse(-radius * 0.1, -radius * 0.56, radius * 0.24, radius * 0.1)
      .fill({ color: 0xffffff, alpha: 0.22 });

    // Subtle tonal hoop/panel cues (low contrast) for premium tactical abstraction.
    graphic
      .arc(0, 0, radius * 0.69, Math.PI * 0.22, Math.PI * 0.78)
      .stroke({ color: 0x7b8792, width: panelBandStroke, alpha: 0.34, cap: "round", join: "round" });
    graphic
      .arc(0, 0, radius * 0.69, Math.PI * 1.22, Math.PI * 1.78)
      .stroke({ color: 0x7b8792, width: panelBandStroke, alpha: 0.34, cap: "round", join: "round" });

    const panelRidgeStroke = clampStrokeWidth(panelBandStroke * 0.42, 0.12, 0.18);
    graphic
      .arc(0, 0, radius * 0.69, Math.PI * 0.24, Math.PI * 0.76)
      .stroke({ color: 0xf7f8f8, width: panelRidgeStroke, alpha: 0.22, cap: "round", join: "round" });
    graphic
      .arc(0, 0, radius * 0.69, Math.PI * 1.24, Math.PI * 1.76)
      .stroke({ color: 0xf7f8f8, width: panelRidgeStroke, alpha: 0.22, cap: "round", join: "round" });

    graphic
      .moveTo(-radius * 0.61, -radius * 0.03)
      .lineTo(-radius * 0.23, radius * 0.03)
      .moveTo(radius * 0.61, -radius * 0.03)
      .lineTo(radius * 0.23, radius * 0.03)
      .stroke({ color: 0x6f7c87, width: seamStroke, alpha: 0.42, cap: "round", join: "round" });
    graphic
      .moveTo(0, -radius * 0.56)
      .lineTo(0, -radius * 0.29)
      .moveTo(0, radius * 0.29)
      .lineTo(0, radius * 0.56)
      .stroke({ color: 0x6f7c87, width: seamStroke, alpha: 0.3, cap: "round", join: "round" });
  }

  // Custom in-house renderer inspired by real sliotar seam/ridge behavior.
  // This remains original tactical artwork and does not copy branded assets.
  function drawPremiumSliotar(graphic: Graphics, radius: number): void {
    const shellStroke = clampStrokeWidth(radius * 0.14, 0.21, 0.34);
    const seamBandStroke = clampStrokeWidth(radius * 0.17, 0.2, 0.32);

    drawBallGroundingShadows(graphic, radius, {
      castYOffset: 0.57,
      castXScale: 0.92,
      castYScale: 0.31,
      castAlpha: 0.12,
      contactYOffset: 0.79,
      contactXScale: 0.66,
      contactYScale: 0.2,
      contactAlpha: 0.2,
    });

    graphic
      .circle(0, 0, radius)
      .fill(0xca8a04)
      .circle(0, -radius * 0.01, radius * 0.91)
      .fill(0xfacc15)
      .stroke({ color: 0x6d5a1f, width: shellStroke, alpha: 0.92, alignment: 0.5 });
    graphic
      .ellipse(radius * 0.04, radius * 0.52, radius * 0.68, radius * 0.33)
      .fill({ color: 0x9b7a1e, alpha: 0.22 });
    graphic
      .ellipse(-radius * 0.3, -radius * 0.34, radius * 0.42, radius * 0.25)
      .fill({ color: 0xfff4b0, alpha: 0.5 });
    graphic
      .ellipse(-radius * 0.1, -radius * 0.55, radius * 0.21, radius * 0.1)
      .fill({ color: 0xfff8cc, alpha: 0.24 });

    // Two readable curved seam bands are the key sliotar identity cue at tactical scale.
    graphic
      .moveTo(-radius * 0.82, -radius * 0.17)
      .quadraticCurveTo(0, -radius * 0.75, radius * 0.82, radius * 0.04)
      .stroke({ color: 0x1f2937, width: seamBandStroke, alpha: 0.54, cap: "round", join: "round" });
    graphic
      .moveTo(-radius * 0.82, radius * 0.12)
      .quadraticCurveTo(0, -radius * 0.47, radius * 0.82, radius * 0.32)
      .stroke({ color: 0x1f2937, width: seamBandStroke, alpha: 0.5, cap: "round", join: "round" });

    const seamRidgeStroke = clampStrokeWidth(seamBandStroke * 0.34, 0.13, 0.2);
    graphic
      .moveTo(-radius * 0.82, -radius * 0.18)
      .quadraticCurveTo(0, -radius * 0.71, radius * 0.82, radius * 0.01)
      .stroke({ color: 0xfde68a, width: seamRidgeStroke, alpha: 0.25, cap: "round", join: "round" });
    graphic
      .moveTo(-radius * 0.82, radius * 0.1)
      .quadraticCurveTo(0, -radius * 0.44, radius * 0.82, radius * 0.28)
      .stroke({ color: 0xfde68a, width: seamRidgeStroke, alpha: 0.22, cap: "round", join: "round" });
  }

  function drawTacticalItemGraphic(graphic: Graphics, item: TacticalItem): void {
    graphic.clear();
    const shadowColor = 0x020617;
    if (item.type === "discCone") {
      graphic.ellipse(0, TACTICAL_ITEM_HALF_SIZE * 0.58, TACTICAL_ITEM_HALF_SIZE * 0.86, TACTICAL_ITEM_HALF_SIZE * 0.28).fill({ color: shadowColor, alpha: 0.14 });
      graphic.ellipse(0, 0, TACTICAL_ITEM_HALF_SIZE * 0.9, TACTICAL_ITEM_HALF_SIZE * 0.34).fill(0xfb923c).stroke({ color: 0xc2410c, width: 0.24 });
      return;
    }
    if (item.type === "cone") {
      graphic.ellipse(0, TACTICAL_ITEM_HALF_SIZE * 0.68, TACTICAL_ITEM_HALF_SIZE * 0.86, TACTICAL_ITEM_HALF_SIZE * 0.3).fill({ color: shadowColor, alpha: 0.16 });
      graphic
        .poly([
          -TACTICAL_ITEM_HALF_SIZE,
          TACTICAL_ITEM_HALF_SIZE,
          0,
          -TACTICAL_ITEM_HALF_SIZE,
          TACTICAL_ITEM_HALF_SIZE,
          TACTICAL_ITEM_HALF_SIZE,
        ])
        .fill(0xf59e0b)
        .stroke({ color: 0xb45309, width: 0.45 });
      return;
    }
    if (item.type === "pole") {
      graphic.ellipse(0, TACTICAL_ITEM_HALF_SIZE * 0.76, TACTICAL_ITEM_HALF_SIZE * 0.6, TACTICAL_ITEM_HALF_SIZE * 0.24).fill({ color: shadowColor, alpha: 0.16 });
      graphic
        .roundRect(-0.45, -TACTICAL_ITEM_HALF_SIZE, 0.9, TACTICAL_ITEM_HALF_SIZE * 2, 0.35)
        .fill(0xfde68a)
        .stroke({ color: 0x92400e, width: 0.32 });
      return;
    }
    if (item.type === "ladder") {
      const width = TACTICAL_ITEM_HALF_SIZE * 2.7;
      const height = TACTICAL_ITEM_HALF_SIZE * 1.35;
      const left = -width / 2;
      const top = -height / 2;
      graphic
        .roundRect(left, top, width, height, 0.28)
        .stroke({ color: 0x475569, width: 0.28 });
      const railInset = 0.42;
      const rungCount = 4;
      graphic
        .moveTo(left + railInset, top)
        .lineTo(left + railInset, top + height)
        .moveTo(left + width - railInset, top)
        .lineTo(left + width - railInset, top + height)
        .stroke({ color: 0x64748b, width: 0.26 });
      for (let rung = 1; rung <= rungCount; rung += 1) {
        const y = top + (height * rung) / (rungCount + 1);
        graphic
          .moveTo(left + railInset, y)
          .lineTo(left + width - railInset, y)
          .stroke({ color: 0x94a3b8, width: 0.24 });
      }
      graphic.ellipse(0, top + height + TACTICAL_ITEM_HALF_SIZE * 0.22, width * 0.34, TACTICAL_ITEM_HALF_SIZE * 0.2).fill({ color: shadowColor, alpha: 0.14 });
      return;
    }
    if (item.type === "hurdle") {
      const width = TACTICAL_ITEM_HALF_SIZE * 2.3;
      const height = TACTICAL_ITEM_HALF_SIZE * 1.3;
      graphic.ellipse(0, TACTICAL_ITEM_HALF_SIZE * 0.72, width * 0.35, TACTICAL_ITEM_HALF_SIZE * 0.22).fill({ color: shadowColor, alpha: 0.14 });
      graphic.roundRect(-width / 2, -height * 0.12, width, height * 0.22, 0.12).fill(0xef4444).stroke({ color: 0x991b1b, width: 0.2 });
      graphic.roundRect(-width / 2, -height * 0.12, width * 0.14, height, 0.1).fill(0xfca5a5).stroke({ color: 0x991b1b, width: 0.18 });
      graphic.roundRect(width / 2 - width * 0.14, -height * 0.12, width * 0.14, height, 0.1).fill(0xfca5a5).stroke({ color: 0x991b1b, width: 0.18 });
      return;
    }
    if (item.type === "tackleBag") {
      const width = TACTICAL_ITEM_HALF_SIZE * 2.2;
      const height = TACTICAL_ITEM_HALF_SIZE * 1.55;
      graphic
        .roundRect(-width / 2, -height / 2, width, height, 0.65)
        .fill(0x334155)
        .stroke({ color: 0x0f172a, width: 0.36 });
      return;
    }
    if (item.type === "miniGoal") {
      const width = TACTICAL_ITEM_HALF_SIZE * 2.8;
      const height = TACTICAL_ITEM_HALF_SIZE * 1.7;
      const postThickness = 0.26;
      const left = -width / 2;
      const top = -height * 0.4;
      graphic.ellipse(0, top + height + TACTICAL_ITEM_HALF_SIZE * 0.34, width * 0.4, TACTICAL_ITEM_HALF_SIZE * 0.24).fill({ color: shadowColor, alpha: 0.14 });
      graphic
        .roundRect(left, top, postThickness, height, 0.08)
        .fill(0xf8fafc)
        .stroke({ color: 0x64748b, width: 0.12 });
      graphic
        .roundRect(left + width - postThickness, top, postThickness, height, 0.08)
        .fill(0xf8fafc)
        .stroke({ color: 0x64748b, width: 0.12 });
      graphic
        .roundRect(left, top, width, postThickness, 0.08)
        .fill(0xf8fafc)
        .stroke({ color: 0x64748b, width: 0.12 });
      graphic
        .roundRect(left + postThickness * 1.2, top + postThickness * 1.8, width - postThickness * 2.4, height - postThickness * 2.2, 0.12)
        .stroke({ color: 0x94a3b8, width: 0.12, alpha: 0.9 });
      const netLines = 3;
      for (let i = 1; i <= netLines; i += 1) {
        const x = left + (width * i) / (netLines + 1);
        graphic
          .moveTo(x, top + postThickness)
          .lineTo(x, top + height)
          .stroke({ color: 0xcbd5e1, width: 0.1, alpha: 0.78 });
      }
      for (let i = 1; i <= 2; i += 1) {
        const y = top + postThickness + ((height - postThickness) * i) / 3;
        graphic
          .moveTo(left + postThickness, y)
          .lineTo(left + width - postThickness, y)
          .stroke({ color: 0xcbd5e1, width: 0.1, alpha: 0.72 });
      }
      return;
    }
    if (item.type === "mannequin") {
      const bodyWidth = TACTICAL_ITEM_HALF_SIZE * 1.18;
      const bodyHeight = TACTICAL_ITEM_HALF_SIZE * 2.35;
      const bodyTop = -bodyHeight * 0.5;
      const headRadius = TACTICAL_ITEM_HALF_SIZE * 0.28;
      graphic.ellipse(0, bodyTop + bodyHeight + TACTICAL_ITEM_HALF_SIZE * 0.3, bodyWidth * 0.64, TACTICAL_ITEM_HALF_SIZE * 0.22).fill({ color: shadowColor, alpha: 0.14 });
      graphic
        .circle(0, bodyTop + headRadius + 0.04, headRadius)
        .fill(0xf9fafb)
        .stroke({ color: 0x64748b, width: 0.13 });
      graphic
        .roundRect(-bodyWidth / 2, bodyTop + headRadius * 2.1, bodyWidth, bodyHeight - headRadius * 2.1, 0.24)
        .fill(0xf8fafc)
        .stroke({ color: 0x64748b, width: 0.14 });
      graphic
        .roundRect(-bodyWidth * 0.18, bodyTop + headRadius * 2.2, bodyWidth * 0.36, bodyHeight - headRadius * 2.35, 0.12)
        .fill({ color: 0x94a3b8, alpha: 0.26 });
      const sideInset = bodyWidth * 0.28;
      graphic
        .moveTo(-bodyWidth / 2 + sideInset, bodyTop + headRadius * 2.3)
        .lineTo(-bodyWidth / 2 + sideInset, bodyTop + bodyHeight * 0.95)
        .moveTo(bodyWidth / 2 - sideInset, bodyTop + headRadius * 2.3)
        .lineTo(bodyWidth / 2 - sideInset, bodyTop + bodyHeight * 0.95)
        .stroke({ color: 0x94a3b8, width: 0.11, alpha: 0.68 });
      graphic
        .roundRect(-bodyWidth * 0.62, bodyTop + bodyHeight - 0.12, bodyWidth * 1.24, 0.24, 0.08)
        .fill(0xcbd5e1)
        .stroke({ color: 0x64748b, width: 0.1 });
      return;
    }
    if (item.type === "footballSmall" || item.type === "football" || item.type === "footballLarge") {
      const radius = TACTICAL_ITEM_HALF_SIZE * (item.type === "footballSmall" ? 0.72 : item.type === "footballLarge" ? 1.12 : 0.9);
      drawPremiumFootball(graphic, radius);
      return;
    }
    if (item.type === "sliotarSmall" || item.type === "sliotar" || item.type === "sliotarLarge") {
      const radius = TACTICAL_ITEM_HALF_SIZE * (item.type === "sliotarSmall" ? 0.6 : item.type === "sliotarLarge" ? 0.9 : 0.74);
      drawPremiumSliotar(graphic, radius);
      return;
    }
  }

  function drawSelectedItemGraphic(graphic: Graphics, selected: boolean): void {
    graphic.clear();
    if (!selected) return;
    graphic
      .circle(0, 0, TACTICAL_ITEM_HALF_SIZE * 1.45)
      .stroke({ color: 0x7dd3fc, alpha: 0.92, width: 0.42 });
  }

  function renderTacticalItems(): void {
    if (surfaceVariant !== "tactical") return;
    for (const item of tacticalItems) {
      syncTacticalItemRenderLayer(item);
      applyBallRuntimeStateToItem(item);
      setItemWorldPosition(item, mapper);
      drawTacticalItemGraphic(item.graphic, item);
      drawSelectedItemGraphic(item.selectionGraphic, item.id === selectedItemId);
    }
  }

  function hasExceededDragThreshold(event: unknown, dragState: ActiveDragState): boolean {
    if (!dragState) return false;
    if (dragState.hasCrossedThreshold) return true;
    const startPoint = dragState.startStagePoint;
    if (!startPoint) return false;
    const stagePoint = getStagePointFromEvent(event, app.stage);
    if (!stagePoint) return false;
    const distance = Math.hypot(stagePoint.x - startPoint.x, stagePoint.y - startPoint.y);
    return distance >= TACTICAL_ITEM_DRAG_THRESHOLD_PX;
  }

  function beginItemDrag(item: TacticalSurfaceItem, event: unknown): void {
    if (!canInteractWithTacticalItem(item)) return;
    if (activeDrag) return;
    selectedItemId = item.id;
    const pointerId = getPointerIdFromEvent(event);
    const startStagePoint = getStagePointFromEvent(event, app.stage);
    const pointerNormalized = getBoundedNormalizedPointFromEvent(event);
    const pointerWorld = getBoundedWorldPointFromEvent(event);
    const itemWorld = mapper.normalizedToWorld(item);
    const dragOffset = pointerNormalized
      ? {
          x: item.x - pointerNormalized.x,
          y: item.y - pointerNormalized.y,
        }
      : { x: 0, y: 0 };
    const dragOffsetWorld = pointerWorld
      ? {
          x: itemWorld.x - pointerWorld.x,
          y: itemWorld.y - pointerWorld.y,
        }
      : { x: 0, y: 0 };
    activeDrag = {
      type: "item",
      itemId: item.id,
      dragOffset,
      dragOffsetWorld,
      lastAcceptedBallDragWorld: isBallItem(item) ? { x: itemWorld.x, y: itemWorld.y } : null,
      pointerId,
      startStagePoint,
      hasCrossedThreshold: false,
    };
    renderTacticalItems();
    syncWhiteboardTokenInputMode();
  }

  function bindTacticalItemPointerDown(item: TacticalSurfaceItem): void {
    item.graphic.on("pointerdown", (event) => {
      beginItemDrag(item, event);
    });
  }

  function clearSelectedItem(): void {
    if (selectedItemId == null) return;
    selectedItemId = null;
    renderTacticalItems();
  }

  function upsertTacticalItems(nextItems: TacticalItem[]): void {
    if (surfaceVariant !== "tactical") return;
    const normalizedNextItems = nextItems.map(normalizeTacticalItem);
    const nextIds = new Set(normalizedNextItems.map((item) => item.id));

    for (let index = tacticalItems.length - 1; index >= 0; index -= 1) {
      const item = tacticalItems[index];
      if (!item || nextIds.has(item.id)) continue;
      item.graphic.removeAllListeners();
      item.graphic.destroy();
      item.selectionGraphic.destroy();
      ballStatesByItemId.delete(item.id);
      tacticalItems.splice(index, 1);
      if (selectedItemId === item.id) {
        selectedItemId = null;
      }
      if (activeDrag && activeDrag.type === "item" && activeDrag.itemId === item.id) {
        activeDrag = null;
      }
    }

    for (const nextItem of normalizedNextItems) {
      const existingItem = findTacticalItemById(nextItem.id);
      if (existingItem) {
        existingItem.type = nextItem.type;
        existingItem.x = nextItem.x;
        existingItem.y = nextItem.y;
        syncTacticalItemRenderLayer(existingItem);
        if (isBallItem(existingItem)) {
          getBallRuntimeState(existingItem);
        } else {
          ballStatesByItemId.delete(existingItem.id);
        }
        continue;
      }
      const graphic = new Graphics();
      graphic.eventMode = "none";
      const targetLayer = isBallItem(nextItem) ? ballLayer : itemsLayer;
      targetLayer.addChild(graphic);
      const selectionGraphic = new Graphics();
      selectionGraphic.eventMode = "none";
      itemSelectionLayer.addChild(selectionGraphic);
      const createdItem: TacticalSurfaceItem = {
        ...nextItem,
        graphic,
        selectionGraphic,
      };
      if (isBallItem(createdItem)) {
        getBallRuntimeState(createdItem);
      }
      setItemTouchHitArea(createdItem, mapper);
      bindTacticalItemPointerDown(createdItem);
      tacticalItems.push(createdItem);
    }

    renderTacticalItems();
    syncWhiteboardTokenInputMode();
  }

  function updateDraggedItemFromEvent(event: unknown): void {
    if (!activeDrag || activeDrag.type !== "item") return;
    if (!isMatchingActivePointer(event)) return;
    const itemId = activeDrag.itemId;
    const item = findTacticalItemById(itemId);
    if (!item) {
      activeDrag = null;
      return;
    }
    if (!canInteractWithTacticalItem(item)) return;
    if (!hasExceededDragThreshold(event, activeDrag)) return;
    activeDrag.hasCrossedThreshold = true;
    let normalized: NormalizedPoint;
    if (isBallItem(item)) {
      const pointerWorld = getBoundedWorldPointFromEvent(event);
      if (!pointerWorld) return;
      const targetWorld = {
        x: clampWorld(pointerWorld.x + activeDrag.dragOffsetWorld.x, WORLD_SIZE.width),
        y: clampWorld(pointerWorld.y + activeDrag.dragOffsetWorld.y, WORLD_SIZE.height),
      };
      const lastAcceptedWorld = activeDrag.lastAcceptedBallDragWorld ?? mapper.normalizedToWorld(item);
      // Suppress micro-jitter before we accept another drag sample.
      if (Math.hypot(targetWorld.x - lastAcceptedWorld.x, targetWorld.y - lastAcceptedWorld.y) < BALL_DRAG_DEADZONE_WORLD) {
        return;
      }
      activeDrag.lastAcceptedBallDragWorld = targetWorld;
      const currentWorld = mapper.normalizedToWorld(item);
      const distanceToTarget = Math.hypot(targetWorld.x - currentWorld.x, targetWorld.y - currentWorld.y);
      const smoothing = distanceToTarget >= BALL_DRAG_FAST_FOLLOW_DISTANCE_WORLD ? 1 : BALL_DRAG_SMOOTHING;
      const nextWorld = {
        x: currentWorld.x + (targetWorld.x - currentWorld.x) * smoothing,
        y: currentWorld.y + (targetWorld.y - currentWorld.y) * smoothing,
      };
      const nextNormalized = mapper.worldToNormalized(nextWorld);
      normalized = {
        x: clampNormalizedValue(nextNormalized.x),
        y: clampNormalizedValue(nextNormalized.y),
      };
    } else {
      const pointerNormalized = getBoundedNormalizedPointFromEvent(event);
      if (!pointerNormalized) return;
      normalized = {
        x: clampNormalizedValue(pointerNormalized.x + activeDrag.dragOffset.x),
        y: clampNormalizedValue(pointerNormalized.y + activeDrag.dragOffset.y),
      };
    }
    item.x = normalized.x;
    item.y = normalized.y;
    if (isBallItem(item)) {
      const state = getBallRuntimeState(item);
      state.attachedPlayerId = null;
      state.isFree = true;
      appendBallMovementPathPoint(item);
    }
    setItemWorldPosition(item, mapper);
    options.onItemMove?.(item.id, normalized.x, normalized.y);
  }

  function releaseActiveDrag(): void {
    if (!activeDrag) return;
    if (activeDrag.type === "player") {
      const activeState = activeDrag;
      const playerId = activeState.playerId;
      const player = players.find((entry) => entry.id === playerId);
      if (player) {
        setPlayerDragVisualTarget(player, false);
        player.token.cursor = "grab";
      }
    } else if (activeDrag.type === "item") {
      const item = findTacticalItemById(activeDrag.itemId);
      if (item && isBallItem(item)) {
        appendBallMovementPathPoint(item);
      }
    }
    activeDrag = null;
    clearPlayerOriginGraphic();
    syncWhiteboardTokenInputMode();
  }

  function renderAllWhiteboardDrawings(): void {
    if (!isDrawingEnabledSurface) return;
    tacticalDrawingController.render();
  }

  function resetActiveWhiteboardDrawing(): void {
    tacticalDrawingController.cancelActiveDraft();
  }

  function startWhiteboardDrawing(event: unknown): void {
    if (!isDrawingEnabledSurface || isPlaybackInputLocked() || activeDrag) return;
    if (activeWhiteboardTool === "move") return;
    const worldPoint = getBoundedWorldPointFromEvent(event);
    if (!worldPoint) return;
    tacticalDrawingController.handlePointerDown(worldPoint, getPointerIdFromEvent(event));
  }

  function updateWhiteboardDrawing(event: unknown): void {
    if (!isDrawingEnabledSurface || isPlaybackInputLocked() || activeDrag) return;
    if (activeWhiteboardTool === "move") return;
    const worldPoint = getBoundedWorldPointFromEvent(event);
    if (!worldPoint) return;
    tacticalDrawingController.handlePointerMove(worldPoint, getPointerIdFromEvent(event));
  }

  function endWhiteboardDrawing(event?: unknown): void {
    if (!isDrawingEnabledSurface || isPlaybackInputLocked() || activeDrag) return;
    if (activeWhiteboardTool === "move") return;
    const worldPoint = event == null ? null : getBoundedWorldPointFromEvent(event);
    tacticalDrawingController.handlePointerUp(worldPoint, event == null ? null : getPointerIdFromEvent(event));
  }

  function eraseLastPenStroke(): void {
    if (!isDrawingEnabledSurface) return;
    tacticalDrawingController.deleteSelectedOrLast();
  }

  function setPlayerDragVisualTarget(player: TacticalPlayer, isDragging: boolean): void {
    player.dragScaleTarget = isDragging ? PREMIUM_TOKEN_DRAG_SCALE : PREMIUM_TOKEN_IDLE_SCALE;
    player.dragShadowAlphaTarget = isDragging
      ? PREMIUM_TOKEN_DRAG_SHADOW_ALPHA
      : PREMIUM_TOKEN_IDLE_SHADOW_ALPHA;
  }

  function animatePlayerDragVisuals(deltaMs: number): void {
    const blend = Math.min(1, Math.max(0.16, deltaMs / 72));
    for (const player of players) {
      const currentScale = player.token.scale.x;
      const nextScale = currentScale + (player.dragScaleTarget - currentScale) * blend;
      player.token.scale.set(nextScale, nextScale);

      const currentShadow = player.tokenShadow.alpha;
      player.tokenShadow.alpha =
        currentShadow + (player.dragShadowAlphaTarget - currentShadow) * blend;
    }
  }

  function cloneSnapshot(snapshot: PhaseSnapshot): PhaseSnapshot {
    return {
      players: snapshot.players.map((point) => ({ x: point.x, y: point.y })),
      football: snapshot.football.map((point) => ({
        id: point.id,
        x: point.x,
        y: point.y,
        attachedPlayerId: point.attachedPlayerId ?? null,
        isFree: point.isFree,
        ...(point.path ? { path: point.path.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y })) } : {}),
      })),
    };
  }

  function normalizePhaseForPlayerCount(snapshot: PhaseSnapshot, playerCount: number): PhaseSnapshot {
    const normalizedPlayers = Array.from({ length: playerCount }, (_, index) => {
      const existing = snapshot.players[index];
      if (existing) {
        return {
          x: clampNormalizedValue(existing.x),
          y: clampNormalizedValue(existing.y),
        };
      }
      const fallback = players[index]?.current;
      if (fallback) {
        return { x: clampNormalizedValue(fallback.x), y: clampNormalizedValue(fallback.y) };
      }
      return { x: 50, y: 50 };
    });
    return {
      players: normalizedPlayers,
      football: snapshot.football
        .map((ball) => ({
          id: ball.id,
          x: clampNormalizedValue(ball.x),
          y: clampNormalizedValue(ball.y),
          attachedPlayerId:
            typeof ball.attachedPlayerId === "string" && ball.attachedPlayerId.trim().length > 0
              ? ball.attachedPlayerId.trim()
              : null,
          isFree: ball.isFree !== false,
          path: (ball.path ?? [])
            .map((pathPoint) => ({
              x: clampNormalizedValue(pathPoint.x),
              y: clampNormalizedValue(pathPoint.y),
            }))
            .filter((pathPoint) => Number.isFinite(pathPoint.x) && Number.isFinite(pathPoint.y)),
        }))
        .filter((ball) => ball.id.trim().length > 0)
        .map((ball) => {
          const normalizedBall: PhaseBallSnapshot = {
            id: ball.id,
            x: ball.x,
            y: ball.y,
            attachedPlayerId: ball.isFree ? null : ball.attachedPlayerId,
            isFree: ball.isFree,
          };
          if (ball.isFree && ball.path.length > 0) {
            normalizedBall.path = ball.path;
          }
          return normalizedBall;
        }),
    };
  }

  function captureCurrentSnapshot(): PhaseSnapshot {
    return {
      players: players.map((player) => ({ x: player.current.x, y: player.current.y })),
      football: tacticalItems
        .filter((item) => isBallItem(item))
        .map((item) => {
          applyBallRuntimeStateToItem(item);
          const state = getBallRuntimeState(item);
          const point = {
            x: clampNormalizedValue(item.x),
            y: clampNormalizedValue(item.y),
          };
          const path =
            state.isFree && state.path.length > 0
              ? [...state.path, point].map((pathPoint) => ({
                  x: clampNormalizedValue(pathPoint.x),
                  y: clampNormalizedValue(pathPoint.y),
                }))
              : undefined;
          return {
            id: item.id,
            x: point.x,
            y: point.y,
            attachedPlayerId: state.isFree ? null : state.attachedPlayerId,
            isFree: state.isFree,
            ...(path ? { path } : {}),
          };
        }),
    };
  }

  function applySnapshotToSurface(
    snapshot: PhaseSnapshot,
    options?: {
      preserveActiveRoutePlayers?: boolean;
    },
  ): void {
    for (const player of players) {
      if (options?.preserveActiveRoutePlayers && routeControlledPlayerIds.has(player.id)) continue;
      const point = snapshot.players[players.indexOf(player)];
      if (!point) continue;
      player.current = { x: point.x, y: point.y };
      setTokenWorldPositionForPoint(player, player.current, mapper);
    }
    for (const ball of snapshot.football) {
      const item = findTacticalItemById(ball.id);
      if (!item || !isBallItem(item)) continue;
      const state = getBallRuntimeState(item);
      state.attachedPlayerId = ball.isFree ? null : ball.attachedPlayerId ?? null;
      state.isFree = ball.isFree;
      state.path = ball.path?.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y })) ?? [];
      if (!state.isFree) {
        const attachedPoint = getAttachedBallPositionForPlayerId(state.attachedPlayerId);
        if (attachedPoint) {
          item.x = attachedPoint.x;
          item.y = attachedPoint.y;
          setItemWorldPosition(item, mapper);
          continue;
        }
        state.attachedPlayerId = null;
        state.isFree = true;
      }
      item.x = clampNormalizedValue(ball.x);
      item.y = clampNormalizedValue(ball.y);
      setItemWorldPosition(item, mapper);
    }
  }

  function cancelBasicRouteFollow(options?: { restoreOrigin?: boolean }): void {
    if (activeRouteRunsByPlayerId.size > 0) {
      for (const previous of activeRouteRunsByPlayerId.values()) {
        previous.session.cancel();
        if (!options?.restoreOrigin) continue;
        const player = players.find((entry) => entry.id === previous.playerId);
        if (!player) continue;
        player.current = { x: previous.origin.x, y: previous.origin.y };
        setTokenWorldPositionForPoint(player, player.current, mapper);
        updateAttachedBallsForPlayer(player.id);
      }
    }
    activeRouteRunsByPlayerId.clear();
    routeControlledPlayerIds.clear();
    syncWhiteboardTokenInputMode();
  }

  function clearBasicRoutePreview(): void {
    basicRoutePreviewGraphic.clear();
  }

  function renderBasicRoutePreview(): void {
    clearBasicRoutePreview();
    const worldPaths: Array<Array<{ x: number; y: number }>> = [];
    const appendPath = (points: RoutePoint[]): void => {
      if (points.length < 2) return;
      worldPaths.push(points.map((point) => mapper.normalizedToWorld(point)));
    };
    for (const route of routeByPlayerId.values()) {
      appendPath(route);
    }
    if (currentRouteDraftPoints.length > 0) {
      appendPath(currentRouteDraftPoints);
    }
    if (worldPaths.length <= 0) return;

    const strokePaths = (style: { color: number; width: number; alpha: number }): void => {
      for (const path of worldPaths) {
        const first = path[0];
        if (!first) continue;
        basicRoutePreviewGraphic.moveTo(first.x, first.y);
        for (let index = 1; index < path.length; index += 1) {
          const point = path[index];
          if (!point) continue;
          basicRoutePreviewGraphic.lineTo(point.x, point.y);
        }
      }
      basicRoutePreviewGraphic.stroke({
        ...style,
        cap: "round",
        join: "round",
        alignment: 0.5,
      });
    };

    // Layered tactical stroke keeps lines readable on dark pitch and screen share,
    // while preserving a restrained telestrator feel.
    strokePaths({ color: BASIC_ROUTE_PREVIEW_SHADOW_COLOR, width: 2.3, alpha: 0.33 });
    strokePaths({ color: BASIC_ROUTE_PREVIEW_CORE_COLOR, width: 1.35, alpha: 0.95 });
    strokePaths({ color: BASIC_ROUTE_PREVIEW_HIGHLIGHT_COLOR, width: 0.58, alpha: 0.46 });
  }

  function clearRouteDraft(): void {
    routeCapturePointerId = null;
    currentRouteDraftPoints = [];
    currentRouteDraftPlayerId = null;
    renderBasicRoutePreview();
  }

  function clearRouteAssignments(): void {
    routeCapturePointerId = null;
    currentRouteDraftPoints = [];
    currentRouteDraftPlayerId = null;
    routeByPlayerId.clear();
    selectedPlayerId = null;
    clearBasicRoutePreview();
    emitRouteStateChange();
  }

  function setRouteCaptureModeState(enabled: boolean): void {
    const next = Boolean(enabled) && surfaceVariant === "tactical";
    if (next === isRouteCaptureMode) return;
    isRouteCaptureMode = next;
    if (!isRouteCaptureMode) {
      clearRouteDraft();
    }
    syncWhiteboardTokenInputMode();
    emitRouteStateChange();
  }

  function appendBasicRoutePoint(point: RoutePoint): void {
    const previous = currentRouteDraftPoints[currentRouteDraftPoints.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < BASIC_ROUTE_MIN_POINT_DISTANCE) {
      return;
    }
    currentRouteDraftPoints = [...currentRouteDraftPoints, point];
    renderBasicRoutePreview();
  }

  function findRouteSelectablePlayerAtWorldPoint(worldPoint: { x: number; y: number }): TacticalPlayer | null {
    if (surfaceVariant !== "tactical") return null;
    const touchRadiusInWorld = (PLAYER_TOUCH_HIT_DIAMETER_PX * 0.5) / mapper.transform.scale;
    const maxDistanceSquared = Math.max(PLAYER_RADIUS, touchRadiusInWorld) ** 2;
    let closest: TacticalPlayer | null = null;
    let closestDistanceSquared = maxDistanceSquared;
    for (const player of players) {
      const playerWorldPoint = mapper.normalizedToWorld(player.current);
      const dx = playerWorldPoint.x - worldPoint.x;
      const dy = playerWorldPoint.y - worldPoint.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > closestDistanceSquared) continue;
      closest = player;
      closestDistanceSquared = distanceSquared;
    }
    return closest;
  }

  function buildBasicRouteRunsForCurrentPlayers(segmentIndex: number): Map<string, ActiveBasicRouteFollow> {
    const runs = new Map<string, ActiveBasicRouteFollow>();
    for (const [playerId, route] of routeByPlayerId.entries()) {
      const player = players.find((entry) => entry.id === playerId);
      if (!player || route.length < 2) continue;
      const origin = { x: player.current.x, y: player.current.y };
      const session = createBasicRouteFollowSession({
        target: player.current,
        route: route.map((point) => ({ ...point })),
        speed: BASIC_ROUTE_FOLLOW_SPEED,
      });
      runs.set(player.id, { playerId: player.id, origin, segmentIndex, session });
    }
    return runs;
  }

  function cancelPlaybackAnimation(): void {
    isPlaying = false;
    isPaused = false;
    playElapsedMs = 0;
    playbackPath = [];
    activeSegmentIndex = 0;
    playbackKind = "default";
    playbackPossessionReceiverId = null;
    emitPlaybackStateChange();
  }

  function startPlayback(path: PhaseSnapshot[], optionsForPlayback?: PlaybackStartOptions): void {
    if (path.length < 2) return;
    playbackPath = path;
    activeSegmentIndex = 0;
    isPlaying = true;
    isPaused = false;
    playElapsedMs = 0;
    playbackKind = optionsForPlayback?.kind ?? "default";
    playbackPossessionReceiverId =
      playbackKind === "possession-pass"
        ? optionsForPlayback?.possessionReceiverId ?? null
        : null;
    applySnapshotToSurface(path[0]!);
    const shouldSuppressRoutePlayback = optionsForPlayback?.suppressRoutePlayback === true;
    activeRouteRunsByPlayerId =
      !shouldSuppressRoutePlayback && routeByPlayerId.size > 0
        ? buildBasicRouteRunsForCurrentPlayers(activeSegmentIndex)
        : new Map();
    routeControlledPlayerIds = new Set(activeRouteRunsByPlayerId.keys());
    emitPlaybackStateChange();
  }

  function isCurrentAtStartPosition(): boolean {
    const epsilon = 0.0001;
    for (const player of players) {
      const idx = players.indexOf(player);
      const startPoint = startPositions.players[idx];
      if (!startPoint) continue;
      if (
        Math.abs(player.current.x - startPoint.x) > epsilon ||
        Math.abs(player.current.y - startPoint.y) > epsilon
      ) {
        return false;
      }
    }
    return true;
  }

  function playSingleStartToCurrent(): void {
    const shouldReplayStoredTarget = singlePlayTargetSnapshot != null && isCurrentAtStartPosition();
    const playbackTarget = shouldReplayStoredTarget
      ? cloneSnapshot(singlePlayTargetSnapshot)
      : captureCurrentSnapshot();
    if (!shouldReplayStoredTarget) {
      singlePlayTargetSnapshot = cloneSnapshot(playbackTarget);
    }
    startPlayback([cloneSnapshot(startPositions), playbackTarget]);
  }

  function playSavedPhaseSequence(): void {
    const sequence = [cloneSnapshot(startPositions), ...phases.map((phase) => cloneSnapshot(phase))];
    startPlayback(sequence);
  }

  function handlePlay(): void {
    releaseActiveDrag();
    clearSelectedItem();
    if (isPaused && playbackPath.length >= 2) {
      isPaused = false;
      isPlaying = true;
      emitPlaybackStateChange();
      return;
    }
    cancelBasicRouteFollow();
    cancelPlaybackAnimation();
    if (phases.length > 0) {
      playSavedPhaseSequence();
      return;
    }
    playSingleStartToCurrent();
  }

  function interpolateBallPath(
    fromBall: PhaseBallSnapshot | null,
    toBall: PhaseBallSnapshot,
    progress: number,
  ): NormalizedPoint {
    const fallbackStart = fromBall ?? toBall;
    const fallbackPoint = {
      x: fallbackStart.x + (toBall.x - fallbackStart.x) * progress,
      y: fallbackStart.y + (toBall.y - fallbackStart.y) * progress,
    };
    const storedPath = toBall.path ?? [];
    if (storedPath.length < 2) {
      return fallbackPoint;
    }

    let path = storedPath.map((point) => ({
      x: clampNormalizedValue(point.x),
      y: clampNormalizedValue(point.y),
    }));

    if (fromBall) {
      const fromPoint = {
        x: clampNormalizedValue(fromBall.x),
        y: clampNormalizedValue(fromBall.y),
      };
      // Trim stale prefix points so each playback segment begins from the current segment origin.
      const firstAlignedIndex = path.findIndex(
        (point) => Math.hypot(point.x - fromPoint.x, point.y - fromPoint.y) < BALL_PATH_MIN_POINT_DISTANCE,
      );
      if (firstAlignedIndex > 0) {
        path = path.slice(firstAlignedIndex);
      }
      const firstPoint = path[0];
      if (
        !firstPoint ||
        Math.hypot(firstPoint.x - fromPoint.x, firstPoint.y - fromPoint.y) >= BALL_PATH_MIN_POINT_DISTANCE
      ) {
        path.unshift(fromPoint);
      }
    }

    let totalDistance = 0;
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      if (!previous || !current) continue;
      totalDistance += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    if (totalDistance <= 0) {
      return fallbackPoint;
    }

    const targetDistance = totalDistance * progress;
    let traveledDistance = 0;
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      if (!previous || !current) continue;
      const segmentDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
      if (segmentDistance <= 0) continue;
      if (traveledDistance + segmentDistance >= targetDistance) {
        const segmentProgress = (targetDistance - traveledDistance) / segmentDistance;
        return {
          x: previous.x + (current.x - previous.x) * segmentProgress,
          y: previous.y + (current.y - previous.y) * segmentProgress,
        };
      }
      traveledDistance += segmentDistance;
    }
    return {
      x: clampNormalizedValue(toBall.x),
      y: clampNormalizedValue(toBall.y),
    };
  }

  function getPlaybackEaseProgress(progress: number): number {
    const clamped = Math.max(0, Math.min(1, progress));
    return clamped * clamped * (3 - 2 * clamped);
  }

  function resolvePossessionPassSegmentDurationMs(fromSnapshot: PhaseSnapshot, toSnapshot: PhaseSnapshot): number {
    let maxBallDistance = 0;
    for (const toBall of toSnapshot.football) {
      const fromBall = fromSnapshot.football.find((point) => point.id === toBall.id);
      if (!fromBall) continue;
      const distance = Math.hypot(toBall.x - fromBall.x, toBall.y - fromBall.y);
      if (distance > maxBallDistance) {
        maxBallDistance = distance;
      }
    }
    const distanceBasedDuration =
      (PLAY_DURATION_MS * (Math.max(0, maxBallDistance) / POSSESSION_PASS_REFERENCE_DISTANCE)) /
      Math.max(0.01, playbackSpeedMultiplier);
    return Math.max(
      POSSESSION_PASS_MIN_DURATION_MS,
      Math.min(POSSESSION_PASS_MAX_DURATION_MS, distanceBasedDuration),
    );
  }

  function stepPlayback(deltaMs: number): void {
    if (!isPlaying || playbackPath.length < 2) return;

    let remainingMs = deltaMs;
    while (remainingMs > 0 && isPlaying) {
      const fromSnapshot = playbackPath[activeSegmentIndex];
      const toSnapshot = playbackPath[activeSegmentIndex + 1];
      if (!fromSnapshot || !toSnapshot) {
        cancelPlaybackAnimation();
        return;
      }

      const segmentDurationMs =
        playbackKind === "possession-pass"
          ? resolvePossessionPassSegmentDurationMs(fromSnapshot, toSnapshot)
          : PLAY_DURATION_MS / playbackSpeedMultiplier;
      const stepMs = Math.min(remainingMs, Math.max(0, segmentDurationMs - playElapsedMs));
      playElapsedMs += stepMs;
      remainingMs -= stepMs;
      const progress = Math.max(0, Math.min(1, playElapsedMs / segmentDurationMs));
      const easedProgress = getPlaybackEaseProgress(progress);

      for (const player of players) {
        if (routeControlledPlayerIds.has(player.id)) continue;
        const idx = players.indexOf(player);
        const fromPoint = fromSnapshot.players[idx];
        const toPoint = toSnapshot.players[idx];
        if (!fromPoint || !toPoint) continue;
        player.current = {
          x: fromPoint.x + (toPoint.x - fromPoint.x) * easedProgress,
          y: fromPoint.y + (toPoint.y - fromPoint.y) * easedProgress,
        };
        setTokenWorldPositionForPoint(player, player.current, mapper);
      }
      for (const toBall of toSnapshot.football) {
        const fromBall = fromSnapshot.football.find((point) => point.id === toBall.id) ?? null;
        const item = findTacticalItemById(toBall.id);
        if (!item || !isBallItem(item)) continue;
        const state = getBallRuntimeState(item);
        const targetAttachedPlayerId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
        const sourceAttachedPlayerId = fromBall?.isFree ? null : fromBall?.attachedPlayerId ?? null;
        const isAttachedToAttachedPassTransition =
          sourceAttachedPlayerId != null &&
          targetAttachedPlayerId != null &&
          sourceAttachedPlayerId !== targetAttachedPlayerId;
        if (targetAttachedPlayerId) {
          if (isAttachedToAttachedPassTransition && fromBall) {
            // Replay holder-switch transitions using the recorded snapshot endpoints.
            // This avoids stale/legacy path artifacts and keeps pass playback deterministic.
            state.attachedPlayerId = null;
            state.isFree = true;
            state.path = [];
            item.x = clampNormalizedValue(fromBall.x + (toBall.x - fromBall.x) * easedProgress);
            item.y = clampNormalizedValue(fromBall.y + (toBall.y - fromBall.y) * easedProgress);
            setItemWorldPosition(item, mapper);
            continue;
          }
          state.attachedPlayerId = targetAttachedPlayerId;
          state.isFree = false;
          state.path = [];
          const attachedPoint = getAttachedBallPositionForPlayerId(targetAttachedPlayerId);
          if (!attachedPoint) continue;
          const rawDx = attachedPoint.x - item.x;
          const rawDy = attachedPoint.y - item.y;
          const rawDistance = Math.hypot(rawDx, rawDy);
          if (rawDistance <= ATTACHED_BALL_FOLLOW_MAX_LEAD_WORLD) {
            item.x = attachedPoint.x;
            item.y = attachedPoint.y;
          } else {
            const cappedScale = ATTACHED_BALL_FOLLOW_MAX_LEAD_WORLD / rawDistance;
            const cappedX = attachedPoint.x - rawDx * cappedScale;
            const cappedY = attachedPoint.y - rawDy * cappedScale;
            item.x += (cappedX - item.x) * ATTACHED_BALL_FOLLOW_SMOOTHING;
            item.y += (cappedY - item.y) * ATTACHED_BALL_FOLLOW_SMOOTHING;
          }
        } else {
          const freePoint = interpolateBallPath(fromBall, toBall, progress);
          state.attachedPlayerId = null;
          state.isFree = true;
          state.path = toBall.path?.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y })) ?? [];
          item.x = clampNormalizedValue(freePoint.x);
          item.y = clampNormalizedValue(freePoint.y);
        }
        setItemWorldPosition(item, mapper);
      }

      if (progress >= 1) {
        applySnapshotToSurface(toSnapshot, { preserveActiveRoutePlayers: true });
        activeSegmentIndex += 1;
        playElapsedMs = 0;
        if (activeSegmentIndex >= playbackPath.length - 1) {
          const possessionReceiverId =
            playbackKind === "possession-pass" ? playbackPossessionReceiverId : null;
          cancelPlaybackAnimation();
          if (possessionReceiverId) {
            const receiver = players.find((entry) => entry.id === possessionReceiverId);
            if (receiver) {
              attachPrimaryBallToPlayer(receiver);
            }
          }
          return;
        }
        // Avoid a boundary stall when a segment ends exactly on a frame.
        // Carry a tiny delta so the next segment begins in the same tick.
        if (remainingMs <= 0) {
          remainingMs = 0.0001;
        }
      }
    }
  }

  function stepBasicRouteFollow(deltaMs: number): void {
    if (isPaused) return;
    if (activeRouteRunsByPlayerId.size <= 0) return;
    const completedIds: string[] = [];
    for (const [playerId, active] of activeRouteRunsByPlayerId.entries()) {
      const player = players.find((entry) => entry.id === playerId);
      if (!player) {
        completedIds.push(playerId);
        continue;
      }
      if (!active.session.isActive()) {
        completedIds.push(playerId);
        continue;
      }
      active.session.step(deltaMs);
      setTokenWorldPositionForPoint(player, player.current, mapper);
      updateAttachedBallsForPlayer(player.id);
      if (!active.session.isActive()) {
        completedIds.push(playerId);
      }
    }
    for (const playerId of completedIds) {
      activeRouteRunsByPlayerId.delete(playerId);
    }
    if (activeRouteRunsByPlayerId.size <= 0) {
      syncWhiteboardTokenInputMode();
    }
  }

  function findTacticalPlayer(playerId: string): TacticalPlayer | null {
    if (surfaceVariant !== "tactical") return null;
    return players.find((player) => player.id === playerId) ?? null;
  }

  function getTacticalPlayerSnapshot(playerId: string): TacticalPlayerKitSnapshot | null {
    const player = findTacticalPlayer(playerId);
    if (!player) return null;
    return {
      id: player.id,
      number: Number.isFinite(player.number) ? Math.max(0, Math.floor(player.number)) : 0,
      team: player.team,
      kitBaseColor: sanitizeKitColor(player.kitBaseColor),
      kitPattern: sanitizeKitPattern(player.kitPattern),
      kitPatternColor: sanitizeKitColor(player.kitPatternColor),
      labelMode: sanitizeLabelMode(player.labelMode),
      initials: sanitizeInitials(player.initials),
    };
  }

  function rerenderTacticalPlayerToken(player: TacticalPlayer): void {
    if (surfaceVariant !== "tactical") return;
    const previousToken = player.token;
    const previousPositionX = previousToken.position.x;
    const previousPositionY = previousToken.position.y;
    const previousScaleX = previousToken.scale.x;
    const previousScaleY = previousToken.scale.y;
    const previousIndex = playersLayer.getChildIndex(previousToken);
    const nextPack = createTokenPackForPlayer(player);
    player.token = nextPack.token;
    player.tokenShadow = nextPack.shadow;
    player.token.position.set(previousPositionX, previousPositionY);
    player.token.scale.set(previousScaleX, previousScaleY);
    playersLayer.removeChild(previousToken);
    playersLayer.addChildAt(player.token, previousIndex);
    previousToken.removeAllListeners();
    previousToken.destroy({ children: true });
    bindPlayerTokenInteraction(player);
    setPlayerTouchHitArea(player, mapper);
    syncWhiteboardTokenInputMode();
  }

  function patchTacticalPlayer(playerId: string, patch: TacticalPlayerKitPatch): void {
    const player = findTacticalPlayer(playerId);
    if (!player) return;
    const sanitizedPatch = sanitizePlayerKitPatch(patch);
    if (Object.keys(sanitizedPatch).length <= 0) return;
    if ("labelMode" in sanitizedPatch) {
      player.labelMode = sanitizedPatch.labelMode;
    }
    if ("initials" in sanitizedPatch) {
      player.initials = sanitizedPatch.initials;
    }
    const hasTeamKitPatch =
      "kitBaseColor" in sanitizedPatch ||
      "kitPattern" in sanitizedPatch ||
      "kitPatternColor" in sanitizedPatch;
    if (surfaceVariant === "tactical" && hasTeamKitPatch) {
      const currentTeamKit = getTeamKitForTeam(player.team);
      const nextPrimaryColor = sanitizeKitColor(sanitizedPatch.kitBaseColor) ?? currentTeamKit.primaryColor;
      const nextPattern = sanitizeKitPattern(sanitizedPatch.kitPattern) ?? currentTeamKit.pattern;
      const nextSecondaryColor = sanitizeKitColor(sanitizedPatch.kitPatternColor) ?? currentTeamKit.secondaryColor;
      const nextTeamKit: TacticalTeamKitState = {
        primaryColor: nextPrimaryColor,
        pattern: nextPattern,
        secondaryColor: nextSecondaryColor,
      };
      const didTeamKitChange =
        nextTeamKit.primaryColor !== currentTeamKit.primaryColor ||
        nextTeamKit.pattern !== currentTeamKit.pattern ||
        nextTeamKit.secondaryColor !== currentTeamKit.secondaryColor;
      if (didTeamKitChange) {
        setTeamKitForTeam(player.team, nextTeamKit);
      }
      rerenderAllTacticalPlayersOnTeam(player.team);
      return;
    }
    if ("kitBaseColor" in sanitizedPatch) {
      player.kitBaseColor = sanitizedPatch.kitBaseColor;
    }
    if ("kitPattern" in sanitizedPatch) {
      player.kitPattern = sanitizedPatch.kitPattern;
    }
    if ("kitPatternColor" in sanitizedPatch) {
      player.kitPatternColor = sanitizedPatch.kitPatternColor;
    }
    rerenderTacticalPlayerToken(player);
  }

  function emitPlayerDoubleTap(player: TacticalPlayer, event: unknown): void {
    if (surfaceVariant !== "tactical") return;
    const now = Date.now();
    const lastTap = lastTappedPlayer;
    if (lastTap && lastTap.playerId === player.id && now - lastTap.atMs <= DOUBLE_TAP_WINDOW_MS) {
      lastTappedPlayer = null;
      const eventPoint = getClientPointFromEvent(event);
      if (eventPoint) {
        options.onTacticalPlayerDoubleTap?.({
          playerId: player.id,
          clientX: eventPoint.x,
          clientY: eventPoint.y,
        });
        return;
      }
      const fallbackViewportPoint = mapper.normalizedToViewport(player.current);
      const bounds = (app.canvas as HTMLCanvasElement).getBoundingClientRect();
      options.onTacticalPlayerDoubleTap?.({
        playerId: player.id,
        clientX: bounds.left + fallbackViewportPoint.x,
        clientY: bounds.top + fallbackViewportPoint.y,
      });
      return;
    }
    lastTappedPlayer = {
      playerId: player.id,
      atMs: now,
    };
  }

  function bindPlayerTokenInteraction(player: TacticalPlayer): void {
    player.token.on("pointerdown", (event) => {
      if (isPlaybackInputLocked()) return;
      if (activeRouteRunsByPlayerId.size > 0) return;
      if (isRouteCaptureMode) {
        selectedPlayerId = player.id;
        clearSelectedItem();
        syncWhiteboardTokenInputMode();
        return;
      }
      if (activeWhiteboardTool !== "move") return;
      if (activeDrag) return;
      selectedPlayerId = player.id;
      clearSelectedItem();
      const useDragThreshold = surfaceVariant === "tactical";
      const pointerId = getPointerIdFromEvent(event);
      const startStagePoint = getStagePointFromEvent(event, app.stage);
      activeDrag = {
        type: "player",
        playerId: player.id,
        pointerId,
        startStagePoint,
        hasCrossedThreshold: !useDragThreshold,
      };
      if (!useDragThreshold) {
        setPlayerDragVisualTarget(player, true);
        updateDraggedPlayerFromEvent(event);
      }
      syncWhiteboardTokenInputMode();
    });
    player.token.on("pointerup", (event) => {
      if (surfaceVariant !== "tactical") return;
      if (isPlaybackInputLocked()) return;
      if (isRouteCaptureMode) return;
      if (activeWhiteboardTool !== "move") return;
      if (!activeDrag || activeDrag.type !== "player" || activeDrag.playerId !== player.id) return;
      if (activeDrag.hasCrossedThreshold) {
        lastTappedPlayer = null;
        return;
      }
      if (isPossessionPassModeEnabled) {
        lastTappedPlayer = null;
        handlePossessionPassTap(player);
        return;
      }
      attachPrimaryBallToPlayer(player);
      emitPlayerDoubleTap(player, event);
    });
  }

  function syncPlayersToViewport(): void {
    for (const player of players) {
      setPlayerTouchHitArea(player, mapper);
      setTokenWorldPositionForPoint(player, player.current, mapper);
    }
    renderTacticalItems();
    renderPlayerOriginGraphic();
  }

  function rebuildWhiteboardPlayers(
    counts: TacticalPadLiteSurfaceOptions["whiteboardTeamCounts"],
    colors: TacticalPadLiteSurfaceOptions["whiteboardTeamColors"],
  ): void {
    if (!isWhiteboardSurface) return;
    releaseActiveDrag();
    lastTappedPlayer = null;
    // Preserve committed drawings; only clear in-progress preview state.
    resetActiveWhiteboardDrawing();
    for (const player of players) {
      player.token.removeAllListeners();
      player.token.destroy({ children: true });
    }
    players.length = 0;
    const nextSeeds = createWhiteboardPlayerSeeds(counts, colors);
    for (const seed of nextSeeds) {
      const nextPlayer = createSurfacePlayer(seed);
      players.push(nextPlayer);
      bindPlayerTokenInteraction(nextPlayer);
    }
    syncPlayersToViewport();
    syncWhiteboardTokenInputMode();
    renderAllWhiteboardDrawings();
  }

  function rebuildTacticalPlayersWithColors(): void {
    if (surfaceVariant !== "tactical") return;
    releaseActiveDrag();
    const labelsByPlayerId = new Map(
      players.map((player) => [
        player.id,
        {
          labelMode: player.labelMode,
          initials: player.initials,
        } as TacticalPlayerKitFields,
      ]),
    );
    const nextSeeds: PlayerSeed[] = players.map((player) => ({
      id: player.id,
      number: Number.isFinite(player.number) ? player.number : 1,
      team: player.team,
      color: teamColor(player.team, tacticalTeamColors),
      position: { x: player.current.x, y: player.current.y },
    }));
    for (const player of players) {
      player.token.removeAllListeners();
      player.token.destroy({ children: true });
    }
    players.length = 0;
    for (const seed of nextSeeds) {
      const nextPlayer = createSurfacePlayer(seed, labelsByPlayerId.get(seed.id));
      players.push(nextPlayer);
      bindPlayerTokenInteraction(nextPlayer);
    }
    syncPlayersToViewport();
    syncWhiteboardTokenInputMode();
    renderAllWhiteboardDrawings();
  }

  function captureBoardState(): TacticalBoardState {
    const playerStates: TacticalBoardPlayerState[] = players.map((player) => ({
      id: player.id,
      number: Number.isFinite(player.number) ? Math.max(1, Math.floor(player.number)) : 1,
      team: player.team,
      teamColor: player.teamColor,
      x: clampNormalizedValue(player.current.x),
      y: clampNormalizedValue(player.current.y),
      kitBaseColor: sanitizeKitColor(player.kitBaseColor),
      kitPattern: sanitizeKitPattern(player.kitPattern),
      kitPatternColor: sanitizeKitColor(player.kitPatternColor),
      labelMode: sanitizeLabelMode(player.labelMode),
      initials: sanitizeInitials(player.initials),
    }));
    const kitsByPlayer = playerStates.reduce<Record<string, TacticalPlayerKitFields>>((acc, playerState) => {
      acc[playerState.id] = {
        kitBaseColor: playerState.kitBaseColor,
        kitPattern: playerState.kitPattern,
        kitPatternColor: playerState.kitPatternColor,
        labelMode: playerState.labelMode,
        initials: playerState.initials,
      };
      return acc;
    }, {});
    const itemStates: TacticalItem[] = tacticalItems.map((item) => ({
      id: item.id,
      type: item.type,
      x: clampNormalizedValue(item.x),
      y: clampNormalizedValue(item.y),
      ...(Number.isFinite(item.rotation) ? { rotation: Number(item.rotation) } : {}),
      ...(Number.isFinite(item.scale) ? { scale: Number(item.scale) } : {}),
    }));
    const drawingStates: TacticalBoardDrawingSnapshot[] = tacticalDrawingController.exportSnapshots();
    const phaseStates = phases.map((phase) => cloneSnapshot(phase));
    const currentTeamState: TacticalBoardTeamState = {
      colors: {
        blue: tacticalTeamColors.blue ?? "blue",
        red: tacticalTeamColors.red ?? "red",
      },
      counts: {
        blue: playerStates.filter((player) => player.team === "BLUE").length,
        red: playerStates.filter((player) => player.team === "RED").length,
      },
    };
    const currentTeamKits: TacticalBoardTeamKitsState = {
      A: {
        primaryColor: tacticalTeamKits.A.primaryColor,
        secondaryColor: tacticalTeamKits.A.secondaryColor,
        pattern: tacticalTeamKits.A.pattern,
      },
      B: {
        primaryColor: tacticalTeamKits.B.primaryColor,
        secondaryColor: tacticalTeamKits.B.secondaryColor,
        pattern: tacticalTeamKits.B.pattern,
      },
    };
    return {
      version: 3,
      players: playerStates,
      items: itemStates,
      drawings: drawingStates,
      phases: phaseStates,
      movementPaths: phaseStates.map((phase) => cloneSnapshot(phase)),
      routes: Array.from(routeByPlayerId.entries()).map(([playerId, points]) => ({
        playerId,
        points: points.map((point) => ({ x: point.x, y: point.y })),
      })),
      kits: kitsByPlayer,
      teamKits: currentTeamKits,
      teamState: currentTeamState,
      viewport: {
        width: host.clientWidth,
        height: host.clientHeight,
      },
      startSnapshot: cloneSnapshot(startPositions),
      drawTool: activeWhiteboardTool,
      drawColor: activeWhiteboardColor,
      itemMode,
    };
  }

  function cloneBoardStateSnapshot(state: TacticalBoardState): TacticalBoardState {
    if (typeof structuredClone === "function") {
      return structuredClone(state);
    }
    return JSON.parse(JSON.stringify(state)) as TacticalBoardState;
  }

  function importBoardState(state: TacticalBoardState): boolean {
    if (surfaceVariant !== "tactical") return false;
    if (!isRecord(state)) return false;

    const parsedPlayers = Array.isArray(state.players)
      ? state.players.map((entry) => sanitizeBoardPlayerState(entry)).filter((entry): entry is TacticalBoardPlayerState => entry != null)
      : [];
    const parsedItems = Array.isArray(state.items)
      ? state.items
          .map((entry) => sanitizeTacticalItemCandidate(entry))
          .filter((entry): entry is TacticalItem => entry != null)
      : [];
    const parsedDrawings = Array.isArray(state.drawings)
      ? state.drawings
          .map((entry) => sanitizeBoardDrawingSnapshot(entry, mapper))
          .filter((entry): entry is TacticalBoardDrawingSnapshot => entry != null)
      : [];
    const parsedPhases = Array.isArray(state.phases)
      ? state.phases
          .map((entry) => sanitizePhaseSnapshot(entry))
          .filter((entry): entry is PhaseSnapshot => entry != null)
      : [];
    const parsedRoutes = sanitizeBoardRoutes(state.routes);
    const parsedStart = sanitizePhaseSnapshot(state.startSnapshot);
    const parsedTeamState = isRecord(state.teamState) ? state.teamState : null;
    const nextBlueColor = sanitizeWhiteboardTokenColor(parsedTeamState?.colors && isRecord(parsedTeamState.colors) ? parsedTeamState.colors.blue : undefined);
    const nextRedColor = sanitizeWhiteboardTokenColor(parsedTeamState?.colors && isRecord(parsedTeamState.colors) ? parsedTeamState.colors.red : undefined);
    tacticalTeamColors = {
      blue: nextBlueColor ?? tacticalTeamColors.blue ?? "blue",
      red: nextRedColor ?? tacticalTeamColors.red ?? "red",
    };
    const defaultTeamKits = createDefaultTacticalTeamKits(tacticalTeamColors);
    const parsedTeamKits = sanitizeBoardTeamKitsState(state.teamKits);
    tacticalTeamKits = parsedTeamKits ?? {
      A: buildTeamKitFromPlayerStates("BLUE", parsedPlayers, defaultTeamKits.A),
      B: buildTeamKitFromPlayerStates("RED", parsedPlayers, defaultTeamKits.B),
    };

    releaseActiveDrag();
    clearSelectedItem();
    cancelPlaybackAnimation();
    cancelBasicRouteFollow();
    clearRouteAssignments();
    setRouteCaptureModeState(false);
    singlePlayTargetSnapshot = null;
    resetActiveWhiteboardDrawing();
    lastTappedPlayer = null;

    for (const player of players) {
      player.token.removeAllListeners();
      player.token.destroy({ children: true });
    }
    players.length = 0;

    const playerSeeds: PlayerSeed[] = parsedPlayers.length > 0
      ? parsedPlayers.map((player) => ({
          id: player.id,
          number: player.number,
          team: player.team,
          color: player.teamColor,
          position: { x: player.x, y: player.y },
        }))
      : createWhiteboardPlayerSeeds(TACTICAL_INITIAL_TEAM_COUNTS, tacticalTeamColors);

    for (let index = 0; index < playerSeeds.length; index += 1) {
      const seed = playerSeeds[index];
      if (!seed) continue;
      const source = parsedPlayers[index];
      const nextPlayer = createSurfacePlayer(
        seed,
        source
          ? {
              labelMode: source.labelMode,
              initials: source.initials,
            }
          : undefined,
      );
      players.push(nextPlayer);
      bindPlayerTokenInteraction(nextPlayer);
    }

    upsertTacticalItems(parsedItems);

    tacticalDrawingController.importSnapshots(parsedDrawings);
    const parsedMaxDrawingSerial = parsedDrawings.reduce<number>((maxValue, drawing) => {
      const match = /(\d+)$/.exec(drawing.id);
      const serial = match?.[1] ? Number(match[1]) : Number.NaN;
      if (!Number.isFinite(serial)) return maxValue;
      return Math.max(maxValue, serial);
    }, 0);
    whiteboardDrawingCounter = Math.max(whiteboardDrawingCounter, parsedMaxDrawingSerial);

    const nextStartSnapshot = normalizePhaseForPlayerCount(
      parsedStart ?? captureCurrentSnapshot(),
      players.length,
    );
    startPositions = nextStartSnapshot;
    phases = parsedPhases.map((phase) => normalizePhaseForPlayerCount(phase, players.length));
    routeByPlayerId = new Map(
      Array.from(parsedRoutes.entries())
        .filter(([playerId]) => players.some((player) => player.id === playerId))
        .slice(0, MAX_BASIC_ROUTE_PLAYERS)
        .map(
          ([playerId, points]) =>
            [playerId, points.map((point) => ({ x: point.x, y: point.y }))] as [string, RoutePoint[]],
        ),
    );
    options.onPhaseCountChange?.(phases.length);
    renderBasicRoutePreview();
    emitRouteStateChange();

    const parsedDrawTool = sanitizeDrawingTool(state.drawTool);
    if (parsedDrawTool) {
      activeWhiteboardTool = drawingToolToWhiteboardTool(parsedDrawTool);
    }
    if (typeof state.drawColor === "number" && Number.isFinite(state.drawColor)) {
      activeWhiteboardColor = Math.max(0, Math.floor(state.drawColor));
    }
    if (state.itemMode === "edit" || state.itemMode === "locked") {
      itemMode = state.itemMode;
    }

    syncPlayersToViewport();
    if (itemMode === "locked") {
      clearSelectedItem();
    }
    syncWhiteboardTokenInputMode();
    renderTacticalItems();
    tacticalDrawingController.setColor(activeWhiteboardColor);
    tacticalDrawingController.setTool(sanitizeDrawingTool(activeWhiteboardTool) ?? "move");
    renderAllWhiteboardDrawings();
    return true;
  }

  function getTacticalPlayerSerial(player: TacticalPlayer, team: "BLUE" | "RED"): number {
    if (player.team !== team) return Number.NaN;
    const serialMatch = new RegExp(`^${teamPrefix(team)}(\\d+)$`).exec(player.id);
    const parsed = serialMatch?.[1] ? Number(serialMatch[1]) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(player.number) ? player.number : 0;
  }

  function createNextTacticalPlayerSeed(team: "BLUE" | "RED"): PlayerSeed | null {
    if (surfaceVariant !== "tactical") return null;
    const teamPlayers = players.filter((player) => player.team === team);
    if (teamPlayers.length >= 15) return null;

    const maxSerial = teamPlayers.reduce<number>(
      (maxValue, player) => Math.max(maxValue, getTacticalPlayerSerial(player, team)),
      0,
    );
    const nextSerial = Math.max(1, maxSerial + 1);
    const nextIndex = teamPlayers.length + 1;
    const nextY = (nextIndex * WORLD_SIZE.height) / (teamPlayers.length + 2);

    const teamKit = getTeamKitForTeam(team);
    return {
      id: `${teamPrefix(team)}${nextSerial}`,
      number: nextSerial,
      team,
      color: team === "RED" ? "red" : "blue",
      position: {
        x: Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, teamLaneX(team))),
        y: Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, nextY)),
      },
      kitBaseColor: teamKit.primaryColor,
      kitPattern: teamKit.pattern,
      kitPatternColor: teamKit.secondaryColor,
    };
  }

  function addTacticalPlayer(team: "BLUE" | "RED" = "BLUE"): void {
    if (surfaceVariant !== "tactical") return;
    const nextSeed = createNextTacticalPlayerSeed(team);
    if (!nextSeed) return;
    releaseActiveDrag();
    const nextPlayer = createSurfacePlayer(nextSeed);
    players.push(nextPlayer);
    bindPlayerTokenInteraction(nextPlayer);
    syncPlayersToViewport();
    syncWhiteboardTokenInputMode();
  }

  function removeLastTacticalPlayer(team: "BLUE" | "RED" = "BLUE"): void {
    if (surfaceVariant !== "tactical") return;
    const removablePlayers = players
      .map((player, index) => ({ index, serial: getTacticalPlayerSerial(player, team) }))
      .filter((entry) => players[entry.index]?.team === team);
    if (removablePlayers.length <= 0) return;
    releaseActiveDrag();
    const removalTarget = removablePlayers.reduce((current, next) => {
      if (next.serial > current.serial) return next;
      if (next.serial === current.serial && next.index > current.index) return next;
      return current;
    });
    const [removedPlayer] = players.splice(removalTarget.index, 1);
    if (!removedPlayer) return;
    if (selectedPlayerId === removedPlayer.id) {
      selectedPlayerId = null;
    }
    if (routeByPlayerId.delete(removedPlayer.id)) {
      emitRouteStateChange();
    }
    const activeRoute = activeRouteRunsByPlayerId.get(removedPlayer.id);
    if (activeRoute) {
      activeRoute.session.cancel();
      activeRouteRunsByPlayerId.delete(removedPlayer.id);
      routeControlledPlayerIds.delete(removedPlayer.id);
    }
    if (lastTappedPlayer?.playerId === removedPlayer.id) {
      lastTappedPlayer = null;
    }
    for (const ballState of ballStatesByItemId.values()) {
      if (ballState.attachedPlayerId !== removedPlayer.id) continue;
      ballState.attachedPlayerId = null;
      ballState.isFree = true;
    }
    removedPlayer.token.removeAllListeners();
    removedPlayer.token.destroy({ children: true });
    syncPlayersToViewport();
    syncWhiteboardTokenInputMode();
  }

  for (const player of players) {
    bindPlayerTokenInteraction(player);
  }
  syncPlayersToViewport();

  function handleStagePointerMove(event: unknown): void {
    if (isRouteCaptureMode && !isPlaybackInputLocked() && routeCapturePointerId !== null) {
      const pointerId = getPointerIdFromEvent(event);
      if (pointerId == null || pointerId === routeCapturePointerId) {
        const worldPoint = getBoundedWorldPointFromEvent(event);
        if (worldPoint) {
          const normalized = mapper.worldToNormalized(worldPoint);
          appendBasicRoutePoint({
            x: clampNormalizedValue(normalized.x),
            y: clampNormalizedValue(normalized.y),
          });
        }
      }
      return;
    }
    updateDraggedPlayerFromEvent(event);
    updateDraggedItemFromEvent(event);
    updateWhiteboardDrawing(event);
  }

  function handleStagePointerUp(event: unknown): void {
    if (isRouteCaptureMode && !isPlaybackInputLocked()) {
      const pointerId = getPointerIdFromEvent(event);
      if (routeCapturePointerId == null || pointerId == null || pointerId === routeCapturePointerId) {
        if (currentRouteDraftPlayerId && currentRouteDraftPoints.length >= 2) {
          const hasExistingRoute = routeByPlayerId.has(currentRouteDraftPlayerId);
          if (hasExistingRoute || routeByPlayerId.size < MAX_BASIC_ROUTE_PLAYERS) {
            routeByPlayerId.set(
              currentRouteDraftPlayerId,
              currentRouteDraftPoints.map((point) => ({ x: point.x, y: point.y })),
            );
            emitRouteStateChange();
          }
        }
        currentRouteDraftPoints = [];
        currentRouteDraftPlayerId = null;
        routeCapturePointerId = null;
        renderBasicRoutePreview();
      }
      return;
    }
    if (!isMatchingActivePointer(event)) return;
    endWhiteboardDrawing(event);
    releaseActiveDrag();
  }

  app.stage.on("pointermove", handleStagePointerMove);
  app.stage.on("pointerup", handleStagePointerUp);
  app.stage.on("pointerupoutside", handleStagePointerUp);
  app.stage.on("pointerdown", (event) => {
    if (activeDrag == null && activeWhiteboardTool === "move" && !isPlaybackInputLocked() && !isRouteCaptureMode) {
      const stagePoint = getStagePointFromEvent(event, app.stage);
      if (stagePoint) {
        clearSelectedItem();
      }
    }
  });
  whiteboardInputLayer.on("pointerdown", (event) => {
    if (isRouteCaptureMode && !isPlaybackInputLocked()) {
      releaseActiveDrag();
      clearSelectedItem();
      const worldPoint = getBoundedWorldPointFromEvent(event);
      if (!worldPoint) return;
      const previousSelectedPlayerId = selectedPlayerId;
      const tappedPlayer = findRouteSelectablePlayerAtWorldPoint(worldPoint);
      if (tappedPlayer) {
        selectedPlayerId = tappedPlayer.id;
        syncWhiteboardTokenInputMode();
        if (previousSelectedPlayerId !== tappedPlayer.id) return;
      }
      if (!selectedPlayerId) return;
      routeCapturePointerId = getPointerIdFromEvent(event);
      currentRouteDraftPlayerId = selectedPlayerId;
      currentRouteDraftPoints = [];
      const normalized = mapper.worldToNormalized(worldPoint);
      appendBasicRoutePoint({
        x: clampNormalizedValue(normalized.x),
        y: clampNormalizedValue(normalized.y),
      });
      return;
    }
    startWhiteboardDrawing(event);
  });
  app.ticker.add(() => {
    stepPlayback(app.ticker.deltaMS);
    stepBasicRouteFollow(app.ticker.deltaMS);
    animatePlayerDragVisuals(app.ticker.deltaMS);
  });

  syncWhiteboardTokenInputMode();

  const resizeObserver = new ResizeObserver(() => {
    fitToHost();
  });
  resizeObserver.observe(host);
  fitToHost();
  options.onPhaseCountChange?.(0);
  emitPlaybackStateChange();
  emitRouteStateChange();
  const pristineBoardState = cloneBoardStateSnapshot(captureBoardState());

  return {
    setStart: () => {
      releaseActiveDrag();
      clearSelectedItem();
      cancelBasicRouteFollow();
      clearRouteAssignments();
      setRouteCaptureModeState(false);
      cancelPlaybackAnimation();
      singlePlayTargetSnapshot = null;
      startPositions = captureCurrentSnapshot();
      phases = [];
      resetAllBallMovementPaths();
      options.onPhaseCountChange?.(0);
    },
    addPhase: () => {
      releaseActiveDrag();
      clearSelectedItem();
      cancelBasicRouteFollow();
      setRouteCaptureModeState(false);
      cancelPlaybackAnimation();
      singlePlayTargetSnapshot = null;
      phases = [...phases, captureCurrentSnapshot()];
      resetAllBallMovementPaths();
      options.onPhaseCountChange?.(phases.length);
    },
    undoPhase: () => {
      releaseActiveDrag();
      clearSelectedItem();
      cancelBasicRouteFollow();
      setRouteCaptureModeState(false);
      cancelPlaybackAnimation();
      singlePlayTargetSnapshot = null;
      if (phases.length <= 0) return;
      phases = phases.slice(0, -1);
      const previousSnapshot = phases[phases.length - 1] ?? startPositions;
      applySnapshotToSurface(previousSnapshot);
      options.onPhaseCountChange?.(phases.length);
    },
    newBoard: () => {
      if (surfaceVariant !== "tactical") return;
      cancelBasicRouteFollow();
      clearRouteAssignments();
      setRouteCaptureModeState(false);
      singlePlayTargetSnapshot = null;
      importBoardState(cloneBoardStateSnapshot(pristineBoardState));
    },
    play: handlePlay,
    pausePlayback: () => {
      if (!isPlaying) return;
      releaseActiveDrag();
      clearSelectedItem();
      resetActiveWhiteboardDrawing();
      isPlaying = false;
      isPaused = true;
      emitPlaybackStateChange();
    },
    resumePlayback: () => {
      if (!isPaused || playbackPath.length < 2) return;
      isPaused = false;
      isPlaying = true;
      emitPlaybackStateChange();
    },
    setPlaybackSpeedMultiplier: (multiplier) => {
      const sanitizedMultiplier = sanitizePlaybackSpeedMultiplier(multiplier);
      if (sanitizedMultiplier === playbackSpeedMultiplier) return;
      const previousMultiplier = playbackSpeedMultiplier;
      playbackSpeedMultiplier = sanitizedMultiplier;
      if ((isPlaying || isPaused) && playbackPath.length >= 2) {
        const previousSegmentDurationMs = PLAY_DURATION_MS / previousMultiplier;
        const progress =
          previousSegmentDurationMs > 0
            ? Math.max(0, Math.min(1, playElapsedMs / previousSegmentDurationMs))
            : 0;
        const nextSegmentDurationMs = PLAY_DURATION_MS / playbackSpeedMultiplier;
        playElapsedMs = Math.max(0, Math.min(nextSegmentDurationMs, progress * nextSegmentDurationMs));
      }
    },
    setPossessionPassMode: (enabled) => {
      if (surfaceVariant !== "tactical") return;
      isPossessionPassModeEnabled = Boolean(enabled);
      lastTappedPlayer = null;
    },
    freeBall: detachPrimaryBall,
    addTacticalPlayer,
    removeTacticalPlayer: removeLastTacticalPlayer,
    getTacticalPlayer: getTacticalPlayerSnapshot,
    patchTacticalPlayer,
    setItems: (items) => {
      upsertTacticalItems(items);
    },
    setItemMode: (mode) => {
      if (surfaceVariant !== "tactical") return;
      itemMode = mode;
      if (itemMode === "locked") {
        releaseActiveDrag();
        clearSelectedItem();
      }
      syncWhiteboardTokenInputMode();
      renderTacticalItems();
    },
    setRouteCaptureMode: (enabled) => {
      if (surfaceVariant !== "tactical") return;
      if (enabled) {
        releaseActiveDrag();
        clearSelectedItem();
      }
      setRouteCaptureModeState(enabled);
      if (enabled && activeWhiteboardTool !== "move") {
        activeWhiteboardTool = "move";
        tacticalDrawingController.setTool("move");
        renderAllWhiteboardDrawings();
      }
    },
    getRouteState: () => ({
      isRouteCaptureMode,
      routeCount: routeByPlayerId.size,
      maxRoutes: MAX_BASIC_ROUTE_PLAYERS,
    }),
    clearRoutes: () => {
      cancelBasicRouteFollow();
      clearRouteAssignments();
      setRouteCaptureModeState(false);
      singlePlayTargetSnapshot = null;
    },
    reset: () => {
      releaseActiveDrag();
      cancelPlaybackAnimation();
      cancelBasicRouteFollow({ restoreOrigin: true });
      applySnapshotToSurface(startPositions);
    },
    reflow: () => {
      fitToHost();
    },
    setWhiteboardTeamConfig: (config) => {
      if (isWhiteboardSurface) {
        rebuildWhiteboardPlayers(config.counts, config.colors);
        return;
      }
      if (surfaceVariant !== "tactical") return;
      tacticalTeamColors = {
        blue: config.colors.blue,
        red: config.colors.red,
      };
      rebuildTacticalPlayersWithColors();
    },
    setTacticalTokenStyle: (style) => {
      if (surfaceVariant !== "tactical") return;
      const nextStyle = sanitizePlayerTokenStyle(style);
      if (nextStyle === tacticalTokenStyle) return;
      tacticalTokenStyle = nextStyle;
      rerenderAllTacticalPlayers();
    },
    setWhiteboardDrawTool: (tool) => {
      if (!isDrawingEnabledSurface) return;
      if (tool !== "move") {
        releaseActiveDrag();
        clearSelectedItem();
        if (isRouteCaptureMode) {
          setRouteCaptureModeState(false);
        }
      }
      activeWhiteboardTool = tool;
      tacticalDrawingController.setTool(sanitizeDrawingTool(tool) ?? "move");
      syncWhiteboardTokenInputMode();
      renderAllWhiteboardDrawings();
    },
    setWhiteboardDrawColor: (color) => {
      if (!isDrawingEnabledSurface) return;
      activeWhiteboardColor = color;
      tacticalDrawingController.setColor(activeWhiteboardColor);
      renderAllWhiteboardDrawings();
    },
    eraseWhiteboardPenStroke: () => {
      if (!isDrawingEnabledSurface) return;
      eraseLastPenStroke();
    },
    undoWhiteboardStroke: () => {
      if (!isDrawingEnabledSurface) return;
      tacticalDrawingController.undo();
    },
    clearWhiteboardStrokes: () => {
      if (!isDrawingEnabledSurface) return;
      tacticalDrawingController.clear();
    },
    exportBoardState: () => captureBoardState(),
    importBoardState: (state) => importBoardState(state),
    exportImageCanvas: () => {
      const rendererWithExtract = app.renderer as typeof app.renderer & {
        extract?: {
          canvas?: (target: unknown) => unknown;
        };
      };
      const extractCanvas = rendererWithExtract.extract?.canvas;
      if (typeof extractCanvas !== "function") {
        return null;
      }

      const resolveHtmlCanvas = (candidate: unknown): HTMLCanvasElement | null =>
        typeof HTMLCanvasElement !== "undefined" && candidate instanceof HTMLCanvasElement ? candidate : null;

      try {
        const extractedFromStage = resolveHtmlCanvas(extractCanvas(app.stage));
        if (extractedFromStage) {
          return extractedFromStage;
        }
      } catch {
        // Fall back to texture extraction path.
      }

      const generatedTexture = app.renderer.textureGenerator.generateTexture(app.stage);
      try {
        return resolveHtmlCanvas(extractCanvas(generatedTexture));
      } catch {
        return null;
      } finally {
        generatedTexture.destroy(true);
      }
    },
    destroy: () => {
      cancelBasicRouteFollow();
      clearRouteAssignments();
      resizeObserver.disconnect();
      app.stage.removeAllListeners();
      app.ticker.stop();
      pitchMount?.dispose();
      for (const item of tacticalItems) {
        item.graphic.removeAllListeners();
        item.graphic.destroy();
        item.selectionGraphic.destroy();
      }
      for (const player of players) {
        player.token.removeAllListeners();
      }
      try {
        host.removeChild(app.canvas as HTMLCanvasElement);
      } catch {
        // Canvas may already be detached.
      }
      app.destroy(true, { children: true, texture: true });
    },
  };
}
