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

function drawZoneCell(layer: Graphics, zone: ZoneOverlayZone): void {
  const frame = zoneFrame(zone.bounds);
  const hasEvents = zone.count > 0;
  const activity = clamp01(zone.percentage / 100);
  const isStrongestZone = zone.hotspotRank === 1 && hasEvents;

  const fillAlpha = hasEvents
    ? 0.006 + activity * 0.055 + (isStrongestZone ? 0.018 : 0)
    : 0.0018;
  const borderAlpha = hasEvents
    ? 0.09 + activity * 0.17 + (isStrongestZone ? 0.09 : 0)
    : 0.035;

  layer.rect(frame.x, frame.y, frame.w, frame.h).fill({
    color: isStrongestZone ? 0x7dd3fc : 0x67e8f9,
    alpha: fillAlpha,
  }).stroke({
    color: isStrongestZone ? 0xe0f2fe : 0xb6e7ff,
    width: 0.6,
    alpha: borderAlpha,
    alignment: 0.5,
  });

  if (!isStrongestZone) return;
  layer.rect(frame.x + 0.6, frame.y + 0.6, Math.max(0, frame.w - 1.2), Math.max(0, frame.h - 1.2)).stroke({
    color: 0xf0f9ff,
    width: 0.5,
    alpha: 0.28,
    alignment: 0.5,
  });
}

function drawZoneCountBadge(layer: Graphics, zone: ZoneOverlayZone): void {
  if (zone.count <= 0) return;

  const frame = zoneFrame(zone.bounds);
  const textValue = String(zone.count);
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const badgePaddingX = 3;
  const badgeHeight = 10;
  const textWidth = textValue.length * 4.1;
  const badgeWidth = Math.max(12, textWidth + badgePaddingX * 2);
  const badgeX = frame.x + frame.w - badgeWidth - 1.5;
  const badgeY = frame.y + 1.5;
  const isStrongestZone = zone.hotspotRank === 1;

  const badgeContainer = new Container();
  badgeContainer.eventMode = "none";

  const badgeBackground = new Graphics();
  badgeBackground.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 5).fill({
    color: 0x082f49,
    alpha: isStrongestZone ? 0.58 : 0.42,
  }).stroke({
    color: 0xe0f2fe,
    width: 0.45,
    alpha: isStrongestZone ? 0.52 : 0.34,
    alignment: 0.5,
  });

  const countLabel = new Text({
    text: textValue,
    style: {
      fill: 0xf8fbff,
      fontSize: 7,
      fontWeight: "800",
      fontFamily: '"Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: 0.1,
      align: "center",
    },
  });
  countLabel.anchor.set(0.5);
  countLabel.position.set(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.1);
  countLabel.resolution = textResolution;
  countLabel.roundPixels = true;

  badgeContainer.addChild(badgeBackground, countLabel);
  layer.addChild(badgeContainer);
}

export function drawStatsZoneOverlay(
  layer: Graphics,
  model: ZoneOverlayModel | null,
): void {
  layer.clear();
  const oldChildren = layer.removeChildren();
  for (const child of oldChildren) {
    child.destroy({ children: true });
  }
  if (!model) return;

  for (const zone of model.zones) {
    drawZoneCell(layer, zone);
  }
  for (const zone of model.zones) {
    drawZoneCountBadge(layer, zone);
  }
}
