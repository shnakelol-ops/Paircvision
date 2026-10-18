import { describe, expect, it } from "vitest";
import { PRESET_KITS, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import {
  DEFAULT_MERIDIEM,
  coverFilename,
  defaultMatchdayPack,
  kitsForClub,
  minuteOptions,
  parseTime24,
  renameSide,
  saveBlocker,
  teamIdForClubName,
  toTime24,
  updateFixture,
} from "./matchday-pack-form";
import { parseMatchdayPack } from "./matchday-pack-storage";

const galteeKit: TeamSheetKit = { id: "user:g1", teamId: "team:galtee-rovers", name: "Home", role: "outfield", source: "user" };
const galteeGk: TeamSheetKit = { id: "user:g2", teamId: "team:galtee-rovers", name: "GK", role: "gk", source: "user" };
const blUpload: TeamSheetKit = { id: "user:b1", teamId: "ballylanders", name: "Kit 1", role: "outfield", source: "user" };
const KITS = [...PRESET_KITS, galteeKit, galteeGk, blUpload];

describe("teamIdForClubName", () => {
  it("maps Ballylanders to the Team Sheet's team, whatever the case or spacing", () => {
    expect(teamIdForClubName("Ballylanders")).toBe("ballylanders");
    expect(teamIdForClubName("  BALLYLANDERS ")).toBe("ballylanders");
  });

  it("gives every other club a stable id, folding fadas and punctuation", () => {
    expect(teamIdForClubName("Galtee Rovers")).toBe("team:galtee-rovers");
    expect(teamIdForClubName("Cnoc Áine")).toBe("team:cnoc-aine");
    expect(teamIdForClubName("Cnoc Aine")).toBe("team:cnoc-aine");
    expect(teamIdForClubName("St. Kieran's")).toBe("team:st-kieran-s");
    expect(teamIdForClubName("   ")).toBe("team:unnamed");
  });
});

describe("kitsForClub", () => {
  it("lists only that club's outfield kits", () => {
    expect(kitsForClub(KITS, "team:galtee-rovers").map((k) => k.id)).toEqual(["user:g1"]);
    expect(kitsForClub(KITS, "ballylanders").map((k) => k.id)).toEqual([
      "preset:ballylanders-yellow",
      "preset:ballylanders-green",
      "preset:ballylanders-white",
      "user:b1",
    ]);
    expect(kitsForClub(KITS, "team:opposition")).toEqual([]);
  });
});

describe("renameSide", () => {
  const pack = defaultMatchdayPack();

  it("re-derives the club id and drops a kit the new club doesn't own", () => {
    const renamed = renameSide(pack.home, "Galtee Rovers", KITS);
    expect(renamed.teamId).toBe("team:galtee-rovers");
    expect(renamed.outfieldKitId).toBe("user:g1"); // the club's own first kit
  });

  it("keeps the chosen kit while the club stays the same", () => {
    const withUpload = { ...pack.home, outfieldKitId: "user:b1" };
    expect(renameSide(withUpload, "BALLYLANDERS", KITS).outfieldKitId).toBe("user:b1");
  });

  it("falls back to club colours for a club with no kits", () => {
    expect(renameSide(pack.home, "Oola", KITS).outfieldKitId).toBeNull();
  });
});

describe("default pack and saving", () => {
  it("starts valid: Ballylanders in yellow v Opposition in club colours", () => {
    const pack = defaultMatchdayPack();
    expect(parseMatchdayPack(pack)).not.toBeNull();
    expect(pack.home).toMatchObject({ name: "Ballylanders", teamId: "ballylanders", outfieldKitId: "preset:ballylanders-yellow" });
    expect(pack.away).toMatchObject({ name: "Opposition", outfieldKitId: null });
    expect(saveBlocker(pack)).toBeNull();
  });

  it("explains why a pack without both club names isn't saved", () => {
    const pack = defaultMatchdayPack();
    expect(saveBlocker({ ...pack, away: { ...pack.away, name: " " } })).toMatch(/both club names/);
  });

  it("updates fixture fields without touching the rest", () => {
    const pack = defaultMatchdayPack();
    const next = updateFixture(pack, { venue: "Bruff" });
    expect(next.fixture.venue).toBe("Bruff");
    expect(next.home).toBe(pack.home);
  });

  it("names the image after both clubs", () => {
    const pack = defaultMatchdayPack();
    expect(coverFilename({ ...pack, away: { ...pack.away, name: "Cnoc Áine" } })).toBe("matchday-ballylanders-v-cnoc-aine.png");
  });
});

describe("throw-in time conversion (12-hour editor ⇄ stored HH:mm)", () => {
  it.each([
    ["00:00", { hour: 12, minute: 0, period: "AM" }],
    ["00:30", { hour: 12, minute: 30, period: "AM" }],
    ["03:15", { hour: 3, minute: 15, period: "AM" }],
    ["11:59", { hour: 11, minute: 59, period: "AM" }],
    ["12:00", { hour: 12, minute: 0, period: "PM" }],
    ["12:45", { hour: 12, minute: 45, period: "PM" }],
    ["15:15", { hour: 3, minute: 15, period: "PM" }],
    ["23:05", { hour: 11, minute: 5, period: "PM" }],
  ] as const)("%s ⇄ %o", (hhmm, t12) => {
    expect(parseTime24(hhmm)).toEqual(t12);
    expect(toTime24(t12)).toBe(hhmm);
  });

  it("round-trips every minute of the day", () => {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        expect(toTime24(parseTime24(hhmm)!)).toBe(hhmm);
      }
    }
  });

  it("treats empty or malformed stored values as no time", () => {
    for (const bad of ["", "3:15", "24:00", "15:60", "3pm", "15.30"]) expect(parseTime24(bad)).toBeNull();
  });

  it("defaults to PM — the usual GAA throw-in", () => {
    expect(DEFAULT_MERIDIEM).toBe("PM");
  });

  it("offers 5-minute steps and keeps an off-grid saved minute", () => {
    expect(minuteOptions(null)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(7)).toEqual([0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(15)).toHaveLength(12);
  });
});
