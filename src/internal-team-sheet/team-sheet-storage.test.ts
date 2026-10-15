// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { buildDefaultTeamSheet, loadTeamSheet, saveTeamSheet } from "./team-sheet-storage";
import { getJerseySrc, OUTFIELD_JERSEYS } from "./team-sheet-jersey";

const KEY = "paircvision_internal_team_sheet_v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Team Sheet outfield jersey persistence", () => {
  it("defaults to the original yellow jersey when nothing is saved", () => {
    expect(loadTeamSheet().outfieldJersey).toBe("yellow");
  });

  it("round-trips the selected outfield jersey", () => {
    const players = buildDefaultTeamSheet();
    saveTeamSheet({ players, substitutes: [], outfieldJersey: "white" });
    expect(loadTeamSheet().outfieldJersey).toBe("white");
    saveTeamSheet({ players, substitutes: [], outfieldJersey: "green" });
    expect(loadTeamSheet().outfieldJersey).toBe("green");
  });

  it("loads sheets saved before the selector existed as yellow, keeping players and subs", () => {
    const players = buildDefaultTeamSheet().map((p) => ({ ...p, name: `P${p.number}` }));
    const subs = [{ id: "s16", number: 16, name: "Sub" }];
    window.localStorage.setItem(KEY, JSON.stringify({ players, substitutes: subs }));
    const loaded = loadTeamSheet();
    expect(loaded.outfieldJersey).toBe("yellow");
    expect(loaded.players).toEqual(players);
    expect(loaded.substitutes).toEqual(subs);

    window.localStorage.setItem(KEY, JSON.stringify(players)); // legacy V1 bare array
    expect(loadTeamSheet().outfieldJersey).toBe("yellow");
  });

  it("falls back to yellow for an unknown jersey id", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players: buildDefaultTeamSheet(), substitutes: [], outfieldJersey: "purple" }),
    );
    expect(loadTeamSheet().outfieldJersey).toBe("yellow");
  });
});

describe("getJerseySrc", () => {
  it("always gives #1 the goalkeeper jersey, whatever outfield kit is selected", () => {
    const gk = getJerseySrc(1);
    for (const j of OUTFIELD_JERSEYS) expect(getJerseySrc(1, j.id)).toBe(gk);
  });

  it("gives every other number the selected outfield jersey", () => {
    for (const j of OUTFIELD_JERSEYS) {
      for (let n = 2; n <= 15; n++) expect(getJerseySrc(n, j.id)).toBe(j.src);
    }
  });

  it("keeps the existing yellow asset as the default", () => {
    expect(getJerseySrc(7)).toBe("/internal/ballylanders-outfield-jersey.webp");
  });
});
