import type { Container } from "pixi.js";

import type { WorldViewportMapper } from "../coordinates/viewport";

type LocalPositionProvider = {
  getLocalPosition?: (target: Container) => { x: number; y: number };
};

type PointerEventShape = {
  pointerId?: unknown;
  data?: LocalPositionProvider;
  getLocalPosition?: (target: Container) => { x: number; y: number };
};

export function getStagePointFromEvent(
  event: unknown,
  stage: Container,
): { x: number; y: number } | null {
  const pointerEvent = event as PointerEventShape;
  const stagePoint =
    pointerEvent.data?.getLocalPosition?.(stage) ??
    pointerEvent.getLocalPosition?.(stage);
  return stagePoint ?? null;
}

export function getPointerIdFromEvent(event: unknown): number | null {
  const pointerId = (event as PointerEventShape).pointerId;
  return typeof pointerId === "number" ? pointerId : null;
}

export function getWorldPointFromEvent(
  event: unknown,
  stage: Container,
  mapper: WorldViewportMapper,
): { x: number; y: number } | null {
  const stagePoint = getStagePointFromEvent(event, stage);
  if (!stagePoint) return null;
  return mapper.viewportToWorld(stagePoint);
}

export function getNormalizedPointFromEvent(
  event: unknown,
  stage: Container,
  mapper: WorldViewportMapper,
) {
  const worldPoint = getWorldPointFromEvent(event, stage, mapper);
  if (!worldPoint) return null;
  return mapper.worldToNormalized(worldPoint);
}

