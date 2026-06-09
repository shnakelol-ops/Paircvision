import { Container, Graphics } from "pixi.js";

import type { WorldViewportMapper } from "../coordinates/viewport";
import { getPointerIdFromEvent, getStagePointFromEvent } from "../input/pointer-controller";
import { BOARD_PITCH_VIEWBOX } from "../pitch/pitch-space";
import type { TacticalTrainingItem } from "../shell/types";

const WORLD_W = BOARD_PITCH_VIEWBOX.w;
const WORLD_H = BOARD_PITCH_VIEWBOX.h;
const ITEM_HALF_SIZE = 3.2;
const ITEM_TOUCH_RADIUS_PX = 38;

type TrainingItemVisual = {
  item: TacticalTrainingItem;
  container: Container;
  graphic: Graphics;
  selection: Graphics;
};

type DragState = {
  itemId: string;
  pointerId: number;
  startNormX: number;
  startNormY: number;
  startPtrNormX: number;
  startPtrNormY: number;
} | null;

type CreateTrainingItemLayerOptions = {
  layer: Container;
  mapperProvider: () => WorldViewportMapper;
  stage: Container;
  onItemsChange?: (items: TacticalTrainingItem[]) => void;
  onSelectionChange?: (id: string | null) => void;
};

export type TrainingItemLayerHandle = {
  setItems: (items: readonly TacticalTrainingItem[]) => void;
  getItems: () => TacticalTrainingItem[];
  setSelectedItemId: (id: string | null) => void;
  getSelectedItemId: () => string | null;
  setInteractive: (enabled: boolean) => void;
  syncToMapper: () => void;
  destroy: () => void;
};

const clampNorm = (value: number): number => {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
};

const cloneItem = (item: TacticalTrainingItem): TacticalTrainingItem => ({
  id: item.id,
  type: item.type,
  x: clampNorm(item.x),
  y: clampNorm(item.y),
});

export function createTrainingItemLayer(options: CreateTrainingItemLayerOptions): TrainingItemLayerHandle {
  options.layer.eventMode = "passive";

  const visuals = new Map<string, TrainingItemVisual>();
  let items: TacticalTrainingItem[] = [];
  let selectedItemId: string | null = null;
  let interactive = true;
  let activeDrag: DragState = null;

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

  const emitItems = () => {
    options.onItemsChange?.(items.map(cloneItem));
  };

  const drawItemGraphic = (graphic: Graphics, item: TacticalTrainingItem) => {
    graphic.clear();
    const shadow = 0x020617;

    if (item.type === "flatMarker") {
      graphic.ellipse(0, ITEM_HALF_SIZE * 0.54, ITEM_HALF_SIZE * 0.95, ITEM_HALF_SIZE * 0.22).fill({ color: shadow, alpha: 0.14 });
      graphic.ellipse(0, 0, ITEM_HALF_SIZE * 0.95, ITEM_HALF_SIZE * 0.34).fill(0xfb923c).stroke({ color: 0xc2410c, width: 0.24 });
      return;
    }

    if (item.type === "cone") {
      graphic.ellipse(0, ITEM_HALF_SIZE * 0.68, ITEM_HALF_SIZE * 0.9, ITEM_HALF_SIZE * 0.28).fill({ color: shadow, alpha: 0.16 });
      graphic
        .poly([-ITEM_HALF_SIZE, ITEM_HALF_SIZE, 0, -ITEM_HALF_SIZE, ITEM_HALF_SIZE, ITEM_HALF_SIZE])
        .fill(0xf59e0b)
        .stroke({ color: 0xb45309, width: 0.45 });
      return;
    }

    if (item.type === "pole") {
      graphic.ellipse(0, ITEM_HALF_SIZE * 0.78, ITEM_HALF_SIZE * 0.62, ITEM_HALF_SIZE * 0.22).fill({ color: shadow, alpha: 0.16 });
      graphic
        .roundRect(-0.45, -ITEM_HALF_SIZE * 1.15, 0.9, ITEM_HALF_SIZE * 2.3, 0.35)
        .fill(0xfde68a)
        .stroke({ color: 0x92400e, width: 0.32 });
      return;
    }

    if (item.type === "miniGoal") {
      const width = ITEM_HALF_SIZE * 2.9;
      const height = ITEM_HALF_SIZE * 1.65;
      const post = 0.28;
      const left = -width / 2;
      const top = -height * 0.42;
      graphic.ellipse(0, top + height + ITEM_HALF_SIZE * 0.34, width * 0.4, ITEM_HALF_SIZE * 0.22).fill({ color: shadow, alpha: 0.14 });
      graphic.roundRect(left, top, post, height, 0.08).fill(0xf8fafc).stroke({ color: 0x64748b, width: 0.12 });
      graphic.roundRect(left + width - post, top, post, height, 0.08).fill(0xf8fafc).stroke({ color: 0x64748b, width: 0.12 });
      graphic.roundRect(left, top, width, post, 0.08).fill(0xf8fafc).stroke({ color: 0x64748b, width: 0.12 });
      graphic.roundRect(left + post * 1.2, top + post * 1.8, width - post * 2.4, height - post * 2.2, 0.12).stroke({ color: 0x94a3b8, width: 0.12, alpha: 0.9 });
      for (let i = 1; i <= 3; i += 1) {
        const x = left + (width * i) / 4;
        graphic.moveTo(x, top + post).lineTo(x, top + height).stroke({ color: 0xcbd5e1, width: 0.1, alpha: 0.78 });
      }
      for (let i = 1; i <= 2; i += 1) {
        const y = top + post + ((height - post) * i) / 3;
        graphic.moveTo(left + post, y).lineTo(left + width - post, y).stroke({ color: 0xcbd5e1, width: 0.1, alpha: 0.72 });
      }
      return;
    }

    if (item.type === "mannequin") {
      const bodyWidth = ITEM_HALF_SIZE * 1.18;
      const bodyHeight = ITEM_HALF_SIZE * 2.35;
      const bodyTop = -bodyHeight * 0.5;
      const headRadius = ITEM_HALF_SIZE * 0.28;
      graphic.ellipse(0, bodyTop + bodyHeight + ITEM_HALF_SIZE * 0.3, bodyWidth * 0.64, ITEM_HALF_SIZE * 0.2).fill({ color: shadow, alpha: 0.14 });
      graphic.circle(0, bodyTop + headRadius + 0.04, headRadius).fill(0xf9fafb).stroke({ color: 0x64748b, width: 0.13 });
      graphic.roundRect(-bodyWidth / 2, bodyTop + headRadius * 2.1, bodyWidth, bodyHeight - headRadius * 2.1, 0.24).fill(0xf8fafc).stroke({ color: 0x64748b, width: 0.14 });
      graphic.roundRect(-bodyWidth * 0.18, bodyTop + headRadius * 2.2, bodyWidth * 0.36, bodyHeight - headRadius * 2.35, 0.12).fill({ color: 0x94a3b8, alpha: 0.26 });
      graphic.roundRect(-bodyWidth * 0.62, bodyTop + bodyHeight - 0.12, bodyWidth * 1.24, 0.24, 0.08).fill(0xcbd5e1).stroke({ color: 0x64748b, width: 0.1 });
      return;
    }

    if (item.type === "hoop") {
      graphic.ellipse(0, ITEM_HALF_SIZE * 0.72, ITEM_HALF_SIZE * 1.1, ITEM_HALF_SIZE * 0.22).fill({ color: shadow, alpha: 0.13 });
      graphic.circle(0, 0, ITEM_HALF_SIZE * 1.08).stroke({ color: 0x22c55e, width: 0.55, alpha: 0.95 });
      graphic.circle(0, 0, ITEM_HALF_SIZE * 0.72).stroke({ color: 0xbbf7d0, width: 0.18, alpha: 0.75 });
    }
  };

  const drawSelection = (selection: Graphics, selected: boolean) => {
    selection.clear();
    if (!selected) return;
    selection.circle(0, 0, ITEM_HALF_SIZE * 1.55).stroke({ color: 0x7dd3fc, alpha: 0.94, width: 0.42 });
  };

  const syncVisual = (visual: TrainingItemVisual) => {
    const worldPoint = normToWorld(visual.item.x, visual.item.y);
    visual.container.position.set(worldPoint.x, worldPoint.y);
    drawItemGraphic(visual.graphic, visual.item);
    drawSelection(visual.selection, visual.item.id === selectedItemId);
    const touchRadiusWorld = ITEM_TOUCH_RADIUS_PX / Math.max(0.001, getMapper().transform.scale);
    visual.container.hitArea = {
      contains: (lx: number, ly: number) => {
        const radius = Math.max(ITEM_HALF_SIZE * 1.6, touchRadiusWorld);
        return lx * lx + ly * ly <= radius * radius;
      },
    };
  };

  const selectItem = (id: string | null) => {
    if (selectedItemId === id) return;
    selectedItemId = id;
    for (const visual of visuals.values()) {
      drawSelection(visual.selection, visual.item.id === selectedItemId);
    }
    options.onSelectionChange?.(id);
  };

  const onItemPointerDown = (visual: TrainingItemVisual, event: unknown) => {
    if (!interactive) return;
    (event as { stopPropagation?: () => void }).stopPropagation?.();
    selectItem(visual.item.id);

    const pointerId = getPointerIdFromEvent(event);
    if (pointerId == null) return;

    const worldPt = getWorldPointFromEvent(event);
    if (!worldPt) return;

    const normPt = worldToNorm(worldPt.x, worldPt.y);
    activeDrag = {
      itemId: visual.item.id,
      pointerId,
      startNormX: visual.item.x,
      startNormY: visual.item.y,
      startPtrNormX: normPt.x,
      startPtrNormY: normPt.y,
    };
  };

  const onGlobalPointerMove = (event: unknown) => {
    if (!activeDrag) return;
    const pointerId = getPointerIdFromEvent(event);
    if (pointerId != null && pointerId !== activeDrag.pointerId) return;

    const worldPt = getWorldPointFromEvent(event);
    if (!worldPt) return;

    const normPt = worldToNorm(worldPt.x, worldPt.y);
    const itemIndex = items.findIndex((item) => item.id === activeDrag!.itemId);
    if (itemIndex < 0) {
      activeDrag = null;
      return;
    }

    const updated = {
      ...items[itemIndex]!,
      x: clampNorm(activeDrag.startNormX + normPt.x - activeDrag.startPtrNormX),
      y: clampNorm(activeDrag.startNormY + normPt.y - activeDrag.startPtrNormY),
    };
    items = items.map((item, index) => (index === itemIndex ? updated : item));
    const visual = visuals.get(updated.id);
    if (visual) {
      visual.item = updated;
      syncVisual(visual);
    }
  };

  const onGlobalPointerUp = (event: unknown) => {
    const pointerId = getPointerIdFromEvent(event);
    if (activeDrag && (pointerId == null || pointerId === activeDrag.pointerId)) {
      activeDrag = null;
      emitItems();
    }
  };

  options.stage.on("globalpointermove", onGlobalPointerMove);
  options.stage.on("pointerup", onGlobalPointerUp);
  options.stage.on("pointerupoutside", onGlobalPointerUp);
  options.stage.on("pointercancel", onGlobalPointerUp);

  const createVisual = (item: TacticalTrainingItem): TrainingItemVisual => {
    const container = new Container();
    container.eventMode = "static";
    container.zIndex = 0;

    const graphic = new Graphics();
    graphic.eventMode = "none";
    container.addChild(graphic);

    const selection = new Graphics();
    selection.eventMode = "none";
    container.addChild(selection);

    options.layer.addChild(container);

    const visual: TrainingItemVisual = { item, container, graphic, selection };
    syncVisual(visual);
    container.on("pointerdown", (event) => onItemPointerDown(visual, event));
    return visual;
  };

  const destroyVisual = (visual: TrainingItemVisual) => {
    visual.container.removeAllListeners();
    visual.container.destroy({ children: true });
  };

  const rebuild = (nextItems: readonly TacticalTrainingItem[]) => {
    for (const visual of visuals.values()) destroyVisual(visual);
    visuals.clear();
    items = nextItems.map(cloneItem).filter((item) => item.id.trim().length > 0);
    for (const item of items) {
      const visual = createVisual(item);
      visuals.set(item.id, visual);
    }
    if (selectedItemId != null && !visuals.has(selectedItemId)) {
      selectedItemId = null;
      options.onSelectionChange?.(null);
    }
  };

  return {
    setItems: (nextItems) => {
      activeDrag = null;
      rebuild(nextItems);
    },
    getItems: () => items.map(cloneItem),
    setSelectedItemId: (id) => {
      selectItem(id);
    },
    getSelectedItemId: () => selectedItemId,
    setInteractive: (enabled) => {
      interactive = enabled;
      if (!enabled) activeDrag = null;
      for (const visual of visuals.values()) {
        visual.container.eventMode = enabled ? "static" : "none";
        drawSelection(visual.selection, visual.item.id === selectedItemId);
      }
    },
    syncToMapper: () => {
      for (const visual of visuals.values()) syncVisual(visual);
    },
    destroy: () => {
      options.stage.off("globalpointermove", onGlobalPointerMove);
      options.stage.off("pointerup", onGlobalPointerUp);
      options.stage.off("pointerupoutside", onGlobalPointerUp);
      options.stage.off("pointercancel", onGlobalPointerUp);
      for (const visual of visuals.values()) destroyVisual(visual);
      visuals.clear();
    },
  };
}
