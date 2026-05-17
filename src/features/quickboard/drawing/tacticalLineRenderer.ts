import { Graphics } from "pixi.js";

import type { WorldViewportMapper } from "../../../engine/pixi/createWorldViewport";
import type { NormalizedPoint } from "../../../engine/shared/normalization";
import {
  createTacticalStrokeStyle,
  getArrowMetrics,
  getDashPattern,
  getDeleteHitRadius,
  getPointCleanupDistance,
  getSmoothIterations,
  getWavyStyle,
} from "./tacticalLineStyles";
import type { TacticalDrawingKind, TacticalDrawingRecord } from "./tacticalDrawingTypes";

type WorldPoint = { x: number; y: number };
type ZoneBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampScalar(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector(from: WorldPoint, to: WorldPoint): { x: number; y: number; length: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-5) return null;
  return {
    x: dx / length,
    y: dy / length,
    length,
  };
}

function cleanupPoints(points: NormalizedPoint[], minDistance: number): NormalizedPoint[] {
  if (points.length <= 1) return points.slice();
  const cleaned: NormalizedPoint[] = [points[0]!];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = cleaned[cleaned.length - 1];
    if (!point || !previous) continue;
    if (distance(point, previous) >= minDistance) {
      cleaned.push(point);
    }
  }
  const lastInput = points[points.length - 1];
  const lastOutput = cleaned[cleaned.length - 1];
  if (lastInput && lastOutput && distance(lastInput, lastOutput) >= minDistance * 0.5) {
    cleaned.push(lastInput);
  }
  return cleaned;
}

function chaikinSmooth(points: NormalizedPoint[], iterations: number): NormalizedPoint[] {
  if (iterations <= 0 || points.length < 3) return points.slice();
  let output = points.slice();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (output.length < 3) break;
    const next: NormalizedPoint[] = [output[0]!];
    for (let index = 0; index < output.length - 1; index += 1) {
      const current = output[index]!;
      const nextPoint = output[index + 1]!;
      next.push(
        {
          x: current.x * 0.75 + nextPoint.x * 0.25,
          y: current.y * 0.75 + nextPoint.y * 0.25,
        },
        {
          x: current.x * 0.25 + nextPoint.x * 0.75,
          y: current.y * 0.25 + nextPoint.y * 0.75,
        },
      );
    }
    next.push(output[output.length - 1]!);
    output = next;
  }
  return output;
}

function toWorldPoints(
  points: readonly NormalizedPoint[],
  mapper: Pick<WorldViewportMapper, "normalizedToWorld">,
): WorldPoint[] {
  return points.map((point) => mapper.normalizedToWorld(point));
}

function getQuadraticPoint(start: WorldPoint, control: WorldPoint, end: WorldPoint, t: number): WorldPoint {
  const inv = 1 - t;
  return {
    x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
  };
}

function sampleQuadraticCurve(start: WorldPoint, control: WorldPoint, end: WorldPoint): WorldPoint[] {
  const chord = distance(start, end);
  const arcHint = chord + distance(start, control) + distance(control, end);
  const steps = Math.max(14, Math.min(64, Math.round(arcHint / 1.5)));
  const sampled: WorldPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    sampled.push(getQuadraticPoint(start, control, end, index / steps));
  }
  return sampled;
}

function chooseCurveReferenceVector(points: readonly NormalizedPoint[]): { x: number; y: number; length: number } | null {
  if (points.length < 2) return null;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const direct = normalizeVector(start, end);
  if (direct && direct.length >= 0.28) {
    return direct;
  }
  let fallback: { x: number; y: number; length: number } | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const vector = normalizeVector(start, point);
    if (!vector) continue;
    if (!fallback || vector.length > fallback.length) {
      fallback = vector;
    }
  }
  return fallback ?? direct;
}

function getControlPointFromGesture(points: readonly NormalizedPoint[]): NormalizedPoint | null {
  if (points.length < 2) return null;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const reference = chooseCurveReferenceVector(points);
  if (!reference) return null;
  const normal = { x: -reference.y, y: reference.x };
  const midpoint = {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
  };
  const midpointProjection = (midpoint.x - start.x) * reference.x + (midpoint.y - start.y) * reference.y;

  let weightedSignedTotal = 0;
  let weightedCount = 0;
  let dominantSignedDistance = 0;
  let dominantAbsoluteDistance = 0;
  let dominantProjection = midpointProjection;
  let gestureReach = reference.length;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const relativeX = point.x - start.x;
    const relativeY = point.y - start.y;
    const projection = relativeX * reference.x + relativeY * reference.y;
    const signedDistance = relativeX * normal.x + relativeY * normal.y;
    const absoluteDistance = Math.abs(signedDistance);
    const pointWeight = Math.max(0.25, 1 - Math.abs((index / (points.length - 1)) * 2 - 1) * 0.58);
    weightedSignedTotal += signedDistance * pointWeight;
    weightedCount += pointWeight;
    if (absoluteDistance > dominantAbsoluteDistance + 1e-6) {
      dominantAbsoluteDistance = absoluteDistance;
      dominantSignedDistance = signedDistance;
      dominantProjection = projection;
    }
    gestureReach = Math.max(gestureReach, Math.hypot(relativeX, relativeY));
  }

  const averageSignedDistance = weightedCount > 0 ? weightedSignedTotal / weightedCount : 0;
  let bendSign = Math.sign(averageSignedDistance);
  if (bendSign === 0 && dominantAbsoluteDistance > 1e-6) {
    bendSign = Math.sign(dominantSignedDistance);
  }
  if (bendSign === 0 && points.length >= 3) {
    const earlyPoint = points[Math.min(points.length - 1, 2)]!;
    const earlyRelativeX = earlyPoint.x - start.x;
    const earlyRelativeY = earlyPoint.y - start.y;
    const earlySignedDistance = earlyRelativeX * normal.x + earlyRelativeY * normal.y;
    bendSign = Math.sign(earlySignedDistance);
  }
  if (bendSign === 0) {
    bendSign = 1;
  }

  const chordLength = distance(start, end);
  const scaleLength = Math.max(chordLength, reference.length, 0.64);
  const minBowDistance = clampScalar(scaleLength * 0.17, 0.58, 3.4);
  const maxBowDistance = Math.max(
    minBowDistance + 0.24,
    Math.min(11.5, Math.max(scaleLength * 0.92 + 2.1, gestureReach * 0.94)),
  );
  const inferredBow = Math.max(dominantAbsoluteDistance, Math.abs(averageSignedDistance));
  const bowDistance = clampScalar(inferredBow, minBowDistance, maxBowDistance);

  const maxAlongShift = clampScalar(scaleLength * 0.34, 0.45, 5.6);
  const alongShift =
    dominantAbsoluteDistance > 0.08
      ? clampScalar(dominantProjection - midpointProjection, -maxAlongShift, maxAlongShift)
      : 0;

  return {
    x: midpoint.x + reference.x * alongShift + normal.x * bowDistance * bendSign,
    y: midpoint.y + reference.y * alongShift + normal.y * bowDistance * bendSign,
  };
}

function drawSolidPolyline(graphics: Graphics, points: readonly WorldPoint[], style: ReturnType<typeof createTacticalStrokeStyle>): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    graphics.lineTo(point.x, point.y);
  }
  graphics.stroke(style);
}

function drawDashedPolyline(
  graphics: Graphics,
  points: readonly WorldPoint[],
  style: ReturnType<typeof createTacticalStrokeStyle>,
): void {
  if (points.length < 2) return;
  const { dash, gap } = getDashPattern(style.width);
  let drawPhase = true;
  let remaining = dash;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const vector = normalizeVector(start, end);
    if (!vector) continue;
    let traversed = 0;
    while (traversed < vector.length - 1e-5) {
      const step = Math.min(remaining, vector.length - traversed);
      const segmentStart = {
        x: start.x + vector.x * traversed,
        y: start.y + vector.y * traversed,
      };
      const segmentEnd = {
        x: start.x + vector.x * (traversed + step),
        y: start.y + vector.y * (traversed + step),
      };
      if (drawPhase) {
        graphics.moveTo(segmentStart.x, segmentStart.y);
        graphics.lineTo(segmentEnd.x, segmentEnd.y);
      }
      traversed += step;
      remaining -= step;
      if (remaining <= 1e-5) {
        drawPhase = !drawPhase;
        remaining = drawPhase ? dash : gap;
      }
    }
  }

  graphics.stroke(style);
}

function drawArrowHead(
  graphics: Graphics,
  tailPoint: WorldPoint,
  tipPoint: WorldPoint,
  style: ReturnType<typeof createTacticalStrokeStyle>,
): void {
  const vector = normalizeVector(tailPoint, tipPoint);
  if (!vector) return;
  const metrics = getArrowMetrics(style.width);
  const normal = { x: -vector.y, y: vector.x };
  const base = {
    x: tipPoint.x - vector.x * metrics.length,
    y: tipPoint.y - vector.y * metrics.length,
  };
  const left = {
    x: base.x + normal.x * metrics.halfWidth,
    y: base.y + normal.y * metrics.halfWidth,
  };
  const right = {
    x: base.x - normal.x * metrics.halfWidth,
    y: base.y - normal.y * metrics.halfWidth,
  };
  graphics
    .poly([tipPoint.x, tipPoint.y, left.x, left.y, right.x, right.y])
    .fill({ color: style.color, alpha: style.alpha });
}

function toArrowShaft(path: readonly WorldPoint[], width: number): WorldPoint[] {
  if (path.length < 2) return [];
  const output = path.map((point) => ({ x: point.x, y: point.y }));
  const tip = output[output.length - 1]!;
  let previous = output[output.length - 2]!;
  for (let index = output.length - 2; index >= 0; index -= 1) {
    const candidate = output[index]!;
    if (distance(candidate, tip) > 1e-4) {
      previous = candidate;
      break;
    }
  }
  const vector = normalizeVector(previous, tip);
  if (!vector) return output;
  const backoff = getArrowMetrics(width).backoff;
  output[output.length - 1] = {
    x: tip.x - vector.x * backoff,
    y: tip.y - vector.y * backoff,
  };
  return output;
}

function getZoneBounds(path: readonly WorldPoint[]): ZoneBounds | null {
  if (path.length < 2) return null;
  const start = path[0]!;
  const end = path[path.length - 1]!;
  const centerX = (start.x + end.x) * 0.5;
  const centerY = (start.y + end.y) * 0.5;
  const width = Math.max(Math.abs(end.x - start.x), 0.35);
  const height = Math.max(Math.abs(end.y - start.y), 0.35);
  const left = centerX - width * 0.5;
  const top = centerY - height * 0.5;
  const right = left + width;
  const bottom = top + height;
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    centerX,
    centerY,
    radiusX: width * 0.5,
    radiusY: height * 0.5,
  };
}

function drawRectangleZone(
  graphics: Graphics,
  drawing: TacticalDrawingRecord,
  bounds: ZoneBounds,
  isSelected: boolean,
): void {
  const strokeStyle = createTacticalStrokeStyle(drawing);
  const borderStyle = {
    ...strokeStyle,
    width: Math.max(0.45, strokeStyle.width * 1.12),
    alpha: Math.max(0.48, Math.min(1, drawing.opacity * 0.92)),
  };
  const fillAlpha = Math.max(0.12, Math.min(0.42, drawing.opacity * 0.3));
  const cornerRadius = Math.min(2.6, Math.max(0.28, Math.min(bounds.width, bounds.height) * 0.08));

  if (isSelected) {
    graphics.roundRect(bounds.left, bounds.top, bounds.width, bounds.height, cornerRadius).stroke({
      ...borderStyle,
      width: borderStyle.width + 0.8,
      alpha: Math.min(0.92, borderStyle.alpha * 0.46),
    });
  }

  graphics
    .roundRect(bounds.left, bounds.top, bounds.width, bounds.height, cornerRadius)
    .fill({ color: drawing.color, alpha: fillAlpha })
    .stroke(borderStyle);
}

function drawCircleZone(
  graphics: Graphics,
  drawing: TacticalDrawingRecord,
  bounds: ZoneBounds,
  isSelected: boolean,
): void {
  const strokeStyle = createTacticalStrokeStyle(drawing);
  const borderStyle = {
    ...strokeStyle,
    width: Math.max(0.45, strokeStyle.width * 1.12),
    alpha: Math.max(0.48, Math.min(1, drawing.opacity * 0.92)),
  };
  const fillAlpha = Math.max(0.12, Math.min(0.42, drawing.opacity * 0.3));

  if (isSelected) {
    graphics.ellipse(bounds.centerX, bounds.centerY, bounds.radiusX, bounds.radiusY).stroke({
      ...borderStyle,
      width: borderStyle.width + 0.8,
      alpha: Math.min(0.92, borderStyle.alpha * 0.46),
    });
  }

  graphics
    .ellipse(bounds.centerX, bounds.centerY, bounds.radiusX, bounds.radiusY)
    .fill({ color: drawing.color, alpha: fillAlpha })
    .stroke(borderStyle);
}

function sampleWavyPath(path: readonly WorldPoint[], width: number): WorldPoint[] {
  if (path.length < 2) return path.slice();
  const style = getWavyStyle(width);
  const sampled: WorldPoint[] = [];
  let segmentIndex = 0;
  let segmentStart = path[0]!;
  let segmentEnd = path[1]!;
  let segmentVector = normalizeVector(segmentStart, segmentEnd);
  let traversedOnSegment = 0;
  let traveled = 0;
  const totalLength = path.reduce((acc, point, index) => {
    if (index === 0) return acc;
    return acc + distance(path[index - 1]!, point);
  }, 0);
  if (totalLength < 1e-4) return path.slice();

  sampled.push({ x: path[0]!.x, y: path[0]!.y });
  while (traveled < totalLength - 1e-4 && sampled.length < style.maxSamples) {
    const step = Math.min(style.sampleStep, totalLength - traveled);
    traveled += step;
    traversedOnSegment += step;
    while (segmentVector && traversedOnSegment > segmentVector.length && segmentIndex < path.length - 2) {
      traversedOnSegment -= segmentVector.length;
      segmentIndex += 1;
      segmentStart = path[segmentIndex]!;
      segmentEnd = path[segmentIndex + 1]!;
      segmentVector = normalizeVector(segmentStart, segmentEnd);
    }
    if (!segmentVector) break;
    const base = {
      x: segmentStart.x + segmentVector.x * traversedOnSegment,
      y: segmentStart.y + segmentVector.y * traversedOnSegment,
    };
    const normal = { x: -segmentVector.y, y: segmentVector.x };
    const waveOffset = Math.sin((traveled / style.wavelength) * Math.PI * 2) * style.amplitude;
    sampled.push({
      x: base.x + normal.x * waveOffset,
      y: base.y + normal.y * waveOffset,
    });
  }
  sampled.push({ x: path[path.length - 1]!.x, y: path[path.length - 1]!.y });
  return sampled;
}

function getDrawingPathWorld(
  drawing: TacticalDrawingRecord,
  mapper: Pick<WorldViewportMapper, "normalizedToWorld">,
): WorldPoint[] {
  const worldPoints = toWorldPoints(drawing.points, mapper);
  if (worldPoints.length < 2) return worldPoints;
  if (drawing.kind === "curved-arrow") {
    const start = worldPoints[0]!;
    const control = worldPoints[1] ?? worldPoints[0]!;
    const end = worldPoints[worldPoints.length - 1]!;
    return sampleQuadraticCurve(start, control, end);
  }
  if (drawing.kind === "wavy-line") {
    return sampleWavyPath(worldPoints, drawing.width);
  }
  if (drawing.kind === "free-pen") {
    return worldPoints;
  }
  return [worldPoints[0]!, worldPoints[worldPoints.length - 1]!];
}

function drawArrowPolyline(
  graphics: Graphics,
  path: readonly WorldPoint[],
  style: ReturnType<typeof createTacticalStrokeStyle>,
  dashed: boolean,
): void {
  if (path.length < 2) return;
  const shaft = toArrowShaft(path, style.width);
  if (dashed) {
    drawDashedPolyline(graphics, shaft, style);
  } else {
    drawSolidPolyline(graphics, shaft, style);
  }
  const tip = path[path.length - 1]!;
  let tail = path[path.length - 2]!;
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const candidate = path[index]!;
    if (distance(candidate, tip) > 1e-4) {
      tail = candidate;
      break;
    }
  }
  drawArrowHead(graphics, tail, tip, style);
}

export function normalizeDraftPoints(kind: TacticalDrawingKind, points: readonly NormalizedPoint[]): NormalizedPoint[] {
  const cleaned = cleanupPoints(points.slice(), getPointCleanupDistance(kind));
  const smoothed = chaikinSmooth(cleaned, getSmoothIterations(kind));
  if (kind === "free-pen") {
    return smoothed.length >= 2 ? smoothed : cleaned;
  }
  if (kind === "wavy-line") {
    return smoothed.length >= 2 ? smoothed : cleaned;
  }
  if (kind === "curved-arrow") {
    const sourcePoints = smoothed.length >= 2 ? smoothed : cleaned;
    if (sourcePoints.length < 2) return sourcePoints;
    const start = sourcePoints[0]!;
    const end = sourcePoints[sourcePoints.length - 1]!;
    const control = getControlPointFromGesture(sourcePoints) ?? {
      x: (start.x + end.x) * 0.5,
      y: (start.y + end.y) * 0.5,
    };
    return [start, control, end];
  }
  if (smoothed.length < 2) return smoothed;
  return [smoothed[0]!, smoothed[smoothed.length - 1]!];
}

export function renderTacticalDrawing(
  graphics: Graphics,
  drawing: TacticalDrawingRecord,
  mapper: Pick<WorldViewportMapper, "normalizedToWorld">,
  isSelected = false,
): void {
  if (drawing.kind === "rectangle-zone" || drawing.kind === "circle-zone") {
    const zonePath = toWorldPoints(drawing.points, mapper);
    const zoneBounds = getZoneBounds(zonePath);
    if (!zoneBounds) return;
    if (drawing.kind === "rectangle-zone") {
      drawRectangleZone(graphics, drawing, zoneBounds, isSelected);
      return;
    }
    drawCircleZone(graphics, drawing, zoneBounds, isSelected);
    return;
  }

  const path = getDrawingPathWorld(drawing, mapper);
  if (path.length < 2) return;
  const strokeStyle = createTacticalStrokeStyle(drawing);
  if (isSelected) {
    const selectedStyle = {
      ...strokeStyle,
      width: strokeStyle.width + 0.75,
      alpha: Math.min(1, strokeStyle.alpha * 0.6),
    };
    if (drawing.kind === "dashed-arrow") {
      drawArrowPolyline(graphics, path, selectedStyle, true);
    } else if (drawing.kind === "straight-arrow" || drawing.kind === "curved-arrow") {
      drawArrowPolyline(graphics, path, selectedStyle, false);
    } else if (drawing.kind === "free-pen") {
      drawSolidPolyline(graphics, path, selectedStyle);
    } else if (drawing.kind === "wavy-line") {
      drawSolidPolyline(graphics, path, selectedStyle);
    } else {
      drawSolidPolyline(graphics, path, selectedStyle);
    }
  }
  if (drawing.kind === "dashed-arrow") {
    drawArrowPolyline(graphics, path, strokeStyle, true);
    return;
  }
  if (drawing.kind === "straight-arrow" || drawing.kind === "curved-arrow") {
    drawArrowPolyline(graphics, path, strokeStyle, false);
    return;
  }
  drawSolidPolyline(graphics, path, strokeStyle);
}

function distanceFromPointToRectangleZone(point: WorldPoint, bounds: ZoneBounds): number {
  if (point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom) {
    return 0;
  }
  const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  return Math.hypot(dx, dy);
}

function distanceFromPointToCircleZone(point: WorldPoint, bounds: ZoneBounds): number {
  if (bounds.radiusX <= 1e-4 || bounds.radiusY <= 1e-4) {
    return distance(point, { x: bounds.centerX, y: bounds.centerY });
  }
  const normalizedX = (point.x - bounds.centerX) / bounds.radiusX;
  const normalizedY = (point.y - bounds.centerY) / bounds.radiusY;
  const normalizedDistance = Math.hypot(normalizedX, normalizedY);
  if (normalizedDistance <= 1) {
    return 0;
  }
  const angle = Math.atan2(normalizedY, normalizedX);
  const edge = {
    x: bounds.centerX + Math.cos(angle) * bounds.radiusX,
    y: bounds.centerY + Math.sin(angle) * bounds.radiusY,
  };
  return distance(point, edge);
}

function distanceFromPointToSegment(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-5) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  return distance(point, projection);
}

function distanceFromPointToPath(point: WorldPoint, path: readonly WorldPoint[]): number {
  if (path.length <= 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distance(point, path[0]!);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    const candidate = distanceFromPointToSegment(point, path[index - 1]!, path[index]!);
    if (candidate < best) best = candidate;
  }
  return best;
}

export function findClosestDrawingIdAtWorldPoint(
  drawings: readonly TacticalDrawingRecord[],
  worldPoint: WorldPoint,
  mapper: Pick<WorldViewportMapper, "normalizedToWorld">,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = drawings.length - 1; index >= 0; index -= 1) {
    const drawing = drawings[index]!;
    let candidateDistance = Number.POSITIVE_INFINITY;
    if (drawing.kind === "rectangle-zone" || drawing.kind === "circle-zone") {
      const zoneBounds = getZoneBounds(toWorldPoints(drawing.points, mapper));
      if (!zoneBounds) continue;
      candidateDistance =
        drawing.kind === "rectangle-zone"
          ? distanceFromPointToRectangleZone(worldPoint, zoneBounds)
          : distanceFromPointToCircleZone(worldPoint, zoneBounds);
    } else {
      const path = getDrawingPathWorld(drawing, mapper);
      candidateDistance = distanceFromPointToPath(worldPoint, path);
    }
    const hitRadius =
      drawing.kind === "rectangle-zone" || drawing.kind === "circle-zone"
        ? Math.max(2.4, getDeleteHitRadius(drawing.width))
        : getDeleteHitRadius(drawing.width);
    if (candidateDistance <= hitRadius && candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestId = drawing.id;
    }
  }
  return bestId;
}
