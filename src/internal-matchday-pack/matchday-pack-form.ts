// Pure helpers for the internal Matchday Cover screen (/internal/matchday-pack).
// No React, no storage — unit-tested in matchday-pack-form.test.ts.
import { DEFAULT_TEAM, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import { createMatchdayPack } from "./matchday-pack-storage";
import type { MatchdayFixture, MatchdayPackV1, MatchdaySide } from "./matchday-pack-types";

/**
 * A club's identity in the kit store, derived from its name so it is stable
 * across sessions without a separate club registry: typing the same club
 * name again brings back the jerseys uploaded for it. "Ballylanders" maps to
 * the Team Sheet's own team id, so every Team Sheet / Kit Builder kit is
 * available for it. Fadas and punctuation are folded ("Cnoc Áine" →
 * "team:cnoc-aine"), so small spelling variations still match.
 */
export function teamIdForClubName(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!folded) return "team:unnamed";
  if (folded === DEFAULT_TEAM.name.toLowerCase()) return DEFAULT_TEAM.id;
  return `team:${folded}`;
}

/** Outfield kits that belong to this club — never another club's. */
export function kitsForClub(kits: readonly TeamSheetKit[], teamId: string): TeamSheetKit[] {
  return kits.filter((k) => k.teamId === teamId && k.role === "outfield");
}

/** Renaming a club re-derives its id and drops a kit that isn't its own. */
export function renameSide(side: MatchdaySide, name: string, kits: readonly TeamSheetKit[]): MatchdaySide {
  const teamId = teamIdForClubName(name);
  const keepsKit = side.outfieldKitId !== null && kitsForClub(kits, teamId).some((k) => k.id === side.outfieldKitId);
  const outfieldKitId = keepsKit ? side.outfieldKitId : (kitsForClub(kits, teamId)[0]?.id ?? null);
  return { ...side, name, teamId, outfieldKitId };
}

export function updateFixture(pack: MatchdayPackV1, patch: Partial<MatchdayFixture>): MatchdayPackV1 {
  return { ...pack, fixture: { ...pack.fixture, ...patch } };
}

export function defaultMatchdayPack(): MatchdayPackV1 {
  const pack = createMatchdayPack({
    home: {
      teamId: DEFAULT_TEAM.id,
      name: DEFAULT_TEAM.name,
      colours: { primary: "#f2c12e", secondary: "#138a3a" },
      outfieldKitId: "preset:ballylanders-yellow",
    },
    away: {
      teamId: teamIdForClubName("Opposition"),
      name: "Opposition",
      colours: { primary: "#64748b", secondary: "#e2e8f0" },
      outfieldKitId: null,
    },
    fixture: { competition: "", round: "", venue: "", date: "", throwIn: "" },
  });
  if (!pack) throw new Error("default Matchday Pack is invalid");
  return pack;
}

/** What still blocks saving, in the coach's words; null when the pack is saveable. */
export function saveBlocker(pack: MatchdayPackV1): string | null {
  if (!pack.home.name.trim() || !pack.away.name.trim()) return "Enter both club names to save these details.";
  return null;
}

/** "Ballylanders v Cnoc Áine" → "matchday-ballylanders-v-cnoc-aine.png". */
export function coverFilename(pack: MatchdayPackV1): string {
  const slug = (s: string) => teamIdForClubName(s).replace(/^team:/, "");
  return `matchday-${slug(pack.home.name)}-v-${slug(pack.away.name)}.png`;
}

// ── Throw-in time: 12-hour editing over the stored 24-hour "HH:mm" ──────────

export type Meridiem = "AM" | "PM";

export interface Time12 {
  /** 1–12 */
  hour: number;
  /** 0–59 */
  minute: number;
  period: Meridiem;
}

/** "15:30" → 3:30 PM, "00:15" → 12:15 AM, "12:00" → 12:00 PM. Invalid/empty → null. */
export function parseTime24(hhmm: string): Time12 | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  const h24 = Number(m[1]);
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: Number(m[2]), period: h24 < 12 ? "AM" : "PM" };
}

/** 12 AM → "00:mm", 12 PM → "12:mm", 3 PM → "15:mm". */
export function toTime24({ hour, minute, period }: Time12): string {
  const h24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Afternoon is the usual GAA throw-in, so a fresh pick starts at PM. */
export const DEFAULT_MERIDIEM: Meridiem = "PM";

/** Minute options in 5s, plus a saved off-grid minute (e.g. :07) so it never gets silently changed. */
export function minuteOptions(current: number | null): number[] {
  const opts = Array.from({ length: 12 }, (_, i) => i * 5);
  if (current !== null && !opts.includes(current)) opts.push(current);
  return opts.sort((a, b) => a - b);
}
