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
};

export type MovementCanvasTapPayload = {
  point: NormalizedPoint;
};

export type MovementBoardMode = "setup" | "route";

export type MovementBoardRoute = {
  playerId: string;
  points: NormalizedPoint[];
};

export type MovementPlaybackScope = "selected" | "all";

export type MovementPlaybackState = {
  isPlaying: boolean;
  scope: MovementPlaybackScope | null;
};

export type MovementCanvasShellOptions = {
  sport?: PitchSport;
  mode?: MovementBoardMode;
  dragEnabled?: boolean;
  initialTokens?: MovementBoardToken[];
  onPitchTap?: (payload: MovementCanvasTapPayload) => void;
  onTokenMove?: (token: MovementBoardToken) => void;
  onSelectedTokenChange?: (token: MovementBoardToken | null) => void;
  onRoutesChange?: (routes: MovementBoardRoute[]) => void;
  onPlaybackStateChange?: (state: MovementPlaybackState) => void;
};

export type MovementCanvasShellHandle = {
  getTokens: () => MovementBoardToken[];
  getSelectedToken: () => MovementBoardToken | null;
  getMode: () => MovementBoardMode;
  getRoutes: () => MovementBoardRoute[];
  getRouteForToken: (tokenId: string) => MovementBoardRoute | null;
  setTokens: (tokens: readonly MovementBoardToken[]) => void;
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setMode: (mode: MovementBoardMode) => void;
  setRouteForToken: (tokenId: string, points: readonly NormalizedPoint[]) => MovementBoardRoute | null;
  clearRoutes: () => void;
  play: (scope?: MovementPlaybackScope) => void;
  stopPlayback: () => void;
  reset: () => void;
  isPlaying: () => boolean;
  setDragEnabled: (enabled: boolean) => void;
  reflow: () => void;
  destroy: () => void;
};

