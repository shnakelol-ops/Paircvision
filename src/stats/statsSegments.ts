export type StatsPeriod = "1H" | "2H";
export type StatsSegment = 1 | 2 | 3 | 4 | 5 | 6;

const SEGMENT_DURATION_SECONDS = 10 * 60;

function clampClockSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function deriveSegmentFromPeriodClock(
  period: StatsPeriod,
  matchClockSeconds: number,
): StatsSegment {
  const clock = clampClockSeconds(matchClockSeconds);
  const halfSegment = clock < SEGMENT_DURATION_SECONDS ? 1 : clock < SEGMENT_DURATION_SECONDS * 2 ? 2 : 3;
  if (period === "1H") return halfSegment;
  return (halfSegment + 3) as StatsSegment;
}

export function periodFromHalf(half: 1 | 2): StatsPeriod {
  return half === 1 ? "1H" : "2H";
}

export function halfFromPeriod(period: StatsPeriod): 1 | 2 {
  return period === "2H" ? 2 : 1;
}

// ─── Second-half clock rebase ──────────────────────────────────────────────────
//
// deriveSegmentFromPeriodClock expects a HALF-RELATIVE clock (0–1800s for a
// 30-minute half). Capture (pro-tagger-adapter.ts) instead passed the
// absolute match clock for 2H events — which continues counting up from 1H
// (e.g. 2001–4023s for a 30-minute half) — so every 2H event's clock was
// always >= 1200s and clamped to halfSegment 3 (segment 6). The functions
// below derive the correct segment by rebasing the 2H clock against the
// actual recorded second-half start (the earliest 2H event's clock), never
// against halfDurationMinutes * 60 — the recorded second half does not
// necessarily start exactly on that boundary.

export type SegmentClockEvent = {
  period?: StatsPeriod | null;
  half?: 1 | 2 | null;
  matchClockSeconds?: number | null;
  matchTimeSeconds?: number | null;
  timestamp?: number | null;
};

function resolveClockEventPeriod(event: SegmentClockEvent): StatsPeriod {
  if (event.period === "1H" || event.period === "2H") return event.period;
  return event.half === 2 ? "2H" : "1H";
}

function resolveClockSeconds(event: SegmentClockEvent): number {
  const raw = event.matchClockSeconds ?? event.matchTimeSeconds ?? event.timestamp ?? 0;
  return clampClockSeconds(typeof raw === "number" ? raw : 0);
}

/**
 * Finds the absolute-clock offset at which the second half actually began,
 * from the minimum recorded clock among the match's 2H events. Returns null
 * when the match has no 2H events (nothing to rebase).
 */
export function resolveSecondHalfStartOffsetSeconds<TEvent extends SegmentClockEvent>(
  events: readonly TEvent[],
): number | null {
  let min: number | null = null;
  for (const event of events) {
    if (resolveClockEventPeriod(event) !== "2H") continue;
    const clock = resolveClockSeconds(event);
    if (min === null || clock < min) min = clock;
  }
  return min;
}

/**
 * Derives the correct segment for a single event given the match's resolved
 * second-half start offset (from resolveSecondHalfStartOffsetSeconds).
 */
export function deriveRebasedSegment<TEvent extends SegmentClockEvent>(
  event: TEvent,
  secondHalfStartOffsetSeconds: number | null,
): StatsSegment {
  const period = resolveClockEventPeriod(event);
  const clock = resolveClockSeconds(event);
  const offset = period === "2H" ? (secondHalfStartOffsetSeconds ?? 0) : 0;
  const halfClockSeconds = Math.max(0, clock - offset);
  return deriveSegmentFromPeriodClock(period, halfClockSeconds);
}

/**
 * Rebases segment and halfSegment for every event in a match in one pass,
 * deriving fresh from the clock rather than trusting any stored
 * segment/halfSegment field. Matches captured before the second-half
 * clock-rebase fix have poisoned segment/halfSegment values (every 2H event
 * clamped to segment 6, halfSegment 3); calling this once at read time
 * repairs them without a data migration.
 */
export function rebaseEventSegments<
  TEvent extends SegmentClockEvent & { segment?: StatsSegment | null; halfSegment?: 1 | 2 | 3 | null },
>(events: readonly TEvent[]): TEvent[] {
  const offset = resolveSecondHalfStartOffsetSeconds(events);
  return events.map((event) => {
    const segment = deriveRebasedSegment(event, offset);
    const halfSegment = (((segment - 1) % 3) + 1) as 1 | 2 | 3;
    return { ...event, segment, halfSegment };
  });
}
