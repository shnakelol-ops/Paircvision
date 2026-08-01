# PáircVision — Tactical Slate Hybrid Playback Audit

**Status:** Audit only. No branch created, no code modified, no commit, no PR.
**Scope:** `src/engine/pixi/createTacticalPadLiteSurface.ts` (the Tactical Slate playback engine), `src/pages/TacticalPadLiteClean.tsx` (consumer/UI), `src/engine/pixi/movement/basicRouteFollow.ts` (route interpolation), `src/features/vision-tactics/TacticalPlaySurface.tsx` (Tactical Play, checked only for boundary contamination).

**Revision note:** This version corrects and sharpens the original audit based on confirmed live-testing behavior: Phase playback and Route playback are **not** two disconnected engines — they are one engine, one `Play` entry point, one tick loop. The defect is purely one of *sequencing*: both are currently started from the same instant instead of one being deferred until the other completes. This revision traces the exact start points, the exact (missing) handoff point, and evaluates the `playbackStage` state-machine shape directly against the existing code.

---

## Executive Summary

Phase playback and Route playback both start from the same synchronous call stack, inside the same function (`startPlayback()`), triggered by the same `Play` button press. That is the entire reason they run simultaneously today — not because they are architecturally separate systems, but because the code that builds the route-follow sessions was placed at the top of `startPlayback()` instead of being deferred to the moment phase interpolation resolves its final segment.

Every piece needed for a clean handoff already exists:
- Phase completion is already detected in code (just not exposed as a hook anything else listens to).
- Route sessions already anchor their origin dynamically to whatever `player.current` is at construction time — not to any hardcoded phase.
- Routes are stored as **absolute world-space coordinates**, not relative to a player or phase, so no stored geometry needs to change.
- Play, Pause, Resume, Reset, and speed-multiplier controls already read/write the same module-level flags both systems check.

The one thing genuinely missing is a **shared stage concept**. Today, "is playback happening" is represented by an overloaded pair of booleans (`isPlaying`/`isPaused`) plus an array (`playbackPath`), and each of the two sub-systems only checks the subset of that state it cares about. That's precisely what causes the confirmed defect below: `pausePlayback()` guards on `isPlaying`, but `isPlaying` is already false by the time a route is still animating, so **pause silently does nothing during the route tail today** — and the Pause button itself renders `disabled` at that point.

**Verdict: Option A — small delayed-start handoff.** The fix is: (1) delay route-session construction from "on Play" to "on final phase segment resolved," and (2) replace the overloaded `isPlaying`/`isPaused`/`playbackPath` state with an explicit `playbackStage: 'phases' | 'routes' | 'complete'` (or equivalent minimal enum) so the *existing* Play/Pause/Resume/Reset handlers key off one true source of "are we still animating," rather than the phase-only signal they currently use.

---

## Direct Trace Answers

**1. The exact function or event that starts Phase playback.**
`handlePlay()` (`createTacticalPadLiteSurface.ts:3011`), invoked from the page's `handlePlayPress` → `surfaceRef.current?.play()` → `play: handlePlay` (`:4040`). When `phases.length > 0`, it calls `playSavedPhaseSequence()` (`:3006`), which assembles `[startPositions, ...phases]` and calls `startPlayback(sequence)` (`:2956`). Actual frame-by-frame advancement happens in `stepPlayback()` (`:3131`), driven by `app.ticker.add(...)` (`:3975`).

**2. The exact function or event that starts Route playback.**
Also inside `startPlayback()` — `buildBasicRouteRunsForCurrentPlayers(activeSegmentIndex)` is called at `:2969-2974`, synchronously, in the same function call as step 1, immediately after `applySnapshotToSurface(path[0])` snaps players to Phase-1/start positions. Frame-by-frame advancement happens in `stepBasicRouteFollow()` (`:3242`), called from the same `app.ticker` callback as `stepPlayback()`.

**3. Why both currently begin from the same Play action.**
Because there is exactly one entry point (`startPlayback()`) servicing the Play button, and the route-session-construction call was written into that entry point rather than into the phase-completion branch. There is no dispatch, no event, no separate "start routes" trigger — it's one function building both the phase segment path and the route sessions before returning. This is a placement choice, not an architectural coupling.

**4. Whether Phase playback exposes a completion signal.**
A completion *condition* is already detected in code, but it is not exposed as a reusable hook. At `stepPlayback():3217-3221`:
```
if (progress >= 1) {
  applySnapshotToSurface(toSnapshot, { preserveActiveRoutePlayers: true });
  activeSegmentIndex += 1;
  playElapsedMs = 0;
  if (activeSegmentIndex >= playbackPath.length - 1) {
    // ...cancelPlaybackAnimation(); return;
  }
}
```
This is the exact — and only — place where "the final phase has resolved" is known. Today it's used solely to shut playback down (`cancelPlaybackAnimation()`). It is the correct and sufficient location to trigger route-session construction instead of (or in addition to) shutdown.

**5. Whether Route playback can begin from the final live token positions.**
Yes, confirmed, with no extra plumbing required. `buildBasicRouteRunsForCurrentPlayers()` (`:2927-2943`) reads `player.current` at call time — whatever that value is. The completion branch above (`:3218`) already force-sets every non-route player to the *exact* final `PhaseSnapshot` value via `applySnapshotToSurface(toSnapshot, ...)` before this point would be checked, so if route-session construction is moved into this branch, `player.current` is guaranteed to be the exact, frame-perfect final phase position — not an eased approximation.

**6. Whether drawn routes are absolute paths, relative paths, or rebased paths.**
**Absolute world-space paths.** Route points are captured as raw pointer positions converted to normalized coordinates during drawing (`:3963-3970`), with no reference to any player anchor or phase snapshot. Confirmed in `basicRouteFollow.ts:21-33`: the session prepends the *live* `target` (player's current position at session-build time) as the path's first point, then walks toward the absolute recorded points that follow. Nothing about the stored route geometry encodes "relative to Phase 1" or "relative to any snapshot" — it's a standalone polyline in board space.

**7. Whether starting Routes after Phases would cause snapping.**
No — and this is directly evidenced, not inferred. Because `applySnapshotToSurface(toSnapshot, ...)` (`:3218`) already force-sets `player.current` to the exact final-phase value before the completion branch would run, and `buildBasicRouteRunsForCurrentPlayers()` reads `player.current` as the session's first path point, the two values are identical by construction, in the same synchronous tick. The route's first point *is* the token's exact final resting point — zero positional delta, zero visible jump.

**8. How pause/resume behaves before, during, and after the handoff (current code, confirmed defect).**
- **Before handoff (mid-phase):** Works correctly. `pausePlayback()` (`:4041`) checks `isPlaying` — true during phase animation — flips to `isPaused`; `stepPlayback()`'s guard (`:3132` `if (!isPlaying ...) return;`) halts interpolation. Resume works symmetrically.
- **At the handoff instant:** Atomic — the transition happens within a single synchronous tick callback, so there's no observable half-transitioned frame.
- **After handoff (route tail, current code):** **Broken.** `cancelPlaybackAnimation()` (`:2945-2954`) already runs as soon as the final phase segment resolves, setting `isPlaying = false` and clearing `playbackPath = []`. `stepBasicRouteFollow()` (`:3242-3243`) is gated only by `isPaused`, not `isPlaying`, so the route keeps animating — but `pausePlayback()` (`:4042` `if (!isPlaying) return;`) now silently no-ops, because `isPlaying` is already false. This is corroborated at the UI layer: the Pause button is rendered `disabled={!isPlaying}` (`TacticalPadLiteClean.tsx:4962`), so it visibly grays out the instant phase playback ends — a coach cannot pause the route tail today, even though it's still moving on screen.

This is the clearest concrete evidence that the missing piece isn't a second engine — it's a shared notion of "are we still animating" that both `stepPlayback` and `stepBasicRouteFollow` (and the Pause button) can check.

**9. How Reset restores both phase and route state.**
Correct today, and expected to remain correct under the fix with no structural change. `reset()` (`:4119-4124`): cancels playback (`cancelPlaybackAnimation()`), cancels any in-flight route follow with `restoreOrigin: true` (which snaps routed tokens back to wherever their session's `origin` was captured), then force-applies `startPositions` unconditionally. Because the final `applySnapshotToSurface(startPositions)` call is unconditional, Reset lands on Phase 1 regardless of which stage (`phases`/`routes`) playback was in when Reset was pressed. The only addition needed is resetting the new `playbackStage` value back to its idle/initial state alongside the existing cancellation calls — no new restoration logic.

**10. Whether one shared playback state can represent `phases` / `routes` / `complete`.**
Yes — and it maps cleanly onto what already exists, it's just currently split across three loosely-related variables (`isPlaying`, `isPaused`, `playbackPath`) instead of one enum:

| Existing state | Maps to |
|---|---|
| `isPlaying === true`, `activeSegmentIndex < playbackPath.length - 1` | `playbackStage: 'phases'` |
| Final phase segment resolved, `activeRouteRunsByPlayerId.size > 0` | `playbackStage: 'routes'` |
| `activeRouteRunsByPlayerId.size === 0` and no phases remain (or no routes were ever assigned) | `playbackStage: 'complete'` → today's `cancelPlaybackAnimation()` |

No new data needs to be tracked that isn't already computed somewhere in the file — this is a consolidation of existing signals into one authoritative value, not new bookkeeping.

---

## Recommended Implementation Shape

Introduce a single module-level variable, e.g.:

```ts
type PlaybackStage = "idle" | "phases" | "routes" | "complete";
let playbackStage: PlaybackStage = "idle";
```

And three call-site changes, all in `createTacticalPadLiteSurface.ts`:

1. **`startPlayback()` (`:2956`):** set `playbackStage = "phases"`. Remove the immediate `buildBasicRouteRunsForCurrentPlayers()` call (`:2969-2974`) — routes no longer start here.
2. **`stepPlayback()`'s final-segment branch (`:3217-3232`):** once the last segment resolves, instead of unconditionally calling `cancelPlaybackAnimation()`, branch: if routes exist, call `buildBasicRouteRunsForCurrentPlayers()` here (origin = the just-applied exact final snapshot, per finding #7) and set `playbackStage = "routes"`; if no routes exist, proceed to `cancelPlaybackAnimation()` and set `playbackStage = "complete"` exactly as today.
3. **`stepBasicRouteFollow()` (`:3242`):** when the last active route session completes, call `cancelPlaybackAnimation()` and set `playbackStage = "complete"` (this hook doesn't exist today — it's the one genuinely new piece of logic).
4. **`pausePlayback()` / `resumePlayback()` (`:4041-4055`):** guard on `playbackStage === "phases" || playbackStage === "routes"` instead of the current `isPlaying`/`isPaused` pair, so Pause works identically regardless of which stage is active. `isPlaying`/`isPaused` themselves can stay as-is for the rest of the UI (`isPlaybackLocked`, etc.) — they'd simply be kept in sync with `playbackStage !== "idle" && playbackStage !== "complete"` rather than being set/cleared independently at two different call sites as they are now.
5. **`reset()` (`:4119`):** add `playbackStage = "idle"` alongside the existing cancellation calls.

This is additive and localized — no existing function signature changes, no new files, no change to route storage, drawing capture, rendering, or persistence.

---

## Option Classification

- **Option A — small delayed-start handoff. ✅ This is the correct classification, with direct code evidence:**
  - Same file, same closure, same `players` array, same `app.ticker` callback already drive both systems (`createTacticalPadLiteSurface.ts:3975-3980`).
  - The only reason both start together is call placement inside `startPlayback()` (finding #3) — not a structural dependency.
  - Route origin is already dynamic (`player.current` at construction time), so deferring construction requires zero geometry rebasing (findings #5–7).
  - The "shared state" the user asked about (`playbackStage`) is a one-variable consolidation of state that's already being tracked in pieces (`isPlaying`, `isPaused`, `playbackPath`, `activeRouteRunsByPlayerId.size`) — not new state.
  - The confirmed pause/resume gap (finding #8) is fixed as a natural side effect of the same change, not a separate workstream.

- **Option B (moderate playback-state refactor) — not required.** Nothing here demands touching multiple files, changing the route/phase data model, or altering how boards are persisted (`:3595-3630`, `:3671-3764` already serialize `phases` and `routeByPlayerId` side-by-side unchanged).

- **Option C (unified timeline engine) — not required and not supported by evidence.** There is no need for a generalized cross-fading timeline, keyframe interpolation across arbitrary event types, or a scheduler. Phase interpolation and route interpolation remain two distinct, purpose-built stepping functions (`stepPlayback`, `stepBasicRouteFollow`); the only new concept is which one is "live" at a given moment, which a 4-value enum answers.

---

## Confirmation: Can Routes Begin From Final Phase Positions Without Rewriting Stored Geometry?

**Yes, confirmed directly from code, not inferred.** Two independent facts guarantee this:

1. Route points (`RoutePoint[]` in `routeByPlayerId`) are absolute board-space coordinates, drawn independently of any phase and stored with no relative offset baked in (finding #6).
2. `createBasicRouteFollowSession()` (`basicRouteFollow.ts:21-33`) treats the route's first traveled point as the *live* `target` passed in at session-construction time — not the first stored route point. The stored route points only describe where the player goes *after* that live starting point.

Together, this means the stored route data for a given board is valid and unchanged whether the session is built at t=0 (today) or after the final phase (proposed) — only the *timing* of construction changes, never the *content*. No migration, no re-recording of existing boards' routes, no schema change.

---

## Tactical Play Boundary (unchanged from initial pass)

`grep -rn "createTacticalPadLiteSurface" src` returns no reference from `TacticalPlaySurface.tsx`. Tactical Play shares no engine, ticker, or player-object model with Tactical Slate. Nothing in this sequencing fix — which is entirely internal to `createTacticalPadLiteSurface.ts` — has any code path into Tactical Play.

---

## Estimated Engineering Effort

**0.5–1.5 engineering days**, including manual verification of: phases-only boards, routes-only boards (zero phases assigned), mixed boards (some players routed, some not), pause during phase stage, pause during route stage (the currently-broken case), resume from each, Reset from each stage, and Undo Phase with a route assigned mid-sequence. No data model or schema migration.

## Exact Files Likely to Change

- `src/engine/pixi/createTacticalPadLiteSurface.ts` — the only file requiring logic changes (`startPlayback`, `stepPlayback`, `stepBasicRouteFollow`, `cancelPlaybackAnimation`, `pausePlayback`, `resumePlayback`, `reset`).

`src/pages/TacticalPadLiteClean.tsx` should not require changes — it already consumes `isPlaying`/`isPaused` generically via `onPlaybackStateChange`, and the Pause button's `disabled={!isPlaying}` binding will simply start behaving correctly once `isPlaying` is kept true through the route stage.

---

## Recommendation

**Proceed before launch.**

This is a confirmed small, single-file, delayed-start sequencing fix with a one-variable state consolidation — not a rebuild. The current concurrent-start behavior produces a confirmed, reproducible defect (Pause silently failing, and visibly disabling, during the route tail) independent of whether hybrid sequencing ships at all. Landing the `playbackStage` change now fixes both the requested hybrid experience and this pre-existing pause bug in the same small change, before boards combining phases and routes are in wider use.
