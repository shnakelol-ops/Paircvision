# Review Edit safety repair: verification

- **Branch:** `claude/event-stats-review-edit-safety`, commit `f48e6d5`, based on main `c06dd79`.
- **Evidence:** `persistence/probe-review.mjs`, `persistence/run-match-clearplayer.mjs`, `persistence/results/review-*.json|png`, `results/re/`.

## Files changed

| File | Change |
|---|---|
| `src/pro-tagger/pro-tagger-review-edit.ts` (new) | `editableKindsFor` decides what the Type list offers; `applyReviewKindEdit` applies a change or refuses it with a reason. |
| `src/pro-tagger/ProTaggerReviewScreen.tsx` | The Type list uses `editableKindsFor`. Save goes through `applyReviewKindEdit`. A refusal shows one red line in the existing edit form and saves nothing. |
| `src/pro-tagger/pro-tagger-review-edit.test.ts` (new) | 17 tests |

## Rules

- **Allowed changes:** only within the event's own family, where the team side means the same thing before and after:
  - attempts;
  - kickout won ↔ lost;
  - turnover won ↔ lost;
  - free won ↔ conceded;
  - yellow / sin bin / red.

  No event is ever moved to the other team.
- **Sport and capture rules:** only kinds normal capture produces for the sport.
  - No two-pointers in hurling or camogie.
  - Sin Bin only where capture offers it.
  - FREE_SCORED, FREE_MISSED and POSSESSION_* are never offered.
  - 45/65 and Sideline allow player edits only.
- **Shot → score or wide:** allowed. The source stays unknown: shot-outcome tags are removed and no source is invented.
- **Score or wide → shot:** refused, because the outcome isn't known.
- **45 two-pointer:** needs a recorded 45 source. A two-pointer with a 45 source is stored as a 45 two-pointer.
- **Tags:** tags that don't fit the new kind are removed, and Free and card tags follow the kind. Tags Event Stats doesn't know are kept.
- **Kickout won ↔ lost:**
  - refused while a player is attached, because the player was on the winning side;
  - once the player is cleared, the change is allowed and the squad reference moves to the new winner's squad.
- **Unchanged:** player number/name editing, and the roster resolution by `squadId`.

## Before / after (real Review screen, Pixel 7 emulation)

| Case | main `c06dd79` | This branch |
|---|---|---|
| Type list for any event | all 23 kinds | the event's own family only (e.g. a shot gets GOAL, POINT, TWO_POINTER, WIDE, SHOT) |
| Blocked shot → Point | POINT, **tag BLOCK/SAVE kept** | POINT, tags `[]` (source unknown) |
| Turnover lost → Point | **saved as our POINT** (team side FOR) | Point not offered; turnover unchanged |
| Kickout won → lost, player #2 attached | **saved, #2 still attached** | refused: "Clear the player before changing who won the restart — the player tagged was on the winning side." |
| Same, player cleared | n/a | saved: KICKOUT_CONCEDED, no player, squad = away |
| 45 won → 45 lost | **saved** | not offered |
| Edit while storage is full | — | alert "Change not saved. Save failed — storage full. …"; stored event unchanged; Review still shows the stored type (screenshot) |

## Automated tests

- **Full suite:** 3076 / 3076 tests pass (main: 3059; +17). No new type errors. Build passes.
- **Intermittent failure, unidentified:**
  - One gate run on `f48e6d5` reported "1 failed file, 2 failed tests | 3074 passed".
  - The gate script kept only the summary lines, so neither the file nor the tests can be named, and the cause (timing, isolation, environment or a defect) **cannot be determined from the evidence**.
  - The same commit then passed 14 consecutive full runs (7 on 4 Nov; 7 in final verification, the later 6 with full JSON output kept: `scratchpad/flaky-run-*.json`).
  - It was a single run among concurrent local work (scripted browser runs and dev servers earlier in the session). That is a possible factor, not a demonstrated cause.
  - The repository has no CI that runs the suite, so there is no second source of evidence.

## 636-event regression (unchanged authoritative ledgers)

**A and C:** 0 changed checks. Legacy import: 28/28. Cross-page: 27/27.

**B with the unchanged harness:** 39 checks changed, all on the "reopened after review edits" surfaces.
- Cause: the scripted edit B-176 (kickout won → lost, our #8 attached) is now refused, and the harness does not detect the refusal.
- B's live surfaces are unchanged.

**B with the edit made as the new form requires** (clear the player, then save; `run-match-clearplayer.mjs`): **2 checks changed**, both for player #8's restart record.

| Check | Expected (ledger) | Actual |
|---|---|---|
| Player Breakdown FOR #8, KO W-L | 8–1 | 8–0 |
| Player Contributions FOR #8, KO W-L | 8–1 | 8–0 |

The reference keeps #8 attached to the restart once it is marked lost. Capture never does that: a restart won by the opposition is tagged with an opposition player. The new rule therefore requires clearing #8.

**This is the intended effect of the approved rule. The independent expectations are not edited.**

### What B-176 represents

| | Original capture | Corrected by Review Edit |
|---|---|---|
| Stored event | KICKOUT_WON, team side FOR, restart owner FOR, tag CLEAN, player FOR #8 | KICKOUT_CONCEDED, team side FOR, restart owner FOR, tag CLEAN, no player, squad = away |
| Meaning | Our kickout, won by us, caught by our #8 | Our kickout, won by the opposition, no player recorded |
| Who owns the restart | Ballyboden (FOR) | Ballyboden (FOR), unchanged |
| Who won it | Ballyboden | Na Fianna |

- **Should #8 keep won/lost credit?** No.
  - #8 was recorded as the Ballyboden player who caught the ball. Once the restart is recorded as won by Na Fianna, nothing in the record says #8 was involved.
  - The ledger's 8–1 assumes #8 "lost" this restart. That is a fact the original capture never recorded.
  - On main, the edit silently kept #8, which is how the app produced 8–1 before. That is the F-08 risk 4 this PR closes.

### Equivalence with live capture

An equivalent live capture is: Restart tile **Clean**, our kickout (OUR K/O, the default), **Na Fianna's row** tapped, and the same pitch spot.
- The picker would then offer only Na Fianna players, so #8 could not be attached.
- Scratch test `persistence/b176-equivalence.test.ts.txt` builds that event with the real `adaptProTaggerAction` and swaps it into the final match B in place of the edited one.
- **Result: identical** on every surface compared:
  - stored fields (except `squadId`);
  - `buildMatchReport` for FULL, 1H and 2H (restarts, chains, possessions, turnovers, placed balls, score ledger);
  - `buildInfluenceAnalysis`;
  - `collectPlayerStats` (FOR #8 = KO 8 won, 0 lost in both).
- **Only field difference:** the edited event stores `squadId` = Na Fianna's squad; capture with no player stores none.
  - No statistics code reads `squadId`. It is used only to pick the roster when a number is typed in a later Review edit.
  - With it, a number later typed for this restart resolves against Na Fianna, the winning side, exactly as the live picker would.
  - Without it, the legacy fallback would use Ballyboden's roster.

### Corrected fixture (proposed; applied 7 Nov, see below)

The ledger expectation is invalid for this edit, not the app. Proposed separately, for owner approval:
- In fixture B, the B-176 review op becomes "kickout won → lost, **player cleared**", and the reference's `applyReviewOp` drops the player when it flips a restart winner.
- The expected FOR #8 KO W-L becomes **8–0** in both the Player Breakdown and Player Contributions rows.
- No other expectation changes (verified: those 2 are the only differing checks).

## Final verification (head `f48e6d5`)

- **Tests and build:** 3076 / 3076. Type check: the same 14 pre-existing error files as main. Build passes.
- **Regression:** A and C 0 changed; B as above; legacy 28/28; cross-page 27/27.
- **Vercel:** Ready (status "success", deployment completed) on `f48e6d5`.
- **Review comments:** none.

## Remaining risks

- Event type labels in the edit form are still the raw names (e.g. TWO_POINTER). That is F-12, out of scope.
- A legacy event that already holds an inconsistent combination (e.g. a POINT with BLOCK/SAVE from an earlier edit) is left as it is until it is edited again.
- No undo for a saved edit (unchanged).

## Fixture correction and merge verification (7 November 2026, owner-approved)

**Fixture correction.** Details and the original files are in `expected-history/pre-pr382/`.
- The B-176 review op now clears the player before changing the restart winner. This is applied in the fixture, the generator, the reference and the UI harness.
- The regenerated ledgers differ in exactly three fields:
  - the B-176 fact's player: FOR #8 → none;
  - FOR #8 KO lost: 1 → 0;
  - FOR #8 actions: 17 → 16.
- Nothing else in any ledger changed.

**Equivalence with live capture** (`persistence/b176-equivalence.test.ts.txt`, run against the corrected UI run). 7/7 identical:

| Surface | Result |
|---|---|
| Stored event | identical except `squadId` (explained above: never read by statistics) |
| Match report FULL / 1H / 2H, including restart ownership and retention (`restarts`, `restartTeams`), chains, possessions, placed balls, score ledger | identical |
| Possession outcome summary, Match Intelligence, review prompts (coaching insights), HT and FT intelligence summary | identical |
| Quick Review segment breakdown, both halves and both directions | identical |
| Player statistics (FOR #8: KO 8–0, 16 actions) and influence analysis | identical |

**636-event regression, corrected harness and ledgers:**

| Match | PASS / FAIL on PR head `f48e6d5` | Changed checks vs main | Merged tree (main `cf6ae28` + `f48e6d5`) |
|---|---|---|---|
| A | 583 / 9 | 0 | 583 / 9, 0 changed |
| B | 977 / 12 | 0 | 977 / 12, 0 changed |
| C | 556 / 28 | 0 | 556 / 28, 0 changed |

- The two FOR #8 checks (Player Breakdown and Player Contributions, KO W-L 8–0) now PASS.
- The remaining FAILs are the same pre-existing, already-classified checks as on main.
- Legacy import: 28/28. Cross-page: 27/27, on both trees.

**Main moved before merge.** `c06dd79` → `cf6ae28` (PRs #383, #385, #386: Match Clipper and Montage).
- Those commits add 56 files and delete none. They touch no file in this PR, Event Stats, statistics or storage.
- One new dependency: `mediabunny`.
- The merge has no conflicts.

**Gate:**

| Tree | Tests | Type check | Build |
|---|---|---|---|
| PR head `f48e6d5` | 3076 / 3076 | same 14 error files as main `c06dd79` | passes |
| main `cf6ae28` | 3238 / 3238 | 16 error files (2 new Montage files on main) | passes |
| merged tree | 3255 / 3255 | identical to main `cf6ae28` | passes |

**Unresolved observation.** One earlier gate run on `f48e6d5` reported 2 failed tests in 1 file. They could not be identified and their cause is not established. Every later full run has passed: 15 on `f48e6d5`, plus one each on `cf6ae28` and the merged tree.
