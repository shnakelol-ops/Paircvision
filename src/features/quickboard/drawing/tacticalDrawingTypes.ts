import type { WorldViewportMapper } from "../../../engine/pixi/createWorldViewport";
import {
  clampNormalized,
  type NormalizedPoint,
} from "../../../engine/shared/normalization";

export type TacticalDrawingKind =
  | "plain-line"
  | "straight-arrow"
  | "curved-arrow"
  | "dashed-arrow"
  | "wavy-line"
  | "free-pen"
  | "rectangle-zone"
  | "circle-zone";

export type TacticalDrawingTool = "move" | TacticalDrawingKind | "eraser";

export type WhiteboardDrawTool =
  | "move"
  | "line"
  | "arrow"
  | "curved"
  | "dashed"
  | "wavy"
  | "freePen"
  | "rectangleZone"
  | "circleZone"
  | "pen"
  | "eraser";

export type TacticalDrawingRecord = {
  id: string;
  kind: TacticalDrawingKind;
  points: NormalizedPoint[];
  color: number;
  width: number;
  opacity: number;
  createdAt: number;
};

export type TacticalDrawingSnapshot = TacticalDrawingRecord;

const LEGACY_TO_KIND: Record<Exclude<WhiteboardDrawTool, "move" | "eraser">, TacticalDrawingKind> = {
  pen: "wavy-line",
  line: "plain-line",
  arrow: "straight-arrow",
  dashed: "dashed-arrow",
  curved: "curved-arrow",
  wavy: "wavy-line",
  freePen: "free-pen",
  rectangleZone: "rectangle-zone",
  circleZone: "circle-zone",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeNumber(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

export function sanitizeDrawingTool(value: unknown): TacticalDrawingTool | null {
  if (value === "move" || value === "eraser") return value;
  if (
    value === "plain-line" ||
    value === "straight-arrow" ||
    value === "curved-arrow" ||
    value === "dashed-arrow" ||
    value === "wavy-line" ||
    value === "free-pen" ||
    value === "rectangle-zone" ||
    value === "circle-zone"
  ) {
    return value;
  }
  if (
    value === "line" ||
    value === "arrow" ||
    value === "curved" ||
    value === "dashed" ||
    value === "wavy" ||
    value === "pen" ||
    value === "freePen" ||
    value === "rectangleZone" ||
    value === "circleZone"
  ) {
    return LEGACY_TO_KIND[value];
  }
  return null;
}

export function drawingToolToWhiteboardTool(tool: TacticalDrawingTool): WhiteboardDrawTool {
  if (tool === "move" || tool === "eraser") return tool;
  switch (tool) {
    case "plain-line":
      return "line";
    case "straight-arrow":
      return "arrow";
    case "curved-arrow":
      return "curved";
    case "dashed-arrow":
      return "dashed";
    case "wavy-line":
      return "wavy";
    case "free-pen":
      return "freePen";
    case "rectangle-zone":
      return "rectangleZone";
    case "circle-zone":
      return "circleZone";
    default:
      return "line";
  }
}

export function clampDrawingPoint(point: { x: number; y: number }): NormalizedPoint {
  return {
    x: clampNormalized(point.x),
    y: clampNormalized(point.y),
  };
}

function sanitizeDrawingKind(value: unknown): TacticalDrawingKind | null {
  if (
    value === "plain-line" ||
    value === "straight-arrow" ||
    value === "curved-arrow" ||
    value === "dashed-arrow" ||
    value === "wavy-line" ||
    value === "free-pen" ||
    value === "rectangle-zone" ||
    value === "circle-zone"
  ) {
    return value;
  }
  if (
    value === "line" ||
    value === "arrow" ||
    value === "curved" ||
    value === "dashed" ||
    value === "wavy" ||
    value === "pen" ||
    value === "freePen" ||
    value === "rectangleZone" ||
    value === "circleZone"
  ) {
    return LEGACY_TO_KIND[value];
  }
  return null;
}

function sanitizeNormalizedPoint(value: unknown): NormalizedPoint | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== "number" || typeof value.y !== "number") return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return clampDrawingPoint({ x: value.x, y: value.y });
}

function sanitizeNormalizedPoints(value: unknown): NormalizedPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => sanitizeNormalizedPoint(point))
    .filter((point): point is NormalizedPoint => point != null);
}

function sanitizeWorldPoint(
  value: unknown,
  mapper: Pick<WorldViewportMapper, "worldToNormalized">,
): NormalizedPoint | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== "number" || typeof value.y !== "number") return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return mapper.worldToNormalized({ x: value.x, y: value.y });
}

function sanitizeWorldPoints(
  value: unknown,
  mapper: Pick<WorldViewportMapper, "worldToNormalized">,
): NormalizedPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => sanitizeWorldPoint(point, mapper))
    .filter((point): point is NormalizedPoint => point != null);
}

function sanitizeCreatedAt(value: unknown): number {
  return Math.floor(sanitizeNumber(value, Date.now(), 0));
}

function sanitizeColor(value: unknown): number {
  return Math.floor(sanitizeNumber(value, 0x111111, 0));
}

function sanitizeWidth(value: unknown): number {
  return sanitizeNumber(value, 1.15, 0.35);
}

function sanitizeOpacity(value: unknown): number {
  return Math.max(0.15, Math.min(1, sanitizeNumber(value, 0.95, 0)));
}

function sanitizeDrawingIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeKindPoints(kind: TacticalDrawingKind, points: NormalizedPoint[]): NormalizedPoint[] {
  if (kind === "wavy-line" || kind === "free-pen") return points;
  if (kind === "curved-arrow") {
    if (points.length >= 3) {
      return [points[0]!, points[1]!, points[points.length - 1]!];
    }
    if (points.length >= 2) {
      const start = points[0]!;
      const end = points[1]!;
      const control: NormalizedPoint = {
        x: clampNormalized((start.x + end.x) * 0.5),
        y: clampNormalized((start.y + end.y) * 0.5),
      };
      return [start, control, end];
    }
    return points;
  }
  if (points.length >= 2) {
    return [points[0]!, points[points.length - 1]!];
  }
  return points;
}

function sanitizeNormalizedSnapshot(input: unknown): TacticalDrawingSnapshot | null {
  if (!isRecord(input)) return null;
  const id = sanitizeDrawingIdentity(input.id);
  const kind = sanitizeDrawingKind(input.kind ?? input.type);
  if (!id || !kind) return null;
  const points = normalizeKindPoints(kind, sanitizeNormalizedPoints(input.points));
  if (points.length < 2) return null;
  return {
    id,
    kind,
    points,
    color: sanitizeColor(input.color),
    width: sanitizeWidth(input.width),
    opacity: sanitizeOpacity(input.opacity),
    createdAt: sanitizeCreatedAt(input.createdAt),
  };
}

function sanitizeLegacySnapshot(
  input: unknown,
  mapper: Pick<WorldViewportMapper, "worldToNormalized">,
): TacticalDrawingSnapshot | null {
  if (!isRecord(input)) return null;
  const id = sanitizeDrawingIdentity(input.id);
  if (!id) return null;
  const legacyType = input.type;
  const kind = sanitizeDrawingKind(legacyType);
  if (!kind) return null;
  const geometry = input.geometry;
  if (!isRecord(geometry)) return null;
  let points: NormalizedPoint[] = [];
  if (legacyType === "pen" || legacyType === "freePen") {
    points = sanitizeWorldPoints(geometry.points, mapper);
  } else {
    const start = sanitizeWorldPoint(geometry.start, mapper);
    const end = sanitizeWorldPoint(geometry.end, mapper);
    const control = sanitizeWorldPoint(geometry.controlPoint, mapper);
    if (start && end) {
      points = control ? [start, control, end] : [start, end];
    }
  }
  points = normalizeKindPoints(kind, points);
  if (points.length < 2) return null;
  return {
    id,
    kind,
    points,
    color: sanitizeColor(input.color),
    width: 1.15,
    opacity: 0.95,
    createdAt: sanitizeCreatedAt(input.createdAt),
  };
}

export function sanitizeDrawingSnapshot(
  input: unknown,
  mapper: Pick<WorldViewportMapper, "worldToNormalized">,
): TacticalDrawingSnapshot | null {
  return sanitizeNormalizedSnapshot(input) ?? sanitizeLegacySnapshot(input, mapper);
}

export function cloneDrawingSnapshot(snapshot: TacticalDrawingSnapshot): TacticalDrawingSnapshot {
  return {
    ...snapshot,
    points: snapshot.points.map((point) => ({ x: point.x, y: point.y })),
  };
}
