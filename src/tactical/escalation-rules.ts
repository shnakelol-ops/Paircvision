// Pressure accumulation thresholds and decay constants.
// All values are in seconds unless noted.

export const PRESSURE_WINDOW_SECONDS = 240; // 4-minute rolling window

export const ESCALATION_THRESHOLDS = {
  notable: 2, // 2–3 events in window → notable
  amber:   4, // 4–5 events in window → amber
  red:     6, // 6+  events in window → red
} as const;

export type EscalationLevel = 0 | 1 | 2 | 3;
// 0 = neutral, 1 = notable, 2 = amber, 3 = red

export function countToEscalation(count: number): EscalationLevel {
  if (count >= ESCALATION_THRESHOLDS.red)     return 3;
  if (count >= ESCALATION_THRESHOLDS.amber)   return 2;
  if (count >= ESCALATION_THRESHOLDS.notable) return 1;
  return 0;
}
