// Types for the laboratory's independent reference (scripts/reference-kickout-phase.mjs), used by
// the engine laboratory to compute a reduced ledger without events the app could not record.
export function authoritativeLedger(fx: unknown, original?: unknown): { ledger: Record<string, any>; facts: unknown[]; restartsFull: unknown };
