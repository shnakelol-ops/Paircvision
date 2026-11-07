# Event Stats — Persistence Reliability Investigation (read-only)

- **Code examined:** production main `a8fe232`.
- **What was done:** controlled tests drove the real Event Stats UI in Chromium against a local copy of main.
  - The browser clock was faked, so every delay is exact.
  - A "kill" is a renderer crash (CDP `Page.crash`): no `beforeunload`, `pagehide` or `visibilitychange` fires. That is what happens when Android discards or kills a backgrounded tab.
- No production code was changed.
- Scripts and raw results: `persistence/` (`probe.mjs`, `quota*.mjs`, `savecost.mjs`, `results/*.json`).

## Verdict: RED

Event loss is proven and reproducible. A correctly recorded event that the screen reports as "✓ Event saved" is lost if the app dies within about 1.2 s. Two further mechanisms lose whole saved matches silently or block saving once storage fills. All of these behaviours predate PRs #374, #376 and #378.

## 1. How the app saves today

| Write | When | Code |
|---|---|---|
| Autosave | **1200 ms after the last change** to `loggedEvents`, `matchState`, `half` or squad state. Every change restarts the timer (trailing debounce). | `ProTaggerLiveScreen.tsx` autosave effect |
| `beforeunload` flush | Only when the browser fires `beforeunload` | `ProTaggerLiveScreen.tsx` |
| Manual "Save Match" / "Save & Finish" | Immediately | `handleSaveMatch` / `handleSaveAndEnd` |
| Saved-match Review Edit / Delete | Immediately | `ProTaggerPage.tsx` `onMatchUpdate` |
| Live-overlay Review Edit / Delete | Via autosave (1.2 s) | `onMatchUpdate → setLoggedEvents` |

Other properties of the save path:

- **There is no `visibilitychange`, `pagehide` or `freeze` handler for Event Stats.** The only `visibilitychange` listener in the app belongs to Match Stats' clock (`App.tsx`).
- **Every write rewrites the whole store.** `saveProTaggerMatchFull` reads and parses every saved match in `pitchflow_pro_tagger_matches_v1` (up to 20), replaces this one, and writes the lot back. That is about 35 ms on desktop with 20 large matches (76 ms worst case).
- **Storage is shared and nearly fills.** Event Stats saves into two keys on the same origin, within the browser's roughly 5 M-character localStorage quota:
  - `pitchflow_pro_tagger_matches_v1`: full record, capped at 20 matches.
  - `pitchflow_matches_v1`: shared archive on manual save or finish, **uncapped**.

## 2. Evidence

### 2.1 Kill after a completed event

The second event is completed at t = 0, then the app is killed.

| Kill at | Screen | Stored events | Event persisted? |
|---|---|---|---|
| 0 ms | "✓ Event saved" | 1 | **No** |
| 250 ms | "✓ Event saved" | 1 | **No** |
| 500 ms | "✓ Event saved" | 1 | **No** |
| 750 ms | "2 events logged" | 1 | **No** |
| 1000 ms | "2 events logged" | 1 | **No** |
| 1150 ms | "2 events logged" | 1 | **No** |
| ≥ 1200 ms | "2 events logged" | 2 | Yes |

**The delay applies to every event.** For the first ~1.2 s the screen states the event is saved when it is not.

### 2.2 Rapid consecutive events

There are 5 events after one stored event, then a kill. The debounce restarts on each event.

| Time between completed events | Stored before the kill | Lost |
|---|---|---|
| 0.8 s | 1 of 6 | **5** |
| 1.0 s | 1 of 6 | **5** |
| 1.5 s | 6 of 6 | 0 |
| 2.5 s | 6 of 6 | 0 |

Events never overwrite one another, because each write contains the full list. However, quick consecutive events keep postponing the write, so a burst can be lost as a whole. A three-tap event with "No player" can be completed in under 1.2 s after the 750 ms confirmation.

### 2.3 HT / FT transitions: no extra protection

| Transition | Kill at | Stored state | Stored clock | Screen before kill |
|---|---|---|---|---|
| HT | 0 / 600 ms | **FIRST_HALF** | **0:31** (real 2:33) | HALF TIME |
| HT | 1300 ms | HALF_TIME | 2:33 | HALF TIME |
| FT | 0 / 600 ms | **SECOND_HALF** | **1:01** (real 3:02) | MATCH COMPLETE |
| FT | 1300 ms | FULL_TIME | 3:02 | MATCH COMPLETE |

No events were lost here. But the match reopens mid-half with the clock paused at the last event's time, and the coach must resume and press HT or FT again. "Save & Finish" saves immediately; the FT button alone does not.

### 2.4 Backgrounding

The test fired `visibilitychange`→hidden, `pagehide` and `freeze`, then killed the app 200 ms after an event. **Stored 1 of 2.** No handler reacts to these events.

Android Chrome fires `visibilitychange` (hidden) when the coach switches app, locks the screen or opens the task switcher. After that, the tab can be frozen or discarded with **no further events**, and `beforeunload`, `unload` and `pagehide` are unreliable on mobile. See Chrome's Page Lifecycle API documentation and MDN on `pagehide` and `visibilitychange`, listed under Sources.

**The `beforeunload` path works:** when it fires (desktop tab close), it stored 2 of 2. That is why desktop testing never showed the gap.

### 2.5 Stale clock on reopen

An event was logged at 1:00, then 7 minutes passed with no events, then a kill.
- Clock at the kill: **08:02**. Stored clock: **61 s**. The reopened match is paused at **01:01**.
- No events are lost. But every later event is timestamped about 7 minutes early, which also shifts segments, unless the coach notices.
- Root cause: the clock is only written when some other state changes.

### 2.6 Storage failure (quota) is surfaced

With `setItem` made to throw `QuotaExceededError`:
- The capture strip shows **"Save failed — storage unavailable."**
- The warning stays while failures continue and clears once a save succeeds.
- The next successful save stores all 4 in-app events.
- Failed writes never damage the stored copy, because `setItem` is atomic and the old value survives.

### 2.7 Storage capacity

The test used realistic 306-event matches, each about 155 k characters, saved the way "Save & Finish" saves them (full record plus shared archive):

| Finished matches already stored | Characters | New match autosaves? |
|---|---|---|
| 8 | 2.42 M | yes |
| 12 | 3.63 M | yes |
| 14 | 4.23 M | yes |
| 16 | 4.84 M | yes |
| 18 | quota exceeded while storing | — |

**Live test:** with 16 finished matches stored, a new match logged through the UI up to **340 events** autosaved in full, with no warning.

Capacity is therefore about **17 full-length matches**:
- Each finished match is stored twice.
- The 20-match cap does not help, because the shared archive key is uncapped and keeps every match.

What happens beyond capacity:
- The next live match's autosave starts failing partway through. The coach sees "Save failed — storage unavailable." (§2.6), and later events exist only in memory until space is freed.
- "Save & Finish" ignores a failed write to the shared archive.

This is not proven loss today, but a regular coach is likely to reach it within a season of full matches.

### 2.8 The 20-match cap silently deletes the oldest match

- With 20 saved matches, starting a 21st match and logging one event **deleted "Saved Match 1"** at the first autosave.
- No warning or confirmation was shown, and no export was offered.
- The deleted match may be unfinished. The cap is applied by array position (creation order), not by match state.

### 2.9 Unparseable store is overwritten

- Test: the store key held an unreadable JSON value (a truncated array).
- The first autosave of a new match replaced it with `[new match]`, and the older record was gone.
- An interrupted `localStorage` write cannot produce this, because `setItem` is atomic. It needs an external cause, such as a storage fault, a foreign or older app version, or a manual edit.
- So this is theoretical in likelihood, but total in impact: every saved match is lost with no warning.

### 2.10 Reopen consistency

A kill was followed by Resume and one more event:
- `events` = `eventCount` = 4, then 5.
- The scoreline was recomputed correctly, and event ids were unique.
- One match record was kept, because the save is an upsert by `session.id`.

The saved matches are consistent after reopening.

## 3. Answers to the ten questions

1. **When completed events reach storage:**
   - via autosave, 1200 ms after the last state change;
   - immediately only through manual Save, Save & Finish, saved-match Review Edit, or a `beforeunload` flush.
2. **Whether the 1.2 s delay applies to every event:** yes, to every event. Each new change restarts it, so bursts are delayed further (§2.1, §2.2).
3. **HT/FT protection:** none beyond the same debounce (§2.3).
4. **When Android suspends or closes the browser:** nothing is written. Unsaved changes from the last ~1.2 s are lost, and the stored clock can be minutes stale (§2.4, §2.5).
5. **Lifecycle handlers:** `pagehide` and `visibilitychange` are not handled by Event Stats at all. `beforeunload` only helps on desktop.
6. **Rapid consecutive events:** they cannot overwrite each other, but a burst whose events are less than 1.2 s apart is saved as a block, after the last one. A kill mid-burst loses the whole burst (§2.2).
7. **Interrupted save:** it cannot corrupt the match, because writes are atomic. However, an unreadable store is silently replaced (§2.9), and the 20-match cap silently evicts the oldest match (§2.8).
8. **Storage failures:** yes, they are surfaced with a persistent warning on the capture strip and break screens (§2.6).
   - The warning is not shown during player pick or pitch tap.
   - "✓ Event saved" is shown regardless of whether the event has actually been stored.
9. **Consistency after reopen:** consistent (§2.10). The exceptions are the stale clock (§2.5) and a lost HT/FT state (§2.3).
10. **Smallest safe improvement:** see §5.

## 4. Root cause

1. **Debounced-only persistence of committed data.** `ProTaggerLiveScreen` persists committed events and match-state transitions only through a 1.2 s trailing debounce. Nothing writes at the moment an event, Undo, HT, second-half start or FT is committed.
2. **No hidden-page flush.** The only flush is `beforeunload`, which mobile browsers do not fire when an app is backgrounded, discarded or killed. `visibilitychange`/`pagehide` are not handled, so the clock is also never refreshed in storage while idle.
3. **Storage housekeeping deletes data silently:**
   - `MAX_PRO_TAGGER_MATCHES = 20`, applied with `.slice(0, 20)`, with no warning;
   - an unparseable store is treated as empty and overwritten;
   - the shared archive key is uncapped and duplicates every finished match within one ~5 M-character origin quota.

## 5. Minimal proposed repair (no change to the capture experience)

### Phase P1: stop event loss

This touches only `ProTaggerLiveScreen.tsx`'s save effects; no UI change.

1. **Save immediately on every committed change.** When `loggedEvents`, `matchState` or `half` changes, write synchronously in the effect instead of after 1200 ms. This covers:
   - an event appended;
   - Undo;
   - HT, second-half start and FT;
   - a live Review edit or delete.

   This is the same write the app already performs for every event; only its timing changes. Keep the debounce only for squad (substitution) changes, or make those immediate too.
2. **Flush on `visibilitychange` → hidden and on `pagehide`,** with the current clock, beside the existing `beforeunload` flush. The handler is a synchronous `saveProTaggerMatchFull`, as `beforeunload` already does, and it reads `loggedRef`/`matchStateRef`/`clockSecondsRef`. This captures the live clock whenever the coach leaves the app.
3. **Keep** the "Save failed" warning logic as it is. Reuse `deriveAutosaveWarningState`.

**Cost:** one full-store write per event. That is about 35 ms on desktop with 20 large matches (likely 100–200 ms on a mid-range phone), and the app already does it today. The write happens during the 750 ms confirmation, so it should not be felt; this needs a phone check. If phones show jank, the follow-up is P3.

### Phase P2: stop silent match deletion

`pro-tagger-storage.ts` only.

1. **Never delete a saved match automatically.** Remove the `.slice(0, 20)` eviction. If a cap is needed, make it a warning in Saved Matches rather than deletion. When storage really fills, the existing "Save failed" warning appears instead of silent loss.
2. **Never overwrite an unreadable store.** If the key holds a value that does not parse, keep it: copy it once to a `…_unreadable_<timestamp>` key and refuse the write with `return false`. That surfaces the existing warning instead of replacing every match.
3. **Do not change formats,** and do not touch the shared archive key, in this phase. Its uncapped growth is a separate decision for the owner (§7). With P2.1, a full store produces a visible warning rather than silent loss.

### Phase P3 (only if needed after a phone test)

Store each match under its own key, so a write touches one match rather than all 20. This changes the storage layout and needs a migration, so it is not minimal and needs separate approval.

## 6. Regression test requirements

**Unit and component tests** (vitest, fake timers):

| ID | Test |
|---|---|
| R-P1 | Completing an event writes it to storage **without advancing timers**: storage contains it at t = 0. |
| R-P2 | Undo, HT, second-half start and FT each update storage at t = 0, with the correct `restoreContext.matchState` and `matchTimeSeconds`. |
| R-P3 | Five events completed with 0 ms between them leave all five in storage. |
| R-P4 | `visibilitychange` (hidden) and `pagehide` each write the current events **and the current clock**. Example: clock at 08:02 is stored as 482 s. |
| R-P5 | Storage that throws on write shows "Save failed — storage unavailable." The next successful write clears it. In-memory events are never dropped. |
| R-P6 | Saving a 21st match never removes an existing match. |
| R-P7 | An unparseable store value is preserved: a backup key is created, the write is refused and reported, and the original value is unchanged. |
| R-P8 | Existing tests stay green. In particular, `halfTimePersistence`, `resetPersistence`, `clockLifecycle`, storage tests and the 541 capture tests. |

**Browser tests:** add the `persistence/probe.mjs` scenarios to the e2e pack:
- kill at 0 ms after an event, HT, FT and a burst: expect 0 events lost and the correct state;
- background then kill: expect 0 lost and the current clock.

**Device test** on Android Chrome and iOS Safari:
- log an event and swipe the app away within 1 s;
- lock the screen mid-half, wait 5 minutes, reopen;
- press HT, then switch apps immediately.

## 7. Open decisions for the owner

- **Shared archive (`pitchflow_matches_v1`):** every finished Event Stats match is also copied into the Match Stats archive. That doubles storage use and the key is uncapped. Should Event Stats keep writing there?
- **Saved-match limit:** remove the limit (proposed), or keep it as a visible warning with an export prompt?
- **SHOT ↔ score edits in Review Edit:** see the F-08 plan.

## Sources

- Chrome Developers, Page Lifecycle API: https://developer.chrome.com/blog/page-lifecycle-api
- MDN, Window `pagehide` event: https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event
- I. Grigorik, "Don't lose user and app state, use Page Visibility": https://www.igvita.com/2015/11/20/dont-lose-user-and-app-state-use-page-visibility/
