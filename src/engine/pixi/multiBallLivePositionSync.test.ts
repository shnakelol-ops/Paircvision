import { describe, expect, it } from "vitest";

import { preserveLiveItemPositions, type TacticalItem } from "./createTacticalPadLiteSurface";

/**
 * Multi-ball stale positions: the Slate page keeps its own copy of the items
 * list, updated only by drags, and pushes the whole list into the engine
 * (syncItems) whenever it changes. After an engine-side move — Reset,
 * completed playback, Undo Phase, Go to Phase, Set Start after playback, or
 * opening a board saved at a later phase — that copy is stale, and the next
 * drag of one ball used to snap every other ball back to it.
 *
 * createTacticalPadLiteSurface() cannot be instantiated here (no jsdom or
 * canvas; see freeMultiBall.test.ts), so these tests drive the production
 * rule syncItems applies, preserveLiveItemPositions, through each reported
 * sequence on a minimal model of the engine's item list: an engine-side move
 * changes only the engine; a drag changes the engine and that one item in the
 * page copy, then syncs; Set Start / Add Phase capture the engine. Each
 * sequence is also run with the old rule (page positions overwrite) to show
 * it reproduces the bug.
 */

type Point = { x: number; y: number };
type Positions = Record<string, Point>;
type SyncRule = (page: TacticalItem[], engine: Map<string, Point>) => TacticalItem[];

const fixedRule: SyncRule = (page, engine) => preserveLiveItemPositions(page, engine);
const oldRule: SyncRule = (page) => page;

function ball(id: string, at: Point): TacticalItem {
  return { id, type: "football", ...at };
}

class Board {
  engine = new Map<string, Point>();
  page: TacticalItem[] = [];
  start: Positions = {};
  phases: Positions[] = [];
  private readonly rule: SyncRule;

  constructor(rule: SyncRule) {
    this.rule = rule;
  }

  /** syncItems: page list → engine (membership from the page, positions per rule). */
  sync(): void {
    const next = this.rule(this.page, this.engine);
    this.engine = new Map(next.map((item) => [item.id, { x: item.x, y: item.y }]));
  }

  /** Board open / Resume: import sets every engine position, then the page copy is set from the same saved items. */
  open(saved: TacticalItem[], start: Positions, phases: Positions[]): void {
    this.engine = new Map(saved.map((item) => [item.id, { x: item.x, y: item.y }]));
    this.start = start;
    this.phases = phases;
    this.page = saved.map((item) => ({ ...item }));
    this.sync();
  }

  /** Reset, Undo Phase, Go to Phase, end of playback: the engine applies a snapshot; the page is not told. */
  applyInEngine(snapshot: Positions): void {
    for (const [id, at] of Object.entries(snapshot)) this.engine.set(id, { ...at });
  }

  capture(): Positions {
    return Object.fromEntries([...this.engine].map(([id, at]) => [id, { ...at }]));
  }

  setStart(): void {
    this.start = this.capture();
    this.phases = [];
  }

  addPhase(): void {
    this.phases = [...this.phases, this.capture()];
  }

  /** A drag: the engine moves the item and reports it (onItemMove); the page updates that one item and syncs. */
  drag(id: string, to: Point): void {
    this.engine.set(id, { ...to });
    this.page = this.page.map((item) => (item.id === id ? { ...item, ...to } : item));
    this.sync();
  }

  add(item: TacticalItem): void {
    this.page = [...this.page, item];
    this.sync();
  }

  remove(id: string): void {
    this.page = this.page.filter((item) => item.id !== id);
    this.sync();
  }

  at(id: string): Point | undefined {
    return this.engine.get(id);
  }
}

const START: Positions = { A: { x: 30, y: 30 }, B: { x: 50, y: 50 }, C: { x: 70, y: 30 } };
const MIDDLE: Positions = { A: { x: 40, y: 36 }, B: { x: 56, y: 58 }, C: { x: 64, y: 40 } };
const END: Positions = { A: { x: 60, y: 44 }, B: { x: 72, y: 70 }, C: { x: 48, y: 62 } };
const pick = (positions: Positions, ids: string[]): Positions => Object.fromEntries(ids.map((id) => [id, positions[id]!]));
const saved = (positions: Positions, ids: string[]) => ids.map((id) => ball(id, positions[id]!));

/** Saved at the old play's end, resumed, Reset, Set Start — the reported sequence up to the first drag. */
function resumedAndRestarted(rule: SyncRule, ids: string[]): Board {
  const board = new Board(rule);
  board.open(saved(END, ids), pick(START, ids), [pick(MIDDLE, ids), pick(END, ids)]);
  board.applyInEngine(board.start); // Reset Play
  board.setStart();
  return board;
}

describe("preserveLiveItemPositions", () => {
  it("keeps the live position of an item already on the board and takes everything else from the page", () => {
    const live = new Map([["A", { x: 10, y: 20 }]]);
    const [item] = preserveLiveItemPositions([{ id: "A", type: "footballLarge", x: 90, y: 90, rotation: 1 }], live);
    expect(item).toEqual({ id: "A", type: "footballLarge", x: 10, y: 20, rotation: 1 });
  });

  it("a genuinely new item id takes the position the page supplies", () => {
    const live = new Map([["A", { x: 10, y: 20 }]]);
    expect(preserveLiveItemPositions([ball("N", { x: 33, y: 44 })], live)).toEqual([ball("N", { x: 33, y: 44 })]);
  });

  it("an empty board (a freshly created engine) takes every position from the page", () => {
    const page = [ball("A", { x: 1, y: 2 }), ball("B", { x: 3, y: 4 })];
    expect(preserveLiveItemPositions(page, new Map())).toEqual(page);
  });

  it("leaves membership and order to the page (removals drop out, nothing is added)", () => {
    const live = new Map([
      ["A", { x: 1, y: 1 }],
      ["B", { x: 2, y: 2 }],
    ]);
    const result = preserveLiveItemPositions([ball("B", { x: 9, y: 9 })], live);
    expect(result.map((item) => item.id)).toEqual(["B"]);
  });

  it("never modifies its inputs", () => {
    const page = [ball("A", { x: 90, y: 90 })];
    const live = new Map([["A", { x: 10, y: 20 }]]);
    const before = JSON.stringify(page);
    preserveLiveItemPositions(page, live);
    expect(JSON.stringify(page)).toBe(before);
    expect(live.get("A")).toEqual({ x: 10, y: 20 });
  });
});

describe("multi-ball: untouched balls never snap to stale page positions", () => {
  it("3 balls, saved at the old end: Resume → Reset → Set Start → drag A → Add Phase keeps B/C at the new start", () => {
    const board = resumedAndRestarted(fixedRule, ["A", "B", "C"]);
    board.drag("A", { x: 40, y: 34 });
    expect(board.at("A")).toEqual({ x: 40, y: 34 });
    expect(board.at("B")).toEqual(START.B);
    expect(board.at("C")).toEqual(START.C);
    board.addPhase();
    expect(board.phases).toEqual([{ A: { x: 40, y: 34 }, B: START.B, C: START.C }]);
    expect(board.start).toEqual(START);
  });

  it("the old rule reproduces the reported snap (B/C jump to the old play's end)", () => {
    const board = resumedAndRestarted(oldRule, ["A", "B", "C"]);
    board.drag("A", { x: 40, y: 34 });
    board.addPhase();
    expect(board.phases[0]!.B).toEqual(END.B);
    expect(board.phases[0]!.C).toEqual(END.C);
  });

  it("2 balls: Resume → Reset → Set Start → drag A keeps B at the new start", () => {
    const board = resumedAndRestarted(fixedRule, ["A", "B"]);
    board.drag("A", { x: 40, y: 34 });
    expect(board.at("B")).toEqual(START.B);
  });

  it("a carried ball (placed at its holder by the engine) is not pulled back when another ball is dragged", () => {
    // Reset puts the carried ball at its holder's carry point; the page copy still has the saved end position.
    const carriedAtHolder = { x: 10.5, y: 46.8 };
    for (const [rule, keeps] of [
      [fixedRule, true],
      [oldRule, false],
    ] as const) {
      const board = resumedAndRestarted(rule, ["A", "B"]);
      board.applyInEngine({ A: carriedAtHolder });
      board.setStart();
      board.drag("B", { x: 52, y: 54 });
      expect(board.at("A")!.x === carriedAtHolder.x).toBe(keeps);
    }
  });

  it("single ball: dragging it behaves exactly as before", () => {
    for (const rule of [fixedRule, oldRule]) {
      const board = resumedAndRestarted(rule, ["A"]);
      board.drag("A", { x: 41, y: 35 });
      expect(board.at("A")).toEqual({ x: 41, y: 35 });
    }
  });

  const fresh = (rule: SyncRule) => {
    const board = new Board(rule);
    board.open(saved(START, ["A", "B", "C"]), START, [MIDDLE, END]);
    return board;
  };

  const sequences: [string, (board: Board) => void, Positions][] = [
    ["completed playback → drag A", (board) => board.applyInEngine(END), END],
    [
      "completed playback → Set Start → drag A",
      (board) => {
        board.applyInEngine(END);
        board.setStart();
      },
      END,
    ],
    [
      "board saved at its end → Reset → drag A",
      (board) => {
        board.open(saved(END, ["A", "B", "C"]), START, [MIDDLE, END]);
        board.applyInEngine(board.start);
      },
      START,
    ],
    ["Undo Phase → drag A (back to phase 1)", (board) => board.applyInEngine(MIDDLE), MIDDLE],
    ["Go to Phase 2 → drag A", (board) => board.applyInEngine(END), END],
  ];
  for (const [label, engineMove, expected] of sequences) {
    it(`${label}: B and C stay where the engine put them`, () => {
      const board = fresh(fixedRule);
      engineMove(board);
      board.drag("A", { x: 20, y: 80 });
      expect(board.at("B")).toEqual(expected.B);
      expect(board.at("C")).toEqual(expected.C);
      const old = fresh(oldRule);
      engineMove(old);
      old.drag("A", { x: 20, y: 80 });
      expect(old.at("B")).not.toEqual(expected.B);
    });
  }

  it("adding a new ball honours its supplied position and leaves the others where they are", () => {
    const board = resumedAndRestarted(fixedRule, ["A", "B", "C"]);
    board.add(ball("N", { x: 42, y: 26 }));
    expect(board.at("N")).toEqual({ x: 42, y: 26 });
    expect(board.at("B")).toEqual(START.B);
  });

  it("deleting a ball still removes it", () => {
    const board = resumedAndRestarted(fixedRule, ["A", "B", "C"]);
    board.remove("B");
    expect(board.at("B")).toBeUndefined();
    expect([...board.engine.keys()]).toEqual(["A", "C"]);
    expect(board.at("C")).toEqual(START.C);
  });

  it("opening a board still restores its saved positions", () => {
    const board = resumedAndRestarted(fixedRule, ["A", "B", "C"]);
    board.open(saved(END, ["A", "B", "C"]), START, [MIDDLE, END]);
    expect(board.capture()).toEqual(END);
  });
});
