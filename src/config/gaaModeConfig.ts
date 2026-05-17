import type { MatchEventKind } from "../core/stats/stats-event-model";

type GaaModeDefinition = {
  modeName: string;
  pitchSport: "gaelic" | "hurling";
  eventButtons: ReadonlyArray<{ label: string; kind: MatchEventKind }>;
  eventLabels: Record<MatchEventKind, string>;
  scoringEvents: ReadonlyArray<MatchEventKind>;
  reviewGroups: Record<string, { label: string; kinds: ReadonlyArray<MatchEventKind> }>;
  restartLabel: string;
};

type ModeLabelOverrides = {
  includeTwoPointer: boolean;
  kickoutWonLabel: string;
  kickoutConcededLabel: string;
  placeBallLabel: string | null;
  placeBallKind?: MatchEventKind;
};

function buildEventButtons({
  includeTwoPointer,
  kickoutWonLabel,
  kickoutConcededLabel,
  placeBallLabel,
  placeBallKind,
}: ModeLabelOverrides): ReadonlyArray<{ label: string; kind: MatchEventKind }> {
  const baseButtons: Array<{ label: string; kind: MatchEventKind }> = [
    { label: "GOAL", kind: "GOAL" },
    { label: "POINT", kind: "POINT" },
    { label: "WIDE", kind: "WIDE" },
    { label: "SHOT", kind: "SHOT" },
    { label: "T+", kind: "TURNOVER_WON" },
    { label: "T−", kind: "TURNOVER_LOST" },
    { label: kickoutWonLabel, kind: "KICKOUT_WON" },
    { label: kickoutConcededLabel, kind: "KICKOUT_CONCEDED" },
    { label: "F+", kind: "FREE_WON" },
    { label: "F−", kind: "FREE_CONCEDED" },
    { label: "FS", kind: "FREE_SCORED" },
    { label: "FM", kind: "FREE_MISSED" },
  ];
  if (placeBallLabel && placeBallKind) {
    baseButtons.push({ label: placeBallLabel, kind: placeBallKind });
  }
  if (includeTwoPointer) {
    baseButtons.splice(2, 0, { label: "2PT", kind: "TWO_POINTER" });
  }
  return baseButtons;
}

function buildEventLabels({
  kickoutWonLabel,
  kickoutConcededLabel,
}: Pick<ModeLabelOverrides, "kickoutWonLabel" | "kickoutConcededLabel">): Record<
  MatchEventKind,
  string
> {
  return {
    GOAL: "GOAL",
    POINT: "POINT",
    TWO_POINTER: "2PT",
    WIDE: "WIDE",
    SHOT: "SHOT",
    TURNOVER_WON: "T+",
    TURNOVER_LOST: "T−",
    KICKOUT_WON: kickoutWonLabel,
    KICKOUT_CONCEDED: kickoutConcededLabel,
    FREE_WON: "F+",
    FREE_CONCEDED: "F−",
    FREE_SCORED: "FS",
    FREE_MISSED: "FM",
    FORTY_FIVE_TWO_POINT: "45+2",
  };
}

function buildReviewGroups(includeTwoPointer: boolean) {
  return {
    SCORES: { label: "SCORES", kinds: includeTwoPointer ? ["GOAL", "POINT", "TWO_POINTER", "FREE_SCORED", "FORTY_FIVE_TWO_POINT"] : ["GOAL", "POINT", "FREE_SCORED", "FORTY_FIVE_TWO_POINT"] },
    WIDES: { label: "WIDES", kinds: ["WIDE"] },
    SHOTS: { label: "SHOTS", kinds: ["SHOT"] },
    TURNOVERS: { label: "TURNOVERS", kinds: ["TURNOVER_WON", "TURNOVER_LOST"] },
    KICKOUTS: { label: "KICKOUTS", kinds: ["KICKOUT_WON", "KICKOUT_CONCEDED"] },
    FREES: { label: "FREES", kinds: ["FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED"] },
  } as const satisfies Record<string, { label: string; kinds: ReadonlyArray<MatchEventKind> }>;
}

export const gaaModeConfig = {
  football: {
    modeName: "Football",
    pitchSport: "gaelic",
    eventButtons: buildEventButtons({
      includeTwoPointer: true,
      kickoutWonLabel: "K+",
      kickoutConcededLabel: "K−",
      placeBallLabel: null,
    }),
    eventLabels: buildEventLabels({
      kickoutWonLabel: "K+",
      kickoutConcededLabel: "K−",
    }),
    scoringEvents: ["GOAL", "POINT", "TWO_POINTER", "FREE_SCORED"],
    reviewGroups: buildReviewGroups(true),
    restartLabel: "Kickout",
  },
  ladiesFootball: {
    modeName: "Ladies Football",
    pitchSport: "gaelic",
    eventButtons: buildEventButtons({
      includeTwoPointer: true,
      kickoutWonLabel: "K+",
      kickoutConcededLabel: "K−",
      placeBallLabel: "45+2",
      placeBallKind: "FORTY_FIVE_TWO_POINT",
    }),
    eventLabels: buildEventLabels({
      kickoutWonLabel: "K+",
      kickoutConcededLabel: "K−",
    }),
    scoringEvents: ["GOAL", "POINT", "TWO_POINTER", "FREE_SCORED", "FORTY_FIVE_TWO_POINT"],
    reviewGroups: buildReviewGroups(true),
    restartLabel: "Kickout",
  },
  hurling: {
    modeName: "Hurling",
    pitchSport: "hurling",
    eventButtons: buildEventButtons({
      includeTwoPointer: false,
      kickoutWonLabel: "P+",
      kickoutConcededLabel: "P-",
      placeBallLabel: null,
    }),
    eventLabels: buildEventLabels({
      kickoutWonLabel: "P+",
      kickoutConcededLabel: "P-",
    }),
    scoringEvents: ["GOAL", "POINT", "FREE_SCORED"],
    reviewGroups: buildReviewGroups(false),
    restartLabel: "Puckout",
  },
  camogie: {
    modeName: "Camogie",
    pitchSport: "hurling",
    eventButtons: buildEventButtons({
      includeTwoPointer: false,
      kickoutWonLabel: "P+",
      kickoutConcededLabel: "P-",
      placeBallLabel: null,
    }),
    eventLabels: buildEventLabels({
      kickoutWonLabel: "P+",
      kickoutConcededLabel: "P-",
    }),
    scoringEvents: ["GOAL", "POINT", "FREE_SCORED"],
    reviewGroups: buildReviewGroups(false),
    restartLabel: "Puckout",
  },
} as const satisfies Record<string, GaaModeDefinition>;

export type GaaModeKey = keyof typeof gaaModeConfig;

