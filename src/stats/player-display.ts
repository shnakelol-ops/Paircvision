/**
 * Returns the best display string for a player in exported reviews.
 *
 * A name is treated as real when it is non-empty and is not the auto-generated
 * "#N" placeholder that the player picker writes for unnamed squad slots.
 * In all other cases the function falls back to the jersey-number format.
 */
export function resolvePlayerDisplayName(
  name: string | null | undefined,
  number: number | null | undefined,
): string {
  const numStr = typeof number === "number" && isFinite(number) ? `#${number}` : "—";
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || /^#\d+$/.test(trimmed)) return numStr;
  return trimmed;
}
