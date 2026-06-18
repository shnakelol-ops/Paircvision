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
