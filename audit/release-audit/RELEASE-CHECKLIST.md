# Event Stats: release checklist

**Code baseline:** main `81d2347` (PR #387 merged) + PR #388 (R-1 label, awaiting approval).

**Already verified** by automated suites and the three-match release audit:
- statistics;
- stored events;
- persistence and recovery paths;
- Review Edit rules;
- Event Map reachability.

This checklist is the final **human acceptance pass on a real Android phone**, against the production URL, before announcing release. Tick each item; any failure blocks release.

## 0. Before testing
- [ ] PR #388 approved and merged. The Vercel **production** deployment for the merge commit shows Ready.
- [ ] The phone uses Chrome on Android (current version), with the app opened from the production URL. Repeat once as an installed home-screen app, if offered.
- [ ] Settings → Backup: create a backup first, so existing saved matches are safe.

## 1. Match creation and live capture
- [ ] **New Match** works for Gaelic Football and Hurling: teams, venue, match type, half length (try 30 min). Squads and names save; Go To Game; direction; ▶ Start.
- [ ] Each tile family records one event with the right team and player:
  - Goal, Point, 2PT (football only), Shot, Wide, Kickout/Puckout (OUR and THEIR), 45/65, Sideline, Turnover, Free, Discipline.
- [ ] "✓ Event saved" appears after every tap. ↩ Undo removes the last event.
- [ ] **OUR K/O is the default after every event** (working as designed).
- [ ] ⇄ Subs: the sub-off player leaves the picker and the sub-on player appears in their slot.
- [ ] Pause and Resume hold the clock.

## 2. Half-time and full-time
- [ ] HT → End Half shows the correct score; Quick Review opens; START SECOND HALF continues the clock from 00:00 (2H).
- [ ] FT → Finish Match; the score matches your own count.

## 3. Saving, reopening and recovery
- [ ] **Save Match / Save & Finish** returns home; the match is listed in Saved Matches with the right score.
- [ ] Mid-match: close the browser tab and reopen the app → "Resume in-progress match" → RESUME MATCH. Every event is still there and the clock continues where it stopped.
- [ ] Mid-match: reload the page → same result.
- [ ] Saved Matches → Review reopens a finished match with identical figures.

## 4. Event Map and Review Edit
- [ ] Review → Event Map. Filters (H1/H2, FOR/OPP, categories) change the markers and the event count.
- [ ] Tap a marker in a crowded area. "N events here" lists the nearby events; choosing one shows its detail.
- [ ] A card tagged at the same spot as its free can be opened from that list.
- [ ] **Edit** changes only the chosen event:
  - shot → point is allowed;
  - turnover → point is not offered;
  - a kickout won ↔ lost change asks you to clear the player first.
- [ ] **Delete** asks "Confirm?" and removes only the chosen event. Choosing another event from the list cancels a pending "Confirm?".

## 5. Quick Review, Snapshot and Full Review PDF
- [ ] Quick Review pages 1–3 at HT and FT match the score and counts.
- [ ] HT Snapshot PDF, FT Snapshot PDF and Full Review PDF download and open on the phone (save, share).
- [ ] Spot-check:
  - score;
  - kickout won/lost;
  - turnovers won/lost;
  - one player's row;
  - Chain Intelligence → Turnover Chains reads **"Won → Shot, no score"**.

## 6. Android phone acceptance
- [ ] All taps register first time on the pitch, tiles, picker and Event detail list. No accidental Edit or Delete.
- [ ] Screen rotation, or switching to another app and back, during a live match loses nothing.
- [ ] A full match (~150 events) stays responsive. Note the saved-time feel at the end of the match.

## 7. Backup and storage warnings
- [ ] Settings → Backup → Create Backup downloads a file containing all saved matches.
- [ ] If the phone shows "Storage nearly full" in Saved Matches, delete old matches after backing up.
- [ ] Coaches are told (release note) what a red **"Save failed — storage full"** means: back up and delete old matches. **Do not navigate away** (browser back, reload, close tab) until the warning clears; Options → Home will ask before leaving.

## Known limitations to state in the release note (not blocking)
- **Hurling reports:** some reports still say "Kickouts", and an empty 2-point block shows on the efficiency pages.
- **Labels:** some show internal names, e.g. "TWO_POINTER Scores".
- **PDF layout:** minor overlaps (header badge, a footnote).
- **Player Contributions** shows the top 12 per team.
- **While storage writes are failing:** unsaved events are lost on browser back, reload, closing the tab or an Android OS kill.
- **Crowded Event Map spots:** "N events here" can list up to ~9 events and scrolls; a filter shortens it.
