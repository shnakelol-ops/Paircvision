import { Application, Container } from "pixi.js";

import { clampNormalizedPoint } from "../coordinates/normalization";
import {
  createWorldViewport,
  type WorldViewportMapper,
} from "../coordinates/viewport";
import {
  getNormalizedPointFromEvent,
  getPointerIdFromEvent,
  getWorldPointFromEvent,
} from "../input/pointer-controller";
import { createPitchRoot } from "../pitch/create-pitch-root";
import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";
import { createTokenLayer } from "../tokens/token-layer";
import type {
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementCanvasShellOptions,
} from "./types";

const WORLD_SIZE = {
  width: BOARD_PITCH_VIEWBOX.w,
  height: BOARD_PITCH_VIEWBOX.h,
} as const;

type DragState = {
  tokenId: string;
  pointerId: number | null;
  offsetWorld: { x: number; y: number };
} | null;

function clampWorldPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_SIZE.width, point.x)),
    y: Math.max(0, Math.min(WORLD_SIZE.height, point.y)),
  };
}

function buildDefaultTokens(): MovementBoardToken[] {
  const rowSizes = [1, 2, 3, 4, 5] as const;
  const tokens: MovementBoardToken[] = [];
  let jersey = 1;
  for (let row = 0; row < rowSizes.length; row += 1) {
    const rowSize = rowSizes[row]!;
    const x = 12 + row * 18;
    for (let i = 0; i < rowSize; i += 1) {
      const y = ((i + 1) * 100) / (rowSize + 1);
      tokens.push({
        id: `setup-token-${jersey}`,
        number: jersey,
        color: "blue",
        position: { x, y },
      });
      jersey += 1;
    }
  }
  return tokens;
}

function isWorldPointInsidePitch(worldPoint: { x: number; y: number }): boolean {
  return (
    worldPoint.x >= 0 &&
    worldPoint.y >= 0 &&
    worldPoint.x <= WORLD_SIZE.width &&
    worldPoint.y <= WORLD_SIZE.height
  );
}

export async function createMovementCanvasShell(
  host: HTMLElement,
  options: MovementCanvasShellOptions = {},
): Promise<MovementCanvasShellHandle> {
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
  world.sortableChildren = true;
  app.stage.addChild(world);

  const pitchMount = createPitchRoot(options.sport ?? "gaelic");
  pitchMount.root.zIndex = 0;
  world.addChild(pitchMount.root);

  const tokenLayerContainer = new Container();
  tokenLayerContainer.zIndex = 20;
  world.addChild(tokenLayerContainer);
  world.sortChildren();

  let mapper: WorldViewportMapper = createWorldViewport(WORLD_SIZE, {
    width: host.clientWidth || 800,
    height: host.clientHeight || 520,
  });
  let dragEnabled = options.dragEnabled ?? true;
  let activeDrag: DragState = null;

  const tokenLayer = createTokenLayer({
    layer: tokenLayerContainer,
    mapperProvider: () => mapper,
  });

  tokenLayer.setTokens(options.initialTokens ?? buildDefaultTokens());

  const syncToHost = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    app.renderer.resolution = Math.min(2, window.devicePixelRatio || 1);
    app.renderer.resize(width, height);

    mapper = createWorldViewport(WORLD_SIZE, { width, height });
    world.scale.set(mapper.transform.scale, mapper.transform.scale);
    world.position.set(mapper.transform.offsetX, mapper.transform.offsetY);
    tokenLayer.syncToMapper();
  };

  tokenLayer.setOnTokenPointerDown((tokenId, event) => {
    (event as { stopPropagation?: () => void }).stopPropagation?.();
    if (!dragEnabled) return;
    const token = tokenLayer.getTokenById(tokenId);
    if (!token || token.draggable === false) return;
    const pointerId = getPointerIdFromEvent(event);
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld) return;
    const tokenWorld = mapper.normalizedToWorld(token.position);
    activeDrag = {
      tokenId,
      pointerId,
      offsetWorld: {
        x: tokenWorld.x - pointerWorld.x,
        y: tokenWorld.y - pointerWorld.y,
      },
    };
  });

  const handleStagePointerMove = (event: unknown) => {
    if (!activeDrag) return;
    const pointerId = getPointerIdFromEvent(event);
    if (activeDrag.pointerId != null && pointerId != null && pointerId !== activeDrag.pointerId) return;
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld) return;

    const nextWorld = clampWorldPoint({
      x: pointerWorld.x + activeDrag.offsetWorld.x,
      y: pointerWorld.y + activeDrag.offsetWorld.y,
    });
    const nextNormalized = clampNormalizedPoint(mapper.worldToNormalized(nextWorld));
    const movedToken = tokenLayer.setTokenPosition(activeDrag.tokenId, nextNormalized);
    if (movedToken) {
      options.onTokenMove?.(movedToken);
    }
  };

  const releaseDrag = () => {
    activeDrag = null;
  };

  app.stage.on("pointermove", handleStagePointerMove);
  app.stage.on("pointerup", releaseDrag);
  app.stage.on("pointerupoutside", releaseDrag);
  app.stage.on("pointerdown", (event) => {
    const worldPoint = getWorldPointFromEvent(event, app.stage, mapper);
    if (!worldPoint || !isWorldPointInsidePitch(worldPoint)) return;
    const normalized = getNormalizedPointFromEvent(event, app.stage, mapper);
    if (!normalized) return;
    options.onPitchTap?.({ point: clampNormalizedPoint(normalized) });
  });

  const resizeObserver = new ResizeObserver(() => {
    syncToHost();
  });
  resizeObserver.observe(host);
  syncToHost();

  return {
    getTokens: () => tokenLayer.getTokens(),
    setTokens: (tokens) => {
      tokenLayer.setTokens(tokens);
      tokenLayer.syncToMapper();
    },
    setDragEnabled: (enabled) => {
      dragEnabled = enabled;
      if (!enabled) releaseDrag();
    },
    reflow: () => {
      syncToHost();
    },
    destroy: () => {
      resizeObserver.disconnect();
      tokenLayer.destroy();
      app.stage.removeAllListeners();
      pitchMount.dispose();
      try {
        host.removeChild(app.canvas as HTMLCanvasElement);
      } catch {
        // Canvas may already be detached.
      }
      app.destroy(true, { children: true, texture: true });
    },
  };
}

