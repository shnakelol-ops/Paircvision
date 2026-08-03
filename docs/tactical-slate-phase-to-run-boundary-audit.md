# PáircVision — Tap Pass at the Phase→RouteEntry Boundary: Audit

**Status:** Audit only. No code changes. Answers one narrow question: for the coaching pattern *A→B Phase movement → Draw Run* (a single Draw Run, preceded by ordinary phase-to-phase movement — not two chained Draw Runs), does the relevant boundary already exist in the playback engine, and does the just-shipped RouteEntry Boundary Pass address it?

---

## Direct answer

**The boundary already exists — and it isn't even a new concept.** It's the exact transition the scheduling engine already runs on for every single Draw Run, today, unconditionally. **RouteEntry Boundary Pass, as shipped, does not use it and does not help this scenario.** That feature hooks a different transition entirely. This was the wrong transition for this workflow — confirmed directly against the code below, not inferred.

## The boundary that already exists, verified against the code

`startRoutesForResolvedSegment()` (`:3460`) is the **only** function anywhere in the engine that ever starts a Draw Run animating. It's called from exactly one place — the phase-segment-resolution point inside `stepPlayback()` (`:3815`), i.e. the moment an ordinary A→B phase transition finishes resolving. Its due-check, for any entry that hasn't started yet:

```
const isDue = startIndex === resolvedSegmentIndex || (isFinalSegment && startIndex >= resolvedSegmentIndex);
```

For a player's **first** entry, `startIndex` is the phase count at the moment the coach drew it — i.e. "once the phase transition into the next authored phase resolves." The instant that fires, the player is added to `routeControlledPlayerIds`. And `stepPlayback()`'s own ordinary A→B interpolation loop (`:3752`) checks that exact same set on every subsequent frame and every subsequent phase transition:

```
for (const player of players) {
  if (routeControlledPlayerIds.has(player.id)) continue;
  ... ordinary phase-to-phase movement ...
```

So "phase movement ends for this player" and "their first Draw Run begins" are not two things that need to be newly connected by a Tap Pass feature — **they are the same instant, already computed, already reliable, and already what makes basic Hybrid Playback function at all.** Every Draw Run drawn since this project's Model B shipped has been starting at exactly this boundary. Nothing needs to be discovered or built to detect it; it's a first-class, already-firing event today. It's simply never been wired to anything ball-related.

## Why RouteEntry Boundary Pass doesn't reach this case

Confirmed directly against `handlePossessionPassTap` (the only place a boundary pass gets registered): the deferred-pass branch is gated on

```
const receiverEntries = routesByPlayerId.get(player.id);
if (receiverEntries && receiverEntries.length >= 2) { ... }
```

A receiver who is still doing ordinary phase movement, about to begin their **first and only** Draw Run, has zero or one `RouteEntry` — never two. That condition can never be true for this coaching pattern, so Tap Pass falls straight through to the pre-existing instant-transfer path underneath it, completely unchanged. Possession still transfers immediately, on the tap — exactly the problem this whole line of work exists to remove, just for a scenario RouteEntry Boundary Pass was never built to reach.

This isn't a partial fix or an edge case it happens to miss — it's a different transition in kind. RouteEntry Boundary Pass detects **one Draw Run's own animation session completing** (`session.isActive()` going false, inside `stepBasicRouteFollow()`, entirely separate code from phase-segment resolution) so a second, sibling Draw Run can take over. That's the correct primitive for *Run 1 → Run 2* (two chained Draw Runs for the same player). It has no relationship to *Phase movement → Run 1* at all — different trigger function, different signal, different code path, checked in a different part of the frame loop.

## Bottom line

Two genuinely different boundaries exist in this engine now, and only one of them has been wired to Tap Pass:

| Coaching pattern | Boundary | Already a real event? | Wired to Tap Pass? |
|---|---|---|---|
| Run 1 → Run 2 (two Draw Runs) | A RouteEntry's own session completing | Yes, but only as of RouteEntry Boundary Pass — no prior code ever needed to detect this | Yes (just shipped) |
| A→B Phase movement → Run 1 (one Draw Run) | A phase transition resolving into a player's first not-yet-started entry | **Yes — this is not new. It's the original, load-bearing trigger every Draw Run has always used.** | **No** |

We solved the wrong transition for the workflow described. The one this workflow actually needs was already sitting in `startRoutesForResolvedSegment`, unused for this purpose, the entire time.
