import { clamp01 } from "../coordinates/pitch-coordinates";

export const MATCH_EVENT_KINDS = [
  "GOAL",
  "POINT",
  "WIDE",
  "TURNOVER_WON",
  "TURNOVER_LOST",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "SHOT",
  "FREE_WON",
  "FREE_CONCEDED",
  "FREE_SCORED",
  "FREE_MISSED",
  "KICKOUT_WON",
  "KICKOUT_CONCEDED",
] as const;

export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number];

export type MatchEvent = {
  id: string;
  kind: MatchEventKind;
  nx: number;
  ny: number;
  half: 1 | 2;
  timestamp: number;
};

export type CreateMatchEventInput = {
  kind: MatchEventKind;
  nx: number;
  ny: number;
  half: 1 | 2;
  timestamp: number;
  id?: string;
};

function newMatchEventId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createMatchEvent(input: CreateMatchEventInput): MatchEvent {
  return {
    id: input.id ?? newMatchEventId(),
    kind: input.kind,
    nx: clamp01(input.nx),
    ny: clamp01(input.ny),
    half: input.half,
    timestamp: input.timestamp,
  };
}
