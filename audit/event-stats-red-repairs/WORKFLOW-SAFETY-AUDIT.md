# Event Stats — Workflow Safety Audit (read-only)

- **Current main:** `a8fe232` (after PRs #374, #376 and #378).
- **Baseline:** `4752acf`, the main commit immediately before #374.
- **Scope:** no production code, schema, capture control or saved match was changed for this audit.

## How it was checked

1. **Code diff, baseline → main, for every capture-side file.**
   - #376 and #378 touched only `src/stats/**`.
   - #377 touched only Tactical Slate.
   - #374 touched four capture-side files, and each change is read-only:

     | File | Change |
     |---|---|
     | `ProTaggerLiveScreen.tsx` | Quick Review pages are now built from `toEventStatsReportEvents(loggedEvents)`, a report-time view. |
     | `ProTaggerReviewScreen.tsx` | The share pack is built from that same view. |
     | `pro-tagger-review-adapter.ts` | PDF inputs use that view; the new function lives here. |
     | `pro-tagger-score.ts` | Type widening only. |

   - Capture taps, the adapter (`pro-tagger-adapter.ts`), families, the owner toggle, the player picker, the clock, autosave and save are **byte-identical to the baseline**.
2. **Write paths.** Every write goes through `saveProTaggerMatchFull`:

   | Write | What it stores |
   |---|---|
   | autosave | raw `loggedRef.current` |
   | manual save | raw `loggedRef.current` |
   | Save & Finish | raw `loggedRef.current` |
   | saved-match Review Edit | raw `match.events` |

   None of them receives `toEventStatsReportEvents` or `normalizeEventsForReporting` output. Report-layer views never reach storage.
3. **Real-UI behaviour.** The same 636-tap fixtures were driven through the real app in Chromium on the baseline code (original audit run) and on code identical to current main (`runs-r1b`, commit `38e0e25`, which has the same tree as `a8fe232`).
   - The runs cover:
     - football and hurling;
     - manual pause and resume (×3);
     - Undo (×5);
     - reload and resume (×3, including at the start of the second half);
     - HT and FT;
     - Review Edit (×4) and Review Delete (×2).
   - The stored events were compared field by field.
4. **Tests.** The capture-side suites on main (`src/pro-tagger`, `src/core`) pass 541 of 541 across 40 files. None of these test files changed since the baseline.

### Saved-output comparison (baseline code vs current main)

| Match | Events stored | Fields compared | Differences |
|---|---|---|---|
| A (football) | 152 / 152 | `kind`, `type`, `teamSide`, `team`, `restartOwner`, `tags`, `half`, `period`, `segment`, `matchClockSeconds`, `timestamp`, `nx`, `ny`, `playerName`, `playerNumber` | **0** |
| B (football, pauses, undo, reloads, Review Edit) | 306 / 306 | same | **0** |
| C (hurling) | 176 / 176 | same | **0** |

- `playerId` and `squadId` differ only because each run creates fresh random squad ids. The mapping between the two runs is consistent one-to-one.
- HT state, FT state, the restore context and the saved scoreline are identical.

## Verdicts

| # | Workflow | Verdict | Changed by #374 / #376 / #378? | Saved data affected? |
|---|---|---|---|---|
| 1 | Three-tap capture | **GREEN** | No | No |
| 2 | Kickout / puckout ownership | **GREEN** | No | No |
| 3 | Turnovers won / lost | **GREEN** | No (report tag names only) | No |
| 4 | Player attribution | **GREEN** | No | No |
| 5 | Scores, wides, two-pointers | **GREEN** | No | No |
| 6 | Frees and placed balls | **GREEN** | No (report: the "65" tag counts as a placed-ball source) | No |
| 7 | 45/65 and sideline | **GREEN** | No (report: awards now counted in the 45/65 row) | No |
| 8 | Discipline | **AMBER** (pre-existing rule question) | No | No |
| 9 | HT, FT and resume | **AMBER** (pre-existing mobile save gap; real-device test needed) | No | No |
| 10 | Review Edit and saved-match integrity | **AMBER** (pre-existing F-08) | No | No |

### 1. Three-tap capture — GREEN

**Current implementation:**
1. A tile on the FOR row or the opposition row goes to `handleTileTap` and sets `pending`.
2. The player picker goes to `handlePlayerSelect`. "No player / Unknown" is always available.
3. The pitch tap goes to `handlePitchTap`, then `adaptProTaggerAction`, and the event is appended.

Supporting behaviour:
- Tagging is blocked before the start, at HT and FT, and after a reload until the coach taps Resume.
- The pitch becomes non-interactive during the 750 ms "✓ Event saved" confirmation, so a double tap cannot save twice.
- The wrong-way warning (tap again to override) applies to Goal, Point, 2PT, Shot and Wide.
- Cancel discards the pending event.
- Undo removes the last event, and only from the idle state.

**Evidence:** all 634 kept taps stored with the expected kind, side, tag and player; 0 mismatches.

### 2. Kickout / puckout ownership — GREEN (matches the confirmed specification)

**Current implementation:**
- `ProTaggerFamilyGrid` holds the owner toggle in component state, defaulting to `FOR` (OUR K/O, or OUR P/O in hurling).
- At the tile tap, the toggled owner is captured into `pending.restartOwner`. It is written to the event when the pitch tap completes the event.
- The grid only renders in the idle phase. It unmounts during player pick and pitch tap, so it remounts with **OUR K/O selected after every completed event**.
- It also resets after Cancel, at HT and FT, and after a reload.
- How the event is stored:
  - **WON** when the tapped row matches the owner.
  - **CONCEDED** otherwise; `teamSide` is then the owner.

**Evidence:**
- 176 of 176 restarts stored the correct `restartOwner`, kind and `teamSide`.
- After every one of the 84 THEIR-owned restarts, the toggle showed OUR K/O or OUR P/O again. This holds on both the baseline code and main.

**F-09 is therefore not a defect.** The implementation matches the confirmed specification exactly. Approved decision 2 ("persist the coach's last kickout-owner selection") contradicts that specification and should be treated as superseded.

### 3. Turnovers — GREEN

- Both rows open **our** player picker. The row decides Won or Lost.
- The FOR row is stored as `TURNOVER_WON`. The opposition row is stored as `TURNOVER_LOST` with `teamSide` "FOR".
- The stored tile tags (TACKLE, INTERCEPTION, HP ERROR, KP ERROR, OVERCARRIED) are unchanged.
- #374 only maps these tags to report names at read time; the stored tags are untouched.

### 4. Player attribution — GREEN

- The picker shows the tapped row's squad, except Turnover, which always shows ours.
- The picker writes `playerId`, `playerName`, `playerNumber` and the squad id actually shown (`squadId`).
- Sent-off players, and players with an active sin bin, are flagged in the picker.
- Report attribution uses the roster first (`influence.ts`). For example, our player who wins their kickout (stored `KICKOUT_CONCEDED`, `teamSide` OPP) is still credited to our team.
- Evidence: 634 of 634 stored player numbers match the taps.

### 5. Scores, wides, two-pointers — GREEN

- The tile tag records the source: Play, Free, Penalty, Mark, 45/65.
- 2PT "45" is stored as `FORTY_FIVE_TWO_POINT`.
- 2PT is hidden in hurling and camogie.
- Shot outcomes are Short, Block/Save and Post.

### 6. Frees and placed balls — GREEN

- The Free family records Won and Conceded, always `teamSide` FOR.
- Placed scores are recorded through the Goal, Point, Wide or 2PT source tiles.
- #374 changed reporting only: the hurling "65" tag now counts as a placed-ball source.

### 7. 45/65 and sideline — GREEN

- The owner is implicit from the tapped row, so these always store `*_WON` with `teamSide` = the winner, and no toggle is shown.
- #378 now counts these awards in the report's 45/65 row. That is a read-time change.

### 8. Discipline — AMBER (pre-existing, not a regression)

- Capture: Yellow, Sin Bin and Red, with the player's status derived from the event history.
  - A sin bin clears after 10 minutes within the same half.
  - It stays flagged across the half-time boundary by design.
- **Open rule question:** `getDisciplineOptions` offers Sin Bin only for football and ladies football. Hurling and camogie get Yellow and Red only.
  - Hurling has had a sin bin since 2021 (approved decision 7: verify before changing).
  - Unchanged since the baseline.

### 9. HT, FT and resume — AMBER (pre-existing; needs a device test)

- HT and FT freeze the clock and clear any pending event.
- The second half restarts the clock at 0, with `period` 2H.
- A manual pause keeps tagging enabled and stamps events with the frozen clock (intentional).
- After a reload or reopen, the screen shows MATCH REOPENED with the clock paused at the saved time. Tagging is blocked until the coach taps Resume, which continues from the saved time.
- Evidence: 3 reloads and resumes kept the clock and all events (591 → 591, 1 → 1, 418 → 418). Pause and resume showed at most a 1-second display difference.
- **Pre-existing gap:**
  - Autosave runs 1.2 s after each change. The final flush listens only for `beforeunload`.
  - There is no `pagehide` or `visibilitychange` flush, and mobile browsers (iOS especially) often don't fire `beforeunload` when an app is swiped away or killed.
  - So the last ~1 s of taps, or a just-pressed HT/FT, could be missing after a kill. Needs a real-device test.

### 10. Review Edit and saved-match integrity — AMBER (pre-existing F-08)

**Integrity is sound:**
- Saves are upserts by match id, so there are no duplicates.
- Edits and deletes persist for both the live overlay and Saved Matches, and survive reopening.
- Player corrections resolve against the event's own squad.
- Raw events are always what gets stored.

**F-08 (unchanged since the baseline), confirmed in the run:**
- The Type list offers all 23 event kinds in every sport. That includes kinds Event Stats never captures (FREE_SCORED, FREE_MISSED, POSSESSION_WON/LOST) and TWO_POINTER in hurling.
- Changing the type keeps the old tags and `restartOwner`. In the run, a SHOT edited to POINT kept `BLOCK/SAVE`, so that score's source reads "unknown".
- The team cannot be edited. A cross-family edit therefore keeps the stored `teamSide`, which for some families is the owner or conceding side. For example, a `TURNOVER_LOST` (`teamSide` FOR) edited into a POINT credits us.

## Findings

### A. Confirmed regressions introduced by #374, #376 or #378

**None.** Capture, ownership, player selection, the clock, autosave, save and edit are byte-identical to the baseline. Stored output for the 636-tap fixtures is identical field by field.

### B. Existing defects unrelated to the repairs

| # | Workflow | Item | Evidence |
|---|---|---|---|
| B1 | Review Edit | F-08: unrestricted Type list (all 23 kinds, sport-invalid kinds allowed), stale tags and `restartOwner` kept, team not editable | Code; `runs-r1b` B edits |
| B2 | Resume | No `pagehide` / `visibilitychange` save flush. The last ~1.2 s of changes depend on `beforeunload`, which is unreliable on mobile. | Code (`ProTaggerLiveScreen` autosave effects) |
| B3 | Discipline | Hurling and camogie Sin Bin is not offered, pending rule confirmation (decision 7) | Code (`getDisciplineOptions`) |

### C. Intentional behaviours that must be preserved

1. OUR K/O (OUR P/O) is the default. THEIR K/O is selectable. The selection is saved with the event and the toggle returns to OUR K/O after each completed event, and also after Cancel, HT and FT, and reload.
2. 45/65 and Sideline have no toggle; the tapped row is the winner.
3. Both Turnover rows tag **our** player. The opposition row is stored as `TURNOVER_LOST` with `teamSide` FOR.
4. A conceded restart is stored with `teamSide` = owner. Reports credit players by roster.
5. Free Won and Conceded are recorded from our side.
6. Tagging is blocked until Resume after a reload. A manual pause keeps tagging enabled with a frozen clock. The second half starts at 0:00.
7. The wrong-way warning with tap-again override applies to scoring families only.
8. Undo removes the last event.
9. "No player / Unknown" is always available.
10. Stored events are never rewritten by reports. Historical restarts with no owner are treated as "unknown owner" at read time only.

### D. Unverified behaviours requiring a real-device test

1. Mobile background and kill: whether the last taps, HT and FT survive when the app is swiped away immediately (B2).
2. Lock screen mid-half: whether the clock keeps real time while the screen is locked. It is computed from wall-clock time, so it should.
3. Resume after the OS has killed the tab: the clock continues from the saved time, not real elapsed time (by design). Confirm coaches understand this.
4. Events logged during a manual pause share one timestamp. Insertion order is preserved (stable sort). In theory, a turnover and a kickout logged in the same second resolve origin to the turnover.
5. Touch targets and timing of the 750 ms confirmation and the 3 s wrong-way window on a real phone.

## Phone test plan (~20 events, football; hurling variations at the end)

Setup: create a match with both squads; attack direction RIGHT.

| # | Action | Check |
|---|---|---|
| 1 | ▶ Start | Clock runs |
| 2 | Kickout, OUR K/O (default), FOR row "Clean", our #2, tap pitch | Saved; toggle shows OUR K/O |
| 3 | Switch to THEIR K/O, opposition row "Break", their #8, tap | Saved; **toggle back on OUR K/O** |
| 4 | THEIR K/O, FOR row "Clean" (we win their kickout), our #9, tap | Saved; toggle back on OUR K/O |
| 5 | Point "Play", our #11, tap the wrong half once, then again | Wrong-way warning, then saved on the second tap; score updates |
| 6 | Turnover FOR row "Tackle", our #6 | Saved as our turnover won |
| 7 | Turnover opposition row "Dispossessed", our #10 | Picker shows **our** squad |
| 8 | Free "Won", No player | Saved |
| 9 | Point "Free", our #14 | Score updates |
| 10 | 2PT "Play", their #13 | Opposition +2 |
| 11 | Wide "45", our #15 | Saved |
| 12 | 45 "Won" (FOR row), no toggle visible | Saved |
| 13 | Sideline "Won" (opposition row) | Saved |
| 14 | Discipline Yellow on their #4, then Sin Bin on our #3 | Our #3 flagged in the next picker |
| 15 | Kickout THEIR K/O, then **Cancel** | Nothing saved; toggle on OUR K/O |
| 16 | ⏸ Pause, log Shot "Block/Save", ▶ Resume | Clock frozen while paused; event saved |
| 17 | Log a Goal, then ↩ Undo | Goal removed; score reverts |
| 18 | Half Time → Quick Review → HT Snapshot PDF | Counts match taps 2–17 |
| 19 | Start 2nd half; log a Point; **within 1 s swipe the app away**; reopen → Resume | Is the Point present? Clock paused, then resumes |
| 20 | Full Time → Save & Finish → Saved Matches → Review → edit one event's player number, delete one event; close and reopen | Edits persist; FT PDF reflects them |

**Hurling run (10 events):**
- Puckout OUR and THEIR, with the toggle resetting.
- 65 "Won".
- Point "65".
- No 2PT family.
- Discipline shows Yellow and Red only (record what the referee rule should be).
- HT and FT.

---
Read-only audit. No production code, schemas, capture controls or saved matches were changed. R2 has not been started.
