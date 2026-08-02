# PáircVision — Route Authoring Workflow Audit

**Status:** Audit only. No code changes, no branch, no commit. Verified by directly driving the running app in headless Chromium (click-by-click, screenshotted at every step) — not from reading engine state alone, per the brief's explicit instruction. One finding below only surfaced *because* of that: a code-level reading of the ball-drag gate suggested something that turned out not to be true in practice.

---

## 1. While authoring a Draw Run, can the coach currently...

All four tested by actually entering Route mode with a run mid-authored, then attempting each action for real.

| Action | Result | Evidence |
|---|---|---|
| Add a new Phase? | **No.** | Add Phase renders disabled the entire time Route mode is active. A direct click attempt had zero effect — the Phase counter read "Phases: 0" before and after. |
| Attach the ball to another player? | **No.** | Tapping a different player (6) while still in Route mode did not touch the ball at all — the ball stayed exactly on its previous holder (13), unmoved. The tap was consumed entirely as "select player 6 for route purposes" (a visible selection ring appeared on 6), not as any ball action. |
| Move a Free Ball? | **No** — and this one is worth flagging specifically. | A direct drag gesture on a free-standing (unattached) ball while Route mode was active produced **zero movement** — screenshotted before and after, pixel-identical. This contradicts what a pure code read suggested: the gate function for free-ball dragging (`isFreeBallInteractionEnabled`) checks `isFree`, `activeWhiteboardTool`, and playback-lock state, but never explicitly checks `isRouteCaptureMode`. Reasoning from that function alone, dragging looked like it might still work. It doesn't, in practice — something else in the input-routing (most likely the route-capture pointer layer sitting in front of/ahead of the ball's own hit target) blocks it. This is exactly the kind of gap that only shows up by actually testing, not by reading gate conditions. |
| Continue the existing run? | **Yes.** | Continue Run is visible, enabled, and directly usable for the currently-selected player while still in Route mode — this is the one part of the four that already works today. |

**Bottom line on the premise:** the brief's suspicion is correct. A coach genuinely cannot add a Phase, touch the ball, or move a free ball while authoring a Draw Run — three of the four actions require physically leaving Route mode first. Only Continue Run works in place.

## 2. Is the previously recommended Phase-based workaround actually achievable using today's UI?

**Yes — confirmed by actually running the full sequence — but the earlier audit described the wrong gesture, and the true mechanism is simpler than "drag the ball onto the token."**

Walked start to finish, live:

1. Ball tapped onto player 13 (in plain Move mode — tapping a player when *not* in Tap-Pass mode calls the same instant, unconditional `attachPrimaryBallToPlayer` used everywhere else, no popup involved).
2. Switched to Route mode, selected player 15, drew the first run.
3. Switched back to Move mode. **Tapped player 15's token directly** (not a drag — a plain tap). The ball instantly and cleanly snapped from 13 onto 15, at the same standard attach-offset every other attach uses. *A drag of the ball item itself does not do this* — dragging just repositions the ball as a loose object; the earlier audit's "drag the ball onto the token" phrasing was imprecise. The actual gesture is: leave Route mode, tap the receiving player's token.
4. Add Phase — now enabled (confirmed not disabled) — committed that transition.
5. Switched back to Route mode, **without re-tapping player 15**. Continue Run was already visible and enabled, no re-selection needed — the selected-player context survives the Move↔Route round trip cleanly.
6. Coach draws the remainder of 15's run via Continue Run.

Every step in that sequence was clicked for real and screenshotted; none of it required a feature that doesn't exist today. **The workaround is real and usable right now.**

What it costs the coach, though — and this is the actual finding worth acting on, separate from "does it technically work":

- It's not one continuous authoring motion. It's Route → Move → Route, three explicit mode switches, to do what the brief frames as one idea ("13 has ball, 15 runs, 15 receives, 15 continues").
- At the moment of tapping 15 to attach the ball (step 3), the ball visually snaps onto 15's *current, pre-run* position on screen — because nothing has "run" yet at authoring time, only at Play. A coach watching the board mid-authoring sees the ball sitting on 15 before 15 has moved anywhere, which reads as "15 already has it" rather than "15 will receive it once their run resolves." The correctness only becomes visible once Played.
- There's no on-canvas marker distinguishing "this attach is meant to represent a later reception" from an ordinary immediate attach — the coach has to trust the phase-timing mechanism rather than see it.

So: achievable, not fabricated as a fallback — but not the fluid, single-mode workflow the brief's four-step diagram implies either.

## 3. Smallest change that gets to the natural sequence, without Tactical Play concepts

Since the workaround *is* achievable, the real gap isn't missing capability — it's that three unrelated actions (Draw Run, Add Phase, ball attach) are needlessly forced into separate, mutually-exclusive modes when nothing about their underlying data actually conflicts. Two separate, independently small fixes close nearly all of the gap:

**(a) Stop disabling Add Phase during Route capture mode.** `isAddPhaseBlocked = isPlaybackLocked || routeState.isRouteCaptureMode` (`TacticalPadLiteClean.tsx`) — nothing in Add Phase's own logic (`captureBoardState`-style snapshot capture) depends on or is affected by whether Route mode happens to be active; the two are unrelated data. This is a one-line condition change with no downstream effect. Once relaxed, a coach can Add Phase without leaving Route mode at all.

**(b) Add an "Attach Ball" button, exactly like Continue Run was just built.** The reason ball-attach needs a mode switch today is that tapping a player token is already claimed by route-selection while in Route mode — that's a genuine gesture conflict (touch input needs one unambiguous meaning per tap), not a bug, and shouldn't be "fixed" by making taps do two different things depending on hidden state (that's precisely the Before/During/After failure mode this project already removed once). The clean fix is the same pattern Continue Run already established: a new, always-visible, contextually-enabled control-bar button — **"Attach Ball"** — enabled whenever a ball item exists and a player is currently selected (`selectedPlayerId`, which Route mode already tracks and exposes), that calls the exact same already-existing `attachPrimaryBallToPlayer(selectedPlayerId)` used by the Move-mode tap gesture. No new selection concept, no new animation, no new engine primitive — it's a thin button wired to a function that already exists, reusing state that already exists.

Together, (a) + (b) produce the brief's exact diagram without ever leaving Route mode:

*Draw Run for 15 → tap Add Phase (now reachable in place) → tap "Attach Ball" (now reachable in place, ball snaps to 15) → Continue Run (already worked) → draw the remainder* — one continuous flow, zero mode hops, no Tactical Play concepts introduced.

**What's deliberately left out of this minimal fix:** Free Ball dragging inside Route mode. It's a real gap (confirmed above), but it's not implicated by the "13 has ball → 15 runs → 15 receives" story at all — that story never involves a loose, unattached ball — and forcing free-ball drag to also work mid-route reopens the same touch-gesture-disambiguation question note (a) and (b) were designed to sidestep. Worth a follow-up only if a coaching scenario is found that actually needs it.

**Effort:** (a) is a one-line UI condition change. (b) is smaller than Continue Run's own build was (~well under a day) — it needs no new engine state, no persistence changes, and no new animation; it's a control-bar button and a one-line wrapper around a function that's been shipped and working since before this line of work started. Realistically **under half a day** combined, including verification.
