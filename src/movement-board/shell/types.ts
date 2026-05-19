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

export type MovementCanvasShellOptions = {
  sport?: PitchSport;
  dragEnabled?: boolean;
  initialTokens?: MovementBoardToken[];
  onPitchTap?: (payload: MovementCanvasTapPayload) => void;
  onTokenMove?: (token: MovementBoardToken) => void;
  onSelectedTokenChange?: (token: MovementBoardToken | null) => void;
};

export type MovementCanvasShellHandle = {
  getTokens: () => MovementBoardToken[];
  getSelectedToken: () => MovementBoardToken | null;
  setTokens: (tokens: readonly MovementBoardToken[]) => void;
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setDragEnabled: (enabled: boolean) => void;
  reflow: () => void;
  destroy: () => void;
};

