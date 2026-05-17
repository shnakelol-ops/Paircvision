import { Container, Graphics } from "pixi.js";

import {
  DEFAULT_TACTICAL_DRAWING_OPACITY,
  DEFAULT_TACTICAL_DRAWING_WIDTH,
} from "./tacticalLineStyles";
import {
  findClosestDrawingIdAtWorldPoint,
  normalizeDraftPoints,
  renderTacticalDrawing,
} from "./tacticalLineRenderer";
import { createTacticalDrawingStore } from "./tacticalDrawingStore";
import type {
  TacticalDrawingKind,
  TacticalDrawingRecord,
  TacticalDrawingSnapshot,
  TacticalDrawingTool,
} from "./tacticalDrawingTypes";
import type { WorldViewportMapper } from "../../../engine/pixi/createWorldViewport";

type Mapper = Pick<WorldViewportMapper, "normalizedToWorld" | "worldToNormalized">;

type TacticalDrawingControllerOptions = {
  drawingsLayer: Container;
  previewGraphic: Graphics;
  mapperProvider: () => Mapper;
  initialTool?: TacticalDrawingTool;
  initialColor?: number;
  createDrawingId?: () => string;
};

type ActiveDraft = {
  id: string;
  kind: TacticalDrawingKind;
  points: Array<{ x: number; y: number }>;
  color: number;
  width: number;
  opacity: number;
  createdAt: number;
};

export type TacticalDrawingController = {
  setTool: (tool: TacticalDrawingTool) => void;
  getTool: () => TacticalDrawingTool;
  setColor: (color: number) => void;
  getColor: () => number;
  handlePointerDown: (worldPoint: { x: number; y: number }, pointerId: number | null) => void;
  handlePointerMove: (worldPoint: { x: number; y: number }, pointerId: number | null) => void;
  handlePointerUp: (worldPoint: { x: number; y: number } | null, pointerId: number | null) => void;
  cancelActiveDraft: () => void;
  hasActiveDraft: () => boolean;
  exportSnapshots: () => TacticalDrawingSnapshot[];
  importSnapshots: (snapshots: readonly TacticalDrawingSnapshot[]) => void;
  undo: () => void;
  clear: () => void;
  deleteSelectedOrLast: () => void;
  render: () => void;
};

export function createTacticalDrawingController(options: TacticalDrawingControllerOptions): TacticalDrawingController {
  const store = createTacticalDrawingStore();
  const createId = options.createDrawingId ?? (() => crypto.randomUUID());
  let activeTool: TacticalDrawingTool = options.initialTool ?? "move";
  let activeColor = options.initialColor ?? 0x111111;
  let activeDraft: ActiveDraft | null = null;
  let activePointerId: number | null = null;

  function clearPreview(): void {
    options.previewGraphic.clear();
  }

  function renderCommittedDrawings(): void {
    const existing = options.drawingsLayer.removeChildren();
    for (const child of existing) {
      child.destroy({ children: true });
    }
    const selectedId = store.getSelectedId();
    for (const drawing of store.getAll()) {
      const graphic = new Graphics();
      graphic.eventMode = "none";
      renderTacticalDrawing(graphic, drawing, options.mapperProvider(), drawing.id === selectedId);
      options.drawingsLayer.addChild(graphic);
    }
  }

  function renderPreviewDraft(): void {
    clearPreview();
    if (!activeDraft) return;
    const normalizedPoints = normalizeDraftPoints(activeDraft.kind, activeDraft.points);
    if (normalizedPoints.length < 2) return;
    const draftShape: TacticalDrawingRecord = {
      id: activeDraft.id,
      kind: activeDraft.kind,
      points: normalizedPoints,
      color: activeDraft.color,
      width: activeDraft.width,
      opacity: activeDraft.opacity,
      createdAt: activeDraft.createdAt,
    };
    renderTacticalDrawing(options.previewGraphic, draftShape, options.mapperProvider(), false);
  }

  function resetActiveDraft(): void {
    activeDraft = null;
    activePointerId = null;
    clearPreview();
  }

  function appendPointToDraft(worldPoint: { x: number; y: number }): void {
    if (!activeDraft) return;
    const normalized = options.mapperProvider().worldToNormalized(worldPoint);
    if (activeDraft.kind === "wavy-line" || activeDraft.kind === "free-pen" || activeDraft.kind === "curved-arrow") {
      activeDraft.points.push(normalized);
      return;
    }
    if (activeDraft.points.length <= 1) {
      activeDraft.points.push(normalized);
      return;
    }
    activeDraft.points[activeDraft.points.length - 1] = normalized;
  }

  return {
    setTool: (tool) => {
      activeTool = tool;
      resetActiveDraft();
      if (tool !== "eraser") {
        store.select(null);
      }
      renderCommittedDrawings();
    },
    getTool: () => activeTool,
    setColor: (color) => {
      activeColor = color;
      if (activeDraft) {
        activeDraft.color = color;
        renderPreviewDraft();
      }
    },
    getColor: () => activeColor,
    handlePointerDown: (worldPoint, pointerId) => {
      if (activeTool === "move") return;
      if (activeTool === "eraser") {
        const targetId = findClosestDrawingIdAtWorldPoint(store.getAll(), worldPoint, options.mapperProvider());
        if (targetId) {
          store.select(targetId);
          store.deleteSelected();
        } else {
          store.select(null);
        }
        renderCommittedDrawings();
        clearPreview();
        return;
      }
      const kind = activeTool;
      activePointerId = pointerId;
      activeDraft = {
        id: createId(),
        kind,
        points: [options.mapperProvider().worldToNormalized(worldPoint)],
        color: activeColor,
        width: DEFAULT_TACTICAL_DRAWING_WIDTH,
        opacity: DEFAULT_TACTICAL_DRAWING_OPACITY,
        createdAt: Date.now(),
      };
      store.select(null);
      renderCommittedDrawings();
      renderPreviewDraft();
    },
    handlePointerMove: (worldPoint, pointerId) => {
      if (!activeDraft) return;
      if (activePointerId != null && pointerId != null && pointerId !== activePointerId) return;
      appendPointToDraft(worldPoint);
      renderPreviewDraft();
    },
    handlePointerUp: (worldPoint, pointerId) => {
      if (!activeDraft) return;
      if (activePointerId != null && pointerId != null && pointerId !== activePointerId) return;
      if (worldPoint) {
        appendPointToDraft(worldPoint);
      }
      const normalizedPoints = normalizeDraftPoints(activeDraft.kind, activeDraft.points);
      if (normalizedPoints.length >= 2) {
        store.append({
          id: activeDraft.id,
          kind: activeDraft.kind,
          points: normalizedPoints,
          color: activeDraft.color,
          width: activeDraft.width,
          opacity: activeDraft.opacity,
          createdAt: activeDraft.createdAt,
        });
      }
      resetActiveDraft();
      renderCommittedDrawings();
    },
    cancelActiveDraft: () => {
      resetActiveDraft();
      renderCommittedDrawings();
    },
    hasActiveDraft: () => activeDraft != null,
    exportSnapshots: () => store.cloneSnapshots(),
    importSnapshots: (snapshots) => {
      store.replaceAll(snapshots);
      resetActiveDraft();
      renderCommittedDrawings();
    },
    undo: () => {
      resetActiveDraft();
      if (!store.deleteSelected()) {
        store.popLast();
      }
      renderCommittedDrawings();
    },
    clear: () => {
      resetActiveDraft();
      store.clear();
      renderCommittedDrawings();
    },
    deleteSelectedOrLast: () => {
      resetActiveDraft();
      if (!store.deleteSelected()) {
        store.popLast();
      }
      renderCommittedDrawings();
    },
    render: () => {
      renderCommittedDrawings();
      renderPreviewDraft();
    },
  };
}
