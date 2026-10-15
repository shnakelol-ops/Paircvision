// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { buildDefaultTeamSheet, loadTeamSheet, saveTeamSheet } from "./team-sheet-storage";
import { getJerseySrc } from "./team-sheet-jersey";
import { DEFAULT_KIT_SELECTION, DEFAULT_TEAM, PRESET_KITS, presetKitSrcs, resolveKit } from "./team-sheet-kits";

const KEY = "paircvision_internal_team_sheet_v1";
const YELLOW = "preset:ballylanders-yellow";
const GREEN = "preset:ballylanders-green";
const WHITE = "preset:ballylanders-white";
const GK_BLACK = "preset:ballylanders-gk-black";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Team Sheet persistence", () => {
  it("defaults to Ballylanders with the yellow outfield and black GK presets", () => {
    const data = loadTeamSheet();
    expect(data.team).toEqual(DEFAULT_TEAM);
    expect(data.kits).toEqual({ outfieldKitId: YELLOW, gkKitId: GK_BLACK });
  });

  it("round-trips team identity and both kit selections", () => {
    const players = buildDefaultTeamSheet();
    const team = { id: "ballylanders", name: "Ballylanders U14" };
    const kits = { outfieldKitId: WHITE, gkKitId: "user:abc" };
    saveTeamSheet({ players, substitutes: [], team, kits });
    const loaded = loadTeamSheet();
    expect(loaded.team).toEqual(team);
    // User kit ids are kept even though no such kit exists yet — the screen
    // resolves them, storage never silently drops a selection.
    expect(loaded.kits).toEqual(kits);
  });

  it("writes the current shape with no legacy outfieldJersey field", () => {
    saveTeamSheet({
      players: buildDefaultTeamSheet(),
      substitutes: [],
      team: DEFAULT_TEAM,
      kits: DEFAULT_KIT_SELECTION,
    });
    const raw = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(Object.keys(raw).sort()).toEqual(["kits", "players", "substitutes", "team"]);
  });
});

describe("Team Sheet migration", () => {
  it("upgrades the legacy V1 bare-array shape", () => {
    const players = buildDefaultTeamSheet().map((p) => ({ ...p, name: `P${p.number}` }));
    window.localStorage.setItem(KEY, JSON.stringify(players));
    const loaded = loadTeamSheet();
    expect(loaded.players).toEqual(players);
    expect(loaded.substitutes).toEqual([]);
    expect(loaded.team).toEqual(DEFAULT_TEAM);
    expect(loaded.kits).toEqual(DEFAULT_KIT_SELECTION);
  });

  it("upgrades {players, substitutes} saves from before the jersey selector", () => {
    const players = buildDefaultTeamSheet();
    const subs = [{ id: "s16", number: 16, name: "Sub" }];
    window.localStorage.setItem(KEY, JSON.stringify({ players, substitutes: subs }));
    const loaded = loadTeamSheet();
    expect(loaded.players).toEqual(players);
    expect(loaded.substitutes).toEqual(subs);
    expect(loaded.kits).toEqual(DEFAULT_KIT_SELECTION);
  });

  it.each([
    ["yellow", YELLOW],
    ["green", GREEN],
    ["white", WHITE],
    ["purple", YELLOW],
  ])("maps the interim outfieldJersey %s onto kit %s", (legacy, kitId) => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players: buildDefaultTeamSheet(), substitutes: [], outfieldJersey: legacy }),
    );
    expect(loadTeamSheet().kits).toEqual({ outfieldKitId: kitId, gkKitId: GK_BLACK });
  });

  it("prefers an explicit kits selection over a stale outfieldJersey field", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        players: buildDefaultTeamSheet(),
        substitutes: [],
        outfieldJersey: "green",
        kits: { outfieldKitId: WHITE, gkKitId: GK_BLACK },
      }),
    );
    expect(loadTeamSheet().kits.outfieldKitId).toBe(WHITE);
  });

  it("falls back to defaults for a malformed team or kits object", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players: buildDefaultTeamSheet(), substitutes: [], team: { id: 3 }, kits: { gkKitId: "" } }),
    );
    const loaded = loadTeamSheet();
    expect(loaded.team).toEqual(DEFAULT_TEAM);
    expect(loaded.kits).toEqual(DEFAULT_KIT_SELECTION);
  });

  it("falls back to defaults for corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadTeamSheet().kits).toEqual(DEFAULT_KIT_SELECTION);
  });
});

describe("Kit selection resolution", () => {
  it("resolves a selected preset for its role", () => {
    expect(resolveKit(PRESET_KITS, GREEN, "outfield").id).toBe(GREEN);
    expect(resolveKit(PRESET_KITS, GK_BLACK, "gk").id).toBe(GK_BLACK);
  });

  it("falls back to the role default for a missing kit or a role mismatch", () => {
    expect(resolveKit(PRESET_KITS, "user:gone", "outfield").id).toBe(YELLOW);
    expect(resolveKit(PRESET_KITS, "user:gone", "gk").id).toBe(GK_BLACK);
    expect(resolveKit(PRESET_KITS, GK_BLACK, "outfield").id).toBe(YELLOW);
    expect(resolveKit(PRESET_KITS, WHITE, "gk").id).toBe(GK_BLACK);
  });

  it("gives #1 the GK kit and every other number the outfield kit", () => {
    const srcs = presetKitSrcs({ outfieldKitId: WHITE, gkKitId: GK_BLACK });
    expect(getJerseySrc(1, srcs)).toBe("/internal/ballylanders-gk-jersey.webp");
    for (let n = 2; n <= 15; n++) expect(getJerseySrc(n, srcs)).toBe("/internal/ballylanders-outfield-jersey-white.webp");
  });

  it("keeps the original yellow and black assets as the defaults", () => {
    expect(getJerseySrc(7)).toBe("/internal/ballylanders-outfield-jersey.webp");
    expect(getJerseySrc(1)).toBe("/internal/ballylanders-gk-jersey.webp");
  });
});
