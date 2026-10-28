# P0 — Immediate persistence repair: verification

- **Branch:** `claude/event-stats-p0-persistence`, built on main `a8fe232`.
- **Evidence:** `persistence/` (`probe-p0.mjs`, `latency.mjs`, `results/p0-*.json`, `results/latency-p0.json`) and `results/p0/` (ledger comparison).
- **Baseline:** "main" columns are main `a8fe232`, run with the same script and the same fake clock at the same moments.

## 1. Root cause

`ProTaggerLiveScreen.tsx` saved committed data only through a **1200 ms trailing debounce**. Every change restarted the timer. This covered:
- events;
- Undo;
- HT, start of second half and FT;
- live Review edits;
- substitutions.

Its only last-moment flush was `beforeunload`, which mobile browsers do not reliably fire. The clock was written only as a side effect of some other change.

## 2. Code changes (4 files, no storage-format change)

| File | Change |
|---|---|
| `src/pro-tagger/pro-tagger-live-persistence.ts` (new) | Pure helpers:<br>• `createLivePersister`: writes each snapshot immediately; skips a snapshot identical to the last *successful* write; retries after a failure.<br>• `shouldPersistLiveState`: unchanged rule; a not-started match with no events is not stored.<br>• `registerBackgroundFlush`: `visibilitychange` → hidden and `pagehide`, with cleanup.<br>• `eventSaveStatusFromResult`. |
| `src/pro-tagger/ProTaggerLiveScreen.tsx` | • The debounced autosave effect becomes an immediate write on every committed change: events, `matchState`, `half`, both squads, manual pause/resume.<br>• The writer reads refs, so the effect, background flush and `beforeunload` flush always store the same latest state, including the clock.<br>• A background-flush effect is added; listeners are registered once and removed on unmount.<br>• `beforeunload` is kept for desktop and routed through the same writer.<br>• The pitch confirmation shows "✓ Event saved" only after the event's write succeeds. If the write fails it shows the existing "Save failed — storage unavailable." While the write is pending it shows nothing; that state lasts milliseconds. |
| `src/pro-tagger/pro-tagger-live-persistence.test.ts` (new) | 9 unit tests |
| `src/pro-tagger/ProTaggerLiveScreen.persistence.test.tsx` (new) | 8 tests that render the real screen (jsdom, fake timers): taps, then storage is read with no timer advanced. **All 8 fail on main's screen code.** |

The following are unchanged:
- record format, storage keys and the upsert;
- manual Save / Save & Finish;
- saved-match Review (it already saved immediately);
- capture flow and taps;
- the 750 ms confirmation timing;
- the clock and the resume rules.

## 3. Event-loss reproduction (real UI, Chromium, kill = renderer crash)

| # | Case | Main `a8fe232` | P0 |
|---|---|---|---|
| 1 | Kill 0 ms after an event | "✓ Event saved" shown, **event lost** | event stored |
| 2 | Kill 250 / 500 / 750 / 1000 ms after an event | **lost** at each | stored at each |
| 3 | 5 rapid events, 0.8 s apart, then kill | **5 of 6 lost** | 6 of 6 stored, no duplicate ids |
| 3b | 5 rapid events, 1.0 s apart, then kill | **1 of 6 lost** | 6 of 6 stored |
| 4 | Kill straight after Undo | **2 stored** (Undo lost) | 1 stored |
| 5 | Kill straight after HT (pressed at 02:33) | FIRST_HALF, clock 0:31; reopens "MATCH REOPENED 00:31" | **HALF_TIME, clock 2:33; reopens on HALF TIME** |
| 6 | Kill straight after FT (pressed at 03:02) | SECOND_HALF, clock 1:01; reopens mid-half | **FULL_TIME, clock 3:03; listed as finished** |
| 7 | Event at 08:03, background, kill | **1 of 2 stored**, clock 1:01; reopens at 01:01 | 2 of 2, clock 8:03; reopens at 08:03 |
| 7b | No events for 7 min, background at 08:03, kill | clock 1:01, reopens 01:01 | clock 8:03, reopens 08:03 |
| 8 | Pause at 01:32, wait 2 min, background, kill | clock 1:31; reopens "MATCH REOPENED 01:31" | clock 1:32; reopens "MATCH REOPENED 01:32", still paused |
| 9 | Storage write fails | pitch shows **"✓ Event saved"** although nothing was stored | pitch shows "Save failed — storage unavailable.", and the strip warning persists. After recovery the next event shows "✓ Event saved" and all 3 events are stored. |
| 10 | Reload and resume, then a new event | 5 events, 1 match, no duplicates | 5 events, 1 match, no duplicates, `eventCount` consistent, same scoreline |

## 4. Save latency (real screen, 306-event matches)

| CPU | Matches stored | Writes per event | Write (median / max) | Tap → "✓ Event saved" (median / max) | Longest task |
|---|---|---|---|---|---|
| 1× | 0 | 1 | 0.3 / 0.3 ms | 18 / 35 ms | — |
| 1× | 10 | 1 | 22 / 26 ms | 43 / 53 ms | — |
| 1× | 19 | 1 | 39 / 62 ms | 59 / 89 ms | 73 ms |
| 4× (≈ mid-range phone) | 0 | 1 | 1.9 / 2.2 ms | 106 / 133 ms | 53 ms |
| 4× | 10 | 1 | 123 / 125 ms | 286 / 291 ms | 172 ms |
| 4× | 19 | 1 | 243 / 255 ms | 429 / 487 ms | 295 ms |

The write is the same work main already did for every event, only 1.2 s earlier. Each write re-serialises the whole store, so cost grows with the number of saved matches.

The write runs after the confirmation dot is painted and inside the 750 ms confirmation, while the tile grid is hidden. So it does not delay the next tap. On main, the same block landed 1.2 s later, typically while the coach was tapping the next tile.

**Risk:** with ~19 large saved matches on a slow phone, "✓ Event saved" appears up to ~0.5 s after the tap and the main thread is busy for ~0.3 s.
- If real-device testing shows this is noticeable, the remedy is the separately approved per-match storage layout (P3).
- Storage protection (Phase 6) also lets coaches keep fewer matches without anything being deleted silently.

## 5. Automated tests and regression

- **Full suite:** 3029 / 3029 tests pass across 222 files (main: 3012; +17). tsc reports the same 14 pre-existing error files as main. `vite build` passes.
- **636-event regression through the real UI**, scored against the unchanged authoritative ledgers:

  | Match | PASS / FAIL / MISSING | Changed checks vs main |
  |---|---|---|
  | A | 583 / 9 / 0 | **0** |
  | B | 977 / 12 / 0 | **0** |
  | C | 556 / 28 / 0 | **0** |

  - Legacy import: 28 / 28. Cross-page: 27 / 27.
  - Console: only the pre-existing service-worker MIME warning.
- **Saved data:** compared with main's run at the HT, FT, before-Review and final states. Every event field matches: kind, team, restart owner, tags, half/period/segment, clock, x/y and player. Every scoreline is identical.
  - The only differences are per-run random squad ids, which are consistently renamed.
  - The intended improvement also shows: HT and FT snapshots now carry HALF_TIME / FULL_TIME and the clock at the moment of the press.
  - So there is no duplication, and no change to scores, player attribution, kickout ownership or Intelligence. The three-tap workflow is unchanged.
- **Historical matches:** they are never rewritten. A reopened match is written back in the same format, as before.

## 6. Remaining limitations

1. **Kill windows still open:**
   - A kill in the few milliseconds between the tap and the write, or during the write itself, can still lose that one event. This cannot be prevented from the page.
   - A crash while the app is in the foreground stores the clock as of the last committed change. Events are still safe.
2. **An uncompleted event is not saved.** A tile tapped but its pitch tap not completed before backgrounding is not saved, by design.
3. **Storage risks remain until Phase 6:**
   - silent eviction at 20 matches;
   - an unreadable store being overwritten;
   - the capacity limit of about 17 full matches.
4. **Other open items:**
   - Multiple tabs on the same match are not coordinated (unchanged).
   - Real-device test still needed: Android Chrome and iOS Safari, swiping away within 1 s, screen lock, HT then app switch.
