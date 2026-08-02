# PáircVision — Tactical Slate Launch Readiness Audit

**Status:** Audit only. No branch, no code, no commit, no PR. Every claim below was re-verified directly against the current codebase and a fresh `typecheck`/`test` run in this session — not recalled from earlier conversation summary.

**Ground truth at time of writing:**
- Branch: `claude/tactical-slate-hybrid-audit-li8j9l`, 3 implementation commits (`81b26a8`, `e76abda`, `1e5fdc2`).
- PR #275: **open, not merged**, `mergeable_state: clean`.
- `npm run typecheck`: clean. `npm test`: 774/774 passing (53 files), re-run fresh this session.
- 5 audit-only markdown docs sit untracked alongside these commits — none of them represent shipped code.

---

## 1. Hybrid Playback

**✅ Complete** (implementation), with specific verification gaps noted below.

Confirmed present in code: `phasesRunning` flag, `maybeCompletePlayback()` (`:3087`), `startRoutesForResolvedSegment()` (`:3054`) — routes now start when their assigned phase transition resolves, not all at once at Play. Sequential (not simultaneous) playback is the core fix this line of work delivered, and it's the mechanism the During Run / After Run manual verification directly exercises (a route beginning mid-sequence, the ball waiting for or chasing it) — so this isn't just present in code, it's been watched working.

- Phase playback: ✅ pre-existing, unaffected.
- Draw Runs: ✅ shipped.
- Sequential (not simultaneous) playback: ✅ shipped, this is the headline fix.
- Correct playback-stage handling (`isPlaying` spans phases + routes + any in-flight pass): ✅ shipped, code-confirmed (`maybeCompletePlayback` checks all three conditions).
- Pause / Resume / Reset: **implemented, code-reviewed, not independently clicked in a browser this session.** The pass-timing recordings show a "Pause" button correctly enabling/disabling as playback state changes, which is *consistent* with correct behavior, but Pause, Resume, and Reset were never explicitly pressed and observed mid-playback in any browser session run in this project. Listed as outstanding, not as broken.

**Outstanding:** the original PR's own acceptance checklist still has unchecked items — pause/resume/reset during mixed phase+route movement, reset mid-route, replay after completion, a legacy board load, and 12 simultaneous routed players. None of these have been run. See **Regression Testing** in the final checklist.

## 2. Multiple Draw Runs

**🔵 Audit Only.**

Verified fresh, not recalled: `routeByPlayerId` is still declared as `Map<string, RoutePoint[]>` (`createTacticalPadLiteSurface.ts:1401`) — one route per player, full stop. The commit handler (`:4180-4189`) still does a single `routeByPlayerId.set(currentRouteDraftPlayerId, points)` — confirmed by direct read, not inference. **A second Draw Run for the same player overwrites the first.** There is no `RouteEntry`, no array, no per-route id anywhere in the file — a repo-wide search for `RouteEntry` returns zero matches.

The audited design (`routesByPlayerId: Map<string, RouteEntry[]>`, consolidating three parallel maps) is fully specified in `docs/tactical-slate-multiple-draw-runs-per-player-audit.md` but is a design document only — nothing from it has been implemented. Estimated remaining work (from that audit, still accurate): 0.75–1.5 days, one file.

## 3. Continue Run

**🔵 Audit Only.**

Verified fresh: zero occurrences of "Continue" in a route/run context anywhere in `createTacticalPadLiteSurface.ts` or `TacticalPadLiteClean.tsx`. What exists: the underlying data shape it would extend (`routeByPlayerId`) and, more importantly, the mechanical proof (from `docs/tactical-slate-continue-run-ball-workflow-audit.md`) that appending would work with the attached-ball system unchanged. What's missing: everything — the append operation itself, the "hasExistingRoute → offer Continue/New" UI prompt, and the one-entry-array-vs-most-recent-entry rule from the audit. Estimated remaining work: smaller than Multiple Draw Runs per the prior audit's own comparison — realistically well under a day once Multiple Draw Runs' `RouteEntry[]` shape exists to append onto, since Continue Run's append operation is the natural sibling of that structure's "push a new entry" operation.

## 4. Pass Timing

**🟡 Partially Complete** — engine and UI are implemented; discoverability was broken, is now fixed, but is not fully proven.

Confirmed present and wired: `passTimingControlledItemId`, `beginPassTimingTransition()`, `finalizePassTimingAttach()`, `stepActivePassTimingTransition()`, `onPassTimingChoiceRequested`, and the `PASS_TIMING_PROMPT_*` UI (prompt overlay, portrait variant, label/row/button styles) in the page component.

**Verified by screen recording, this session:** **Now** (byte-identical to the original instant demo) and **During Run** (ball visibly chases and attaches to the still-moving receiver) and **After Run** (ball stays with the passer for the run's full duration, then travels once it completes).

**Not verified: "Before Run."** No recording or screenshot in this session ever clicked the "Before Run" button — only `Now`, `During Run`, and `After Run` were exercised end-to-end. Before Run's trigger path (`finalizePassTimingAttach` called from `startRoutesForResolvedSegment` for `mode === "before-run"`) is code-reviewed and structurally simpler than the other two (an instant snap, not a travel), but "structurally simpler" is not the same as "watched working," and per the brief's own instruction this should not be assumed.

**Discoverability:** a real bug was found and fixed this session (the prompt was rendering but visually merged with an unrelated hint due to a z-index conflict) — confirmed fixed and re-verified. One rough edge remains, found and explicitly **not** fixed (documented as out of scope in the PR): once a coach leaves Ball mode after placing a ball, the only way back in without destructively re-placing a fresh ball is "Free Ball" in the ball popup — a button not obviously named for that purpose. Per the brief's own instruction ("if not [reliably discoverable]... classify as Partially Complete regardless of whether the engine works"), this — plus the unverified Before Run path — is why this is 🟡, not ✅.

## 5. Live Moving Receiver

**✅ Complete, verified.**

Confirmed present: the ball-transition classifier fix at `:3415` — `!routeControlledPlayerIds.has(targetAttachedPlayerId)` — which routes a pass to a route-controlled receiver through live position-tracking instead of a stale, captured authoring-time endpoint. This is the same mechanism the During Run screen recording directly proves: the ball closes distance to Player 9 frame by frame while they're still moving, then attaches mid-route. Both code-confirmed and watched working.

## 6. Clean Playback

**✅ Complete**, with one half more directly proven than the other.

Confirmed present: `resolveAlphaScale()` returns `0` for committed routes whenever `isPlaybackInputLocked()` is true (`:2924` area), and `emitPlaybackStateChange()` calls `renderBasicRoutePreview()` inside its `if (!isPlaying && !isPaused)` branch (`:1457-1460`) to restore them once playback fully stops — the same call site and pattern already used to restore the Shape Lock guide, not a new mechanism.

**Hiding is directly screenshot-proven**: the During Run and After Run recordings show the drawn route stroke completely absent throughout playback, confirmed by direct comparison against the pre-Play screenshots where it's visible. **Restoring after stop is code-confirmed but not independently re-screenshotted** — no screenshot in this session specifically captured the moment playback ends and the line reappears. Low risk given it reuses an already-proven pattern, but flagged for the regression pass rather than assumed.

No further UX polish identified as outstanding for this specific feature.

## 7. Ball Workflow

Current capabilities, verified:

- **Attach Ball:** ✅ pre-existing (`attachPrimaryBallToPlayer`), unaffected by this line of work.
- **Detach Ball:** ✅ pre-existing (`detachPrimaryBall`, the "Free Ball" button), unaffected.
- **Tap Pass ("Now"):** ✅ preserved byte-for-byte, screen-recorded verified.
- **Timed Pass (Before/During/After):** 🟡 per §4 — three of four modes verified, one discoverability rough edge open.
- **Continue Run with an attached ball:** 🔵 — inherits Continue Run's own status (not built). Worth restating precisely, since it's easy to lose in the shuffle: the architecture audit for this specific combination concluded it needs **zero new ball-specific code** once Continue Run exists, because the attached ball's position is fully derived from its holder every frame regardless of how the holder's route was authored. This is not additional scope on top of Continue Run — it's covered by it automatically.

**Already working and easy to have forgotten about:**
- The routed-player cap was raised from 6 to 12 in this line of work (`MAX_BASIC_ROUTE_PLAYERS`) — a one-line change buried inside a larger PR, confirmed still in place and visible in the UI as "Routes 12" during manual testing.
- Sliotar ball types (`sliotarSmall`/`sliotar`/`sliotarLarge`) already run through the exact same `isBallItemType()`-gated code path as footballs — hurling ball support requires no additional engine work today, for any of Attach/Detach/Tap Pass/Timed Pass.
- The ball-item data layer already supports more than one ball object coexisting (`ballStatesByItemId` is keyed by item id, not a singleton) — the multi-ball limitation is confined to the UI's destructive placement filter and the `findPrimaryBallItem()` gesture-resolution convention, not the data model (see the Free Ball capability audit).

## 8. Remaining Tactical Slate Work Before Launch

Only work required to finish Tactical Slate itself — excludes Football Routes, Multiple Footballs, Tactical Play, and any Scenario Engine, per instruction.

| Item | Estimate |
|---|---|
| Multiple Draw Runs (`routeByPlayerId` → `RouteEntry[]`, per the multi-run audit) | 0.75–1.5 days |
| Continue Run (append operation + reuse of the existing compact-choice prompt pattern) | well under 1 day, once the above lands |
| Pass Timing discoverability polish — a non-destructive way back into Ball mode (currently only "Free Ball," which detaches) | 0.25–0.5 day |
| Manual verification of "Before Run" specifically (QA, not new code — reuse the existing recording scripts) | under an hour |
| Full regression pass against the original acceptance list: pause/resume/reset mid-phase and mid-route, reset mid-route, replay after completion, legacy board load, 12 simultaneous routed players, phase-only boards | 0.5–1 day |
| Clean Playback restore-after-stop — targeted re-verification (screenshot the moment playback ends, not just the code path) | under an hour, foldable into the regression pass above |

Nothing else was found in the codebase that blocks launch — no partially-started features, no dead code paths, no TODO markers tied to this work.

---

## Launch Checklist

- ✅ Hybrid Playback
- 🔵 Multiple Draw Runs
- 🔵 Continue Run
- 🟡 Pass Timing UX
- ✅ Live Moving Receiver
- ✅ Clean Playback
- ⬜ Regression Testing (pause/resume/reset, legacy boards, 12 routed players, "Before Run" specifically)
- ⬜ Ready to Merge

**Bottom line:** three features (Hybrid Playback, Live Moving Receiver, Clean Playback) are implemented and meaningfully verified, not just typechecked. Pass Timing works but has one known, unfixed discoverability edge and one unverified mode. Multiple Draw Runs and Continue Run remain fully unimplemented — audited and scoped, not started. Nothing here is blocked or uncertain; what's left is a known, bounded list, not open questions.
