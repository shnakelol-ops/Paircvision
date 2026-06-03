import type { PitchSport } from "../pitch/pitch-config";
import type { NormalizedPoint } from "../coordinates/normalization";
import type { PremiumPlayerTokenColor } from "../tokens/createPremiumPlayerToken";

export type MovementBoardToken = {
  id: string;
  number: number;
  label?: string;
  color: PremiumPlayerTokenColor;
  position: NormalizedPoint;
  draggable?: boolean;
  isGhost?: boolean;
};

export type MovementCanvasTapPayload = {
  point: NormalizedPoint;
};

export type MovementBoardMode = "setup" | "route" | "play";

export type MovementPlaybackSpeed = "slow" | "normal" | "fast";

export type MovementBoardRoute = {
  playerId: string;
  points: NormalizedPoint[];
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
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setMode: (mode: MovementBoardMode) => void;
  setPlaybackSpeed: (speed: MovementPlaybackSpeed) => void;
  removeSelectedWaypoint: () => boolean;
  clearSelectedRoute: () => boolean;
  playAll: () => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  reset: () => void;
  setDragEnabled: (enabled: boolean) => void;
  setBallCarrier: (tokenId: string | null) => void;
  reflow: () => void;
  destroy: () => void;
};

