import { Container, Graphics } from "pixi.js";

import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import type { WorldViewportMapper } from "../coordinates/viewport";
import {
  createPremiumPlayerToken,
  PREMIUM_TOKEN_DRAG_SCALE,
  PREMIUM_TOKEN_DRAG_SHADOW_ALPHA,
  PREMIUM_TOKEN_IDLE_SCALE,
  PREMIUM_TOKEN_IDLE_SHADOW_ALPHA,
  type PremiumPlayerTokenColor,
} from "./createPremiumPlayerToken";
import type { MovementBoardToken } from "../shell/types";

type TokenVisual = {
  token: MovementBoardToken;
  node: Container;
  shadow: Graphics;
  selectionRing: Graphics;
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
  getSelectedTokenId: () => string | null;
  setTokenPosition: (tokenId: string, position: NormalizedPoint) => MovementBoardToken | null;
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setDraggingToken: (tokenId: string | null) => void;
  setRouteSelectionVisualActive: (active: boolean) => void;
  setRouteSelectionPulseTime: (timeMs: number) => void;
  setOnTokenPointerDown: (handler: ((tokenId: string, event: unknown) => void) | null) => void;
  syncToMapper: () => void;
  destroy: () => void;
};

const TOKEN_RADIUS = 4.1;
const TOKEN_TOUCH_HIT_DIAMETER_PX = 48;
const SELECTED_TOKEN_SCALE = 1.04;

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
  options.layer.sortableChildren = true;
  const visuals = new Map<string, TokenVisual>();
  let onTokenPointerDown = options.onTokenPointerDown ?? null;
  let selectedTokenId: string | null = null;
  let draggingTokenId: string | null = null;
  let routeSelectionVisualActive = false;
  let routeSelectionPulseTimeMs = 0;

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

  const copyToken = (token: MovementBoardToken): MovementBoardToken => ({
    ...token,
    position: { ...token.position },
  });

  const syncVisual = (visual: TokenVisual, mapper: WorldViewportMapper) => {
    const worldPoint = mapper.normalizedToWorld(visual.token.position);
    visual.node.position.set(worldPoint.x, worldPoint.y);
    setTouchHitArea(visual, mapper);
  };

  const applyInteractionVisuals = (visual: TokenVisual) => {
    const isSelected = selectedTokenId != null && visual.token.id === selectedTokenId;
    const isDragging = draggingTokenId != null && visual.token.id === draggingTokenId;
    const routeSelected = routeSelectionVisualActive && isSelected;
    const pulse = routeSelected ? (Math.sin(routeSelectionPulseTimeMs * 0.006) + 1) * 0.5 : 0;
    visual.selectionRing.visible = isSelected;
    visual.selectionRing.alpha = isDragging ? 1 : routeSelected ? 0.9 + pulse * 0.1 : 0.92;
    visual.selectionRing.scale.set(routeSelected ? 1.02 + pulse * 0.09 : 1);
    visual.node.scale.set(
      isDragging
        ? PREMIUM_TOKEN_DRAG_SCALE
        : isSelected
          ? routeSelected
            ? SELECTED_TOKEN_SCALE + 0.02 + pulse * 0.01
            : SELECTED_TOKEN_SCALE
          : PREMIUM_TOKEN_IDLE_SCALE,
      isDragging
        ? PREMIUM_TOKEN_DRAG_SCALE
        : isSelected
          ? routeSelected
            ? SELECTED_TOKEN_SCALE + 0.02 + pulse * 0.01
            : SELECTED_TOKEN_SCALE
          : PREMIUM_TOKEN_IDLE_SCALE,
    );
    visual.shadow.alpha = isDragging ? PREMIUM_TOKEN_DRAG_SHADOW_ALPHA : PREMIUM_TOKEN_IDLE_SHADOW_ALPHA;
    visual.node.zIndex = isDragging ? 3 : isSelected ? 2 : 1;
    visual.node.cursor = visual.token.draggable === false ? "default" : isDragging ? "grabbing" : "grab";
  };

  const refreshInteractionVisuals = () => {
    for (const visual of visuals.values()) {
      applyInteractionVisuals(visual);
    }
    options.layer.sortChildren();
  };

  const createVisual = (token: MovementBoardToken): TokenVisual => {
    const nextToken = sanitizeToken(token);
    const { token: node, shadow } = createPremiumPlayerToken({
      color: nextToken.color,
      number: nextToken.number,
      label: nextToken.label,
      radius: TOKEN_RADIUS,
    });
    node.eventMode = "static";
    node.cursor = nextToken.draggable === false ? "default" : "grab";
    const ringNode = new Graphics();
    ringNode
      .circle(0, 0, TOKEN_RADIUS * 1.28)
      .stroke({ color: 0xe9fff2, width: 0.66, alpha: 0.96, alignment: 0.5 })
      .circle(0, 0, TOKEN_RADIUS * 1.48)
      .stroke({ color: 0x7cedb8, width: 0.3, alpha: 0.84, alignment: 0.5 });
    ringNode.visible = false;
    ringNode.eventMode = "none";
    node.addChild(ringNode);
    node.on("pointerdown", (event) => {
      onTokenPointerDown?.(nextToken.id, event);
    });
    options.layer.addChild(node);
    const visual: TokenVisual = {
      token: nextToken,
      node,
      shadow,
      selectionRing: ringNode,
    };
    syncVisual(visual, options.mapperProvider());
    applyInteractionVisuals(visual);
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
    if (selectedTokenId != null && !visuals.has(selectedTokenId)) {
      selectedTokenId = null;
    }
    if (draggingTokenId != null && !visuals.has(draggingTokenId)) {
      draggingTokenId = null;
    }
    refreshInteractionVisuals();
  };

  return {
    setTokens: (tokens) => {
      rebuild(tokens);
    },
    getTokens: () => Array.from(visuals.values()).map((visual) => ({ ...visual.token, position: { ...visual.token.position } })),
    getTokenById: (tokenId) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      return copyToken(visual.token);
    },
    getSelectedTokenId: () => selectedTokenId,
    setTokenPosition: (tokenId, position) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      visual.token = {
        ...visual.token,
        position: clampNormalizedPoint(position),
      };
      syncVisual(visual, options.mapperProvider());
      return copyToken(visual.token);
    },
    setSelectedToken: (tokenId) => {
      const nextSelected = tokenId && visuals.has(tokenId) ? tokenId : null;
      if (selectedTokenId === nextSelected) {
        if (!nextSelected) return null;
        const currentSelected = visuals.get(nextSelected);
        return currentSelected ? copyToken(currentSelected.token) : null;
      }
      selectedTokenId = nextSelected;
      refreshInteractionVisuals();
      if (!selectedTokenId) return null;
      const selected = visuals.get(selectedTokenId);
      if (!selected) return null;
      return copyToken(selected.token);
    },
    setDraggingToken: (tokenId) => {
      draggingTokenId = tokenId && visuals.has(tokenId) ? tokenId : null;
      refreshInteractionVisuals();
    },
    setRouteSelectionVisualActive: (active) => {
      const next = Boolean(active);
      if (routeSelectionVisualActive === next) return;
      routeSelectionVisualActive = next;
      refreshInteractionVisuals();
    },
    setRouteSelectionPulseTime: (timeMs) => {
      routeSelectionPulseTimeMs = Number.isFinite(timeMs) ? timeMs : routeSelectionPulseTimeMs;
      if (!routeSelectionVisualActive || !selectedTokenId) return;
      refreshInteractionVisuals();
    },
    setOnTokenPointerDown: (handler) => {
      onTokenPointerDown = handler;
    },
    syncToMapper: () => {
      const mapper = options.mapperProvider();
      for (const visual of visuals.values()) {
        syncVisual(visual, mapper);
      }
      refreshInteractionVisuals();
    },
    destroy: () => {
      for (const visual of visuals.values()) {
        destroyVisual(visual);
      }
      visuals.clear();
    },
  };
}

