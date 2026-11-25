# Event Stats RED audit — repair verification (F-01 – F-06)

**Scope:** approved repairs F-01 – F-06 only. F-07 – F-15 are untouched.

**Code:**
- Repair branch: `claude/event-stats-red-repairs`, based on main `a2384fd`.
- Commits `55df080` (F-01 – F-06) and `98f2a57` (approved F-05 label rename); PR #374 (draft, not merged).
- Intelligence issues I-1 – I-3 are in a **separate** stacked draft PR #376: see `INTELLIGENCE-REPAIRS.md` and `KICKOUT-ORIGIN-DEFINITION.md`.

**Fixtures and references:** the audit pack at `a8581a5` (`audit/event-stats-ultra-test/`) is unchanged.
- `fixtures/`, `expected/` and the audit `scripts/` here are byte-identical copies, verified by SHA-256.
- The independent ledgers were **not** edited.

**Recommendation for this repair batch: AMBER.**
- All six findings are resolved against the unchanged independent ledgers, with no regressions.
- The approved "Clean Won" rename is done (below).
- Event Stats as a whole is **not GREEN**: F-07 – F-15 remain open, and every one of the 62 remaining failing checks is classified in `results/REMAINING-FAILURES.md`.
- CI on this PR is only the Vercel preview build (green). The repository has no GitHub Actions, so the test suite is not run by CI (see [CI status](#ci-status)).

## Layer-by-layer root cause and fix

**Rule applied:** fix the number where it is calculated, never in the PDF output. No PDF value was overridden. Every PDF change either replaces a page-local calculation with the shared core definition, or adds an honest "not recorded" state.

| | Where the wrong number came from | Root cause | Fixed at |
|---|---|---|---|
| **F-01** | **Core report counters** (`teamStatsViews.buildTeamSummaryBlock`) and **PDF page-local counters** (Restart Analysis, Restart Chain, Turnover pages) | Event Stats stores tile labels (`INTERCEPTION`, `HP ERROR`, `KP ERROR`, `BLOCK/SAVE`, kickout `FOUL`). The counters only knew Match Stats tags (`INTERCEPT`, `SLACK_*`, `BLOCK_SAVE`, `FOUL_WON/CONCEDED`). | **Report input boundary.** One kind-aware translation table, `reporting/eventTagClassification.ts`, applied once in `buildMatchReport`. The two PDF exports apply the same function at entry, because their pages also read raw events. It adds the canonical tag and keeps the stored one, so no event is double counted. Stored data is unchanged. |
| **F-02** | **Core classification** (`eventSource`) | The `65` tag (hurling/camogie 45) was not a placed-ball source, so `isPlacedScore` / `isPlacedMiss` returned false. | `eventSource.ts`: `65` → the `45` source. The ledger, `placedBalls`, conversion and PDF totals all follow from it. |
| **F-03** | **Intelligence: chain engine** (`chain-engine.buildTurnoverDataset`) | The forward scan skipped every event whose `teamSide` differed from the acting side. Event Stats stores every turnover under `FOR`, so when the opposition was acting, us winning the ball back was invisible. | `chain-engine.ts`: any later turnover ends the possession. Turnover-origin Intelligence is now correct. Core facts never depended on it. |
| **F-04** | **Core** (`restartMetrics.resolveRestartOwner`: owner = teamSide fallback) **+ Intelligence** (`possession-outcomes-engine.getRestartOwner` legacy shim) **+ 4 PDF pages** with their own copies of the fallback | Historical Event Stats restarts record the winner, not the taker. Each of these layers independently inferred an owner from it. | The Event Stats report adapter (`toEventStatsReportEvents`) marks owner-less restarts `UNKNOWN` at report time; stored events are never rewritten. The resolver returns `null` for `UNKNOWN`. The possession engine excludes `UNKNOWN` from the our/their families. The PDF pages call the shared resolver instead of their own copies, and print "Restart taker not recorded" or "—". The documented Match Stats / Rapid Capture convention (owner = teamSide) is unchanged. |
| **F-05** | **PDF page-local population** (`makeRestartVisualPage` "HOW WON", and owner checks in `makeKickoutChainPage`) | "Clean / Break Won" counted every own restart, lost ones included, and scaled the bars against all restarts won. | **New core predicate** `restartMetrics.isOwnRestartRetained`: owner recorded = team AND winner = team. Both pages use it. The header now names the population: "HOW WON — OWN KICKOUTS RETAINED (n)". |
| **F-06** | **PDF page-local definition** (Efficiency page: every `SHOT` counted as blocked) and the **core** Match Summary count (through F-01) | Two definitions of blocked/saved, and the Event Stats tag was never recognised. | **One core predicate** `isBlockedOrSavedAttempt`. It is used by `teamStatsViews` (Match Summary, Snapshot, Quick Review), the share card, the Efficiency page and the HT pitch markers. |

## Files changed (24)

**New**

| File | Why |
|---|---|
| `src/stats/reporting/eventTagClassification.ts` | F-01 / F-06: the single tag translation and the single blocked/saved definition |
| `src/stats/reporting/eventStatsRedRepairs.test.ts` | 18 tests: core definitions, built through the real Event Stats capture adapter |
| `src/stats/reporting/coreIntelligenceBoundary.test.ts` | 5 tests: Intelligence forward scans cannot change core facts |
| `src/stats/reporting/eventStatsRedRepairs.pdf.test.ts` | 6 tests: the PDF pages print the core definitions, with no page-local variant |

**Core / Intelligence / adapters**

| File | Why |
|---|---|
| `src/stats/reporting/matchReport.ts` | F-01: apply the translation once at the report boundary |
| `src/stats/eventSource.ts` | F-02 |
| `src/stats/chains/chain-engine.ts` | F-03 |
| `src/stats/chains/chain-types.ts` | F-04: `RestartOwnerValue` (`FOR` / `OPP` / `UNKNOWN`), report-time only |
| `src/stats/restarts/restartMetrics.ts` | F-04 / F-05: resolver returns null for unknown; `restartWinningSide`, `isOwnRestartRetained` |
| `src/stats/chains/possession-outcomes-engine.ts` | F-04: `UNKNOWN` belongs to neither the our nor the their family |
| `src/stats/reporting/restartTeamMetrics.ts` | F-04: `unknownOwnerRestarts`; "own kickouts were not recorded" sentence |
| `src/stats/reporting/snapshotDashboardModel.ts`, `quickReviewMatchOverview.ts` | F-04: unavailable state ("—" / "Not recorded") instead of 0/0 |
| `src/stats/reporting/teamStatsViews.ts` | F-06: shared blocked/saved definition |
| `src/pro-tagger/pro-tagger-review-adapter.ts` | F-04: `toEventStatsReportEvents` (stored match untouched) |
| `src/pro-tagger/ProTaggerLiveScreen.tsx`, `ProTaggerReviewScreen.tsx` | F-04: Quick Review and the Intelligence Pack use the same report-time view as the PDFs |
| `src/stats/reviewPdfExport.ts` | Replaces PDF-local definitions with core calls: F-01 translation at entry, F-04 resolver and unavailable states, F-05 predicate, F-06 predicate (Efficiency page, HT markers). Exports three page builders for the PDF-layer tests. |

**Type-only**

| File | Why |
|---|---|
| `eventAdapter.ts`, `matchTargets.ts`, `quickReviewSegmentBreakdown.ts`, `pro-tagger-score.ts`, `golden-fixture.ts` | Widened `restartOwner` type; no behaviour change |

**Existing test updated**

| File | Why |
|---|---|
| `ballylandersGalbally.realMatch.test.ts` | The expected sentence encoded F-03. The figure was re-derived independently from the stored log (`scripts/diagnostics/real-turnovers.mjs`, no `src/` imports): Galbally 3 of 10 = 30%, not 50%. |

## Before / after (same 636-event fixtures; ledgers unchanged)

Full check-level detail: `results/F01-F06-BEFORE-AFTER.md`.

| Match | Pass | Fail | Missing |
|---|---|---|---|
| A — football | 548 → **565** | 28 → **11** | 0 → 0 |
| B — football stress (live and after review edits) | 882 → **936** | 72 → **18** | 0 → 0 |
| C — hurling | 481 → **531** | 83 → **33** | 4 → 4 |
| **Total (2,186 checks)** | 1,911 → **2,032** | 183 → **62** | 4 → 4 |
| Legacy import (F-04) | 12 / 25 → **28 / 28** (3 Restart Chain checks added) | 13 → **0** | |
| F-05 cross-page (`compare-repairs-extra.mjs`) | **27 / 27** | | |
| Turnover diagnostic (production vs reference) | A 2 / B 21 / C 4 differing → **0 / 0 / 0** | | |

**By finding (checks that changed; every change FAIL → PASS):**

| Finding | Checks | Key values (expected = after) |
|---|---|---|
| **F-01** | 40 (+4 shared with F-05) | Swarm/Int., Slack KP/HP, Foul Won/Conceded, Block/Save: 0 → the tagged counts. Example: A Ballyboden Swarm/Int. 3, Slack 8, Foul Won 3. |
| **F-02** | 30 | C placed balls: Ballyhale 3/4 → **4/5**, Na Piarsaigh 6/6 → **9/9**. Unattributed 0-01 / 0-03 → none. Unclassified attempts restored. |
| **F-03** | 16 | B turnover losses → scores conceded 25 → **18**. Punishment rate 56% → **40%** (after edits 57% → **39%**). |
| **F-04** | 13 legacy, plus 3 new | Legacy dashboard "27/27 · 100%" → **"— · Restart taker not recorded"**. Restart Analysis "100% (27 of 27)" → **"—"**. Restart Chain panels → "Restart taker not recorded". Restart Share 59% kept. |
| **F-05** | 8 (+4) | A Clean Won 9 → **7**, Break Won 12 → **7**, Foul Won 0 → **2**. B 24 / 12 → **16 / 5**. C 10 / 15 → **4 / 7**. |
| **F-06** | 23 | A Ballyboden Blocked/Saved: Summary 0 / Efficiency 6 → **5 / 5**. B 0 / 6 → **3 / 3**. C Na Piarsaigh 0 / 8 → **3 / 3**. |

## Tests

- **Unit / integration (vitest): 2,879 / 2,879 passing**, 213 files.
  - Before this batch: 2,849 tests.
  - New: 30 (18 core, 5 boundary, 7 PDF-layer, including the label-population test for the rename).
- **Type check:** no new errors. Matches main's pre-existing baseline exactly (14 files, unrelated to this batch).
- **Proof the new tests guard the defects:**
  - The core tests fail on main's logic for F-01, F-02, F-03 and F-06.
  - Reintroducing main's page-local definitions fails the matching PDF-layer test: F-05 "HOW WON" population, F-06 Efficiency `kind === "SHOT"`, F-04 Restart Chain owner proxy.
  - Making a core restart count read chain attribution fails the boundary tests (2 of 5).
- **End-to-end, three times on the final code:**
  - Each run covers A, B, C and the legacy import, through the real Event Stats UI in Chromium.
  - 15 PDFs regenerated (HT/FT Snapshot and Full Review for every match, plus B after review edits).
  - 213 page images rendered.

**Coverage requested in Step 3:**

| Area | Result |
|---|---|
| Football vs hurling | A / B football and C hurling all pass for F-01 – F-06 |
| HT vs FT | HT and FT Snapshot pass; Quick Review HT/FT pass, except C hurling terminology (F-07) |
| Save / reload / reopen | Reopen checks: A 4/4, C 4/4; B 373/402 after review edits. The other 29 are 6 FAIL (F-10, F-11, F-12, also failing live), 21 UNVERIFIED and 2 LIMITATION, all as in the original audit |
| Historical compatibility | Legacy import 28 / 28 |
| Player attribution | Player Breakdown A 23/23, B 48/48, C 24/24 |
| Both teams' possession and origins | Verified for both teams |
| Unknown owner | Verified |
| Unknown player | 115 events with no player (A 10, B 89, C 16): no player row is invented and every Player Breakdown row matches |

## Regressions

**None.**
- 121 checks moved FAIL → PASS.
- 0 moved PASS → FAIL.
- No previously passing value changed.
- Core match facts are identical to main in every dataset: score lines, totals, margins, restart and turnover counts (`results/LAYER-IMPACT.md`).
- Console errors per run are unchanged from the audit run: one service-worker MIME warning per page load in the Vite dev server.

## Snapshot / Full Review / PDF consistency

**Shared definitions.** Every surface takes these from one definition:
- Blocked / saved: `isBlockedOrSavedAttempt`.
- Tag methods: `eventTagClassification`.
- Restart owner: `resolveRestartOwner`.
- Own restarts retained: `isOwnRestartRetained`.
- Placed source: `eventSource`.

**Checked in tests and end to end:**
- Quick Review ↔ Snapshot ↔ Full Review: all shared core values pass.
- Restart Analysis ↔ Restart Chain "Clean / Break / Foul Won": 27 / 27.
- Summary ↔ Efficiency "Block / Save": equal in every match.

**"Clean Won" labels: renamed as approved (`98f2a57`).** The same labels used to show two correct populations:
- **Match Summary rows** count every restart the team won or lost by method (the Restart Share population): A Ballyboden 10 / 14 / 3.
- **Restart Analysis and Restart Chain panels** count own kickouts retained / conceded: A 7 / 7 / 2.

**The rename:**
- The six Match Summary rows (Clean / Break / Foul Won, Clean / Break Lost, Foul Conceded) are now **"Restart Share — <method>"**.
- The own-kickout panels keep "Clean Won" etc.
- "Dead Ball Won" and "Kicked Dead" have no conflicting counterpart and are unchanged.
- Values, row order and layout are unchanged, and the labels fit the existing column (checked on the rendered page).
- The capture tiles (Rapid Capture / Match Stats "Clean Lost" etc.) are untouched.
- A PDF-layer test pins each label to its population.
- The harness reads either label, so before/after stays like-for-like.

## Remaining open findings (unchanged by this batch)

| Finding | Status after repair | Evidence in the rerun |
|---|---|---|
| **F-07** Hurling terminology and football-only blocks | Open | C: "OUR KICKOUTS", "Kickout" labels, 2-POINT PROFILE and Sin Bins row in hurling. The Match Summary row is still labelled "45" in hurling, though its values are now correct (FOR 1/1, OPP 3/3) via F-02. |
| **F-08** Review "Edit" changes only the type, offers sport-invalid types, leaves stale fields | Open | Not re-tested (no code touched) |
| **F-09** Kickout owner toggle resets to OUR K/O after every tagged event | Open | Not re-tested (no code touched) |
| **F-10** 45/65 and Sideline events absent from PDFs | Open | Match Summary "45" row: A 0 (exp 2), B 0 (exp 2 / 1), C 0 (exp 1 / 3); no "65" source row |
| **F-11** "Avg secs to score (won)" averages both teams | Open | A 36s (exp 38s), B 30s (exp 23s / 22s), C 36s (exp 30s). The only *statistical* error left (4 checks) |
| **F-12** Labels that misstate what is counted | Open | Raw "TWO_POINTER Scores" on every Efficiency page; Chain Intelligence "Won → Shot" shows shots-without-score |
| **F-13** Layout / clipping | Open | Text-overlap and off-page counts unchanged |
| **F-14** Player Contributions top-12 cap | Open | Not re-tested (no code touched) |
| **F-15** Minor inconsistencies | Open | Not re-tested (no code touched) |

**Classification of the 62 remaining FAIL checks** (`results/REMAINING-FAILURES.md`, one row per check with evidence):

| Category | Checks | What they are |
|---|---|---|
| Genuine statistical error | **4** | F-11 "Avg secs to score (won)" (A, B live, B after edits, C) |
| Presentation (numbers correct) | **39** | Hurling terminology (F-07); the raw "TWO_POINTER Scores" label and the "Won → Shot" label on a correct shot-without-score count (F-12); layout (F-13) |
| Unsupported functionality | **11** | The Match Summary "45" / "65" row cannot read the Event Stats 45/65 family, so it prints 0 (F-10, 7 checks); the football-only 2-POINT PROFILE block on hurling pages (F-07, 4 checks) |
| Test-harness problem | **8** | 6 duplicates (the "internal enum names" check counts the same TWO_POINTER strings as the "raw enum label" check); 2 disputed expectations (the reference assumes hurling has no sin-bin sanction, but hurling has a 10-minute sin bin for a cynical foul denying a goal chance; owner to confirm) |

Plus 4 MISSING checks: there is no "65" source row on the hurling efficiency table (F-07 / F-10, unsupported).

**Layout checks, item by item.** These are counted as presentation because real items remain, but the counts include harness false positives:
- 9 pitch-marker halos. Each "↓" is drawn twice, a shadow plus the glyph.
- 3 `maxWidth`-squeezed footnotes measured at natural width. They are squeezed, not clipped.

**Pre-existing Intelligence observations I-1 – I-3** are investigated and fixed in the separate stacked PR (`INTELLIGENCE-REPAIRS.md`, `KICKOUT-ORIGIN-DEFINITION.md`), not in this one.

## CI status

PR #374, head `98f2a57`:
- **Vercel Preview:** build and deployment ✅ success. This is the only check on the PR.
- **GitHub Actions:** the repository has no workflows, so no tests or lint run in CI. The verification here was run locally:
  - vitest 2,879 / 2,879;
  - type check against main's baseline;
  - three full end-to-end UI rounds.
- **Reviews and comments:** none besides the Vercel bot. No review threads.

## Did the Intelligence engine contribute to the RED failures?

**Yes, for two of the six.**
- **F-03** was entirely an Intelligence-engine defect: the chain engine's turnover forward scan.
- In **F-04**, the possession-outcomes engine independently inferred restart owners. That produced the invented "Ballyboden Kickouts" Intelligence Summary sentence on historical matches.
- F-01, F-02, F-05 and F-06 were core classification gaps or PDF-local definitions.

**No evidence that it altered authoritative core statistics.**
- Scores, restart and turnover counts, retention, Restart Share and placed balls read only event-level facts.
- Main and repair produce identical core figures wherever F-01 – F-06 did not intend a change.
- That boundary is now enforced by `coreIntelligenceBoundary.test.ts`.

## Reproduce

```
# app checkout with dependencies, Vite on :5199
node scripts/run-match.mjs fixtures/match-{A,B,C}.json runs/{A,B,C}
node scripts/run-legacy-import.mjs runs/A/state/final.json runs/A-legacy
node scripts/dump-pdf-text.mjs runs/<id>          # each run
node scripts/compare.mjs <A|B|C>
node scripts/before-after.mjs <id> ../event-stats-ultra-test/results/compare-<id>.json results/compare-<id>.json
node scripts/compare-legacy.mjs && node scripts/compare-repairs-extra.mjs
node scripts/findings-table.mjs && node scripts/report-tables.mjs
# Layer impact: copy scripts/diagnostics/layer-impact.test.ts to src/__audit__/ in a main and a repair checkout,
#   RUNS_DIR=$PWD/runs OUT_FILE=<out>.json npx vitest run src/__audit__/layer-impact.test.ts
#   node scripts/diagnostics/layer-diff.mjs <main>.json <repair>.json results/layer-impact-diffs.json
```

## Branch, commit and PR

- Repair branch: `claude/event-stats-red-repairs`
- Repair commits: `55df080` (F-01 – F-06) and `98f2a57` (F-05 label rename), on main `a2384fd`
- Pull request: https://github.com/shnakelol-ops/Paircvision/pull/374 (draft, **not merged**; awaiting approval)
- Verification pack: this directory, on `claude/pairc-event-stats-audit-ca55sj` (the original audit commit `a8581a5` is unchanged)
