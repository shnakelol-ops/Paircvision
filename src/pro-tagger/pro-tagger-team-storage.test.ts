// @vitest-environment jsdom
// SAVED_SQUADS_STORAGE_KEY is shared with legacy Match Stats
// (StatsModeSurface.tsx). Event Stats must list only its own Saved Teams and
// must carry Match Stats' squads through every write untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";
import { buildNewTeam, deleteTeam, loadSavedTeams, saveTeam, saveTeamResult } from "./pro-tagger-team-storage";

const LEGACY_MATCH_STATS_SQUAD = {
  id: "legacy-squad-1",
  name: "Legacy Club",
  players: [{ id: "lp1", number: 1, name: "Keeper", isActive: true }],
  updatedAt: 1_700_000_000_000,
};

function team(name: string) {
  return buildNewTeam({ teamName: name, primaryColour: "#16a34a", secondaryColour: "#ffffff", players: [] });
}

function rawStored(): Array<Record<string, unknown>> {
  return JSON.parse(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY) ?? "[]") as Array<Record<string, unknown>>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify([LEGACY_MATCH_STATS_SQUAD]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Event Stats Saved Teams sharing storage with Match Stats", () => {
  it("does not list Match Stats squads as Event Stats teams", () => {
    expect(loadSavedTeams()).toEqual([]);
  });

  it("saving a team keeps the Match Stats squad untouched", () => {
    const a = team("Ballylanders");
    expect(saveTeam(a)).toBe(true);
    expect(loadSavedTeams()).toEqual([a]);
    expect(rawStored()).toEqual([a, LEGACY_MATCH_STATS_SQUAD]);
  });

  it("updating a team in place keeps the Match Stats squad untouched", () => {
    const a = team("Ballylanders");
    saveTeam(a);
    const renamed = { ...a, teamName: "Ballylanders GAA", updatedAt: a.updatedAt + 1 };
    expect(saveTeam(renamed)).toBe(true);
    expect(rawStored()).toEqual([renamed, LEGACY_MATCH_STATS_SQUAD]);
  });

  it("deleting a team keeps the Match Stats squad, and cannot delete a Match Stats squad by id", () => {
    const a = team("Ballylanders");
    saveTeam(a);
    expect(deleteTeam(a.id)).toBe(true);
    expect(deleteTeam(LEGACY_MATCH_STATS_SQUAD.id)).toBe(false);
    expect(rawStored()).toEqual([LEGACY_MATCH_STATS_SQUAD]);
  });

  it("Match Stats squads do not count toward the 50-team library limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...LEGACY_MATCH_STATS_SQUAD, id: `legacy-${i}` }));
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify(many));
    for (let i = 0; i < 50; i++) expect(saveTeam(team(`Team ${i}`))).toBe(true);
    expect(saveTeam(team("One too many"))).toBe(false);
    expect(loadSavedTeams()).toHaveLength(50);
    expect(rawStored()).toHaveLength(60);
  });

  it("never overwrites an unreadable stored value", () => {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, "{not json");
    expect(loadSavedTeams()).toEqual([]);
    expect(saveTeam(team("Ballylanders"))).toBe(false);
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("{not json");
  });

  it("still works on an empty store", () => {
    window.localStorage.clear();
    const a = team("Ballylanders");
    expect(saveTeam(a)).toBe(true);
    expect(loadSavedTeams()).toEqual([a]);
  });
});

describe("Event Stats team sharing an id with a Match Stats squad", () => {
  function seedSameId() {
    const a = { ...team("Ballylanders"), id: LEGACY_MATCH_STATS_SQUAD.id };
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify([LEGACY_MATCH_STATS_SQUAD, a]));
    return a;
  }

  it("lists only the Event Stats record", () => {
    const a = seedSameId();
    expect(loadSavedTeams()).toEqual([a]);
  });

  it("updating the Event Stats team leaves the Match Stats squad untouched", () => {
    const a = seedSameId();
    const renamed = { ...a, teamName: "Ballylanders GAA" };
    expect(saveTeam(renamed)).toBe(true);
    expect(rawStored()).toEqual([LEGACY_MATCH_STATS_SQUAD, renamed]);
  });

  it("deleting the Event Stats team leaves the Match Stats squad untouched", () => {
    const a = seedSameId();
    expect(deleteTeam(a.id)).toBe(true);
    expect(rawStored()).toEqual([LEGACY_MATCH_STATS_SQUAD]);
  });
});

describe("unreadable Saved Teams store", () => {
  beforeEach(() => {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, "{not json");
  });

  it("save reports 'unavailable' (not 'full') and leaves the stored value untouched", () => {
    expect(saveTeamResult(team("Ballylanders"))).toEqual({ ok: false, reason: "unavailable" });
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("{not json");
  });

  it("delete refuses and leaves the stored value untouched", () => {
    expect(deleteTeam("anything")).toBe(false);
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("{not json");
  });

  it("a non-array JSON value is treated the same way", () => {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(saveTeamResult(team("Ballylanders"))).toEqual({ ok: false, reason: "unavailable" });
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe(JSON.stringify({ a: 1 }));
  });
});

describe("saveTeamResult failure reasons", () => {
  it("reports 'full' only for the 50-team limit", () => {
    for (let i = 0; i < 50; i++) saveTeam(team(`Team ${i}`));
    expect(saveTeamResult(team("One too many"))).toEqual({ ok: false, reason: "full" });
  });

  it("reports 'unavailable' when the browser refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveTeamResult(team("Ballylanders"))).toEqual({ ok: false, reason: "unavailable" });
  });
});
