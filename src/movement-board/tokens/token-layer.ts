import { Container } from "pixi.js";

import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import type { WorldViewportMapper } from "../coordinates/viewport";
import {
  createPremiumPlayerToken,
  type PremiumPlayerTokenColor,
} from "./createPremiumPlayerToken";
import type { MovementBoardToken } from "../shell/types";

type TokenVisual = {
  token: MovementBoardToken;
  node: Container;
};

type CreateTokenLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
  onTokenPointerDown?: (tokenId: string, event: unknown) => void;
};

export type TokenLayer = {
  setTokens: (tokens: readonly MovementBoardToken[]) => void;
  getTokens: () => MovementBoardToken[];
  getTokenById: (tokenId: string) => MovementBoardToken | null;
  setTokenPosition: (tokenId: string, position: NormalizedPoint) => MovementBoardToken | null;
  setOnTokenPointerDown: (handler: ((tokenId: string, event: unknown) => void) | null) => void;
  syncToMapper: () => void;
  destroy: () => void;
};

const TOKEN_RADIUS = 4.1;
const TOKEN_TOUCH_HIT_DIAMETER_PX = 48;

function sanitizeTokenColor(input: PremiumPlayerTokenColor | string): PremiumPlayerTokenColor {
  if (input === "blue" || input === "red" || input === "yellow" || input === "black") return input;
  return "blue";
}

function sanitizeToken(token: MovementBoardToken): MovementBoardToken {
  return {
    id: token.id.trim(),
    number: Number.isFinite(token.number) ? Math.max(1, Math.floor(token.number)) : 1,
    label: token.label?.trim() || undefined,
    color: sanitizeTokenColor(token.color),
    position: clampNormalizedPoint(token.position),
    draggable: token.draggable !== false,
  };
}

export function createTokenLayer(options: CreateTokenLayerOptions): TokenLayer {
  const visuals = new Map<string, TokenVisual>();
  let onTokenPointerDown = options.onTokenPointerDown ?? null;

  const setTouchHitArea = (visual: TokenVisual, mapper: WorldViewportMapper) => {
    const touchRadiusInWorld = (TOKEN_TOUCH_HIT_DIAMETER_PX * 0.5) / Math.max(0.001, mapper.transform.scale);
    const hitRadius = Math.max(TOKEN_RADIUS, touchRadiusInWorld);
    visual.node.hitArea = {
      contains: (x: number, y: number) => {
        const dx = x;
        const dy = y;
        return dx * dx + dy * dy <= hitRadius * hitRadius;
      },
    };
  };

  const syncVisual = (visual: TokenVisual, mapper: WorldViewportMapper) => {
    const worldPoint = mapper.normalizedToWorld(visual.token.position);
    visual.node.position.set(worldPoint.x, worldPoint.y);
    setTouchHitArea(visual, mapper);
  };

  const createVisual = (token: MovementBoardToken): TokenVisual => {
    const nextToken = sanitizeToken(token);
    const { token: node } = createPremiumPlayerToken({
      color: nextToken.color,
      number: nextToken.number,
      label: nextToken.label,
      radius: TOKEN_RADIUS,
    });
    node.eventMode = "static";
    node.cursor = nextToken.draggable === false ? "default" : "grab";
    node.on("pointerdown", (event) => {
      onTokenPointerDown?.(nextToken.id, event);
    });
    options.layer.addChild(node);
    const visual: TokenVisual = {
      token: nextToken,
      node,
    };
    syncVisual(visual, options.mapperProvider());
    return visual;
  };

  const destroyVisual = (visual: TokenVisual) => {
    visual.node.removeAllListeners();
    visual.node.destroy({ children: true });
  };

  const rebuild = (tokens: readonly MovementBoardToken[]) => {
    for (const visual of visuals.values()) {
      destroyVisual(visual);
    }
    visuals.clear();
    for (const token of tokens) {
      const sanitized = sanitizeToken(token);
      if (!sanitized.id) continue;
      if (visuals.has(sanitized.id)) continue;
      const visual = createVisual(sanitized);
      visuals.set(sanitized.id, visual);
    }
  };

  return {
    setTokens: (tokens) => {
      rebuild(tokens);
    },
    getTokens: () => Array.from(visuals.values()).map((visual) => ({ ...visual.token, position: { ...visual.token.position } })),
    getTokenById: (tokenId) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      return { ...visual.token, position: { ...visual.token.position } };
    },
    setTokenPosition: (tokenId, position) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      visual.token = {
        ...visual.token,
        position: clampNormalizedPoint(position),
      };
      syncVisual(visual, options.mapperProvider());
      return { ...visual.token, position: { ...visual.token.position } };
    },
    setOnTokenPointerDown: (handler) => {
      onTokenPointerDown = handler;
    },
    syncToMapper: () => {
      const mapper = options.mapperProvider();
      for (const visual of visuals.values()) {
        syncVisual(visual, mapper);
      }
    },
    destroy: () => {
      for (const visual of visuals.values()) {
        destroyVisual(visual);
      }
      visuals.clear();
    },
  };
}

