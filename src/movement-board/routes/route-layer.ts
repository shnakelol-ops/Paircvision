import { Container, Graphics } from "pixi.js";

import type { NormalizedPoint } from "../coordinates/normalization";
import type { WorldViewportMapper } from "../coordinates/viewport";
import type { MovementBoardRoute } from "../shell/types";

type RouteDraft = {
  playerId: string;
  points: NormalizedPoint[];
} | null;

type CreateRouteLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
};

export type RouteLayer = {
  setRoutes: (routes: readonly MovementBoardRoute[]) => void;
  setDraftRoute: (draft: RouteDraft) => void;
  setSelectedPlayer: (playerId: string | null) => void;
  syncToMapper: () => void;
  clear: () => void;
  destroy: () => void;
};

const SHADOW_COLOR = 0x1c1205;
const CORE_COLOR = 0xf59e0b;
const HIGHLIGHT_COLOR = 0xffd8a1;
const SELECTED_CORE_COLOR = 0x38bdf8;
const SELECTED_HIGHLIGHT_COLOR = 0xdbeafe;

function cloneRoute(route: MovementBoardRoute): MovementBoardRoute {
  return {
    playerId: route.playerId,
    points: route.points.map((point) => ({ x: point.x, y: point.y })),
  };
}

function copyRoutes(routes: readonly MovementBoardRoute[]): MovementBoardRoute[] {
  return routes.map((route) => cloneRoute(route));
}

export function createRouteLayer(options: CreateRouteLayerOptions): RouteLayer {
  const graphics = new Graphics();
  graphics.eventMode = "none";
  options.layer.addChild(graphics);

  let routes: MovementBoardRoute[] = [];
  let draftRoute: RouteDraft = null;
  let selectedPlayerId: string | null = null;

  const strokePath = (
    path: Array<{ x: number; y: number }>,
    style: { color: number; width: number; alpha: number },
  ) => {
    const first = path[0];
    if (!first) return;
    graphics.moveTo(first.x, first.y);
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
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

  const render = () => {
    graphics.clear();
    const mapper = options.mapperProvider();
    const drawRoute = (route: { playerId: string; points: readonly NormalizedPoint[] }, isDraft: boolean) => {
      if (route.points.length < 2) return;
      const path = route.points.map((point) => mapper.normalizedToWorld(point));
      const isSelected = selectedPlayerId != null && selectedPlayerId === route.playerId;
      const coreColor = isSelected ? SELECTED_CORE_COLOR : CORE_COLOR;
      const highlightColor = isSelected ? SELECTED_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR;
      const opacityBoost = isDraft ? 0.85 : 1;
      strokePath(path, { color: SHADOW_COLOR, width: 2.3, alpha: 0.31 * opacityBoost });
      strokePath(path, { color: coreColor, width: 1.4, alpha: 0.95 * opacityBoost });
      strokePath(path, { color: highlightColor, width: 0.58, alpha: 0.46 * opacityBoost });
      const start = path[0];
      const end = path[path.length - 1];
      if (!start || !end) return;
      graphics.circle(start.x, start.y, 0.48).fill({ color: highlightColor, alpha: 0.45 * opacityBoost });
      graphics.circle(end.x, end.y, 0.66).fill({ color: coreColor, alpha: 0.82 * opacityBoost });
      graphics.circle(end.x, end.y, 0.88).stroke({ color: highlightColor, width: 0.18, alpha: 0.85 * opacityBoost });
    };

    for (const route of routes) {
      drawRoute(route, false);
    }
    if (draftRoute) {
      drawRoute(draftRoute, true);
    }
  };

  return {
    setRoutes: (nextRoutes) => {
      routes = copyRoutes(nextRoutes);
      render();
    },
    setDraftRoute: (draft) => {
      draftRoute = draft
        ? {
            playerId: draft.playerId,
            points: draft.points.map((point) => ({ x: point.x, y: point.y })),
          }
        : null;
      render();
    },
    setSelectedPlayer: (playerId) => {
      selectedPlayerId = playerId;
      render();
    },
    syncToMapper: () => {
      render();
    },
    clear: () => {
      routes = [];
      draftRoute = null;
      graphics.clear();
    },
    destroy: () => {
      graphics.destroy();
    },
  };
}

