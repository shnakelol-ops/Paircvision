# Review Edit — remaining risks and smallest safe correction (read-only)

This assessment is based on main after PR #380. No code has been changed.

## What is already safe

**Edits are stored reliably.**
- Live-overlay edits and deletes are saved immediately (P0, #379).
- Saved-match edits and deletes are applied on screen only after they are stored. A failed store is reported, and the stored match is kept (#380).

**Player corrections resolve against the event's own squad** (squadId first). An edited number that is not in the roster clears the stale id. Reports then match the number-only player back to the roster player with that number (`resolvePlayerIdentityKey`), so a player is not split into two rows.

**Deletes need two taps** ("Delete" then "Confirm?").

## Remaining risks (all pre-existing; F-08)

| # | Risk | Effect on statistics | Severity |
|---|---|---|---|
| 1 | The Type list offers **all 23 event kinds in every sport**, including kinds Event Stats never captures (FREE_SCORED, FREE_MISSED, POSSESSION_WON/LOST) and TWO_POINTER / FORTY_FIVE_TWO_POINT in hurling and camogie. SIN_BIN is also offered where capture has no sin bin. | A coach can create records that capture could never produce. | High |
| 2 | **Changing the type to a different family keeps the stored team side.** Example: TURNOVER_LOST is stored with `teamSide` FOR; edited to POINT, it credits **our** team. A KICKOUT_CONCEDED stores the owner side, so as a score it credits the kicking team. | Wrong team credited, with no error. | High |
| 3 | **A type change keeps the old tags and `restartOwner`.** Example: SHOT(BLOCK/SAVE) → POINT keeps BLOCK/SAVE, so the score's source reads "unknown"; this was seen in the 636-event run. FREE_WON → FREE_CONCEDED keeps the tag "WON". | Source and placed-ball rows misreport. | Medium |
| 4 | **Flipping kickout won ↔ lost keeps the attached player**, who was picked from the old winner's squad. | Player credited with a restart win or loss for the wrong side. | Medium |
| 5 | **45/65 and Sideline won ↔ lost can be edited**, even though capture only ever stores the WON form with `teamSide` = winner. | A form capture never produces, with ambiguous meaning. | Low–medium |

## Smallest safe correction

This is the existing `F08-REVIEW-EDIT-PLAN-AND-DISCIPLINE.md` plan, unchanged. It uses the same edit form with **no new controls**.

1. **Restrict the Type list.** The existing `<select>` lists only the kinds in the event's own edit group that are valid for the sport:

   | Group | Allowed kinds |
   |---|---|
   | Attempts | GOAL, POINT, WIDE, SHOT, plus the two-pointer kinds in football only |
   | Kickout / Puckout | won ↔ lost |
   | Turnover | won ↔ lost |
   | Free | won ↔ conceded |
   | Discipline | YELLOW, SIN_BIN (only where the sport has it), RED |
   | 45/65, Sideline | player edits only |

   Legacy kinds outside every group show only themselves.
2. **Apply each change deterministically.**
   - Drop tags that are invalid for the new kind, and never invent a source.
   - Rewrite the Free and Discipline tags to match the new kind.
   - A two-pointer with tag 45 becomes FORTY_FIVE_TWO_POINT, and back.
   - Keep `teamSide`; within a group its meaning does not change.
3. **Reject what cannot be done safely,** with a one-line reason in the existing edit sheet and nothing saved:
   - any change across groups;
   - a kickout won ↔ lost flip while a player from the old winner's squad is still attached (the coach can clear the player in the same edit).
4. **Shape and tests:**
   - one pure module, `pro-tagger-review-edit.ts` (`editableKindsFor`, `applyReviewEdit`), called from `saveProEdit`;
   - no schema change, and no stored record is rewritten unless the coach saves an edit;
   - 8 tests (E1–E8 in the plan), plus the 636-event Review Edit e2e. All 4 edits in fixture B are allowed and must store identically.

**One decision for the owner:** should SHOT ↔ score stay allowed (it becomes a score with "source unknown") or be rejected? The recommendation is to allow it.

**Expected size:** about 1 new module, about 20 changed lines in `ProTaggerReviewScreen.tsx`, and tests. No change to capture, statistics, storage or other modules.
