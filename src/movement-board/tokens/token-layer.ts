import { Container, Graphics } from "pixi.js";

import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import type { WorldViewportMapper } from "../coordinates/viewport";
import {
  PREMIUM_TOKEN_DRAG_SCALE,
  PREMIUM_TOKEN_DRAG_SHADOW_ALPHA,
  PREMIUM_TOKEN_IDLE_SCALE,
  PREMIUM_TOKEN_IDLE_SHADOW_ALPHA,
  type PremiumPlayerTokenColor,
} from "./createPremiumPlayerToken";
import { createJerseyTokenV2 } from "./createJerseyTokenV2";
import {
  createPixiToken,
  createPhosphorToken,
  createVisionV3Token,
  createPillToken,
  createNumberedPillToken,
  createUnderPillToken,
} from "./createCleanTokenAdapters";
import type { MovementBoardToken } from "../shell/types";

export type TokenRendererName = "pixi" | "vision" | "jersey" | "phosphor" | "pill" | "pill-numbered" | "pill-under";

type AnyRendererFn = typeof createJerseyTokenV2;

const RENDERER_MAP: Record<TokenRendererName, AnyRendererFn> = {
  pixi:            createPixiToken as AnyRendererFn,
  vision:          createVisionV3Token as AnyRendererFn,
  jersey:          createJerseyTokenV2,
  phosphor:        createPhosphorToken as AnyRendererFn,
  pill:            createPillToken as AnyRendererFn,
  "pill-numbered": createNumberedPillToken as AnyRendererFn,
  "pill-under":    createUnderPillToken as AnyRendererFn,
};

let _renderer: AnyRendererFn = createJerseyTokenV2;

// ── Token Size Mode ───────────────────────────────────────────────────────────
// small  (0.75×) — 25–30 player tactical view, numbers hidden
// medium (1.00×) — default coaching mode
// large  (1.25×) — teaching, Vision Flow clips, presentations
export type TokenSize = "small" | "medium" | "large";

const SIZE_FACTOR: Record<TokenSize, number> = {
  small: 0.75,
  medium: 1.0,
  large: 1.25,
};

const DEFAULT_TOKEN_SIZE: TokenSize = "medium";

type TokenVisual = {
  token: MovementBoardToken;
  node: Container;
  body: Container;
  shadow: Graphics;
  ballMarker: Graphics;
  selectionRing: Graphics;
  // Optional number label — present when renderer exposes it (V2+)
  numberLabel: { visible: boolean } | null;
  movementAngle: number | null;
};

type CreateTokenLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
  onTokenPointerDown?: (tokenId: string, event: unknown) => void;
  initialTokenSize?: TokenSize;
};

export type TokenLayer = {
  setTokens: (tokens: readonly MovementBoardToken[]) => void;
  getTokens: () => MovementBoardToken[];
  getTokenById: (tokenId: string) => MovementBoardToken | null;
  getTokenWorldPosition: (tokenId: string) => { x: number; y: number } | null;
  getSelectedTokenId: () => string | null;
  setTokenPosition: (tokenId: string, position: NormalizedPoint) => MovementBoardToken | null;
  setSelectedToken: (tokenId: string | null) => MovementBoardToken | null;
  setDraggingToken: (tokenId: string | null) => void;
  setTokenMoving: (tokenId: string, angle: number | null) => void;
  setBallCarrier: (tokenId: string | null) => void;
  setTokenSize: (size: TokenSize) => void;
  getTokenSize: () => TokenSize;
  setRenderer: (name: TokenRendererName) => void;
  setOnTokenPointerDown: (handler: ((tokenId: string, event: unknown) => void) | null) => void;
  syncToMapper: () => void;
  destroy: () => void;
};

const TOKEN_RADIUS = 4.1;
const TOKEN_TOUCH_HIT_DIAMETER_PX = 48;
const SELECTED_TOKEN_SCALE = 1.04;

function sanitizeTokenColor(input: PremiumPlayerTokenColor | string): PremiumPlayerTokenColor {
  if (
    input === "blue" || input === "red" || input === "yellow" || input === "black" ||
    input === "green" || input === "orange" || input === "purple" || input === "white"
  ) return input;
  return "blue";
}

function sanitizeToken(token: MovementBoardToken): MovementBoardToken {
  return {
    id: token.id.trim(),
    number: Number.isFinite(token.number) ? Math.max(1, Math.floor(token.number)) : 1,
    label: token.label?.trim() || undefined,
    color: sanitizeTokenColor(token.color),
    secondaryColor: token.secondaryColor ? sanitizeTokenColor(token.secondaryColor) : undefined,
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
  let currentSize: TokenSize = options.initialTokenSize ?? DEFAULT_TOKEN_SIZE;

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
   * Single consolidated state application — covers scale, shadow, number
   * visibility, ring, ghost, ball marker, z-index, cursor.
   * Body rotation is intentionally not set here — tokens remain upright.
   * Movement direction is communicated through routes, not token tilt.
   */
  const applyVisualState = (visual: TokenVisual) => {
    const isSelected = selectedTokenId === visual.token.id;
    const isDragging = draggingTokenId === visual.token.id;
    const isMoving = visual.movementAngle !== null;
    const isBallCarrier = ballCarrierTokenId === visual.token.id;
    const isGhost = visual.token.isGhost === true;
    const sizeFactor = SIZE_FACTOR[currentSize];

    // Tokens always remain upright — movement is shown through routes
    visual.body.rotation = 0;

    // Scale = interaction multiplier × size mode factor
    const baseScale = isDragging
      ? PREMIUM_TOKEN_DRAG_SCALE
      : isSelected
        ? SELECTED_TOKEN_SCALE
        : PREMIUM_TOKEN_IDLE_SCALE;
    visual.node.scale.set(baseScale * sizeFactor, baseScale * sizeFactor);

    // Shadow — never rotates, stretches subtly during movement/drag
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

    // Ghost: fade entire outer container
    visual.node.alpha = isGhost ? 0.48 : 1.0;

    // Number visibility — hidden in small mode to reduce clutter
    if (visual.numberLabel) {
      visual.numberLabel.visible = currentSize !== "small";
    }

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
    const result = _renderer({
      color: nextToken.color,
      secondaryColor: nextToken.secondaryColor,
      number: nextToken.number,
      label: nextToken.label,
      radius: TOKEN_RADIUS,
    });
    const { token: node, body, shadow, ballMarker } = result;
    const numberLabel = "numberLabel" in result ? result.numberLabel : null;

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
      numberLabel,
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
    if (selectedTokenId != null && !visuals.has(selectedTokenId)) selectedTokenId = null;
    if (draggingTokenId != null && !visuals.has(draggingTokenId)) draggingTokenId = null;
    if (ballCarrierTokenId != null && !visuals.has(ballCarrierTokenId)) ballCarrierTokenId = null;
    refreshAllVisualState();
  };

  const getCurrentTokenData = (): MovementBoardToken[] =>
    Array.from(visuals.values()).map((v) => ({ ...v.token, position: { ...v.token.position } }));

  return {
    setTokens: (tokens) => {
      rebuild(tokens);
    },
    getTokens: () =>
      Array.from(visuals.values()).map((v) => ({ ...v.token, position: { ...v.token.position } })),
    getTokenById: (tokenId) => {
      const visual = visuals.get(tokenId);
      return visual ? copyToken(visual.token) : null;
    },
    getTokenWorldPosition: (tokenId) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      return { x: visual.node.position.x, y: visual.node.position.y };
    },
    getSelectedTokenId: () => selectedTokenId,
    setTokenPosition: (tokenId, position) => {
      const visual = visuals.get(tokenId);
      if (!visual) return null;
      visual.token = { ...visual.token, position: clampNormalizedPoint(position) };
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
      return selected ? copyToken(selected.token) : null;
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
      if (prev) {
        const prevVisual = visuals.get(prev);
        if (prevVisual) applyVisualState(prevVisual);
      }
      if (ballCarrierTokenId && ballCarrierTokenId !== prev) {
        const nextVisual = visuals.get(ballCarrierTokenId);
        if (nextVisual) applyVisualState(nextVisual);
      }
    },
    setTokenSize: (size) => {
      if (currentSize === size) return;
      currentSize = size;
      refreshAllVisualState();
    },
    getTokenSize: () => currentSize,
    setRenderer: (name) => {
      _renderer = RENDERER_MAP[name];
      rebuild(getCurrentTokenData());
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
