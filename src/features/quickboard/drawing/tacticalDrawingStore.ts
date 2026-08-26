import {
  cloneDrawingSnapshot,
  type TacticalDrawingRecord,
  type TacticalDrawingSnapshot,
} from "./tacticalDrawingTypes";

export type TacticalDrawingStore = {
  getAll: () => readonly TacticalDrawingRecord[];
  replaceAll: (drawings: readonly TacticalDrawingSnapshot[]) => void;
  append: (drawing: TacticalDrawingRecord) => void;
  removeById: (id: string) => boolean;
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
  cloneSnapshots: () => TacticalDrawingSnapshot[];
};

export function createTacticalDrawingStore(): TacticalDrawingStore {
  const drawings: TacticalDrawingRecord[] = [];
  let selectedId: string | null = null;
  let lastErased: { record: TacticalDrawingRecord; index: number } | null = null;

  function removeById(id: string): boolean {
    const index = drawings.findIndex((drawing) => drawing.id === id);
    if (index < 0) return false;
    const [removed] = drawings.splice(index, 1);
    if (selectedId === id) {
      selectedId = null;
    }
    lastErased = removed ? { record: cloneDrawingSnapshot(removed), index } : null;
    return true;
  }

  return {
    getAll: () => drawings,
    replaceAll: (nextDrawings) => {
      lastErased = null;
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
      drawings.push(cloneDrawingSnapshot(drawing));
      selectedId = null;
    },
    removeById,
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
    cloneSnapshots: () => drawings.map((drawing) => cloneDrawingSnapshot(drawing)),
  };
}
