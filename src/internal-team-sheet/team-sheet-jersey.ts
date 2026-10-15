// Real Ballylanders jersey photos (cropped/background-removed from the
// club's o'neills.com product photos) — shared by the Starting XV tile and
// the substitutes tile so the asset paths and the number->jersey rule live
// in exactly one place. Served from public/internal/ (static, unbundled)
// since this tool is internal-only.
const GK_JERSEY_SRC = "/internal/ballylanders-gk-jersey.webp";

// The three real outfield kits the coach can pick between. "yellow" is the
// original asset and stays the default, so existing saved team sheets keep
// rendering exactly as before. Order here is the selector's display order.
export const OUTFIELD_JERSEYS = [
  { id: "yellow", label: "Yellow", src: "/internal/ballylanders-outfield-jersey.webp" },
  { id: "green", label: "Green", src: "/internal/ballylanders-outfield-jersey-green.webp" },
  { id: "white", label: "White", src: "/internal/ballylanders-outfield-jersey-white.webp" },
] as const;

export type OutfieldJerseyId = (typeof OUTFIELD_JERSEYS)[number]["id"];

export const DEFAULT_OUTFIELD_JERSEY: OutfieldJerseyId = "yellow";

export function isOutfieldJerseyId(value: unknown): value is OutfieldJerseyId {
  return OUTFIELD_JERSEYS.some((j) => j.id === value);
}

export function getOutfieldJerseySrc(jersey: OutfieldJerseyId): string {
  return (OUTFIELD_JERSEYS.find((j) => j.id === jersey) ?? OUTFIELD_JERSEYS[0]).src;
}

// Native height/width of the source images — used to size the jersey <img>
// without distorting it.
export const JERSEY_ASPECT = 369 / 300;

// Squad number 1 = the black/pink goalkeeper jersey regardless of the
// selected outfield kit; everyone else gets the selected outfield jersey.
// Applies identically to the Starting XV (where #1 is always the fixed GK
// slot) and to substitutes — giving a substitute the number 1 is how you
// mark them as the sub goalkeeper.
export function getJerseySrc(number: number, outfieldJersey: OutfieldJerseyId = DEFAULT_OUTFIELD_JERSEY): string {
  return number === 1 ? GK_JERSEY_SRC : getOutfieldJerseySrc(outfieldJersey);
}
