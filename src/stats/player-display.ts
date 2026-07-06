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
 * A squad roster entry — the GUARANTEED bridge between a jersey number and
 * a playerId, because a roster row always carries id + number + name
 * together, unlike a logged event which may carry only one or two of them.
 */
export type PlayerRosterEntry = {
  id: string;
  number: number;
  name: string;
};

export type TeamRoster<TEntry extends PlayerRosterEntry = PlayerRosterEntry> = {
  teamSide: "FOR" | "OPP";
  players: readonly TEntry[];
};

/**
 * Scans squad rosters (when supplied) and events to learn which team-scoped
 * jersey numbers belong to which playerId. Rosters seed the map FIRST and
 * are never overwritten — they're the guaranteed bridge. Events only
 * augment the map for players missing from any roster (e.g. an opposition
 * team with no squad uploaded), and only where a bridging event happens to
 * carry both playerId and playerNumber together.
 *
 * Do not rely on events alone: a coach who exclusively quick-tags by number
 * for one player and exclusively uses the picker for another may never log
 * a single event carrying both fields for the quick-tagged player — the
 * roster is the only place that link exists.
 *
 * Pass the result to resolvePlayerIdentityKey so a number-only event for a
 * known player resolves to the identity already established, instead of
 * starting a new, unnamed fragment.
 */
export function buildPlayerNumberAliasMap<TEvent extends PlayerIdentityEvent>(
  events: readonly TEvent[],
  rosters?: readonly TeamRoster[],
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  if (rosters) {
    for (const roster of rosters) {
      for (const p of roster.players) {
        aliasMap.set(`__num_${roster.teamSide}_${p.number}`, p.id);
      }
    }
  }
  for (const e of events) {
    if (e.playerId != null && e.playerNumber != null) {
      const numKey = `__num_${e.teamSide}_${e.playerNumber}`;
      if (!aliasMap.has(numKey)) aliasMap.set(numKey, e.playerId);
    }
  }
  return aliasMap;
}

/**
 * Builds a playerId → roster entry lookup from one or more team rosters.
 * Used to resolve a player's name/number even when no individual event for
 * them ever carries a name — the roster is authoritative once present.
 */
export function buildPlayerRosterLookup(
  rosters: readonly TeamRoster[],
): Map<string, PlayerRosterEntry> {
  const lookup = new Map<string, PlayerRosterEntry>();
  for (const roster of rosters) {
    for (const p of roster.players) {
      if (p.name.trim()) lookup.set(p.id, p);
    }
  }
  return lookup;
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
