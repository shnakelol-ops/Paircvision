# PáircVision — Tactical Slate: Ball Continuity & Route Limit Audit

**Status:** Audit only. No branch created, no code modified, no commit, no PR.
**Scope:** `src/engine/pixi/createTacticalPadLiteSurface.ts` only (football system, route limit, route rendering all live in this one file). Builds directly on the two prior audits (`tactical-slate-hybrid-playback-audit.md`), which established the `playbackStage: 'phases' | 'routes' | 'complete'` fix as the mechanism that sequences Phase → Route playback. This audit does not re-open that question — it checks whether the ball and route rendering are safe to carry through that same fix, and whether the route-count cap can be raised.

---

## Executive Conclusion

All three questions resolve cleanly, and two of the three require **zero new ball- or route-rendering-specific code** — they are automatically correct once the previously-recommended `playbackStage` fix lands, because the ball and the route-preview graphic are already built on the same shared state (`isPlaying`/`isPaused`/`player.current`) that fix consolidates.

1. **Football continuity across the hybrid handoff: already correct, no ball-specific code needed.** An attached ball already follows its player through both phase interpolation and route-follow interpolation via the same function, `updateAttachedBallsForPlayer()`, called from both `stepPlayback()` and `stepBasicRouteFollow()`. There is no snap, duplicate, or wrong-owner risk — ball state is force-applied from the exact snapshot at every phase boundary, unconditionally, independent of route status. The only real gap is that a coach cannot draw a *new* pass **during** Route stage — there is no ball-route mechanism, only player-routes. That's a scope decision, not a bug.

2. **Route player limit (currently hardcoded at 6): safe to raise, not proven safe to remove entirely.** The cap is a single constant, enforced once, with no data-structure cost scaling per routed player (one shared Graphics object regardless of count). The one real, code-confirmed cost — full route resampling on every pointer-move while actively drawing a *new* route, which resamples *all already-committed* routes each time — scales with the committed-route count and has not been measured at 20–30. Recommend raising the cap to a moderate, tested ceiling rather than removing it.

3. **Route visibility during playback: Option A, presentation-only toggle.** The route-preview Graphics objects are already non-interactive (`eventMode: "none"`), already decoupled from playback logic (movement reads from data maps, not from the Graphics), and already conditionally styled based on the same `isPlaybackInputLocked()` flag the `playbackStage` fix keeps correct across both stages. Hiding is a one-line change (alpha→0 or `.visible=false`) plus one restore call using a pattern that already exists in the same function for a different graphic (the Shape Lock guide).

**None of these three findings change or complicate the previously-recommended `playbackStage` fix.** They confirm it's sufficient.

---

## 1. Football Movement Across Hybrid Playback

### Exact files and functions

All in `createTacticalPadLiteSurface.ts`:

| Responsibility | Function / location |
|---|---|
| Ball runtime state (attached vs. free) | `BallRuntimeState` type (`:358`), `ballStatesByItemId: Map<string, BallRuntimeState>` (`:1364`) |
| Per-phase ball snapshot | `PhaseBallSnapshot` (`:220`), captured inside `captureCurrentSnapshot()` (`:2703-2734`, football block `:2706-2716`) |
| Attach ball to a player | `attachPrimaryBallToPlayer()` (`:1616-1629`) |
| Detach ball (free) | `detachPrimaryBall()` (`:1601-1614`), exposed publicly as `freeBall` (`:4076`) |
| Live tap-to-pass gesture | `handlePossessionPassTap()` (`:1634-1673`), gated by `setPossessionPassMode()` (`:4071-4075`) and the `pointerup` handler (`:3444-3448`) |
| Keep attached ball glued to a moving player | `updateAttachedBallsForPlayer()` (`:1674-1683`) |
| Ball position during phase segment interpolation | Inside `stepPlayback()`, ball block `:3165-3215` |
| Free-ball path interpolation (within one phase segment) | `interpolateBallPath()` (`:3032-3105`) |
| Attach↔attach holder-switch handling (mid-sequence pass) | `stepPlayback():3172-3187`, explicitly commented as deterministic/anti-artifact |
| Ball position during route-follow | `stepBasicRouteFollow():3259` calls `updateAttachedBallsForPlayer(player.id)` every frame for every route-controlled player |
| Snapshot application (phase transitions, Reset) | `applySnapshotToSurface()` ball block `:2747-2768` — **unconditional**, not gated by route status |
| Save/load | `captureBoardState()` (`:3595-3630`), `importBoardState()` (`:3671-3764`), sanitizers `sanitizeSnapshotFootball()`/`sanitizePhaseSnapshot()` (`:589-627`) |

### How is a pass stored today?

Two distinct mechanisms, both ultimately represented as `PhaseBallSnapshot` data:

- **Recorded (phase-to-phase) ball movement.** When a coach drags the ball to a new player or a free spot between "Add Phase" clicks, the next `captureCurrentSnapshot()` records the ball's resulting `{id, x, y, attachedPlayerId, isFree, path}` into that phase's `football` array. Playback later interpolates between each pair of consecutive phase snapshots (`stepPlayback()`), including reproducing holder-to-holder passes deterministically (the `isAttachedToAttachedPassTransition` branch, `:3172-3187`).
- **Live possession-pass gesture.** `handlePossessionPassTap()` is a separate, immediate action (not tied to "Add Phase"): tapping a player while "possession pass mode" is enabled captures a two-frame snapshot pair (`passStartSnapshot`, `passTargetSnapshot`) and immediately calls `startPlayback([...], { kind: "possession-pass", possessionReceiverId })` — a self-contained 2-snapshot animation with its own duration formula (`resolvePossessionPassSegmentDurationMs()`, distance-based, `:3112-3129`). This **replaces** whatever `playbackPath` existed (it's a standalone demo action, not composed into the recorded phase array).

### Is the ball attached to a player, moved independently, or both?

Both, tracked per-ball via `BallRuntimeState.attachedPlayerId` / `.isFree`. Attached: position is derived every frame from `getAttachedBallPositionForPlayer()`. Free: position is either static or follows a recorded `path` (drag-recorded curve within one phase segment, interpolated by `interpolateBallPath()` — a distance-based polyline walk, structurally similar to but independently implemented from the player-route follower in `basicRouteFollow.ts`).

### Can ball movement occur during phase-to-phase playback?

Yes — confirmed, this is the primary supported case (`stepPlayback():3165-3215`), including attach/detach/reattach transitions between phases.

### Can ball movement occur during finger-drawn Route playback?

**Only if the ball is attached to a player who has a route.** `stepBasicRouteFollow()` calls `updateAttachedBallsForPlayer(player.id)` for every route-controlled player every frame (`:3259`) — so an attached ball rides along correctly. There is **no mechanism to move a free (unattached) ball, or to initiate a new pass, during route-follow** — no "ball route" data structure exists, and route capture UI only ever selects `TacticalPlayer` targets (`findRouteSelectablePlayerAtWorldPoint()` returns `TacticalPlayer | null`, never a ball item).

### If both exist, do they use the same playback state and ticker?

Yes. Both `stepPlayback()` and `stepBasicRouteFollow()` are called from the same single `app.ticker.add(...)` callback (`:3975-3980`), and both read/write the same `ballStatesByItemId` map and the same `TacticalPlayer.current` values. There is one ball state, not two.

### What happens to the ball at the phase-to-route handoff?

Exactly what should happen: `applySnapshotToSurface(toSnapshot, ...)` (`:2747-2768`) unconditionally force-applies the final phase's ball position/attachment — this call is **not** gated by `preserveActiveRoutePlayers` the way the player-position loop is (that option only affects players, `:2741`). So regardless of route status, the ball lands exactly where its final `PhaseBallSnapshot` says it should, every time.

### Can possession transfer during phases and then continue correctly into Routes?

Yes. A pass recorded across phases resolves deterministically to a specific `attachedPlayerId` by the final phase (per the transition-handling above), and from that point `updateAttachedBallsForPlayer()` keeps it glued to that player through the route stage, whether or not that player has an assigned route.

### Can the ball be passed during Routes after the final phase?

No — and this is not an oversight, it's already deliberately blocked. The tap handler that triggers `handlePossessionPassTap()` (and the plain attach-on-tap fallback) is guarded by `if (isPlaybackInputLocked()) return;` (`:3428`). Once the `playbackStage` fix lands and `isPlaying` correctly spans both stages, this same guard will correctly continue blocking pass gestures throughout the *entire* combined animation — not just the phase portion, as it inconsistently does today (see the pre-existing pause bug documented in the prior audit for the same root cause: `isPlaying` currently drops early). No new guard needs to be written; it generalizes automatically.

### Would hybrid playback cause the ball to snap, reset, duplicate, or remain attached to the wrong player?

No, on all four counts, with evidence:
- **Snap:** No — attachment position is recomputed continuously from live player position every frame via `getAttachedBallPositionForPlayerId()`, never teleported.
- **Reset:** Only via the explicit `reset()` action, which correctly restores `startPositions.football` (see below) — not an unintended side effect of the handoff.
- **Duplicate:** No — single `Map<string, BallRuntimeState>` keyed by item id, single ball graphic per ball item, reused via `setItemWorldPosition()`, never recreated.
- **Wrong player:** No — `attachedPlayerId` is always explicit and unconditionally re-applied from the authoritative snapshot at each phase boundary.

One pre-existing edge case worth naming for completeness: **today** (before the `playbackStage` fix), if the ball is attached to a *routed* player, it visually rides along with that player's premature (t=0) route motion instead of their phase motion, because routed players are currently excluded from phase interpolation entirely. This is not a new risk introduced by hybrid sequencing — it is the same defect the prior audit already identified and already scoped a fix for (routed players will animate through phases normally once the fix lands). No additional ball-specific work is implied.

### Does Reset restore the correct original ball owner and position?

Yes. `reset()` (`:4119-4124`) calls `applySnapshotToSurface(startPositions)` unconditionally, and the ball block within that function is unconditional (not route-gated), so the ball's original `attachedPlayerId`/position/free-state from `startPositions.football` is always correctly restored, regardless of what stage playback was in when Reset was pressed.

### The requested coaching sequence

> Phase 1 → A has ball → passes to B during phase movement → final phase completes → Route movement begins → ball remains with B or passes again during Routes → playback ends

- **"Ball remains with B" during Routes:** ✅ fully supported today, no change needed (mechanism above).
- **"Passes again during Routes":** ❌ not supported — no ball-route concept exists, and pass gestures are (and should remain) blocked during any locked playback state.

### Classification

**Passive continuity (ball rides with its holder through both stages): Option A — already works**, and remains correct with zero ball-specific changes once the previously-recommended `playbackStage` fix lands (it's a consumer of the same `isPlaying` state, already wired correctly at the mechanism level).

**Active re-passing during the Route stage: Option C — targeted extension, not currently supported.** This would require a new "ball route" concept (a drawn or scripted ball movement independent of any single player's route) — out of scope of "smallest safe fix," and not required for the hybrid handoff to be correct. Recommend treating this as a separate, optional future feature request rather than a blocker.

---

## 2. Drawn Route Player Limit

### Exact files and functions

Single file, single constant: `createTacticalPadLiteSurface.ts:261` — `const MAX_BASIC_ROUTE_PLAYERS = 6;`. No comment documents a rationale at the declaration site or elsewhere in the file; no other file in the repo redeclares this constant (confirmed via repo-wide grep — the only other `BASIC_ROUTE_FOLLOW_SPEED`-named constant found is in `src/movement-board/playback/playback-orchestrator.ts`, which backs **Tactical Play's** own, entirely separate route-follow engine used by `TacticalPlaySurface.tsx` — not Slate, not a duplicate of this cap, out of scope here beyond confirming it's unrelated).

Four usage sites, all within this one file:
1. `:1396` / `:4110` — reported read-only as `maxRoutes` in `TacticalRouteState` (UI display only, e.g. "Routes 3/6").
2. `:3756` — `.slice(0, MAX_BASIC_ROUTE_PLAYERS)` when sanitizing routes on board **import**, defensively truncating a corrupted/hand-edited save.
3. `:3916-3924` — the actual enforcement gate, on **route commit** (pointer-up after drawing): `if (hasExistingRoute || routeByPlayerId.size < MAX_BASIC_ROUTE_PLAYERS) { routeByPlayerId.set(...) } else { options.onRouteLimitReached?.(MAX_BASIC_ROUTE_PLAYERS); }`.

This is a single source of truth with no drift risk — raising it is a one-line change.

### Is it a genuine technical limit or a product decision?

No comment, test, or doc ties it to a measured technical ceiling. Based on the code shape (see below), it reads as a conservative, un-stress-tested product default rather than a value derived from a performance budget.

### How many route sessions can the engine safely animate? Does every routed player add Graphics objects, listeners, ticker work, or large arrays?

**During playback:** cheap and flat, regardless of count. All committed routes render through **two persistent, shared `Graphics` objects** created once at surface init — `basicRoutePreviewGraphic` (`:1055`) and `routeSelectionGraphic` (`:1081`) — never one-per-player. `stepBasicRouteFollow()` (`:3242-3270`) loops `activeRouteRunsByPlayerId` doing only cheap vector math (`session.step()`, a distance-along-polyline calc) plus `setTokenWorldPositionForPoint()` and `updateAttachedBallsForPlayer()` — no Graphics rebuild, no resampling, no allocation inside the per-frame path. No new event listeners are added per routed player (player tokens already have their drag listeners regardless of route status; route capture reuses `pointerdown`/`pointerup` on the surface).

**During drawing (the real cost):** `renderBasicRoutePreview()` (`:2792-2869`) is the only place all committed routes are re-processed together, and it re-samples **every** committed route's raw points through a Catmull-Rom-style cubic-bezier smoother (`sampleRoutePoints()`) on **every call**. It is called on discrete edit events — most importantly, once per point appended while actively drawing a *new* route (`appendBasicRoutePoint():2906`, called on every qualifying pointer-move during capture, throttled only by the `BASIC_ROUTE_MIN_POINT_DISTANCE = 0.9` minimum-spacing filter). So while a coach is drawing route N+1, every pointer-move re-samples and redraws routes 1..N as well as the in-progress draft. This cost scales with committed-route count × points-per-route, and recurs at pointer-move frequency (not 60fps-ticker frequency, but still potentially tens of times per second on a fast finger drag).

### Are route paths rebuilt every frame? Is there a mobile performance risk at 10/15/20/30 routed players?

**Not during playback** — confirmed, `renderBasicRoutePreview()` is not called from `app.ticker` (the ticker callback only calls `stepPlayback`, `stepBasicRouteFollow`, `animatePlayerDragVisuals`, `animateRouteSelectionHighlight` — none of which touch route Graphics rebuilding). Playback cost is flat and safe at any tested count.

**During active drawing**, yes, the resample-all-routes cost is real and grows with count. This audit has not run a live device benchmark (no runtime/profiler available in this session), so the following is reasoned from code shape, not measured:
- **6 (current):** trivial, already shipped.
- **10:** likely still trivial — same order of magnitude as 6.
- **15:** probably still fine on modern devices; each route's raw point count is bounded by the min-spacing filter, keeping per-route resample cost small.
- **20–30:** the first point count range this audit cannot vouch for without a device profile. The cost is bounded (no unbounded arrays, no leaked objects) but untested, and 20-30 simultaneously visible route lines also becomes a genuine **readability** problem for a tool whose product identity (per `CLAUDE.md`) is explicitly "fast, finger-drawn, conceptual, whiteboard-like" — not a dense diagram. That identity argument, not just the performance one, weighs against unlimited routes.

### Hidden/invisible hit areas or leaked listeners?

None — confirmed. Both route Graphics objects are explicitly non-interactive: `basicRoutePreviewGraphic.eventMode = "none"` (`:1056`), `routeSelectionGraphic.eventMode = "none"` (`:1082`). No hit-testing occurs on them regardless of count, and no per-player listeners are created by route assignment.

### Does save size materially increase?

No, not materially. Routes are stored as raw `{x,y}` point arrays, bounded by the same min-spacing filter that bounds drawing cost. Going from 6 to, say, 15–20 routes scales the route-storage portion of a board save roughly linearly but from an already-small base (each route is a short point array) — negligible next to the per-phase player/ball snapshot arrays already stored for every phase.

### Can the limit be removed safely? Would a higher soft limit be safer than no limit?

Removing it entirely is not proven safe — the one identified real cost (drawing-time full resample) is untested past ~15, and unlimited routes conflicts with Slate's own "fast, conceptual" product identity. A **raised hard cap** is the evidence-backed recommendation.

### Recommendation

**Raise the hard cap** from 6 to a moderate, still-conservative ceiling — this audit recommends **12–15** as a defensible target: comfortably covers realistic coaching scenarios (a full attacking unit or more), stays inside the range this trace has reasoned through with confidence, and leaves headroom before the untested 20–30 range. Do **not** remove the limit entirely, and a soft warning-only limit is unnecessary complexity given the enforcement point is already a single, trivial, one-line constant change — a hard cap is simpler and just as safe. If the product later wants 20+, that should follow an actual device-profiled drawing-performance test of `renderBasicRoutePreview()` at that count, not a code-reasoning-only audit like this one.

---

## 3. Route Visibility During Playback

### Where are Slate route graphics created and stored?

Two persistent Pixi `Graphics` objects, created once at surface construction and never destroyed/recreated during the surface's lifetime:
- `basicRoutePreviewGraphic` (`:1055-1057`) — draws both committed routes and the in-progress draft, added to `whiteboardPreviewLayer`.
- `routeSelectionGraphic` (`:1078-1083`) — draws the pulsing selection ring during route-capture mode, added to its own `routeSelectionLayer`.

The underlying route **data** is separate and persistent regardless of rendering: `routeByPlayerId: Map<string, RoutePoint[]>` (`:1347`).

### Are route graphics only visual, or does playback read them as movement data?

**Purely visual.** Playback (`buildBasicRouteRunsForCurrentPlayers()`, `stepBasicRouteFollow()`) reads exclusively from `routeByPlayerId` (the data map) and the resulting `BasicRouteFollowSession` objects — never from the `Graphics` node's drawn geometry. Hiding, dimming, or destroying the Graphics has zero effect on movement.

### Can graphics be hidden without affecting player movement? Can they be hidden only during playback and restored afterward?

Yes to both, cleanly, because of the data/rendering separation above.

### Does hiding require toggling visible, toggling renderable, changing alpha, destroying/recreating, or filtering at render time?

Simplest and cheapest: **toggle `.visible`** on `basicRoutePreviewGraphic` (or its parent `whiteboardPreviewLayer` container, hiding both committed and any stray draft state in one call) at the moments `isPlaying`/`isPaused` transition. No destroy/recreate needed — these are long-lived nodes. Note the codebase already has a partial version of "alpha changes based on playback state" built in: `resolveAlphaScale()` inside `renderBasicRoutePreview()` (`:2828-2833`) already branches on `isPlaybackInputLocked()` to *dim* routes during playback (down to 0.56-0.92 alpha) rather than fully hide them. Reaching full hidden state is a small extension of logic that's already playback-aware, not new logic.

### Are active drawing guides separate from committed route graphics?

Not structurally separate at the Graphics-object level — both committed routes (`routeByPlayerId`) and the live draft (`currentRouteDraftPoints`) are drawn into the *same* `basicRoutePreviewGraphic` within one `renderBasicRoutePreview()` call, distinguished only by an `isDraft` flag affecting alpha (`:2819-2825`, `:2828-2829`). This is not a problem for playback-hiding: route capture input is already fully blocked during playback via `isPlaybackInputLocked()` guards on the relevant pointer handlers (`:3891`, `:3911`, `:3950`), so there is never an active draft to worry about while Play is running — only the committed-routes case needs hiding.

### Can committed routes be hidden while preserving selected-player feedback, active route creation, route editing, pause/resume, reset, save/load?

Yes, all already hold:
- **Selected-player feedback** (`routeSelectionGraphic`'s pulse) is already self-gating: `renderRouteSelectionHighlight()` returns early whenever `isPlaybackInputLocked()` is true or a route run is active (`:1774`) — it already goes invisible during playback with no change needed.
- **Active route creation / editing** — already blocked during playback (guards cited above), unaffected either way.
- **Pause/resume** — since `isPlaybackInputLocked()` is `isPlaying || isPaused`, a hide keyed to that flag stays hidden through a pause and reappears only on the real stop, matching intent.
- **Reset / save/load** — purely a rendering toggle; `routeByPlayerId` (the data persisted to save) is untouched.

### Would hidden route Graphics remain interactive / create invisible hit areas?

No — both Graphics objects already have `eventMode: "none"` (`:1056`, `:1082`), so they were never interactive to begin with, hidden or not.

### Are route Graphics rebuilt every frame, or persistent? Performance benefit or risk in hiding?

Persistent, not rebuilt every frame (see Part 2 — `renderBasicRoutePreview()` fires only on discrete edit events, never from the ticker). Hiding during playback is a minor **benefit**: it skips that Graphics object's render/composite pass every frame for the duration of playback, which pairs well with the Part 2 recommendation to raise the route cap — a hidden-during-playback layer means a higher route count never costs anything during the animation, only (cheaply) when the authoring view is restored.

### Can playback automatically hide committed routes on Play, keep them hidden through both stages, and restore on end/reset? Any data-model change required?

Yes to the full sequence, with no data-model or persistence change. Gate visibility on the same `isPlaybackInputLocked()` (`isPlaying || isPaused`) flag the `playbackStage` fix already keeps correct across both the phase and route stages — so "hidden through both Phase and Route stages" falls out automatically once that fix lands, with no separate route-visibility-specific stage tracking needed. Restoring on stop can reuse the exact pattern already present in `emitPlaybackStateChange()` (`:1382-1390`), which already does this for a different graphic:
```
if (!isPlaying && !isPaused) {
  renderShapeGuideGraphic(); // existing precedent — restore an authoring overlay once playback fully stops
}
```
Adding a symmetric `renderBasicRoutePreview()` call (or a dedicated visibility toggle) in that same branch, plus hiding at the point playback starts (`startPlayback()`/`handlePlay()`), completes the feature.

### Classification

**Option A — presentation-only toggle; safe and small.** Confirmed by evidence, not inferred: the Graphics are already non-interactive, already decoupled from playback logic, already partially playback-state-aware (dimming), and the restore-on-stop pattern already exists in the same function for a comparable overlay. There is no coupling to separate — it's already separated; this is purely finishing a toggle that's already half-built.

---

## Risk Assessment (all three items)

| Item | Risk | Evidence-based verdict |
|---|---|---|
| Ball snap/duplicate/wrong-owner at handoff | Low | Ball application is unconditional and snapshot-driven at every phase boundary; no route-gating on the ball path. |
| Ball riding a routed player before the `playbackStage` fix lands | Pre-existing, already scoped | Same root cause as the general phase-exclusion defect from the prior audit; resolved as a side effect, not new work. |
| Passing the ball during Routes | None (already blocked) | Shared `isPlaybackInputLocked()` guard on pass/attach taps generalizes correctly once `isPlaying` spans both stages. |
| Route count scaling — playback | None | Flat per-frame cost, shared Graphics objects, no per-player allocation. |
| Route count scaling — active drawing | Real, untested past ~15 | `renderBasicRoutePreview()` resamples all committed routes on every pointer-move of a new route; bounded but unmeasured at 20-30. |
| Hidden route Graphics leaving invisible hit areas | None | Both Graphics already `eventMode: "none"`. |
| Route-hide/restore breaking editing state | None | Editing is already fully blocked during playback by existing guards; hide/restore is orthogonal. |

---

## Smallest Recommended Implementation (all three, additive to the prior `playbackStage` fix)

1. **Ball:** No change required beyond the already-recommended `playbackStage` fix. Verify with manual tests, don't add new code.
2. **Route limit:** Change `MAX_BASIC_ROUTE_PLAYERS` from `6` to `12`–`15` (single constant, `:261`). No other change needed anywhere.
3. **Route visibility:** Extend `resolveAlphaScale()`'s playback branch (or gate `basicRoutePreviewGraphic.visible`) to fully hide rather than dim when `isPlaybackInputLocked()` is true; add a `renderBasicRoutePreview()` (or equivalent redraw) call inside `emitPlaybackStateChange()`'s existing `if (!isPlaying && !isPaused)` restore branch (`:1386-1388`), mirroring the Shape Lock guide precedent already there.

All three changes remain confined to `createTacticalPadLiteSurface.ts`.

## Estimated Engineering Effort

- Ball continuity: **0 additional days** (covered by the prior audit's estimate; this audit found no new required work).
- Route limit increase: **under 1 hour** (one constant change, plus manual test at the new ceiling).
- Route visibility toggle: **0.25–0.5 day** (small, precedented change; test hide/restore across play, pause, resume, reset, and both phase/route stages).

---

## Explicit Decisions

**1. Can continuous Phase → Route playback support the football safely?**
**Yes.** Attached-ball continuity already works across both stages via shared code paths (`updateAttachedBallsForPlayer`, unconditional snapshot application). No ball-specific fix is required beyond the previously-recommended `playbackStage` sequencing change. Passing the ball *during* the Route stage is not supported and is out of scope as a targeted future extension (Option C), not a blocker for shipping hybrid playback.

**2. Is it safe to remove or raise the drawn-route player limit?**
**Safe to raise; not proven safe to remove entirely.** Raise `MAX_BASIC_ROUTE_PLAYERS` from 6 to 12–15. Playback cost is flat and safe at any count tested by code reasoning; the one real, unmeasured cost (drawing-time resample-all-routes) and Slate's own "fast, conceptual" product identity both argue against removing the cap outright.

**3. Can committed route graphics be fully hidden during playback without affecting movement?**
**Yes, safely and with a small change.** Route Graphics are already non-interactive and already decoupled from the movement data they visualize; this is Option A, a presentation-only toggle, extending logic (`resolveAlphaScale`, the stop-time restore branch) that already exists in the same function.
