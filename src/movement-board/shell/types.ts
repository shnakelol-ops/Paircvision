import type { PitchSport } from "../pitch/pitch-config";
import type { NormalizedPoint } from "../coordinates/normalization";
import type { PremiumPlayerTokenColor } from "../tokens/createPremiumPlayerToken";
import type { TokenSize, TokenRendererName } from "../tokens/token-layer";

export type { PremiumPlayerTokenColor };
export type { TokenSize, TokenRendererName };

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
};

export type MovementCanvasTapPayload = {
  point: NormalizedPoint;
};

export type MovementBoardMode = "setup" | "route" | "play";

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
};

export type MovementCanvasShellHandle = {
  getTokens: () => MovementBoardToken[];
  getSelectedToken: () => MovementBoardToken | null;
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
  setZones: (zones: readonly ZoneRecord[]) => void;
  getZones: () => ZoneRecord[];
  setSelectedZoneId: (id: string | null) => void;
  setTrainingItems: (items: readonly TacticalTrainingItem[]) => void;
  getTrainingItems: () => TacticalTrainingItem[];
  setSelectedTrainingItemId: (id: string | null) => void;
  reflow: () => void;
  destroy: () => void;
};

