import { Container, Graphics, Text } from "pixi.js";

import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";
import type { WorldViewportMapper } from "../coordinates/viewport";
import type { ZoneColor, ZoneRecord } from "../shell/types";
import { getStagePointFromEvent, getPointerIdFromEvent } from "../input/pointer-controller";

const WORLD_W = BOARD_PITCH_VIEWBOX.w;
const WORLD_H = BOARD_PITCH_VIEWBOX.h;

const ZONE_STROKE_W = 1.2;
const ZONE_STROKE_W_SELECTED = 1.7;
const ZONE_MIN_NORM_W = 5;
const ZONE_MIN_NORM_H = 5;
const ZONE_MIN_NORM_R = 4;
const HANDLE_VIS_R_WU = 2.8;
const HANDLE_TOUCH_PX = 46;
const LABEL_FONT_SIZE_WU = 6;

type ColorSpec = { fill: number; fillAlpha: number; stroke: number; strokeAlpha: number };

const COLOR_SPEC: Record<ZoneColor, ColorSpec> = {
  yellow: { fill: 0xf2c94c, fillAlpha: 0.18, stroke: 0xf2c94c, strokeAlpha: 0.72 },
  red:    { fill: 0xdc2626, fillAlpha: 0.18, stroke: 0xef4444, strokeAlpha: 0.72 },
  blue:   { fill: 0x2563eb, fillAlpha: 0.14, stroke: 0x5b8ff7, strokeAlpha: 0.68 },
  green:  { fill: 0x16a34a, fillAlpha: 0.18, stroke: 0x4ade80, strokeAlpha: 0.68 },
};

// 8 handles for rect: 0=TL,1=TC,2=TR,3=RC,4=BR,5=BC,6=BL,7=LC
// 1 handle for circle: 0=right-edge
function getHandleWorldPositions(zone: ZoneRecord): Array<{ x: number; y: number }> {
  const wx = (n: number) => (n / 100) * WORLD_W;
  const wy = (n: number) => (n / 100) * WORLD_H;
  if (zone.shape === "circle") {
    const cx = wx(zone.x);
    const cy = wy(zone.y);
    const r = wy(zone.radius ?? 10);
    return [{ x: cx + r, y: cy }];
  }
  const x = wx(zone.x);
  const y = wy(zone.y);
  const w = wx(zone.width ?? 20);
  const h = wy(zone.height ?? 20);
  return [
    { x, y },
    { x: x + w / 2, y },
    { x: x + w, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h },
    { x, y: y + h },
    { x, y: y + h / 2 },
  ];
}

function findHitHandle(
  zone: ZoneRecord,
  worldX: number,
  worldY: number,
  touchRadiusWorld: number,
): number | null {
  const handles = getHandleWorldPositions(zone);
  const r2 = touchRadiusWorld * touchRadiusWorld;
  let closest: number | null = null;
  let closestDist2 = r2;
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i]!;
    const dx = worldX - h.x;
    const dy = worldY - h.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= closestDist2) {
      closestDist2 = d2;
      closest = i;
    }
  }
  return closest;
}

function applyRectResize(snap: ZoneRecord, h: number, nx: number, ny: number): Partial<ZoneRecord> {
  const sx = snap.x;
  const sy = snap.y;
  const sw = snap.width ?? 20;
  const sh = snap.height ?? 20;
  const fixedR = sx + sw;
  const fixedB = sy + sh;
  let rx = sx, ry = sy, rw = sw, rh = sh;
  switch (h) {
    case 0: rx = Math.min(nx, fixedR - ZONE_MIN_NORM_W); ry = Math.min(ny, fixedB - ZONE_MIN_NORM_H); rw = fixedR - rx; rh = fixedB - ry; break;
    case 1: ry = Math.min(ny, fixedB - ZONE_MIN_NORM_H); rh = fixedB - ry; break;
    case 2: ry = Math.min(ny, fixedB - ZONE_MIN_NORM_H); rh = fixedB - ry; rw = Math.max(nx - sx, ZONE_MIN_NORM_W); break;
    case 3: rw = Math.max(nx - sx, ZONE_MIN_NORM_W); break;
    case 4: rw = Math.max(nx - sx, ZONE_MIN_NORM_W); rh = Math.max(ny - sy, ZONE_MIN_NORM_H); break;
    case 5: rh = Math.max(ny - sy, ZONE_MIN_NORM_H); break;
    case 6: rx = Math.min(nx, fixedR - ZONE_MIN_NORM_W); rw = fixedR - rx; rh = Math.max(ny - sy, ZONE_MIN_NORM_H); break;
    case 7: rx = Math.min(nx, fixedR - ZONE_MIN_NORM_W); rw = fixedR - rx; break;
  }
  rx = Math.max(0, Math.min(100 - rw, rx));
  ry = Math.max(0, Math.min(100 - rh, ry));
  return { x: rx, y: ry, width: Math.max(ZONE_MIN_NORM_W, rw), height: Math.max(ZONE_MIN_NORM_H, rh) };
}

type ZoneVisual = {
  zone: ZoneRecord;
  container: Container;
  graphics: Graphics;
  label: Text | null;
};

type DragState = {
  zoneId: string;
  pointerId: number;
  startNormX: number;
  startNormY: number;
  startPtrNormX: number;
  startPtrNormY: number;
} | null;

type ResizeState = {
  zoneId: string;
  pointerId: number;
  handleIndex: number;
  snapshotZone: ZoneRecord;
} | null;

type CreateZoneLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
  stage: Container;
  onZonesChange?: (zones: ZoneRecord[]) => void;
  onSelectionChange?: (id: string | null) => void;
};

export type ZoneLayerHandle = {
  setZones: (zones: readonly ZoneRecord[]) => void;
  getZones: () => ZoneRecord[];
  setSelectedZoneId: (id: string | null) => void;
  getSelectedZoneId: () => string | null;
  setInteractive: (enabled: boolean) => void;
  syncToMapper: () => void;
  destroy: () => void;
};

export function createZoneLayer(options: CreateZoneLayerOptions): ZoneLayerHandle {
  options.layer.eventMode = "passive";

  const visuals = new Map<string, ZoneVisual>();
  let zones: ZoneRecord[] = [];
  let selectedZoneId: string | null = null;
  let interactive = true;
  let activeDrag: DragState = null;
  let activeResize: ResizeState = null;

  const getMapper = () => options.mapperProvider();

  const normToWorld = (nx: number, ny: number) => ({
    x: (nx / 100) * WORLD_W,
    y: (ny / 100) * WORLD_H,
  });

  const worldToNorm = (wx: number, wy: number) => ({
    x: (wx / WORLD_W) * 100,
    y: (wy / WORLD_H) * 100,
  });

  const getWorldPointFromEvent = (event: unknown): { x: number; y: number } | null => {
    const stagePoint = getStagePointFromEvent(event, options.stage);
    if (!stagePoint) return null;
    return getMapper().viewportToWorld(stagePoint);
  };

  const emitZones = () => {
    options.onZonesChange?.(zones.map((z) => ({ ...z })));
  };

  const drawZoneVisual = (visual: ZoneVisual) => {
    const { zone } = visual;
    const g = visual.graphics;
    g.clear();

    const spec = COLOR_SPEC[zone.color] ?? COLOR_SPEC.blue;
    const isSelected = selectedZoneId === zone.id;
    const strokeW = isSelected ? ZONE_STROKE_W_SELECTED : ZONE_STROKE_W;
    const strokeA = isSelected ? Math.min(1, spec.strokeAlpha + 0.18) : spec.strokeAlpha;

    if (zone.shape === "rect") {
      const { x: worldX, y: worldY } = normToWorld(zone.x, zone.y);
      const worldW = ((zone.width ?? 20) / 100) * WORLD_W;
      const worldH = ((zone.height ?? 20) / 100) * WORLD_H;
      g.rect(worldX, worldY, worldW, worldH)
        .fill({ color: spec.fill, alpha: spec.fillAlpha })
        .stroke({ color: spec.stroke, alpha: strokeA, width: strokeW });

      if (isSelected && interactive && !zone.locked) {
        const handles = getHandleWorldPositions(zone);
        for (const hp of handles) {
          g.circle(hp.x, hp.y, HANDLE_VIS_R_WU)
            .fill({ color: 0xffffff, alpha: 0.92 })
            .stroke({ color: 0x7cedb8, alpha: 0.90, width: 0.8 });
        }
      }

      if (visual.label) {
        visual.label.x = worldX + worldW / 2;
        visual.label.y = worldY + worldH / 2;
      }
    } else {
      const worldCX = (zone.x / 100) * WORLD_W;
      const worldCY = (zone.y / 100) * WORLD_H;
      const worldR = ((zone.radius ?? 10) / 100) * WORLD_H;
      g.circle(worldCX, worldCY, worldR)
        .fill({ color: spec.fill, alpha: spec.fillAlpha })
        .stroke({ color: spec.stroke, alpha: strokeA, width: strokeW });

      if (isSelected && interactive && !zone.locked) {
        const handles = getHandleWorldPositions(zone);
        for (const hp of handles) {
          g.circle(hp.x, hp.y, HANDLE_VIS_R_WU)
            .fill({ color: 0xffffff, alpha: 0.92 })
            .stroke({ color: 0x7cedb8, alpha: 0.90, width: 0.8 });
        }
      }

      if (visual.label) {
        visual.label.x = worldCX;
        visual.label.y = worldCY;
      }
    }

    if (visual.label) {
      visual.label.text = zone.label || "";
      visual.label.visible = zone.label.trim().length > 0;
    }
  };

  const updateHitArea = (visual: ZoneVisual) => {
    const { zone } = visual;
    if (zone.shape === "rect") {
      const { x: worldX, y: worldY } = normToWorld(zone.x, zone.y);
      const worldW = ((zone.width ?? 20) / 100) * WORLD_W;
      const worldH = ((zone.height ?? 20) / 100) * WORLD_H;
      visual.container.hitArea = {
        contains: (lx: number, ly: number) =>
          lx >= worldX && lx <= worldX + worldW && ly >= worldY && ly <= worldY + worldH,
      };
    } else {
      const worldCX = (zone.x / 100) * WORLD_W;
      const worldCY = (zone.y / 100) * WORLD_H;
      const worldR = ((zone.radius ?? 10) / 100) * WORLD_H;
      visual.container.hitArea = {
        contains: (lx: number, ly: number) => {
          const dx = lx - worldCX;
          const dy = ly - worldCY;
          return dx * dx + dy * dy <= worldR * worldR;
        },
      };
    }
  };

  const onZonePointerDown = (visual: ZoneVisual, event: unknown) => {
    if (!interactive || visual.zone.locked) {
      selectZone(visual.zone.id);
      return;
    }
    (event as { stopPropagation?: () => void }).stopPropagation?.();

    selectZone(visual.zone.id);

    const pointerId = getPointerIdFromEvent(event);
    if (pointerId == null) return;

    const worldPt = getWorldPointFromEvent(event);
    if (!worldPt) return;

    const touchRadius = HANDLE_TOUCH_PX / Math.max(0.001, getMapper().transform.scale);
    const handleIndex = findHitHandle(visual.zone, worldPt.x, worldPt.y, touchRadius);

    if (handleIndex !== null) {
      activeResize = {
        zoneId: visual.zone.id,
        pointerId,
        handleIndex,
        snapshotZone: { ...visual.zone },
      };
    } else {
      const normPt = worldToNorm(worldPt.x, worldPt.y);
      activeDrag = {
        zoneId: visual.zone.id,
        pointerId,
        startNormX: visual.zone.x,
        startNormY: visual.zone.y,
        startPtrNormX: normPt.x,
        startPtrNormY: normPt.y,
      };
    }
  };

  const selectZone = (id: string | null) => {
    if (selectedZoneId === id) return;
    selectedZoneId = id;
    for (const v of visuals.values()) drawZoneVisual(v);
    options.onSelectionChange?.(id);
  };

  const onGlobalPointerMove = (event: unknown) => {
    const pointerId = getPointerIdFromEvent(event);

    if (activeDrag && (pointerId == null || pointerId === activeDrag.pointerId)) {
      const worldPt = getWorldPointFromEvent(event);
      if (!worldPt) return;
      const normPt = worldToNorm(worldPt.x, worldPt.y);
      const dx = normPt.x - activeDrag.startPtrNormX;
      const dy = normPt.y - activeDrag.startPtrNormY;

      const zoneIndex = zones.findIndex((z) => z.id === activeDrag!.zoneId);
      if (zoneIndex < 0) { activeDrag = null; return; }
      const zone = zones[zoneIndex]!;

      let newX = activeDrag.startNormX + dx;
      let newY = activeDrag.startNormY + dy;
      const zoneW = zone.width ?? 0;
      const zoneH = zone.height ?? 0;
      const zoneR = (zone.radius ?? 10) * (WORLD_H / WORLD_W);
      if (zone.shape === "rect") {
        newX = Math.max(0, Math.min(100 - zoneW, newX));
        newY = Math.max(0, Math.min(100 - zoneH, newY));
      } else {
        newX = Math.max(0, Math.min(100, newX));
        newY = Math.max(0, Math.min(100, newY));
        void zoneR;
      }

      const updated: ZoneRecord = { ...zone, x: newX, y: newY };
      zones = zones.map((z, i) => (i === zoneIndex ? updated : z));
      const visual = visuals.get(updated.id);
      if (visual) {
        visual.zone = updated;
        drawZoneVisual(visual);
        updateHitArea(visual);
      }
    }

    if (activeResize && (pointerId == null || pointerId === activeResize.pointerId)) {
      const worldPt = getWorldPointFromEvent(event);
      if (!worldPt) return;
      const normPt = worldToNorm(worldPt.x, worldPt.y);

      const zoneIndex = zones.findIndex((z) => z.id === activeResize!.zoneId);
      if (zoneIndex < 0) { activeResize = null; return; }
      const snap = activeResize.snapshotZone;

      let patch: Partial<ZoneRecord>;
      if (snap.shape === "circle") {
        const snapWorldCX = (snap.x / 100) * WORLD_W;
        const snapWorldCY = (snap.y / 100) * WORLD_H;
        const dx = worldPt.x - snapWorldCX;
        const dy = worldPt.y - snapWorldCY;
        const worldR = Math.max(ZONE_MIN_NORM_R * (WORLD_H / 100), Math.sqrt(dx * dx + dy * dy));
        patch = { radius: Math.max(ZONE_MIN_NORM_R, (worldR / WORLD_H) * 100) };
      } else {
        patch = applyRectResize(snap, activeResize.handleIndex, normPt.x, normPt.y);
      }

      const updated: ZoneRecord = { ...zones[zoneIndex]!, ...patch };
      zones = zones.map((z, i) => (i === zoneIndex ? updated : z));
      const visual = visuals.get(updated.id);
      if (visual) {
        visual.zone = updated;
        drawZoneVisual(visual);
        updateHitArea(visual);
      }
    }
  };

  const onGlobalPointerUp = (event: unknown) => {
    const pointerId = getPointerIdFromEvent(event);
    if (activeDrag && (pointerId == null || pointerId === activeDrag.pointerId)) {
      activeDrag = null;
      emitZones();
    }
    if (activeResize && (pointerId == null || pointerId === activeResize.pointerId)) {
      activeResize = null;
      emitZones();
    }
  };

  options.stage.on("globalpointermove", onGlobalPointerMove);
  options.stage.on("pointerup", onGlobalPointerUp);
  options.stage.on("pointerupoutside", onGlobalPointerUp);
  options.stage.on("pointercancel", onGlobalPointerUp);

  const createVisual = (zone: ZoneRecord): ZoneVisual => {
    const container = new Container();
    container.eventMode = "static";
    container.zIndex = 0;

    const graphics = new Graphics();
    graphics.eventMode = "none";
    container.addChild(graphics);

    let label: Text | null = null;
    const labelText = new Text({
      text: "",
      style: {
        fill: 0xffffff,
        fontSize: LABEL_FONT_SIZE_WU,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: "700",
        align: "center",
        letterSpacing: 0.08,
      },
    });
    labelText.anchor.set(0.5);
    labelText.eventMode = "none";
    labelText.alpha = 0.88;
    container.addChild(labelText);
    label = labelText;

    options.layer.addChild(container);

    const visual: ZoneVisual = { zone, container, graphics, label };
    drawZoneVisual(visual);
    updateHitArea(visual);

    container.on("pointerdown", (event) => {
      onZonePointerDown(visual, event);
    });

    return visual;
  };

  const destroyVisual = (visual: ZoneVisual) => {
    visual.container.removeAllListeners();
    visual.container.destroy({ children: true });
  };

  const rebuild = (nextZones: readonly ZoneRecord[]) => {
    for (const v of visuals.values()) destroyVisual(v);
    visuals.clear();
    zones = nextZones.map((z) => ({ ...z }));
    for (const zone of zones) {
      if (!zone.id) continue;
      const visual = createVisual(zone);
      visuals.set(zone.id, visual);
    }
    if (selectedZoneId != null && !visuals.has(selectedZoneId)) {
      selectedZoneId = null;
      options.onSelectionChange?.(null);
    }
  };

  const syncAll = () => {
    for (const visual of visuals.values()) {
      drawZoneVisual(visual);
      updateHitArea(visual);
    }
  };

  return {
    setZones: (nextZones) => {
      activeDrag = null;
      activeResize = null;
      rebuild(nextZones);
    },
    getZones: () => zones.map((z) => ({ ...z })),
    setSelectedZoneId: (id) => {
      selectZone(id);
    },
    getSelectedZoneId: () => selectedZoneId,
    setInteractive: (enabled) => {
      interactive = enabled;
      if (!enabled) {
        activeDrag = null;
        activeResize = null;
      }
      for (const v of visuals.values()) {
        v.container.eventMode = enabled ? "static" : "none";
        drawZoneVisual(v);
      }
    },
    syncToMapper: () => {
      syncAll();
    },
    destroy: () => {
      options.stage.off("globalpointermove", onGlobalPointerMove);
      options.stage.off("pointerup", onGlobalPointerUp);
      options.stage.off("pointerupoutside", onGlobalPointerUp);
      options.stage.off("pointercancel", onGlobalPointerUp);
      for (const v of visuals.values()) destroyVisual(v);
      visuals.clear();
    },
  };
}
