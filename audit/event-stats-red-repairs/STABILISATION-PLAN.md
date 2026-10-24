# Event Stats final stabilisation: verification of #374 / #376 and repair plan for F-07 – F-15

**Status:** Phase 1 is complete. Phases 2 and 4 are a **plan only**: no code from them is written, and nothing is merged or deployed.

---

## Phase 1: final verification against current main

**Current main is `355db6e`.** It has moved by one PR since #374 was cut: #373, Tactical Slate tokens. That PR touches 15 files under `src/engine/pixi`, `src/pages` and `src/features/quickboard/storage`. None of them is a file in #374 or #376, and none is stats or Event Stats code.

**Method:** local-only trial merges (never pushed):
- `trial-374` = #374 + main.
- `trial-376` = #376 + (#374 + main).

On each merged tree:
- Type check against a baseline taken fresh from current main.
- Full vitest suite.
- Production build (`vite build`, Vercel's build command).
- All 636 events rerun through the real UI, plus every comparison.

Evidence: `results/merge-check/`.

| # | Check | Result |
|---|---|---|
| 1 | F-01 – F-06 repairs remain correct | ✅ Merged #374: 2,032 pass / 62 fail against the unchanged ledgers. **0 of 2,186 checks differ** from the pre-merge run. Legacy 28/28, cross-page 27/27. |
| 2 | I-1 – I-3 use the approved possession rules | ✅ One function, `chains/kickout-phase.ts` → `kickoutPhaseStep()`, used by both engines. Merged #376: **0 of 2,186 checks differ** from the pre-merge run against the authoritative ledgers. |
| 3 | Kickout-origin attacks include frees won in the same possession | ✅ `RESTART_RETAINED` (a free / 45-65 / sideline awarded to the team in possession) continues the possession. Test "own free won, score from the free: kickout-origin yes". The bridge footnote counts match an independent count (A 3, B 6, C 5). |
| 4 | Possession changes end the kickout-origin attribution | ✅ Any turnover (either storage side), an opposition attempt, or a restart awarded to the other team → `POSSESSION_CHANGE`. Twelve scenario tests cover both engines; reverting the scan and the I-1 fix fails 7 of the 20 tests. Ground truth: 0 wrong credits (was 14). |
| 5 | Core statistics independent of Intelligence | ✅ `coreIntelligenceBoundary.test.ts` passes on both merged trees. The layer dump #374 → #376 changed **0** authoritative core fields. |
| 6 | No unexpected changes to scores, kickouts, turnovers, players or history | ✅ Scores, kickout winners, restart counts, retention, Restart Share, turnover counts and placed balls are identical. Player Breakdown checks are unchanged (A 23/23, B 48/48, C 24/24). Legacy import 28/28. Stored matches are never rewritten. |
| 7 | Stacking and merge order | ✅ #376's base is `claude/event-stats-red-repairs` and it contains #374's head `98f2a57`. **Merge #374 first, then #376.** See the warning below. |
| 8 | Local tests, type checks and builds | ✅ main 2,891 tests → merged #374 **2,921** (+30) → merged #376 **2,941** (+20), all passing. Type check: 14 error files on all three trees, identical to main (pre-existing, unrelated). `vite build` passes on all three (13–14 s). |
| 9 | Vercel previews | ✅ #374 `98f2a57` success; #376 `bb8b522` success. (The "Building" text in #376's Vercel comment is stale; the commit status is success.) |
| 10 | Review comments / conflicts | ✅ No reviews or review threads on either PR. The only comments are from the Vercel bot. Both trial merges are clean. GitHub showed #374's mergeable state as "unknown" while it recomputed after main moved; the local merge has no conflict. |

**Merge-order warning.** Merge #374 with **"Create a merge commit" or "Rebase and merge", not "Squash"**. If #374 is squashed, #376's branch still carries the original #374 commit, and #376 would need a rebase onto main before it can merge cleanly. After #374 merges:

1. Change #376's base to `main`. GitHub does this automatically if #374's branch is deleted on merge.
2. Let Vercel rebuild #376.
3. Re-run the vitest suite.

**Verdict: both PRs are ready to merge, subject to your approval.**
- **#374:** F-01 – F-06 and the approved label rename.
- **#376:** I-1 – I-3, if you adopt the kickout-origin definition in `KICKOUT-ORIGIN-DEFINITION.md`.

Neither PR makes Event Stats as a whole GREEN, because F-07 – F-15 remain (below).

---

## Phase 2: repair plan for F-07 – F-15 (not implemented)

### Classification

**Kinds of defect:**
- **C — calculation:** a number is wrong at its source.
- **D — data integrity:** capture or edit can store wrong or inconsistent facts.
- **M — misleading label or unit:** the number is right for something other than what the label says.
- **P — presentation:** wording, terminology or layout, with the numbers correct.

`results/REMAINING-FAILURES.md` uses four categories (statistical, presentation, unsupported, harness). There, **M** items fall under presentation; here they are separated because they mislead a reader even though the arithmetic is right.
- **H — harness:** the audit check itself is wrong or double-counts.

| Finding | Item | Class | Source, verified in code | Failing checks |
|---|---|---|---|---|
| F-11 | "Avg secs to score (won)" / "Avg time to score" average **both** teams' kickouts | **C** | `reviewPdfExport.ts` l.2960 (Restart Chain, 2 rows) and l.7155 (Restart Analysis): `outcomes.filter(secondsToScore !== null)` with no winner filter | 4 |
| F-10 | Match Summary "45" / "65" row is always 0 for Event Stats | **C**: the source ignores the captured family | `teamStatsViews.ts` l.258 counts the Match Stats `FORTY_FIVE` *shot tag*; Event Stats stores `FORTY_FIVE_WON/CONCEDED` restarts (`pro-tagger-adapter.ts` l.84) | 7 + 4 MISSING |
| F-10 | Sideline won/lost and discipline absent from the PDFs | Unsupported (product addition) | `reviewPdfExport.ts` l.420: "deliberately not wired" | 0 (reported, not checked) |
| F-12 | "Longest run … pts" and run rows "N pts" print a **count of scores** | **M**, misleading unit | `reviewPdfExport.ts` l.2588–2589, l.2746 | not checked |
| F-12 | "Restart-origin scores for OPP" (de-duplicated) vs "…conceded" (raw) on the same page, unexplained | **M** | Opposition Origin page | not checked |
| F-12 | Chain Intelligence "Won → Shot" prints *shot, no score* | **M** | `reviewPdfExport.ts` l.2660 uses `viewTurnoverWonToShotOnly`; the Intelligence Summary already labels it "→ shot, no score" | 4 |
| F-12 | Raw "TWO_POINTER Scores" / "45+2 Scores" labels | P | `reviewPdfExport.ts` l.6311–6313 | 8 (+6 duplicate) |
| F-12 | Counts Sheet "Points" (1-point scores) vs Full Review "Points" (value) | **M** | Quick Review Counts Sheet | not checked |
| F-08 | Review Edit offers all 23 internal kinds (TWO_POINTER in hurling, Rapid-only kinds), rewrites kind only, keeps stale tags | **D** | `ProTaggerReviewScreen.tsx` l.779 maps `MATCH_EVENT_KINDS`; `saveProEdit` l.405 sets `kind`/`type`/player only | probe only |
| F-09 | Kickout / puckout owner toggle resets to OUR after every tagged event | **D** | `ProTaggerFamilyGrid.tsx` l.27 `useState`; the grid unmounts when `phase !== "IDLE"` (`ProTaggerLiveScreen.tsx` l.1315) | 84/84 probe |
| F-07 | Football wording in hurling: OUR/THEIR KICKOUTS, "converted N kickouts", "Shots from Kickout", Match Markers "KICKOUT", bridge footnote, Quick Review, Counts Sheet | P | Hard-coded strings; `restartOriginBridgeNote` has no sport parameter | 15 |
| F-07 | 2-POINT PROFILE block on hurling Efficiency pages | Unsupported / P | `reviewPdfExport.ts` ~l.6300, drawn without a sport check | 4 |
| F-07 | Sin Bins row in hurling | **H**: the audit expectation is wrong | Hurling has a sin-bin sanction since 2021 (10 min + yellow + penalty for a cynical foul denying a goal chance), so the row is legitimate | 2 |
| F-13 | Layer badge over wordmark (every page); p1 footer over the last value; squeezed origin footnote; insight lines run off the edge; split bar 13% + 88% = 101%; name truncation | P (101% is **M**) | Header and footnote drawing | 12 checks, each with real items; the counts also include 12 harness false-positive items |
| F-13 | FT "Our / Their Shot Profile" plots raw (non-normalised) coordinates while its hotspot zone is direction-normalised | **M**: the markers and the highlighted zone disagree | `renderHtMarkers` written for the 1H-only HT page | not checked |
| F-14 | Player Contributions silently shows the top 12 per team | **M** by omission | `reviewPdfExport.ts` l.1997 `ranked.slice(0, 12)` | not checked |
| F-15 | "37+ pages" (actual 29–31); a blank venue saved as "Unknown venue"; segment labels differ between Quick Review and Full Review; "—" for a zero; React style warning | P (the venue is minor **D**) | `ProTaggerReviewScreen.tsx` l.624; `ProTaggerLiveScreen.tsx` l.778; `QuickReviewPage3.tsx` l.51 vs `reviewPdfExport.ts` l.1171 | not checked |
| Harness | 6 duplicate enum checks; layout detector ignores glyph halos and `maxWidth` | **H** | Audit `compare.mjs` | 6 + 12 false positives |

**"Zero known misleading statistics" is broader than the 62 failing checks.** The M items not caught by any check are the scoring-run units, the two Opposition Origin rows, the Counts Sheet "Points" row, the 101% split bar, the FT shot-profile markers and the silent top-12. The batches below fix them and add checks for each.

### Proposed repair sequence

Each batch is its own PR, opened only after #374 and #376 are merged and you have approved the plan. Every batch follows the same rules:
- Fix the number where it is calculated.
- Add tests at that layer.
- Rerun all 636 events against the independent ledgers.
- Allow no new failures and update no expected values, except for documented definition decisions you approve.
- Make no UI, layout or capture-flow changes beyond what each item states.

**R1 — P0 statistical integrity (calculation layer; can be grouped: report-model and chain code with no UI).**
1. **F-11:** add per-team `avgSecsToScore` to the restart metrics, computed over restarts *won by that team*. The three PDF rows read it. The reference expects FOR only: A 36 s, B 19 s, C 30 s (post-#376 definition).
2. **F-10 (45/65):** the "45" / "65" row counts the team's 45s/65s won, using the shared award rule (`*_WON` → `teamSide`, `*_CONCEDED` → the other side), plus the legacy Match Stats tag. Expected: A 2, B 2 / 1, C 1 / 3.
3. **F-12 units:** scoring runs print **scores** ("4 scores") or their true points value, matching the Scoring Momentum page, which is already correct. One definition is needed: recommend "scores".
4. **F-12 Opposition Origin:** decide one definition for "restart-origin scores for OPP", recommended de-duplicated, as the ledger partition. Either print one row or footnote why two differ.
5. **F-13 101%:** shares are rounded with a largest-remainder method so complementary percentages sum to 100.

**R2 — P0 capture and edit integrity (Event Stats UI logic only; no new controls).**
1. **F-09:** lift the owner toggle state into `ProTaggerLiveScreen` so it persists between taps. **Decision needed:** the rule is either "sticky until changed" (recommended: no inference, no new steps) or "auto-suggest from the previous score / wide". Matches already captured with the reset cannot be corrected, because the true owner was never recorded; this will be stated in the release notes.
2. **F-08:**
   - The Type list offers only kinds Event Stats can capture for the match's sport. No TWO_POINTER or FORTY_FIVE_TWO_POINT in hurling or camogie, and no Rapid-only or Match-Stats-only kinds.
   - A change of kind reconciles tags. Shot-outcome tags are dropped when an attempt becomes a score; source tags are kept; an attempt with no source stays "source unknown" rather than inventing one.
   - A validation guard in `saveProEdit` rejects any score kind that is invalid for the sport. This guarantees no score can be edited into an invalid event, even if the UI changes later.
   - Team, owner and source editing would need new fields. That is out of scope (no new controls) and listed as a decision.
3. Tests: component tests for the toggle persistence and the edit list; adapter-level tests for tag reconciliation.

**R3 — P1 reporting consistency (can be grouped: labels and sport handling, no calculation changes).**
1. **F-07:** route every restart, 45/65 and section label through the existing sport-aware helpers (`koLabel*`, `restartMetricLabel`), including `restartOriginBridgeNote`, the Snapshot dashboard, Quick Review, the Counts Sheet and the Match Markers.
2. **F-07:** suppress the 2-POINT PROFILE block and two-pointer rows for hurling and camogie. These are sections that don't exist in the sport, not new pages.
3. **F-12:**
   - A label map for the efficiency rows ("2-Point Scores", "45 / 65 Two-Pointers").
   - "Won → Shot, no score" on Chain Intelligence.
   - Counts Sheet "1-pt scores".
4. **Sin bin:** keep the hurling Sin Bins row. **Decision needed:** confirm the current hurling and camogie sin-bin rules. If confirmed, the audit expectation is corrected as a documented rules correction, not to match behaviour.
5. **One documented definition per statistic:** add `src/stats/reporting/STATISTIC-DEFINITIONS.md`, a register mapping every displayed label to its source function and definition. Add a test that every label on the Match Summary, Snapshot and Quick Review pages is in the register.

**R4 — P2 PDF quality (layout only).**
1. **F-13:**
   - Move the layer badge clear of the wordmark.
   - Move the p1 footer below the table.
   - Wrap the origin footnote and the Possession Chain Insights lines instead of squeezing or clipping them.
   - Truncate team names by the measured width actually available.
   - FT shot profiles: plot direction-normalised coordinates (as the hotspot already is), or label the halves.
2. **F-14:** show every player who has activity (continuation rows on the existing page), or print "+N more players on Player Breakdown". **Decision needed:** which one.
3. **F-15:**
   - The page-count text comes from the actual page count.
   - A blank venue is stored as empty and displayed as "—"; existing saved values are not rewritten.
   - Segment labels are unified to one wording.
   - A zero shows as "0".
   - The React `border` / `borderColor` warning is removed.

**Harness corrections (audit pack only, no product code; can go with any batch):**
- Remove the duplicate enum check.
- Make the overlap detector skip same-glyph halos, and measure `maxWidth` text at its clamped width.
- Correct the sin-bin expectation once you confirm the rules.

Original audit artefacts are never edited. Corrections go to the repair pack, with a note.

**Grouping summary:**
- R1 and R3 are safe to group *within* themselves: R1 is calculation-only with no UI; R3 is labels-only with no numbers.
- R1 must not be grouped with R3, so each number change stays reviewable on its own.
- R2 stands alone, because it touches capture behaviour.
- R4 is last, because layout changes move text the comparison harness reads.

**Estimated scale:**

| Batch | Files | Source lines | New tests | Rerun |
|---|---|---|---|---|
| R1 | 3–4 | ~150 | ~15 | full |
| R2 | 3 | ~200 | ~12 | full + capture probes |
| R3 | 6–8 | ~250 | ~20 | full |
| R4 | 1–2 | ~300 | ~10 | full + render review |

---

## Phase 4: permanent regression protection (proposal)

**Golden-match suite in the main repo (vitest, no browser).** Move the three verified matches into `src/stats/__regression__/event-stats/`:

- **Contents:**
  - Fixture taps (`match-{A,B,C}.json`).
  - The stored events the app saved from them: live, after review edits, and the legacy-format import.
  - The independent ledgers: `expected/` unchanged, plus `expected-authoritative/` once #376 is accepted.
  - Size: about 3–4 MB of JSON.
- **Tests:**
  1. **Capture replay:** replaying every tap through `adaptProTaggerAction` reproduces the stored events (kinds, sides, owners, tags, players). This covers all 636 events and the capture layer.
  2. **Core statistics:** for FT and HT scopes, live / edited / legacy, the following are checked against the ledgers: `buildMatchReport` → team summary blocks, Snapshot dashboard model, Quick Review overview, placed balls, restarts, turnovers and player rows. Football and hurling scoring, the 2PT rules and 65s are covered.
  3. **Intelligence:** kickout and turnover datasets, possession families, origin rows and net values against the authoritative ledger.
  4. **PDF numeric consistency:** Full Review and Snapshot pages rendered through the existing capture-canvas test pattern (already used by `pdfShotProfilePlacedBalls.test.ts`). Printed values are checked against the ledgers, with the label lookups ported from `compare.mjs`.
  5. **Known-failure register:** each remaining failing check is listed with its finding ID and asserted to still fail *with the same value*. A fix forces its entry to be removed; any new or changed discrepancy fails the build. This enforces "zero unexplained PDF discrepancies" from day one, while F-07 – F-15 are still open.
- **Estimated runtime:** about 15–25 s on top of the current 45 s suite.

The full UI rerun (Playwright, all 636 taps through the real screens) stays as the deeper check. It takes about 8–10 minutes and is run manually or nightly, not on every PR.

**GitHub Actions workflow: proposed, NOT added.**
- **Trigger:** `pull_request` on `src/**`, `package*.json`, `vite.config.*` and `tsconfig*.json`.
- **Job:** one job on `ubuntu-latest`, Node 22, npm cache, with these steps:

| Step | Measured here | Expected in CI |
|---|---|---|
| Checkout (46.5 MB pack including 6,347 committed Windows `node_modules` files) | — | ~15–25 s |
| `npm ci` (replaces the committed `node_modules` with Linux builds) | 10 s warm | ~25–40 s cold |
| `npx vitest run` (2,941 tests after #376, plus the golden suite) | 45 s | ~60–75 s |
| `vite build` (Vercel's build command) | 15 s | ~20 s |
| Type check gated on *new* errors only (main has 14 pre-existing error files, so plain `tsc` cannot gate; a committed baseline list is compared) | 20 s | ~25 s |

- **Total:** about 3 minutes per PR run, well inside the free-tier allowance for a private repo at current PR volume.
- **Not included:** browsers and Playwright. Optionally, a separate `workflow_dispatch` job could run the full UI rerun (~10 min, Chromium install about 1 min).
- **Risks:**
  - The committed Windows `node_modules` slows checkout and is replaced by `npm ci`; removing it from git is recommended but is a separate decision.
  - Type checking needs the baseline file until the 14 pre-existing errors are fixed.

---

## Decisions needed from you

1. Approve the merge of #374, then #376, with a merge commit or rebase, not a squash.
2. Adopt the kickout-origin definition in #376, and say whether to relabel the "immediate outcome" sentences.
3. F-09 owner-toggle rule: sticky (recommended) or auto-suggest.
4. F-08: Type list restriction and tag reconciliation only (recommended), or also add team / owner / source fields (new controls, out of scope).
5. F-10: whether sideline and discipline rows should be added to existing PDF tables (a product addition), or stay in the Counts Sheet only.
6. F-12: scoring-run unit, scores (recommended) or points value.
7. F-14: show all players, or a "+N more" note.
8. Sin bin: confirm the current hurling and camogie rules. Then the audit expectation is corrected and the row is kept.
9. Approve the golden-match suite and the CI workflow as scoped above.

---

## Merge record (2026-10-24)

Both PRs were merged with a merge commit, not a squash, at the verified head SHAs:

| PR | Head merged | Merge commit |
|---|---|---|
| #374 (F-01 – F-06 and the label rename) | `98f2a57` | `42ea937` |
| #376 (I-1 – I-3) | `bb8b522` | `4c14a6d` (current main) |

**Pre-merge checks.** Main had moved to `4752acf` (#375, two Tactical Slate engine files, no overlap). The type check, full suite and `vite build` were rerun on main + #374 and main + #374 + #376: 2,940 and 2,960 tests passing, no new type errors, builds passing.

**After #374 merged:**
- #376 was retargeted to `main`. It then contributed exactly one commit (`bb8b522`, 7 files), with nothing from #374 repeated.
- Main's tree was byte-identical to the gated #374 merge tree.

**After #376 merged:**
- Main's tree (`75b82e9`) is byte-identical to the gated tree.
- 2,960 / 2,960 tests pass.
- Type-check error files are unchanged (the 14 pre-existing files).
- `vite build` passes.
- Vercel previews were successful on both PR heads. The production deployment status of `4c14a6d` was not visible from the verification session.
