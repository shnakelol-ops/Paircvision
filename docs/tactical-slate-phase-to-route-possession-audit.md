# PáircVision — Tap Pass at the Phase→Route Boundary: Feasibility + Removal Plan

**Status:** Audit only. No code changes made. Scoped exactly to the question asked: can Tap Pass defer possession until the receiver's Phase→Route boundary, instead of RouteEntry Boundary Pass's Route→Route boundary — and if yes, which functions change and what gets removed.

---

## 1. Can the existing Tap Pass defer possession until the Phase→Route boundary? Yes.

Confirmed against the code, and it turns out to be a **cleaner** mechanism than RouteEntry Boundary Pass, not a harder one — for a specific, verifiable reason: the target the ball needs to reach is a **moving** receiver (already animating along their Draw Run by the time the ball needs to catch up), and there is an existing, already-built, already-tuned, already screen-verified primitive for exactly that: `stepBallTowardLiveTarget()`. RouteEntry Boundary Pass couldn't use that primitive because its target (a receiver standing still between two runs) was stationary, and that function's lead-capped smoothing converges to a stationary point in well under 200ms regardless of distance — it reads as a snap for a still target. A **moving** target is exactly the case that function was built for; it's the same math that already made the "During Run" chase look correct earlier in this project.

### The one real gap, found by checking rather than assuming

Attaching the ball at the Phase→Route boundary and just letting the existing per-frame ball-follow do its thing does **not** work as-is — verified directly, not assumed. `stepBasicRouteFollow()`'s per-player loop calls `updateAttachedBallsForPlayer(player.id)` every tick for a route-controlled player's ball, and that function (`:1947`) always calls `applyBallRuntimeStateToItem()` (`:1778`), which is an unconditional **hard snap** — `item.x = attachedPoint.x; item.y = attachedPoint.y;`, no interpolation, every single frame, everywhere it's used (ordinary route-follow, player drag, all of it). If the ball is simply marked attached the instant the boundary fires, the very next frame would teleport it straight to the receiver's current position — the same "instant transfer" problem this whole line of work exists to remove, just moved to a new trigger point again.

`stepBallTowardLiveTarget()` (`:3684`) — the function that *does* glide toward a moving point with lead-capped smoothing — has exactly one call site today, inside `stepPlayback()`'s phase-to-phase ball-transition loop (`:3796`), reached only when a *captured Phase* records an attach-target change to a route-controlled receiver. It is not wired into `stepBasicRouteFollow()`'s ordinary per-frame ball-follow at all. That's the actual gap: not "build a new travel mechanism" (as RouteEntry Boundary Pass needed), but "route the *existing* travel mechanism into the *existing* per-frame route-follow ball update, for a ball that's mid-chase."

## 2. Exactly which functions change

| Function | Change |
|---|---|
| `handlePossessionPassTap` | Replace the RouteEntry-Boundary-Pass branch (`receiverEntries.length >= 2`) with: if the receiver is not currently route-controlled and has at least one authored, not-yet-started `RouteEntry`, register a pending Phase→Route pass — `{ ballItemId }`, keyed by receiver id. No entry reference needed at all (unlike RouteEntry Boundary Pass, which had to pin two specific entries) — the trigger is simply "the next time this player becomes route-controlled," not tied to a particular entry. |
| `startRoutesForResolvedSegment` | At the point where a newly-due entry adds its player to `routeControlledPlayerIds`, check: was this player *not already* in that set (i.e. this is genuinely their Phase→Route transition, not a later entry for an already-running player) and is there a pending Phase→Route pass for them? If so, consume the registration and mark the ball as "chasing" this player (a small piece of runtime state, not a new scheduling gate — the entry itself starts on schedule, completely unaffected). Also: drop the now-obsolete `isBoundaryGatedEntryId` due-scan check entirely — nothing needs to be withheld from this scheduler anymore, which simplifies this function back toward its pre-RouteEntry-Boundary-Pass shape. |
| `stepBasicRouteFollow` | Where it currently calls `updateAttachedBallsForPlayer(player.id)` unconditionally for a route-controlled player, branch: if this player's ball is in "chasing" state, step it with `stepBallTowardLiveTarget()` against the player's current live position instead, and clear the chase flag once it reports arrival (after which ordinary hard-snap follow is correct again, since the ball has caught up). `updateAttachedBallsForPlayer` itself is untouched — this is a per-call-site branch, not a change to shared, widely-used follow behavior (player drag, etc. must keep snapping). |
| `maybeCompletePlayback` | No change needed. Unlike RouteEntry Boundary Pass, nothing here blocks or defers the route's own scheduling, so `activeRouteRunsByPlayerId.size` already correctly reflects whether anything is still animating. (The `activeBoundaryPassFlights.size > 0` clause added for RouteEntry Boundary Pass gets deleted along with everything else in §3, not replaced.) |
| `attachPrimaryBallToPlayer` / `applyBallAttachToPlayer` | The split introduced for RouteEntry Boundary Pass stays — this mechanism also needs to attach the ball mid-Play, bypassing the interactive lock guard, for the same reason. Only the invalidation line (currently `pendingBoundaryPassesByReceiverId.delete(player.id)`) is repointed at the new, smaller pending-pass map. |
| Cleanup call sites (`cancelBasicRouteFollow`, `clearRouteAssignments`, `removeLastTacticalPlayer`, `startPlayback`) | Same shape as before — clear the new (smaller) pending/chasing state at the same points the equivalent RouteEntry-Boundary-Pass state was cleared — but the state itself is simpler (no entry-index bookkeeping). |
| Persistence (`TacticalBoardState`, `captureBoardState`, `importBoardState`, a sanitizer) | A new, smaller additive field — just `{ ballItemId, receiverPlayerId }[]`, no entry indices needed since there's no specific entry to re-resolve on import (the trigger is generic "next time this player starts a route"), simpler than RouteEntry Boundary Pass's persistence. |

## 3. Exactly what gets removed (RouteEntry Boundary Pass)

Enumerated directly against the current file, not from memory:

- Types: `PendingBoundaryPass` (`:407`), `ActiveBoundaryPassFlight` (`:422`), `SanitizedPossessionBoundaryPass` (`:825`).
- `sanitizeBoardPossessionBoundaryPasses()` (`:834`) and the `possessionBoundaryPasses?: unknown` field on `TacticalBoardState` (`:150`).
- State: `pendingBoundaryPassesByReceiverId`, `activeBoundaryPassFlights` (`:1574-1575`).
- `isBoundaryGatedEntryId()` (`:1580`).
- The `receiverEntries.length >= 2` branch in `handlePossessionPassTap` (`:1885-1917` area) — replaced by the new registration logic in §2, not left in place alongside it.
- `tryStartBoundaryPassFlight()` (`:3879`).
- `stepBoundaryPassFlights()` (`:3910`) and its call in the ticker (`:4820`).
- `resolveBoundaryPassArrival()` (`:3947`).
- The `activeBoundaryPassFlights.size > 0` clause in `maybeCompletePlayback` (`:3501`).
- The `activeBoundaryPassFlights = new Map();` reset in `startPlayback` (`:3540`) and the `activeBoundaryPassFlights.clear();` in `cancelBasicRouteFollow` (`:3278`) — replaced by equivalent resets for the new, smaller state.
- The `pendingBoundaryPassesByReceiverId.clear()` in `clearRouteAssignments` (`:3384`), the `.delete(removedPlayer.id)` and active-flight cleanup loop in player removal (`:4658, 4674-4676`) — replaced by equivalent hooks for the new map.
- The `captureBoardState` serialization block (`:4354`) and the `importBoardState` reconstruction block (`:4428, 4530-4537`).

**What does *not* get removed:** `resolvePossessionPassDurationMsForDistance()` (`:3706`) — this was extracted from `resolvePossessionPassSegmentDurationMs` as a clean, behavior-preserving refactor that ordinary/instant Tap Pass still depends on today; it was never RouteEntry-Boundary-Pass-specific and removing it would break the existing instant-pass flight. `stepBallTowardLiveTarget()` and its one existing call site inside `stepPlayback()` are also untouched — the new mechanism adds a second call site, it doesn't modify the function or its current use.

## 4. Estimate

Smaller than RouteEntry Boundary Pass, for three concrete reasons, not just a general impression: no new sub-animation system (`stepBallTowardLiveTarget` is reused verbatim, already tuned, already verified via the historical "During Run" recordings); no entry-index persistence (the pending declaration references a player and a ball, not two specific `RouteEntry` positions); no scheduling-gate logic (`isBoundaryGatedEntryId` and its due-scan check disappear entirely rather than being replaced by an equivalent). Net, this removes more lines than it adds.

**Rough size: half a day to three-quarters of a day** of engine work — smaller than the ~1.5–2 days RouteEntry Boundary Pass ended up being once the "no teleport" requirement was factored in — plus a manual verification pass to the same standard as the rest of this line of work (confirm the ball stays exactly put while the receiver runs A→B, starts closing the gap the instant their Draw Run begins, and visibly chases rather than snaps once caught up).
