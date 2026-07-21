import { describe, expect, it } from "vitest";
import {
  deleteSavedMatch,
  orderSavedMatches,
  resolveSaveIdentity,
  type LoggedMatchEvent,
  type SavedMatch,
} from "./saved-match";

// Retention Test 01..12 — matches the naming used in the manual acceptance
// test, so these fixtures read the same way in code and in a manual pass.
function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  return {
    id: "evt-1",
    kind: "POINT",
    type: "POINT",
    nx: 0.9,
    ny: 0.5,
    half: 1,
    timestamp: 10,
    teamSide: "FOR",
    x: 0.9,
    y: 0.5,
    period: "1H",
    segment: 1,
    matchClockSeconds: 10,
    createdAt: 10,
    ...overrides,
  };
}

function buildMatch(n: number, overrides: Partial<SavedMatch> = {}): SavedMatch {
  return {
    id: `saved-match-${n}`,
    createdAt: n * 1000,
    label: `Retention Test ${String(n).padStart(2, "0")}`,
    homeTeamName: `Retention Test ${String(n).padStart(2, "0")}`,
    awayTeamName: "Opponent",
    venue: "Fraher Field",
    events: [buildEvent()],
    eventCount: 1,
    scorelineSnapshot: "0-01 (1) v 0-00 (0)",
    ...overrides,
  };
}

describe("orderSavedMatches — retention (no eviction, audit finding F03)", () => {
  it("keeps all 10 matches after the 10th save", () => {
    const matches = Array.from({ length: 10 }, (_, i) => buildMatch(i + 1));
    const result = orderSavedMatches(matches);
    expect(result).toHaveLength(10);
    expect(result.map((m) => m.id).sort()).toEqual(matches.map((m) => m.id).sort());
  });

  it("keeps all 11 matches after the 11th save — the exact scenario that was silently evicting match 1", () => {
    const matches = Array.from({ length: 11 }, (_, i) => buildMatch(i + 1));
    const result = orderSavedMatches(matches);
    expect(result).toHaveLength(11);
    expect(result.some((m) => m.id === "saved-match-1")).toBe(true);
  });

  it("keeps all 12 matches after the 12th save", () => {
    const matches = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));
    const result = orderSavedMatches(matches);
    expect(result).toHaveLength(12);
    expect(new Set(result.map((m) => m.id)).size).toBe(12);
    // Names/labels survive intact, not just the count.
    expect(result.map((m) => m.homeTeamName).sort()).toEqual(
      matches.map((m) => m.homeTeamName).sort(),
    );
  });

  it("orders newest first by createdAt, and that ordering is stable across a rehydration cycle", () => {
    const matches = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));
    const firstPass = orderSavedMatches(matches);
    // Rehydration = feeding the same stored array back through the same
    // pure function again, exactly as a page reload would via JSON.parse.
    const rehydrated = orderSavedMatches(JSON.parse(JSON.stringify(firstPass)));
    expect(rehydrated.map((m) => m.id)).toEqual(firstPass.map((m) => m.id));
    expect(rehydrated.map((m) => m.id)).toEqual(
      [...matches].sort((a, b) => b.createdAt - a.createdAt).map((m) => m.id),
    );
  });

  it("collapses a duplicate id to its most recently-written copy, not to a shorter array via truncation", () => {
    const original = buildMatch(6, { label: "Retention Test 06 (before edit)" });
    const updated = { ...original, label: "Retention Test 06 (after edit)", createdAt: original.createdAt };
    const others = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1)).filter((m) => m.id !== original.id);
    // Updated copy prepended, as saveCurrentMatchSnapshot does.
    const result = orderSavedMatches([updated, ...others, original]);
    expect(result).toHaveLength(12);
    const match6 = result.find((m) => m.id === original.id);
    expect(match6?.label).toBe("Retention Test 06 (after edit)");
  });
});

describe("resolveSaveIdentity — update in place (no duplicate, no collateral delete)", () => {
  const archive = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));

  it("updating match 6 reuses match 6's id and original createdAt", () => {
    const identity = resolveSaveIdentity(archive, "saved-match-6");
    expect(identity).toEqual({ id: "saved-match-6", createdAt: 6000 });
  });

  it("saving a brand-new match (id not in the archive) signals a fresh insert", () => {
    const identity = resolveSaveIdentity(archive, "live-some-fresh-session-id");
    expect(identity).toBeNull();
  });

  it("an update, once applied, changes match 6 only — matches 1-5 and 7-12 are byte-identical", () => {
    const identity = resolveSaveIdentity(archive, "saved-match-6")!;
    const updatedMatch6: SavedMatch = {
      ...buildMatch(6, { label: "Retention Test 06 (edited)" }),
      id: identity.id,
      createdAt: identity.createdAt,
    };
    const result = orderSavedMatches([updatedMatch6, ...archive]);
    expect(result).toHaveLength(12); // does not create match 13
    expect(result.find((m) => m.id === "saved-match-1")).toEqual(archive[0]); // does not delete match 1
    const byId = (list: readonly SavedMatch[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    const others = byId(result.filter((m) => m.id !== "saved-match-6"));
    const originalOthers = byId(archive.filter((m) => m.id !== "saved-match-6"));
    expect(others).toEqual(originalOthers); // every other match is untouched, order aside
    expect(result.find((m) => m.id === "saved-match-6")?.label).toBe("Retention Test 06 (edited)");
  });

  it("ordering after an update is unchanged — the edited match does not jump to the top", () => {
    const identity = resolveSaveIdentity(archive, "saved-match-6")!;
    const updatedMatch6: SavedMatch = { ...buildMatch(6), id: identity.id, createdAt: identity.createdAt };
    const before = orderSavedMatches(archive).map((m) => m.id);
    const after = orderSavedMatches([updatedMatch6, ...archive]).map((m) => m.id);
    expect(after).toEqual(before);
  });
});

describe("deleteSavedMatch — manual deletion", () => {
  const archive = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));

  it("removes only the selected match", () => {
    const result = deleteSavedMatch(archive, "saved-match-4");
    expect(result).toHaveLength(11);
    expect(result.some((m) => m.id === "saved-match-4")).toBe(false);
  });

  it("every other match persists, byte-identical", () => {
    const result = deleteSavedMatch(archive, "saved-match-4");
    const expectedOthers = archive.filter((m) => m.id !== "saved-match-4");
    expect(result).toEqual(expectedOthers);
  });

  it("deleting one match does not trigger any automatic backfill deletion of another", () => {
    const afterOneDelete = deleteSavedMatch(archive, "saved-match-4");
    // Saving a new (13th) match after a manual delete must not re-trigger
    // any eviction — orderSavedMatches never caps length.
    const withNewMatch = orderSavedMatches([buildMatch(13), ...afterOneDelete]);
    expect(withNewMatch).toHaveLength(12);
    expect(withNewMatch.map((m) => m.id).sort()).toEqual(
      [...afterOneDelete.map((m) => m.id), "saved-match-13"].sort(),
    );
  });
});

describe("import does not delete existing matches", () => {
  it("importing (saving) a 13th match keeps matches 1-12 intact", () => {
    const archive = Array.from({ length: 12 }, (_, i) => buildMatch(i + 1));
    const imported = buildMatch(13, { id: "saved-match-imported-13", label: "Imported Match" });
    const result = orderSavedMatches([imported, ...archive]);
    expect(result).toHaveLength(13);
    for (const m of archive) {
      expect(result.some((r) => r.id === m.id)).toBe(true);
    }
    expect(result.find((m) => m.id === "saved-match-imported-13")?.label).toBe("Imported Match");
  });
});
