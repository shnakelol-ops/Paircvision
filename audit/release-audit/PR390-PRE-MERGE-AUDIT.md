# PR #390 pre-merge audit: Snapshot Shot Profile cleanup

**Result: GREEN. Merged.**

| | |
|---|---|
| PR | #390, base `main` |
| Audited head | `202cfa5e462e14e53b2e3afc37d211571112b35f` (1 commit) |
| Base | `2bf8c45` (current main; nothing missing) |
| Merge commit | `d52bd19e55347c62b9310efaa1d713ba5d4c06b3` (normal merge, pinned to the audited head). Tree `f5750f8` equals the audited merge result. |
| Production | GitHub deployment 7642194406 (Production) for `d52bd19`: success at 21:36 UTC, from the deployment record. The live site is not reachable from the audit environment. |

## Scope
Changed files:
- `src/stats/reviewPdfExport.ts`
- `src/stats/reporting/snapshotShotProfile.test.ts` (new)
- `src/stats/reporting/ballylandersGalbally2026-11-07.acceptance.test.ts`: one assertion. It counts every same-coloured circle on the page, so it now includes the legend swatch (+1). The pitch-only counts are asserted in the new test.

There are no fixtures, dependencies, generated files, formatting changes or #389 work in the PR.

Isolation:
- The new `shotMarkerType` and `drawShotProfileLegend` are called only from the two Shot Profile pages.
- Those pages are called only from `exportSnapshotPdf` (HT and FT).
- `renderHtMarkers`, the callout strip, `HT_MARKER_COLORS` and `PDF_KIND_SETS` are unchanged.

## Functional audit
Matches: S (real Ballylanders v Galbally), A, B, C. HT and FT. Both teams. 16 renders in all.

- **Markers:** drawn markers equal an independent tally from the saved events on all 16 renders: 338 shots, none omitted or duplicated, no indigo or pink free markers. Main drew 2–16 free markers per page.
- **Legend:** the legend matches the drawn marker types on all 16.
- **Other pages:** every other page is identical to main, compared by draw-call log: HT 3, FT 6, Full Review 30 per match.
- **Shot Profile text:** identical to main apart from the legend (headline, conversion, shots and placed-ball callouts).
- **Edge cases:**
  - no events, and frees only: no error, no markers, no legend, "No shot data recorded."
  - shots without a location: not drawn, not in the legend; the headline still counts them, as before.

## Evidence
- **Relevant tests:** 33/33.
- **Mutation:** 8/10 new tests fail on main's code; the 2 headline-unchanged tests pass on both.
- **Suite:** head 3282/3282; main 3272/3272.
- **tsc:** the same 16 pre-existing error files with identical counts, none in `reviewPdfExport.ts`.
- **Build:** passes.
- **Three-match regression on the exact head:**
  - 0 of 2,316 checks changed versus the baseline;
  - 0 event mismatches;
  - legacy 28/28; cross-page 27/27;
  - the independent ledgers are unmodified.
