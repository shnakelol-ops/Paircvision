# PáircVision — Tap Pass at a RouteEntry Boundary: Playback-Semantics Audit

**Status:** Audit only. No code changes. Scoped narrowly to the question asked: is the boundary between two `RouteEntry` items (from Multiple Draw Runs) a viable possession-transfer trigger, purely as a playback-engine question — not a UI or Continue Run redesign.

**Framing correction from the prior audit, stated up front:** the previous Tap-Pass-semantics audit analyzed this same idea against *Continue Run* (one entry, appended-to), and found it broke because Continue Run's append model has no internal boundary — the entry just keeps growing. This audit is a genuinely different case: **Run 1 and Run 2 here are New Run and New Run** — i.e. two separate, sibling `RouteEntry` records for the same player, not one entry extended by Continue Run. That changes the answer materially, because a real boundary between two independent entries already exists as *data* today. The open question is whether it exists as a *trigger*.

---

## The direct answer

**As data, yes — the boundary is real, and it's the right primitive.** As a *trigger the scheduler currently listens to*, **no — it doesn't exist today.** The engine has exactly one thing that starts any route animating, and RouteEntry completion isn't it.

## Verifying this directly against the code, not from memory

`RouteEntry` (`createTacticalPadLiteSurface.ts:357-361`) is flat — `{ id, points, startSegmentIndex }`. Two separately-drawn runs for the same player (via New Run, i.e. `routesByPlayerId.get(playerId)` holding two entries) are genuinely independent records with their own `startSegmentIndex`, unlike Continue Run's single growing array. So the boundary — "entry A stops being points, entry B starts being points" — is unambiguous and already exists, no invented marker required.

**But there is exactly one call site that ever starts a route animating:** `startRoutesForResolvedSegment()` is called from a single place, `stepPlayback()` at the phase-segment-resolution point (`:3367`, inside the `progress >= 1` branch that fires when a *phase transition* finishes). Its due-check is entirely phase-index arithmetic:

```
const isDue = startIndex === resolvedSegmentIndex || (isFinalSegment && startIndex >= resolvedSegmentIndex);
```

There is no second trigger path. Specifically, **RouteEntry completion itself triggers nothing.** Walking `stepBasicRouteFollow()` (`:3390-3414`) — the function that steps every currently-active route session each frame — when a session's `isActive()` flips to `false`:

```
if (!active.session.isActive()) {
  completedIds.push(playerId);
}
...
for (const playerId of completedIds) {
  activeRouteRunsByPlayerId.delete(playerId);
}
```

That's the entirety of what happens. No lookup into `routesByPlayerId` for "is there a next entry for this player," no ball-attach call, nothing. Entry completion is pure bookkeeping — it removes the finished entry from the active-runs map and, if that empties the map, feeds into `maybeCompletePlayback()`. It has zero awareness that a sibling entry might be waiting.

## Why it isn't wired that way already — this is a design choice, not an oversight

Multiple Draw Runs' own design doc gives its own worked example: "a run drawn in the context of Phase 2, another in Phase 5, another in Phase 8." That's deliberately **phase-anchored and phase-spread**, not back-to-back-chained. This is the direct, intended consequence of Hybrid Playback's core premise — routes run at their own pace, decoupled from Phase duration, specifically so a route is *never* stretched or compressed to fit a phase. Two entries for the same player are two independent phase-anchored events by design, not two halves of one continuous timed sequence. So today's scheduler correctly has no notion of "when entry A finishes, immediately start entry B" — that idea was never part of what Multiple Draw Runs was built to do, and building it wouldn't be fixing a bug, it would be adding a genuinely new second trigger type alongside the existing phase-anchored one.

**Concrete consequence of the gap, if you tried to fake this today with the current engine, unmodified:** give Run 1 `startSegmentIndex: 0` and Run 2 `startSegmentIndex: 1` (i.e. Run 2 anchored to "the next phase"). Two real outcomes, neither is "boundary = pass":
- If that next phase transition resolves *before* Run 1's own animation finishes (very possible — routes and phases are deliberately unsynced clocks), the existing **supersede rule** (`startRoutesForResolvedSegment:3042-3049`) cancels Run 1 mid-flight and starts Run 2 immediately from wherever the player currently is. Run 1 gets cut short, not completed.
- If that phase transition resolves *after* Run 1 already finished, the player stands still, already-arrived, waiting for the phase clock to catch up before Run 2 starts. A dead gap, not a clean boundary.
Neither is "Run 1 → pass arrives exactly at the join → Run 2." Phase-anchoring genuinely cannot express this relationship, which is exactly what makes it the wrong primitive for this and phase boundaries the wrong tool — not just imprecise the way the earlier phase-drag workaround audit found, but structurally incapable of it.

## Is RouteEntry-boundary the correct primitive? Yes — and better than the two alternatives already audited

Compared against the two options the prior audit weighed:

- **Phase boundaries** (today's only workaround): wrong clock entirely — shown above to either cut the run short or leave a dead gap, because Phases and Routes are deliberately decoupled.
- **A hidden marker inside one continuous entry** (the prior audit's Option B): works mechanically, but only by inventing state — a point-index/arc-length marker with no on-screen trace unless new rendering is built for it. That's real new invisible state, the exact pattern this project keeps finding reasons to remove.
- **RouteEntry boundary** (this audit): the boundary isn't invented — it's the direct, visible consequence of the coach drawing two separate strokes. There's nothing to mark, because the coach's own two gestures already are the marker. This is the only one of the three options with zero new hidden state.

That matches the intuition in the brief exactly: *Run 1 → receiver is off the shoulder → boundary → pass arrives → Run 2 → receiver carries it* is a description of two authored strokes and the gap between them, not a description of a timer.

## What would actually need to change (playback semantics only, not scope-creeping into UI)

Stated precisely, since the question was "if not, explain exactly why" — here is exactly what's missing, no more:

1. **A pairing.** Something has to record "RouteEntry B's start is gated on RouteEntry A's completion" rather than (or in addition to) B's own `startSegmentIndex`. This is a new relationship between two entries that doesn't exist in the `RouteEntry` shape today.
2. **A second trigger path.** `stepBasicRouteFollow()`'s completedIds loop (`:3412-3414`) would need to, for each entry that just completed, check whether a paired next-entry exists and — if so — start it immediately (reusing `buildBasicRouteRunsForEntries`, the exact same builder `startRoutesForResolvedSegment` already uses) and call the existing `attachPrimaryBallToPlayer()` at that same instant, so possession changes hands exactly at the join, not before and not after.
3. **A suppression rule.** A paired entry B should *not* also be eligible for the ordinary phase-anchored due-check in `startRoutesForResolvedSegment` — otherwise a phase transition could still race ahead and start B early via the existing path, defeating the boundary guarantee. One added condition in that function's due-scan.
4. **Persistence for the pairing**, additive to the existing wire format the same way `startSegmentIndex` was — a missing/absent pairing on a legacy save simply means "not gated, use the ordinary phase-anchored start," which is exactly today's behavior, so old boards are unaffected.

Nothing above touches Continue Run, the UI, or introduces a picker — this is confined to the scheduler and the ball-attach call, matching the brief's own boundary.

**Rough size, since the mechanism is genuinely simpler than the marker-based Option B estimated earlier (no progress-fraction tracking, no new rendering, reuses two already-existing functions verbatim):** smaller than that ~2-3 day estimate — realistically **under a day** of engine work, plus a manual verification pass to the same standard as the rest of this line of work.

---

## Addendum: should Run 2 start the instant Run 1 ends, or once the pass itself completes?

A follow-up question caught a real gap in step 2 above as originally written: firing `attachPrimaryBallToPlayer()` in the same instant Run 1's session completes is **still an instant transfer** — it just relocates *when* the instant happens, rather than replacing "instant" with an actual pass. Worth being precise about why, verified directly:

`updateAttachedBallsForPlayer()` — the function that keeps an attached ball glued to its holder every frame during route-follow — calls `applyBallRuntimeStateToItem()` (`:1600-1613`), which is a **hard snap**: `item.x = attachedPoint.x; item.y = attachedPoint.y;`, no interpolation. The only place in the entire engine that makes a ball *travel* rather than snap is `stepBallTowardLiveTarget()` (`:3242`), and it has exactly one call site (`:3348`) — inside `stepPlayback()`'s phase-to-phase ball-transition classifier. It doesn't run during route-follow at all. So step 2 as written would produce a genuine teleport: the ball jumps from the passer straight onto the receiver the frame Run 1 ends, with zero travel — the same underlying problem this whole audit series started from, just moved to a new trigger point instead of solved.

**Yes, this can be fixed, and it should be** — Run 2 beginning once the pass *arrives*, not the instant Run 1 ends, is the more correct model and matches the mental picture in the brief exactly (receiver stands off the shoulder, ball travels, then they carry it). But it requires one genuinely new piece, not a reuse of something that already fits:

- Neither existing travel mechanism can be reused as-is. `stepBallTowardLiveTarget` is scoped inside `stepPlayback`'s captured-snapshot loop, which isn't running during route-follow-driven completions. The other existing travel effect — Tap Pass's own `possession-pass` mini-playback (`resolvePossessionPassSegmentDurationMs` + a standalone `startPlayback()` call) — can't be nested inside an already-running Play either, since `startPlayback()` resets the top-level playback state machine (`playbackPath`, `activeSegmentIndex`, `phasesRunning`) wholesale; calling it mid-flight would hijack whatever else is currently animating (other players' routes, phase interpolation), breaking Hybrid Playback's "isPlaying spans phases + routes" invariant.
- What's actually needed is a **third, small, purpose-built ball-flight step** — mechanically simple (no route/points array, just current ball position → the receiver's live attach-offset point, recomputed every frame the same way `stepBallTowardLiveTarget` already does, so it naturally still tracks the receiver even if their standstill position isn't perfectly static). It reuses `stepBallTowardLiveTarget`'s existing lead-cap/arrival math and constants rather than inventing new physics, and — importantly — it should also recompute its *source* point live from the passer's current position each frame (the passer may still be moving), which `stepBallTowardLiveTarget`'s pattern already supports for free.
- This step runs alongside the existing per-tick stepping (`stepBasicRouteFollow`/`stepPlayback`, both driven from the same ticker), not nested inside either, so it doesn't touch the top-level state machine at all.
- The RouteEntry-boundary trigger from the main audit above changes shape slightly: Run 1 completing no longer directly attaches the ball; it starts this flight step instead. Only once the flight reports "arrived" (the same boolean signal `stepBallTowardLiveTarget` already computes) does the engine call `attachPrimaryBallToPlayer()` **and** the boundary-triggered start of Run 2, at that same later instant — so the two stay atomic with each other, just both deferred past the boundary itself.

**Revised size:** this adds a real (if small) new mechanism on top of everything scoped above — realistically **an extra half-day to a day**, so **roughly 1.5–2 days total** for "boundary-triggered pass with a genuine visible flight, Run 2 beginning only once the ball actually arrives" end to end, rather than the under-a-day figure for the instant-transfer version.

---

## Addendum: does this retire the Attach Ball button?

No. RouteEntry-boundary transfer only fires when a precondition holds — a receiving player has a `RouteEntry` that's actively completing — and several real coaching moments don't have that precondition at all: establishing the very first possession of a sequence (no prior entry is completing anywhere, nothing for a boundary to sit between), a receiver who isn't running any route (a stationary target, a direct kickout, plain reassignment), a player who already holds the ball *before* their run starts rather than receiving it mid-sequence (today's existing default — attach, then draw, the ball follows unconditionally through everything), and quick fix-a-mistake reassignment unconnected to any modeled pass. This mirrors the earlier Tap-Pass-semantics audit's own conclusion that unconditional, immediate transfer is a legitimate coaching action in its own right, not a lesser version of a deferred one — Attach Ball is Route Mode's instance of that same general-purpose primitive (`attachPrimaryBallToPlayer`, unconditional), and boundary-transfer would sit alongside it as a specialized trigger for one specific pattern, not replace it.
