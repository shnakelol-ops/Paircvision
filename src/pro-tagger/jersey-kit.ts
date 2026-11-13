// Jersey Designer V2 — the kit model and its pure helpers (no React).
//
// A kit says WHERE the team's two existing colours go on the jersey; the
// colours themselves stay in ProTaggerSquad/SavedTeam primaryColour and
// secondaryColour, so there is exactly one place a team's colours live.
//
// Presentation only: never read by capture, scoring, statistics, Review,
// HT/FT or PDF code. Optional on every record — squads and Saved Teams
// stored before this existed have no `kit`, and every read goes through
// resolveJerseyKit(), which falls back to DEFAULT_JERSEY_KIT field by field.
// No migration and no rewrite of existing records.
//
// Deliberately separate from the Tactical Slate / Vision V3 PlayerKitPattern
// (components/player-kit), which is a different renderer with different
// semantics: neither tool can break the other.

export type JerseyPattern = "plain" | "chestV" | "hoop" | "stripes";
export type JerseyTrim = "primary" | "secondary";

export type JerseyKit = {
  pattern: JerseyPattern;
  /** Sleeve colour. */
  sleeves: JerseyTrim;
  /** Collar colour; the cuffs follow it, so trim always matches. */
  collar: JerseyTrim;
};

export const JERSEY_PATTERNS: readonly JerseyPattern[] = ["plain", "chestV", "hoop", "stripes"];

export const JERSEY_PATTERN_LABEL: Record<JerseyPattern, string> = {
  plain: "Plain",
  chestV: "Chest V",
  hoop: "Hoop",
  stripes: "Stripes",
};

/** Approved default for any squad or Saved Team without a valid kit. */
export const DEFAULT_JERSEY_KIT: JerseyKit = { pattern: "plain", sleeves: "secondary", collar: "secondary" };

function isPattern(v: unknown): v is JerseyPattern {
  return typeof v === "string" && (JERSEY_PATTERNS as readonly string[]).includes(v);
}

function isTrim(v: unknown): v is JerseyTrim {
  return v === "primary" || v === "secondary";
}

/**
 * Render-ready kit for any stored value. Field by field: a missing or
 * unknown field takes the default, so a partial or corrupt record still
 * renders. Never throws.
 */
export function resolveJerseyKit(raw: unknown): JerseyKit {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    pattern: isPattern(r.pattern) ? r.pattern : DEFAULT_JERSEY_KIT.pattern,
    sleeves: isTrim(r.sleeves) ? r.sleeves : DEFAULT_JERSEY_KIT.sleeves,
    collar: isTrim(r.collar) ? r.collar : DEFAULT_JERSEY_KIT.collar,
  };
}

/**
 * The kit to keep on a record: a cleaned copy when the stored value is an
 * object, otherwise undefined, so a record that never had a kit is not
 * given one just by being loaded and saved again.
 */
export function storedJerseyKit(raw: unknown): JerseyKit | undefined {
  return raw && typeof raw === "object" ? resolveJerseyKit(raw) : undefined;
}

// ── Number ink ──────────────────────────────────────────────────────────

/** Dark number ink used on light kits. */
export const DARK_NUMBER_INK = "#0b1220";

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG relative luminance (0 = black, 1 = white); null for an unreadable colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG minimum contrast for large/bold text — the bar a white number must clear. */
export const MIN_WHITE_NUMBER_CONTRAST = 3;

/**
 * True only when a white number would fall below WCAG's 3:1 large-text
 * minimum on this primary colour (white, yellow, gold, light green, light
 * grey kits). Every kit where white already reads acceptably — including
 * the default home green and away red — keeps today's white number, so
 * existing number behaviour changes only where it was failing. An
 * unreadable colour also keeps the white number.
 */
export function prefersDarkNumber(primary: string): boolean {
  const l = relativeLuminance(primary);
  if (l === null) return false;
  const whiteContrast = 1.05 / (l + 0.05);
  return whiteContrast < MIN_WHITE_NUMBER_CONTRAST;
}
