// Real Ballylanders jersey photos (cropped/background-removed from the
// club's o'neills.com product photos) — shared by the Starting XV tile and
// the substitutes tile so the asset paths and the number->jersey rule live
// in exactly one place. Served from public/internal/ (static, unbundled)
// since this tool is internal-only.
const GK_JERSEY_SRC = "/internal/ballylanders-gk-jersey.webp";
const OUTFIELD_JERSEY_SRC = "/internal/ballylanders-outfield-jersey.webp";

// Native height/width of the source images — used to size the jersey <img>
// without distorting it.
export const JERSEY_ASPECT = 369 / 300;

// Squad number 1 = the black/pink goalkeeper jersey, everyone else gets the
// yellow/green outfield jersey. Applies identically to the Starting XV
// (where #1 is always the fixed GK slot) and to substitutes — giving a
// substitute the number 1 is how you mark them as the sub goalkeeper.
export function getJerseySrc(number: number): string {
  return number === 1 ? GK_JERSEY_SRC : OUTFIELD_JERSEY_SRC;
}
