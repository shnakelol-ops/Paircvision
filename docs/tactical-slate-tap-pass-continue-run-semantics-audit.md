# PáircVision — Tap Pass & Continue Run Semantics Audit

**Status:** Audit only. No branch, no code, no commit. Product architecture review, not a UX review — the previous audit in this series already established Continue Run as the primary editing workflow and removed Before/During/After; this audit tests whether Tap Pass's current semantics actually support that decision under real coaching use.

---

## 1. Is this a semantic problem rather than a movement problem?

**Confirmed from the implementation: yes.** Tap Pass currently means *"Player X owns the ball now,"* not *"Player X receives the ball when their current run completes."* There is no code path today that could express the latter — this isn't a bug in an existing mechanism, it's a capability that was never built.

Walking the actual code (`createTacticalPadLiteSurface.ts`):

- `handlePossessionPassTap(player)` (`:1692`) computes the receiver's target point via `getAttachedBallPositionForPlayer(player)` — the receiver's **current, static, at-tap-time** position. Not their route's endpoint. Not gated on any route state.
- It then runs one short, fixed-duration flight animation (`playbackKind: "possession-pass"`, 900–1800ms, distance-based — `resolvePossessionPassSegmentDurationMs` at `:3257`) from the passer's current position to that fixed point.
- At the end of that flight, it unconditionally calls `attachPrimaryBallToPlayer(receiver)` (`:3370`) — full stop. No check against `routesByPlayerId`, no check against `routeControlledPlayerIds`.
- Critically, `startRoutesForResolvedSegment()` — the **only** function in the engine that ever starts a Draw Run animating — explicitly no-ops for this entire interaction: `if (playbackKind !== "default" || routesByPlayerId.size <= 0) return;` (`:3016`). Tap Pass's mini-playback runs under `playbackKind: "possession-pass"`, so it never even looks at whether the receiver has a pending route.
- `updateAttachedBallsForPlayer(playerId)` (`:1731`) — the function that makes an attached ball visually follow its holder every frame, including during real Play — is a flat state check: `state.attachedPlayerId === playerId` → snap to the current offset position. There is no progress/completion concept anywhere in the attach path; attachment is binary and immediate by construction.

One consequence worth naming even though it's outside the user's question: because Tap Pass mutates live, current-moment state rather than something tied to the phase timeline, if it's tapped *before* any `Add Phase`/`Set Start` capture, the "13 has it, then passes to 15" moment isn't represented in the Phase history at all — only whatever the ball's state happens to be at the next capture. That's a separate, smaller gap from the one in this audit, but it's the same root cause: Tap Pass has no notion of "when."

## 2. Can Tap Pass target a RouteEntry instead of immediately targeting a player?

Mechanically possible, but **not a small extension** — it requires four separable additions, and none of them exist as scaffolding today:

1. **A "pending" concept.** Today Tap Pass fully resolves possession inside its own short mini-playback with no state that survives past it. Deferring the attach to a later moment means inventing a pending-transfer record that outlives the tap action (which ball, which player, which condition) — nothing like this exists.
2. **A new trigger point.** The only thing that ever starts a route is `startRoutesForResolvedSegment`, gated strictly on phase-transition resolution. "Attach when a route finishes" requires listening for *route completion*, not phase-transition resolution. The good news: `basicRouteFollow.ts`'s `createBasicRouteFollowSession` already has an `onComplete` callback in its options type (`:9`) — currently **unused** by any caller. That's a real, already-there hook to wire into, which lowers this specific piece of the cost.
3. **Tap Pass's own flight animation stops making sense as built.** It currently computes a fixed 2-point path to the receiver's *current* position, once, at tap time. If the receiver won't be there when they actually receive it (they're mid-route), that fixed target is simply wrong. You'd have to either suppress the flight animation for a pending pass (ball invisibly stays with the passer until reception, then snaps — visually abrupt) or build a new "hold with passer through the run, then chase" animation — which is functionally close to rebuilding the "After Run" mode of the picker that was just removed this session.
4. **It runs straight into a modeling conflict with Continue Run as just shipped** — covered next, and it's the load-bearing issue.

So: real, buildable, but this is "extend the ball-attach state machine with a new deferred-completion trigger," not "add a parameter to an existing call."

## 3. How does this interact with Multiple Draw Runs?

This is where the proposal runs into a genuine architectural conflict with what was just built.

**The diagram in the brief assumes Run 1 and Run 2 are two separate `RouteEntry` items.** They are not, as Continue Run is currently implemented. Continue Run deliberately **appends new points onto the same entry** — `lastEntry.points = [...lastEntry.points, ...newDraftPoints]` (`createTacticalPadLiteSurface.ts`, commit handler) — specifically because the design goal, agreed in the prior audit and confirmed again when it shipped, was "one continuous logical run," not two entries chained together. `RouteEntry` is flat (`{id, points, startSegmentIndex}`) with no internal waypoint markers.

Consequence: after Draw Run → Tap Pass → Continue Run → draw more, the data is **one `RouteEntry` with a longer point array** — there is no entry boundary anywhere marking "this is where I tapped pass." So "attach possession when the RouteEntry completes" cannot express "receive partway through" as built today — the entry that would need to "complete" keeps growing every time Continue Run is used again, so the completion signal arrives too late (at the very end of both runs combined, not at the reception point).

Two ways to actually get Run 1 → Receive → Run 2 out of this:

- **(a) Make Continue Run conditionally split into a new entry** when a pending pass exists on the current entry, instead of always appending. This requires a *new* scheduling trigger no different in kind from item 2 above ("start Run 2's session the instant Run 1's session completes," not "start at a phase transition") — the scheduler (`startRoutesForResolvedSegment`) has no such concept, it's 100% phase-transition-driven. It also means Continue Run's own behavior would silently branch on ball state the coach may not be thinking about at that moment — see §5.
- **(b) Keep one merged entry, add a within-entry possession marker** (a point-index or arc-length offset stored on the entry, set at tap time) and make ball-attachment *conditional per frame* on route progress passing that marker, instead of a flat `attachedPlayerId` boolean. This avoids inventing a second scheduling trigger, but requires exposing progress out of `BasicRouteFollowSession` (currently only `isActive(): boolean` is exposed — no distance/progress getter) and changing `updateAttachedBallsForPlayer` from a flat state check to a conditional one.

**Either path means Option B does not fall out of the `RouteEntry[]` model for free.** It's a new, coherent feature built on top of it, not a natural consequence of Multiple Draw Runs already shipping.

Worth being explicit about, since it bears directly on §5: both paths reintroduce a *timing/completion-conditional trigger* into the possession model — just relocated from an explicit picker (the removed Before/During/After) into either route-scheduling (path a) or route-progress tracking (path b). Neither eliminates a timing system; both relocate one.

## 4. Competitor comparison

Searched for how comparable tactics-animation tools (DrawTactics, Tactico, SquadAnimator, TacticalPad, footballTacticsAnimator) handle this exact "run, then receive, then continue" sequencing.

**Documented:**
- DrawTactics' marketing describes **path-based movement with per-element delayed starts** — their own example is a striker's movement followed by a midfielder's run beginning "0.5 seconds after" it, and a striker "receiving and laying off while the attacking midfielder arrives at full speed." This is an explicit, coach-authored numeric delay between two independently-drawn paths, not an automatic reception-on-completion rule.
- Tactico's drill animator is **keyframe-based**: coaches place players/ball at discrete keyframes and set inter-keyframe speed/easing per element.
- None of the public marketing/help material surfaced for any of these tools documents an "automatically attach the ball to a player once their path finishes" mechanic specifically. Search did not turn up product documentation confirming or denying this for any tool.

**Reasoned inference, not documented fact** (flagging per the brief's own instruction to separate the two): every one of these tools is built on an explicit **timeline/keyframe** model, where the ball is typically its own independently keyframed/draggable path object, separate from player paths, and timing between them is something the coach sets numerically (a delay, a keyframe number) rather than something the engine infers from "when a movement finishes." That's structurally the opposite of PáircVision's own decoupled-clock model (Phases + independently-paced Draw Runs, explicitly *not* keyframe-synchronized — that decoupling is the entire point of Hybrid Playback). This matches the same reasoned conclusion the earlier Continue-Run/Ball-Workflow audit reached from the same category of evidence: competitor tools *can* author an independent ball path, but the default, lower-effort way coaches represent "the ball is with whoever holds it" is state-based attachment, not a synced keyframe path — which is exactly PáircVision's existing model, not Option B's proposed completion-triggered model. No tool was found that documents Option B's exact mechanic; the closest documented pattern (DrawTactics' explicit numeric delay) is arguably closer to Phase-based sequencing than to route-completion-triggered reception.

Sources:
- [How to Create Animated Football Tactics in 5 Minutes | DrawTactics Blog](https://drawtactics.com/blog/product/how-to-create-animated-football-tactics)
- [Animated Football Tactics Board - Soccer Tactics Board Software | DrawTactics](https://drawtactics.com/animated-tactics-board)
- [Free Soccer Drill Animator Online — Create & Export Animated Drills | Tactico](https://tactico.pro/soccer-drill-animator)
- [SquadAnimator | Easy to use tactics and coaching animator for Soccer, Rugby and Gaelic Football](https://www.squadanimator.com/)
- [TacticalPad - The #1 app for drawing drills, lineups and tactics](https://www.tacticalpad.com/en-us/new/index.php)

## 5. Product philosophy — and a finding that changes the shape of the recommendation

Before choosing between A and B: **the coaching story in the brief may already be achievable today, with zero new code, by using a different existing mechanism than Tap Pass.**

The prior discoverability audit (`tactical-slate-pass-timing-discoverability-audit.md`) established that the **phase-drag mechanic** — drag the ball onto a player's token at a later Phase, then Add Phase — already correctly live-tracks a route-controlled receiver, because the classifier fix (`!routeControlledPlayerIds.has(targetAttachedPlayerId)`, `stepPlayback` `:3325`) lives in the *ordinary* phase-to-phase ball path, not inside Tap Pass. That fix is unrelated to and unaffected by anything audited here. Walking it against this exact scenario:

1. Ball attached to 13 (drag or Tap Pass — either works for the *starting* state).
2. Draw Run for 15, anchored to whatever phase transition is being authored.
3. Continue Run to extend 15's route with the post-reception movement — right away; Continue Run is pure route geometry and doesn't care about ball state at all.
4. **Instead of Tap Pass**, drag the ball from 13's token onto 15's token at a *later* Phase (one added after the point where 15's run should have "arrived"), then Add Phase. Because 15 is route-controlled, that transition is classified as live-tracked, not replayed — the ball chases 15's actual animated position during Play, using the same lead-capped smoothing already verified in this session's During Run recordings.

The ball stays glued to 13 for the whole pre-reception segment (nothing moves it until that later phase-transition is authored), then live-chases 15 for the rest of the route, Continue Run extension included, automatically, because ball-attach-follow doesn't know or care about entry boundaries. This is functionally very close to what the brief describes, using only mechanics that shipped and were verified earlier in this same PR series.

**The one real limitation:** phase-transition timing is coach-eyeballed, not frame-exact to "the instant the pre-reception segment finishes." Routes and Phases run on deliberately decoupled clocks (that decoupling is the entire point of Hybrid Playback), so there's no way to say "this Phase equals route-entry-completion" precisely — the coach picks a Phase that's *roughly* right. If chosen too early, the ball starts its chase before the coaching-intended reception moment (though it'll still read as "closing the gap," not teleporting).

This matters directly for how to weigh Option A vs. B: **Option B's real value-add over what's already shippable is precision, not new capability.** That changes what's being decided — not "can we build this," but "is frame-exact reception timing worth a new, non-trivial completion-triggered mechanism."

### Option A vs. Option B, given that

**Option A** (status quo: Tap Pass always instant) is correct **as a definition for Tap Pass itself** — an immediate, unconditional transfer is a real, common, legitimate coaching action (a quick exchange, a kickout arriving to a player already in position) and should keep meaning exactly that. The gap isn't that Tap Pass is wrong; it's that Tap Pass is being reached for in a scenario (delayed reception to a moving, routed player) that was always the phase-drag mechanic's job, not Tap Pass's.

**Option B**, if built, is the philosophically correct model for a coach's mental picture — "receive when the run finishes" is a one-sentence, no-memory-required idea, which is exactly the bar this project's own removal of Before/During/After was judged against. But it has a real cost the brief's "optimise for what a coach naturally expects" framing shouldn't paper over: **as specified ("automatically," with no new UI), it makes Tap Pass's outcome depend on invisible per-player state** — does this player have an entry, has it started, where's the marker — **which is precisely the "two different outcomes from the same tap, gated on an invisible precondition" pattern that this project already spent a full audit cycle removing** (Before/During/After's failure mode #1, verbatim). Building Option B without a visible on-canvas indicator of which players have a pending reception marker would trade one discoverability problem for a differently-shaped one; building it *with* that indicator is more honest but adds scope.

### Recommendation

Two-part, not a single pick:

1. **Immediately, no engineering required:** document/teach the phase-drag workaround above as the answer to this exact coaching scenario. It already exists, already works, and produces the described story with only a timing-precision caveat that most real coaching demonstrations likely won't notice (per the same reasoning the earlier audit used to justify removing the picker: a visual flourish, not a distinct coaching instruction, in the majority of cases).
2. **If frame-exact reception timing is later confirmed (from real coaching use, not guessed) to matter enough to be worth building:** implement Option B via the **marker-on-a-single-entry approach (§3, path b)**, not the split-entry approach (path a). Path (b) keeps Continue Run's existing single-entry, single-scheduling-trigger model completely intact (no new "start when a sibling entry finishes" scheduler concept, no risk to what was just shipped and verified) and only adds a conditional visual/data effect gated on route progress. It should ship with a visible on-canvas marker on the route stroke itself, specifically to avoid recreating the invisible-precondition problem named above.

**Estimated effort for the recommended Option B build (path b), if greenlit:**

| Area | Change | Size |
|---|---|---|
| `basicRouteFollow.ts` | Expose a `getLinearDistance(): number` getter (value already tracked internally as `linearDistance`) | Trivial |
| `RouteEntry` type + persistence | Add an optional `pendingPossession: { ballItemId: string; markerDistance: number } | null`-shaped field; extend `captureBoardState`/`importBoardState`/`sanitizeBoardRoutes` additively (missing field on legacy saves = no pending marker, matching the established backward-compatible pattern) | Small–moderate |
| `handlePossessionPassTap` | New branch: if the receiver has an in-progress/not-yet-started entry, record a marker instead of the current instant flight-and-attach; decide and build the "hold with passer, then chase" replacement for the now-invalid fixed-target flight animation | Moderate |
| `buildBasicRouteRunsForEntries` / `ActiveBasicRouteFollow` / `stepBasicRouteFollow` | Carry the precomputed marker distance per active run; each tick, once `session.getLinearDistance() >= markerDistance`, fire the attach once and clear the marker | Moderate |
| `renderBasicRoutePreview` | New: draw a visible marker on the route stroke at the reception point, so the pending state is never invisible | Moderate (new rendering, not just data) |
| Manual verification | Same rigor as this session's Multiple Draw Runs / Continue Run pass — screen-recorded, not just code-reviewed | Half a day |

**Total: roughly 2–3 focused engineering days** — larger than Continue Run's own build (audited and confirmed "well under a day"), comparable to or somewhat more than Multiple Draw Runs' (0.75–1.5 days), because this touches the route-follow primitive, the ball-attach state machine, persistence, *and* new rendering simultaneously, rather than any one piece being individually hard.
