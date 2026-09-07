import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../core/stats/stats-event-model";
import { isFreeMiss, isFreeScore } from "./eventSource";
import { deriveSegmentFromPeriodClock, periodFromHalf } from "./statsSegments";
import type { ReviewEventFilters, ReviewSelectableEvent } from "./review-types";

export function normalizeReviewEventTeamSide(event: ReviewSelectableEvent): "FOR" | "OPP" {
  if (event.teamSide === "FOR" || event.teamSide === "OPP") return event.teamSide;
  if (event.teamSide === "own") return "FOR";
  if (event.teamSide === "opposition") return "OPP";
  if (event.team === "AWAY" || event.id.startsWith("team-away-")) return "OPP";
  return "FOR";
}

function resolveReviewEventPeriod(event: ReviewSelectableEvent): MatchEventPeriod {
  return event.period ?? periodFromHalf(event.half);
}

function resolveReviewEventSegment(event: ReviewSelectableEvent): MatchEventSegment {
  if (event.segment != null) return event.segment;
  const eventClockSeconds = event.matchClockSeconds ?? event.matchTimeSeconds ?? event.timestamp;
  return deriveSegmentFromPeriodClock(resolveReviewEventPeriod(event), eventClockSeconds);
}

function getCategoryKinds<TCategory extends string>(
  category: TCategory,
  categoryKinds: ReviewEventFilters<TCategory>["categoryKinds"],
): readonly MatchEventKind[] | null {
  if (category === "ALL" || category === "PLAYERS") return null;
  return categoryKinds[category as Exclude<TCategory, "ALL" | "PLAYERS">] ?? null;
}

function isFreeRelatedEvent(event: ReviewSelectableEvent): boolean {
  return (
    event.kind === "FREE_WON" ||
    event.kind === "FREE_CONCEDED" ||
    isFreeScore(event) ||
    isFreeMiss(event)
  );
}

export function selectReviewEvents<TEvent extends ReviewSelectableEvent, TCategory extends string>(
  events: readonly TEvent[],
  filters: ReviewEventFilters<TCategory>,
): TEvent[] {
  const {
    half,
    segment,
    teamSide,
    category,
    categoryKinds,
    activePlayerId = null,
    activePlayerOnly = activePlayerId != null,
    zone = "FULL",
    attackingDirection = "RIGHT",
  } = filters;
  const teamSideFilter = teamSide === "FOR" || teamSide === "OPP" ? teamSide : null;
  const categoryKindList = getCategoryKinds(category, categoryKinds);
  const filterKinds = categoryKindList == null ? null : new Set<MatchEventKind>(categoryKindList);
  const segmentFilter = segment === "ALL" ? null : Number(segment.slice(1));

  return events.filter((event) => {
    if (event.id.includes("-instant-score-")) return false;

    const eventPeriod = resolveReviewEventPeriod(event);
    const eventSegment = resolveReviewEventSegment(event);

    if (half === "H1" && eventPeriod !== "1H") return false;
    if (half === "H2" && eventPeriod !== "2H") return false;
    if (segmentFilter != null && eventSegment !== segmentFilter) return false;

    if (filterKinds && !filterKinds.has(event.kind)) return false;
    if (category === "FREES" && !isFreeRelatedEvent(event)) return false;
    if (category === "PLAYERS" && event.playerId == null && event.playerName == null) return false;

    const eventTeamSide = normalizeReviewEventTeamSide(event);
    const isForEvent = eventTeamSide === "FOR";
    const isOppositionEvent = eventTeamSide === "OPP";
    const isInferredOppositionEvent =
      isForEvent &&
      (event.kind === "TURNOVER_LOST" || event.kind === "KICKOUT_CONCEDED" || event.kind === "FREE_CONCEDED");
    // Symmetric counterpart of isInferredOppositionEvent above: a restart
    // "owner" (see resolveRestartOutcome, pro-tagger-adapter.ts) can lose
    // their own kickout/45/sideline to the other side, which is recorded as
    // a *_CONCEDED event tagged under the OWNER's side, not the side that
    // actually won it. When the owner is OPP, that CONCEDED event is tagged
    // OPP even though FOR is the side that benefited (won back the
    // opposition's own restart) — without this, that event is invisible
    // under the FOR filter (audit: "winning back the opposition's own
    // kickout can disappear when filtering Review to your own team").
    // Turnovers/frees have no such owner concept (a single tap fully
    // determines both sides — see pro-tagger-adapter.ts), so there is no
    // OPP-tagged equivalent to infer FOR from for those kinds.
    const isInferredForEvent =
      isOppositionEvent &&
      (event.kind === "KICKOUT_CONCEDED" ||
        event.kind === "FORTY_FIVE_CONCEDED" ||
        event.kind === "SIDELINE_CONCEDED");

    if (teamSideFilter != null) {
      if (teamSideFilter === "FOR" && !isForEvent && !isInferredForEvent) return false;
      if (teamSideFilter === "OPP" && !isOppositionEvent && !isInferredOppositionEvent) return false;
    }

    if (teamSideFilter === "OPP" && category !== "ALL" && category !== "PLAYERS") {
      if (category === "TURNOVERS") {
        if (!(event.kind === "TURNOVER_LOST" || (isOppositionEvent && event.kind === "TURNOVER_WON"))) return false;
      }
      if (category === "KICKOUTS") {
        if (!(event.kind === "KICKOUT_CONCEDED" || (isOppositionEvent && event.kind === "KICKOUT_WON"))) return false;
      }
      if (category === "FREES") {
        if (
          !(
            event.kind === "FREE_CONCEDED" ||
            (isOppositionEvent &&
              (event.kind === "FREE_WON" || event.kind === "FREE_SCORED" || event.kind === "FREE_MISSED"))
          )
        ) {
          return false;
        }
      }
    }

    // No FOR-side mirror of the OPP category-narrowing block above: that
    // block's FREES case narrows to a literal kind list, which is stricter
    // than isFreeRelatedEvent (line ~72) and would incorrectly exclude a
    // free-sourced GOAL/POINT/TWO_POINTER event — already correctly visible
    // under the FOR filter via the base isForEvent check above — merely
    // because it isn't FREE_WON/FREE_CONCEDED/FREE_SCORED/FREE_MISSED. The
    // base-level isForEvent / isInferredForEvent check already produces the
    // correct KICKOUTS/TURNOVERS/FREES membership for FOR with the
    // categoryKinds sets Event Stats and Rapid Capture actually pass (both
    // narrow enough that this block would only ever restate what the base
    // check already decided) — so no additional narrowing is needed, and
    // adding one here would only risk a regression for no behavioural gain.

    if (activePlayerOnly && activePlayerId != null && event.playerId !== activePlayerId) return false;

    const eventX = event.x ?? event.nx;
    const isAttackingHalf = attackingDirection === "RIGHT" ? eventX >= 0.5 : eventX < 0.5;
    if (zone === "OWN_HALF" && isAttackingHalf) return false;
    if (zone === "OPPOSITION_HALF" && !isAttackingHalf) return false;

    return true;
  });
}

/**
 * Returns only restart events (KICKOUT_WON / KICKOUT_CONCEDED) owned by `owner`.
 *
 * Ownership = who physically took the restart:
 *   V1.2+  → event.restartOwner (explicit, mutually exclusive)
 *   Legacy → event.teamSide (kicker always logged under their own teamSide)
 *
 * FOR ownership IDs ∩ OPP ownership IDs = empty by construction.
 * Safe to call before selectReviewEvents; pass the result with teamSide:"ALL".
 */
export function selectRestartEventsByOwner<TEvent extends ReviewSelectableEvent>(
  events: readonly TEvent[],
  owner: "FOR" | "OPP",
  half?: "H1" | "H2",
): TEvent[] {
  return events.filter((event) => {
    if (event.kind !== "KICKOUT_WON" && event.kind !== "KICKOUT_CONCEDED") return false;
    if (event.id.includes("-instant-score-")) return false;
    if (half === "H1" && resolveReviewEventPeriod(event) !== "1H") return false;
    if (half === "H2" && resolveReviewEventPeriod(event) !== "2H") return false;
    if (event.restartOwner === "FOR" || event.restartOwner === "OPP") {
      return event.restartOwner === owner;
    }
    return normalizeReviewEventTeamSide(event) === owner;
  });
}
