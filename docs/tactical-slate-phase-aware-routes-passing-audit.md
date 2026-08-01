# PáircVision — Tactical Slate: Phase-Aware Routes and Passing Audit

**Status:** Audit only. No branch created, no code modified, no commit, no PR.
**Scope:** `src/engine/pixi/createTacticalPadLiteSurface.ts` only. Builds on the three prior audits — this one tests whether the previously-recommended single global "routes stage" is actually the right model, or whether a route needs to be anchored to a specific phase transition instead.

---

## Executive Conclusion

**Model B (routes attached to individual phase transitions) is buildable as a small, additive extension — and it's a better fit for the codebase than Model A.** One piece of evidence makes this unusually clear: `ActiveBasicRouteFollow` (`:338-343`) already has a `segmentIndex: number` field, populated at construction (`:2940`) and **never read anywhere else in the file**. The data shape for "a route belongs to a specific segment" already exists in the type system — it's just unused. This reads as either a deliberate placeholder or a half-finished idea, not as evidence the engine assumes one global stage.

The required sequence in the brief is fully traceable against existing mechanisms **except for one real, code-confirmed defect**: the ball's holder-to-holder pass logic (`isAttachedToAttachedPassTransition`, `:3172-3187`) resolves the receiver's endpoint from a **captured, authoring-time snapshot value**, not a live position — which is correct for ordinary A-to-B movement (the destination is known ahead of time) but **wrong** for a route-controlled receiver, whose true position at that moment is only known live, computed frame-by-frame by the route-follow session. This is the one substantive fix Model B needs beyond adding a start index to routes. Everything else — live position tracking for the "becoming attached" case, shared ticker, shared pause/resume/reset — already works and generalizes correctly.

**Recommendation: Model B, smallest form** — add one small piece of per-route metadata (a start-phase index, defaulting to "after the final phase" for full backward compatibility) and trigger route construction per-player at the matching phase-completion point instead of only at the very end, and correct the one ball-transition classification gap. No new engine, no separate football-route editor, no timeline abstraction.

---

## Direct Trace Answers

**Can a finger-drawn player route be assigned to a specific phase transition rather than playing as one global route stage?**
Yes, structurally straightforward. Today `routeByPlayerId: Map<string, RoutePoint[]>` (`:1347`) has no phase association at all — geometry only. Route sessions are built once, globally, via `buildBasicRouteRunsForCurrentPlayers(segmentIndex)` (`:2927-2943`), and — critically — that function already accepts a `segmentIndex` parameter and already stamps it onto each `ActiveBasicRouteFollow` (`:2940`); nothing downstream ever compares it to the live `activeSegmentIndex`. Wiring that comparison in is the whole mechanism: at each segment-completion point in `stepPlayback()` (`:3217-3232`), check whether any assigned routes are due to start at that index, and build only those.

**Can existing routes remain stored unchanged while gaining a phase/start index?**
Yes. `RoutePoint[]` geometry (the drawn stroke) needs zero changes. Add one small, separate piece of metadata — e.g. a parallel `routeStartPhaseByPlayerId: Map<string, number>` (or a `{ points, startPhaseIndex }` wrapper around the existing array) — keyed the same way as `routeByPlayerId`. A board with no recorded start index (every board saved before this feature, and any route committed today) defaults to `phases.length` — i.e., "starts after the final phase," which is exactly today's behavior. No migration pass, no rewrite of stored geometry, no schema break.

**Can normal A-to-B movement and finger-drawn movement run in the same transition for different players?**
Yes — this already partially works today, just not selectively per-segment. `stepPlayback()`'s per-player loop (`:3153-3164`) already skips any player in `routeControlledPlayerIds` while lerping everyone else normally; the only gap is *when* a player enters that set. Today it's all-or-nothing (built once, globally). Under Model B, a player only enters `routeControlledPlayerIds` once their assigned start-phase index is reached — so within, say, the Phase 3→4 transition, Player 10 (route-controlled from Phase 3 onward) is skipped by the per-player lerp while every other player in that same transition is interpolated normally. The loop structure needed for this already exists; it just needs its trigger condition widened from "always" to "if this player's start index has arrived."

**Can the current football pass system target a player whose position is being updated by Route playback?**
Yes, but only through one of its two code paths, and the audit needs to confirm the right one is used (see the next two answers). The "becoming attached" branch (`:3188-3205`) calls `getAttachedBallPositionForPlayerId(targetAttachedPlayerId)` — a genuinely live lookup, reading `player.current` at call time regardless of what last updated it (confirmed: `getAttachedBallPositionForPlayer()`, `:1497-1528`, reads `player.current` directly with no branch on interpolation source). This is already exercised every frame during route-follow via `updateAttachedBallsForPlayer()` (`:3259` inside `stepBasicRouteFollow()`), so an already-attached ball riding a routed player is proven correct by the prior audit. The open question is the *moment of attachment* — the pass itself.

**Does the pass endpoint already read the receiver's live position each tick, or is it captured only when the pass begins?**
**It depends on the transition type, and this is the one real defect.** In `stepPlayback()`'s ball block (`:3165-3215`):
- If the ball is transitioning from **free (or same holder)** → **attached to Y**: uses the live path (`getAttachedBallPositionForPlayerId`, re-evaluated every frame) — correct for a routed receiver.
- If the ball is transitioning from **attached to X** → **attached to Y** (`isAttachedToAttachedPassTransition`, `:3172-3187`, i.e. exactly "6 passes to 10" where 6 already held it): the code deliberately takes a **captured-endpoint** path — `item.x/y` lerps between `fromBall.x/y` and `toBall.x/y`, both fixed values taken from the recorded `PhaseSnapshot` at authoring time, explicitly to keep "pass playback deterministic" (per the code's own comment, `:3178-3179`). For an ordinary A-to-B receiver this is fine, because the receiver's authoring-time-captured final position *is* their true final position. **For a route-controlled receiver it is wrong** — a route has no discrete "final position" captured into any `PhaseSnapshot`, because routes don't execute at authoring time. The captured `toBall.x/y` would just be wherever Player 10's token happened to sit when "Add Phase" was clicked — not their live, route-computed position during playback.

**Can ball possession transfer at the end of that transition exactly as it does with ordinary phase movement?**
Yes, once the one gap above is closed. The fix is narrow: when `targetAttachedPlayerId` is a route-controlled player (or is about to become one as of this segment), skip the `isAttachedToAttachedPassTransition` captured-endpoint branch and always take the live-tracking branch instead — treating a pass-into-a-route the same way the code already treats a pass-into-free-space. No new ball mechanism is needed; it's a one-condition change to which existing branch runs.

**Can Pause, Resume, Reset and speed controls remain shared?**
Yes, with no additional work beyond what the first hybrid-playback audit already scoped. Pause/Resume already read the same `isPlaying`/`isPaused` flags regardless of which players are mid-route vs mid-segment; the `playbackStage` consolidation recommended in that audit already accounts for "some players still animating after the phase sequence nominally ends" — Model B is the same situation, just starting earlier and for a subset of players instead of all of them at once. Speed multiplier already scales both `stepPlayback` segment duration and `stepBasicRouteFollow`'s per-frame delta independently (`:4056-4070`, `:3245`), unaffected by *when* a route starts. Reset already unconditionally reapplies `startPositions` and cancels all active route sessions (`:4119-4124`); it needs no Model-B-specific change — cancelling "whatever routes happen to be active" already covers routes that started mid-sequence, not just ones started at t=0.

**What happens when a route lasts longer than its assigned phase transition? Should phase duration stretch to fit the route, or should route playback be normalised to the phase duration?**
The brief's own example answers this: Player 10's route starts in the Phase 2→3 transition and is still running through Phase 3→4 — i.e., it's *expected* to outlive a single transition. **Recommend: do not stretch or normalize.** Two reasons, both evidence-based:
1. Stretching phase duration to match an arbitrary route length would slow down (or speed up) *every other player's* normal A-to-B movement in that same transition to match — that's a real behavior change to the "fast, predictable beat" of ordinary phase playback for players who have nothing to do with the route, which conflicts with Slate's own identity (`CLAUDE.md`: fast, conceptual, whiteboard-like).
2. Routes are already fully decoupled from `PLAY_DURATION_MS`/phase segment timing today — they run on their own constant-speed clock (`BASIC_ROUTE_FOLLOW_SPEED`). This is already proven to work correctly independent of any segment boundary; Model B only changes the *start trigger*, not the run-to-completion duration model. `routeControlledPlayerIds` is already a flat, un-scoped set (no per-segment expiry) — a route that outlives its starting transition simply keeps the player excluded from ordinary snapshot-lerp for as many subsequent segments as it takes to finish, exactly as the set already behaves today across the single (global) case.

**Can legacy global routes load safely, perhaps assigned after the final existing phase?**
Yes, this is the natural default. Any board saved before this feature — or any route committed without an explicit start index — resolves to `startPhaseIndex = phases.length`, i.e. "begins after the final phase." That is exactly today's (soon-to-be-fixed) global behavior. No sanitizer change beyond defaulting a missing/absent field; `sanitizeBoardRoutes()` (`:703-...`) already has a natural place to apply that default during import.

---

## Model Comparison

**Model A — all phases, then all routes (the model scoped by the prior two audits).**
- Pros: simpler mental model, smaller diff (no per-player start-index bookkeeping), already fully scoped and evidenced as Option A in the earlier audits.
- Cons: cannot express the brief's required sequence at all — it has no way to say "Player 10's route starts at Phase 3, not after Phase 4," and no way to receive a pass mid-route while other players are still doing ordinary phase movement in a later transition. It's a strictly weaker model than what this brief needs.

**Model B — routes attached to individual phase transitions.**
- Pros: directly expresses the brief's sequence; reuses the existing per-player skip mechanism in `stepPlayback()`, the existing but-unused `segmentIndex` field, and the existing live-attach-tracking ball code; legacy boards degrade exactly to Model A's behavior via the default start index; no new engine, no new football-route editor, no per-frame cost increase (`stepBasicRouteFollow` and `stepPlayback` are unchanged in shape, just gated by a per-player start condition instead of a single global one).
- Cons: slightly more state to reason about (a start index per route instead of none), and the ball-transition classifier needs the one correctness fix identified above — but that fix is required regardless of which model ships, since it's a defect in how passes-into-motion are resolved, not a Model-B-specific addition.

**Model B strictly subsumes Model A** (Model A is Model B with every start index defaulted to `phases.length`), and it's the only one of the two that can produce the requested sequence. There is no smaller model that supports "passing to a player while that player is following a finger-drawn route" — the ball-transition fix is required either way, and without a per-route start index there is no way to have some players route-following while others are still mid-phase in the same transition at all.

---

## Recommended Smallest Implementation

All changes remain confined to `createTacticalPadLiteSurface.ts`:

1. **Add a start-phase index per route.** A small parallel map (e.g. `routeStartPhaseByPlayerId: Map<string, number>`) alongside `routeByPlayerId`, defaulted to `phases.length` wherever absent (new route commit while editing at the current phase count, or any legacy/imported board).
2. **Trigger route construction per player, at the matching segment-completion point**, inside `stepPlayback()`'s existing completion branch (`:3217-3232`) — replacing the current single global call in `startPlayback()` (`:2969-2974`), which the prior audit already recommended removing/deferring. Reuse `buildBasicRouteRunsForCurrentPlayers()`, narrowed to build only the routes whose start index matches the segment that just completed, merging into the existing `activeRouteRunsByPlayerId`/`routeControlledPlayerIds` rather than replacing them (since multiple players can already be mid-route simultaneously by design).
3. **Fix the ball-transition classifier.** In `stepPlayback()`'s ball block (`:3172-3187`), add a condition: if `targetAttachedPlayerId` is (as of this segment) a route-controlled player, skip the `isAttachedToAttachedPassTransition` captured-endpoint branch and fall through to the existing live-tracking branch (`:3188-3205`) instead. This is a one-condition change reusing code that already exists and is already proven correct for the "becoming attached" case.
4. **No change needed** to Pause/Resume/Reset/speed handling beyond what the first hybrid-playback audit already scoped (the `playbackStage` consolidation) — Model B is a natural extension of that same state, not a parallel system.

This does not introduce a timeline engine (segment/route stepping stays as two purpose-built functions, just with a per-player trigger condition instead of a global one) and does not introduce a separate football-route editor (passing is still authored the same way it is today — by setting ball attachment in a `PhaseSnapshot` — the fix only changes which existing interpolation branch resolves that attachment when the target is mid-route).

## Estimated Engineering Effort

**1–2 engineering days**, incrementally on top of the previously-scoped `playbackStage` fix (not in addition to redoing it): the start-index bookkeeping and per-segment trigger are a moderate but mechanical extension of already-existing structures (`segmentIndex` field, `routeControlledPlayerIds` set, `buildBasicRouteRunsForCurrentPlayers`); the ball-transition fix is a single added condition. Verification should specifically cover: a route starting mid-sequence while other players continue ordinary movement in the same and later transitions, a pass landing on a route-controlled receiver at the exact segment where their route starts, a pass landing on a receiver whose route started earlier and is still running, Reset mid-route-started-mid-sequence, and a legacy board with a global (no-start-index) route loading and playing identically to before.

## Exact Files Likely to Change

- `src/engine/pixi/createTacticalPadLiteSurface.ts` — the only file requiring logic changes (`routeByPlayerId`-adjacent storage, `stepPlayback`, `buildBasicRouteRunsForCurrentPlayers`, `sanitizeBoardRoutes`/import defaulting, and the ball-transition classifier).

No changes expected to `TacticalPadLiteClean.tsx`, route rendering, or Tactical Play.

---

## Answers to the Brief's Core Questions

- **Can a route be assigned to a specific phase transition instead of one global stage?** Yes — small, additive, and the type system already anticipates it via the unused `segmentIndex` field.
- **Can normal and route movement run in the same transition for different players?** Yes — the per-player skip mechanism already exists in `stepPlayback()`; it only needs a per-player trigger condition instead of a global one.
- **Can a pass target a player mid-route?** Yes, but only after fixing the identified defect: the holder-to-holder pass path currently resolves the receiver's endpoint from a stale, authoring-time-captured position rather than the receiver's live route position. The live-tracking mechanism this needs already exists and is already proven correct elsewhere in the same file — it's a matter of routing the right transitions into it.
- **Should route duration stretch or normalize to fit its phase transition?** Neither — leave routes on their existing independent, speed-based clock, allowed to run past their starting transition into later ones, exactly as the brief's own example requires.
