# Snapshot Shot Profile cleanup (PR #390)

**Base:** main `2bf8c45` (PR #389 merged with a normal merge after a final gate on the exact merge tree: type check identical to the baseline, 3272/3272 tests, build passes, Vercel passes). **Branch:** `claude/snapshot-shot-profile-cleanup`, head `202cfa5`, draft.

## Finding (confirmed before the change)
The HT and FT Snapshot pages Our and Opposition Shot Profile also drew free awards: FREE_WON (indigo) and FREE_CONCEDED (pink, the opposition won the free). Neither is a shot attempt. Placed-ball attempts were already drawn through the shot set.

## Change
`src/stats/reviewPdfExport.ts` only:
- the maps plot the shot set alone;
- the legend lists only the marker types drawn, with the marker's symbol and colour;
- the "won / conceded N frees" fallback callout is removed.

## Results
Real match, Ballylanders v Galbally, HT and FT:

| Page | Before | After |
|---|---|---|
| Our Shot Profile | 8 shots + 2 indigo free-won dots | 8 shots: 4 points, 1 two-pointer, 1 wide, 1 blocked/saved, 1 post |
| Opposition Shot Profile | 5 shots + 3 pink free-conceded dots | 5 shots: 3 points, 1 two-pointer, 1 wide |

Headlines (63% and 80%), the shots callouts and the placed-ball callouts are identical. Every other page is identical (HT 3, FT 6, Full Review 29).

Images: `results/shot-profile-cleanup/cmp-*.png` (top = main, bottom = branch).

**Suite:** 3282/3282. Type check identical to main. Build passes.

**Three-match regression:**
- 0 of 2,316 checks changed versus the #389 baseline;
- 0 event mismatches;
- legacy import 28/28; cross-page 27/27.

During verification the regression flagged the first legend label "Other shot (e.g. post)" as wider than the legend column. It was shortened to "Post / other" before the final run.

## Not covered
The Bally v Tipp export was not available, so it has no fixture.
