// Semantic tactical zones for PáircVision.
//
// Coordinate system: team-relative normalized [0, 1].
//   x = 0.0  →  own goalkeeper end
//   x = 1.0  →  attacking goal end
//   y = 0.0  →  left wing (from own-goal perspective)
//   y = 1.0  →  right wing
//
// Zones are non-overlapping and tile the full [0,1]×[0,1] pitch.
// classifyEventZone applies an x-mirror for OPP events before lookup,
// so both teams are classified in this same "attacks-right" space.
//
// The classifier never filters by event kind — that context is left to
// the pressure engine and signal layer.

export type SemanticZoneId =
  // Own third (x: 0.00–0.34) — restart origin / defensive pressure arrival
  | "DEF_LEFT"
  | "DEF_CENTRE"
  | "DEF_RIGHT"
  // Midfield (x: 0.34–0.66) — transition / midfield restart landing
  | "MID_LEFT"
  | "MID_CENTRE"
  | "MID_RIGHT"
  // Forward entry zone (x: 0.66–0.82) — build-up into attack
  | "ATK_ENTRY_LEFT"
  | "ATK_ENTRY_CENTRE"
  | "ATK_ENTRY_RIGHT"
  // Scoring zone (x: 0.82–1.00) — high-value shots, goals, frees
  | "SCORING_LEFT"
  | "SCORING_CENTRE"
  | "SCORING_RIGHT";

export type TacticalCategory =
  | "DEFENSIVE_AREA"   // own third
  | "TRANSITION"       // midfield
  | "FORWARD_ENTRY"   // build-up to goal
  | "SCORING_ZONE";    // near goal

export type SemanticZoneDef = {
  id: SemanticZoneId;
  category: TacticalCategory;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type SemanticZoneClassification = {
  zone: SemanticZoneId;
  category: TacticalCategory;
};

// Priority-ordered list. First matching zone wins.
// Zones are non-overlapping so order only matters for exact boundary values.
export const SEMANTIC_ZONES: readonly SemanticZoneDef[] = [
  // ── Own third ─────────────────────────────────────────────────────────────
  { id: "DEF_LEFT",   category: "DEFENSIVE_AREA", xMin: 0.00, xMax: 0.34, yMin: 0.00, yMax: 0.33 },
  { id: "DEF_CENTRE", category: "DEFENSIVE_AREA", xMin: 0.00, xMax: 0.34, yMin: 0.33, yMax: 0.67 },
  { id: "DEF_RIGHT",  category: "DEFENSIVE_AREA", xMin: 0.00, xMax: 0.34, yMin: 0.67, yMax: 1.00 },

  // ── Midfield ──────────────────────────────────────────────────────────────
  { id: "MID_LEFT",   category: "TRANSITION",     xMin: 0.34, xMax: 0.66, yMin: 0.00, yMax: 0.33 },
  { id: "MID_CENTRE", category: "TRANSITION",     xMin: 0.34, xMax: 0.66, yMin: 0.33, yMax: 0.67 },
  { id: "MID_RIGHT",  category: "TRANSITION",     xMin: 0.34, xMax: 0.66, yMin: 0.67, yMax: 1.00 },

  // ── Forward entry ─────────────────────────────────────────────────────────
  { id: "ATK_ENTRY_LEFT",   category: "FORWARD_ENTRY", xMin: 0.66, xMax: 0.82, yMin: 0.00, yMax: 0.35 },
  { id: "ATK_ENTRY_CENTRE", category: "FORWARD_ENTRY", xMin: 0.66, xMax: 0.82, yMin: 0.35, yMax: 0.65 },
  { id: "ATK_ENTRY_RIGHT",  category: "FORWARD_ENTRY", xMin: 0.66, xMax: 0.82, yMin: 0.65, yMax: 1.00 },

  // ── Scoring zone ──────────────────────────────────────────────────────────
  { id: "SCORING_LEFT",   category: "SCORING_ZONE", xMin: 0.82, xMax: 1.00, yMin: 0.00, yMax: 0.30 },
  { id: "SCORING_CENTRE", category: "SCORING_ZONE", xMin: 0.82, xMax: 1.00, yMin: 0.30, yMax: 0.70 },
  { id: "SCORING_RIGHT",  category: "SCORING_ZONE", xMin: 0.82, xMax: 1.00, yMin: 0.70, yMax: 1.00 },
];
