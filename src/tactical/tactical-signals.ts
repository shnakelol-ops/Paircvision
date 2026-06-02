// Tactical signal generator.
// No React, no Pixi, no DOM.
//
// Translates territorial pressure states into at most 2 calm, factual
// signal messages. Only surfaces amber and red states — notable is
// intentionally excluded as too low to be meaningful at match pace.
// No recommendations, no AI language, no player references.

import type { SemanticZoneId } from "./semantic-zones";
import type { TerritorialPressureState, PressureCategory } from "./pressure-engine";

export type TacticalSignal = {
  id: string;
  level: "amber" | "red";
  text: string;
};

const ZONE_DISPLAY_NAMES: Record<SemanticZoneId, string> = {
  DEF_LEFT:          "left defensive 3rd",
  DEF_CENTRE:        "centre defensive 3rd",
  DEF_RIGHT:         "right defensive 3rd",
  MID_LEFT:          "left middle 3rd",
  MID_CENTRE:        "centre middle 3rd",
  MID_RIGHT:         "right middle 3rd",
  ATK_ENTRY_LEFT:    "left attacking 3rd",
  ATK_ENTRY_CENTRE:  "centre attacking 3rd",
  ATK_ENTRY_RIGHT:   "right attacking 3rd",
  SCORING_LEFT:      "left scoring zone",
  SCORING_CENTRE:    "centre scoring zone",
  SCORING_RIGHT:     "right scoring zone",
};

type BenefitDirection = "positive" | "negative" | "mixed" | "neutral";

// Derives whether the dominant pattern in a pressure group is good for
// our team, bad for us, contested, or territorially neutral.
//
// OPP events invert the raw kind direction: OPP winning ball = bad for us.
// eventKinds contains only distinct kinds (no per-kind counts), so
// "mixed" fires when both a positive and a negative kind are present.
function deriveBenefit(
  category: PressureCategory,
  teamSide: "FOR" | "OPP",
  eventKinds: TerritorialPressureState["eventKinds"],
): BenefitDirection {
  switch (category) {
    case "TURNOVER": {
      const won  = eventKinds.includes("TURNOVER_WON");
      const lost = eventKinds.includes("TURNOVER_LOST");
      if (won && lost) return "mixed";
      const rawPositive = won;
      return teamSide === "FOR"
        ? (rawPositive ? "positive" : "negative")
        : (rawPositive ? "negative" : "positive"); // OPP won = bad for us
    }
    case "RESTART": {
      const won      = eventKinds.includes("KICKOUT_WON");
      const conceded = eventKinds.includes("KICKOUT_CONCEDED");
      if (won && conceded) return "mixed";
      const rawPositive = won;
      return teamSide === "FOR"
        ? (rawPositive ? "positive" : "negative")
        : (rawPositive ? "negative" : "positive");
    }
    case "FREE": {
      const won      = eventKinds.includes("FREE_WON");
      const negative = eventKinds.some(k => k === "FREE_CONCEDED" || k === "FREE_MISSED");
      if (won && negative) return "mixed";
      const rawPositive = won;
      return teamSide === "FOR"
        ? (rawPositive ? "positive" : "negative")
        : (rawPositive ? "negative" : "positive");
    }
    case "SCORING_CORRIDOR": {
      const scored = eventKinds.some(
        k => k === "POINT" || k === "GOAL" || k === "TWO_POINTER" ||
             k === "FREE_SCORED" || k === "FORTY_FIVE_TWO_POINT",
      );
      const missed = eventKinds.includes("WIDE");
      if (scored && missed) return "mixed";
      if (!scored && !missed) return "neutral"; // SHOT-only = territorial
      const rawPositive = scored;
      return teamSide === "FOR"
        ? (rawPositive ? "positive" : "negative")
        : (rawPositive ? "negative" : "positive");
    }
  }
}

function generateSignalText(state: TerritorialPressureState): string {
  const zone    = ZONE_DISPLAY_NAMES[state.zoneId];
  const benefit = deriveBenefit(state.category, state.teamSide, state.eventKinds);

  switch (state.category) {
    case "TURNOVER":
      if (benefit === "positive") {
        return state.teamSide === "FOR"
          ? `Winning turnovers in ${zone}.`
          : `Forcing turnovers in ${zone}.`;
      }
      if (benefit === "negative") {
        return state.teamSide === "FOR"
          ? `Conceding turnovers in ${zone}.`
          : `Opposition winning ball in ${zone}.`;
      }
      return `Turnover contest in ${zone}.`;

    case "RESTART":
      if (benefit === "positive") {
        return state.teamSide === "FOR"
          ? `Securing restarts through ${zone}.`
          : `Disrupting opposition restarts in ${zone}.`;
      }
      if (benefit === "negative") {
        return state.teamSide === "FOR"
          ? `Losing restarts in ${zone}.`
          : `Opposition securing restarts in ${zone}.`;
      }
      return `Restart contest in ${zone}.`;

    case "FREE":
      if (benefit === "positive") {
        return state.teamSide === "FOR"
          ? `Winning frees in ${zone}.`
          : `Forcing frees in ${zone}.`;
      }
      if (benefit === "negative") {
        return state.teamSide === "FOR"
          ? `Conceding frees in ${zone}.`
          : `Opposition winning frees in ${zone}.`;
      }
      return `Free activity in ${zone}.`;

    case "SCORING_CORRIDOR":
      if (benefit === "positive") {
        return state.teamSide === "FOR"
          ? `Scoring from ${zone}.`
          : `Opposition scoring from ${zone}.`;
      }
      if (benefit === "negative") {
        return state.teamSide === "FOR"
          ? `Wides building from ${zone}.`
          : `Opposition misfiring from ${zone}.`;
      }
      // neutral (SHOT-only) or mixed
      return state.teamSide === "FOR"
        ? `Attacks building through ${zone}.`
        : `Opposition attacking from ${zone}.`;
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
