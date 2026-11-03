# Saved-match protection: verification

- **Branch:** `claude/event-stats-storage-protection`, commit `9cd2cd9`, based on main `edb72de`.
- **Evidence:** `persistence/probe-sp.mjs`, `persistence/results/sp-*.json`, `persistence/results/latency-{main-edb,sp}.json`, `results/sp/`.

## Files changed

| File | Change |
|---|---|
| `src/pro-tagger/pro-tagger-storage.ts` | The core change; detailed below. |
| `src/pro-tagger/ProTaggerLiveScreen.tsx` | • The autosave warning names its cause (unreadable / full / unavailable), both on the strip and in the pitch footer.<br>• Save Match and Save & Finish save the Event Stats record first. A refused or failed save blocks with the cause and does not end the match.<br>• A missing Match Stats copy is reported: "Match saved. Match Stats copy not updated — …", and Save & Finish then ends the match 3 s later.<br>• Reset treats "nothing stored" as nothing to clean up. |
| `src/pro-tagger/ProTaggerReviewScreen.tsx` | An edit/delete is applied on screen only when the caller stored it (`onMatchUpdate` may return `false`). |
| `src/pro-tagger/ProTaggerPage.tsx` | Saved-match Review edits are stored with a result. On failure the coach gets an alert naming the cause, and the stored match is kept. |
| `src/pro-tagger/ProTaggerOptionsScreen.tsx` | Import reports a failed save instead of opening a match that was not stored. |
| `src/pro-tagger/pro-tagger-coordinate-repair.ts` | A repaired match that could not be stored is reported as `save-failed`. |
| `src/pro-tagger/ProTaggerSavedMatchesScreen.tsx` | • Delete reports a failure.<br>• Repair reports a failed save.<br>• A one-line notice appears when storage is unreadable ("Nothing has been overwritten — use Settings → Backup to export them.") or nearly full (≥ 80 % of 5 M characters). |
| Tests | New: `pro-tagger-storage.protection.test.ts` (17) and `ProTaggerLiveScreen.storageProtection.test.tsx` (5). The P0 failure test now expects the specific "storage full" wording. |

**Changes in `pro-tagger-storage.ts`:**
- The 20-match cap is removed.
- A stored value that is not a JSON array is "unreadable", never "empty". Saves and deletes refuse to write over it.
- The shared Match Stats archive gets the same rule.
- Records failing validation are written back untouched, in place. Readers still see only valid matches.
- Each write returns `{ ok, reason }`: `unreadable`, `full` (QuotaExceededError) or `unavailable`.
- `saveFailureText` (the warning wording) and `isStorageNearlyFull` are added.
- The boolean wrappers `saveProTaggerMatchFull`, `saveProTaggerMatch` and `deleteProTaggerMatch` are kept, so existing callers are unchanged.

**Unchanged:**
- storage keys, record format, ordering, and the upsert-by-id rule;
- the Match Stats archive copy (still written whenever it is readable);
- capture taps, the OUR K/O default;
- statistics, Intelligence, Quick Review, Snapshot, Tactical Slate and Notes.

**No migration:** existing records are read and written exactly as before.

## Data-loss scenarios prevented (real UI, Chromium; main `edb72de` vs branch)

| Scenario | Main | Branch |
|---|---|---|
| 20 saved matches, then a 21st is started | **"Saved Match 1" deleted silently**; 20 matches remain | all 21 kept, nothing deleted |
| Event Stats store unreadable, then an event is captured | "✓ Event saved"; **store replaced, older match gone** | "Save blocked — saved matches storage is corrupted." in the pitch footer and on the strip; stored value byte-identical |
| Match Stats archive unreadable, then Save Match | no message; **archive overwritten** | "Match saved. Match Stats copy not updated — its storage is corrupted."; archive byte-identical; Event Stats match stored |
| A stored record fails validation, then a new match is saved | **malformed record dropped** | malformed record kept, byte-identical; the valid older match is also kept |
| Storage genuinely full (filled until the browser refused writes), then an event | generic "Save failed — storage unavailable."; existing match unchanged | "Save failed — storage full. Back up and delete old matches."; existing match unchanged |

In both versions, once space is freed the warning clears and all 3 events are stored.

## Automated tests

- **Full suite:** 3051 / 3051 tests pass across 224 files (main: 3029; +22). The type check shows the same 14 pre-existing error files as main. `vite build` passes.
- **Storage tests** (17): cover all five risks above, plus 40 matches kept, in-place updates leaving other matches unchanged, delete "not-found", the wording, and the near-full threshold.
- **Screen tests** (5): unreadable store blocked and untouched; warning persists while failing and clears only when the Event Stats save succeeds; Save Match with an unreadable archive; Save & Finish blocked with an unreadable store (the match does not end); Save & Finish with an unreadable archive (saved, coach told, then the match ends).
- **Mutation check:** all 5 screen tests fail on main's code.

## Independent regression (636 events, unchanged authoritative ledgers)

| Match | PASS / FAIL / MISSING | Changed checks vs main |
|---|---|---|
| A | 583 / 9 / 0 | **0** |
| B | 977 / 12 / 0 | **0** |
| C | 556 / 28 / 0 | **0** |

- Legacy import: 28 / 28. Cross-page: 27 / 27.
- Saved event data, scores and resume state are identical to main's run at HT, FT and final, in all three matches.

## Capture latency (real screen, 306-event matches; one write per event in both)

| CPU | Saved matches | Main write / tap → saved (median) | Branch write / tap → saved (median) |
|---|---|---|---|
| 1× | 19 | 38 ms / 55 ms | 40 ms / 59 ms |
| 4× | 10 | 98 ms / 212 ms | 103 ms / 237 ms |
| 4× | 19 | 179 ms / 326 ms | 185 ms / 353 ms |

The differences are within run-to-run variation; the 1× / 10-match case was faster on the branch. The only added work is a validity check per stored record during an upsert.

## Remaining storage limitations

1. **Capacity is unchanged** at about 17 full matches, because each finished match is still stored twice (the archive copy is kept, as instructed).
   - With no 20-match cap, coaches with many small matches will reach the quota rather than an eviction.
   - At that point they get the "storage full" warning and the Saved Matches "nearly full" notice instead of silent loss.
   - Freeing space means deleting old matches, ideally after exporting them with Settings → Backup.
2. **"Nearly full" is an estimate.** It is measured against a typical 5 M-character quota; actual quotas vary by browser.
3. **No recovery control for unreadable storage.** The data is preserved and exportable (Settings → Backup), but resetting or repairing it needs a separately approved control.
4. **Coordinate-repair backups** (up to 40 full-match copies) still count towards the quota. That is unchanged and out of scope.
5. **Multiple tabs are not coordinated** (unchanged).

## Risk to existing users

**Data:** none. No migration, format change or key change; existing valid records are read and written exactly as before.

**Behaviour change:** saves that would previously have **silently deleted or overwritten** data are now **refused with a warning**. Specifically, a coach with:
- an unreadable store cannot save new Event Stats matches until the store is exported and repaired;
- a full store must delete or export matches.

Both situations previously caused silent data loss.

## Final verification before merge request (PR #380, head `9cd2cd9`, Android emulation: Pixel 7 profile)

| Check | Result |
|---|---|
| Save & Finish when the Match Stats copy fails | The red warning "Match saved. Match Stats copy not updated — its storage is corrupted." shows on MATCH COMPLETE for 3 s, then the screen returns home. The match is stored as FULL_TIME with 3 events and score 0-03 v 0-00. The archive is byte-identical. After a full reload, Saved Matches → Review opens it showing 3 events. Screenshot: `persistence/results/f1-save-finish-warning.png`. |
| Storage full, then Settings → Backup | **Create Backup succeeds while storage is full.** The downloaded file holds all 13 Event Stats matches, including the live one. The Saved Matches notice "Storage nearly full" is shown. |
| Storage full, then delete an old match | Deleting one old match frees space. The next live event shows "✓ Event saved", the warning clears, and all 4 live events are stored. The other 11 old matches are intact. |
| Warning vs success | Failure text is red (`rgb(248,81,73)`), has no tick, and starts "Save failed" or "Save blocked". It replaces the event count on the strip. Success is the green "✓ Event saved" (`rgb(46,160,67)`). |
| Head commit, tests, build, Vercel | Head is still `9cd2cd9`. Tests: 3051 / 3051. No new type errors. Build passes. Vercel: success. |

**Pre-existing risk found (not introduced by this PR; reproduced on the branch):** while saves are failing, leaving the live match through Options → **Home** has no confirmation, and the events not yet stored are lost.
- In the test, 2 of 3 events were lost.
- The safe recovery path is to back up and delete old matches **in a second browser tab**, then carry on in the live tab. That path was verified above.
