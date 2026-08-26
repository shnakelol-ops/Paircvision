import { Container, Graphics, Text } from "pixi.js";

import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";
import type { ZoneBounds, ZoneOverlayModel, ZoneOverlayZone } from "../../stats/zones/zone-types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toWorldX(zoneX: number): number {
  return (zoneX / 100) * BOARD_PITCH_VIEWBOX.w;
}

function toWorldY(zoneY: number): number {
  return (zoneY / 100) * BOARD_PITCH_VIEWBOX.h;
}

function zoneFrame(bounds: ZoneBounds): { x: number; y: number; w: number; h: number } {
  const x = toWorldX(bounds.xMin);
  const y = toWorldY(bounds.yMin);
  return {
    x,
    y,
    w: toWorldX(bounds.xMax) - x,
    h: toWorldY(bounds.yMax) - y,
  };
}

/**
 * Every alpha the overlay draws with. All other callers (Match Stats'
 * StatsModeSurface.tsx, Rapid Capture's RapidReviewScreen.tsx) call
 * drawStatsZoneOverlay with no third argument, so DEFAULT_ZONE_OVERLAY_STYLE
 * is exactly the appearance this overlay has always had — changing a value
 * here changes their rendering too. A caller that wants a different
 * presentation (e.g. Event Stats Review's stronger grid) must pass its own
 * style object rather than editing these defaults.
 */
export type ZoneOverlayStyle = {
  /** Border alpha for a zone with zero events — this is the floor that
   *  makes the 3x3 grid readable as a grid even on a sparse filtered set. */
  emptyBorderAlpha: number;
  emptyFillAlpha: number;
  borderAlphaBase: number;
  borderAlphaActivity: number;
  fillAlphaBase: number;
  fillAlphaActivity: number;
  hotspotBorderBoost: number;
  hotspotFillBoost: number;
  hotspotGlowBase: number;
  hotspotGlowActivity: number;
  hotspotRingBase: number;
  hotspotRingActivity: number;
  badgeBackgroundAlpha: number;
  badgeBackgroundAlphaHotspot: number;
  badgeBorderAlpha: number;
  badgeBorderAlphaHotspot: number;
};

export const DEFAULT_ZONE_OVERLAY_STYLE: ZoneOverlayStyle = {
  emptyBorderAlpha: 0.02,
  emptyFillAlpha: 0.0011,
  borderAlphaBase: 0.045,
  borderAlphaActivity: 0.11,
  fillAlphaBase: 0.0038,
  fillAlphaActivity: 0.026,
  hotspotBorderBoost: 0.06,
  hotspotFillBoost: 0.014,
  hotspotGlowBase: 0.022,
  hotspotGlowActivity: 0.038,
  hotspotRingBase: 0.13,
  hotspotRingActivity: 0.08,
  badgeBackgroundAlpha: 0.36,
  badgeBackgroundAlphaHotspot: 0.48,
  badgeBorderAlpha: 0.24,
  badgeBorderAlphaHotspot: 0.34,
};

function drawZoneCell(layer: Graphics, zone: ZoneOverlayZone, style: ZoneOverlayStyle): void {
  const frame = zoneFrame(zone.bounds);
  const hasEvents = zone.count > 0;
  const activity = clamp01(zone.percentage / 100);
  const isStrongestZone = zone.hotspotRank === 1 && hasEvents;

  if (isStrongestZone) {
    layer.roundRect(frame.x - 0.9, frame.y - 0.9, frame.w + 1.8, frame.h + 1.8, 1.8).fill({
      color: 0x6dd3ff,
      alpha: style.hotspotGlowBase + activity * style.hotspotGlowActivity,
    });
  }

  const fillAlpha = hasEvents
    ? style.fillAlphaBase + activity * style.fillAlphaActivity + (isStrongestZone ? style.hotspotFillBoost : 0)
    : style.emptyFillAlpha;
  const borderAlpha = hasEvents
    ? style.borderAlphaBase + activity * style.borderAlphaActivity + (isStrongestZone ? style.hotspotBorderBoost : 0)
    : style.emptyBorderAlpha;

  layer.rect(frame.x, frame.y, frame.w, frame.h).fill({
    color: isStrongestZone ? 0x77d8ff : 0x70dcff,
    alpha: fillAlpha,
  }).stroke({
    color: isStrongestZone ? 0xbadcf1 : 0xa9d0e8,
    width: 0.5,
    alpha: borderAlpha,
    alignment: 0.5,
  });

  if (!isStrongestZone) return;
  layer.roundRect(frame.x + 0.75, frame.y + 0.75, Math.max(0, frame.w - 1.5), Math.max(0, frame.h - 1.5), 1.2).stroke({
    color: 0xcbe8f8,
    width: 0.45,
    alpha: style.hotspotRingBase + activity * style.hotspotRingActivity,
    alignment: 0.5,
  });
}

function drawZoneCountBadge(layer: Graphics, zone: ZoneOverlayZone, style: ZoneOverlayStyle): void {
  if (zone.count <= 0) return;

  const frame = zoneFrame(zone.bounds);
  const textValue = String(zone.count);
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const badgePaddingX = 1.9;
  const badgeHeight = 6.4;
  const textWidth = textValue.length * 3.1;
  const badgeWidth = Math.max(8, textWidth + badgePaddingX * 2);
  const badgeX = frame.x + frame.w - badgeWidth - 1.2;
  const badgeY = frame.y + 1.2;
  const isStrongestZone = zone.hotspotRank === 1;

  const badgeContainer = new Container();
  badgeContainer.eventMode = "none";

  const badgeBackground = new Graphics();
  badgeBackground.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 3.6).fill({
    color: 0x061f31,
    alpha: isStrongestZone ? style.badgeBackgroundAlphaHotspot : style.badgeBackgroundAlpha,
  }).stroke({
    color: 0xcce6f5,
    width: 0.35,
    alpha: isStrongestZone ? style.badgeBorderAlphaHotspot : style.badgeBorderAlpha,
    alignment: 0.5,
  });

  const countLabel = new Text({
    text: textValue,
    style: {
      fill: 0xffffff,
      fontSize: 4.7,
      fontWeight: "800",
      fontFamily: '"Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: 0.05,
      align: "center",
      stroke: {
        color: 0x03131f,
        width: 0.45,
      },
    },
  });
  countLabel.anchor.set(0.5);
  countLabel.position.set(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.05);
  countLabel.resolution = textResolution;
  countLabel.roundPixels = true;

  badgeContainer.addChild(badgeBackground, countLabel);
  layer.addChild(badgeContainer);
}

export function drawStatsZoneOverlay(
  layer: Graphics,
  model: ZoneOverlayModel | null,
  style?: Partial<ZoneOverlayStyle>,
): void {
  layer.clear();
  const oldChildren = layer.removeChildren();
  for (const child of oldChildren) {
    child.destroy({ children: true });
  }
  if (!model) return;

  const resolvedStyle: ZoneOverlayStyle = style
    ? { ...DEFAULT_ZONE_OVERLAY_STYLE, ...style }
    : DEFAULT_ZONE_OVERLAY_STYLE;

  for (const zone of model.zones) {
    drawZoneCell(layer, zone, resolvedStyle);
  }
  for (const zone of model.zones) {
    drawZoneCountBadge(layer, zone, resolvedStyle);
  }
}
