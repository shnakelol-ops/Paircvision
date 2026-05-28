// Pure deterministic event-to-zone classifier.
// No React, no Pixi, no UI dependencies.

import type { MatchEventTeamSide } from "../core/stats/stats-event-model";
import {
  SEMANTIC_ZONES,
  type SemanticZoneClassification,
} from "./semantic-zones";

type ClassifiableEvent = {
  nx: number;
  ny: number;
  teamSide?: MatchEventTeamSide;
};

// Mirror x for OPP events so both teams are evaluated in "attacks-right" space.
// FOR events: nx unchanged.
// OPP events: x = 1 - nx (right becomes left, near-own-goal becomes near-attacking-goal).
function toTeamRelativeX(nx: number, teamSide?: MatchEventTeamSide): number {
  return teamSide === "OPP" || teamSide === "opposition" ? 1.0 - nx : nx;
}

export function classifyEventZone(
  event: ClassifiableEvent,
): SemanticZoneClassification | null {
  if (!Number.isFinite(event.nx) || !Number.isFinite(event.ny)) return null;

  const x = toTeamRelativeX(event.nx, event.teamSide);
  const y = Math.max(0, Math.min(1, event.ny));

  for (const zone of SEMANTIC_ZONES) {
    if (
      x >= zone.xMin && x <= zone.xMax &&
      y >= zone.yMin && y <= zone.yMax
    ) {
      return { zone: zone.id, category: zone.category };
    }
  }

  return null;
}
