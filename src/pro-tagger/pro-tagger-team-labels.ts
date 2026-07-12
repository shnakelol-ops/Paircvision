import type { ProTaggerFamilyId } from "./pro-tagger-families";
import { getRestartTerm, tileNeedsOppositionAttribution } from "./pro-tagger-families";
import type { ProTaggerSport } from "./pro-tagger-session";

// Display-only helpers for naming teams unambiguously in the Turnover and
// Restart (Kickout/Puckout) family cards and the pending-event summary bar.
// Nothing here touches teamSide, restartOwner, the stored tile value/tag,
// or any adapter/event-model behaviour.

const SHORT_NAME_MAX_LENGTH = 14;

/** Trims a team name and falls back to a placeholder if it's blank. */
export function resolveTeamDisplayName(teamName: string, fallback: string): string {
  const trimmed = teamName.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * A compact team name safe to prefix onto a button label (e.g.
 * "Ballylanders HP Error") without causing overflow or excessive shrinking.
 * Long names are cut at the last whole word within the limit rather than
 * mid-word; this only affects the display string, never stored match data.
 */
export function getShortTeamName(teamName: string, fallback = "Home"): string {
  const resolved = resolveTeamDisplayName(teamName, fallback);
  if (resolved.length <= SHORT_NAME_MAX_LENGTH) return resolved;

  const cut = resolved.slice(0, SHORT_NAME_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > 3 ? cut.slice(0, lastSpace) : cut;
  return safe.trim();
}

export type PendingWinnerSummaryInput = {
  familyId: ProTaggerFamilyId;
  tileLabel: string;
  teamSide: "FOR" | "OPP";
  restartOwner?: "FOR" | "OPP";
  sport: ProTaggerSport;
  homeTeamName: string;
  awayTeamName: string;
};

/**
 * Builds a plain-English "who won" sentence for the Turnover and Restart
 * families only (e.g. "Rathkeale won turnover · Ballylanders HP Error",
 * "Ballylanders won their kickout · Break"). Returns null for every other
 * family, so callers fall back to their existing summary rendering.
 */
export function buildPendingWinnerSummary(input: PendingWinnerSummaryInput): string | null {
  const home = resolveTeamDisplayName(input.homeTeamName, "Home");
  const away = resolveTeamDisplayName(input.awayTeamName, "Away");
  const winner = input.teamSide === "FOR" ? home : away;

  if (input.familyId === "TURNOVER") {
    const needsAttribution =
      input.teamSide === "OPP" &&
      tileNeedsOppositionAttribution(input.familyId, input.tileLabel, input.sport);
    const tileText = needsAttribution
      ? `${getShortTeamName(input.homeTeamName, "Home")} ${input.tileLabel}`
      : input.tileLabel;
    return `${winner} won turnover · ${tileText}`;
  }

  if (input.familyId === "RESTART") {
    const term = getRestartTerm(input.sport).toLowerCase();
    const ownerWord = input.restartOwner === "OPP" ? "their" : "our";
    return `${winner} won ${ownerWord} ${term} · ${input.tileLabel}`;
  }

  return null;
}
