import {
  cloneDrawingSnapshot,
  type TacticalDrawingRecord,
  type TacticalDrawingSnapshot,
} from "./tacticalDrawingTypes";
import type { NormalizedPoint } from "../../../engine/shared/normalization";

export type TacticalDrawingStore = {
  getAll: () => readonly TacticalDrawingRecord[];
  replaceAll: (drawings: readonly TacticalDrawingSnapshot[]) => void;
  append: (drawing: TacticalDrawingRecord) => void;
  removeById: (id: string) => boolean;
  /**
   * Replaces one drawing in place (same id, same position in the list) —
   * used to move / resize / restyle a Training Practice Area without
   * re-creating it. Returns false if no drawing has that id.
   */
  updateById: (id: string, next: TacticalDrawingRecord) => boolean;
  popLast: () => TacticalDrawingRecord | null;
  clear: () => void;
  select: (id: string | null) => void;
  getSelectedId: () => string | null;
  deleteSelected: () => boolean;
  /**
   * Reinserts the single most recently deleted drawing (via deleteSelected,
   * e.g. the eraser tool) at its original position, undoing that one
   * deletion. Returns false once anything else has mutated the drawing list
   * since — this is a single-slot "undo the last thing" memory, not a
   * history stack.
   */
  restoreLastErased: () => boolean;
  /**
   * Records one completed geometry edit (an Angled Zone corner drag or
   * move): `beforePoints` is the drawing's geometry before that edit. Only
   * edits recorded here are undoable; any other in-place update (e.g. a
   * Practice Area move/resize) stays exactly as before — not undoable.
   */
  recordGeometryEdit: (id: string, beforePoints: readonly NormalizedPoint[]) => void;
  /** True if `id` (or, without an id, any drawing) has an undoable geometry edit. */
  hasGeometryEdit: (id?: string) => boolean;
  /**
   * Reverts the most recent recorded geometry edit of `id` (or, without an
   * id, of any drawing). Never deletes a drawing. Returns false if none.
   */
  undoGeometryEdit: (id?: string) => boolean;
  /**
   * The undo action for the whole drawing list: reverts the latest geometry
   * edit only when it is newer than the latest drawing added and the latest
   * eraser deletion; otherwise returns false so the caller falls back to the
   * original undo chain. So "edit, then Undo" reverses the edit rather than
   * deleting the drawing, and with no edits recorded nothing changes.
   */
  undoGeometryEditIfNewest: () => boolean;
  cloneSnapshots: () => TacticalDrawingSnapshot[];
};

export function createTacticalDrawingStore(): TacticalDrawingStore {
  const drawings: TacticalDrawingRecord[] = [];
  let selectedId: string | null = null;
  let lastErased: { record: TacticalDrawingRecord; index: number; seq: number } | null = null;
  // Ordering for undo: every append, eraser deletion and recorded geometry
  // edit takes the next sequence number. Drawings loaded via replaceAll have
  // none (0), i.e. older than anything done since.
  let sequence = 0;
  const appendSeqById = new Map<string, number>();
  const geometryEdits: Array<{ id: string; seq: number; beforePoints: NormalizedPoint[] }> = [];

  function removeById(id: string): boolean {
    const index = drawings.findIndex((drawing) => drawing.id === id);
    if (index < 0) return false;
    const [removed] = drawings.splice(index, 1);
    if (selectedId === id) {
      selectedId = null;
    }
    sequence += 1;
    lastErased = removed ? { record: cloneDrawingSnapshot(removed), index, seq: sequence } : null;
    return true;
  }

  function resetHistory(): void {
    appendSeqById.clear();
    geometryEdits.length = 0;
  }

  /** Index (into geometryEdits) of the newest edit for `id` whose drawing still exists. */
  function findLatestEditIndex(id?: string): number {
    for (let index = geometryEdits.length - 1; index >= 0; index -= 1) {
      const edit = geometryEdits[index]!;
      if (id != null && edit.id !== id) continue;
      if (drawings.some((drawing) => drawing.id === edit.id)) return index;
    }
    return -1;
  }

  function applyGeometryEditUndo(editIndex: number): boolean {
    const [edit] = geometryEdits.splice(editIndex, 1);
    if (!edit) return false;
    const drawingIndex = drawings.findIndex((drawing) => drawing.id === edit.id);
    if (drawingIndex < 0) return false;
    drawings[drawingIndex] = cloneDrawingSnapshot({ ...drawings[drawingIndex]!, points: edit.beforePoints });
    return true;
  }

  return {
    getAll: () => drawings,
    replaceAll: (nextDrawings) => {
      lastErased = null;
      resetHistory();
      drawings.length = 0;
      for (const drawing of nextDrawings) {
        drawings.push(cloneDrawingSnapshot(drawing));
      }
      if (selectedId && !drawings.some((drawing) => drawing.id === selectedId)) {
        selectedId = null;
      }
    },
    append: (drawing) => {
      lastErased = null;
      sequence += 1;
      appendSeqById.set(drawing.id, sequence);
      drawings.push(cloneDrawingSnapshot(drawing));
      selectedId = null;
    },
    removeById,
    updateById: (id, next) => {
      const index = drawings.findIndex((drawing) => drawing.id === id);
      if (index < 0) return false;
      drawings[index] = cloneDrawingSnapshot({ ...next, id });
      return true;
    },
    popLast: () => {
      lastErased = null;
      if (drawings.length <= 0) return null;
      const popped = drawings.pop() ?? null;
      if (popped && selectedId === popped.id) {
        selectedId = null;
      }
      return popped ? cloneDrawingSnapshot(popped) : null;
    },
    clear: () => {
      lastErased = null;
      resetHistory();
      drawings.length = 0;
      selectedId = null;
    },
    select: (id) => {
      if (id == null) {
        selectedId = null;
        return;
      }
      selectedId = drawings.some((drawing) => drawing.id === id) ? id : null;
    },
    getSelectedId: () => selectedId,
    deleteSelected: () => {
      if (!selectedId) return false;
      return removeById(selectedId);
    },
    restoreLastErased: () => {
      if (!lastErased) return false;
      const { record, index } = lastErased;
      lastErased = null;
      const insertAt = Math.max(0, Math.min(index, drawings.length));
      drawings.splice(insertAt, 0, cloneDrawingSnapshot(record));
      return true;
    },
    recordGeometryEdit: (id, beforePoints) => {
      if (!drawings.some((drawing) => drawing.id === id)) return;
      sequence += 1;
      geometryEdits.push({ id, seq: sequence, beforePoints: beforePoints.map((point) => ({ x: point.x, y: point.y })) });
    },
    hasGeometryEdit: (id) => findLatestEditIndex(id) >= 0,
    undoGeometryEdit: (id) => {
      const editIndex = findLatestEditIndex(id);
      return editIndex >= 0 ? applyGeometryEditUndo(editIndex) : false;
    },
    undoGeometryEditIfNewest: () => {
      const editIndex = findLatestEditIndex();
      if (editIndex < 0) return false;
      const editSeq = geometryEdits[editIndex]!.seq;
      const lastDrawing = drawings[drawings.length - 1];
      const lastAppendSeq = lastDrawing ? (appendSeqById.get(lastDrawing.id) ?? 0) : 0;
      const lastEraseSeq = lastErased?.seq ?? 0;
      if (editSeq < lastAppendSeq || editSeq < lastEraseSeq) return false;
      return applyGeometryEditUndo(editIndex);
    },
    cloneSnapshots: () => drawings.map((drawing) => cloneDrawingSnapshot(drawing)),
  };
}
