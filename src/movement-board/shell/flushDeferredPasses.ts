export type DeferredPass = { fromPlayerId: string; toPlayerId: string };

/**
 * Splits `queue` by `receivingPlayerId`:
 *   - `toFire`   — the first eligible pass to start animating now (null if none)
 *   - `remaining` — everything else, with any un-fired eligible passes appended at
 *                   the tail so they fire the next time this player receives the ball.
 *
 * Keeping only one pass in-flight at a time matches the single-slot `activeBallPass`
 * constraint. Extras are NOT discarded — they re-enter the queue for the next landing.
 */
export function flushDeferredPasses(
  queue: DeferredPass[],
  receivingPlayerId: string,
): { toFire: DeferredPass | null; remaining: DeferredPass[] } {
  const eligible: DeferredPass[] = [];
  const others = queue.filter(p => {
    if (p.fromPlayerId === receivingPlayerId) { eligible.push(p); return false; }
    return true;
  });
  if (eligible.length === 0) return { toFire: null, remaining: others };
  return {
    toFire: eligible[0],
    remaining: eligible.length > 1 ? [...others, ...eligible.slice(1)] : others,
  };
}
