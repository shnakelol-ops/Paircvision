# PáircVision Event Stats — Ultra Test: discrepancy report

**Build tested:** `a2384fd` (branch `claude/pairc-event-stats-audit-ca55sj`, no production code changed).
**Date:** 2026-10-23.
**Method:** every event was entered through the real Event Stats UI in Chromium. Every PDF is the real downloaded file. Every expected value comes from an independent calculator that imports nothing from `src/`.

## Final verdict: 🔴 RED

The core match facts can be trusted. All three matches pass on:
- final and half-time scores;
- goals, points and 2-pointers;
- shots, wides and conversion;
- own-kickout/puckout retention;
- restart share;
- turnovers won/lost;
- frees won/conceded;
- placed balls (football);
- per-player scoring, turnover, kickout and free attribution;
- capture timing and position;
- pause/resume, reload/restore and save/reopen.

Reports are not yet coach-trustworthy, though. Under the brief's criteria (*"incorrect statistics, attribution errors or misleading reports"*), these defects make it RED:

1. **Hurling 65s are not counted as placed balls.** This understates placed-ball scoring, puts 65 scores in "Unattributed", and changes a team's score-source breakdown in every hurling report (F-02).
2. **Opposition turnover-origin scoring is inflated.** Production keeps crediting a score to an opposition turnover after Event Stats has recorded us winning the ball back. In the stress match, the "punishment rate" read **56% instead of 40%** (F-03).
3. **Historical matches report fabricated own-kickout retention.** Saved data with no restart owner is reported as "27/27 retained (100%)" when the true value is 16/26 (F-04).
4. **Six Event Stats tags are never counted in the PDFs.** Interception, HP Error, KP Error, Block/Save, kickout Foul and 45/65-won always print **0** in the Match Summary and Analysis pages, while the coach tagged them every time (F-01, F-10).
5. **The same label means different numbers on different pages.** "Blocked / Saved" reads 0, 6 and (truth) 5. "Clean Won" counts lost kickouts. "Avg secs to score (won)" averages both teams (F-05, F-06, F-11).

## 1. Coverage — what was executed

| Lifecycle step (brief Phase 4) | How it was exercised | Evidence |
|---|---|---|
| 1 Create match (setup, squads, names, direction) | **UI** | `runs/*/screens/01-setup.png`, `02-squads.png` |
| 2 Record 1H events | **UI**: every tile → player picker → pitch tap | `runs/*/state/HT.json` |
| 3 Inspect HT statistics | **UI**: Quick Review p1–p3 + HT Snapshot PDF | `runs/*/state/HT-quickreview.json`, `pdfs/*HT-snapshot-live.pdf` |
| 4 Resume 2H | **UI** START SECOND HALF | run logs |
| 5 Record remaining events | **UI** | `runs/*/state/FT.json` |
| 6 Finish match | **UI** FT → Finish Match → Save Match | `runs/*/screens/20-fulltime.png` |
| 7 Snapshot + Quick Review | **UI** + FT Snapshot PDF | `pdfs/*FT-snapshot-live.pdf` |
| 8 Full Review | **UI** Full Review PDF | `pdfs/*FullReview-live.pdf` |
| 9 Generate and save the PDF | **UI** download (real file) | `pdfs/` |
| 10 Reopen and regenerate | **UI** reload app → Saved Matches → Review → regenerate ×2 | `runs/*/pdf-text/*reopened*.json` |
| Stress: undo, wrong team, wrong owner, wrong family | **UI** ↩ (5 corrections) | B run log |
| Stress: pause/resume ×3, reload ×3 (1H, HT break, 2H) | **UI** | B run log |
| Stress: review edits ×4, deletes ×2 | **UI** Event Map → Edit/Delete | `runs/B/screens/40-review-*.png` |
| Older saved-event format | **UI** Options → Import Match JSON (file derived from Match A; see F-04) | `runs/A-legacy/` |
| Hurling edit-type probe | **UI** on a copy of Match C | `results/edit-probe-hurling.json` |

**Injected data:** only the legacy-format JSON was imported through the app's own import UI. No events were injected into storage. The edit probe pre-loaded Match C's saved record into localStorage, which is the same record the app wrote.

**Match clock:** Playwright's fake clock advanced time, so events were tapped at their exact intended second. All 636 live taps were stored with the exact second, half, player number (including Unknown) and position (±0.01) — 0 mismatches.

| Match | Events stored | Automated checks | PASS | FAIL | MISSING | UNVERIFIED | LIMITATION |
|---|---|---|---|---|---|---|---|
| A football | 152 (75 / 77) | 597 | 548 | 28 | 0 | 20 | 1 |
| B football stress | 308 → 306 after deletes (154 / 154 at FT) | 1000 (live + post-edit) | 882 | 72 | 0 | 42 | 4 |
| C hurling | 176 (87 / 89) | 589 | 481 | 83 | 4 | 20 | 1 |

UNVERIFIED = values with no documented definition (Player Contributions "NET BALL", chain-rule counts). They are listed with their raw value, never passed. Full listings: `results/checks-{A,B,C}.md|csv`. Cross-surface table: `results/COMPARISON-TABLE.md`.

## 2. What is trustworthy (passed on all three matches)

- **Capture.** Every tap is stored with the right kind, team, clock, half, player and position. The opposition-kickout, turnover-row and free conventions match the documented contract (`pro-tagger-adapter.ts`).
- **Scorelines** at HT and FT on Quick Review, Snapshot dashboard, Full Review summary, Opposition Facts, Scoring Breakdown and 1H/2H pitch overviews. Goals, points value and 2-pointers (football). Hurling goal/point values.
- **Shots** (all attempts), scores, wides and conversion %, per team, on every surface.
- **Restarts:**
  - own kickout/puckout retained/taken per team, at HT and FT and per half;
  - restart share won/conceded/%;
  - Clean/Break won/lost on the Match Summary;
  - restart→score (origin) count and breakdown;
  - restart losses → scores against;
  - own-kickout-loss origin.
- **Turnovers:**
  - won/lost per team, per half, per segment, own/opposition half split;
  - Tackle counts;
  - Quick Review possession outcomes after turnovers/restarts.
- **Frees:** possession frees won/conceded. Placed balls attempts/scored/points/missed (football). Free advantage.
- **Segments** (Quick Review p3, Full Review Game Segments): score, shots/wides, KO W-L, net T/O, frees W/C for all 6 segments × 2 teams × 3 matches.
- **Players:** every Player Breakdown row (score, shots, wides, T/O W/L, KO W/L, frees W/C, actions) for every tagged player in all 3 matches. Includes opposition kickout winners, unknown players excluded from player rows, and edited player events.
- **Discipline counts** in the Full Review Intelligence Summary.
- **Longest scoring runs.**
- **Stability:**
  - reload mid-half, at HT and in 2H keeps clock and events;
  - pause freezes the clock;
  - live vs reopened PDFs are text-identical (A, C);
  - reopened-again is identical (A, B, C);
  - review edits and deletes propagate to every reopened PDF (B score 2-22 (28) → 2-23 (29)).
- **Score-origin exclusivity:** the Part 1 Scoring Breakdown partition is mutually exclusive and sums to the margin in all matches. The Part 3 origin layer overlaps by design, as documented on the page (placed frees inside kickout-origin possessions).

## 3. Findings

Severity: **High** = wrong or misleading statistic a coach would act on. **Medium** = wrong label, wrong sport or data-integrity risk. **Low** = presentation.

### F-01 · High · Event Stats sub-type tags are never counted in PDF breakdowns

- **Matches / events:**
  - A: Interception A-001, A-078, A-096; HP Error A-058, A-061, A-104; KP Error A-055, A-084, A-110; Block/Save A-011, A-017, A-050; kickout Foul A-004, A-071, A-102 and 3 more.
  - B and C: the same on every such tap.
- **Expected vs actual (Full Review p1 Match Summary)** — every row printed **0**:

| Row | A Ballyboden | A Na Fianna | B Kilmacud | B St Brigid's | C Ballyhale | C Na Piarsaigh |
|---|---|---|---|---|---|---|
| Swarm / Int. | 3 | 1 | 8 | 6 | 3 | 3 |
| Slack KP / HP | 8 | 5 | 20 | 18 | 7 | 5 |
| Block / Save | 5 | 0 | 3 | 1 | 2 | 3 |
| Foul Won | 3 | 3 | 3 | 3 | 2 | 4 |
| Foul Conceded | 3 | 3 | 3 | 3 | 4 | 2 |

  The same zeros appear in Restart Analysis "Foul Won", Turnover Analysis "Swarm / Intercept", "Unforced error" and "Slack pass", and Turnover Chain Analysis "How turnovers were won".
- **Root cause:** Event Stats stores the tile label as the tag (`INTERCEPTION`, `HP ERROR`, `KP ERROR`, `BLOCK/SAVE`, `FOUL`; `adaptProTaggerAction` → `resolveKindAndSide`). The report layer only knows Match Stats' vocabulary (`INTERCEPT`, `SLACK_HAND_PASS`, `SLACK_KICK_PASS`, `BLOCK_SAVE`/`BLOCKED`, `FOUL_WON`/`FOUL_CONCEDED`). Locations:
  - `src/stats/reporting/teamStatsViews.ts` `buildTeamSummaryBlock` (`toSwarmInt`, `toSlackKpHp`, `shotBlock`, `koFoulWon`, `koFoulCon`);
  - `src/stats/reviewPdfExport.ts` `makeRestartVisualPage` (`countKoTag("FOUL_WON")`, l.7204), `makeKickoutChainPage` (`countOutcomeTag(..., "FOUL_WON")`, l.2913), the turnover pages' `countTag(..., "SWARM", "INTERCEPT")` (l.3436, l.7344), and `renderHtMarkers` (`BLOCK_SAVE`, l.8312).
- **Reproduce:** Event Stats → tag Turnover → Interception → Full Review PDF → p1 "Swarm / Int." = 0.
- **Recommended fix:** add one tag-normalisation map (Event Stats label → canonical tag) in the report layer, e.g. in `eventAdapter` / `buildMatchReport`, rather than per page. Add a test that every Event Stats tile tag is counted by at least one report row.

### F-02 · High · Hurling 65 is not a placed-ball source (hurling scoring breakdown wrong)

- **Match / events:** C — 65 scores C-003 (1H 01:34), C-021, C-041 (Na Piarsaigh) and C-144 (2H 22:15, Ballyhale).
- **Expected vs actual:**

| Statistic | Ballyhale expected | Ballyhale actual | Na Piarsaigh expected | Na Piarsaigh actual |
|---|---|---|---|---|
| Placed balls (Quick Review, Snapshot HT/FT, Full Review) | 4/5 scored | **3/4** | 9/9 | **6/6** |
| Placed points | 6 | **5** | 9 | **6** |
| Scoring Breakdown "Unattributed" | 0-00 | **0-01** | 0-00 | **0-03** |
| Shot Efficiency "Unclassified" | 3 att, 0 scored | **4 att / 1 scored** | 8 att, 0 scored | **11 att / 3 scored** |

  Also, the "45" source row stays empty (there is no 65 row), and the HT Snapshot says "Ballyhale…: 1 placed-ball wide" when the true first half was 1 scored from 2.
- **Root cause:** `src/stats/eventSource.ts` `eventSource()` recognises `SOURCE_45`/`45`/`FORTY_FIVE`, but not the `65` tag that Event Stats stores for hurling (`FORTY_FIVE_TILE.altLabel`, `pro-tagger-families.ts`). As a result `isPlacedScore` and `isPlacedMiss` (`scoreLedger.ts`) return false.
- **Reproduce:** hurling match → Point → 65 → Full Review p4 shows it under "Unattributed".
- **Recommended fix:** map `65` to the 45 source (or a new `65` source label) in `eventSource`. Rename the source row to "65" for hurling/camogie. Add a hurling fixture test.

### F-03 · High · Opposition turnover-origin scores over-counted after we win the ball back

- **Match / events:** B. The 7 opposition turnovers credited with a score they did not produce:

| Turnover | Score credited | What actually happened |
|---|---|---|
| B-004 | B-008 | Kilmacud regained at B-006; St Brigid's re-won at B-007, then scored |
| B-028 | B-031 | |
| B-050 | B-054 | |
| B-110 | B-114 | |
| B-155 | B-159 | |
| B-230 | B-233 | |
| B-251 | B-255 | |

  The simulator's ground truth attributes those 7 scores to: a later turnover (2), a free (3), a sideline (1) and a restart (1).
- **Expected vs actual (B, live):**

| Statistic | Expected | Actual |
|---|---|---|
| Turnover losses → scores conceded | 18 | **25** |
| → shots against | 24 | **32** |
| St Brigid's turnover-origin scores | 2-15 + 1×2pt (23 pts) | **2-16 + 2×2pt (26 pts)** |
| Punishment rate / Intelligence Summary "turnover losses → origin score against" | 40% | **56%** |

  The same pattern holds after the review edits: 39% vs 57%. A and C each have 2–4 divergent turnovers, but none changes a score.
- **Root cause:** `src/stats/chains/chain-engine.ts` `buildTurnoverDataset` (l.365) has `if (fwd.event.teamSide !== actingSide) continue;`. Event Stats stores **every** turnover with `teamSide: "FOR"`. So when the opposition is the acting side, the scan cannot see us winning the ball back (a FOR `TURNOVER_WON`) and runs on to the opposition's next score, up to 60 s later. One score can then be claimed by two turnovers.
- **Diagnostic:** `scripts/diagnostics/turnover-diag.test.ts` → `results/diag-turnovers-*.json`. It runs the production engine on the stored events; it is **not** part of the reference.
- **Reproduce:** Turnover (Na Fianna row) → Turnover (our row) → Turnover (Na Fianna row) → Point (Na Fianna), all within 60 s → Opposition Origin page counts the point against both opposition turnovers.
- **Recommended fix:** decide "who lost the ball" from the turnover's resolved winner (`turnoverGainedByFor`), not from raw `teamSide`. Treat any turnover or restart as ending the acting possession.

### F-04 · High · Historical (owner-less) matches report 100% own-kickout retention

- **Data:** Match A's stored events converted to the documented legacy shape: `KICKOUT_WON` with `teamSide` = winner and no `restartOwner`; opposition turnovers as `TURNOVER_WON` / OPP. Imported via Options → Import Match JSON (`runs/A-legacy/`).

| Statistic | True value (unknowable from legacy data) | Snapshot dashboard and Full Review show |
|---|---|---|
| Ballyboden own kickouts | 16/26 | **"OUR KICKOUTS 27/27 · 100% · Lost 0/27"** |
| Na Fianna own kickouts | 9/20 | **"THEIR KICKOUTS 19/19 · 100%"** |
| Restart Analysis "Own Kickout Retention" | — | **"100% (27 of 27)"** |

  Scores, turnovers won/lost and restart share (59%) were correct, so historical *turnover* data is handled correctly.
- **Root cause:** `src/stats/restarts/restartMetrics.ts` `resolveRestartOwner` falls back to `owner = teamSide`. For legacy `KICKOUT_WON` that is the winner, so every restart becomes "own kickout retained". The code comment there already flags the legacy inconsistency with `possession-outcomes-engine.ts`.
- **Recommended fix:** when no restart in scope carries `restartOwner`, show own-kickout retention as "not recorded" (—) instead of deriving it. Keep Restart Share, which is valid.

### F-05 · High · Restart Analysis "HOW WON — Clean/Break Won" counts lost kickouts too

| Match | Clean Won expected → actual | Break Won expected → actual | Foul Won expected → actual |
|---|---|---|---|
| A | 7 → **9** | 7 → **12** | 2 → 0 |
| B | 16 → **24** | 5 → **12** | |
| C | 4 → **10** | 7 → **15** | |

- **Root cause:** `reviewPdfExport.ts` `makeRestartVisualPage`: `countKoTag()` counts tags over `forOwnedEvts`, i.e. every kickout we took, retained **or lost** (l.7121–7154). The bar is also scaled against `ko.won` (all restarts won), a third population. The Match Summary page and Restart Chain Analysis use different populations again (10/14 and 7/7).
- **Recommended fix:** filter to own kickouts retained (`getWinner === FOR`) and use one population for every "Clean Won" label.

### F-06 · High · "Blocked / Saved" has three different values for the same team

- **Match A, Ballyboden:** truth 5 (A-011, A-017, A-050, …); Match Summary "Block / Save" **0**; Shot & Scoring Efficiency "Blocked / Saved" **6**.
- B: 3 / 0 / 6. C Na Piarsaigh: 3 / 0 / 8.
- **Root cause:**
  - Match Summary: F-01.
  - Efficiency page `makeShotEfficiencyPage` (l.6110): `blocked = evts.filter(kind === "SHOT").length`, which counts Short and Post as blocked/saved.
- **Recommended fix:** count `SHOT` with the Block/Save tag only; show Short and Post separately (the Match Summary already has those rows).

### F-07 · Medium · Hurling reports use football terminology and football-only blocks

**Match C (hurling):**

| Where | What it shows | Should be |
|---|---|---|
| Snapshot HT/FT dashboard | "OUR KICKOUTS" / "THEIR KICKOUTS" | Puckouts |
| Quick Review p1 | "KICKOUTS" | Puckouts |
| Counts Sheet | "Kickout Won / Kickout Lost"; 45 rows labelled "65" correctly | Puckout |
| Counts Sheet | "Sin Bins" row present | No row (no hurling sanction) |
| Full Review Match Summary | "KICKOUTS" section, "Kicked Dead"; shot-detail row "45" | Puckouts; "65" |
| Full Review Restart Chain Analysis | "Shots from Kickout" | Puckout |
| Shot & Scoring Efficiency | full "2-POINT PROFILE" block (`TWO_POINTER Scores`, `45+2 Scores`) and a "45" source row | Hidden; "65" row |
| Intelligence Summary | "Sin bins" row | No row |

12 "kickout" words in the hurling Full Review, 2 in each hurling Snapshot.

- **Root cause:** hard-coded labels in:
  - `makeSnapshotDashboardPage`, `makeShotEfficiencyPage`, `drawMatchSummaryTable` (`reviewPdfExport.ts`);
  - the Counts Sheet row list (`ProTaggerLiveScreen.tsx` ~l.1595);
  - `QuickReviewPage1.tsx`.
  `restartMetricLabel` (sport-aware) exists but is not used there.
- **Recommended fix:** route every restart / 45 / 2PT / sanction label through the existing sport-aware helpers (`getRestartTerm`, `restartMetricLabel`, `getDisciplineOptions`). Suppress 2PT blocks when `sport` is hurling/camogie.

### F-08 · Medium · Review "Edit" changes only the type, offers sport-invalid types, and leaves stale fields

- **Evidence:** `results/edit-probe-hurling.json`. The Type list offers all 23 internal kinds, including `TWO_POINTER`, `FORTY_FIVE_TWO_POINT`, `POSSESSION_WON/LOST` (Rapid-only), `FREE_SCORED`, raw enum labels and "KICKOUT WON" in hurling.
- Editing a hurling point to `TWO_POINTER` was accepted. The scoreline became **1-20 (23)** (impossible in hurling) and the stale `PLAY` tag was kept.
- **Match B edits:**
  - B-151 Shot (Block/Save) → Point keeps tag `BLOCK/SAVE`, has no source and lands in "Unattributed" (St Brigid's 0-01). No way to set a source.
  - B-006 Turnover Won → Lost keeps `HP ERROR`. It flips from "opposition hand-pass error" to "our hand-pass error" without the coach choosing it.
  - B-176 Kickout Won → Lost keeps owner and player. Correct here, but only by accident of convention.
  - No edit can change team, restart owner or source.
- **Root cause:** `ProTaggerReviewScreen.tsx` `saveProEdit` writes `kind`/`type`/player only. The dropdown maps over `MATCH_EVENT_KINDS` unfiltered.
- **Recommended fix:** offer only the families valid for the match's sport and capture surface. When the family changes, re-run the capture adapter (`adaptProTaggerAction`) from family + tile + row + owner so tags, teamSide and owner stay consistent. Add source / team / owner fields to the edit sheet.

### F-09 · Medium · Kickout owner toggle resets to OUR K/O after every tagged event

- **Evidence:** after each of the **84 / 84** opposition-owned kickouts tagged across A–C, the toggle read OUR K/O / OUR P/O on return (`runs/*/state/owner-toggle-checks.json`). The toggle also resets after any other event. Consecutive opposition kickouts need the coach to re-select THEIR K/O each time; forgetting flips `restartOwner` and silently swaps own-kickout retention between the teams.
- **Root cause:** owner state is `useState` inside `ProTaggerFamilyGrid`, which unmounts whenever `phase !== "IDLE"` (`ProTaggerLiveScreen.tsx` l.1312), so state is lost after every tap. No test covers persistence.
- **Recommended fix:** lift `restartOwnerByFamily` into `ProTaggerLiveScreen`, or decide deliberately on a reset rule (e.g. "next kickout is taken by the team that just conceded"). Then add a test.

### F-10 · Medium · 45/65 and Sideline events, and Discipline outside one table, are absent from every PDF

- 0 mentions of Sideline or 45/65 won in all 9 live PDFs (`results/compare-*.json`, presentation section).
- Match Summary shot-detail "45" row is always 0, although Ballyboden won 2 (A-051, A-140).
- Discipline appears only in the Full Review Intelligence Summary team-comparison rows. It is not in Snapshots, player tables or timelines.
- These events are captured and counted only in the Quick Review Counts Sheet.
- **Root cause:** `EVENT_COLORS` comment in `reviewPdfExport.ts` (l.416): "Event Stats-only kinds, deliberately not wired into any PDF_KIND_SETS/page".
- **Recommended fix:** add 45/65 and Sideline won/lost rows to the Match Summary and Restart Analysis, and cards to player rows. Remove or relabel the dead "45" shot-detail row.

### F-11 · Medium · "Avg secs to score (won)" averages both teams

| Match | Expected (Ballyboden / Kilmacud / Ballyhale only) | Actual |
|---|---|---|
| A | 38 s | 36 s |
| B | 23 s | 30 s |
| C | 30 s | 36 s |

- **Root cause:** `scoringOuts = outcomes.filter(secondsToScore !== null)` over **all** kickouts (`reviewPdfExport.ts` l.7140, also l.2944), shown in our team's panel under "won".
- **Recommended fix:** filter `winningSide === "FOR"` (and show the opposition's separately), or relabel it.

### F-12 · Medium · Labels that misstate what is counted

- **Scoring runs printed as "pts" but measured in scores** (`makeKickoutChainPage` l.2738, `makeChainSummaryPage` l.2580). Chain Intelligence shows "Na Fianna ×4 2H S6 — **4 pts**"; the run was 2-03 (**9 pts**), as the Scoring Momentum page correctly shows.
- **"Won → Shot"** on Chain Intelligence prints shot-*without*-score: A 5 (38%) vs 6 (46%) shots; B 12 vs 24; C 3 vs 11. Turnover Analysis and Intelligence Summary label the same idea correctly.
- **Counts Sheet "Points" (10) vs Full Review "Points" (16)** for the same team: count of 1-point scores vs points value.
- **Raw enum "TWO_POINTER Scores"** is printed on Shot & Scoring Efficiency (all 6 football and hurling efficiency pages).
- **"Restart-origin scores for OPP" vs "Restart-origin scores conceded"** on the same Opposition Origin page: A 17 pts (11 scores, de-duplicated) vs 19 pts (12 scores, raw). Nothing explains the difference.
- **Recommended fix:** use "scores" for run lengths. Rename "Won → Shot, no score". Name the Counts row "1-pt scores". Apply a label map to the efficiency rows. Footnote or align the two restart-origin rows.

### F-13 · Low · Layout and clipping (confirmed on rendered pages, `pdf-images/`)

- **Layer badge over wordmark:** the badge (STATISTICS/POSSESSION/CHAIN) is stamped over the "PáircVision" wordmark on every Snapshot page and every Full Review page except the cover.
- **p1 Match Summary:** the "152 total events" footer overlaps Na Fianna's "Placed Misses" value (`*-FullReview-live-p01.jpg`).
- **p18 Restart Analysis:** the origin footnote is squeezed via `maxWidth` into illegible text overlapping "46 events".
- **p29 Turnover Chain Analysis:** "Possession Chain Insights" lines run off the right edge mid-phrase.
- **p29 split bar:** reads 13% + 88% = 101%.
- **Name truncation:** "Ballyhale…" on Snapshot dashboards, Restart Battle and the Scoring Breakdown header, despite free space. The Snapshot shot-profile callout is truncated ("· …").
- **FT "Our/Their Shot Profile" (Snapshot):** plots raw coordinates, so 1H and 2H shots sit at opposite ends with no half labels. The highlighted hotspot zone is direction-normalised, so the two disagree (`renderHtMarkers` was written for the 1H-only HT snapshot). "Free won" markers are plotted on a shot map.

### F-14 · Low · Player Contributions silently shows only the top 12 players per team

A #6, B #7 and #15 (live; #4 and #7 after the review edits), and C #6 are absent with no "+N more" (`makePlayerContributionsPage`, `ranked.slice(0, 12)`). Their rows are complete on Player Breakdown.

### F-15 · Low · Minor inconsistencies

- **Page count:** the Review screen says "Full Review PDF — 37+ pages"; the actual PDFs had 29–30 pages.
- **Venue:** a blank venue is saved as the literal "Unknown venue".
- **Segment labels:** Quick Review says "Early 0–10 · Mid 10–20 · Late 20+"; Full Review says "Mid (11–20) · Late (21–30+)" for the same 600 s boundaries.
- **Zero shown as dash:** a zero "SC" cell prints "—" when attempts > 0 (efficiency source table).
- **Dev console:** React warns about mixing `border` / `borderColor` on every render (`console.error`, dev build).

## 4. Phase 6 — regression checks (against current code)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Kickout ownership resetting unexpectedly | **FAIL** — resets to OUR after every event (84/84) | F-09 |
| 2 | Turnover WON and LOST player attribution | **PASS** — every player row's T/O W/L matched in A, B, C (incl. Unknown players and edited B-006) | `checks-*.md` Player Breakdown |
| 3 | Historical turnover data | **PASS** for turnovers (legacy `TURNOVER_WON`/OPP gives correct won/lost totals). **FAIL** for legacy restarts | F-04 |
| 4 | INTERCEPTION reporting | **FAIL** — always 0 in PDFs | F-01 |
| 5 | HP/KP ERROR reporting | **FAIL** — always 0 | F-01 |
| 6 | BLOCK/SAVE reporting | **FAIL** — 0 on Summary, all-SHOT count on Efficiency | F-01, F-06 |
| 7 | KO FOUL reporting | **FAIL** — always 0 | F-01 |
| 8 | Unknown kickout player selection | **PASS** — 29/76 B restarts and 81/308 B events had no player. Stored without a player, counted in every team total, excluded from player rows as the page states | Capture + team checks |
| 9 | Review edits changing type without updating fields | **FAIL** — tags, owner and team kept; no source; sport-invalid types offered | F-08 |
| 10 | 45/Sideline/Discipline disappearing from reports | **FAIL** — 45/65 and Sideline in no PDF; discipline only in one Full Review table | F-10 |
| 11 | Incorrect HT/FT totals | **PASS** — all HT/FT scores and totals, all surfaces, all matches | Comparison table |
| 12 | Scoring-origin duplication or missing categories | **FAIL** — turnover-origin double-claims (B); hurling 65 → Unattributed. Direct partition is exclusive and sums to the margin (PASS) | F-02, F-03 |
| 13 | PDF values differing from Snapshot | **PASS** for every shared core value (Quick Review ↔ Snapshot ↔ Full Review). **FAIL** for same-label different-value rows | F-06, F-12 |
| 14 | Reloading saved matches changing statistics | **PASS** — live vs reopened PDF text identical (A, C); reopened ×2 identical (A, B, C); 3 mid-match reloads lost nothing | Reopen checks |
| 15 | Hurling events calculated as football events | **FAIL** — 65 not a placed ball; football labels and 2PT blocks; 2PT editable in hurling. Goal/point values PASS | F-02, F-07, F-08 |

## 5. Method notes and caveats (read before acting on a number)

- **Independent reference:** `scripts/reference.mjs` reads fixture **facts** (who did what), never production kinds. Every percentage's denominator is written next to it in `expected/ledger-*.json` (`definition` fields).
- **Origin windows:** restart 90 s / turnover 60 s / possession 90/60/45 s follow the documented product semantics. They are heuristics, so the reference applies them by **team**, not by stored `teamSide`.
- **Reference correction during the audit:** one rule was refined mid-audit. A fresh turnover won by the acting team now ends its previous possession. That removed one false difference (B-096) where production was right. The simulator's ground-truth origin backs every remaining F-03 case.
- **No dedicated half-time Full Review PDF:** HT is covered by the HT Snapshot PDF plus HT Quick Review (all 3 pages). Each match produced **HT Snapshot, FT Snapshot and Full Review** PDFs live, and again after reopening.
- **Not independently verified:**
  - Player Contributions "NET BALL" (formula not documented) and Player Chain Involvement counts;
  - chain-rule match counts;
  - narrative sentences in the Match Swing Timeline;
  - zone *names* on Zone Analysis / Turnover & Territory (zone *counts* were checked);
  - visual marker positions, beyond the spot checks in F-13.
- **Ordering:** no two events in any fixture share a match-clock second, so event order is unambiguous for both the app and the reference.
