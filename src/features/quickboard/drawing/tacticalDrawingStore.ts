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
  cloneSnapshots: () => TacticalDrawingSnapshot[];
};

export function createTacticalDrawingStore(): TacticalDrawingStore {
  const drawings: TacticalDrawingRecord[] = [];
  let selectedId: string | null = null;

  function removeById(id: string): boolean {
    const index = drawings.findIndex((drawing) => drawing.id === id);
    if (index < 0) return false;
    drawings.splice(index, 1);
    if (selectedId === id) {
      selectedId = null;
    }
    return true;
  }

  return {
    getAll: () => drawings,
    replaceAll: (nextDrawings) => {
      drawings.length = 0;
      for (const drawing of nextDrawings) {
        drawings.push(cloneDrawingSnapshot(drawing));
      }
      if (selectedId && !drawings.some((drawing) => drawing.id === selectedId)) {
        selectedId = null;
      }
    },
    append: (drawing) => {
      drawings.push(cloneDrawingSnapshot(drawing));
      selectedId = null;
    },
    removeById,
    popLast: () => {
      if (drawings.length <= 0) return null;
      const popped = drawings.pop() ?? null;
      if (popped && selectedId === popped.id) {
        selectedId = null;
      }
      return popped ? cloneDrawingSnapshot(popped) : null;
    },
    clear: () => {
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
    cloneSnapshots: () => drawings.map((drawing) => cloneDrawingSnapshot(drawing)),
  };
}
