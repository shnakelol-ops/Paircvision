# Snapshot Shot Profile readability (PR #391)

**Base:** main `d52bd19`. **Branch:** `claude/snapshot-shot-profile-readability`, head `1805dcd`. Draft.

**Change:**
- the legend is one horizontal row between the headline and the pitch (22 px bold labels, 16 px symbols, only the types drawn), replacing the right-hand column;
- the bottom strip no longer repeats the headline's shots / conversion figure or its "No shot data recorded" message.

Changed: `src/stats/reviewPdfExport.ts` and `src/stats/reporting/snapshotShotProfile.test.ts`.

## Evidence
- **Pitch (draw-op comparison with main):** identical on all 16 Shot Profile pages (4 matches, HT/FT, both teams), plus the empty and frees-only cases.
- **Other pages:** page counts are unchanged, and every other Snapshot and Full Review page is identical. Scripts: `scripts/n1/pitch.test.ts`, `scripts/n1/render-rd.mjs`.
- **Text:** headlines identical. The only text removed is the repeated shots callout (and "No shot data recorded." when empty).
- **Real Chromium fonts:** every legend renders at 22 px bold with no squeezing. The crowded 7-type row ends at x 1265 of 1752. No off-page text, and no new overlaps (the page-header overlaps are unchanged and the same on main).
- **Tests:** suite 3282/3282. Type check identical to the baseline. Build passes.
- **Three-match regression:** 0 of 2,316 checks changed versus main; 0 event mismatches; legacy 28/28; cross-page 27/27.
- **Images (1080 px wide):** `results/shot-profile-readability/cmp-*.png`. Top is main, bottom is this PR.
