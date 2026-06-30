import { Application, Container } from "pixi.js";
import { flushDeferredPasses, type DeferredPass } from "./flushDeferredPasses";

import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import { createWorldViewport, type WorldViewportMapper } from "../coordinates/viewport";
import {
  getNormalizedPointFromEvent,
  getPointerIdFromEvent,
  getStagePointFromEvent,
  getWorldPointFromEvent,
} from "../input/pointer-controller";
import { createTrainingItemLayer } from "../items/item-layer";
import { createPitchRoot } from "../pitch/create-pitch-root";
import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";
import { createBallLayer } from "../ball/ball-layer";
import { createPlaybackOrchestrator } from "../playback/playback-orchestrator";
import { createZoneLayer } from "../zones/zone-layer";
import { routeStyleForToken } from "../routes/route-colors";
import { createRouteLayer } from "../routes/route-layer";
import { normalizeRoutePoints } from "../routes/route-sampling";
import { buildDefaultTokens } from "../tokens/default-tokens";
import { createTokenLayer } from "../tokens/token-layer";
import type {
  BallState,
  BallType,
  MovementBoardMode,
  MovementBoardRoute,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementCanvasShellOptions,
  MovementRouteEditState,
  RouteMetadata,
  TacticalPassEvent,
  TacticalShotEvent,
} from "./types";

const WORLD_SIZE = {
  width: BOARD_PITCH_VIEWBOX.w,
  height: BOARD_PITCH_VIEWBOX.h,
} as const;

const ROUTE_MIN_POINT_DISTANCE = 0.9;
const POSITION_EPSILON = 0.0001;
const ROUTE_HANDLE_TOUCH_RADIUS_PX = 30;
const ROUTE_INSERT_TOUCH_DISTANCE_PX = 24;
const TAP_MOVE_THRESHOLD_PX = 10;
const LONG_PRESS_MS = 420;
const BALL_DRAG_HIT_RADIUS_WORLD = 5;

type DragState = {
  tokenId: string;
  pointerId: number | null;
  offsetWorld: { x: number; y: number };
} | null;

type BallDragState = {
  pointerId: number | null;
  offsetWorld: { x: number; y: number };
} | null;

type RouteDraftState = {
  tokenId: string;
  pointerId: number | null;
  points: NormalizedPoint[];
} | null;

type RouteHandleDragState = {
  tokenId: string;
  waypointIndex: number;
  pointerId: number | null;
  offsetWorld: { x: number; y: number };
} | null;

type ActiveBallPass = {
  fromWorld: { x: number; y: number };
  toPlayerId: string;
  toWorld?: { x: number; y: number };
  elapsedMs: number;
  durationMs: number;
  ballType: BallType;
};

function clampWorldPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_SIZE.width, point.x)),
    y: Math.max(0, Math.min(WORLD_SIZE.height, point.y)),
  };
}

function clonePoint(point: NormalizedPoint): NormalizedPoint {
  return { x: point.x, y: point.y };
}

function isWorldPointInsidePitch(worldPoint: { x: number; y: number }): boolean {
  return (
    worldPoint.x >= 0 &&
    worldPoint.y >= 0 &&
    worldPoint.x <= WORLD_SIZE.width &&
    worldPoint.y <= WORLD_SIZE.height
  );
}

function routesAreEqual(a: readonly NormalizedPoint[], b: readonly NormalizedPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const aPoint = a[index];
    const bPoint = b[index];
    if (!aPoint || !bPoint) return false;
    if (Math.abs(aPoint.x - bPoint.x) > POSITION_EPSILON) return false;
    if (Math.abs(aPoint.y - bPoint.y) > POSITION_EPSILON) return false;
  }
  return true;
}

function projectPointToSegment(
  point: { x: number; y: number },
  segmentStart: { x: number; y: number },
  segmentEnd: { x: number; y: number },
): { projected: { x: number; y: number }; distanceSquared: number } {
  const vx = segmentEnd.x - segmentStart.x;
  const vy = segmentEnd.y - segmentStart.y;
  const wx = point.x - segmentStart.x;
  const wy = point.y - segmentStart.y;
  const vv = vx * vx + vy * vy;
  const t = vv <= POSITION_EPSILON ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  const projected = {
    x: segmentStart.x + vx * t,
    y: segmentStart.y + vy * t,
  };
  const dx = point.x - projected.x;
  const dy = point.y - projected.y;
  return { projected, distanceSquared: dx * dx + dy * dy };
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

  const itemLayerContainer = new Container();
  itemLayerContainer.zIndex = 11;
  world.addChild(itemLayerContainer);

  const routeLayerContainer = new Container();
  routeLayerContainer.zIndex = 12;
  world.addChild(routeLayerContainer);

  const ballLayerContainer = new Container();
  ballLayerContainer.zIndex = 15;
  world.addChild(ballLayerContainer);

  const zoneLayerContainer = new Container();
  zoneLayerContainer.zIndex = 13;
  world.addChild(zoneLayerContainer);

  const tokenLayerContainer = new Container();
  tokenLayerContainer.zIndex = 20;
  world.addChild(tokenLayerContainer);
  world.sortChildren();

  let mapper: WorldViewportMapper = createWorldViewport(WORLD_SIZE, {
    width: host.clientWidth || 800,
    height: host.clientHeight || 520,
  });

  let dragEnabled = options.dragEnabled ?? true;
  let mode: MovementBoardMode = options.mode ?? "setup";
  let selectedTokenId: string | null = null;
  let selectedWaypointIndex: number | null = null;
  let activeDrag: DragState = null;
  let activeBallDrag: BallDragState = null;
  let activeRouteHandleDrag: RouteHandleDragState = null;
  let routeDraft: RouteDraftState = null;
  let tokenTapStart: { tokenId: string; x: number; y: number } | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTriggered = false;
  let routeByTokenId = new Map<string, NormalizedPoint[]>();
  let routeMetaByTokenId = new Map<string, RouteMetadata>();
  let startPositionByTokenId = new Map<string, NormalizedPoint>();

  const tokenLayer = createTokenLayer({
    layer: tokenLayerContainer,
    mapperProvider: () => mapper,
  });
  const routeLayer = createRouteLayer({
    layer: routeLayerContainer,
    mapperProvider: () => mapper,
    styleProvider: (playerId) => routeStyleForToken(tokenLayer.getTokenById(playerId)),
  });

  const zoneLayer = createZoneLayer({
    layer: zoneLayerContainer,
    mapperProvider: () => mapper,
    stage: app.stage,
    onZonesChange: (zs) => options.onZonesChange?.(zs),
    onSelectionChange: (id) => options.onZoneSelectionChange?.(id),
  });
  const trainingItemLayer = createTrainingItemLayer({
    layer: itemLayerContainer,
    mapperProvider: () => mapper,
    stage: app.stage,
    onItemsChange: (items) => options.onTrainingItemsChange?.(items),
    onSelectionChange: (id) => options.onTrainingItemSelectionChange?.(id),
  });

  tokenLayer.setTokens(options.initialTokens ?? buildDefaultTokens());
  for (const token of tokenLayer.getTokens()) {
    startPositionByTokenId.set(token.id, clonePoint(token.position));
  }

  const shootToGoalInternal = () => {
    if (!ballState.carrierId) return;
    const fromWorldPos = tokenLayer.getTokenWorldPosition(ballState.carrierId);
    if (!fromWorldPos) return;
    const goalWorld = { x: WORLD_SIZE.width, y: WORLD_SIZE.height / 2 };
    const dx = goalWorld.x - fromWorldPos.x;
    const dy = goalWorld.y - fromWorldPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const durationMs = Math.max(PASS_MIN_DURATION_MS, Math.min(PASS_MAX_DURATION_MS, dist / PASS_SPEED_PX_PER_MS));
    activeBallPass = { fromWorld: fromWorldPos, toPlayerId: "", toWorld: goalWorld, elapsedMs: 0, durationMs, ballType: ballState.ballType ?? "footballSmall" };
    ballState = { ballType: ballState.ballType };
    tokenLayer.setBallCarrier(null);
    emitBallState();
  };

  const orchestrator = createPlaybackOrchestrator(options.playbackSpeed ?? "normal", {
    getTokens: () => tokenLayer.getTokens(),
    getRoute: (tokenId) => routeByTokenId.get(tokenId) ?? null,
    getRouteMeta: (tokenId) => routeMetaByTokenId.get(tokenId) ?? null,
    getStartPosition: (tokenId) => startPositionByTokenId.get(tokenId) ?? null,
    getPassEvents: () => passEvents,
    getShotEvents: () => shotEvents,
    onPlaybackReset: (tokenId, startPosition) => {
      tokenLayer.setTokenPosition(tokenId, startPosition);
      tokenLayer.setTokenMoving(tokenId, null);
    },
    onTokenStep: (tokenId, position) => {
      const prev = tokenLayer.getTokenById(tokenId)?.position;
      const movedToken = tokenLayer.setTokenPosition(tokenId, position);
      if (movedToken && prev) {
        const dx = position.x - prev.x;
        const dy = position.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > POSITION_EPSILON) {
          // +π/2 aligns atan2 heading with the token's default upward orientation
          tokenLayer.setTokenMoving(tokenId, Math.atan2(dy, dx) + Math.PI / 2);
        }
      }
      if (movedToken) options.onTokenMove?.(movedToken);
    },
    onStateChange: (state) => {
      // Fade routes during playback so movement reads as animation, not diagram.
      // Pause partially restores so the coach can still see the intended path.
      if (state.isPlaying) {
        routeLayer.setPlaybackAlpha(0.12);
      } else if (state.isPaused) {
        routeLayer.setPlaybackAlpha(0.50);
      } else {
        routeLayer.setPlaybackAlpha(1.0);
      }
      zoneLayer.setInteractive(!state.isPlaying && !state.isPaused);
      trainingItemLayer.setInteractive(mode === "setup" && dragEnabled && !state.isPlaying && !state.isPaused);
      if (state.isPlaying || state.isPaused) activeBallDrag = null;
      syncBallInteraction();
      options.onPlaybackStateChange?.(state);
    },
    onPassStart: (fromPlayerId, toPlayerId) => {
      // If the ball isn't with this player yet (e.g. two zero-delay chained passes
      // fire in the same tick), defer until the previous pass lands.
      if (ballState.carrierId !== fromPlayerId) {
        deferredPasses.push({ fromPlayerId, toPlayerId });
        return;
      }
      startPassAnimation(fromPlayerId, toPlayerId);
    },
    onShotStart: (shooterId) => {
      if (ballState.carrierId !== shooterId) return;
      shootToGoalInternal();
    },
  });

  const ballLayer = createBallLayer(ballLayerContainer);
  let ballState: BallState = {};
  let ballStateAtPlayStart: BallState = {};
  let passEvents: TacticalPassEvent[] = [];
  let shotEvents: TacticalShotEvent[] = [];
  let activeBallPass: ActiveBallPass | null = null;
  let deferredPasses: DeferredPass[] = [];

  const BALL_CARRIER_OFFSET_X = 3.5;
  const BALL_CARRIER_OFFSET_Y = -2.5;
  const PASS_ARC_HEIGHT_PX = 10;
  const PASS_MIN_DURATION_MS = 850;
  const PASS_MAX_DURATION_MS = 1800;
  const PASS_SPEED_PX_PER_MS = 0.067;

  // Start pass flight animation. Safe to call only when ballState.carrierId === fromPlayerId.
  const startPassAnimation = (fromPlayerId: string, toPlayerId: string) => {
    const fromWorldPos = tokenLayer.getTokenWorldPosition(fromPlayerId);
    const toWorldPos = tokenLayer.getTokenWorldPosition(toPlayerId);
    let durationMs = 350;
    if (fromWorldPos && toWorldPos) {
      const dx = toWorldPos.x - fromWorldPos.x;
      const dy = toWorldPos.y - fromWorldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      durationMs = Math.max(PASS_MIN_DURATION_MS, Math.min(PASS_MAX_DURATION_MS, dist / PASS_SPEED_PX_PER_MS));
    }
    activeBallPass = {
      fromWorld: fromWorldPos ?? { x: WORLD_SIZE.width / 2, y: WORLD_SIZE.height / 2 },
      toPlayerId,
      elapsedMs: 0,
      durationMs,
      ballType: ballState.ballType ?? "footballSmall",
    };
    ballState = { ballType: ballState.ballType };
    tokenLayer.setBallCarrier(null);
    emitBallState();
  };

  const syncBallPosition = () => {
    if (activeBallPass) {
      const toWorldPos = activeBallPass.toWorld ?? tokenLayer.getTokenWorldPosition(activeBallPass.toPlayerId);
      if (toWorldPos) {
        const t = Math.min(1, activeBallPass.elapsedMs / activeBallPass.durationMs);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const arcY = -Math.sin(Math.PI * t) * PASS_ARC_HEIGHT_PX;
        const worldX = activeBallPass.fromWorld.x + (toWorldPos.x - activeBallPass.fromWorld.x) * eased;
        const worldY = activeBallPass.fromWorld.y + (toWorldPos.y - activeBallPass.fromWorld.y) * eased + arcY;
        ballLayer.setBallType(activeBallPass.ballType);
        ballLayer.setVisible(true);
        ballLayer.setBallPosition(worldX, worldY);
        return;
      }
      // Target token gone — cancel pass, fall through to normal
      activeBallPass = null;
    }

    if (!ballState.carrierId && !ballState.position) {
      ballLayer.setVisible(false);
      return;
    }

    let worldX: number;
    let worldY: number;

    if (ballState.carrierId) {
      const worldPos = tokenLayer.getTokenWorldPosition(ballState.carrierId);
      if (!worldPos) {
        ballLayer.setVisible(false);
        return;
      }
      worldX = worldPos.x + BALL_CARRIER_OFFSET_X;
      worldY = worldPos.y + BALL_CARRIER_OFFSET_Y;
    } else {
      const worldPos = mapper.normalizedToWorld(ballState.position!);
      worldX = worldPos.x;
      worldY = worldPos.y;
    }

    ballLayer.setBallType(ballState.ballType ?? "footballSmall");
    ballLayer.setVisible(true);
    ballLayer.setBallPosition(worldX, worldY);
  };

  const emitBallState = () => {
    syncBallInteraction();
    options.onBallStateChange?.({ ...ballState });
  };

  const emitPassEvents = () => {
    options.onPassEventsChange?.([...passEvents]);
  };

  const isPlaybackLocked = () => orchestrator.isLocked();
  const canInteractWithTrainingItems = () => dragEnabled && mode === "setup" && !isPlaybackLocked();
  trainingItemLayer.setInteractive(canInteractWithTrainingItems());

  const canDragFreeBall = () =>
    !!ballState.position && !ballState.carrierId && dragEnabled && !orchestrator.getState().isPlaying;

  const syncBallInteraction = () => {
    ballLayer.setInteractive(canDragFreeBall(), BALL_DRAG_HIT_RADIUS_WORLD);
  };

  ballLayer.setOnPointerDown((event) => {
    (event as { stopPropagation?: () => void }).stopPropagation?.();
    if (!canDragFreeBall() || activeDrag) return;
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld) return;
    const ballWorld = mapper.normalizedToWorld(ballState.position!);
    activeBallDrag = {
      pointerId: getPointerIdFromEvent(event),
      offsetWorld: {
        x: ballWorld.x - pointerWorld.x,
        y: ballWorld.y - pointerWorld.y,
      },
    };
  });

  const buildRoutesSnapshot = (): MovementBoardRoute[] =>
    Array.from(routeByTokenId.entries()).map(([playerId, points]) => ({
      playerId,
      points: points.map((point) => clonePoint(point)),
      ...(routeMetaByTokenId.get(playerId) ?? {}),
    }));

  const emitRoutes = () => {
    options.onRoutesChange?.(buildRoutesSnapshot());
  };

  const getRouteEditState = (): MovementRouteEditState => {
    const selectedRoute = selectedTokenId ? routeByTokenId.get(selectedTokenId) : null;
    const waypointCount = selectedRoute?.length ?? 0;
    const canRemoveSelectedWaypoint =
      selectedRoute != null &&
      selectedWaypointIndex != null &&
      selectedWaypointIndex > 0 &&
      selectedWaypointIndex < selectedRoute.length &&
      selectedRoute.length > 2;
    return {
      waypointCount,
      selectedWaypointIndex,
      canRemoveSelectedWaypoint,
    };
  };

  const emitRouteEditState = () => {
    options.onRouteEditStateChange?.(getRouteEditState());
  };

  const clearRouteDraft = () => {
    routeDraft = null;
    routeLayer.setDraftRoute(null);
  };

  const refreshRouteLayer = () => {
    routeLayer.setRoutes(
      Array.from(routeByTokenId.entries()).map(([playerId, points]) => ({
        playerId,
        points: points.map((point) => clonePoint(point)),
      })),
    );
    routeLayer.setDraftRoute(
      routeDraft
        ? {
            playerId: routeDraft.tokenId,
            points: routeDraft.points.map((point) => clonePoint(point)),
          }
        : null,
    );
    routeLayer.setSelectedPlayer(selectedTokenId);
    routeLayer.setSelectedWaypoint(selectedTokenId, selectedWaypointIndex);
  };

  const setSelectedWaypoint = (nextIndex: number | null) => {
    selectedWaypointIndex = nextIndex;
    routeLayer.setSelectedWaypoint(selectedTokenId, selectedWaypointIndex);
    emitRouteEditState();
  };

  const setSelectedToken = (tokenId: string | null): MovementBoardToken | null => {
    const selectedToken = tokenLayer.setSelectedToken(tokenId);
    selectedTokenId = tokenLayer.getSelectedTokenId();
    selectedWaypointIndex = null;
    routeLayer.setSelectedPlayer(selectedTokenId);
    routeLayer.setSelectedWaypoint(selectedTokenId, selectedWaypointIndex);
    options.onSelectedTokenChange?.(
      selectedToken ? { ...selectedToken, position: { ...selectedToken.position } } : null,
    );
    emitRouteEditState();
    return selectedToken;
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
    trainingItemLayer.syncToMapper();
    routeLayer.syncToMapper();
    zoneLayer.syncToMapper();
    syncBallPosition();
  };

  const releaseDrag = () => {
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    activeDrag = null;
    tokenTapStart = null;
    tokenLayer.setDraggingToken(null);
  };

  const releaseRouteHandleDrag = () => {
    activeRouteHandleDrag = null;
  };

  const finalizeBallDrag = (event: unknown) => {
    if (!activeBallDrag) return;
    const pointerId = getPointerIdFromEvent(event);
    if (activeBallDrag.pointerId != null && pointerId != null && pointerId !== activeBallDrag.pointerId) return;
    activeBallDrag = null;
    if (!orchestrator.isLocked()) {
      ballStateAtPlayStart = { ...ballState };
    }
    emitBallState();
  };

  const canDragTokens = () => dragEnabled && mode === "setup" && !isPlaybackLocked();

  const setModeState = (nextMode: MovementBoardMode) => {
    mode = nextMode;
    trainingItemLayer.setInteractive(canInteractWithTrainingItems());
    releaseDrag();
    releaseRouteHandleDrag();
    activeBallDrag = null;
    clearRouteDraft();
    if (mode !== "route") {
      setSelectedWaypoint(null);
    }
  };

  const setRouteForToken = (
    tokenId: string,
    nextPoints: readonly NormalizedPoint[],
    optionsForSet?: { normalize?: boolean },
  ) => {
    const shouldNormalize = optionsForSet?.normalize !== false;
    const updatedPoints = shouldNormalize
      ? normalizeRoutePoints(nextPoints, ROUTE_MIN_POINT_DISTANCE)
      : nextPoints.map((point) => clampNormalizedPoint(point));
    if (updatedPoints.length < 2) {
      routeByTokenId.delete(tokenId);
      if (selectedTokenId === tokenId) {
        setSelectedWaypoint(null);
      }
      emitRoutes();
      refreshRouteLayer();
      return;
    }

    routeByTokenId.set(tokenId, updatedPoints.map((point) => clonePoint(point)));
    if (selectedTokenId === tokenId && selectedWaypointIndex != null) {
      if (selectedWaypointIndex >= updatedPoints.length) {
        selectedWaypointIndex = updatedPoints.length - 1;
      }
    }
    emitRoutes();
    refreshRouteLayer();
    emitRouteEditState();
  };

  const appendRouteDraftPoint = (point: NormalizedPoint) => {
    if (!routeDraft) return;
    const previous = routeDraft.points[routeDraft.points.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < ROUTE_MIN_POINT_DISTANCE) {
      return;
    }
    routeDraft = {
      ...routeDraft,
      points: [...routeDraft.points, clonePoint(point)],
    };
    routeLayer.setDraftRoute({
      playerId: routeDraft.tokenId,
      points: routeDraft.points.map((entry) => clonePoint(entry)),
    });
  };

  const finalizeRouteDraft = (event: unknown) => {
    if (!routeDraft) return;
    const pointerId = getPointerIdFromEvent(event);
    if (routeDraft.pointerId != null && pointerId != null && pointerId !== routeDraft.pointerId) return;

    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (pointerWorld && isWorldPointInsidePitch(pointerWorld)) {
      appendRouteDraftPoint(clampNormalizedPoint(mapper.worldToNormalized(pointerWorld)));
    }

    const nextRoute = normalizeRoutePoints(routeDraft.points, ROUTE_MIN_POINT_DISTANCE);
    if (nextRoute.length >= 2) {
      const previousRoute = routeByTokenId.get(routeDraft.tokenId) ?? [];
      if (!routesAreEqual(previousRoute, nextRoute)) {
        setRouteForToken(routeDraft.tokenId, nextRoute);
      }
      setSelectedWaypoint(nextRoute.length - 1);
    }
    clearRouteDraft();
    refreshRouteLayer();
  };

  const findEditableWaypointIndexAtWorldPoint = (
    tokenId: string,
    worldPoint: { x: number; y: number },
  ): number | null => {
    const route = routeByTokenId.get(tokenId);
    if (!route || route.length < 2) return null;
    const hitRadiusWorld = ROUTE_HANDLE_TOUCH_RADIUS_PX / Math.max(0.001, mapper.transform.scale);
    const maxDistanceSquared = hitRadiusWorld * hitRadiusWorld;
    let closestIndex: number | null = null;
    let closestDistanceSquared = maxDistanceSquared;
    for (let index = 1; index < route.length; index += 1) {
      const point = route[index];
      if (!point) continue;
      const worldWaypoint = mapper.normalizedToWorld(point);
      const dx = worldPoint.x - worldWaypoint.x;
      const dy = worldPoint.y - worldWaypoint.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > closestDistanceSquared) continue;
      closestIndex = index;
      closestDistanceSquared = distanceSquared;
    }
    return closestIndex;
  };

  const findInsertionCandidateOnRoute = (
    tokenId: string,
    worldPoint: { x: number; y: number },
  ): { insertIndex: number; point: NormalizedPoint } | null => {
    const route = routeByTokenId.get(tokenId);
    if (!route || route.length < 2) return null;
    const thresholdWorld = ROUTE_INSERT_TOUCH_DISTANCE_PX / Math.max(0.001, mapper.transform.scale);
    const thresholdSquared = thresholdWorld * thresholdWorld;
    let bestCandidate:
      | {
          insertIndex: number;
          projectedWorld: { x: number; y: number };
          distanceSquared: number;
        }
      | null = null;

    for (let index = 0; index < route.length - 1; index += 1) {
      const start = route[index];
      const end = route[index + 1];
      if (!start || !end) continue;
      const projected = projectPointToSegment(
        worldPoint,
        mapper.normalizedToWorld(start),
        mapper.normalizedToWorld(end),
      );
      if (projected.distanceSquared > thresholdSquared) continue;
      if (bestCandidate && projected.distanceSquared >= bestCandidate.distanceSquared) continue;
      bestCandidate = {
        insertIndex: index + 1,
        projectedWorld: projected.projected,
        distanceSquared: projected.distanceSquared,
      };
    }

    if (!bestCandidate) return null;
    return {
      insertIndex: bestCandidate.insertIndex,
      point: clampNormalizedPoint(mapper.worldToNormalized(bestCandidate.projectedWorld)),
    };
  };

  const startPlayback = () => {
    const state = orchestrator.getState();
    if (state.isPlaying) return;
    if (!state.isPaused || !orchestrator.hasActiveRuns()) {
      // The orchestrator auto-stops as soon as all its pass timers fire, but ball
      // animations and the deferred-pass queue may still be completing. Resetting
      // here would kill the in-flight arc and drop queued passes (e.g. P3→P2 in a
      // 5-pass chain). Wait for the chain to fully resolve before accepting a restart.
      if (activeBallPass !== null || deferredPasses.length > 0) return;
      releaseDrag();
      releaseRouteHandleDrag();
      clearRouteDraft();
      // Restore ball to coach-configured start state rather than capturing current
      // (post-play) state — prevents ball looping back to previous pass destination.
      activeBallPass = null;
      deferredPasses = [];
      ballState = { ...ballStateAtPlayStart };
      tokenLayer.setBallCarrier(ballStateAtPlayStart.carrierId ?? null);
      emitBallState();
    }
    orchestrator.start();
    // Promote a shot for the initial ball carrier only when they have no
    // outgoing pass — if they do pass first, notifyPassLanded fires naturally
    // when the return pass arc completes.
    if (ballStateAtPlayStart.carrierId) {
      const hasOutgoingPass = passEvents.some(
        (e) => e.fromPlayerId === ballStateAtPlayStart.carrierId,
      );
      if (!hasOutgoingPass) {
        orchestrator.notifyPassLanded(ballStateAtPlayStart.carrierId);
      }
    }
  };

  const reset = () => {
    orchestrator.stop();
    activeBallPass = null;
    deferredPasses = [];
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    longPressTriggered = false;
    clearRouteDraft();
    releaseDrag();
    releaseRouteHandleDrag();
    for (const token of tokenLayer.getTokens()) {
      tokenLayer.setTokenMoving(token.id, null);
      const start = startPositionByTokenId.get(token.id);
      if (!start) continue;
      const movedToken = tokenLayer.setTokenPosition(token.id, start);
      if (movedToken) {
        options.onTokenMove?.(movedToken);
      }
    }
    ballState = { ...ballStateAtPlayStart };
    tokenLayer.setBallCarrier(ballStateAtPlayStart.carrierId ?? null);
    syncBallPosition();
    emitBallState();
  };

  tokenLayer.setOnTokenPointerDown((tokenId, event) => {
    if (mode === "route") return;
    (event as { stopPropagation?: () => void }).stopPropagation?.();
    setSelectedToken(tokenId);
    const tapStagePoint = getStagePointFromEvent(event, app.stage);
    tokenTapStart = tapStagePoint ? { tokenId, x: tapStagePoint.x, y: tapStagePoint.y } : null;
    longPressTriggered = false;
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (options.onTokenLongPress && !isPlaybackLocked()) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressTriggered = true;
        tokenTapStart = null;
        options.onTokenLongPress!(tokenId);
      }, LONG_PRESS_MS);
    }
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
    const nextPosition = clampNormalizedPoint(mapper.worldToNormalized(nextWorld));
    const movedToken = tokenLayer.setTokenPosition(activeDrag.tokenId, nextPosition);
    if (!movedToken) return;

    startPositionByTokenId.set(movedToken.id, clonePoint(movedToken.position));
    const route = routeByTokenId.get(movedToken.id);
    if (route && route.length > 0) {
      const anchoredRoute = route.map((point, index) =>
        index === 0 ? clonePoint(movedToken.position) : clonePoint(point),
      );
      setRouteForToken(movedToken.id, anchoredRoute);
    }
    options.onTokenMove?.(movedToken);
    syncBallPosition();
  };

  const handleRouteHandleDragMove = (event: unknown) => {
    if (!activeRouteHandleDrag) return;
    const pointerId = getPointerIdFromEvent(event);
    if (
      activeRouteHandleDrag.pointerId != null &&
      pointerId != null &&
      pointerId !== activeRouteHandleDrag.pointerId
    ) {
      return;
    }
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld) return;
    const route = routeByTokenId.get(activeRouteHandleDrag.tokenId);
    if (!route) {
      releaseRouteHandleDrag();
      return;
    }
    if (activeRouteHandleDrag.waypointIndex <= 0 || activeRouteHandleDrag.waypointIndex >= route.length) {
      releaseRouteHandleDrag();
      return;
    }

    const nextWorld = clampWorldPoint({
      x: pointerWorld.x + activeRouteHandleDrag.offsetWorld.x,
      y: pointerWorld.y + activeRouteHandleDrag.offsetWorld.y,
    });
    const nextPoint = clampNormalizedPoint(mapper.worldToNormalized(nextWorld));
    const nextRoute = route.map((point) => clonePoint(point));
    nextRoute[activeRouteHandleDrag.waypointIndex] = nextPoint;
    setRouteForToken(activeRouteHandleDrag.tokenId, nextRoute, { normalize: false });
    setSelectedWaypoint(activeRouteHandleDrag.waypointIndex);
  };

  const finalizeRouteHandleDrag = () => {
    if (!activeRouteHandleDrag) return;
    const route = routeByTokenId.get(activeRouteHandleDrag.tokenId);
    if (route) {
      setRouteForToken(activeRouteHandleDrag.tokenId, route, { normalize: true });
    }
    releaseRouteHandleDrag();
  };

  const handleRouteDraftMove = (event: unknown) => {
    if (!routeDraft) return;
    const pointerId = getPointerIdFromEvent(event);
    if (routeDraft.pointerId != null && pointerId != null && pointerId !== routeDraft.pointerId) return;
    const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
    if (!pointerWorld || !isWorldPointInsidePitch(pointerWorld)) return;
    appendRouteDraftPoint(clampNormalizedPoint(mapper.worldToNormalized(pointerWorld)));
  };

  const handleStagePointerMove = (event: unknown) => {
    // Cancel long-press if the finger has moved beyond the tap threshold.
    if (longPressTimer !== null && tokenTapStart) {
      const movePoint = getStagePointFromEvent(event, app.stage);
      if (movePoint) {
        const moved = Math.hypot(movePoint.x - tokenTapStart.x, movePoint.y - tokenTapStart.y);
        if (moved >= TAP_MOVE_THRESHOLD_PX) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    }
    if (activeDrag) {
      handleDragMove(event);
      return;
    }
    if (activeBallDrag) {
      const pointerId = getPointerIdFromEvent(event);
      if (activeBallDrag.pointerId == null || pointerId == null || pointerId === activeBallDrag.pointerId) {
        const pointerWorld = getWorldPointFromEvent(event, app.stage, mapper);
        if (pointerWorld) {
          const nextWorld = clampWorldPoint({
            x: pointerWorld.x + activeBallDrag.offsetWorld.x,
            y: pointerWorld.y + activeBallDrag.offsetWorld.y,
          });
          ballState = { position: clampNormalizedPoint(mapper.worldToNormalized(nextWorld)), ballType: ballState.ballType };
          syncBallPosition();
        }
      }
      return;
    }
    if (activeRouteHandleDrag) {
      handleRouteHandleDragMove(event);
      return;
    }
    if (routeDraft) {
      handleRouteDraftMove(event);
    }
  };

  const handlePointerRelease = (event: unknown) => {
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (longPressTriggered) { longPressTriggered = false; tokenTapStart = null; return; }
    if (tokenTapStart && (mode === "setup" || mode === "route") && !isPlaybackLocked()) {
      const endPoint = getStagePointFromEvent(event, app.stage);
      const moved = endPoint
        ? Math.hypot(endPoint.x - tokenTapStart.x, endPoint.y - tokenTapStart.y)
        : 0;
      if (moved < TAP_MOVE_THRESHOLD_PX && (!activeDrag || activeDrag.tokenId === tokenTapStart.tokenId)) {
        const tapId = tokenTapStart.tokenId;
        if (activeDrag) releaseDrag(); else tokenTapStart = null;
        options.onTokenTap?.(tapId);
        return;
      }
    }
    tokenTapStart = null;
    if (activeDrag) {
      releaseDrag();
      return;
    }
    if (activeBallDrag) {
      finalizeBallDrag(event);
      return;
    }
    if (activeRouteHandleDrag) {
      const pointerId = getPointerIdFromEvent(event);
      if (
        activeRouteHandleDrag.pointerId != null &&
        pointerId != null &&
        pointerId !== activeRouteHandleDrag.pointerId
      ) {
        return;
      }
      finalizeRouteHandleDrag();
      return;
    }
    if (routeDraft) {
      finalizeRouteDraft(event);
    }
  };

  app.stage.on("globalpointermove", handleStagePointerMove);
  app.stage.on("pointerup", handlePointerRelease);
  app.stage.on("pointerupoutside", handlePointerRelease);
  app.stage.on("pointercancel", handlePointerRelease);
  app.stage.on("pointerdown", (event) => {
    const worldPoint = getWorldPointFromEvent(event, app.stage, mapper);
    if (!worldPoint || !isWorldPointInsidePitch(worldPoint)) return;

    if (mode === "route" && !isPlaybackLocked() && selectedTokenId) {
      const route = routeByTokenId.get(selectedTokenId);
      const editableWaypointIndex = findEditableWaypointIndexAtWorldPoint(selectedTokenId, worldPoint);
      if (editableWaypointIndex != null && route) {
        const waypoint = route[editableWaypointIndex];
        if (waypoint) {
          const pointerId = getPointerIdFromEvent(event);
          const waypointWorld = mapper.normalizedToWorld(waypoint);
          activeRouteHandleDrag = {
            tokenId: selectedTokenId,
            waypointIndex: editableWaypointIndex,
            pointerId,
            offsetWorld: {
              x: waypointWorld.x - worldPoint.x,
              y: waypointWorld.y - worldPoint.y,
            },
          };
          setSelectedWaypoint(editableWaypointIndex);
          clearRouteDraft();
          return;
        }
      }

      const insertionCandidate = findInsertionCandidateOnRoute(selectedTokenId, worldPoint);
      if (insertionCandidate && route) {
        const nextRoute = [
          ...route.slice(0, insertionCandidate.insertIndex).map((point) => clonePoint(point)),
          insertionCandidate.point,
          ...route.slice(insertionCandidate.insertIndex).map((point) => clonePoint(point)),
        ];
        setRouteForToken(selectedTokenId, nextRoute);
        setSelectedWaypoint(insertionCandidate.insertIndex);
        const pointerId = getPointerIdFromEvent(event);
        activeRouteHandleDrag = {
          tokenId: selectedTokenId,
          waypointIndex: insertionCandidate.insertIndex,
          pointerId,
          offsetWorld: { x: 0, y: 0 },
        };
        clearRouteDraft();
        return;
      }

      const selectedToken = tokenLayer.getTokenById(selectedTokenId);
      if (!selectedToken) {
        setSelectedToken(null);
        return;
      }
      const pointerId = getPointerIdFromEvent(event);
      routeDraft = {
        tokenId: selectedToken.id,
        pointerId,
        points: [clonePoint(selectedToken.position)],
      };
      setSelectedWaypoint(null);
      appendRouteDraftPoint(clampNormalizedPoint(mapper.worldToNormalized(worldPoint)));
      return;
    }

    if (mode === "setup" && !isPlaybackLocked()) {
      setSelectedToken(null);
    }
    const normalized = getNormalizedPointFromEvent(event, app.stage, mapper);
    if (!normalized) return;
    options.onPitchTap?.({ point: clampNormalizedPoint(normalized) });
  });

  const tick = () => {
    orchestrator.step(app.ticker.deltaMS);
    if (activeBallPass) {
      activeBallPass.elapsedMs += app.ticker.deltaMS * orchestrator.getSpeedMultiplier();
      if (activeBallPass.elapsedMs >= activeBallPass.durationMs) {
        const toPlayerId = activeBallPass.toPlayerId;
        const wasShot = activeBallPass.toWorld != null;
        activeBallPass = null;
        if (wasShot) {
          ballState = {};
          tokenLayer.setBallCarrier(null);
          emitBallState();
        } else if (tokenLayer.getTokenById(toPlayerId)) {
          ballState = { carrierId: toPlayerId, ballType: ballState.ballType ?? "footballSmall" };
          tokenLayer.setBallCarrier(toPlayerId);
          emitBallState();
          orchestrator.notifyPassLanded(toPlayerId);
          // Flush all deferred passes whose sender is now the carrier,
          // but only if notifyPassLanded didn't already start a shot animation.
          // Only one pass can animate at a time; extras re-enter the tail of the
          // queue and fire the next time this player receives the ball.
          if (activeBallPass === null) {
            const { toFire, remaining } = flushDeferredPasses(deferredPasses, toPlayerId);
            deferredPasses = remaining;
            if (toFire) {
              startPassAnimation(toFire.fromPlayerId, toFire.toPlayerId);
            }
          }
        }
      }
    }
    syncBallPosition();
  };
  app.ticker.add(tick);

  const canvas = app.canvas as HTMLCanvasElement;
  const onContextLost = (e: Event) => { e.preventDefault(); };
  const onContextRestored = () => { syncToHost(); };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") syncToHost();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const onVisualViewportResize = () => { syncToHost(); };
  window.visualViewport?.addEventListener("resize", onVisualViewportResize);

  const resizeObserver = new ResizeObserver(() => {
    syncToHost();
  });
  resizeObserver.observe(host);
  syncToHost();
  refreshRouteLayer();
  options.onPlaybackStateChange?.(orchestrator.getState());
  emitRouteEditState();

  return {
    getTokens: () => tokenLayer.getTokens(),
    getTokensAtStart: () =>
      tokenLayer.getTokens().map((t) => {
        const start = startPositionByTokenId.get(t.id);
        return start ? { ...t, position: { ...start } } : t;
      }),
    getSelectedToken: () => (selectedTokenId ? tokenLayer.getTokenById(selectedTokenId) : null),
    getMode: () => mode,
    getRoutes: () => buildRoutesSnapshot(),
    getPlaybackSpeed: () => orchestrator.getSpeed(),
    getPlaybackState: () => orchestrator.getState(),
    getRouteEditState: () => getRouteEditState(),
    setTokens: (tokens) => {
      orchestrator.stop();
      tokenLayer.setTokens(tokens);
      tokenLayer.syncToMapper();

      const availableIds = new Set(tokenLayer.getTokens().map((token) => token.id));
      for (const tokenId of Array.from(routeByTokenId.keys())) {
        if (!availableIds.has(tokenId)) {
          routeByTokenId.delete(tokenId);
          routeMetaByTokenId.delete(tokenId);
        }
      }
      for (const tokenId of Array.from(startPositionByTokenId.keys())) {
        if (!availableIds.has(tokenId)) startPositionByTokenId.delete(tokenId);
      }
      for (const token of tokenLayer.getTokens()) {
        if (!startPositionByTokenId.has(token.id)) {
          startPositionByTokenId.set(token.id, clonePoint(token.position));
        }
      }
      if (selectedTokenId && !availableIds.has(selectedTokenId)) {
        setSelectedToken(null);
      }
      if (ballState.carrierId && !availableIds.has(ballState.carrierId)) {
        ballState = {};
        ballStateAtPlayStart = {};
        syncBallPosition();
        emitBallState();
      }
      emitRoutes();
      refreshRouteLayer();
      emitRouteEditState();
    },
    setRoutes: (routes: readonly MovementBoardRoute[]) => {
      if (isPlaybackLocked()) return;
      routeByTokenId.clear();
      routeMetaByTokenId.clear();
      for (const route of routes) {
        const normalized = normalizeRoutePoints(route.points, ROUTE_MIN_POINT_DISTANCE);
        if (normalized.length >= 2) {
          routeByTokenId.set(route.playerId, normalized.map(clonePoint));
          const { playerId: _p, points: _pts, ...meta } = route;
          const metaKeys = Object.keys(meta).filter((k) => (meta as Record<string, unknown>)[k] !== undefined);
          if (metaKeys.length > 0) {
            routeMetaByTokenId.set(route.playerId, meta as RouteMetadata);
          }
        }
      }
      setSelectedWaypoint(null);
      emitRoutes();
      refreshRouteLayer();
      emitRouteEditState();
    },
    setSelectedToken: (tokenId) => setSelectedToken(tokenId),
    setMode: (nextMode) => {
      setModeState(nextMode);
    },
    setPlaybackSpeed: (speed) => {
      orchestrator.setSpeed(speed);
    },
    setSpeedMultiplier: (multiplier) => {
      orchestrator.setSpeedMultiplier(multiplier);
    },
    removeSelectedWaypoint: () => {
      if (!selectedTokenId) return false;
      const route = routeByTokenId.get(selectedTokenId);
      if (!route || selectedWaypointIndex == null) return false;
      if (selectedWaypointIndex <= 0 || selectedWaypointIndex >= route.length) return false;
      if (route.length <= 2) return false;
      const nextRoute = route
        .filter((_, index) => index !== selectedWaypointIndex)
        .map((point) => clonePoint(point));
      setRouteForToken(selectedTokenId, nextRoute);
      setSelectedWaypoint(null);
      return true;
    },
    clearSelectedRoute: () => {
      if (!selectedTokenId) return false;
      if (!routeByTokenId.has(selectedTokenId)) return false;
      routeByTokenId.delete(selectedTokenId);
      routeMetaByTokenId.delete(selectedTokenId);
      if (routeDraft?.tokenId === selectedTokenId) {
        clearRouteDraft();
      }
      setSelectedWaypoint(null);
      emitRoutes();
      refreshRouteLayer();
      emitRouteEditState();
      return true;
    },
    playAll: () => {
      startPlayback();
    },
    pausePlayback: () => {
      orchestrator.pause();
    },
    resumePlayback: () => {
      orchestrator.resume();
    },
    reset: () => {
      reset();
    },
    setStartPositions: () => {
      if (isPlaybackLocked()) return;
      for (const token of tokenLayer.getTokens()) {
        startPositionByTokenId.set(token.id, clonePoint(token.position));
      }
    },
    giveBall: (playerId) => {
      if (!tokenLayer.getTokenById(playerId)) return;
      ballState = { carrierId: playerId, ballType: ballState.ballType ?? "footballSmall" };
      if (!orchestrator.isLocked()) {
        ballStateAtPlayStart = { ...ballState };
      }
      syncBallPosition();
      emitBallState();
    },
    placeBall: (ballType: BallType, position?) => {
      const pos = position ?? { x: 50, y: 50 };
      ballState = { position: pos, ballType };
      if (!orchestrator.isLocked()) {
        ballStateAtPlayStart = { ...ballState };
      }
      syncBallPosition();
      emitBallState();
    },
    removeBall: () => {
      ballState = {};
      if (!orchestrator.isLocked()) {
        ballStateAtPlayStart = {};
      }
      syncBallPosition();
      emitBallState();
    },
    freeBall: () => {
      if (!ballState.carrierId) return;
      const worldPos = tokenLayer.getTokenWorldPosition(ballState.carrierId);
      const position = worldPos
        ? clampNormalizedPoint(mapper.worldToNormalized(worldPos))
        : { x: 50, y: 50 };
      ballState = { position, ballType: ballState.ballType };
      if (!orchestrator.isLocked()) {
        ballStateAtPlayStart = { ...ballState };
      }
      syncBallPosition();
      emitBallState();
    },
    getBallState: () => ({ ...ballState }),
    getBallStateAtStart: () => ({ ...ballStateAtPlayStart }),
    setPassEvents: (events) => {
      passEvents = events.map((e) => ({ ...e }));
      deferredPasses = [];
      emitPassEvents();
    },
    getPassEvents: () => [...passEvents],
    addPassEvent: (event) => {
      passEvents = passEvents.filter((e) => e.id !== event.id).concat({ ...event });
      emitPassEvents();
    },
    removePassEvent: (id) => {
      passEvents = passEvents.filter((e) => e.id !== id);
      emitPassEvents();
    },
    passBallTo: (targetPlayerId) => {
      if (!ballState.carrierId) return;
      const fromWorldPos = tokenLayer.getTokenWorldPosition(ballState.carrierId);
      const toWorldPos = tokenLayer.getTokenWorldPosition(targetPlayerId);
      if (!fromWorldPos || !toWorldPos) return;
      const dx = toWorldPos.x - fromWorldPos.x;
      const dy = toWorldPos.y - fromWorldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const durationMs = Math.max(PASS_MIN_DURATION_MS, Math.min(PASS_MAX_DURATION_MS, dist / PASS_SPEED_PX_PER_MS));
      activeBallPass = { fromWorld: fromWorldPos, toPlayerId: targetPlayerId, elapsedMs: 0, durationMs, ballType: ballState.ballType ?? "footballSmall" };
      ballState = { ballType: ballState.ballType };
      tokenLayer.setBallCarrier(null);
      emitBallState();
    },
    shootToGoal: () => {
      shootToGoalInternal();
    },
    addShotEvent: (event) => {
      shotEvents = shotEvents.filter((e) => e.id !== event.id).concat({ ...event });
    },
    getShotEvents: () => [...shotEvents],
    removeShotEvent: (id) => {
      shotEvents = shotEvents.filter((e) => e.id !== id);
    },
    setRouteMeta: (playerId, meta) => {
      if (!routeByTokenId.has(playerId)) return;
      const existing = routeMetaByTokenId.get(playerId) ?? {};
      const next: RouteMetadata = { ...existing };
      for (const key of Object.keys(meta) as Array<keyof RouteMetadata>) {
        if (meta[key] === undefined) {
          delete next[key];
        } else {
          (next as Record<string, unknown>)[key] = meta[key];
        }
      }
      routeMetaByTokenId.set(playerId, next);
      emitRoutes();
    },
    getRouteMeta: (playerId) => routeMetaByTokenId.get(playerId) ?? null,
    setTokenSize: (size) => tokenLayer.setTokenSize(size),
    getTokenSize: () => tokenLayer.getTokenSize(),
    setTokenRenderer: (name) => tokenLayer.setRenderer(name),
    setDragEnabled: (enabled) => {
      dragEnabled = enabled;
      if (!enabled) {
        releaseDrag();
        activeBallDrag = null;
      }
      trainingItemLayer.setInteractive(canInteractWithTrainingItems());
      syncBallInteraction();
    },
    setBallCarrier: (tokenId) => {
      tokenLayer.setBallCarrier(tokenId);
    },
    getCanvas: () => app.canvas as HTMLCanvasElement,
    setZones: (zones) => zoneLayer.setZones(zones),
    getZones: () => zoneLayer.getZones(),
    setSelectedZoneId: (id) => zoneLayer.setSelectedZoneId(id),
    setTrainingItems: (items) => trainingItemLayer.setItems(items),
    getTrainingItems: () => trainingItemLayer.getItems(),
    setSelectedTrainingItemId: (id) => trainingItemLayer.setSelectedItemId(id),
    reflow: () => {
      syncToHost();
    },
    destroy: () => {
      orchestrator.stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.visualViewport?.removeEventListener("resize", onVisualViewportResize);
      tokenLayer.destroy();
      routeLayer.destroy();
      ballLayer.destroy();
      trainingItemLayer.destroy();
      zoneLayer.destroy();
      app.ticker.remove(tick);
      app.stage.removeAllListeners();
      pitchMount.dispose();
      try {
        host.removeChild(canvas);
      } catch {
        // Canvas may already be detached.
      }
      app.destroy(true, { children: true, texture: true });
    },
  };
}
