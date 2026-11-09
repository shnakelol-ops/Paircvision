// @vitest-environment jsdom
// P0 regression: "pitchflow_saved_squads_v1" (SAVED_SQUADS_STORAGE_KEY) is
// shared by legacy Match Stats (StatsModeSurface) and Event Stats' Saved
// Teams (pro-tagger/pro-tagger-team-storage.ts). The two features store
// differently shaped records in the same JSON array:
//   Match Stats → { id, name, players: [{ id, number, name, isActive? }], updatedAt }
//   Event Stats → { id, teamName, primaryColour, secondaryColour, players, createdAt, updatedAt }
// Match Stats parsed only its own shape and wrote that list back on mount,
// so merely opening Match Stats erased every Event Stats Saved Team.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// The Pixi pitch canvas cannot initialise under jsdom and is irrelevant to
// Saved Teams storage — stub it so the mount is clean.
vi.mock("./core/pitch/create-pixi-pitch-surface", () => ({
  createPixiPitchSurface: () => new Promise(() => {}),
  exportPixiPitchSurfacePng: async () => null,
}));

import StatsModeSurface, { buildSavedSquadsStorageValue } from "./StatsModeSurface";
import { SAVED_SQUADS_STORAGE_KEY } from "./core/stats/saved-match";
import { buildNewTeam, loadSavedTeams, saveTeam, type SavedTeam } from "./pro-tagger/pro-tagger-team-storage";

function seedEventStatsTeams(): SavedTeam[] {
  const teams = [
    buildNewTeam({
      teamName: "Ballylanders",
      primaryColour: "#16a34a",
      secondaryColour: "#facc15",
      players: [{ id: "p1", number: 1, name: "Declan", position: "GK" }],
    }),
    buildNewTeam({
      teamName: "Galbally",
      primaryColour: "#dc2626",
      secondaryColour: "#ffffff",
      players: [{ id: "p2", number: 2, name: "Jordan", position: "RB" }],
    }),
    buildNewTeam({
      teamName: "Kilfinane",
      primaryColour: "#1d4ed8",
      secondaryColour: "#fbbf24",
      players: [],
    }),
  ];
  for (const team of teams) expect(saveTeam(team)).toBe(true);
  return teams;
}

const LEGACY_MATCH_STATS_SQUAD = {
  id: "legacy-squad-1",
  name: "Legacy Club",
  players: [{ id: "lp1", number: 1, name: "Keeper", isActive: true }],
  updatedAt: 1_700_000_000_000,
};

function rawStored(): Array<Record<string, unknown>> {
  return JSON.parse(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY) ?? "[]") as Array<Record<string, unknown>>;
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom lacks these browser APIs; StatsModeSurface reads them on mount.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("opening Match Stats with Event Stats Saved Teams in shared storage", () => {
  it("keeps every Event Stats Saved Team, byte-for-byte", () => {
    const teams = seedEventStatsTeams();
    const before = window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY);

    render(<StatsModeSurface />);

    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe(before);
    expect(loadSavedTeams().map((t) => t.id).sort()).toEqual(teams.map((t) => t.id).sort());
  });

  it("keeps legacy Match Stats squads and Event Stats teams side by side", () => {
    const teams = seedEventStatsTeams();
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify([LEGACY_MATCH_STATS_SQUAD, ...rawStored()]));

    render(<StatsModeSurface />);

    const stored = rawStored();
    expect(stored.map((r) => r.id).sort()).toEqual([LEGACY_MATCH_STATS_SQUAD.id, ...teams.map((t) => t.id)].sort());
    for (const team of teams) expect(stored.find((r) => r.id === team.id)).toEqual(team);
    expect(stored.find((r) => r.id === LEGACY_MATCH_STATS_SQUAD.id)).toEqual(LEGACY_MATCH_STATS_SQUAD);
  });

  it("Event Stats still lists exactly its own teams after Match Stats has run", () => {
    const teams = seedEventStatsTeams();
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, JSON.stringify([LEGACY_MATCH_STATS_SQUAD, ...rawStored()]));

    render(<StatsModeSurface />);

    expect(loadSavedTeams()).toEqual(expect.arrayContaining(teams));
    expect(loadSavedTeams()).toHaveLength(teams.length);
  });

  it("does not overwrite a stored value that is not a JSON array", () => {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, "{not json");

    render(<StatsModeSurface />);

    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("{not json");
  });
});

describe("buildSavedSquadsStorageValue", () => {
  const eventStatsTeam = {
    id: "es-1",
    teamName: "Ballylanders",
    primaryColour: "#16a34a",
    secondaryColour: "#facc15",
    players: [{ id: "p1", number: 1, name: "Declan", position: "GK" }],
    createdAt: 1,
    updatedAt: 1,
  };

  it("writes Match Stats' squads first and appends every record Match Stats does not own, unchanged", () => {
    const newSnapshot = { ...LEGACY_MATCH_STATS_SQUAD, id: "legacy-squad-2", name: "New Snapshot", updatedAt: 2 };
    const value = buildSavedSquadsStorageValue(
      JSON.stringify([LEGACY_MATCH_STATS_SQUAD, eventStatsTeam]),
      [newSnapshot, LEGACY_MATCH_STATS_SQUAD],
    );
    expect(JSON.parse(value!)).toEqual([newSnapshot, LEGACY_MATCH_STATS_SQUAD, eventStatsTeam]);
  });

  it("matches the previous output exactly when storage holds only Match Stats squads", () => {
    const value = buildSavedSquadsStorageValue(JSON.stringify([LEGACY_MATCH_STATS_SQUAD]), [LEGACY_MATCH_STATS_SQUAD]);
    expect(value).toBe(JSON.stringify([LEGACY_MATCH_STATS_SQUAD]));
  });

  it("writes Match Stats' list as before when nothing is stored", () => {
    expect(buildSavedSquadsStorageValue(null, [])).toBe("[]");
    expect(buildSavedSquadsStorageValue(null, [LEGACY_MATCH_STATS_SQUAD])).toBe(JSON.stringify([LEGACY_MATCH_STATS_SQUAD]));
  });

  it("refuses (null) when the stored value is unreadable", () => {
    expect(buildSavedSquadsStorageValue("{not json", [])).toBeNull();
    expect(buildSavedSquadsStorageValue(JSON.stringify({ a: 1 }), [])).toBeNull();
  });
});
