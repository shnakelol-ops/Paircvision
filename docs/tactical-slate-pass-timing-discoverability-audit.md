# PáircVision — Tactical Slate: Pass Timing Discoverability Audit

**Status:** Audit only. No branch, no code, no commit. Judged as a coach opening the app for the first time, not as a defense of shipped work.

**Starting position, stated plainly:** the previous audit classified Pass Timing 🟡 for a code-level reason (one mode unverified, one rough edge). This audit is a different and harder question: even where the engine is fully correct, is the *interaction* one a coach would ever find or explain? Real-world testing says no. That's taken as decisive evidence here, not a data point to explain away.

---

## Walking the Actual Path, Out Loud

To test "can I explain this to another coach," here is the literal current sequence, stated the way it would have to be spoken:

*"Draw a run for the player who's going to receive it. Then tap Ball — if a football's already down, tap it again to close the popup and tap it once more. Pick Football, then pick a size — this places a new ball, or replaces the one you had. Now tap whoever currently has the ball. Then tap the player you drew the run for. If — and only if — you drew a run for them, a menu pops up letting you pick when the pass happens."*

That is not explainable in one sentence, and every one of the four `if` conditions embedded in it (do you already have a ball, does the popup need closing first, did you remember which player has a route) is a place the flow can silently fail to do what a coach expects.

## Why It Fails Discoverability Specifically

1. **Hidden branching on an invisible precondition.** Tapping a player produces two entirely different outcomes — an instant pass, or a prompt — based on whether that player has a Draw Run. Nothing on the token itself signals which outcome tapping it will produce. A coach can't predict the interaction from what's on screen.
2. **The entry point is a placement flow, not a passing one.** To reach pass mode at all, a coach has to go through "Ball → Football/Sliotar → size" — a *ball-creation* flow. Someone looking for "how do I pass" has no reason to expect that path, especially confusing when a ball already exists (the size picker reappearing reads as "make a new ball," not "get ready to pass").
3. **Four abstract labels require holding state across time.** "During Run" only means something if the coach remembers, several actions later, which player they drew a run for and connects that memory to a differently-worded button. That's real memory load for a tool whose entire identity is meant to be fast and whiteboard-like.
4. **No in-context help exists at the moment it's needed.** The app has an onboarding tour, but nothing was found that walks through this specific mid-session branching moment — a coach only encounters it by accidentally tapping the right player at the right time.

This is not a minor polish gap. It is a genuine mismatch between what the feature does (something clever) and what a coach can form a mental model of (nothing at all, on first contact) — exactly the distinction the brief draws, and the right basis for judging it.

## The Overlooked Fact That Should Drive the Decision

**A simpler, already-shipped, more discoverable path already produces the same coaching outcomes — it isn't a hypothetical replacement, it already exists.**

Dragging the ball onto a player's token at a given Phase, then clicking Add Phase, is the oldest and most-already-understood ball mechanic in Tactical Slate — no popup, no mode switch, no hidden branching. Checked directly against what PR #275 actually fixed: the live-tracking classifier (`!routeControlledPlayerIds.has(targetAttachedPlayerId)`, confirmed in the previous audit) means this plain drag-and-attach gesture **already** correctly tracks a moving, route-controlled receiver — that fix wasn't scoped narrowly to the picker, it lives in the shared phase-to-phase ball path every ordinary drag already uses. Concretely, all three named timings are already approximated by *where* the coach chooses to drop the ball:

- **"Before Run"** — attach at any phase before the receiver's route starts. This is the plainest, oldest case in the engine — zero special-casing involved at all.
- **"During" / "After Run"** — attach at any phase after the route starts. The live-tracking fix means the ball correctly closes distance to wherever the receiver actually is; an earlier later-phase reads roughly as "during," a comfortably later one reads as "after."

This isn't pixel-precise the way the dedicated route-start/route-completion hooks are, and it loses one real thing (below) — but it is **visible, editable, and already understood**, versus a hidden choice with no on-screen trace of what was picked.

**What's genuinely lost if the picker is removed:** the smooth, continuous "ball visibly chasing a moving player mid-stride" animation the dedicated During Run hook produces. That's real, but it's a visual flourish, not a distinct coaching instruction — a coach describing this out loud says "he runs, then gets it," not "the ball began travelling at the exact instant his feet started moving." It's also the one case not achievable by the phase-drag alternative for a board authored with zero Phases at all (pure Draw-Run-only boards) — a narrower authoring style than the phase-structured boards every example in this audit series has used, including the coach's own.

## Judging the Three Options

**Option C (retain as-is) does not clear the bar, on the brief's own test.** A first-time coach is expected to discover it by tapping the right kind of player (one with a route) while in the right mode, with no visual cue beforehand and no in-context explanation — that's not "obvious without documentation," that's discoverable only by accident or a manual. Retaining it can't be justified by engine sophistication alone, per the brief's explicit instruction, and this audit doesn't find a coaching-workflow reason strong enough to outweigh the discoverability failure just documented.

**Option B (a simpler replacement, e.g. "Pass Now" / "Pass at End of Run")** is a real improvement in isolation — two plain-language outcomes are explainable in one sentence, unlike four abstract labels. But it still requires solving the harder problem: the entry point still has to be discoverable, and the hidden-branching-on-invisible-precondition issue (§2 in "Why It Fails") doesn't go away just because the resulting menu is shorter. It's a better version of the same shape of interaction, not a fix for what actually broke discoverability.

**Option A (remove the picker, rely on Attach Ball + Tap Pass + the phase-drag mechanic + Multiple Draw Runs/Continue Run)** is the strongest fit, for a reason beyond "simpler is better": the alternative isn't hypothetical or unbuilt — it already exists, already works (thanks to a fix that was never scoped narrowly to the picker in the first place), and is *more* discoverable than either the current picker or a redesigned one, because it reuses a gesture every coach already has: drag the ball, add a phase. It doesn't ask the coach to learn anything new at all.

## Recommendation

**Option A.** Remove the Before/During/After picker and its Ball-mode-popup detour. Keep Attach Ball and Tap Pass exactly as they are. Lean on the already-correct phase-drag ball mechanic — which already benefits from the live-tracking fix — combined with the upcoming Multiple Draw Runs and Continue Run to carry the "run → receive → continue" narrative this whole line of work was built to support.

This is not a capability regression dressed up as simplification — checked directly, the phase-drag path already produces equivalent outcomes for all three named timings, using an interaction every coach already understands, with the one honest exception being a smooth mid-run chase animation on Draw-Run-only boards with no Phases, which is a visual nicety on a narrow authoring style, not a coaching capability gap.

If real launch usage later shows coaches specifically reaching for that missing live-chase animation, or specifically building Phases-free, Draw-Run-only boards where the phase-drag alternative genuinely can't reach, that's the moment to revisit — with real evidence, and starting from Option B's plain-language shape ("Pass Now" / "Pass at End of Run") rather than the current four-label picker. Not before.

**What this changes on the launch checklist:** removes the "🟡 Pass Timing UX" line and its associated regression items (Before Run verification, the Ball-mode re-entry rough edge) entirely — there's no UX to finish polishing if the picker isn't shipping. `passTimingControlledItemId`, `beginPassTimingTransition`, `finalizePassTimingAttach`, `stepActivePassTimingTransition`, the `onPassTimingChoiceRequested` callback, and the `PASS_TIMING_PROMPT_*` UI would need to be removed as dead code before merge — this is itself a small, bounded piece of cleanup work, not a redesign, since none of it is depended on by Hybrid Playback, Live Moving Receiver, or Clean Playback (confirmed: the live-tracking classifier fix those depend on lives in the ordinary ball-attach path, not inside the picker's own code).
