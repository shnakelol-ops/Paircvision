/**
 * pro-tagger-discipline.ts
 *
 * Sport mode decides which sanctions exist. Event history decides each
 * player's current state. PáircVision records the sanction the analyst
 * selected — it does not adjudicate whether the referee was correct to
 * issue it (foul location, goal-scoring opportunity, dissent, age grade,
 * competition rule, etc. are all deliberately out of scope).
 */
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { MatchEventPeriod } from "../core/stats/stats-event-model";
import type { ProTaggerSport } from "./pro-tagger-session";

/**
 * The Discipline sanction kinds this file cares about. Values match the
 * corresponding MATCH_EVENT_KINDS entries exactly (see stats-event-model.ts)
 * so callers can compare event.kind against them directly.
 */
export type ProTaggerDisciplineCardKind = "YELLOW_CARD" | "SIN_BIN" | "RED_CARD";

/**
 * Sin Bin duration in match-clock seconds (10 minutes) — the current GAA
 * Black Card / Sin Bin sanction length. Only meaningful for sports whose
 * getDisciplineOptions() includes "SIN_BIN".
 */
export const SIN_BIN_DURATION_SECONDS = 600;

/**
 * Which Discipline sanctions exist for a given sport. The UI must render
 * only what this returns — a sanction not listed here simply doesn't exist
 * in the Discipline menu, disabled or otherwise.
 *
 * Camogie does not automatically inherit Sin Bin merely because Football
 * has one. Hurling currently ships Yellow/Red only — no confirmed product
 * ruleset for Sin Bin/Black Card in Hurling exists yet; flip this one entry
 * on when that's established, no other change needed.
 */
export function getDisciplineOptions(sport: ProTaggerSport): readonly ProTaggerDisciplineCardKind[] {
  if (sport === "gaelic" || sport === "ladies_football") {
    return ["YELLOW_CARD", "SIN_BIN", "RED_CARD"];
  }
  return ["YELLOW_CARD", "RED_CARD"];
}

export type DisciplinePlayerStatus = "RED" | "SIN_BIN";

/**
 * Derives each player's current Discipline status purely from logged
 * events — no independent mutable state, so Undo, active-match reload, and
 * restored match state all just work by re-deriving from the same array.
 *
 * Keyed by playerId (globally unique across both squads), so Home #12 and
 * Away #12 never collide even though buildDisciplineStatusMap scans both
 * teams' events in one pass.
 *
 * Red always takes precedence over an active Sin Bin — "Yellow → Red" and
 * "Sin Bin → Red" both resolve to RED, with no Sin Bin status surviving
 * alongside it.
 *
 * Sin Bin expiry is only ever computed by real elapsed time within the SAME
 * period the sanction was issued in (matchClockSeconds resets to 0 at
 * second-half start, so it is not safely comparable across periods, and
 * halfDurationMinutes is scheduled length, not actual elapsed-with-stoppage
 * time, so it is not a safe bridge either).
 *
 * Once the match moves to a different period than the sanction's, this
 * function keeps that player marked SIN_BIN indefinitely rather than
 * attempt to auto-clear it — deliberately erring toward over-showing a
 * sanction rather than silently and possibly wrongly clearing a real one
 * the moment the period changes. This mirrors the real rule (a served
 * sanction doesn't reset just because the teams change ends) but is a
 * documented approximation: a sin bin that had already unambiguously
 * expired earlier within its own period, before the period ended, will
 * still show as active after the period changes, because this function has
 * no reliable way to know exactly when that period ended. Cleared only by
 * a Red Card for that player or by Undo removing the event — never by time
 * alone once the period boundary has been crossed.
 */
export function buildDisciplineStatusMap(
  events: readonly LoggedMatchEvent[],
  currentPeriod: MatchEventPeriod,
  currentClockSeconds: number,
): Map<string, DisciplinePlayerStatus> {
  const status = new Map<string, DisciplinePlayerStatus>();

  for (const event of events) {
    if (!event.playerId) continue;
    if (event.kind === "RED_CARD") {
      status.set(event.playerId, "RED");
      continue;
    }
    if (event.kind === "SIN_BIN") {
      if (status.get(event.playerId) === "RED") continue; // Red already wins for this player
      const withinIssuingPeriod = event.period === currentPeriod;
      const elapsed = currentClockSeconds - (event.matchClockSeconds ?? 0);
      const active = withinIssuingPeriod && elapsed >= 0 && elapsed < SIN_BIN_DURATION_SECONDS;
      // Once the match has moved past the sanction's own period, treat it
      // as still active indefinitely (safe fallback — never auto-expire
      // across an ambiguous period boundary).
      const stillActive = active || !withinIssuingPeriod;
      if (stillActive) status.set(event.playerId, "SIN_BIN");
      else status.delete(event.playerId);
    }
  }

  return status;
}
