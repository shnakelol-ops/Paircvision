# Phase 1 — Event Stats system audit (as implemented at `a2384fd`)

Scope: **Event Stats** = the `/pro-tagger` app (`src/pro-tagger/`). Match Stats (`StatsModeSurface.tsx`) and Rapid Capture share the event model and report layer but are separate capture surfaces; they were read only where Event Stats depends on them.

Everything below was read from code, then confirmed by driving the running app (see `README.md`). Where something is *not* implemented, it says so.

## 1. Event schema and capture contract

Stored event (`LoggedMatchEvent`, `src/core/stats/saved-match.ts`; created by `adaptProTaggerAction`, `src/pro-tagger/pro-tagger-adapter.ts`):

| Field | Meaning in Event Stats |
|---|---|
| `id` | `crypto.randomUUID()` |
| `kind` / `type` | one of 23 `MATCH_EVENT_KINDS` (`stats-event-model.ts`) |
| `teamSide` | `FOR` = home, `OPP` = away. **Convention differs by family**, see below |
| `restartOwner` | Who took the restart. Set for Kickout/Puckout, 45/65 and Sideline. Absent on matches recorded before owner capture |
| `tags` | One tag = the tapped tile label, upper-cased (`PLAY`, `FREE`, `45`, `65`, `HP ERROR`, `BLOCK/SAVE`, `FOUL`, …) |
| `period` / `half`, `segment` | 1H/2H; segment 1–6 = 10-minute blocks per half (≥20:00 → late block) |
| `matchClockSeconds` | Elapsed seconds in the half (resets to 0 at 2H) |
| `nx`, `ny` | Normalised pitch position (landscape length / width axis) |
| `playerId/Name/Number`, `squadId` | Player picked in the picker ("No player / Unknown" → none) |

Family → stored kind (the tile row decides `teamSide`):

| Family (tiles) | FOR row | OPP row | Notes |
|---|---|---|---|
| Goal / Point (Play, Free, Penalty, Mark, 45→**65** in hurling) | `GOAL`/`POINT`, FOR | same, OPP | source is the tag |
| 2PT (Play, Free, Penalty, Mark, 45) — **hidden in hurling** | `TWO_POINTER` (45 → `FORTY_FIVE_TWO_POINT`) | same, OPP | 2 points |
| Shot (Short, Block/Save, Post) | `SHOT`, FOR | `SHOT`, OPP | **no source recorded** |
| Wide (Play, Free, Penalty, Mark, 45/65) | `WIDE` | `WIDE` | |
| Kickout/Puckout (Clean, Break, Foul) + OUR/THEIR toggle | owner retains → `KICKOUT_WON` (teamSide = owner) | owner loses → `KICKOUT_CONCEDED` (teamSide = **owner**) | picker = team of the tapped row (winner) |
| 45/65 (Won), Sideline (Won) | `FORTY_FIVE_WON` / `SIDELINE_WON`, owner = tapped row | same for OPP | only "who won it" can be recorded |
| Turnover (Tackle, Interception, HP Error, KP Error, Overcarried) | `TURNOVER_WON`, FOR | `TURNOVER_LOST`, **teamSide FOR** | both rows tag **our** player |
| Free (Won, Conceded) — home perspective only | `FREE_WON`, FOR | `FREE_CONCEDED`, FOR | no OPP row |
| Discipline (Yellow, Sin Bin, Red) — Sin Bin hidden in hurling/camogie | `YELLOW_CARD`/`SIN_BIN`/`RED_CARD`, FOR | same, OPP | |

Never produced by Event Stats (other surfaces only): `FREE_SCORED`, `FREE_MISSED`, `POSSESSION_WON/LOST`, `FORTY_FIVE_CONCEDED`/`SIDELINE_CONCEDED` (unreachable from the UI because 45/Sideline owner is implicit).

Scoring rules (`scoreLedger.ts` `SCORE_KINDS`/`scoreValue`): goal 3, point 1, 2-pointer 2, `FORTY_FIVE_TWO_POINT` 2. These are the same in hurling. The 2PT family is hidden in hurling, but the Review **Edit** dropdown still offers 2PT kinds (see the discrepancy report, F-08).

## 2. Lifecycle (`ProTaggerLiveScreen.tsx`)

PRE_MATCH → ▶ Start → FIRST_HALF → HT (confirm "End Half") → HALF_TIME → START SECOND HALF (clock resets to 0) → SECOND_HALF → FT (confirm "Finish Match") → FULL_TIME.
- **Pause/Resume:** stops the clock interval; tagging stays possible while paused.
- **Undo (↩):** removes the last event.
- **Autosave:** 1.2 s debounce, plus a flush on `beforeunload`.
- **Reload:** "Resume in-progress match" → MATCH REOPENED → RESUME MATCH continues from the saved clock.
- **Resume after FT:** not available.
- **After FT:** Save / Save & Finish. Saved Matches → Review screen, which has the Event Map (Edit type / player number / player name; Delete), Intelligence Pack, Export JSON, and the three PDF exports.
- **Options → Import Match JSON:** no event normalisation; the file is validated only by `isValidProMatch`.

## 3. Report surfaces and what each displays

| Surface | Built by | Content |
|---|---|---|
| Quick Review p1 "Match Overview" (in-app) | `buildQuickReviewMatchOverview` | Score; shooting (scores/attempts %); longest run; own kickouts retained (both teams); restart won/lost → shots/scores and turnovers won/lost → shots/scores (possession engine); frees won/conceded; placed balls |
| Quick Review p2 "Counts Sheet" | `computeProTaggerCounts` | Goals, Points (**count of 1-point scores**), 2PT, Shots, Wides, Turnover Won/Lost, Kickout Won/Lost, Free Won/Conceded, 45 Won/Lost, Sideline Won/Lost, Yellow, Sin Bins, Red |
| Quick Review p3 "Segment Comparison" (from HT) | `buildQuickReviewSegmentBreakdown` | Per 10-min segment: score, shots, wides, turnovers won/lost with own/opposition-half split, own/opposition KO retained |
| HT Snapshot PDF (5 pages, 1H events only) | `exportSnapshotPdf` | Dashboard; Our / Their Shot Profile; Restart Battle 1H; Turnover & Territory |
| FT Snapshot PDF (8 pages) | `exportSnapshotPdf` | Dashboard; shot profiles; Restart Battle 1H and 2H; Turnover & Territory 1H and 2H; Shot & Scoring Efficiency |
| Full Review PDF (27 + player pages; 29–30 pages here) | `exportReviewPdf` | Part 1 Match Facts (summary, scoring breakdown, swing timeline, segments, player breakdown/contributions, shot maps, efficiency, zones, 1H/2H overview). Part 2 Possession Facts (opposition facts, restart, turnover, free analysis). Part 3 Origin/Chain (origins, player chain involvement, opposition origin, intelligence summary, markers, chain intelligence, restart/turnover chains, momentum) |
| Player reports | Full Review Player Breakdown / Player Contributions / Player Chain Involvement | Per-player Score, Shots, Wides, T/O W/L, Kickout W/L, Frees W/C, Actions. Contributions capped at top 12 |

Every PDF page is a rasterised JPEG (`canvas.toDataURL` → `jsPDF.addImage`). **The PDFs have no text layer.** The audit reads page text by recording the app's own `fillText` calls at rasterisation time, and the page images by rendering the real PDF files with poppler.

## 4. Relationships: events → possessions → origins

- **Score partition (direct):** placed (Free / Penalty / Mark / 45 tag) → From general play (any other source tag) → Unattributed (no source). `buildDirectScoringBreakdown` (Part 1).
- **Score ledger (cross-engine):** placed → restart-origin / turnover-origin (nearer origin wins) → from play → unattributed. Every score lands in exactly one row. `buildScoreLedger`.
- **Chain engine** (`chain-engine.ts`):
  - Kickout dataset: next score by the winner ≤ 90 s, stopping at the next kickout.
  - Turnover dataset: next "relevant" event with **teamSide = acting side** ≤ 60 s.
  - Rule matches (`chain-rules.ts`) anchor on `KICKOUT_WON` / `TURNOVER_WON` kinds only.
- **Possession-outcome engine** (`possession-outcomes-engine.ts`): kickout / turnover / free origins, 90 / 60 / 45 s windows. A kickout or free resets. `SHOT` is non-terminal. Used by Quick Review.
- **Overlap by design:** restart-origin and turnover-origin both count scores that were later scored from a placed ball ("Origin possessions include later frees…" footnote). The direct partition and the ledger are mutually exclusive.

## 5. Hurling / camogie

| Item | Status |
|---|---|
| Restart family label "Puckout", owner toggle "OUR P/O / THEIR P/O" | Implemented |
| 2PT family | Hidden in capture |
| 45 tile → **65** (stored tag `65`) | Implemented in capture |
| Sin Bin tile | Hidden for hurling/camogie |
| Restart metric labels in the report layer (`restartMetricLabel`) | Sport-aware |
| Snapshot dashboard, Quick Review overview, Counts Sheet, parts of the Full Review | Still say Kickout(s) — F-07 |
| Full Review shot-detail "45" row and efficiency "45" source row | Not renamed to 65 |
| 2-POINT PROFILE block | Still rendered |
| Counts Sheet "Sin Bins" row | Still shown |
| `65` tag recognised as a placed-ball source (`eventSource`, `eventSource.ts`) | **Not recognised** — F-02 |
| Scoring values (goal 3, point 1) | Correct for hurling |

## 6. Statistics not supported (documented limitations, not defects)

- Opposition frees won are not captured directly; they are inferred from our Free Conceded.
- Opposition turnovers are not captured separately; they are inferred from our Turnover Lost.
- Shot **source** for Short / Block/Save / Post outcomes.
- 45/65 or Sideline **conceded** on your own restart: only "who won it" is captured. Outcome of the 45/65 restart itself, other than via a Point/Wide tagged 45/65.
- Kicked-dead kickouts (Event Stats has no tile; the PDF "Kicked Dead" / "Dead Ball Won" rows are always 0).
- Possession counts, passes, carries, time in possession.
- Sin-bin player-count windows: status shown in the picker only, never in reports.
- Substitution history in reports. Subs are captured as squad state only.
- Changing an event's team, source tag or restart owner after capture. Edit changes type and player only; Delete removes the event.
- Match-time stoppage. The clock runs continuously; there is no added-time marker.
