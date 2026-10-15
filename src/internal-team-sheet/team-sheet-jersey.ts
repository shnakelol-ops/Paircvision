// Shared by the Starting XV tile and the substitutes tile so the
// number->jersey rule lives in exactly one place. The tiles receive
// already-resolved image URLs (see team-sheet-kits.ts) — they never look up
// kits themselves, so presets and IndexedDB-backed user kits render the
// same way.
import { presetKitSrcs, type TeamSheetKitSrcs } from "./team-sheet-kits";

// Native height/width of the source images — used to size the jersey <img>
// without distorting it.
export const JERSEY_ASPECT = 369 / 300;

// Squad number 1 = the selected goalkeeper kit; everyone else gets the
// selected outfield kit. Applies identically to the Starting XV (where #1
// is always the fixed GK slot) and to substitutes — giving a substitute
// the number 1 is how you mark them as the sub goalkeeper.
export function getJerseySrc(number: number, srcs: TeamSheetKitSrcs = presetKitSrcs()): string {
  return number === 1 ? srcs.gk : srcs.outfield;
}
