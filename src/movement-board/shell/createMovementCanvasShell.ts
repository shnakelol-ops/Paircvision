import { Application, Container } from "pixi.js";

import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
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
import { createBasicRouteFollowSession, type BasicRouteFollowSession } from "../movement/basic-route-follow";
import { createRouteLayer } from "../routes/route-layer";
import { createTokenLayer } from "../tokens/token-layer";
import type {
  MovementBoardMode,
  MovementBoardRoute,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementCanvasShellOptions,
  MovementPlaybackScope,
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

type RouteDraftState = {
  tokenId: string;
  pointerId: number | null;
  points: NormalizedPoint[];
} | null;

type ActiveRouteRun = {
  tokenId: string;
  routePoint: { x: number; y: number };
  session: BasicRouteFollowSession;
};

const BASIC_ROUTE_FOLLOW_SPEED = 18;
const BASIC_ROUTE_MIN_POINT_DISTANCE = 0.9;
const ROUTE_POINT_EPSILON = 0.001;

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

function cloneNormalizedPoint(point: NormalizedPoint): NormalizedPoint {
  return { x: point.x, y: point.y };
}

function cloneRoute(playerId: string, points: readonly NormalizedPoint[]): MovementBoardRoute {
  return {
    playerId,
    points: points.map((point) => cloneNormalizedPoint(point)),
  };
}

function normalizeRoutePoints(points: readonly NormalizedPoint[]): NormalizedPoint[] {
  return points
    .map((point) => clampNormalizedPoint(point))
    .filter((point, index, all) => {
      if (index === 0) return true;
      const previous = all[index - 1];
      if (!previous) return true;
      return Math.hypot(previous.x - point.x, previous.y - point.y) > ROUTE_POINT_EPSILON;
    });
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

  const routeLayerContainer = new Container();
  routeLayerContainer.zIndex = 12;
  world.addChild(routeLayerContainer);
  world.sortChildren();

  let mapper: WorldViewportMapper = createWorldViewport(WORLD_SIZE, {
    width: host.clientWidth || 800,
    height: host.clientHeight || 520,
  });
  let dragEnabled = options.dragEnabled ?? true;
  let mode: MovementBoardMode = options.mode ?? "setup";
  let isPlaying = false;
  let playbackScope: MovementPlaybackScope | null = null;
  let activeDrag: DragState = null;
  let activeRouteRuns = new Map<string, ActiveRouteRun>();
  let routeDraft: RouteDraftState = null;
  let selectedTokenId: string | null = null;
  let routeByTokenId = new Map<string, NormalizedPoint[]>();
  let setupStartByTokenId = new Map<string, NormalizedPoint>();

  const tokenLayer = createTokenLayer({
    layer: tokenLayerContainer,
    mapperProvider: () => mapper,
  });
  const routeLayer = createRouteLayer({
    layer: routeLayerContainer,
    mapperProvider: () => mapper,
  });

  tokenLayer.setTokens(options.initialTokens ?? buildDefaultTokens());
  for (const token of tokenLayer.getTokens()) {
    setupStartByTokenId.set(token.id, cloneNormalizedPoint(token.position));
  }

  const emitPlaybackStateChange = () => {
    options.onPlaybackStateChange?.({ isPlaying, scope: playbackScope });
  };

  const emitRoutesChange = () => {
    options.onRoutesChange?.(
      Array.from(routeByTokenId.entries()).map(([playerId, points]) =>
        cloneRoute(playerId, points),
      ),
    );
  };

  const refreshRouteLayer = () => {
    routeLayer.setRoutes(
      Array.from(routeByTokenId.entries()).map(([playerId, points]) =>
        cloneRoute(playerId, points),
      ),
    );
    routeLayer.setDraftRoute(
      routeDraft
        ? {
            playerId: routeDraft.tokenId,
            points: routeDraft.points.map((point) => cloneNormalizedPoint(point)),
          }
        : null,
    );
    routeLayer.setSelectedPlayer(selectedTokenId);
  };

  const setSelectedToken = (tokenId: string | null): MovementBoardToken | null => {
    const selectedToken = tokenLayer.setSelectedToken(tokenId);
    selectedTokenId = tokenLayer.getSelectedTokenId();
    routeLayer.setSelectedPlayer(selectedTokenId);
    options.onSelectedTokenChange?.(selectedToken ? { ...selectedToken, position: { ...selectedToken.position } } : null);
    return selectedToken;
  };

  const clearRouteDraft = () => {
    routeDraft = null;
    refreshRouteLayer();
  };

  const cancelPlayback = () => {
    for (const run of activeRouteRuns.values()) {
      run.session.cancel();
    }
    activeRouteRuns.clear();
    if (!isPlaying) return;
    isPlaying = false;
    playbackScope = null;
    emitPlaybackStateChange();
  };

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
    routeLayer.syncToMapper();
  };

  const canDragTokens = () => dragEnabled && mode === "setup" && !isPlaying;

  tokenLayer.setOnTokenPointerDown((tokenId, event) => {
    (event as { stopPropagation?: () => void }).stopPropagation?.();
    setSelectedToken(tokenId);
    if (!canDragTokens()) return;
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
    tokenLayer.setDraggingToken(tokenId);
  });

  const appendRoutePoint = (point: NormalizedPoint) => {
    if (!routeDraft) return;
    const previous = routeDraft.points[routeDraft.points.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < BASIC_ROUTE_MIN_POINT_DISTANCE) {
      return;
    }
    routeDraft = {
      ...routeDraft,
      points: [...routeDraft.points, cloneNormalizedPoint(point)],
    };
    refreshRouteLayer();
  };

  const handleDragMove = (event: unknown) => {
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
      setupStartByTokenId.set(movedToken.id, cloneNormalizedPoint(movedToken.position));
      options.onTokenMove?.(movedToken);
    }
  };

  const handleRouteDraftMove = (event: unknown) => {
    if (!routeDraft) return;
    const pointerId = getPointerIdFromEvent(event);
    if (routeDraft.pointerId != null && pointerId != null && pointerId !== routeDraft.pointerId) return;
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld || !isWorldPointInsidePitch(pointerWorld)) return;
    appendRoutePoint(clampNormalizedPoint(mapper.worldToNormalized(pointerWorld)));
  };

  const handleStagePointerMove = (event: unknown) => {
    if (activeDrag) {
      handleDragMove(event);
      return;
    }
    if (routeDraft) {
      handleRouteDraftMove(event);
    }
  };

  const releaseDrag = () => {
    activeDrag = null;
    tokenLayer.setDraggingToken(null);
  };

  const finalizeRouteDraft = (event: unknown) => {
    if (!routeDraft) return;
    const pointerId = getPointerIdFromEvent(event);
    if (routeDraft.pointerId != null && pointerId != null && pointerId !== routeDraft.pointerId) return;
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (pointerWorld && isWorldPointInsidePitch(pointerWorld)) {
      appendRoutePoint(clampNormalizedPoint(mapper.worldToNormalized(pointerWorld)));
    }
    const normalizedPoints = normalizeRoutePoints(routeDraft.points);
    if (normalizedPoints.length >= 2) {
      routeByTokenId.set(routeDraft.tokenId, normalizedPoints);
      emitRoutesChange();
    }
    clearRouteDraft();
  };

  const releasePointer = (event: unknown) => {
    if (activeDrag) {
      releaseDrag();
      return;
    }
    if (routeDraft) {
      finalizeRouteDraft(event);
    }
  };

  const setMode = (nextMode: MovementBoardMode) => {
    if (nextMode === mode) return;
    mode = nextMode;
    releaseDrag();
    clearRouteDraft();
  };

  const play = (scope: MovementPlaybackScope = "selected") => {
    if (isPlaying) return;
    const allTokens = tokenLayer.getTokens();
    const currentById = new Map(allTokens.map((token) => [token.id, token]));
    const targetTokenIds =
      scope === "selected"
        ? selectedTokenId
          ? [selectedTokenId]
          : []
        : allTokens.map((token) => token.id);
    if (targetTokenIds.length <= 0) return;

    const nextRuns = new Map<string, ActiveRouteRun>();
    for (const tokenId of targetTokenIds) {
      const token = currentById.get(tokenId);
      if (!token) continue;
      const startPosition = setupStartByTokenId.get(tokenId) ?? cloneNormalizedPoint(token.position);
      const assignedRoute = routeByTokenId.get(tokenId);
      const playbackRoute =
        assignedRoute && assignedRoute.length >= 2
          ? normalizeRoutePoints([startPosition, ...assignedRoute])
          : normalizeRoutePoints([startPosition, token.position]);
      if (playbackRoute.length < 2) continue;
      tokenLayer.setTokenPosition(tokenId, startPosition);
      const routePoint = cloneNormalizedPoint(startPosition);
      const session = createBasicRouteFollowSession({
        target: routePoint,
        route: playbackRoute,
        speed: BASIC_ROUTE_FOLLOW_SPEED,
      });
      if (!session.isActive()) continue;
      nextRuns.set(tokenId, { tokenId, routePoint, session });
    }
    if (nextRuns.size <= 0) return;
    activeRouteRuns = nextRuns;
    isPlaying = true;
    playbackScope = scope;
    emitPlaybackStateChange();
    tokenLayer.setDraggingToken(null);
  };

  const stepPlayback = (deltaMs: number) => {
    if (!isPlaying || activeRouteRuns.size <= 0) return;
    const completed: string[] = [];
    for (const [tokenId, activeRun] of activeRouteRuns.entries()) {
      activeRun.session.step(deltaMs);
      const movedToken = tokenLayer.setTokenPosition(tokenId, clampNormalizedPoint(activeRun.routePoint));
      if (movedToken) {
        options.onTokenMove?.(movedToken);
      }
      if (!activeRun.session.isActive()) {
        completed.push(tokenId);
      }
    }
    for (const tokenId of completed) {
      activeRouteRuns.delete(tokenId);
    }
    if (activeRouteRuns.size <= 0) {
      isPlaying = false;
      playbackScope = null;
      emitPlaybackStateChange();
    }
  };

  const resetToSetup = () => {
    cancelPlayback();
    releaseDrag();
    clearRouteDraft();
    for (const token of tokenLayer.getTokens()) {
      const setupPoint = setupStartByTokenId.get(token.id);
      if (!setupPoint) continue;
      const movedToken = tokenLayer.setTokenPosition(token.id, setupPoint);
      if (movedToken) {
        options.onTokenMove?.(movedToken);
      }
    }
  };

  app.stage.on("globalpointermove", handleStagePointerMove);
  app.stage.on("pointerup", releasePointer);
  app.stage.on("pointerupoutside", releasePointer);
  app.stage.on("pointercancel", releasePointer);
  app.stage.on("pointerdown", (event) => {
    const worldPoint = getWorldPointFromEvent(event, app.stage, mapper);
    if (!worldPoint || !isWorldPointInsidePitch(worldPoint)) return;

    if (mode === "route" && selectedTokenId && !isPlaying) {
      const selectedToken = tokenLayer.getTokenById(selectedTokenId);
      if (!selectedToken) {
        setSelectedToken(null);
        return;
      }
      const pointerId = getPointerIdFromEvent(event);
      const routeStart = cloneNormalizedPoint(selectedToken.position);
      routeDraft = {
        tokenId: selectedToken.id,
        pointerId,
        points: [routeStart],
      };
      appendRoutePoint(clampNormalizedPoint(mapper.worldToNormalized(worldPoint)));
      return;
    }

    if (mode === "setup" && !isPlaying) {
      setSelectedToken(null);
    }
    const normalized = getNormalizedPointFromEvent(event, app.stage, mapper);
    if (!normalized) return;
    options.onPitchTap?.({ point: clampNormalizedPoint(normalized) });
  });

  const handleTick = () => {
    stepPlayback(app.ticker.deltaMS);
  };
  app.ticker.add(handleTick);

  const resizeObserver = new ResizeObserver(() => {
    syncToHost();
  });
  resizeObserver.observe(host);
  syncToHost();
  refreshRouteLayer();
  emitPlaybackStateChange();

  return {
    getTokens: () => tokenLayer.getTokens(),
    getSelectedToken: () => (selectedTokenId ? tokenLayer.getTokenById(selectedTokenId) : null),
    getMode: () => mode,
    getRoutes: () =>
      Array.from(routeByTokenId.entries()).map(([playerId, points]) => cloneRoute(playerId, points)),
    getRouteForToken: (tokenId) => {
      const points = routeByTokenId.get(tokenId);
      if (!points) return null;
      return cloneRoute(tokenId, points);
    },
    setTokens: (tokens) => {
      cancelPlayback();
      tokenLayer.setTokens(tokens);
      tokenLayer.syncToMapper();
      const nextIds = new Set(tokenLayer.getTokens().map((token) => token.id));
      for (const tokenId of Array.from(routeByTokenId.keys())) {
        if (!nextIds.has(tokenId)) {
          routeByTokenId.delete(tokenId);
        }
      }
      for (const tokenId of Array.from(setupStartByTokenId.keys())) {
        if (!nextIds.has(tokenId)) {
          setupStartByTokenId.delete(tokenId);
        }
      }
      for (const token of tokenLayer.getTokens()) {
        if (!setupStartByTokenId.has(token.id)) {
          setupStartByTokenId.set(token.id, cloneNormalizedPoint(token.position));
        }
      }
      if (selectedTokenId && !nextIds.has(selectedTokenId)) {
        setSelectedToken(null);
      }
      emitRoutesChange();
      refreshRouteLayer();
    },
    setSelectedToken: (tokenId) => setSelectedToken(tokenId),
    setMode: (nextMode) => {
      setMode(nextMode);
    },
    setRouteForToken: (tokenId, points) => {
      const token = tokenLayer.getTokenById(tokenId);
      if (!token) return null;
      const normalizedPoints = normalizeRoutePoints(points);
      if (normalizedPoints.length < 2) return null;
      routeByTokenId.set(tokenId, normalizedPoints);
      emitRoutesChange();
      refreshRouteLayer();
      return cloneRoute(tokenId, normalizedPoints);
    },
    clearRoutes: () => {
      routeByTokenId = new Map();
      clearRouteDraft();
      emitRoutesChange();
      refreshRouteLayer();
    },
    play: (scope) => {
      play(scope);
    },
    stopPlayback: () => {
      cancelPlayback();
    },
    reset: () => {
      resetToSetup();
    },
    isPlaying: () => isPlaying,
    setDragEnabled: (enabled) => {
      dragEnabled = enabled;
      if (!enabled) releaseDrag();
    },
    reflow: () => {
      syncToHost();
    },
    destroy: () => {
      cancelPlayback();
      resizeObserver.disconnect();
      tokenLayer.destroy();
      routeLayer.destroy();
      app.ticker.remove(handleTick);
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

