import { Circle, Container, Graphics } from "pixi.js";

import type { MatchEvent, MatchEventKind } from "./stats-event-model";
import { getStatsMarkerStyle } from "./stats-marker-style";
import { boardNormToWorld } from "../coordinates/pitch-coordinates";

type ParsedCssColor = { color: number; alpha: number };
type RenderableMatchEvent = MatchEvent & {
  playerName?: string;
  playerNumber?: number;
  team?: "HOME" | "AWAY";
  renderAsSubtleDot?: boolean;
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));
}

function rgbToPixiColor(r: number, g: number, b: number): number {
  return (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
}

function parseCssColorForPixi(css: string): ParsedCssColor {
  const s = css.trim();
  const m = s.match(/^rgba?\(\s*(.+?)\s*\)$/i);
  if (!m) return { color: 0xffffff, alpha: 1 };

  const commaSegs = m[1]!.split(",").map((x) => x.trim());
  if (commaSegs.length === 4) {
    return {
      color: rgbToPixiColor(
        parseFloat(commaSegs[0]!),
        parseFloat(commaSegs[1]!),
        parseFloat(commaSegs[2]!),
      ),
      alpha: clamp01(parseFloat(commaSegs[3]!)),
    };
  }
  if (commaSegs.length === 3) {
    return {
      color: rgbToPixiColor(
        parseFloat(commaSegs[0]!),
        parseFloat(commaSegs[1]!),
        parseFloat(commaSegs[2]!),
      ),
      alpha: 1,
    };
  }
  return { color: 0xffffff, alpha: 1 };
}

const SCORING_KINDS = new Set<MatchEventKind>(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"]);

type ScoreMarkerGlow = {
  outerRadiusScale: number;
  midRadiusScale: number;
  outerAlpha: number;
  midAlpha: number;
};

const SCORE_MARKER_GLOW: Record<"GOAL" | "POINT" | "TWO_POINTER" | "FORTY_FIVE_TWO_POINT", ScoreMarkerGlow> = {
  GOAL: {
    outerRadiusScale: 1.85,
    midRadiusScale: 1.38,
    outerAlpha: 0.1,
    midAlpha: 0.16,
  },
  POINT: {
    outerRadiusScale: 1.55,
    midRadiusScale: 1.18,
    outerAlpha: 0.04,
    midAlpha: 0.06,
  },
  TWO_POINTER: {
    outerRadiusScale: 1.78,
    midRadiusScale: 1.32,
    outerAlpha: 0.09,
    midAlpha: 0.14,
  },
  FORTY_FIVE_TWO_POINT: {
    outerRadiusScale: 1.78,
    midRadiusScale: 1.32,
    outerAlpha: 0.09,
    midAlpha: 0.14,
  },
};

export function drawStatsMarkers(
  g: Graphics,
  events: readonly RenderableMatchEvent[],
  opts?: {
    worldToScreenScale?: number;
    minScreenRadiusPx?: number;
    maxScreenRadiusPx?: number;
    showPlayerLabels?: boolean;
    onMarkerTap?: (eventId: string) => void;
  },
): void {
  g.clear();
  const oldChildren = g.removeChildren();
  for (const child of oldChildren) {
    child.destroy({ children: true });
  }

  const worldToScreenScale = Math.max(opts?.worldToScreenScale ?? 1, 0.004);
  const minPx = opts?.minScreenRadiusPx ?? 4;
  const maxPx = Math.max(minPx, opts?.maxScreenRadiusPx ?? 10);
  const minWorldRadius = minPx / worldToScreenScale;
  const maxWorldRadius = maxPx / worldToScreenScale;
  const showPlayerLabels = opts?.showPlayerLabels ?? true;
  const onMarkerTap = opts?.onMarkerTap;

  for (const event of events) {
    const worldPoint = boardNormToWorld(event.nx, event.ny);
    const renderAsSubtleDot = event.renderAsSubtleDot === true;
    if (renderAsSubtleDot) {
      const markerContainer = new Container();
      markerContainer.position.set(worldPoint.x, worldPoint.y);
      if (onMarkerTap) {
        markerContainer.eventMode = "static";
        markerContainer.cursor = "pointer";
        markerContainer.on("pointerdown", (pointerEvent) => {
          (pointerEvent as { stopPropagation?: () => void }).stopPropagation?.();
        });
        markerContainer.on("pointertap", (pointerEvent) => {
          (pointerEvent as { stopPropagation?: () => void }).stopPropagation?.();
          onMarkerTap(event.id);
        });
      }
      const subtleGraphic = new Graphics();
      markerContainer.addChild(subtleGraphic);
      const subtleRadius = Math.min(
        Math.max(minWorldRadius * 0.62, 1.1 / worldToScreenScale),
        maxWorldRadius * 0.62,
      );
      subtleGraphic.circle(0, 0, subtleRadius).fill({ color: 0xf1f5f9, alpha: 0.45 }).stroke({
        width: Math.max(0.85 / worldToScreenScale, 0.72 / worldToScreenScale),
        color: 0x475569,
        alpha: 0.52,
      });
      g.addChild(markerContainer);
      continue;
    }
    const style = getStatsMarkerStyle(event);
    const isTwoPointer = event.kind === "TWO_POINTER";
    const isScoring = SCORING_KINDS.has(event.kind);
    const styleRadius = isTwoPointer ? style.radius * 1.06 : style.radius;
    const radius = Math.min(Math.max(styleRadius, minWorldRadius), maxWorldRadius);
    const fill = parseCssColorForPixi(style.fill);

    const markerContainer = new Container();
    markerContainer.position.set(worldPoint.x, worldPoint.y);
    if (onMarkerTap) {
      markerContainer.eventMode = "static";
      markerContainer.cursor = "pointer";
      markerContainer.on("pointerdown", (pointerEvent) => {
        (pointerEvent as { stopPropagation?: () => void }).stopPropagation?.();
      });
      markerContainer.on("pointertap", (pointerEvent) => {
        (pointerEvent as { stopPropagation?: () => void }).stopPropagation?.();
        onMarkerTap(event.id);
      });
    }
    const markerGraphic = new Graphics();
    markerContainer.addChild(markerGraphic);

    if (isScoring) {
      const glow = SCORE_MARKER_GLOW[event.kind as keyof typeof SCORE_MARKER_GLOW];
      markerGraphic.circle(0, 0, radius * glow.outerRadiusScale).fill({
        color: fill.color,
        alpha: glow.outerAlpha,
      });
      markerGraphic.circle(0, 0, radius * glow.midRadiusScale).fill({
        color: fill.color,
        alpha: glow.midAlpha,
      });
    }

    markerGraphic.circle(0, 0, radius).fill({ color: fill.color, alpha: fill.alpha });

    // Tap area is explicitly decoupled from visual radius so small non-scoring dots
    // remain reliably tappable at sideline distances and match pace.
    const tapRadius = isScoring
      ? Math.max(radius * 1.8, 16 / worldToScreenScale)
      : Math.max(radius * 2.4, 16 / worldToScreenScale);
    markerContainer.hitArea = new Circle(0, 0, tapRadius);

    const shouldShowPlayerNumber =
      showPlayerLabels &&
      typeof event.playerNumber === "number" &&
      Number.isFinite(event.playerNumber) &&
      event.playerNumber > 0 &&
      (event.team == null || event.team === "HOME");
    if (shouldShowPlayerNumber) {
      // V1 decision: keep player metadata on events, but hide live marker number labels.
    }

    g.addChild(markerContainer);
  }
}
