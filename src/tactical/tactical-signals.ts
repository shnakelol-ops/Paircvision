// Tactical signal generator.
// No React, no Pixi, no DOM.
//
// Translates territorial pressure states into at most 2 calm, factual
// signal messages. Only surfaces amber and red states — notable is
// intentionally excluded as too low to be meaningful at match pace.
// No recommendations, no AI language, no player references.

import type { SemanticZoneId } from "./semantic-zones";
import type { TerritorialPressureState } from "./pressure-engine";

export type TacticalSignal = {
  id: string;
  level: "amber" | "red";
  text: string;
};

const ZONE_DISPLAY_NAMES: Record<SemanticZoneId, string> = {
  DEF_LEFT:          "left defensive channel",
  DEF_CENTRE:        "central defensive zone",
  DEF_RIGHT:         "right defensive channel",
  MID_LEFT:          "left midfield",
  MID_CENTRE:        "central midfield",
  MID_RIGHT:         "right midfield",
  ATK_ENTRY_LEFT:    "left forward entry",
  ATK_ENTRY_CENTRE:  "central forward entry",
  ATK_ENTRY_RIGHT:   "right forward entry",
  SCORING_LEFT:      "left scoring channel",
  SCORING_CENTRE:    "central scoring zone",
  SCORING_RIGHT:     "right scoring channel",
};

function generateSignalText(state: TerritorialPressureState): string {
  const zone = ZONE_DISPLAY_NAMES[state.zoneId];
  const { teamSide, category } = state;

  switch (category) {
    case "TURNOVER":
      return teamSide === "FOR"
        ? `Turnovers repeating in ${zone}.`
        : `Opposition winning ball in ${zone}.`;
    case "RESTART":
      return teamSide === "FOR"
        ? `Restarts landing in ${zone}.`
        : `Opposition restarts landing in ${zone}.`;
    case "FREE":
      return teamSide === "FOR"
        ? `Frees showing in ${zone}.`
        : `Frees building in ${zone}.`;
    case "SCORING_CORRIDOR":
      return teamSide === "FOR"
        ? `Attacks building through ${zone}.`
        : `Opposition attacks coming from ${zone}.`;
  }
}

export function computeTacticalSignals(
  states: readonly TerritorialPressureState[],
): TacticalSignal[] {
  const signals: TacticalSignal[] = [];

  for (const state of states) {
    if (signals.length >= 2) break;
    if (state.level === "notable") continue;

    signals.push({
      id: state.id,
      level: state.level,
      text: generateSignalText(state),
    });
  }

  return signals;
}
