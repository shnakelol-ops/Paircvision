import { Application, Container, Graphics } from "pixi.js";

import { BOARD_PITCH_VIEWBOX } from "./pitch-space";
import { createPitchRoot } from "./create-pitch-root";
import {
  letterboxPitchWorld,
  worldToBoardNorm,
} from "../coordinates/pitch-coordinates";
import { drawStatsMarkers } from "../stats/draw-stats-markers";
import { drawStatsHeatmap } from "../stats/draw-stats-heatmap";
import { drawStatsZoneOverlay } from "../stats/draw-stats-zone-overlay";
import {
  createMatchEvent,
  type MatchEvent,
  type MatchEventKind,
} from "../stats/stats-event-model";
import { createMatchEventStore } from "../stats/match-event-store";
import type { ZoneOverlayModel } from "../../stats/zones/zone-types";

type RenderableMatchEvent = MatchEvent & {
  playerName?: string;
  playerNumber?: number;
  team?: "HOME" | "AWAY";
};

export type CreatePixiPitchSurfaceOptions = {
  sport: "soccer" | "gaelic" | "hurling" | "camogie";
  events?: readonly RenderableMatchEvent[];
  activeEventKind?: MatchEventKind;
  eventHalf?: 1 | 2;
  eventTimestampSeconds?: number;
  canLogEvents?: boolean;
  showPlayerInitials?: boolean;
  onEventLogged?: (event: MatchEvent) => void;
  onPitchTap?: (nx: number, ny: number) => void;
  onMarkerTap?: (eventId: string) => void;
  onContextLost?: () => void;
};

export type PixiPitchSurfaceHandle = {
  setEvents: (events: readonly RenderableMatchEvent[]) => void;
  setActiveEventKind: (kind: MatchEventKind) => void;
  setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
  setShowPlayerInitials: (show: boolean) => void;
  setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setZoneOverlayModel: (model: ZoneOverlayModel | null) => void;
  setVisibleEventLimit: (limit: number | null) => void;
  undoLastEvent: () => void;
  destroy: () => void;
};

function fitWorld(host: HTMLElement, app: Application, world: Container): void {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width <= 0 || height <= 0) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  app.renderer.resolution = dpr;
  app.renderer.resize(width, height);

  const { scale, offsetX, offsetY } = letterboxPitchWorld(width, height);
  world.scale.set(scale, scale);
  world.position.set(offsetX, offsetY);
}

export async function createPixiPitchSurface(
  host: HTMLElement,
  options: CreatePixiPitchSurfaceOptions,
): Promise<PixiPitchSurfaceHandle> {
  const app = new Application();
  await app.init({
    width: host.clientWidth || 640,
    height: host.clientHeight || 400,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });

  host.appendChild(app.canvas as HTMLCanvasElement);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    options.onContextLost?.();
  };
  (app.canvas as HTMLCanvasElement).addEventListener("webglcontextlost", handleContextLost);

  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  app.canvas.style.display = "block";
  app.canvas.style.touchAction = "none";
  app.canvas.style.userSelect = "none";
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  (app.stage as { interactive?: boolean }).interactive = true;

  const world = new Container();
  app.stage.addChild(world);

  const pitchRoot = createPitchRoot(options.sport);
  world.addChild(pitchRoot.root);
  const heatmapLayer = new Graphics();
  heatmapLayer.eventMode = "none";
  world.addChild(heatmapLayer);
  const zoneOverlayLayer = new Graphics();
  zoneOverlayLayer.eventMode = "none";
  world.addChild(zoneOverlayLayer);
  const statsMarkers = new Graphics();
  statsMarkers.eventMode = options.onMarkerTap ? "passive" : "none";
  statsMarkers.zIndex = options.onMarkerTap ? 200 : 0;
  world.addChild(statsMarkers);

  const eventStore = createMatchEventStore(options.events ?? []);
  let eventsState: readonly RenderableMatchEvent[] = eventStore.getAll();
  let activeEventKindState: MatchEventKind = options.activeEventKind ?? "POINT";
  let eventHalfState: 1 | 2 = options.eventHalf ?? 1;
  let eventTimestampSecondsState = Math.max(0, Math.floor(options.eventTimestampSeconds ?? 0));
  let canLogEventsState = options.canLogEvents ?? true;
  let showPlayerInitialsState = options.showPlayerInitials ?? true;
  let onMarkerTapState = options.onMarkerTap ?? null;
  let heatmapEnabledState = false;
  let zoneOverlayModelState: ZoneOverlayModel | null = null;
  let visibleEventLimitState: number | null = null;
  const onEventLoggedState = options.onEventLogged;
  const onPitchTapState = options.onPitchTap;

  const getRenderableEvents = (): readonly RenderableMatchEvent[] => {
    if (visibleEventLimitState == null) return eventsState;
    return eventsState.slice(-visibleEventLimitState);
  };

  const redrawMarkers = () => {
    const renderableEvents = getRenderableEvents();
    if (heatmapEnabledState) {
      drawStatsHeatmap(heatmapLayer, renderableEvents);
    } else {
      heatmapLayer.clear();
    }
    drawStatsZoneOverlay(zoneOverlayLayer, zoneOverlayModelState);
    drawStatsMarkers(statsMarkers, renderableEvents, {
      showPlayerLabels: showPlayerInitialsState,
      onMarkerTap: onMarkerTapState ?? undefined,
    });
  };

  const hitArea = new Graphics();
  hitArea
    .rect(0, 0, BOARD_PITCH_VIEWBOX.w, BOARD_PITCH_VIEWBOX.h)
    .fill({ color: 0xffffff, alpha: 0.0001 });
  hitArea.eventMode = "static";
  hitArea.zIndex = 100;
  world.addChild(hitArea);
  world.sortableChildren = true;
  world.sortChildren();

  hitArea.on("pointerdown", (event) => {
    const stagePoint = (event as unknown as {
      data?: { getLocalPosition?: (target: Container) => { x: number; y: number } };
      getLocalPosition?: (target: Container) => { x: number; y: number };
    }).data?.getLocalPosition?.(app.stage) ??
      (event as unknown as {
        getLocalPosition?: (target: Container) => { x: number; y: number };
      }).getLocalPosition?.(app.stage);
    if (!stagePoint) return;

    const worldX = (stagePoint.x - world.position.x) / Math.max(1e-6, world.scale.x);
    const worldY = (stagePoint.y - world.position.y) / Math.max(1e-6, world.scale.y);
    const { nx, ny } = worldToBoardNorm(worldX, worldY, BOARD_PITCH_VIEWBOX);

    if (!canLogEventsState) return;
    if (onMarkerTapState) return;

    if (onPitchTapState) {
      onPitchTapState(nx, ny);
      return;
    }

    const nextEvent: MatchEvent = createMatchEvent({
      kind: activeEventKindState,
      nx,
      ny,
      half: eventHalfState,
      timestamp: eventTimestampSecondsState,
    });
    eventStore.add(nextEvent);
    eventsState = eventStore.getAll();
    onEventLoggedState?.(nextEvent);
    redrawMarkers();
  });

  const resizeObserver = new ResizeObserver(() => fitWorld(host, app, world));
  resizeObserver.observe(host);
  fitWorld(host, app, world);
  redrawMarkers();

  return {
    setEvents: (events) => {
      eventStore.clear();
      for (const event of events) eventStore.add(event);
      eventsState = eventStore.getAll();
      redrawMarkers();
    },
    setActiveEventKind: (kind) => {
      activeEventKindState = kind;
    },
    setEventContext: (context) => {
      eventHalfState = context.half;
      eventTimestampSecondsState = Math.max(0, Math.floor(context.timestamp));
      canLogEventsState = context.canLog;
    },
    setShowPlayerInitials: (show) => {
      showPlayerInitialsState = show;
      redrawMarkers();
    },
    setOnMarkerTap: (handler) => {
      onMarkerTapState = handler;
      if (handler) {
        statsMarkers.eventMode = "passive";
        statsMarkers.zIndex = 200;
      } else {
        statsMarkers.eventMode = "none";
        statsMarkers.zIndex = 0;
      }
      redrawMarkers();
    },
    setHeatmapEnabled: (enabled) => {
      heatmapEnabledState = enabled;
      redrawMarkers();
    },
    setZoneOverlayModel: (model) => {
      zoneOverlayModelState = model;
      redrawMarkers();
    },
    setVisibleEventLimit: (limit) => {
      visibleEventLimitState = limit == null ? null : Math.max(1, Math.floor(limit));
      redrawMarkers();
    },
    undoLastEvent: () => {
      eventStore.removeLast();
      eventsState = eventStore.getAll();
      redrawMarkers();
    },
    destroy: () => {
      resizeObserver.disconnect();
      pitchRoot.dispose();
      hitArea.destroy();
      heatmapLayer.destroy();
      zoneOverlayLayer.destroy();
      statsMarkers.destroy();
      try {
        (app.canvas as HTMLCanvasElement).removeEventListener("webglcontextlost", handleContextLost);
      } catch {
        // ignore listener removal errors
      }
      try {
        host.removeChild(app.canvas as HTMLCanvasElement);
      } catch {
        // canvas may already be detached
      }
      app.destroy(true, { children: true, texture: true });
    },
  };
}

