# Release-candidate reporting audit: real Samsung match

## A. Baseline

| | |
|---|---|
| **main HEAD / release candidate** | `c96d232` (unchanged; not superseded). |
| **Production** | GitHub deployment 7625499452 (environment Production) for `c96d232`: success. Read from the GitHub deployment record; the site itself is not reachable from this environment. |
| **Fix branch** | `claude/event-stats-rc-reporting-fixes`, from `c96d232`; head `ab92fa3`. Draft PR only. |
| **Source of truth** | The Samsung export `paircvision-pro-Ballylanders-v-Galbally-2026-11-07.json`, 39 events, HT 0-06 v 0-05, SHA-256 `8c678e4a…c738`. The original is untouched. An anonymised copy is in `src/stats/reporting/fixtures/ballylanders-galbally-2026-11-07-ht.json`. |

## Independent ledger

Worked out by hand from the export, not from app output.

| | Ballylanders | Galbally |
|---|---|---|
| **Score** | 0-06: 0:19 point, 2:30 point (free), 4:00 two-pointer (free), 8:15 point (45), 9:27 point | 0-05: 1:00 point, 4:36 point, 5:07 two-pointer, 7:05 point (free) |
| **Own kickouts** | 5 taken, 4 kept (1:14 5:34 7:18 8:55); lost 4:51 | 6 taken, 5 kept (0:34 4:15 6:48 8:29 10:06); lost 2:51 |
| **All kickouts won** | 5 = 4 own + 1 of Galbally's (2:51) | 6 = 5 own + 1 of Ballylanders' (4:51) |
| **From kickouts won** | 0 shots | 4:15 → 4:36 point (1); 4:51 → 5:07 two-pointer (2); 8:29 → 8:46 wide. That is 3 shots, 2 scores, **3 points**. |
| **Turnovers won** | 3: 6:02 → 6:41 wide; 7:36 → 7:57 blocked → 8:03 45 award → 8:15 point; 9:18 → 9:27 point | 5: none scored; 3 won back |
| **Possession frees won** | 2: 2:18 → 2:30 point (1); 3:48 → 4:00 two-pointer (2). That is **3 points from 2 scores**. | 3: 0:50 → 1:00 point; 6:57 → 7:05 point; 10:17 → none. That is 2 points. |
| **Net** | kickouts −3, turnovers +2, frees +1, so **even** | |
| **Possession starts** | 10 (5 + 3 + 2) | 14 (6 + 5 + 3) |

All attributed scores add up to the scoreline:
- Ballylanders: 0 + 2 + 3 = 5, plus the 0:19 point (no tagged origin) = 6;
- Galbally: 3 + 0 + 2 = 5.

Nothing is double-counted within a category.

## B. Findings

| # | Finding | Expected | Actual (`c96d232`) | Root cause | Class |
|---|---|---|---|---|---|
| 1 | **Intelligence cards print the number of scores as points.** | Galbally won Ballylanders' kickout (4:51) → two-pointer at 5:07 = 2 points. Galbally kickout possessions = 3 points; Ballylanders possession frees = 3 points. | Restart Outcomes: "0-01 scored" beside "Net −2 pts". Match Impact: Kickouts "0-02 scored Galbally" (Net −3); Possession frees "Ballylanders 0-02 scored" (Net +3). Turnover & Free Outcomes: frees won "0-02 scored" (Net +3). | The cards pass `PossessionFamilySummary.points`, the **count** of point-scoring possessions (a two-pointer counts once), into G-PP notation. The true value is `scoreValue`, which the Net line already uses. | **RED** (a wrong figure on shareable cards). **Fixed.** |
| 2 | **Full Review → Free Kick Analysis map omits the 45.** | The 8:15 point from a 45 appears on Ballylanders' placed-ball map, which counts "Placed Scored 3". | 4 markers (2 frees won, the 2:30 and 4:00 free scores); no 8:15 marker. | "Placed Scored / Missed" come from the score ledger (frees, 45s/65s, penalties, marks). The maps use `isFreeRelatedPdfEvent`, which covers frees and FREE-sourced attempts only. | **AMBER.** **Fixed.** |
| 3 | **Snapshot: is the 45 missing?** | — | **Not missing.** The 8:15 point is drawn on HT Snapshot → Our Shot Profile at its recorded spot, identical on main and the branch (`cmp-ht-our-shot-profile.png`). It is an ordinary light-green point marker; nothing marks it as a 45. The 8:03 award is not a shot and is not on shot maps (by design). | Clarity, not omission. | **AMBER (clarity).** Not changed. |
| 4 | **Quick Review "Our restart won / lost" read as own kickouts.** | Make plain that Ballylanders won 5 kickouts (4 own + 1 Galbally) and Galbally won 6 (5 + 1). | "Our restart won → 0 shots \| 0 scores", "Our restart lost → 3 shots against \| 2 scores against": correct figures, ambiguous labels, no counts. | Wording only. | **AMBER.** **Fixed.** |
| 5 | **Turnover score counts differ between surfaces.** | — | Quick Review and the cards say Ballylanders' 3 turnovers won → 2 scores. Full Review Turnover Chain Analysis says 1 score + 2 shots without a score. | The two engines disagree only on the 7:36 turnover. The possession engine keeps the possession through the 8:03 45 award and credits the 8:15 point. The chain engine ends the turnover chain at the 45 award: a shot, no score. (`turnover-engines-7-36.json`). The 9:18 → 9:27 score is credited by both. | **AMBER**: definitional, documented engines. Not changed (statistical definitions out of scope). |
| 6 | **Restart Outcomes, Match Impact and possession figures** | — | All counts, nets (−3 / +2 / +1 / even), possession starts (10 / 14) and kickout wins (5/11, 6/11) match the ledger. | — | **GREEN.** |
| 7 | **Quick Review page 3** "Opposition KO Retained" (Ballylanders row = Galbally's own retention) | — | Correct numbers; the label is easy to misread. | Wording. | AMBER, noted. Not changed (out of the approved scope). |

## C. Changes

Branch `claude/event-stats-rc-reporting-fixes`, presentation only.

| File | Why |
|---|---|
| `src/stats/possessionScoreText.ts` (new) | Formats what a group of possessions produced: G-PP from the real points value plus the number of scores ("0-02 from 1 score"). |
| `src/stats/restartOutcomesCard.ts`, `turnoverFreeOutcomesCard.ts`, `matchIntelligenceCard.ts` | Use it (Finding 1). |
| `src/stats/reviewPdfExport.ts` | `makeFreeAnalysisPage` maps frees won/conceded **plus each team's placed-ball attempts** (`isPlacedScore` / `isPlacedMiss`, the same set as the totals). 45/65 awards are not attempts and are not added. Totals unchanged (Finding 2). |
| `src/stats/reporting/quickReviewMatchOverview.ts` | Adds each side's kickouts-won count and its split (own kept / won from opposition), all read from existing `restartTeams` / `possessions` figures. |
| `src/pro-tagger/QuickReviewPage1.tsx` | Team-named rows: "Ballylanders own kickouts", "Ballylanders won 5 kickouts → 0 shots \| 0 scores · 4 own kept · 1 won from Galbally". "Puckouts" in hurling/camogie (Finding 4). |
| `src/pro-tagger/ProTaggerLiveScreen.tsx` | One line: passes the sport's restart noun to Quick Review page 1. No capture code touched. |
| Tests | New `ballylandersGalbally2026-11-07.acceptance.test.ts` (7 tests, real match, ledger expectations). Updated `QuickReviewPage1.wording.test.ts` and one shape assertion in `quickReviewMatchOverview.test.ts`, for the new labels and fields. |

**Unchanged:**
- Event Stats capture, event schema, storage;
- possession, chain, scoring and kickout-ownership engines;
- the OUR K/O default;
- placed-ball totals.

## D. Validation

- **Suite:** 3272 / 3272 (main 3264 + 8). Type check identical to main. Production build passes.
- **Mutation check:** with main's reporting code, the 3 fix tests fail (cards, Quick Review split, Free Kick Analysis). The ledger and Snapshot-inclusion tests pass on both.
- **Real-match renders** (Pixel 7 emulation, `results/samsung-rc-fix/cmp-*.png`, main vs branch):
  - The main renders reproduce the Samsung screenshots exactly.
  - Cards: "0-02 from 1 score", "0-03 from 2 scores", with Nets unchanged.
  - Free Kick Analysis: Ballylanders map 4 → 5 events, adding the 8:15 point.
  - Snapshot: identical.
  - Quick Review: team-named rows.
- **Three-match release regression** (A football, B stress, C hurling; independent ledgers):
  - Every check equal to the release baseline, apart from: the R-1 label (already in main); the Quick Review restart rows (same values, new labels); hurling page 1 no longer says KICKOUTS (FAIL → PASS); 28 new kickouts-won checks (all PASS).
  - 0 per-event mismatches at HT, FT and final.
  - Legacy import 28/28; cross-page 27/27.
- **Uncertainty:** the Vercel preview and the real Samsung display of the new text still need a phone check.

## E. Recommendation

**CONDITIONAL GO.** Release once the draft PR is approved and merged, its production deployment shows success, and a 5-minute Samsung recheck of the HT cards, Quick Review page 1 and Free Kick Analysis looks right.

The only genuine blocker found is Finding 1, a wrong figure on shareable cards, and it is fixed in the PR. Findings 3, 5 and 7 are documented non-blocking clarity items.
