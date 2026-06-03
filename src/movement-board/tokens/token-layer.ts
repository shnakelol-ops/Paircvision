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
import { createSimpleJerseyToken } from "./createSimpleJerseyToken";
import { createJerseyTokenV2 } from "./createJerseyTokenV2";

// Renderer toggle — swap here to compare variants at /movement-board-labs
//   createPremiumPlayerToken  → full athlete token
//   createSimpleJerseyToken   → plain rounded-rect badge
//   createJerseyTokenV2       → Pro Stats jersey silhouette (current)
const activeRenderer = createJerseyTokenV2;
import type { MovementBoardToken } from "../shell/types";

type TokenVisual = {
  token: MovementBoardToken;
  node: Container;
  body: Container;
  shadow: Graphics;
  ballMarker: Graphics;
  selectionRing: Graphics;
  movementAngle: number | null;
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
  setTokenMoving: (tokenId: string, angle: number | null) => void;
  setBallCarrier: (tokenId: string | null) => void;
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
    isGhost: token.isGhost === true,
  };
}

export function createTokenLayer(options: CreateTokenLayerOptions): TokenLayer {
  options.layer.sortableChildren = true;
  const visuals = new Map<string, TokenVisual>();
  let onTokenPointerDown = options.onTokenPointerDown ?? null;
  let selectedTokenId: string | null = null;
  let draggingTokenId: string | null = null;
  let ballCarrierTokenId: string | null = null;

  const setTouchHitArea = (visual: TokenVisual, mapper: WorldViewportMapper) => {
    const touchRadiusInWorld = (TOKEN_TOUCH_HIT_DIAMETER_PX * 0.5) / Math.max(0.001, mapper.transform.scale);
    const hitRadius = Math.max(TOKEN_RADIUS, touchRadiusInWorld);
    visual.node.hitArea = {
      contains: (x: number, y: number) => {
        return x * x + y * y <= hitRadius * hitRadius;
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

  /**
   * Single consolidated state application — handles all visual dimensions
   * (scale, shadow, rotation, ring, ghost, ball marker, z-index, cursor).
   * Call whenever any state variable changes.
   */
  const applyVisualState = (visual: TokenVisual) => {
    const isSelected = selectedTokenId === visual.token.id;
    const isDragging = draggingTokenId === visual.token.id;
    const isMoving = visual.movementAngle !== null;
    const isBallCarrier = ballCarrierTokenId === visual.token.id;
    const isGhost = visual.token.isGhost === true;

    // Body rotation toward movement heading (inner container only)
    visual.body.rotation = isMoving ? visual.movementAngle! : 0;

    // Outer scale
    const scale = isDragging
      ? PREMIUM_TOKEN_DRAG_SCALE
      : isSelected
        ? SELECTED_TOKEN_SCALE
        : PREMIUM_TOKEN_IDLE_SCALE;
    visual.node.scale.set(scale, scale);

    // Shadow — stays in outer container (never rotates), stretches on move/drag
    if (isMoving) {
      visual.shadow.alpha = 0.28;
      visual.shadow.scale.x = 1.22;
    } else if (isDragging) {
      visual.shadow.alpha = PREMIUM_TOKEN_DRAG_SHADOW_ALPHA;
      visual.shadow.scale.x = 1.15;
    } else {
      visual.shadow.alpha = PREMIUM_TOKEN_IDLE_SHADOW_ALPHA;
      visual.shadow.scale.x = 1.0;
    }

    // Ghost: fade the entire outer container (shadow included via inheritance)
    visual.node.alpha = isGhost ? 0.48 : 1.0;

    // Selection ring
    visual.selectionRing.visible = isSelected;
    visual.selectionRing.alpha = isDragging ? 1.0 : 0.92;

    // Z-index
    visual.node.zIndex = isDragging ? 3 : isSelected ? 2 : 1;

    // Cursor
    visual.node.cursor =
      visual.token.draggable === false ? "default" : isDragging ? "grabbing" : "grab";

    // Ball possession marker
    visual.ballMarker.visible = isBallCarrier;
  };

  const refreshAllVisualState = () => {
    for (const visual of visuals.values()) {
      applyVisualState(visual);
    }
    options.layer.sortChildren();
  };

  const createVisual = (token: MovementBoardToken): TokenVisual => {
    const nextToken = sanitizeToken(token);
    const { token: node, body, shadow, ballMarker } = activeRenderer({
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
      body,
      shadow,
      ballMarker,
      selectionRing: ringNode,
      movementAngle: null,
    };
    syncVisual(visual, options.mapperProvider());
    applyVisualState(visual);
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
    if (ballCarrierTokenId != null && !visuals.has(ballCarrierTokenId)) {
      ballCarrierTokenId = null;
    }
    refreshAllVisualState();
  };

  return {
    setTokens: (tokens) => {
      rebuild(tokens);
    },
    getTokens: () =>
      Array.from(visuals.values()).map((visual) => ({
        ...visual.token,
        position: { ...visual.token.position },
      })),
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
        const current = visuals.get(nextSelected);
        return current ? copyToken(current.token) : null;
      }
      selectedTokenId = nextSelected;
      refreshAllVisualState();
      if (!selectedTokenId) return null;
      const selected = visuals.get(selectedTokenId);
      if (!selected) return null;
      return copyToken(selected.token);
    },
    setDraggingToken: (tokenId) => {
      draggingTokenId = tokenId && visuals.has(tokenId) ? tokenId : null;
      refreshAllVisualState();
    },
    setTokenMoving: (tokenId, angle) => {
      const visual = visuals.get(tokenId);
      if (!visual) return;
      visual.movementAngle = angle;
      applyVisualState(visual);
    },
    setBallCarrier: (tokenId) => {
      const prev = ballCarrierTokenId;
      ballCarrierTokenId = tokenId && visuals.has(tokenId) ? tokenId : null;
      // Update previous carrier (clear marker) and new carrier (show marker)
      if (prev) {
        const prevVisual = visuals.get(prev);
        if (prevVisual) applyVisualState(prevVisual);
      }
      if (ballCarrierTokenId && ballCarrierTokenId !== prev) {
        const nextVisual = visuals.get(ballCarrierTokenId);
        if (nextVisual) applyVisualState(nextVisual);
      }
    },
    setOnTokenPointerDown: (handler) => {
      onTokenPointerDown = handler;
    },
    syncToMapper: () => {
      const mapper = options.mapperProvider();
      for (const visual of visuals.values()) {
        syncVisual(visual, mapper);
      }
      refreshAllVisualState();
    },
    destroy: () => {
      for (const visual of visuals.values()) {
        destroyVisual(visual);
      }
      visuals.clear();
    },
  };
}
