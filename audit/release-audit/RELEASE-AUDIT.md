# Event Stats: three-match release audit

| | |
|---|---|
| **App version audited** | main `fc7beec` (PR #382 merged). Its tree is identical to the tree that passed 3255/3255 unit tests, the type check (no new errors) and the production build. |
| **Date** | 7 November 2026 |
| **Method** | Fresh, independent matches entered through the real Event Stats UI (Chromium; match A also under Pixel 7 emulation). Every displayed figure is compared with an expected ledger computed without any PáircVision code. |
| **Changes to the app** | None. |

## 1. How the audit was built

**Fresh matches.** The red-repairs generator, copied into `scripts/gen-fixtures.mjs`, was run with new seeds and new teams. The matches the earlier fixes were tested against are not reused.

| Match | Fixture | Live events | Lifecycle |
|---|---|---|---|
| **A** | Football, standard **60-minute** match (2 × 30), Castlehaven v Nemo Rangers | 134 | 4 substitutions, 3 cards (incl. a sin bin), penalty goal, mark |
| **B** | Football stress test (2 × 35), Corofin v Moycullen. Rapid events every 4–15 s. | 331 | <ul><li>5 wrong taps undone live (wrong team, wrong restart owner, wrong family)</li><li>4 substitutions</li><li>4 cards (incl. a red)</li><li>3 pauses</li><li>3 reloads</li><li>**storage failure** for 4 events (with an undo during it)</li><li>**tab closed and app reopened** mid-half</li><li>8 Review edits, 2 Review deletes, 4 Review Edit safety probes</li></ul> |
| **C** | Hurling (2 × 35), Kilmallock v Ballygunner | 175 | puckouts, 65s, sidelines, penalty goal, 4 substitutions, yellow and red cards |

**Realism rules in the generator:**
- A player who has been substituted off, sent off or is serving a sin bin is never tagged; bench players are tagged only after coming on.
- Substitutions are made through the real Subs sheet.

**Independent expectations.** `scripts/reference.mjs` imports nothing from `src/`.
- `reference-kickout-phase.mjs` applies the authoritative kickout-origin definition.
- Ground-truth validation (`expected-authoritative/VALIDATION.json`) shows 0 wrong kickout-origin credits apart from three fixture artifacts:
  - two scripted penalty goals inserted after a restart;
  - one Review edit that post-dates the simulator truth.

**What was compared:**
1. **Every displayed figure** (`compare.mjs`) on:
   - Quick Review pages 1–3 at HT and FT;
   - HT and FT Snapshot PDFs;
   - the Full Review PDF, both live and reopened after save, reload and the Review edits;
   - the cross-page consistency checks;
   - the legacy-import path.
2. **Every stored event** (`verify-events.mjs`, new). Each event saved at HT, at FT and after the Review edits is decoded with the documented storage rules into:
   - who scored, shot, or won the restart, turnover, free or 45;
   - the card;
   - the score source;
   - the player and the team they were picked from.

   It is then compared field by field with the reference facts. A mutation test with 4 planted errors catches all 4.
3. **Lifecycle** (`run-match.mjs`, extended): substitutions, storage failure and recovery, the leave guard, tab closure and reopen, reloads, resume clock.
4. **Review Edit**: the scripted edits and deletes, safety probes, and an Event Map reachability sweep (`map-reachability.mjs`, new).

## 2. Results per match

All counts are checks. FAIL rows are classified in §4: every one is either a previously documented presentation item or a harness wording issue, apart from the RED label in §4.

| Match | Displayed-figure checks | PASS | FAIL | Unverified / limitation | Stored-event fields checked | Field mismatches |
|---|---|---|---|---|---|---|
| A | 624 | 589 | 10 | 22 / 3 | 2,098 (HT + FT + final) | **0** |
| A (Pixel 7) | 624 | 589 | 10, identical to desktop | 22 / 3 | 2,098 | **0** |
| B | 1,049 | 984 | 13 | 44 / 8 | 4,763 | **0** |
| C | 623 | 569 | 28 | 22 / 4 | 2,738 | **0** |
| Legacy import (A) | 28 | 28 | 0 | | | |
| Cross-page / repair checks | 27 | 27 | 0 | | | |

**Totals:**
- **640 live events** entered through the UI (+5 undone wrong taps), and A again on Pixel 7: **774 events**.
- **2,975 displayed-figure checks**: 2,296 + Pixel 7 624 + legacy 28 + cross-page 27.
- **12,295 stored-event field checks**, all equal to the reference.

**HT and FT scores** are correct on every surface in all three matches (Quick Review, both Snapshots, Full Review live and reopened):

| Match | HT | FT |
|---|---|---|
| A | 0-12 v 2-13 | 1-24 v 4-21 |
| B (as finally edited) | 0-14 v 0-12 | 3-27 v 1-22 |
| C | 3-12 v 0-09 | 4-24 v 0-23 |

**Verified correct (GREEN) in all three matches:**
- **Events:** every recorded event (team, player and player's team, half, clock, position, source).
- **Statistics:** shooting, kickout/puckout ownership and retention, turnovers won and lost, frees and placed balls, discipline, player statistics, segments.
- **Possession Intelligence:** possession figures, apart from the one RED label below.
- **Surfaces:** Quick Review pages 1–3, HT/FT Snapshot figures, Full Review figures.
- **Persistence:** reopen after save and reload produces identical page text.

## 3. Persistence, recovery and Review Edit

| Check | Result |
|---|---|
| 12 substitutions (A, B, C) + 4 (A on Pixel 7) | **GREEN.** The outgoing player is stored inactive; the incoming player takes their slot. Events after the substitution carry the new player. |
| B: storage fails (QuotaExceededError) for 4 events, including an undo | **GREEN.** <ul><li>Nothing is overwritten (92 stored before and during).</li><li>The strip reads "Save failed — storage full. Back up and delete old matches."</li><li>Options → Home shows "Leave match?"; Stay in Match keeps the match.</li><li>Once storage recovers, the next event stores all 96.</li></ul> |
| B: tab closed mid-half, app reopened in a new tab | **GREEN.** All 260 events kept. The "Resume in-progress match" and RESUME MATCH flow appears, and the clock resumes at 20:00, where it stopped. |
| B: 3 reloads | **GREEN.** Clock and events identical before and after each reload. |
| Save → reload → Saved Matches → Review → regenerate PDFs | **GREEN.** Identical page text; the stored record equals the reference after reopening. |
| B: 6 Review edits that could be opened | **GREEN.** All are stored exactly as the reference expects (0 field mismatches): <ul><li>wide → point</li><li>our kickout won → lost, player cleared</li><li>blocked shot → point, source unknown</li><li>turnover won → lost</li><li>free won → conceded</li><li>their kickout kept → lost by them, player cleared</li></ul> |
| B: 2 Review deletes | **GREEN.** |
| Review Edit safety rules (main, Pixel 7): <ul><li>turnover → point not offered;</li><li>shot → point keeps the source unknown;</li><li>a kickout flip with a player is refused, and allowed once the player is cleared;</li><li>45 won → lost not offered;</li><li>an edit while storage is full alerts "Change not saved" and leaves the stored event unchanged.</li></ul> | **GREEN.** |
| B: Review Edit probe "turnover → score / free / kickout not offered" | **GREEN.** |
| **B: 2 Review edits and 3 probes could not be carried out** (yellow → sin bin; a point → wide; probes on a point, a 45 and a kickout) | **AMBER, new (N-1).** The Event Map marker could not be opened in any filter view (324 taps each). See §4. |

**Event Map reachability sweep.** Every event of the saved match was tapped in every half × team × category view: centre plus 4 points 5 px out.
- A: 129 of 134 events can be opened.
- B: 305 of 331 events can be opened.
  - The 26 that cannot are: 10 turnovers won, 6 kickouts, both 45s, 2 sidelines, 2 points, 2 turnovers lost, 1 wide and 1 yellow card.
  - These are upper estimates: wider taps found 2 more targets during the edits.
- Results: `results/map-reachability-*.json`.

## 4. Findings

### RED — release-blocking

| # | Finding | Status | Evidence | Reproduction |
|---|---|---|---|---|
| **R-1** | **Full Review → Chain Intelligence: "Turnovers Won → Shot" prints the count of turnovers won that led to a shot *without* a score.** The number is right for "shot, no score", but the label states something false. <ul><li>Match A prints "Won → Shot 0 (0%)", but 5 of 9 turnovers won led to a shot (all 5 scored).</li><li>B prints 13 (23%) against a true 24 (43%).</li><li>C prints 2 (20%) against 9 (90%).</li></ul> The Intelligence Summary already labels the same number "→ shot, no score". | Previously documented (F-12 "M"), not yet fixed | `results/compare-*.json`, check "turnovers: Won → Shot" | Any match with turnovers won that led to scores → Options → Full Review PDF → Chain Intelligence page → "Turnovers" block → "Won → Shot". |

No other release-blocking defect was found. No statistic is calculated wrongly, no event is stored wrongly, and no data is lost on any tested path.

### AMBER — non-blocking

| # | Finding | New / known | Evidence | Reproduction |
|---|---|---|---|---|
| **N-1** | **Event Map: some events cannot be opened for Review Edit.** <ul><li>A tap opens the top-most (latest-drawn) marker whose graphic covers the point. Markers are up to 10 px in radius, with a larger glow on scores.</li><li>So an event drawn under a later one within roughly 10 px is unreachable.</li><li>Cards, 45/65s and sidelines have no category chip, so they share the ALL view with every event of that half and team.</li><li>A card is normally tagged at the foul's spot, under or over the free.</li></ul> Measured: A 5 of 134 (4%) unreachable; B 26 of 331 (8%), including both 45s and 10 turnovers won. Data is unaffected, but a mis-tagged event in a crowded spot cannot be corrected or deleted. | **New** | `results/map-reachability-*.json`; `runs/B/state/review-probes.json` | Saved match B → Review → Event Map → H1, FOR, ALL → tap the 11:52 yellow card at the foul spot. The free or turnover drawn over it opens instead, in every filter view. |
| K-1 | Hurling reports use football wording: OUR/THEIR KICKOUTS, "Kickout" rows in Quick Review, 17 "kickout" words in the Full Review. | Known (F-07) | C: 15 FAIL checks | Match C → Quick Review / any PDF. |
| K-2 | A 2-POINT PROFILE block is drawn on hurling Efficiency pages (Snapshot FT, Full Review). | Known (F-07) | C: 4 FAIL | Match C → FT Snapshot p8 / Full Review Shot & Scoring Efficiency. |
| K-3 | Raw label "TWO_POINTER Scores" on Shot & Scoring Efficiency (FT Snapshot, Full Review). | Known (F-12) | A, B, C | Any football match → FT Snapshot p8. |
| K-4 | PDF layout: <ul><li>overlapping text boxes (the layer badge over the wordmark, the p1 footer);</li><li>a Restart Analysis footnote running off the page.</li></ul> Some of the overlap counts are harness false positives (glyph halos). | Known (F-13) | 6–27 items per PDF | Any match → any PDF, page 1 header. |
| K-5 | Player Contributions shows only the top 12 players per team. | Known (F-14) | LIMITATION checks | Match B → Full Review → Player Contributions. |
| K-6 | The NET BALL formula is not explained on the page. | Known | UNVERIFIED checks | Full Review → Player Contributions. |
| K-7 | Unsaved events are lost on browser back, reload, tab close or an Android OS kill **while storage writes are failing**. | Known (recorded at #380) | — | — |
| K-8 | The player shows as "#15 #15" when the opposition squad has no names. | Known (cosmetic) | Event detail | Match B → Event Map → any opposition event. |

### GREEN — harness corrections (not app defects)

- **Plural wording.** "1 shot" / "1 score against" on Quick Review p1 (A, B) is correct English. The harness expected "1 shots". The figures match.
- **Hurling Sin Bins row.** It is legitimate: the hurling sin bin exists since 2021. The harness expectation is wrong, as already documented.

## 5. Android / browser limitations

- Pixel 7 emulation (touch, mobile viewport) gives identical figures and stored data to desktop Chromium.
- Not tested here, and outside what this environment can reach:
  - real-device performance;
  - iOS Safari;
  - Android OS memory-pressure kills.
- Known: mobile browsers do not reliably show the "Leave site?" prompt. The background flush cannot succeed while storage is full (K-7).

## 6. Release-readiness assessment

**AMBER — releasable after one label fix.**
- **Calculations and storage: no defects.** Every statistic computed from the captured events, and every stored event, matches the independent reference across 640 fresh events, including:
  - a 60-minute match;
  - a high-volume stress match with substitutions, storage failure, app closure and Review edits;
  - a hurling match.
- **Persistence and recovery:** behave correctly on every tested path.
- **What remains:**
  - one misleading label (R-1);
  - known presentation items, mostly hurling wording;
  - a new Review Edit usability limit (N-1) that affects a few percent of events in crowded areas.

## 7. Smallest list of release-blocking fixes

1. **R-1:** relabel Chain Intelligence "Won → Shot" as "Won → Shot, no score", the wording the Intelligence Summary already uses. This is one string in `reviewPdfExport.ts`; numbers and definitions are unchanged.

**Recommended before a public hurling release (owner's call, not blocking for football):** K-1 and K-2, hurling wording and the 2-point block.

**Recommended soon after release:** N-1. Give cards and 45/65/sideline events a category chip, and/or make a tap choose the nearest marker or list the overlapping events.
