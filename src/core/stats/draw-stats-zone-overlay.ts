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

  if (isStrongestZone) {
    layer.roundRect(frame.x - 0.9, frame.y - 0.9, frame.w + 1.8, frame.h + 1.8, 1.8).fill({
      color: 0x6dd3ff,
      alpha: 0.014 + activity * 0.028,
    });
  }

  const fillAlpha = hasEvents
    ? 0.002 + activity * 0.022 + (isStrongestZone ? 0.01 : 0)
    : 0.0007;
  const borderAlpha = hasEvents
    ? 0.03 + activity * 0.09 + (isStrongestZone ? 0.045 : 0)
    : 0.012;

  layer.rect(frame.x, frame.y, frame.w, frame.h).fill({
    color: isStrongestZone ? 0x77d8ff : 0x70dcff,
    alpha: fillAlpha,
  }).stroke({
    color: isStrongestZone ? 0xbadcf1 : 0xa9d0e8,
    width: 0.45,
    alpha: borderAlpha,
    alignment: 0.5,
  });

  if (!isStrongestZone) return;
  layer.roundRect(frame.x + 0.75, frame.y + 0.75, Math.max(0, frame.w - 1.5), Math.max(0, frame.h - 1.5), 1.2).stroke({
    color: 0xcbe8f8,
    width: 0.4,
    alpha: 0.08 + activity * 0.06,
    alignment: 0.5,
  });
}

function drawZoneCountBadge(layer: Graphics, zone: ZoneOverlayZone): void {
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
    color: 0x082f49,
    alpha: isStrongestZone ? 0.34 : 0.24,
  }).stroke({
    color: 0xb5d8eb,
    width: 0.35,
    alpha: isStrongestZone ? 0.2 : 0.14,
    alignment: 0.5,
  });

  const countLabel = new Text({
    text: textValue,
    style: {
      fill: 0xf3f8ff,
      fontSize: 4.7,
      fontWeight: "800",
      fontFamily: '"Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: 0.05,
      align: "center",
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
