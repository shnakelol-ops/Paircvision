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
