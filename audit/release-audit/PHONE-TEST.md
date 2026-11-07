# Samsung phone test (production, about 45 minutes)

**Build:** release candidate `c96d232`, production URL. Use Chrome on the Samsung, and write **OK** or a note against each step. The full reference is `RELEASE-CHECKLIST.md`.

## Before you start
1. Open PáircVision → Settings → **Backup → Create Backup**. Keep the file.
2. Note your phone model and Android version.

## A. Live match (Gaelic Football, 2 × 10 min is enough)
3. New Match → Gaelic Football, 2 teams, half length of your choice. Squads → Go To Game → ▶ Start.
4. Tag **one of each** tile, for both teams where possible:
   - Goal, Point, 2PT, Shot, Wide;
   - Kickout: ours won, ours lost, theirs won, theirs lost;
   - 45, Sideline, Turnover won and lost, Free won and conceded, Yellow card.

   After each tap, check:
   - [ ] "✓ Event saved" shows;
   - [ ] the score updates correctly;
   - [ ] the kickout owner is back on **OUR K/O**.
5. Tag something wrong, then press **↩** → [ ] it disappears.
6. ⇄ Subs: take #10 off and put #16 on → [ ] #16 is now offered in the player picker.
7. **Close Chrome completely** (swipe it away), reopen the app → Resume in-progress match → RESUME MATCH → [ ] every event is still there and the clock continues.
8. HT → End Half → [ ] the score is right → Quick Review opens → START SECOND HALF.
9. Tag 5 more events, then FT → Finish Match → **Save & Finish** → [ ] you land on Home.

## B. Review
10. Saved Matches → the match is listed with the right score → **Review match**.
11. Event Map:
    - [ ] the H1/H2, FOR/OPP and category filters change the markers;
    - [ ] tap a marker → Event detail opens.
12. Tap a crowded spot (or, during step 4, tag the yellow card on the same spot as a free and tap it here) → [ ] "N events here" appears; choose another event in the list → its detail shows.
13. **Edit** a Wide → Point → Save → [ ] the score goes up by 1. Try Edit on a Turnover → [ ] Point is not offered.
14. **Delete** one event → "Confirm?" → confirm → [ ] only that event is gone.

## C. Reports
15. Quick Review pages 1–3 → [ ] figures match what you tagged.
16. Download the **HT Snapshot**, **FT Snapshot** and **Full Review** PDFs → [ ] each opens on the phone and can be shared.
17. In the Full Review, check:
    - [ ] the score;
    - [ ] kickouts won/lost;
    - [ ] turnovers;
    - [ ] one player's row;
    - [ ] Chain Intelligence → Turnover Chains reads **"Won → Shot, no score"**.

## D. Phone behaviour
18. During a live match, rotate the phone and switch to another app and back → [ ] nothing is lost.
19. [ ] Every tap registered first time; no accidental Edit or Delete.

## E. Backup
20. Settings → Backup → Create Backup → [ ] the file downloads and includes the new match.

## Report back
Send:
- the phone model;
- any step not OK, with a screenshot.

**GREEN** if every step is OK. Any data lost, a wrong score or a wrong statistic is **RED**. Anything else goes on a short **AMBER** list.
