/**
 * pro-tagger-map-nearby.ts
 *
 * Event Map (Event Stats Review): which other events sit at the spot of the
 * marker the coach opened, so that events whose markers are covered by later
 * markers (or share identical coordinates) can still be opened, edited and
 * deleted from the Event detail panel.
 *
 * Read-only use of the shared pitch geometry: positions are converted to
 * rendered CSS pixels with the same letterbox the pitch surface uses
 * (letterboxPitchWorld + BOARD_PITCH_VIEWBOX); nothing in the shared pitch
 * code is changed.
 *
 * Threshold. In draw-stats-markers.ts a marker's visible dot is clamped to at
 * most 10 px radius, and its tap circle is max(dot × 2.4, 16 px) — at most
 * 24 px. A tap on event T's dot opens a different marker L only if the tap
 * point lies in L's tap circle, so |T − L| ≤ dot(T) + tap(L) ≤ 10 + 24 = 34 px
 * at every screen size (the clamps are in screen pixels). Listing every
 * event within 34 rendered px of the opened marker therefore always includes
 * the event the coach actually tapped.
 */
import { BOARD_PITCH_VIEWBOX } from "../core/pitch/pitch-space";
import { letterboxPitchWorld } from "../core/coordinates/pitch-coordinates";

/** Max visible marker radius (10 px) + max marker tap radius (24 px). */
export const NEARBY_MARKER_RADIUS_PX = 34;

type Positioned = { id: string; nx: number; ny: number };

/**
 * Events from `visibleEvents` (the Event Map's current filtered set) whose
 * markers lie within `radiusPx` rendered pixels of `anchor`, nearest first
 * (ties keep the visible order). Includes the anchor itself when it is
 * visible. Returns [] when the pitch has not been laid out yet.
 */
export function findNearbyMapEvents<T extends Positioned>(
  anchor: Positioned,
  visibleEvents: readonly T[],
  pitchSizePx: { width: number; height: number },
  radiusPx: number = NEARBY_MARKER_RADIUS_PX,
): T[] {
  if (!(pitchSizePx.width > 0 && pitchSizePx.height > 0)) return [];
  const { scale } = letterboxPitchWorld(pitchSizePx.width, pitchSizePx.height);
  const pxPerNx = BOARD_PITCH_VIEWBOX.w * scale;
  const pxPerNy = BOARD_PITCH_VIEWBOX.h * scale;
  return visibleEvents
    .map((e, i) => ({ e, i, d: Math.hypot((e.nx - anchor.nx) * pxPerNx, (e.ny - anchor.ny) * pxPerNy) }))
    .filter((x) => x.d <= radiusPx)
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.e);
}
