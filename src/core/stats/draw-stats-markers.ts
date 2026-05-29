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

export function drawStatsMarkers(
  g: Graphics,
  events: readonly RenderableMatchEvent[],
  opts?: {
    worldToScreenScale?: number;
    minScreenRadiusPx?: number;
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
  const minWorldRadius = minPx / worldToScreenScale;
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
      const subtleRadius = Math.max(minWorldRadius * 0.62, 1.1 / worldToScreenScale);
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
    const radius = Math.max(styleRadius, minWorldRadius);
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
      // TWO_POINTER gets slightly wider, denser glow to stay visually distinct from POINT/GOAL.
      const glowOuter = isTwoPointer ? radius * 1.95 : radius * 1.85;
      const glowMid   = isTwoPointer ? radius * 1.42 : radius * 1.38;
      markerGraphic.circle(0, 0, glowOuter).fill({ color: fill.color, alpha: isTwoPointer ? 0.16 : 0.11 });
      markerGraphic.circle(0, 0, glowMid).fill({ color: fill.color, alpha: isTwoPointer ? 0.24 : 0.17 });
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
