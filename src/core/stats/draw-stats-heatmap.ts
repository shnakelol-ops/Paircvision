import { Graphics } from "pixi.js";

import type { MatchEvent } from "./stats-event-model";
import { boardNormToWorld } from "../coordinates/pitch-coordinates";

type RenderableMatchEvent = MatchEvent & {
  playerName?: string;
  playerNumber?: number;
  team?: "HOME" | "AWAY";
};

type HeatBucket = { nx: number; ny: number; count: number };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function addToBucket(map: Map<string, HeatBucket>, event: RenderableMatchEvent, bucketSize: number): void {
  const bx = Math.max(0, Math.min(Math.floor(clamp01(event.nx) / bucketSize), Math.floor(1 / bucketSize)));
  const by = Math.max(0, Math.min(Math.floor(clamp01(event.ny) / bucketSize), Math.floor(1 / bucketSize)));
  const key = `${bx}:${by}`;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(key, {
    nx: Math.min(0.995, (bx + 0.5) * bucketSize),
    ny: Math.min(0.995, (by + 0.5) * bucketSize),
    count: 1,
  });
}

export function drawStatsHeatmap(
  g: Graphics,
  events: readonly RenderableMatchEvent[],
): void {
  g.clear();
  if (events.length === 0) return;

  const bucketSize = 0.08;
  const buckets = new Map<string, HeatBucket>();
  let maxCount = 0;

  for (const event of events) {
    addToBucket(buckets, event, bucketSize);
    const bx = Math.max(0, Math.min(Math.floor(clamp01(event.nx) / bucketSize), Math.floor(1 / bucketSize)));
    const by = Math.max(0, Math.min(Math.floor(clamp01(event.ny) / bucketSize), Math.floor(1 / bucketSize)));
    const bucket = buckets.get(`${bx}:${by}`);
    if (!bucket) continue;
    if (bucket.count > maxCount) {
      maxCount = bucket.count;
    }
  }

  if (maxCount <= 0) return;

  for (const bucket of buckets.values()) {
    const center = boardNormToWorld(bucket.nx, bucket.ny);
    const intensity = clamp01(bucket.count / maxCount);
    const outerRadius = 8 + intensity * 5;
    const innerRadius = 4 + intensity * 2.5;
    const outerAlpha = 0.07 + intensity * 0.09;
    const innerAlpha = 0.08 + intensity * 0.1;

    g.circle(center.x, center.y, outerRadius).fill({
      color: 0x38bdf8,
      alpha: outerAlpha,
    });
    g.circle(center.x, center.y, innerRadius).fill({
      color: 0x0ea5e9,
      alpha: innerAlpha,
    });
  }
}
