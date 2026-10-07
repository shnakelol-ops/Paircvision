import { describe, expect, it } from "vitest";

import { serializeBoardState } from "./TacticalPadLiteClean";
import type { QuickBoardBoardState } from "../features/quickboard/storage/quickboard-types";

// Full View resizes the board host, which changes exportBoardState().viewport.
// The draft/dirty signature must keep ignoring it so presenting never dirties
// the board or writes an autosave draft.
describe("board signature ignores viewport", () => {
  const base: QuickBoardBoardState = {
    players: [{ id: "p1", x: 10, y: 20 }],
    items: [],
    drawings: [],
    phases: [],
    movementPaths: [],
  } as unknown as QuickBoardBoardState;

  it("is identical for editor-size and Full-View-size viewports", () => {
    const editor = serializeBoardState({ ...base, viewport: { width: 611, height: 382 } } as QuickBoardBoardState);
    const fullView = serializeBoardState({ ...base, viewport: { width: 1728, height: 1080 } } as QuickBoardBoardState);
    expect(editor).not.toBeNull();
    expect(fullView).toBe(editor);
    expect(editor).not.toContain("viewport");
  });

  it("still changes when real board content changes", () => {
    const a = serializeBoardState(base);
    const b = serializeBoardState({ ...base, players: [{ id: "p1", x: 11, y: 20 }] } as unknown as QuickBoardBoardState);
    expect(b).not.toBe(a);
  });
});
