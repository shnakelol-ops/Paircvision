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
- **Flake:** one gate run reported 2 failing tests that could not be identified. 7 further full runs, including a clean gate, all passed 3076 / 3076.

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

## Remaining risks

- Event type labels in the edit form are still the raw names (e.g. TWO_POINTER). That is F-12, out of scope.
- A legacy event that already holds an inconsistent combination (e.g. a POINT with BLOCK/SAVE from an earlier edit) is left as it is until it is edited again.
- No undo for a saved edit (unchanged).
