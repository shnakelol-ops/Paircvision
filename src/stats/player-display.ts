/**
 * Returns the best display string for a player in exported reviews.
 *
 * A name is treated as real when it is:
 *   - non-empty / non-whitespace
 *   - not the auto-generated "#N" placeholder the player picker writes for unnamed slots
 *   - not a known demo/test name (case-insensitive exact match on the full trimmed value)
 *
 * In all other cases the function falls back to the jersey-number format (#N or "—").
 */

// Names that are known to have been entered as quick test/demo values.
// Only the exact trimmed string is checked (case-insensitive), so "Dave Clifford"
// is NOT blocked — only the bare single-word test value "dave" is.
const DEMO_PLAYER_NAMES = new Set(["dave", "bill"]);

export function resolvePlayerDisplayName(
  name: string | null | undefined,
  number: number | null | undefined,
): string {
  const numStr = typeof number === "number" && isFinite(number) ? `#${number}` : "—";
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || /^#\d+$/.test(trimmed)) return numStr;
  if (DEMO_PLAYER_NAMES.has(trimmed.toLowerCase())) return numStr;
  return trimmed;
}

// ─── Shared player identity keying ────────────────────────────────────────────
//
// A single real player can be tagged two ways across a match: sometimes via
// the player picker (event carries playerId, usually alongside playerName),
// sometimes via a number-only quick-tag (event carries only playerNumber).
// Every surface that groups events by player — Player Breakdown, Player
// Influence, the scoring ledger's HT tile, any generated insight — must
// collapse both tagging styles into the SAME row, or a coach sees the same
// person split into a "name" row and a "#N" row with different partial
// stats. This pair of helpers is the one identity-resolution path every
// such surface should route through, alongside resolvePlayerDisplayName
// above for the final display string.

export type PlayerIdentityEvent = {
  teamSide: "FOR" | "OPP";
  playerId?: string | null;
  playerNumber?: number | null;
};

/**
 * Scans events once to learn which team-scoped jersey numbers belong to
 * which playerId, from any event that happens to carry both. Pass the
 * result to resolvePlayerIdentityKey so a later number-only event for the
 * same player resolves to the identity already established, instead of
 * starting a new, unnamed fragment.
 */
export function buildPlayerNumberAliasMap<TEvent extends PlayerIdentityEvent>(
  events: readonly TEvent[],
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const e of events) {
    if (e.playerId != null && e.playerNumber != null) {
      aliasMap.set(`__num_${e.teamSide}_${e.playerNumber}`, e.playerId);
    }
  }
  return aliasMap;
}

/**
 * Resolves the canonical grouping key for one event: an explicit playerId
 * always wins; a number-only event resolves through the alias map (built by
 * buildPlayerNumberAliasMap) so it lands on the same key as any playerId
 * event for that team+number, falling back to a raw team-scoped number key
 * only when no such alias exists (a player never given an id this match).
 */
export function resolvePlayerIdentityKey<TEvent extends PlayerIdentityEvent>(
  event: TEvent,
  aliasMap: ReadonlyMap<string, string>,
): string | null {
  if (event.playerId != null) return event.playerId;
  if (event.playerNumber != null) {
    const numKey = `__num_${event.teamSide}_${event.playerNumber}`;
    return aliasMap.get(numKey) ?? numKey;
  }
  return null;
}
