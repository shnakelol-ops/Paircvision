// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_SCENARIOS,
  TP_ACTIVE_DRAFT_STORAGE_KEY,
  clearScenarioDraft,
  deleteScenario,
  duplicateScenario,
  listScenarios,
  loadScenarioDraft,
  renameScenario,
  saveScenario,
  saveScenarioDraft,
  tryDuplicateScenario,
  trySaveScenario,
  tryUpdateScenario,
  type TacticalScenarioContent,
} from "./tacticalPlayStorage";
import { BACKUP_DOMAINS } from "../../backup/backup-domains";
import type { MovementBoardToken } from "../../movement-board/shell/types";

/**
 * Reliability regressions for Tactical Sequence saved plays (audit D1–D4, D7):
 * nothing is ever evicted to make room, failed writes are reported instead of
 * looking successful, an opened play can be updated in place, the exact
 * playback speed is stored, and the in-progress draft round-trips.
 */

const SCENARIOS_KEY = "paircvision-tp-scenarios";

const TOKENS: MovementBoardToken[] = [
  { id: "p1", number: 1, color: "blue", position: { x: 8, y: 50 } },
  { id: "p2", number: 2, color: "blue", position: { x: 16, y: 22 } },
];

function content(overrides: Partial<TacticalScenarioContent> = {}): TacticalScenarioContent {
  return {
    tokens: TOKENS,
    routes: [{ playerId: "p2", points: [{ x: 16, y: 22 }, { x: 30, y: 15 }], delayMs: 1000 }],
    ballState: { carrierId: "p1", ballType: "footballSmall" },
    passEvents: [{ id: "pass-1", fromPlayerId: "p1", toPlayerId: "p2", delayMs: 2000 }],
    shotEvents: [],
    playbackSpeed: "slow",
    playbackSpeedMultiplier: 0.75,
    ...overrides,
  };
}

function fillToLimit(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < MAX_SCENARIOS; i += 1) {
    const result = trySaveScenario(`Play ${i}`, content());
    if (result.status !== "saved") throw new Error("setup save failed");
    ids.push(result.scenario.id);
  }
  return ids;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("play limit — refuse, never evict (D3)", () => {
  it("refuses a new save at the limit and keeps every existing play, oldest included", () => {
    const ids = fillToLimit();
    const result = trySaveScenario("One too many", content());
    expect(result).toEqual({ status: "failed", reason: "limit" });
    expect(listScenarios().map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  it("refuses a duplicate at the limit and keeps every existing play", () => {
    const ids = fillToLimit();
    expect(tryDuplicateScenario(ids[0]!)).toEqual({ status: "failed", reason: "limit" });
    expect(duplicateScenario(ids[0]!)).toBeNull();
    expect(listScenarios()).toHaveLength(MAX_SCENARIOS);
    expect(listScenarios().map((s) => s.id)).toContain(ids[0]);
  });

  it("legacy positional saveScenario throws at the limit instead of silently dropping a play", () => {
    const ids = fillToLimit();
    expect(() => saveScenario("Legacy", TOKENS, [], {}, [], [])).toThrow(/limit/);
    expect(listScenarios().map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  it("a save just below the limit still succeeds", () => {
    for (let i = 0; i < MAX_SCENARIOS - 1; i += 1) trySaveScenario(`Play ${i}`, content());
    expect(trySaveScenario("Last one", content()).status).toBe("saved");
    expect(listScenarios()).toHaveLength(MAX_SCENARIOS);
  });
});

describe("failed writes are reported, not shown as success (D4)", () => {
  function failWrites() {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
  }

  it("trySaveScenario reports storage failure and stores nothing", () => {
    failWrites();
    expect(trySaveScenario("Kickout", content())).toEqual({ status: "failed", reason: "storage" });
    vi.restoreAllMocks();
    expect(listScenarios()).toEqual([]);
  });

  it("tryUpdateScenario reports storage failure and leaves the stored play unchanged", () => {
    const saved = trySaveScenario("Kickout", content());
    if (saved.status !== "saved") throw new Error("setup");
    failWrites();
    expect(tryUpdateScenario(saved.scenario.id, content({ routes: [] }))).toEqual({ status: "failed", reason: "storage" });
    vi.restoreAllMocks();
    expect(listScenarios()[0]?.routes).toEqual(content().routes);
  });

  it("delete and rename report storage failure", () => {
    const saved = trySaveScenario("Kickout", content());
    if (saved.status !== "saved") throw new Error("setup");
    failWrites();
    expect(deleteScenario(saved.scenario.id)).toBe(false);
    expect(renameScenario(saved.scenario.id, "Renamed")).toBe(false);
    vi.restoreAllMocks();
    expect(listScenarios()[0]?.name).toBe("Kickout");
  });
});

describe("update in place (D2)", () => {
  it("replaces an opened play's content, keeping its id, list position and name", () => {
    const first = trySaveScenario("First", content());
    const second = trySaveScenario("Second", content());
    if (first.status !== "saved" || second.status !== "saved") throw new Error("setup");
    const before = listScenarios().map((s) => s.id);

    const nextRoutes = [{ playerId: "p2", points: [{ x: 16, y: 22 }, { x: 40, y: 30 }] }];
    const result = tryUpdateScenario(first.scenario.id, content({ routes: nextRoutes }));
    expect(result.status).toBe("saved");

    const after = listScenarios();
    expect(after.map((s) => s.id)).toEqual(before);
    expect(after).toHaveLength(2);
    const updated = after.find((s) => s.id === first.scenario.id)!;
    expect(updated.name).toBe("First");
    expect(updated.routes).toEqual(nextRoutes);
  });

  it("renames on update only when a non-empty name is given", () => {
    const saved = trySaveScenario("Kickout", content());
    if (saved.status !== "saved") throw new Error("setup");
    tryUpdateScenario(saved.scenario.id, content(), "   ");
    expect(listScenarios()[0]?.name).toBe("Kickout");
    tryUpdateScenario(saved.scenario.id, content(), "Kickout v2");
    expect(listScenarios()[0]?.name).toBe("Kickout v2");
  });

  it("reports a play that no longer exists", () => {
    expect(tryUpdateScenario("gone", content())).toEqual({ status: "failed", reason: "missing" });
    expect(listScenarios()).toEqual([]);
  });

  it("an update is allowed at the limit (it adds nothing)", () => {
    const ids = fillToLimit();
    expect(tryUpdateScenario(ids[5]!, content({ routes: [] })).status).toBe("saved");
    expect(listScenarios()).toHaveLength(MAX_SCENARIOS);
  });

  it("content can never override the stored identity", () => {
    const saved = trySaveScenario("Kickout", content());
    if (saved.status !== "saved") throw new Error("setup");
    const sneaky = { ...content(), id: "other", name: "Other", savedAt: 1 } as unknown as TacticalScenarioContent;
    tryUpdateScenario(saved.scenario.id, sneaky);
    const [stored] = listScenarios();
    expect(stored?.id).toBe(saved.scenario.id);
    expect(stored?.name).toBe("Kickout");
  });
});

describe("exact playback speed is stored (D7)", () => {
  it("stores the exact multiplier alongside the legacy preset", () => {
    trySaveScenario("Slow-mo", content({ playbackSpeed: "slow", playbackSpeedMultiplier: 0.75 }));
    const [stored] = listScenarios();
    expect(stored?.playbackSpeedMultiplier).toBe(0.75);
    expect(stored?.playbackSpeed).toBe("slow");
  });
});

describe("in-progress draft (D1)", () => {
  it("round-trips the board and the play it was opened from", () => {
    expect(saveScenarioDraft(content(), { loadedScenarioId: "abc", loadedScenarioName: "Kickout" })).toBe(true);
    const { draft, isCorrupt } = loadScenarioDraft();
    expect(isCorrupt).toBe(false);
    expect(draft?.loadedScenarioId).toBe("abc");
    expect(draft?.loadedScenarioName).toBe("Kickout");
    expect(draft?.content.tokens).toEqual(TOKENS);
    expect(draft?.content.routes).toEqual(content().routes);
    expect(draft?.content.playbackSpeedMultiplier).toBe(0.75);
  });

  it("is stored apart from saved plays and never touches them", () => {
    trySaveScenario("Kickout", content());
    const before = localStorage.getItem(SCENARIOS_KEY);
    saveScenarioDraft(content({ routes: [] }), { loadedScenarioId: null, loadedScenarioName: null });
    expect(TP_ACTIVE_DRAFT_STORAGE_KEY).not.toBe(SCENARIOS_KEY);
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe(before);
    clearScenarioDraft();
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe(before);
    expect(loadScenarioDraft()).toEqual({ draft: null, isCorrupt: false });
  });

  it("reports a corrupt or foreign draft instead of loading it", () => {
    localStorage.setItem(TP_ACTIVE_DRAFT_STORAGE_KEY, "{not json");
    expect(loadScenarioDraft()).toEqual({ draft: null, isCorrupt: true });
    localStorage.setItem(TP_ACTIVE_DRAFT_STORAGE_KEY, JSON.stringify({ content: { tokens: "nope" } }));
    expect(loadScenarioDraft()).toEqual({ draft: null, isCorrupt: true });
  });

  it("reports a failed draft write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveScenarioDraft(content(), { loadedScenarioId: null, loadedScenarioName: null })).toBe(false);
  });

  it("is crash-recovery state, not a backup domain — like every other draft", () => {
    expect(BACKUP_DOMAINS.map((d) => d.storageKey)).not.toContain(TP_ACTIVE_DRAFT_STORAGE_KEY);
    expect(BACKUP_DOMAINS.map((d) => d.storageKey)).toContain(SCENARIOS_KEY);
  });
});
