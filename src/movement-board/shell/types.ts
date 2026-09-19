import type { PitchSport } from "../pitch/pitch-config";
import type { NormalizedPoint } from "../coordinates/normalization";
import type { PremiumPlayerTokenColor } from "../tokens/createPremiumPlayerToken";
import type { TokenSize, TokenRendererName } from "../tokens/token-layer";
import type { RouteVisibilityMode } from "../routes/route-visibility";
import type { VisionV3KitPattern } from "../../engine/pixi/createVisionV3PlayerToken";
import type {
  TacticalDrawingTool,
  TacticalDrawingSnapshot,
} from "../../features/quickboard/drawing/tacticalDrawingTypes";

export type { TacticalDrawingTool, TacticalDrawingSnapshot };

export type { PremiumPlayerTokenColor };
export type { TokenSize, TokenRendererName };
export type { RouteVisibilityMode };

export type BallType = "footballSmall" | "footballMedium" | "sliotarSmall" | "sliotarMedium";

export type BallState = {
  carrierId?: string;
  position?: NormalizedPoint;
  ballType?: BallType;
};

export type MovementBoardToken = {
  id: string;
  number: number;
  label?: string;
  color: PremiumPlayerTokenColor;
  secondaryColor?: PremiumPlayerTokenColor;
  position: NormalizedPoint;
  draggable?: boolean;
  isGhost?: boolean;
  team?: "home" | "away";
  // Training role, independent of `team`. Undefined behaves exactly like
  // "team" (today's behaviour) so existing saved Tactical Plays are
  // unaffected.
  playerRole?: "team" | "bib";
  // Kit-appearance fields (PáircVision Vision V3 visual language). Product
  // model: KIT belongs to the TEAM, not the player — these fields are never
  // edited per-token by a coach. They are derived, kept in sync with
  // whichever team-level kit currently applies (Our Team / Goalkeeper
  // override / Bib-Opposition — see applyTeamKitsToTokens in
  // features/vision-tactics/teamKit.ts), and exist here only because the
  // renderer operates per-token. `color` (above, existing field) doubles as
  // kit base colour, kept in sync the same way — no separate kitBaseColor
  // field. `kitPattern` is the canonical 6-value union re-exported from
  // createVisionV3PlayerToken.ts (the actual renderer's own type), never
  // duplicated. Both optional and additive: a token with neither set
  // renders exactly as it did before this feature existed.
  kitPattern?: VisionV3KitPattern;
  kitPatternColor?: PremiumPlayerTokenColor;
};

export type MovementCanvasTapPayload = {
  point: NormalizedPoint;
};

// "draw" is Game Timing's tactical-annotation authoring mode (PR4) — the
// pitch pointer is owned exclusively by the shared drawing controller while
// active, mutually exclusive with "setup" (token/ball interaction) and
// "route" (Draw Run / Edit Run route authoring). Standard Slate does not use
// this shell/mode; its own drawing system is wired directly in
// createTacticalPadLiteSurface.ts and is unaffected by this addition.
export type MovementBoardMode = "setup" | "route" | "play" | "draw";

export type MovementPlaybackSpeed = "slow" | "normal" | "fast";

export type MovementConcept = "support-run" | "overlap" | "shadow-run" | "rotation" | "custom";

export type RouteMetadata = {
  concept?: MovementConcept;
  label?: string;
  delayMs?: number;
  triggeredBy?: string;
  sequenceIndex?: number;
};

export type MovementBoardRoute = {
  playerId: string;
  points: NormalizedPoint[];
  concept?: MovementConcept;
  label?: string;
  delayMs?: number;
  triggeredBy?: string;
  sequenceIndex?: number;
};

export type TacticalPassEvent = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  delayMs?: number;
  triggeredBy?: string;
};

export type TacticalShotEvent = {
  id: string;
  shooterId: string;
  delayMs: number;
};

export type ZoneShape = "rect" | "circle";
export type ZoneColor = "yellow" | "red" | "blue" | "green";
export type ZoneRecord = {
  id: string;
  shape: ZoneShape;
  color: ZoneColor;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  locked?: boolean;
};

export type TacticalTrainingItemType =
  | "cone"
  | "flatMarker"
  | "pole"
  | "mannequin"
  | "miniGoal"
  | "hoop";

export type TacticalTrainingItem = {
  id: string;
  type: TacticalTrainingItemType;
  x: number;
  y: number;
};

export type MovementPlaybackState = {
  isPlaying: boolean;
  isPaused: boolean;
};

export type MovementRouteEditState = {
  waypointCount: number;
  selectedWaypointIndex: number | null;
  canRemoveSelectedWaypoint: boolean;
};

export type MovementCanvasShellOptions = {
  sport?: PitchSport;
  mode?: MovementBoardMode;
  dragEnabled?: boolean;
  playbackSpeed?: MovementPlaybackSpeed;
  /** Coach-chosen authoring visibility for committed routes. Presentation only — never persisted. Defaults to "selected". */
  routeVisibilityMode?: RouteVisibilityMode;
  initialTokens?: MovementBoardToken[];
  onPitchTap?: (payload: MovementCanvasTapPayload) => void;
  onTokenMove?: (token: MovementBoardToken) => void;
  onSelectedTokenChange?: (token: MovementBoardToken | null) => void;
  onRoutesChange?: (routes: MovementBoardRoute[]) => void;
  onPlaybackStateChange?: (state: MovementPlaybackState) => void;
  onRouteEditStateChange?: (state: MovementRouteEditState) => void;
  onBallStateChange?: (state: BallState) => void;
  onPassEventsChange?: (events: TacticalPassEvent[]) => void;
  onZonesChange?: (zones: ZoneRecord[]) => void;
  onZoneSelectionChange?: (id: string | null) => void;
  onTrainingItemsChange?: (items: TacticalTrainingItem[]) => void;
  onTrainingItemSelectionChange?: (id: string | null) => void;
  onTokenTap?: (tokenId: string) => void;
  onTokenLongPress?: (tokenId: string) => void;
  /** Initial tactical-drawing tool/colour and any previously-saved drawings to restore on mount. */
  initialDrawingTool?: TacticalDrawingTool;
  initialDrawingColor?: number;
  initialDrawings?: readonly TacticalDrawingSnapshot[];
};

export type MovementCanvasShellHandle = {
  getTokens: () => MovementBoardToken[];
  getTokensAtStart: () => MovementBoardToken[];
  getSelectedToken: () => MovementBoardToken | null;
  getBallStateAtStart: () => BallState;
  getMode: () => MovementBoardMode;
  getRoutes: () => MovementBoardRoute[];
  getPlaybackSpeed: () => MovementPlaybackSpeed;
  getPlaybackState: () => MovementPlaybackState;
  getRouteEditState: () => MovementRouteEditState;
  setTokens: (tokens: readonly MovementBoardToken[]) => void;
  setRoutes: (routes: readonly MovementBoardRoute[]) => void;
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setTokenSize: (size: TokenSize) => void;
  getTokenSize: () => TokenSize;
  setTokenRenderer: (name: TokenRendererName) => void;
  setMode: (mode: MovementBoardMode) => void;
  setPlaybackSpeed: (speed: MovementPlaybackSpeed) => void;
  setSpeedMultiplier: (multiplier: number) => void;
  removeSelectedWaypoint: () => boolean;
  clearSelectedRoute: () => boolean;
  /** Sets which committed routes are rendered. Rendering only — routeByTokenId, playback and selection are untouched. */
  setRouteVisibilityMode: (mode: RouteVisibilityMode) => void;
  getRouteVisibilityMode: () => RouteVisibilityMode;
  playAll: () => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  reset: () => void;
  setStartPositions: () => void;
  giveBall: (playerId: string) => void;
  placeBall: (ballType: BallType, position?: NormalizedPoint) => void;
  removeBall: () => void;
  freeBall: () => void;
  getBallState: () => BallState;
  setDragEnabled: (enabled: boolean) => void;
  setBallCarrier: (tokenId: string | null) => void;
  setRouteMeta: (playerId: string, meta: Partial<RouteMetadata>) => void;
  getRouteMeta: (playerId: string) => RouteMetadata | null;
  setPassEvents: (events: readonly TacticalPassEvent[]) => void;
  getPassEvents: () => TacticalPassEvent[];
  addPassEvent: (event: TacticalPassEvent) => void;
  removePassEvent: (id: string) => void;
  passBallTo: (targetPlayerId: string) => void;
  shootToGoal: () => void;
  addShotEvent: (event: TacticalShotEvent) => void;
  getShotEvents: () => TacticalShotEvent[];
  removeShotEvent: (id: string) => void;
  getCanvas: () => HTMLCanvasElement | null;
  /** Extracts the current Pixi scene as a still image, excluding all DOM
   * chrome (which is never part of the canvas). Used by the unified Share
   * sheet's Tactical Play adapter. Returns null if extraction is unavailable. */
  exportImageCanvas: () => HTMLCanvasElement | null;
  setZones: (zones: readonly ZoneRecord[]) => void;
  getZones: () => ZoneRecord[];
  setSelectedZoneId: (id: string | null) => void;
  setTrainingItems: (items: readonly TacticalTrainingItem[]) => void;
  getTrainingItems: () => TacticalTrainingItem[];
  setSelectedTrainingItemId: (id: string | null) => void;
  reflow: () => void;
  /**
   * Sets the board orientation as a quarter-turn count (0 = landscape, 1/3 =
   * portrait). Presentational only — the world container rotates and elements
   * counter-rotate; coordinates, routes, timeline and saves are unaffected.
   */
  setOrientation: (quarterTurns: number) => void;
  // Tactical drawing (PR4) — thin pass-through to the same shared
  // src/features/quickboard/drawing/tacticalDrawingController used by
  // Standard Slate. Pointer routing into it (while mode === "draw") lives
  // inside the shell; these are just the tool/colour/persistence surface.
  setDrawingTool: (tool: TacticalDrawingTool) => void;
  getDrawingTool: () => TacticalDrawingTool;
  setDrawingColor: (color: number) => void;
  getDrawingColor: () => number;
  getDrawings: () => TacticalDrawingSnapshot[];
  setDrawings: (drawings: readonly TacticalDrawingSnapshot[]) => void;
  eraseLastDrawing: () => void;
  clearDrawings: () => void;
  destroy: () => void;
};

