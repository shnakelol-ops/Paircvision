// Bundled cover fonts — Barlow / Barlow Condensed (SIL OFL 1.1, see
// public/fonts/OFL-Barlow.txt). Self-hosted so Android and iPhone draw the
// exact same glyphs and metrics; the system fallbacks (SF Pro vs Roboto)
// would otherwise reflow every line. The "latin" subset covers the Irish
// fadas (á é í ó ú Á É Í Ó Ú). Loaded with the FontFace API — no CSS, no
// dependency — and only when a cover is actually rendered.

export const COVER_DISPLAY_FAMILY = "PV Cover Display";
export const COVER_TEXT_FAMILY = "PV Cover Text";

// Fallback stacks keep a cover legible (condensed where possible) if the
// font files are unavailable, e.g. offline before PR 3's precache lands.
export const COVER_DISPLAY_STACK = `"${COVER_DISPLAY_FAMILY}", "Arial Narrow", "Roboto Condensed", sans-serif`;
export const COVER_TEXT_STACK = `"${COVER_TEXT_FAMILY}", "Helvetica Neue", Roboto, Arial, sans-serif`;

interface CoverFace {
  family: string;
  file: string;
  weight: string;
  style: "normal" | "italic";
}

export const COVER_FONT_FACES: readonly CoverFace[] = [
  { family: COVER_DISPLAY_FAMILY, file: "barlow-condensed-latin-600-normal.woff2", weight: "600", style: "normal" },
  { family: COVER_DISPLAY_FAMILY, file: "barlow-condensed-latin-800-normal.woff2", weight: "800", style: "normal" },
  { family: COVER_DISPLAY_FAMILY, file: "barlow-condensed-latin-800-italic.woff2", weight: "800", style: "italic" },
  { family: COVER_TEXT_FAMILY, file: "barlow-latin-600-normal.woff2", weight: "600", style: "normal" },
];

let loading: Promise<boolean> | null = null;

/**
 * Loads every cover face once per page. Resolves true when all faces are
 * ready, false when the FontFace API is missing or any file failed (the
 * cover then renders with the fallback stack). A failure is not cached, so
 * a later render — e.g. back online — retries.
 */
export function loadCoverFonts(): Promise<boolean> {
  if (loading) return loading;
  if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") {
    return Promise.resolve(false);
  }
  const attempt = Promise.all(
    COVER_FONT_FACES.map(async (face) => {
      const ff = new FontFace(face.family, `url(/fonts/${face.file}) format("woff2")`, {
        weight: face.weight,
        style: face.style,
      });
      await ff.load();
      // FontFaceSet.add exists in every target browser but is missing from
      // this project's TypeScript DOM lib.
      (document.fonts as unknown as { add(face: FontFace): void }).add(ff);
    }),
  ).then(
    () => true,
    () => {
      loading = null;
      return false;
    },
  );
  loading = attempt;
  return attempt;
}
