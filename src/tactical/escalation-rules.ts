// Pressure accumulation thresholds and decay constants.
// All values are in seconds unless noted.

export const PRESSURE_WINDOW_SECONDS = 240; // 4-minute rolling window

export const ESCALATION_THRESHOLDS = {
  yellow: 3, // 3 events in window → yellow (early warning, surfaced)
  amber:  4, // 4 events in window → amber (developing threat)
  red:    5, // 5+  events in window → red (significant tactical concern)
} as const;

export type EscalationLevel = 0 | 1 | 2 | 3;
// 0 = neutral, 1 = yellow, 2 = amber, 3 = red

export function countToEscalation(count: number): EscalationLevel {
  if (count >= ESCALATION_THRESHOLDS.red)    return 3;
  if (count >= ESCALATION_THRESHOLDS.amber)  return 2;
  if (count >= ESCALATION_THRESHOLDS.yellow) return 1;
  return 0;
}
