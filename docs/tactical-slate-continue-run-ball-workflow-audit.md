# PáircVision — Tactical Slate: Continue Run & Ball Workflow Audit

**Status:** Audit only. No branch, no code, no commit. Tests whether the proposed workflow — Draw Run, Tap Pass (Timed Pass), Continue Run — makes a separate Football Route system unnecessary for launch.

---

## The Mechanical Claim, Checked Against the Real Engine First

Before estimating coverage, it's worth confirming the proposed workflow actually *works* mechanically, because the answer changes what this audit is: not a proposal for new capability, but a claim that already-shipped and already-scoped pieces compose into the desired experience with nothing new built for the ball specifically.

Walking it against the current code plus the already-audited (not yet built) Continue Run:

- **"Player 2 has possession"** — ball attached to Player 2. Shipped.
- **"Draw Run for Player 6"** — an ordinary Draw Run. Shipped.
- **"Tap Pass to Player 6" / "receives at the end of that Draw Run"** — this is exactly **After Run** from the Timed Pass feature: tap the passer, tap the routed receiver, choose After Run. Shipped and screen-recorded working: the ball stays with the passer for the run's full duration, then travels once it completes.
- **"Continue Run, now carrying the ball"** — this is where the claim lives or dies. Per the prior Continue Run audit, appending points is *purely additive to the point array* — same `RouteEntry`, same `BasicRouteFollowSession`, same `startSegmentIndex`. The ball, meanwhile, is attached and **derives** its position every tick from `updateAttachedBallsForPlayer()`, which already runs unconditionally for any route-controlled player, already proven correct for routes spanning multiple phases in PR #275. The attached-ball mechanism has no concept of "how long" or "how many installments" a route was drawn in — it just asks "is this player route-controlled right now, and if so, where are they." Appending more points to that same route changes nothing about that question.

**Conclusion: the ball needs zero new code to carry through a Continue Run.** This isn't a design goal to build toward — it's already true, as a consequence of two independent facts already established (attached-ball-follows-holder is fully derived; Continue Run is a pure point-array append). The workflow in the brief is achievable with what's already shipped plus what's already scoped for unrelated (player-only) reasons.

---

## 1. Does This Eliminate the Need for Football Route in the Majority of Situations?

**Reasoned estimate, not measured data: roughly 80–90% of typical GAA tactical demonstrations.** The basis for this: GAA tactical coaching content is dominated by structured possession sequences — building an attack, supporting a runner, switching the point of attack, overlap play, hand-pass/kick-pass chains — all of which are, at their core, "a named player has it, passes to a named player, who does something next." That's exactly Draw Run + Tap Pass + Continue Run's shape. The genuine exceptions are enumerated precisely in §4 and are structurally different in kind (no determinate holder, no determinate named receiver, or a contested outcome) rather than a large adjacent category — which is why the estimate skews high rather than being a rough 50/50 split.

This is a judgment call, not a usage-telemetry finding — PáircVision has no usage data yet to confirm it, and it should be treated as a testable assumption once the app is in coaches' hands, not a settled number.

## 2. Does This Mirror How Leading Tools Are Actually Used?

**Distinguishing capability from practice, as asked:**

**What's technically allowed:** confirmed in the prior audit's research — SportDraw explicitly supports animating "linear and curved motion of players **and balls** between frames," so an independently-authored ball path is a real, marketed capability in at least one competitor.

**What coaches likely actually build, in practice — reasoned, not sourced from usage data (no telemetry is publicly available for this):** in any frame/waypoint-based tool, the path of least resistance for "the ball is with a player" is to let the ball sit at whoever holds it at each frame — functionally identical to PáircVision's own existing attached-ball model. Authoring an independently-moving ball path is *available* but is the higher-effort path, reached for specifically when the demonstration needs a ball that isn't with anyone (see §4) — not the default way coaches represent an ordinary "run, receive, continue" sequence. This reasoning is inference from how these tools are structurally built, not a verified count of real coach behavior, and should be stated with that caveat rather than asserted as fact.

## 3. Product Comparison

| | **Option A** — Draw Run → Receive → Continue Run | **Option B** — Draw Football Route → Attach → Continue |
|---|---|---|
| **Simpler to author?** | Yes — reuses gestures already shipped and verified (Draw Run, the Timed Pass prompt) plus one small, already-scoped append operation. | No — requires learning to select and draw a path for the ball specifically, a new gesture, plus knowing *when* to reach for it instead of Option A for the same everyday case. |
| **Easier to understand?** | Yes — one continuous idea, matches how a coach would narrate the play out loud ("Player 6 runs, gets it, keeps going"). The ball's position is always correct by construction — there's nothing to reconcile. | No — introduces a second authored path a coach has to keep visually consistent with the player's path; if they don't line up, the demonstration reads as a mistake even when it isn't one. |
| **Faster on phone/tablet?** | Yes — fewer total gestures, no ball-selection step, reuses interactions already touch-optimized this session. | No — an extra authoring pass over the same time window. |
| **More consistent with Slate's identity?** | Yes — stays inside the existing "attached ball is derived, not authored" model the Free Ball audit confirmed is already Slate's ball philosophy. | Not currently — it's the second ball-movement authoring surface the actor-routes note flagged as a real product-simplicity and maintenance cost, only worth taking on for a specific need Option A can't meet. |

Option A wins on all four, not narrowly.

## 4. Remaining Gaps — Genuine Limitations of Option A

Listing only real gaps, not padding:

- **Kicking into empty space.** Tap Pass / Timed Pass always requires a receiving *player* — there is no "pass to this point on the pitch" gesture. A clearance or a hopeful ball with no specific intended receiver cannot be represented.
- **Breaking ball / contested restart.** Option A models discrete states: attached to exactly one player, or free. It has no notion of "contested — could go to either," or an unpredictable bounce. This also covers the contested-kickout case specifically (a *clean* kickout to a named player is already covered by an ordinary Tap Pass/Timed Pass and is **not** a gap — the gap is only the contested, not-yet-possessed version).
- **Goalkeeper distribution.** Not a gap on its own — distribution to a specific named player is an ordinary Tap Pass. It only becomes the breaking-ball gap above if the restart is contested rather than aimed.
- **Ball arriving ahead of a runner.** Partial gap, worth being precise about rather than calling it a hard zero: During Run's live-tracking, with its lead-cap smoothing, already produces *some* leading effect since the ball can't teleport onto a moving target — but there's no way to author "the ball should reach a specific point in space ahead of the runner's current path," only "the ball should reach the runner." A deliberately overshot, space-targeted pass is not expressible.
- **Two players chasing a loose ball.** A genuinely different, contested-outcome scenario — every ball action in Option A starts from a determinate holder or resolves to one determinate named receiver. There's no way to express "either of these two might get there first."

## 5. Tactical Play Boundary

Confirmed, and the reasoning from the prior Continue Run audit still holds under this specific comparison:

- **Slate:** Run → Receive → Continue Run — three conceptual beats, each authored by feel (drag, tap-and-choose, drag), with no per-beat timing, duration, or trigger configuration anywhere in the chain.
- **Play:** Run → Loop → Delay → Receive → Carry → Pass → Recover — seven distinct, individually named states, each implying its own configurable timing/trigger/duration. That's a materially different authoring model, not a longer version of the same one.

The boundary is still structural, not just a design intention: Continue Run stays an append to one flat point array, never becoming a list of independently named, independently retimeable legs. Play's "Loop"/"Delay"/"Carry"/"Recover" are exactly the kind of discretely-configurable state Slate's data model has no field for — there's no per-leg duration, no trigger/condition, no leg list to select and edit. This workflow keeps Slate inside the design-board philosophy: one continuous authored idea with implicit, automatic timing, not an engineered sequence of individually tunable states.

## 6. Recommendation

**A. Continue Run is sufficient for launch. Football Route should wait until after launch.**

Justified on coaching workflow, not just technical capability, per the brief: the workflow described in this audit is not a reduced or compromise version of what a Football Route would provide — for the large majority of real GAA tactical demonstrations (§1), it already produces the exact coaching narrative asked for ("Run → Receive Ball → Continue Run → Continue Run"), using a Timed Pass mechanism that's already shipped and screen-verified, and a Continue Run addition that's already scoped, small, and was going to be built regardless for player-only reasons. Nothing about reaching this experience required inventing a second ball-movement system.

The genuine gaps in §4 are real, but they share a pattern: they're all scenarios where the ball has no determinate holder or no determinate named receiver — loose, contested, or space-targeted. That's a coherent, identifiable minority of coaching content, not scattered edge cases, which means it can be evaluated later with actual usage from launch rather than guessed at now. This is also the same sequencing every prior audit in this line of work has converged on independently: ship what's proven and low-risk now, defer the actor-generalization work (of which Football Route is the concrete instance) until there's a specific, demonstrated need rather than a hypothetical one.

Do not build Football Route because it's technically possible or because a competitor offers it — build it if and when launch usage shows coaches consistently reaching for workarounds to represent exactly the §4 gaps, which is a decision with real evidence behind it instead of a guess made before a single coach has used the feature.
