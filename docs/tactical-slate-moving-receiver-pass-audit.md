# PáircVision — Tactical Slate: Simple Moving-Receiver Pass Audit

**Status:** Audit only. No branch created, no code modified, no commit, no push, no PR.
**Scope:** `src/engine/pixi/createTacticalPadLiteSurface.ts` only. Traces the code as it exists on `claude/tactical-slate-hybrid-audit-li8j9l` (PR #275, phase-aware routes + live-tracking pass fix), since that PR already built a meaningful part of what this feature needs.

---

## Executive Conclusion

This is buildable as a small, additive extension — **and it needs less new machinery than it looks like at first glance**, because PR #275 already shipped two of the four hard parts: (1) routes that start at a specific phase transition and keep running independently, and (2) a ball-transition classifier that already skips the stale-captured-endpoint path and live-tracks a route-controlled receiver. Tracing the three timing modes against what already exists:

- **Before Run** and **During Run** are almost fully expressible today just by *when* an ordinary ball-attach change is authored relative to the receiver's route-start segment — no new interpolation math, because the existing live-tracking branch (`stepPlayback`'s ball block, already fixed in PR #275) already does exactly the right thing once a receiver is route-controlled.
- **After Run** is the one mode that cannot be expressed through phase-snapshot placement at all, because a route can keep running well past every recorded phase (that's the whole point of Model B) — there's no phase-snapshot moment that reliably lands "when the route finishes." This needs one small new runtime hook at route-completion.

Because relying on *where in the phase sequence a coach happens to draw the pass* is fragile and doesn't match the described one-gesture UX ("tap, tap, choose timing, press Play"), the audit recommends **not** leaning on snapshot placement for Before/During either. Instead: one new small persisted map, engine-driven triggers at two existing points (route-start, route-completion) plus one new one, and a small extracted helper reused across all of them. No route-progress percentage tracking is needed anywhere — every trigger point in this design is a discrete, already-detected event (segment resolves, route session completes), never a fraction of the way through a route.

**Verdict: Option B — small schema and playback change.** Not Option A, because two new trigger points and a small extracted helper are genuinely new (not zero-diff); not Option C/D, because nothing here approaches a timeline, a percentage-based scheduler, or a second position system — every new piece reuses existing interpolation, existing route-follow sessions, and existing pause/resume/reset state as-is.

---

## Current Pass Trace

| Responsibility | Location |
|---|---|
| Ball runtime state | `BallRuntimeState` (`:358` area), `ballStatesByItemId: Map<string, BallRuntimeState>` |
| Persisted pass data (the actual "pass is stored here") | `PhaseBallSnapshot` (`:220-227`): `{ id, x, y, attachedPlayerId, isFree, path? }`, one entry per phase, inside `PhaseSnapshot.football` |
| Direct attach (tap while ball is free/already theirs) | `attachPrimaryBallToPlayer()` (`:1638-1654`) |
| Live tap-to-pass gesture | `handlePossessionPassTap()` (`:1656-1697` area) |
| Ball attach/free/path interpolation during phase playback | `stepPlayback()` ball block (`:3226-3270` area) |
| Live attach-position lookup (already reads `player.current` fresh every call) | `getAttachedBallPositionForPlayerId()` / `getAttachedBallPositionForPlayer()` |
| Keep an attached ball glued to a moving player | `updateAttachedBallsForPlayer()`, called every frame from `stepBasicRouteFollow()` |

**How is a pass stored today?** Two independent mechanisms, confirmed by re-reading the current file:
1. **Recorded, phase-based.** A coach drags the ball onto a different player between "Add Phase" clicks; the next snapshot's `attachedPlayerId` differs from the previous one. `stepPlayback()` detects this as a holder-switch and animates it. This *is* persisted (part of `PhaseSnapshot.football`, saved/loaded normally).
2. **Live tap-to-pass gesture.** `handlePossessionPassTap(player)` (`:1656`) — the tapped player is the **receiver**; the **passer** is derived implicitly as `currentHolderPlayerId` (whoever the ball is currently attached to, read from live `BallRuntimeState`). This confirms **both IDs are already known at the moment of authoring** — they're just never written anywhere. The gesture immediately builds a 2-snapshot mini-animation (`passStartSnapshot`/`passTargetSnapshot`) and calls `startPlayback([...], { kind: "possession-pass", possessionReceiverId })` — a self-contained, ephemeral demo, blocked entirely during any playback-locked state (`isPlaybackInputLocked()` guard, `:1657`), and **never captured into `PhaseSnapshot.football` or the board's saved state**.

**Is pass timing currently tied only to a phase boundary?** For mechanism 1 (recorded), yes, entirely — a pass "happens" during whichever phase-to-phase transition the `attachedPlayerId` change was captured in, with no concept of "relative to a receiver's route." For mechanism 2 (live gesture), there is no timing concept at all today — it's instantaneous and self-contained, disconnected from `phases`/`routes` entirely. Neither mechanism today expresses "relative to this receiver's Draw Run," which is exactly the gap this audit is evaluating.

**Can the receiver's live position be read every tick while routed? Can the pass endpoint track it until arrival?** Yes to both, already proven — this is precisely what PR #275 fixed. `stepPlayback()`'s ball block (`:3237-3241`) already excludes a route-controlled target from the deterministic captured-endpoint replay:
```ts
const isAttachedToAttachedPassTransition =
  sourceAttachedPlayerId != null &&
  targetAttachedPlayerId != null &&
  sourceAttachedPlayerId !== targetAttachedPlayerId &&
  !routeControlledPlayerIds.has(targetAttachedPlayerId);
```
and the fallback ("becoming attached") branch (`:3254-3270`) calls `getAttachedBallPositionForPlayerId(targetAttachedPlayerId)` every frame — a genuinely live read of `player.current` — with lead-cap smoothing (`ATTACHED_BALL_FOLLOW_MAX_LEAD_WORLD`, `ATTACHED_BALL_FOLLOW_SMOOTHING`) so the ball visibly closes distance to a moving target rather than teleporting.

**Can possession transfer to the receiver mid-route? Can the attached ball continue following the receiver after arrival?** Yes to both, already proven by the ball-continuity audit and PR #275: `updateAttachedBallsForPlayer()` runs every frame inside `stepBasicRouteFollow()` (independent of how the attachment began), and the ball loop above re-reads live position regardless of whether the target is mid-route, has just finished a route, or is being interpolated normally.

---

## Current Route Trace (relevant subset, post–PR #275)

| Responsibility | Location |
|---|---|
| Per-route start-phase index | `routeStartSegmentIndexByPlayerId: Map<string, number>` |
| Route-start trigger | `startRoutesForResolvedSegment(resolvedSegmentIndex, isFinalSegment)` (`:2977-2994`), called from `stepPlayback()`'s segment-completion branch |
| Route-follow stepping / completion detection | `stepBasicRouteFollow()` — the `completedIds` loop already detects, per player, the exact frame a route session finishes |
| Route independence from phase duration | Confirmed unchanged: `BASIC_ROUTE_FOLLOW_SPEED` is a constant-speed clock, fully decoupled from `PLAY_DURATION_MS`; a route can span many phase segments |

Two events are therefore **already precisely detected in code, per player, today**: the exact tick a route starts (inside `startRoutesForResolvedSegment`) and the exact tick a route completes (inside `stepBasicRouteFollow`'s `completedIds` handling). These are the two hooks this feature needs — nothing else has to be newly detected.

---

## Feasibility of Before / During / After

**Before Run.** Ball fully attaches to the receiver before their route begins. Trigger: at the same point `startRoutesForResolvedSegment` is about to start a receiver's route, attach the ball to them *first* (direct snap, reusing `attachPrimaryBallToPlayer`-equivalent logic), then build the route session. Visually: ball arrives, then movement begins carrying it along. No live-tracking needed — receiver hasn't moved yet, so the target position is stable at that instant.

**During Run.** Trigger: the same route-start hook, but instead of a direct snap, mark the ball as *becoming attached* using the exact same live-tracking branch already in `stepPlayback()`'s ball block (extracted into a small shared helper — see Smallest Implementation Plan). Because the receiver has already started moving by the time this runs, the ball visibly closes distance to a moving target over the next several frames using the existing lead-cap smoothing — "possession transfers while Player 10 is still moving" falls out of mechanics that already exist and are already correct, just triggered from a new call site instead of only from `stepPlayback()`'s per-segment loop.

**Should During Run represent route-midpoint start, route-midpoint landing, or another rule?** **Another, simpler rule: the pass begins exactly when the route begins**, not at any fraction of route progress. This avoids route-progress-percentage tracking entirely (which the audit brief explicitly asks not to introduce unless proven necessary — it isn't). It also reuses the *exact* existing route-start hook rather than adding a new "at X% of the route" detector, which would require sampling route length/position continuously — real new complexity for no clear coaching benefit over "starts as soon as they're moving."

**After Run.** This is the one mode that cannot be expressed via phase-snapshot placement, because the route may keep running long after every recorded phase resolves (confirmed by Model B's own design — that's the point of letting a route outlive its starting transition). It needs one new hook: when `stepBasicRouteFollow()`'s `completedIds` loop detects a specific player's route just finished, check for a pending after-run pass targeting them and trigger the attach at that moment (receiver is now stationary, so this can use either a direct snap or the same live-tracking helper — trivial either way since the target isn't moving anymore).

---

## Live Receiver Targeting Approach

No new position system. Every trigger point above ends in the same call: mark the ball as attached to the target player and let the existing, already-correct chain do the rest — `getAttachedBallPositionForPlayerId()` (live `player.current` read) inside either `stepPlayback()`'s ball block or a small extracted helper used at the two new call sites, plus `updateAttachedBallsForPlayer()` already running every route-follow frame regardless of how the attachment began. This satisfies the brief's **critical implementation rule** directly: never a captured authoring-time endpoint for a routed receiver, always a live read, and the ball attaches only once the transition actually resolves (direct snap for Before/After-at-rest, smoothed live-tracking for During).

---

## Persistence Impact

**Does this require a schema change or only one optional field?** One small new field is genuinely needed, but it doesn't belong on `PhaseBallSnapshot` — Before/During/After timing is a property of *the receiver's route*, not of any one phase snapshot (After Run in particular has no associated phase snapshot at all, since it may resolve well past the last recorded phase). Recommend a new map parallel to the existing `routeStartSegmentIndexByPlayerId`, following the same naming convention already established in this file:

```ts
type PassTimingMode = "before-run" | "during-run" | "after-run";

type RoutePassTiming = {
  passerId: string;
  mode: PassTimingMode;
};

let routePassTimingByPlayerId = new Map<string, RoutePassTiming>(); // keyed by receiver playerId
```

Serialized alongside the existing per-route entry in `captureBoardState()`'s `routes: [...]` array (same object that already gained `startSegmentIndex` in PR #275) as one optional field: `passTiming?: { passerId: string; mode: PassTimingMode }`. Parsed back in `sanitizeBoardRoutes()` with the same defensive pattern already used for `startSegmentIndex` (validate shape, default to absent).

**Can legacy passes/boards default safely to current behaviour?** Yes — absent `passTiming` simply means "no auto-pass tied to this route," which is exactly every board that exists today (including every board saved before PR #275). Nothing about existing recorded phase-to-phase passes changes; this is purely additive, read-only intent consumed at two (Before/During) or one (After) specific moments.

---

## UX Recommendation

Preferred flow matches the brief exactly and matches how `handlePossessionPassTap` already works today with no interaction changes needed to the tap gestures themselves: **tap passer (attach/confirm possession) → tap receiver (today's existing pass-tap gesture) → present the timing choice only when the tapped receiver already has a committed route.**

**Should the picker appear only when the receiver has a Draw Run, always, or as an advanced option?** **Only when the receiver has a Draw Run.** If the receiver has no route, "During"/"After" are meaningless (no route-start/route-completion event exists to trigger on), so showing the picker for every pass would add a decision the coach doesn't need in the common case. Recommend: tapping a receiver with no route behaves exactly as it does today (instant live pass demo, no picker) — full backward compatibility for the overwhelmingly common case — and only tapping a receiver who already has a drawn route surfaces the three-way choice. This keeps the picker small (three buttons, shown rarely) and phone/tablet-appropriate — no new screen, no numeric input, no drag interaction.

---

## Edge Cases

| Case | Result |
|---|---|
| Receiver has no route | Picker doesn't appear; behaves exactly as today's instant tap-to-pass. |
| Receiver route starts in a later phase | Fine — the route-start hook already fires whenever that transition resolves, regardless of how many phases precede it (already proven by Model B). |
| Receiver route is already active (mid-route) when the pass is authored | For During/After: works the same, since both hooks key off route-start/route-completion events on the *next* playback run, not off editor-time route state. For Before: still fires at that route's *next* start (i.e., next full playback), same as any authored intent. |
| Receiver route finishes before pass "lands" (During Run) | Not a failure case in practice — the lead-cap smoothing closes distance quickly (a few frames), and even if the route finishes first, `updateAttachedBallsForPlayer`/the ball loop keep re-reading the receiver's (now stationary) live position every frame regardless, so the ball still arrives correctly, just slightly delayed rather than snapping — no stuck or lost state. |
| Passer is moving | No special handling needed — the pass source is just the ball's current position at trigger time (wherever it is, including mid-transit with a moving passer); only the *target* side needed the live-tracking fix, which already exists. |
| Receiver moving via ordinary A-to-B only (no Draw Run) | Out of this feature's scope by design — picker doesn't appear (see above); an ordinary recorded phase-to-phase pass to an A-to-B-moving receiver already works today via the deterministic captured-endpoint path, unaffected. |
| Receiver moving via Draw Run | The case this feature targets; covered above. |
| Pause mid-pass | Both new hooks live inside functions already gated by `isPlaying`/`isPaused`/`phasesRunning` (route-start hook inside `stepPlayback()`'s loop; route-completion hook inside `stepBasicRouteFollow()`, already gated by `isPaused`) — an in-progress attach-transition simply freezes mid-lerp, identical to how an ordinary pass already pauses today. No new state needed. |
| Resume mid-pass | Continues correctly for the same reason — no separate pass-specific pause state to reconcile. |
| Reset mid-pass | `routePassTimingByPlayerId` needs clearing at the same cleanup call sites already touched for `routeStartSegmentIndexByPlayerId` in PR #275 (`clearRouteAssignments()`, player removal) — small, mechanical, same pattern already established. |
| Replay after completion | Unaffected — `routePassTimingByPlayerId` is read-only intent, re-evaluated fresh on every `Play` press; only per-session runtime state (`activeRouteRunsByPlayerId`, ball attachment) resets via existing `cancelPlaybackAnimation()`/Reset paths. |
| Route hidden during playback | No interaction — route-hiding only affects the drawn route *stroke* graphic; the ball item's own rendering is separate and was never part of that toggle. |
| Save and reload | Covered under Persistence Impact — one optional field, defaults safely, no migration. |

---

## Smallest Implementation Plan

All within `createTacticalPadLiteSurface.ts`, extending the same file and patterns PR #275 already established:

1. Add `routePassTimingByPlayerId: Map<string, RoutePassTiming>`, alongside `routeStartSegmentIndexByPlayerId`, with the same lifecycle (cleared at the same call sites: `clearRouteAssignments()`, player removal).
2. Extract the "becoming attached, live-tracked" logic already in `stepPlayback()`'s ball block (`:3254-3270`) into a small shared helper (e.g. `beginBallAttachTransition(item, targetPlayerId)`), called from its existing site plus the two new ones below. This is the only genuinely new *code path* in the whole feature — everything else is new call sites into logic that already exists.
3. In `startRoutesForResolvedSegment()`, before building a due route's session: if that player has a `routePassTimingByPlayerId` entry with `mode === "before-run"`, resolve the attach immediately (direct snap); if `mode === "during-run"`, call the extracted helper instead (smoothed live-tracking takes over from the next frame).
4. In `stepBasicRouteFollow()`'s existing `completedIds` handling, for each player whose route just completed: if they have a `routePassTimingByPlayerId` entry with `mode === "after-run"`, call the extracted helper (or a direct snap, since the target is now stationary).
5. Authoring UI: extend the existing tap-to-pass flow (`handlePossessionPassTap`) so that when the tapped receiver has a committed route, the immediate live-demo path is replaced by a small timing picker whose choice writes into `routePassTimingByPlayerId` instead of firing `startPlayback()` directly. (This is the one piece of design judgment this audit flags rather than fully resolving — see below.)
6. Persistence: extend the `routes` array entries in `captureBoardState()`/`sanitizeBoardRoutes()`/`importBoardState()` with the optional `passTiming` field, mirroring exactly how `startSegmentIndex` was added in PR #275.

**One open design point, not fully resolved by this audit (flagged, not decided):** today's tap-to-pass gesture is an *immediate, ephemeral* live demo, blocked during any playback state. This feature asks it to instead *record intent* for later playback when the receiver has a route. That's a real behavior fork in `handlePossessionPassTap` — worth a short explicit product confirmation before implementation, not because it's risky, but because it changes what tapping a routed receiver *does* (record vs. instantly animate) in a way a coach should be able to predict.

## Estimated Engineering Effort

**1–1.5 engineering days.** The two runtime hooks and the extracted helper are small and mechanical, closely mirroring patterns PR #275 already introduced twice (`routeStartSegmentIndexByPlayerId`, `startRoutesForResolvedSegment`). Most of the time is in the authoring-UI fork in `handlePossessionPassTap` (item 5) and manual verification across the edge-case table above, not in new interpolation logic — because there isn't any new interpolation logic.

---

## Classification

**Option B — small schema and playback change.** Not Option A: two genuinely new trigger points and one extracted helper are real additions, not zero-diff reuse. Not Option C: no refactor of the phase/route/ball data model, no change to how ordinary A-to-B passes work at all. Not Option D: nothing here tracks route progress as a percentage, computes a route midpoint, or introduces a scheduler — every trigger is a discrete event the engine already detects (segment resolved, route session completed).

---

## Three Explicit Decisions

**1. Can Slate support Before / During / After without a separate ball path?**
**Yes.** No ball-path or ball-route concept is introduced. Every mode resolves to "attach the ball to the target player," triggered at one of three already-detectable moments (before route-start, at route-start, at route-completion) — the ball's motion toward its target reuses the existing live-tracking/smoothing math, never a drawn or recorded curve.

**2. Can the ball reliably transfer to a moving routed receiver?**
**Yes, already proven.** This is precisely what PR #275's ball-transition-classifier fix delivers, and it requires no further change for this feature — During Run just triggers that existing, already-correct mechanism from a new call site (route-start) instead of only from an ordinary phase-snapshot boundary.

**3. Is this safe enough for pre-launch implementation?**
**Yes, with one product confirmation first.** The engine-side work is small, additive, and backward-compatible (one optional field, safe legacy default, no schema break). The one thing worth a deliberate decision before writing code is the authoring-UI fork flagged above — whether tapping a routed receiver should *record* a timed pass instead of *immediately demoing* one, since that changes an existing, already-shipped interaction's behavior for a specific case (receiver has a route) rather than only adding a new one.
