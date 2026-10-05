import { Container, Graphics } from "pixi.js";

import {
  DEFAULT_TACTICAL_DRAWING_OPACITY,
  DEFAULT_TACTICAL_DRAWING_WIDTH,
} from "./tacticalLineStyles";
import {
  findClosestDrawingIdAtWorldPoint,
  isPracticeAreaDrawing,
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
  /**
   * Training Practice Areas. When set, rectangle zones render as Practice
   * Areas (outline only / Dead Zone) into this layer instead of
   * drawingsLayer — so they can stay fully visible while drawingsLayer fades
   * during playback. Omitted (Pitch, Whiteboard, Tactical Sequence): every
   * drawing renders exactly as before.
   */
  practiceAreasLayer?: Container;
  /** Stroke-first eraser hit rule (Tactical Slate). Omitted: the original rule (Tactical Sequence). */
  strokeFirstEraser?: boolean;
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
  /** Live drawing list (read-only) — used by Training Practice Area editing. */
  getDrawings: () => readonly TacticalDrawingRecord[];
  /** Replaces one drawing in place (move / resize / restyle). */
  updateDrawing: (id: string, next: TacticalDrawingRecord) => boolean;
  /** Appends a complete drawing (Duplicate); Undo removes it like any newest drawing. */
  appendDrawing: (drawing: TacticalDrawingRecord) => void;
  /** Deletes one drawing by id; Undo restores it, exactly as after the eraser. */
  removeDrawing: (id: string) => boolean;
  /** A fresh drawing id from the same source new strokes use. */
  createDrawingId: () => string;
  /**
   * Practice Area selection highlight. Deliberately separate from the store's
   * own selection, which Undo treats as "delete the selected drawing".
   */
  setHighlightedDrawingId: (id: string | null) => void;
};

export function createTacticalDrawingController(options: TacticalDrawingControllerOptions): TacticalDrawingController {
  const store = createTacticalDrawingStore();
  const createId = options.createDrawingId ?? (() => crypto.randomUUID());
  let activeTool: TacticalDrawingTool = options.initialTool ?? "move";
  let activeColor = options.initialColor ?? 0x111111;
  let activeDraft: ActiveDraft | null = null;
  let activePointerId: number | null = null;
  let highlightedDrawingId: string | null = null;
  const practiceAreasLayer = options.practiceAreasLayer ?? null;

  function clearPreview(): void {
    options.previewGraphic.clear();
  }

  function renderCommittedDrawings(): void {
    const existing = options.drawingsLayer.removeChildren();
    for (const child of existing) {
      child.destroy({ children: true });
    }
    if (practiceAreasLayer) {
      for (const child of practiceAreasLayer.removeChildren()) {
        child.destroy({ children: true });
      }
    }
    const selectedId = store.getSelectedId();
    for (const drawing of store.getAll()) {
      const graphic = new Graphics();
      graphic.eventMode = "none";
      if (practiceAreasLayer && isPracticeAreaDrawing(drawing)) {
        const isHighlighted = drawing.id === selectedId || drawing.id === highlightedDrawingId;
        renderTacticalDrawing(graphic, drawing, options.mapperProvider(), isHighlighted, { practiceArea: true });
        practiceAreasLayer.addChild(graphic);
        continue;
      }
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
    renderTacticalDrawing(options.previewGraphic, draftShape, options.mapperProvider(), false, {
      practiceArea: practiceAreasLayer != null,
    });
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
        const targetId = findClosestDrawingIdAtWorldPoint(store.getAll(), worldPoint, options.mapperProvider(), {
          strokeFirst: options.strokeFirstEraser === true,
          practiceAreas: practiceAreasLayer != null,
        });
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
      // An eraser deletion is itself undoable: if the most recent drawing-store
      // action was a delete (e.g. the eraser tool), restore it before falling
      // back to the normal "undo last committed stroke" behaviour.
      if (!store.restoreLastErased() && !store.deleteSelected()) {
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
    getDrawings: () => store.getAll(),
    updateDrawing: (id, next) => {
      const updated = store.updateById(id, next);
      if (updated) renderCommittedDrawings();
      return updated;
    },
    appendDrawing: (drawing) => {
      store.append(drawing);
      renderCommittedDrawings();
    },
    removeDrawing: (id) => {
      const removed = store.removeById(id);
      if (removed) renderCommittedDrawings();
      return removed;
    },
    createDrawingId: () => createId(),
    setHighlightedDrawingId: (id) => {
      if (highlightedDrawingId === id) return;
      highlightedDrawingId = id;
      renderCommittedDrawings();
    },
  };
}
