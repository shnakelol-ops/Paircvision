// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MATCHDAY_PACK_STORAGE_KEY,
  NEUTRAL_COLOURS,
  cleanDate,
  cleanTime,
  createMatchdayPack,
  loadMatchdayPack,
  parseMatchdayPack,
  saveMatchdayPack,
} from "./matchday-pack-storage";
import { MATCHDAY_LIMITS, type MatchdayPackV1, type MatchdaySide } from "./matchday-pack-types";

const TEAM_SHEET_KEY = "paircvision_internal_team_sheet_v1";
const KITS_KEY = "paircvision_internal_team_sheet_kits_v1";

const home: MatchdaySide = {
  teamId: "ballylanders",
  name: "Ballylanders",
  colours: { primary: "#f2c12e", secondary: "#138a3a" },
  outfieldKitId: "preset:ballylanders-yellow",
};
const away: MatchdaySide = {
  teamId: "team:abc",
  name: "Cnoc Áine",
  colours: { primary: "#7a1f2b", secondary: "#f4f4f2" },
  outfieldKitId: null,
};

function validPack(): MatchdayPackV1 {
  const p = createMatchdayPack({
    home,
    away,
    fixture: { competition: "Limerick SFC", round: "Final", venue: "Kilmallock", date: "2026-10-25", throwIn: "15:30" },
    sponsors: [{ id: "sponsor:1", name: "Hanley's Hardware", permissionConfirmedAt: 1 }],
  });
  if (!p) throw new Error("fixture invalid");
  return p;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("Matchday Pack storage", () => {
  it("round-trips a pack through its own key", () => {
    const pack = validPack();
    expect(saveMatchdayPack(pack)).toBe(true);
    const loaded = loadMatchdayPack();
    expect(loaded).toMatchObject({ version: 1, id: pack.id, home, away, fixture: pack.fixture, sponsors: pack.sponsors });
    expect(Object.keys(window.localStorage)).toEqual([MATCHDAY_PACK_STORAGE_KEY]);
  });

  it("never reads or writes the Team Sheet or kit keys", () => {
    const sheet = JSON.stringify({ players: [], substitutes: [], team: { id: "ballylanders", name: "Ballylanders" } });
    window.localStorage.setItem(TEAM_SHEET_KEY, sheet);
    window.localStorage.setItem(KITS_KEY, "[]");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    saveMatchdayPack(validPack());
    loadMatchdayPack();
    const touched = [...getItem.mock.calls, ...setItem.mock.calls].map((c) => c[0]);
    expect(new Set(touched)).toEqual(new Set([MATCHDAY_PACK_STORAGE_KEY]));
    expect(window.localStorage.getItem(TEAM_SHEET_KEY)).toBe(sheet);
    expect(window.localStorage.getItem(KITS_KEY)).toBe("[]");
  });

  it("returns null for a missing key, corrupt JSON, an unknown version or a non-object", () => {
    expect(loadMatchdayPack()).toBeNull();
    window.localStorage.setItem(MATCHDAY_PACK_STORAGE_KEY, "{not json");
    expect(loadMatchdayPack()).toBeNull();
    window.localStorage.setItem(MATCHDAY_PACK_STORAGE_KEY, JSON.stringify({ ...validPack(), version: 2 }));
    expect(loadMatchdayPack()).toBeNull();
    window.localStorage.setItem(MATCHDAY_PACK_STORAGE_KEY, JSON.stringify([validPack()]));
    expect(loadMatchdayPack()).toBeNull();
  });

  it("rejects a pack whose home or away side has no team id or name", () => {
    expect(parseMatchdayPack({ ...validPack(), away: { ...away, name: "   " } })).toBeNull();
    expect(parseMatchdayPack({ ...validPack(), home: { ...home, teamId: "" } })).toBeNull();
    expect(parseMatchdayPack({ ...validPack(), home: undefined })).toBeNull();
  });

  it("cleans fields instead of rejecting the whole pack", () => {
    const parsed = parseMatchdayPack({
      ...validPack(),
      home: { ...home, name: "  Naomh   Mearnóg  ", colours: { primary: "yellow", secondary: "#ABCDEF" }, outfieldKitId: 7 },
      fixture: { competition: 42, round: "  Semi-Final ", venue: "x".repeat(500), date: "2026-02-30", throwIn: "25:00" },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.home.name).toBe("Naomh Mearnóg");
    expect(parsed!.home.colours).toEqual({ primary: NEUTRAL_COLOURS.primary, secondary: "#abcdef" });
    expect(parsed!.home.outfieldKitId).toBeNull();
    expect(parsed!.fixture).toEqual({
      competition: "",
      round: "Semi-Final",
      venue: "x".repeat(MATCHDAY_LIMITS.venue),
      date: "",
      throwIn: "",
    });
  });

  it("keeps fadas and long real competition names intact", () => {
    const competition = "Corn Uí Mhuirí — All-Ireland Club Intermediate Ladies Football Championship";
    const parsed = parseMatchdayPack({ ...validPack(), fixture: { competition } });
    expect(parsed!.fixture.competition).toBe(competition);
  });

  it("validates dates and 24-hour throw-in times", () => {
    expect(cleanDate("2028-02-29")).toBe("2028-02-29");
    expect(cleanDate("2027-02-29")).toBe("");
    expect(cleanDate("25/10/2026")).toBe("");
    expect(cleanTime("00:00")).toBe("00:00");
    expect(cleanTime("23:59")).toBe("23:59");
    expect(cleanTime("3:30")).toBe("");
    expect(cleanTime("24:00")).toBe("");
  });

  it("keeps at most three sponsors, each with a permission confirmation", () => {
    const parsed = parseMatchdayPack({
      ...validPack(),
      sponsors: [
        { id: "sponsor:a", name: "A", permissionConfirmedAt: 1 },
        { id: "sponsor:no-permission", name: "B", permissionConfirmedAt: 0 },
        { id: "sponsor:a", name: "A again", permissionConfirmedAt: 1 },
        { id: "bad-id", name: "C", permissionConfirmedAt: 1 },
        { id: "sponsor:d", name: "D", permissionConfirmedAt: 1 },
        { id: "sponsor:e", name: "E", permissionConfirmedAt: 1 },
        { id: "sponsor:f", name: "F", permissionConfirmedAt: 1 },
      ],
    });
    expect(parsed!.sponsors.map((s) => s.id)).toEqual(["sponsor:a", "sponsor:d", "sponsor:e"]);
  });

  it("reports a failed write (quota / private mode) instead of claiming success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveMatchdayPack(validPack())).toBe(false);
  });

  it("refuses to save an invalid pack", () => {
    expect(saveMatchdayPack({ ...validPack(), away: { ...away, name: "" } })).toBe(false);
    expect(window.localStorage.getItem(MATCHDAY_PACK_STORAGE_KEY)).toBeNull();
  });

  it("returns null rather than throwing when localStorage itself is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadMatchdayPack()).toBeNull();
  });
});
