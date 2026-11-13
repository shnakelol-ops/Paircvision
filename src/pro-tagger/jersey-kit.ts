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

export type JerseyPattern = "plain" | "chestV" | "chestBand" | "hoop" | "hoops" | "stripes";
export type JerseyTrim = "primary" | "secondary";

export type JerseyKit = {
  pattern: JerseyPattern;
  /** Sleeve colour. */
  sleeves: JerseyTrim;
  /** Collar colour; the cuffs follow it, so trim always matches. */
  collar: JerseyTrim;
};

/** The six approved patterns, in selector order. No others are to be added. */
export const JERSEY_PATTERNS: readonly JerseyPattern[] = ["plain", "chestV", "chestBand", "hoop", "hoops", "stripes"];

export const JERSEY_PATTERN_LABEL: Record<JerseyPattern, string> = {
  plain: "Plain",
  chestV: "Chest V",
  chestBand: "Chest Band",
  hoop: "Hoop",
  hoops: "Hoops",
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
