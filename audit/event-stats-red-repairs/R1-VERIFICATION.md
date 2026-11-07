# R1 — Event Stats Statistical Accuracy Repairs: verification

- Branch: `claude/event-stats-r1-accuracy`, three commits on top of main `f3b9a05`: `43c488e` (statistical repairs), `8be0b3f` (Opposition Origin correction, approved after review) and `38e0e25` (full team names on its denominator line). The verified head is `38e0e25`.
- Expected values come from the independent reference ledgers. Neither ledger set was edited:
  - `expected/` is byte-identical to audit commit a8581a5;
  - `expected-authoritative/` uses the approved possession-based kickout-origin definition.
- Results: `results/r1/`. Rendered pages: `pdf-images-r1/`.

## 1. Root causes and fixes (all at the source)

| Item | Root cause | Fix |
|---|---|---|
| F-11 Avg seconds to score | Both PDF sites (Restart Chain Analysis and Restart Analysis) averaged `secondsToScore` over **every** kickout outcome that ended in a score. That mixed restarts won by either team, so the figure belonged to neither team. | One shared definition is now computed once, in `restartMetrics.ts` as `avgSecondsToScore(outcomes, team)`. It only counts restarts **won by that team** with a real start clock and a real score clock, in the same half. The chain engine already excludes pauses (match clock), invalid clocks (null) and the 90 s window. The value is exposed as `report.restarts.avgSecondsToScore.{FOR,OPP}`, and both PDF sites read `.FOR`. Snapshot and Quick Review do not print this statistic: Quick Review explicitly forbids `secondsToScore`. |
| F-10 45 / 65 reporting | The "45" row (`shot45`) only counted shots tagged `FORTY_FIVE` (Match Stats tags). Event Stats records the award as `FORTY_FIVE_WON` / `FORTY_FIVE_CONCEDED`, and the count ignored those, so every Event Stats match printed 0. Hurling and camogie also printed "45" instead of "65". | `shot45` now adds the awards owned by the team (`resolveRestartOwner`, the same owner rule as kickouts). Shots tagged `FORTY_FIVE` keep counting, so historical Match Stats data still works. The award record and the score record are different events, so a placed score is never counted twice: the award is counted once in "45" and the score once in the scoreboard. A test covers this. The label is "65" for hurling and camogie (`fortyFiveLabel`), both on Match Summary and in the efficiency source rows. |
| Scoring runs | Run length counts **scoring events** (a goal, a point or a two-pointer each count as 1), but five sites labelled it "pts". | The unit is now "N score(s)" (`fmtScoreCount`) on: Longest run (For/Opp), the run rows, and the 1H and 2H late-burst lines. Scoreboard points are unchanged. |
| Split rounding (101 %) | Each part of a two-way split was rounded on its own. 1 vs 7 printed 13 % + 88 % = 101 %. | New `splitPercentages()` (one shared helper). It starts from each part's own `Math.round`, then corrects the part with the largest rounding error until the parts sum to 100, with deterministic tie rules. Zero total returns null, shown as "—". Raw counts are not changed. Used by: `drawPossessionBar`, `drawComparisonBar`, `dpPossessionBar` and the Restart Summary "Won" rows. For two parts, the first part always equals its standalone figure; this was tested exhaustively for 0–60. |
| Opposition Origin rows | Two rows printed the same statistic (§2). | After approval, they are merged into one headline plus the genuine subset (§2a). Values are unchanged. |

## 2. Opposition Origin — the two restart-origin rows (audit only)

| Row | What it measures | Source |
|---|---|---|
| "Restart-origin scores for OPP" | Opposition scores whose possession started from a restart. Before counting, it removes scores that both a restart and a turnover claim (`viewScoringPossessionOrigins`, rule `turnoverClock >= kickoutClock ? turnover : restart`). | |
| "Restart-origin scores conceded" | The same scores, counted without that de-duplication. | `viewRestartOriginConcededFor` |
| "…from our kickout losses" | The subset of those scores that came from **our** kickouts lost. | |

Findings:

- Under the approved possession definition, a kickout claims a score only if **no turnover happened after the kickout**. So any score that both rules claim always resolves to the restart, and the de-duplication never removes a restart-origin score.
- Real capture can never produce a difference. The only theoretical case is a turnover and a kickout logged in the same second.
- On the fixtures the first two rows are identical: A 17 / 17 pts, B 11 / 11 pts, C 16 / 16 pts. They are also identical on the real Ballylanders v Galbally match.
- Tests that pin this: `r1StatisticalAccuracy.test.ts` (real match plus a constructed co-claim).
- The third row is a genuine subset and is correct.

**Conclusion:** "Restart-origin scores for OPP" and "Restart-origin scores conceded" are the same statistic printed twice. Both figures are correct, and neither label is false. The duplication suggests to a coach that there are two different measures.

**Proposed correction (approved and implemented in `8be0b3f` / `38e0e25`, see §2a):** keep one row, "Restart-origin scores for OPP" with its %. Remove the "conceded" duplicate, and keep "…from our kickout losses" as an indented subset.

### 2a. Correction as implemented

The Restart Origin card on the Opposition Origin & Chain Analysis page now shows:

| Row | Value | Source |
|---|---|---|
| **Opposition scores from restart-origin attacks** | breakdown `(pct%)`, e.g. A: "2 Goals, 7 Points & 2 Two-Point scores (17 pts)  (58%)" | breakdown: de-duplicated origins (unchanged). %: `restartLossPunishment` (unchanged definition). |
| (small line) | "% = Ballyboden restarts lost that led to a Na Fianna score (11 of 19)" | names the numerator and the denominator |
| **Of which: from our kickout losses** (puckout in hurling) | e.g. A: "3 Points & 2 Two-Point scores (7 pts)" | `viewOwnKickoutLossOriginConcededFor` (unchanged) |

- Both figures use the same scoring units (`formatScoringBreakdownOrDash`).
- No statistical value changed.
- The removed row's only unique content was its %. That % now sits on the headline, with its denominator stated.
- The card keeps its geometry: two rows plus a 22 px caption, in place of three rows.

**Regression tests** (`r1StatisticalAccuracy.test.ts`) check that:
- the headline equals the raw "conceded" view;
- the headline's score count equals the restart-loss numerator (one restart produces at most one origin score);
- the subset is contained in the headline in every category.

They run on the real Ballylanders v Galbally match, on a constructed co-claim, and on a hand-worked case (1-1-1 against 1-0-0, 3 of 4 = 75 %, puckout wording in hurling).

**Ledger checks:** the harness checks the headline, the ledger consistency (headline = restart-loss breakdown), the denominator line, the subset, and that the duplicate row is gone. They all pass in A, B and C, live and reopened:

| Match | Headline | Denominator | Subset |
|---|---|---|---|
| A | 17 pts (58 %) | 11 of 19 | 7 pts |
| B | 11 pts (23 %) | 8 of 35 (reopened: 22 %, 8 of 36) | 8 pts |
| C | 16 pts (47 %) | 14 of 30 | 9 pts |

A related observation, not changed: the turnover-origin scan does not stop at the next kickout. In a constructed example, a turnover can claim a score that comes after a later kickout. This does not happen in any fixture or in the real match. It should be reviewed with the Intelligence boundary work in a later round.

## 3. Before → after (636-event fixtures, values printed in the PDF)

| Statistic | A (football) | B (football) | C (hurling) |
|---|---|---|---|
| Avg secs to score (home won), expected FOR | 33s → **36s** (exp 36) | 20s → **19s** (exp 19) | 34s → **30s** (exp 30) |
| `avgSecondsToScore` FOR / OPP vs ledger (FULL and 1H) | 36 / 31 ✓ | 19 / 21 ✓ | 30 / 36 ✓ |
| 45 / 65 awarded, FOR / OPP | 0/0 → **2/0** | 0/0 → **2/1** | 0/0 → **1/3** |
| 45 / 65 row label | 45 | 45 | 45 → **65** |
| Efficiency "source 65" row | — | — | missing → **1/1/0/100 % · 3/3/0/100 %** |
| Run rows, longest runs, late bursts | "N pts" → "N scores", same N | same | same |
| Split bars totalling 101 % | 1 → **0** | 0 | 0 |

`avgSecondsToScore` was checked against the authoritative ledger for both teams, for FULL and 1H, in all datasets: 24 of 24 values match.

## 4. Automated tests

| | main `f3b9a05` | R1 |
|---|---|---|
| Test files | 218 passed | 220 passed |
| Tests | 2990 passed | **3012 passed** (+22: 14 R1 + 8 split) |
| tsc (pre-existing error files) | 14 | 14 (identical list) |
| vite build | ✓ | ✓ |

**Mutation check:** reintroducing the four original defects makes 8 of the 14 R1 tests fail. The code was then restored.

## 5. 636-event verification against `expected-authoritative/`

| Match | main baseline PASS / FAIL | R1 PASS / FAIL |
|---|---|---|
| A — football | 565 / 24 (+3 missing) | **583 / 9** (+0 missing) |
| B — football | 935 / 48 (+6 missing) | **977 / 12** (+0 missing) |
| C — hurling | 532 / 45 (+7 missing) | **556 / 28** (+0 missing) |

These figures are for the final head `38e0e25`. Main was re-scored with the same final harness, including the new Opposition Origin checks; main fails the duplicate-row check and is missing the new labels.

- Every change is FAIL→PASS or MISSING→PASS. No check went from PASS to FAIL.
- Legacy import: 28/28. Cross-page consistency: 27/27.
- HT and FT Snapshot, Quick Review and Full Review were all regenerated for each match.
- Console errors are unchanged: only the pre-existing service-worker MIME warning.

**Layer impact** (full report model, main vs R1, all datasets): only `restarts.avgSecondsToScore` (a new field) and `shot45` changed. No Intelligence output changed: chains, possessions, ledger, review prompts and scores are all identical.

### Harness changes (`scripts/compare.mjs`), with justification

- **Run-row check fixed.** The regex `/×\d+ (1H|2H) S\d$/` never matched the double-spaced run labels, so on main the run rows were silently unchecked. The fixed check compares each row with the ledger's run length in **scores** (approved decision 5).
- **New checks:** "longest scoring run (scores)" for FOR and OPP, and "two-way split bars total 100 %".
- **Opposition Origin checks:** after the approved correction, they read the new labels and add three checks: ledger consistency, the denominator line, and duplicate-row removal. The expected values still come from the unchanged ledgers.
- **Reading changes:** the harness now reads `EXPECTED_DIR` / `RESULTS_SUFFIX` and the "Restart Share — <method>" labels.

The baseline above is main re-scored with this same harness, so the comparison is like for like.

## 6. Remaining discrepancies — 49, none statistical

See `results/r1/REMAINING-FAILURES.md` for each one individually.

| Category | Count | Items |
|---|---|---|
| STATISTICAL | **0** | |
| PRESENTATION | 37 | F-07 hurling terminology (13); F-12 raw `TWO_POINTER` label (8); "Won → Shot" label (4); F-13 layout overlap / off-page (12; counts unchanged from main) |
| UNSUPPORTED | 4 | football 2-POINT PROFILE block on hurling pages |
| HARNESS | 8 | 6 duplicate enum checks; 2 sin-bin expectations |

**Sin-bin expectations.** Hurling has had a sin bin since 2021 (sources: gaa.ie, hoganstand.com, the42.ie, breakingnews.ie). The reference ledger assumes hurling has no sin bin, so that expectation appears to be wrong. It is documented here and has **not** been edited. The wording of the current season's rule has not been confirmed (decision 7).

All of these belong to R2 – R4. None is in R1's scope.
