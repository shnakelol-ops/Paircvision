import { Container, Graphics } from "pixi.js";

import type { NormalizedPoint } from "../coordinates/normalization";
import type { WorldViewportMapper } from "../coordinates/viewport";
import type { MovementBoardRoute } from "../shell/types";
import { sampleRoutePoints } from "./route-sampling";

type RouteRenderStyle = {
  coreColor: number;
  highlightColor: number;
  shadowColor: number;
};

type RouteDraft = {
  playerId: string;
  points: NormalizedPoint[];
} | null;

type CreateRouteLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
  styleProvider: (playerId: string) => RouteRenderStyle;
};

export type RouteLayer = {
  setRoutes: (routes: readonly MovementBoardRoute[]) => void;
  setDraftRoute: (draft: RouteDraft) => void;
  setSelectedPlayer: (playerId: string | null) => void;
  setSelectedWaypoint: (routePlayerId: string | null, waypointIndex: number | null) => void;
  syncToMapper: () => void;
  clear: () => void;
  destroy: () => void;
};

const HANDLE_VISUAL_RADIUS_PX = 11;
const FLOW_DOT_SPACING = 6;

function cloneRoute(route: MovementBoardRoute): MovementBoardRoute {
  return {
    playerId: route.playerId,
    points: route.points.map((point) => ({ x: point.x, y: point.y })),
  };
}

function cloneRoutes(routes: readonly MovementBoardRoute[]): MovementBoardRoute[] {
  return routes.map((route) => cloneRoute(route));
}

export function createRouteLayer(options: CreateRouteLayerOptions): RouteLayer {
  const graphics = new Graphics();
  graphics.eventMode = "none";
  options.layer.addChild(graphics);

  let routes: MovementBoardRoute[] = [];
  let draftRoute: RouteDraft = null;
  let selectedPlayerId: string | null = null;
  let selectedWaypoint:
    | {
        playerId: string;
        index: number | null;
      }
    | null = null;

  const strokePath = (
    worldPath: Array<{ x: number; y: number }>,
    style: { color: number; width: number; alpha: number },
  ) => {
    const first = worldPath[0];
    if (!first) return;
    graphics.moveTo(first.x, first.y);
    for (let index = 1; index < worldPath.length; index += 1) {
      const point = worldPath[index];
      if (!point) continue;
      graphics.lineTo(point.x, point.y);
    }
    graphics.stroke({
      color: style.color,
      width: style.width,
      alpha: style.alpha,
      cap: "round",
      join: "round",
      alignment: 0.5,
    });
  };

  const renderRoute = (
    route: { playerId: string; points: readonly NormalizedPoint[] },
    optionsForRoute: { isDraft: boolean },
  ) => {
    const sampled = sampleRoutePoints(route.points);
    if (sampled.length < 2) return;
    const mapper = options.mapperProvider();
    const worldPath = sampled.map((point) => mapper.normalizedToWorld(point));
    const isSelected = selectedPlayerId != null && selectedPlayerId === route.playerId;
    const style = options.styleProvider(route.playerId);
    const isDraft = optionsForRoute.isDraft;
    const alphaBoost = isDraft ? 0.75 : 1;
    const widthBoost = isSelected ? 1.25 : 1;
    const opacityScale = isSelected ? 1 : 0.62;

    strokePath(worldPath, {
      color: style.shadowColor,
      width: 2.8 * widthBoost,
      alpha: 0.32 * alphaBoost * opacityScale,
    });
    strokePath(worldPath, {
      color: style.coreColor,
      width: 1.7 * widthBoost,
      alpha: 0.95 * alphaBoost * opacityScale,
    });
    strokePath(worldPath, {
      color: style.highlightColor,
      width: 0.72 * widthBoost,
      alpha: 0.46 * alphaBoost * opacityScale,
    });

    for (let index = FLOW_DOT_SPACING; index < worldPath.length; index += FLOW_DOT_SPACING) {
      const point = worldPath[index];
      if (!point) continue;
      const flowAlpha = isSelected ? 0.22 : 0.12;
      graphics.circle(point.x, point.y, isSelected ? 0.26 : 0.2).fill({
        color: style.highlightColor,
        alpha: flowAlpha,
      });
    }

    const start = worldPath[0];
    const end = worldPath[worldPath.length - 1];
    if (!start || !end) return;
    graphics.circle(start.x, start.y, isSelected ? 0.54 : 0.42).fill({
      color: style.highlightColor,
      alpha: isSelected ? 0.52 : 0.28,
    });
    graphics.circle(end.x, end.y, isSelected ? 0.86 : 0.68).fill({
      color: style.coreColor,
      alpha: isSelected ? 0.9 : 0.72,
    });

    if (!isSelected || isDraft) return;
    const handleRadiusWorld = HANDLE_VISUAL_RADIUS_PX / Math.max(0.001, mapper.transform.scale);
    for (let index = 0; index < route.points.length; index += 1) {
      const point = route.points[index];
      if (!point) continue;
      const worldPoint = mapper.normalizedToWorld(point);
      const isStart = index === 0;
      const isSelectedWaypoint =
        selectedWaypoint?.playerId === route.playerId &&
        selectedWaypoint.index != null &&
        selectedWaypoint.index === index;
      const fillAlpha = isStart ? 0.28 : 0.88;
      const fillColor = isStart ? style.shadowColor : style.coreColor;
      graphics.circle(worldPoint.x, worldPoint.y, handleRadiusWorld * (isSelectedWaypoint ? 1.22 : 1)).fill({
        color: fillColor,
        alpha: fillAlpha,
      });
      graphics.circle(worldPoint.x, worldPoint.y, handleRadiusWorld * (isStart ? 0.56 : 0.62)).fill({
        color: style.highlightColor,
        alpha: isStart ? 0.55 : 0.84,
      });
      if (!isStart) {
        graphics.circle(worldPoint.x, worldPoint.y, handleRadiusWorld * 1.18).stroke({
          color: style.shadowColor,
          width: handleRadiusWorld * 0.16,
          alpha: 0.48,
          alignment: 0.5,
        });
      }
      if (isSelectedWaypoint) {
        graphics.circle(worldPoint.x, worldPoint.y, handleRadiusWorld * 1.72).stroke({
          color: style.highlightColor,
          width: handleRadiusWorld * 0.22,
          alpha: 0.92,
          alignment: 0.5,
        });
      }
    }
  };

  const render = () => {
    graphics.clear();
    for (const route of routes) {
      renderRoute(route, { isDraft: false });
    }
    if (draftRoute) {
      renderRoute(draftRoute, { isDraft: true });
    }
  };

  return {
    setRoutes: (nextRoutes) => {
      routes = cloneRoutes(nextRoutes);
      render();
    },
    setDraftRoute: (nextDraft) => {
      draftRoute = nextDraft
        ? {
            playerId: nextDraft.playerId,
            points: nextDraft.points.map((point) => ({ x: point.x, y: point.y })),
          }
        : null;
      render();
    },
    setSelectedPlayer: (playerId) => {
      selectedPlayerId = playerId;
      render();
    },
    setSelectedWaypoint: (routePlayerId, waypointIndex) => {
      selectedWaypoint =
        routePlayerId == null
          ? null
          : {
              playerId: routePlayerId,
              index: waypointIndex,
            };
      render();
    },
    syncToMapper: () => {
      render();
    },
    clear: () => {
      routes = [];
      draftRoute = null;
      selectedWaypoint = null;
      graphics.clear();
    },
    destroy: () => {
      graphics.destroy();
    },
  };
}

