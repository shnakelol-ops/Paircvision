# Intelligence repairs I-1 / I-2 / I-3 — verification

**Branch:** `claude/event-stats-intelligence-repairs`, commit `bb8b522`, stacked on PR #374 (`98f2a57`). Draft PR #376. **Not merged.**

**Why a separate PR:** these change Intelligence figures that coaches see (kickout-origin rates, possession nets, prompts). They also introduce a definition decision, set out in `KICKOUT-ORIGIN-DEFINITION.md`. PR #374 stays limited to F-01 – F-06, plus the approved F-05 label rename.

**Recommendation for this PR: AMBER.**
- All three issues are fixed and verified, with no regression in any core figure.
- Two decisions belong to you before merge:
  - Whether to adopt the kickout-origin definition as written. It keeps frees won during the possession, per the existing spec.
  - Whether to relabel the "immediate outcome" sentences.

## What was wrong, at which layer

| | Layer | Root cause | Fix |
|---|---|---|---|
| **I-1** | Intelligence: possession-outcomes engine | `scoreValue = goals × 3 + points`, where `points` counts point-scoring possessions, so a two-pointer added 1 to `scoreValue`, `netOutcome` and `overallNetOutcome`. | Each scoring possession adds the ledger's `scoreValue(kind)`: goal 3, two-pointer / 45-two-pointer 2, point 1. Counts are unchanged. This was the only net-score calculation with the defect; the ledger, score lines, swing timeline and player influence already valued two-pointers at 2. |
| **I-3** | Intelligence: chain engine kickout dataset | Credited the kickout winner's first score before the next kickout, ignoring turnovers, opposition attempts and restarts awarded to the other team. | `kickoutPhaseStep()` (`chains/kickout-phase.ts`): the possession ends when the ball changes hands (definition document). |
| **I-2** | Both Intelligence engines | Each used its own boundary after a kickout. | Both now use `kickoutPhaseStep()`. The only difference left is documented: a free won by the team in possession starts a new phase in the immediate-outcome engine. |

**The I-3 defect has the same root as F-03.** F-03 was the turnover scan missing a possession change; I-3 is the kickout scan missing one.

## Did any fix touch authoritative core statistics?

**No.** A layer dump compared PR #374 with this branch on identical stored events (`results/intelligence/layer-impact-*.json/txt`).

**Unchanged in every match, scope and save state (live, after edits, legacy):**
- Scores and margins.
- Match Summary blocks (Snapshot, Quick Review, Full Review p1).
- The direct scoring breakdown and placed balls.
- Restart counts, own-kickout retention and Restart Share.
- Each kickout's winner, and turnover counts.

**What changed:**
- The kickout forward-scan fields: `nextScore`, `nextShotOrScore`, `secondsToScore`, `wonToScore`, `lostAllowedScore`.
- The origin metrics built on them: `restartToScore`, `restartLossPunishment`, the ledger's restart and turnover origin rows, prompts and Intelligence Summary sentences.
- The possession engine's kickout families.
- In the turnover and free families, only `scoreValue` / `netOutcome` (I-1).

`coreIntelligenceBoundary.test.ts` (from PR #374) still passes. It asserts that core figures cannot read forward-scan results.

## Two-point scores in Intelligence net scores (item 5)

**Confirmed.** A two-point score now contributes 2 points to every Intelligence net-score calculation:

| Figure | Before | After |
|---|---|---|
| Possession family `scoreValue` (kickouts, turnovers, frees) | 2PT = 1 | **2PT = 2** |
| Family `netOutcome` / `netLabel` (Restart Outcomes and Match Intelligence card net badges) | 2PT = 1 | **2PT = 2** |
| `overallNetOutcome` (Match Intelligence card, Intelligence Summary "overall" insight) | 2PT = 1 | **2PT = 2** |
| `scoringPct` / "scored from N" counts | count of scoring possessions | unchanged (a count, not a value) |

**Unit tests** (`kickout-phase.test.ts`): kickout phases ending in TWO_POINTER, FORTY_FIVE_TWO_POINT, GOAL and POINT give `scoreValue` 2 + 2 + 3 + 1 = 8. The conceded side, the turnover family and `overallNetOutcome` are covered too.

**Real fixtures:** in the layer dump, `overallNetOutcome` moved wherever a two-pointer fell inside a possession, for example A-live FULL and B-live FULL.

## End-to-end: all 636 events, rerun on this branch

Every event was entered through the real Event Stats UI (Chromium): HT/FT Snapshots, Full Review, save, reopen, review edits, legacy import. The runs were then compared twice.

| Match | vs **original** ledgers (`expected/`, previous rule) | vs **authoritative** ledgers (`expected-authoritative/`) | PR #374 vs original |
|---|---|---|---|
| A | 551 pass / 25 fail | **565 / 11** | 565 / 11 |
| B | 909 / 45 | **936 / 18** | 936 / 18 |
| C | 521 / 43 | **531 / 33** | 531 / 33 |
| Legacy import | — | **28 / 28** | 28 / 28 |
| F-05 cross-page | — | **27 / 27** | 27 / 27 |

**Every difference is accounted for** (`results/intelligence/DEFINITION-IMPACT.md`):

| Match | Definition-driven: expected differs between ledger sets, passes vs authoritative | "Avg secs to score (won)" still failing: F-11, open, averages both teams | Unexplained | Any other check changed |
|---|---|---|---|---|
| A | 14 | 1 | **0** | **0** |
| B | 27 | 2 | **0** | **0** |
| C | 10 | 1 | **0** | **0** |

**F-11 check:** the printed "Avg secs to score (won)" equals the both-teams average under the new definition in every match (A 33 s; B 20 s, live and after edits; C 34 s). Each team's own figure would be A 36 s, B 19 s, C 30 s. So F-11 is the only reason it fails.

**Bridge footnote:** "Origin possessions include N placed frees won during kickout-origin possessions". An independent count matches the printed one in every match: A 3 (1 · 2), B 6 (3 · 3), C 5 (1 · 4) (`scripts/diagnostics/bridge-footnote-check.mjs`). B fell from 8 to 6 because two of those frees came after the ball had changed hands.

**Remaining failures:** 62, the same set and classification as PR #374 (`results/intelligence/REMAINING-FAILURES.md`).

**Rendered pages:** the affected pages, re-rendered from this branch, are in `pdf-images-intelligence/`. Layout is unchanged; only values moved.

### Headline before / after (expected values are from the authoritative ledgers)

| Match | Figure | PR #374 printed | This branch printed |
|---|---|---|---|
| A | Ballyboden kickout wins → origin score | 11 (41%) | **10 (37%)** |
| A | Ballyboden kickout losses → origin score against | 12 (63%) | **11 (58%)** |
| B | Kilmacud kickout wins → origin score | 11 (27%) | **9 (22%)** |
| B | Kilmacud kickout losses → origin score against | 18 (51%) | **8 (23%)** |
| C | Ballyhale kickout losses → origin score against | 15 (50%) | **14 (47%)** |
| Real match | Ballylanders kickout wins → origin score | 7 of 14 (50%) | **4 of 14 (29%)** |

In B, 10 of the 18 St Brigid's scores credited to Kilmacud's lost kickouts came after the ball had changed hands at least once.

## Tests

- **vitest:** 2,899 / 2,899 passing (214 files). PR #374 has 2,879.
- **New:** `src/stats/chains/kickout-phase.test.ts`, with 20 tests at the chain (Intelligence) layer:
  - the boundary function;
  - both engines on 12 scenarios, including the one documented difference;
  - engine agreement on the real match;
  - I-1 values.
  - Reverting the scan and the point-value code fails 7 of them.
- **Updated (encoded the old behaviour):**
  - `quickReviewMatchOverview.provenance.test.ts`: pinned the chain engine crediting a score after a turnover.
  - `ballylandersGalbally.realMatch.test.ts`: kickout sentences re-derived independently from the stored log.
- **Type check:** no new errors (baseline unchanged).

## Regressions

None.
- No core figure changed.
- No check that passed against the authoritative ledgers fails.
- The legacy and cross-page suites pass.
- Console output is unchanged from the audit run.

## Branch and PR

- Branch `claude/event-stats-intelligence-repairs`, commit `bb8b522` (one commit on top of PR #374's head `98f2a57`).
- PR: https://github.com/shnakelol-ops/Paircvision/pull/376 (draft, base `claude/event-stats-red-repairs` = PR #374; **not merged**)
