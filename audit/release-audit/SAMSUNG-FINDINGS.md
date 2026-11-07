# Samsung acceptance findings: read-only investigation

- **Release candidate:** main `c96d232`, unchanged. No code changed and no PR.
- **Evidence:** code paths as cited, plus a render test (`results/samsung-findings/f2-markers*.json`). The test ran the real `exportSnapshotPdf` / `exportReviewPdf` on a controlled match with a stubbed PDF writer. Each placed-ball variant was added one at a time and the markers drawn on each page were compared with the match without it.
- **Limitation:** the Samsung match itself was not available, only the quoted figures. What its data is needed for is listed at the end.

## Finding 1: kickout reporting clarity

**What Quick Review page 1 counts** (`quickReviewMatchOverview.ts`):

| Row | Source | Counts |
|---|---|---|
| "Our kickouts 4/5 retained (80%)" | `restartTeams.for.ownRestartsRetained / ownRestartsTaken` | Ballylanders' **own** kickouts kept, out of own kickouts taken. Restarts with an unknown owner are excluded. |
| "Their kickouts 5/6 retained (83%)" | `restartTeams.opp…` | Galbally's own kickouts kept, out of taken. |
| "Our restart won: shots / scores" | `possessions.kickouts.retained` | **Every** kickout the ball was won from by Ballylanders, *whoever kicked it out*: own kept + Galbally's won. Each counts once, by its first outcome within 90 s (scores ⊂ shots). |
| "Our restart lost: shots / scores against" | `possessions.kickouts.conceded` | **Every** kickout Galbally won: own lost + Galbally's own kept. |

**Applied to the quoted figures:**
- Ballylanders won 4 (own) + 1 (Galbally's 6 − 5) = **5 kickouts**, with 0 shots and 0 scores.
- Galbally won 5 (own) + 1 (Ballylanders' 5 − 4) = **6 kickouts**, with 3 shots and 2 scores.

The figures are consistent. Two things are missing from the screen:
- the number of opposition kickouts each team won (1 each);
- the number of possessions behind "Our restart won/lost" (5 and 6).

"Our restart won" reads like *own kickouts retained*, but it actually means *all kickouts won*.

**Classification:** confusing wording, intended calculation. **AMBER**, non-blocking.

**Smallest reporting-only correction.** This is presentation only, in `quickReviewMatchOverview.ts` and `QuickReviewPage1.tsx`, using data already computed. Per team, Quick Review would show:
- **Own kickouts retained a/b**, as now;
- **Opposition kickouts won c/d**, where c/d is derived from the other team's `ownRestartsTaken − ownRestartsRetained` out of their `ownRestartsTaken`;
- **From the kickouts it won (n): s shots, x scores**, the existing consequence figures, with the possession count and the team named. For example, "Kickouts Ballylanders won (5): 0 shots · 0 scores" and "Kickouts Galbally won (6): 3 shots · 2 scores".

If shots and scores are also wanted separately for own-retained and opposition-won possessions, split `possessions.kickouts.results` by the origin event's `restartOwner`. That is still reporting-only. Capture, the possession engine and the definitions are unchanged.

## Finding 2: 45 missing from pitch maps

**How a 45 is stored:**

| Tagged as | Stored kind / tags | Counts |
|---|---|---|
| Point → 45 | POINT `["45"]` | a placed ball (`isPlacedScore`) |
| 2PT → 45 | FORTY_FIVE_TWO_POINT `["45"]` | a placed ball |
| Goal → 45 | GOAL `["45"]` | a placed ball |
| Wide → 45 | WIDE `["45"]` | a placed ball |
| 45 → Won (the award) | FORTY_FIVE_WON | the "45" row of the Match Summary; not a shot |

Hurling 65s are the same with tag "65". The earlier real match (29 Sep) stored a scored 45 as TWO_POINTER `["45"]`, an older form.

**Which pitch diagrams draw them** (render test, real exporters):

| Diagram | 45 / 65 attempts (any form, either half, either team) | 45/65 award | Free attempts | Mark / penalty attempts |
|---|---|---|---|---|
| Snapshot: Our / Opposition Shot Profile | drawn, as an ordinary point / 2-pointer / goal / wide marker | not drawn (not a shot) | drawn | drawn |
| Full Review: Shot Pitch Maps | drawn | not drawn | drawn | drawn |
| Full Review: 1H / 2H Pitch Overview, "All Events" | drawn | drawn, as a cyan dot (same colour as a kickout won) | drawn | drawn |
| **Full Review: Free Kick Analysis, "Our Frees" / "Opposition Frees"** | **not drawn** | not drawn | drawn | **not drawn** |

**Confirmed defect: Full Review → Free Kick Analysis.**
- **Totals:** the page's **"PLACED BALLS — Placed Scored / Placed Missed"** figures come from `report.placedBalls`. Those count frees, 45s/65s, penalties and marks (`isPlacedScore` / `isPlacedMiss`).
- **Maps:** the two pitch maps and their counts come from `isFreeRelatedPdfEvent`. That covers only frees won/conceded and attempts with a FREE source.
- **Effect:** a 45 (or 65, mark or penalty) is counted in "Placed Scored" but never drawn on that page. Frees are not affected.
- **Classification:** genuine report-selection inconsistency. **AMBER.**
- **Smallest fix (reporting-only):** in `makeFreeAnalysisPage`, plot each team's frees won/conceded **plus its placed-ball attempts** (`isPlacedScore || isPlacedMiss`), so the map matches the totals beside it.

**Not reproduced: Snapshot.** Every form of a scored or missed 45 is drawn on the Snapshot shot profiles, but as an ordinary score or wide marker, with nothing marking it as a 45. There are two plausible readings of what was seen:
- **(a)** the 45 score is on the map but indistinguishable from other points or 2-pointers;
- **(b)** the event placed on the pitch was the **45 award** (45 → Won). By design that appears on no shot map, only on the Pitch Overview "All Events", as a cyan dot.

Settling this needs the saved event (see the end).

**Not a blocker** for a controlled football release: totals are correct; one Full Review map omits placed balls other than frees.

## Finding 3: turnover report reconciliation

**What each figure counts.** Event Stats stores every turnover with `teamSide` FOR:
- TURNOVER_WON means Ballylanders won the ball;
- TURNOVER_LOST means Galbally won it.

| Figure | Where | Counts |
|---|---|---|
| Quick Review "Ballylanders turnovers won 3" | `mirroredFor.turnoversWon` | TURNOVER_WON events |
| Quick Review "Galbally turnovers won 5" | `mirroredFor.turnoversLost` | TURNOVER_LOST events (Ballylanders' losses = Galbally's wins) |
| Full Review → Turnover Chain Analysis → "Total turnovers gained" 8 | `forWonTotal + oppWonTotal` | every turnover, credited to the team that won the ball: 3 + 5 |
| "Led to score" 1 | `forWonToScore + oppWonToScore` | turnovers whose chain outcome (chain engine, turnover window) is a score by the winning team, both teams |
| "Led to shot (no score)" 2 | `forWonToShotOnly + oppWonToShotOnly` | an attempt but no score, both teams |
| "Ballylanders lost → OPP scored" 0 | `oppAttacking` from FOR TURNOVER_LOST with a score | Galbally scores from Ballylanders' losses: the same 5 possessions as Galbally's wins |

**Consistency:**
- 8 = 3 + 5. ✓
- Galbally's 5 produced 0 scores, so the 1 score came from Ballylanders' 3 turnovers won. ✓
- The 2 shots without a score are split between the teams in a way the screenshots don't show.

No contradiction is visible. The "both teams" block mixes both teams' possessions into one line, which is what makes it hard to read.

**Classification:** consistent, intended behaviour; the combined block is unclear wording. **GREEN** for correctness, **AMBER** for clarity. Not blocking.

**Smallest clarity correction (optional, reporting-only):** name the team in each row of the "Turnover outcomes (both teams)" block (e.g. "Ballylanders 3 won → 1 score, s shots"; "Galbally 5 won → 0 scores, s shots"), or label the existing totals "both teams combined".

**Needed for a full event-level reconciliation of the 2 shots and the Quick Review turnover rows:** the saved match. Its Quick Review figures (turnovers won/lost: shots, scores) also come from a separate possession engine, so a line-by-line tie needs the events.

## What is needed from the Samsung match

One file: **Saved Matches → (match) → Options → Export JSON**. Alternatively, a screenshot of the Event detail of the 45 (its Type), plus Quick Review pages 1–2 and the Full Review Turnover Chain Analysis page. With that:
- Finding 2 can be settled as (a) or (b);
- Findings 1 and 3 can be reconciled event by event.

## Release impact

None of the three findings is RED: no wrong score, statistic or lost data was found.
- **Findings 1 and 3:** wording/clarity, AMBER.
- **Finding 2 (Free Kick Analysis map):** an AMBER report-selection defect. The Snapshot part is unconfirmed pending the saved event.

**Recommendation:** these do not block a controlled Gaelic football release. If they are corrected before release, the three corrections are reporting-only and small:
- the Quick Review kickout rows;
- the Free Kick Analysis map selection;
- naming the teams in the turnover outcome rows.
