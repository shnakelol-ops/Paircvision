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
