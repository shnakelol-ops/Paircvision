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

type PitchRuntime = {
  app: Application;
  world: Container;
  pitchRoot: ReturnType<typeof createPitchRoot>;
  heatmapLayer: Graphics;
  zoneOverlayLayer: Graphics;
  statsMarkers: Graphics;
  hitArea: Graphics;
  canvas: HTMLCanvasElement;
  resizeObserver: ResizeObserver;
  onContextLost: (event: Event) => void;
  onContextRestored: () => void;
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
  let runtime: PitchRuntime | null = null;
  let disposed = false;
  let contextLost = false;
  let rebuildPromise: Promise<void> | null = null;
  let recoveryRafA: number | null = null;
  let recoveryRafB: number | null = null;
  let recoveryTimerId: number | null = null;

  const clearRecoverySchedule = () => {
    if (recoveryRafA != null) {
      window.cancelAnimationFrame(recoveryRafA);
      recoveryRafA = null;
    }
    if (recoveryRafB != null) {
      window.cancelAnimationFrame(recoveryRafB);
      recoveryRafB = null;
    }
    if (recoveryTimerId != null) {
      window.clearTimeout(recoveryTimerId);
      recoveryTimerId = null;
    }
  };

  const isRendererContextLost = (): boolean => {
    if (contextLost) return true;
    const current = runtime;
    if (!current) return true;
    const glContext = (current.app.renderer as { gl?: { isContextLost?: () => boolean } }).gl;
    if (glContext && typeof glContext.isContextLost === "function") {
      try {
        return glContext.isContextLost();
      } catch {
        return true;
      }
    }
    return false;
  };

  const renderNow = () => {
    const current = runtime;
    if (!current) return;
    const maybeRender = current.app as unknown as { render?: () => void };
    try {
      if (typeof maybeRender.render === "function") {
        maybeRender.render();
      } else {
        current.app.renderer.render(current.app.stage);
      }
    } catch {
      // Transient mobile resume states can throw before the staged recovery settles.
    }
  };

  const getRenderableEvents = (): readonly RenderableMatchEvent[] => {
    if (visibleEventLimitState == null) return eventsState;
    return eventsState.slice(-visibleEventLimitState);
  };

  const redrawMarkers = () => {
    const current = runtime;
    if (!current) return;
    const renderableEvents = getRenderableEvents();
    if (heatmapEnabledState) {
      drawStatsHeatmap(current.heatmapLayer, renderableEvents);
    } else {
      current.heatmapLayer.clear();
    }
    drawStatsZoneOverlay(current.zoneOverlayLayer, zoneOverlayModelState);
    drawStatsMarkers(current.statsMarkers, renderableEvents, {
      showPlayerLabels: showPlayerInitialsState,
      onMarkerTap: onMarkerTapState ?? undefined,
    });
    renderNow();
  };

  const setTickerPaused = (paused: boolean) => {
    const current = runtime;
    if (!current) return;
    const tickerControls = current.app as unknown as { start?: () => void; stop?: () => void };
    if (paused) {
      tickerControls.stop?.();
    } else {
      tickerControls.start?.();
    }
  };

  const recoverInPlace = (): boolean => {
    const current = runtime;
    if (!current) return false;
    if (isRendererContextLost()) return false;
    current.app.stage.visible = true;
    fitWorld(host, current.app, current.world);
    redrawMarkers();
    renderNow();
    return true;
  };

  const destroyRuntime = () => {
    const current = runtime;
    runtime = null;
    if (!current) return;
    current.resizeObserver.disconnect();
    current.canvas.removeEventListener("webglcontextlost", current.onContextLost as EventListener);
    current.canvas.removeEventListener("webglcontextrestored", current.onContextRestored as EventListener);
    current.pitchRoot.dispose();
    current.hitArea.destroy();
    current.heatmapLayer.destroy();
    current.zoneOverlayLayer.destroy();
    current.statsMarkers.destroy();
    try {
      if (current.canvas.parentNode === host) {
        host.removeChild(current.canvas);
      } else {
        current.canvas.remove();
      }
    } catch {
      // canvas may already be detached
    }
    current.app.destroy(true, { children: true, texture: true });
  };

  const mountRuntime = async () => {
    if (disposed) return;
    const app = new Application();
    await app.init({
      width: host.clientWidth || 640,
      height: host.clientHeight || 400,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
    });
    if (disposed) {
      app.destroy(true, { children: true, texture: true });
      return;
    }

    const canvas = app.canvas as HTMLCanvasElement;
    host.appendChild(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
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
    statsMarkers.eventMode = "none";
    world.addChild(statsMarkers);

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
      const activeRuntime = runtime;
      if (!activeRuntime) return;
      const stagePoint = (event as unknown as {
        data?: { getLocalPosition?: (target: Container) => { x: number; y: number } };
        getLocalPosition?: (target: Container) => { x: number; y: number };
      }).data?.getLocalPosition?.(activeRuntime.app.stage) ??
        (event as unknown as {
          getLocalPosition?: (target: Container) => { x: number; y: number };
        }).getLocalPosition?.(activeRuntime.app.stage);
      if (!stagePoint) return;

      const worldX =
        (stagePoint.x - activeRuntime.world.position.x) / Math.max(1e-6, activeRuntime.world.scale.x);
      const worldY =
        (stagePoint.y - activeRuntime.world.position.y) / Math.max(1e-6, activeRuntime.world.scale.y);
      const { nx, ny } = worldToBoardNorm(worldX, worldY, BOARD_PITCH_VIEWBOX);

      if (!canLogEventsState) return;

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

    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setTickerPaused(true);
    };
    const onContextRestored = () => {
      contextLost = false;
      setTickerPaused(false);
      scheduleRecovery(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost as EventListener, { passive: false });
    canvas.addEventListener("webglcontextrestored", onContextRestored as EventListener);

    const resizeObserver = new ResizeObserver(() => {
      if (document.visibilityState === "visible") {
        scheduleRecovery(false);
      }
    });
    resizeObserver.observe(host);

    runtime = {
      app,
      world,
      pitchRoot,
      heatmapLayer,
      zoneOverlayLayer,
      statsMarkers,
      hitArea,
      canvas,
      resizeObserver,
      onContextLost,
      onContextRestored,
    };
    contextLost = false;
    recoverInPlace();
  };

  const rebuildRuntime = async () => {
    if (disposed) return;
    if (rebuildPromise) return rebuildPromise;
    rebuildPromise = (async () => {
      destroyRuntime();
      await mountRuntime();
    })()
      .catch(() => {
        // Runtime may fail to re-create during transient mobile resume races.
      })
      .finally(() => {
        rebuildPromise = null;
      });
    return rebuildPromise;
  };

  const runRecovery = (forceRebuild: boolean) => {
    if (disposed) return;
    if (document.visibilityState !== "visible") return;
    if (!forceRebuild && recoverInPlace()) return;
    void rebuildRuntime();
  };

  const scheduleRecovery = (forceRebuild: boolean) => {
    clearRecoverySchedule();
    runRecovery(forceRebuild);
    recoveryRafA = window.requestAnimationFrame(() => {
      runRecovery(forceRebuild);
      recoveryRafB = window.requestAnimationFrame(() => {
        runRecovery(forceRebuild);
      });
    });
    recoveryTimerId = window.setTimeout(() => {
      runRecovery(forceRebuild);
    }, 220);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      setTickerPaused(false);
      scheduleRecovery(false);
    } else {
      setTickerPaused(true);
    }
  };
  const onPageShow = () => {
    setTickerPaused(false);
    scheduleRecovery(true);
  };
  const onPageHide = () => {
    setTickerPaused(true);
  };
  const onResume = () => {
    setTickerPaused(false);
    scheduleRecovery(true);
  };
  const onWindowResize = () => {
    if (document.visibilityState === "visible") {
      scheduleRecovery(false);
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("resume", onResume as EventListener);
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("orientationchange", onWindowResize);
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onWindowResize);
  viewport?.addEventListener("scroll", onWindowResize);

  await mountRuntime();
  if (document.visibilityState === "visible") {
    scheduleRecovery(false);
  }

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
      disposed = true;
      clearRecoverySchedule();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("resume", onResume as EventListener);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      viewport?.removeEventListener("resize", onWindowResize);
      viewport?.removeEventListener("scroll", onWindowResize);
      destroyRuntime();
    },
  };
}

