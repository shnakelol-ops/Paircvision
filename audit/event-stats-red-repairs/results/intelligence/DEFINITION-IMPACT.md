# Intelligence branch — what the kickout-origin definition changed

Each row is a check whose expected value differs between the original ledgers (`expected/`, previous restart rule) and the authoritative ledgers (`expected-authoritative/`, authoritative kickout-origin possession — `KICKOUT-ORIGIN-DEFINITION.md`; validated against possession roots rebuilt from the simulator's ground truth, see `expected-authoritative/VALIDATION.json`).

| Match | Definition change, now passes vs authoritative | Still failing: F-11 (both-teams average, open) | Not explained | Other checks whose value changed |
|---|---|---|---|---|
| A | 14 | 1 | 0 | 0 |
| B | 27 | 2 | 0 | 0 |
| C | 10 | 1 | 0 | 0 |

## Definition-driven changes

| Match | Check | Previous rule (expected) | Authoritative (expected) | PR #374 printed | Intelligence branch printed | vs original | vs authoritative |
|---|---|---|---|---|---|---|---|
| A | Quick Review p1 (Overview) · HT · 1H · restarts lost → shots against · FOR | 4 shots against | 3 shots against | 4 shots against | 3 shots against | FAIL | PASS |
| A | Quick Review p1 (Overview) · FT · FULL · restarts lost → shots against · FOR | 10 shots against | 9 shots against | 10 shots against | 9 shots against | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Won → Score (origin) · FOR | 11 (41%) | 10 (37%) | 11 (41%) | 10 (37%) | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Won → Shot attempt · FOR | 17 (63%) | 16 (59%) | 17 (63%) | 16 (59%) | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Won → No shot · FOR | 10 | 11 | 10 | 11 | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Lost → Score against (origin) · FOR | 12 (63%) | 11 (58%) | 12 (63%) | 11 (58%) | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Lost → No score · FOR | 7 | 8 | 7 | 8 | FAIL | PASS |
| A | Full Review PDF (live) · Restart Analysis · FULL · Avg secs to score (won) · FOR | 38s | 36s | 36s | 33s | FAIL | FAIL |
| A | Full Review PDF (live) · Scoring Possession Origins · FULL · restart-origin scores · FOR | 1 Goal, 8 Points, 2 Two-Point scores (15 pts) | 1 Goal, 7 Points, 2 Two-Point scores (14 pts) | 1 Goal, 8 Points, 2 Two-Point scores (15 pts) | 1 Goal, 7 Points, 2 Two-Point scores (14 pts) | FAIL | PASS |
| A | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores conceded · OPP | 2 Goals, 7 Points, 3 Two-Point scores (19 pts) (63%) | 2 Goals, 7 Points, 2 Two-Point scores (17 pts) (58%) | 2 Goals, 7 Points, 3 Two-Point scores (19 pts) (63%) | 2 Goals, 7 Points, 2 Two-Point scores (17 pts) (58%) | FAIL | PASS |
| A | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores from our kickout losses · OPP | 3 Points, 3 Two-Point scores (9 pts) | 3 Points, 2 Two-Point scores (7 pts) | 3 Points, 3 Two-Point scores (9 pts) | 3 Points, 2 Two-Point scores (7 pts) | FAIL | PASS |
| A | Full Review PDF (live) · Intelligence Summary · FULL · kickout wins → origin score · FOR | 41% | 37% | 41% | 37% | FAIL | PASS |
| A | Full Review PDF (live) · Intelligence Summary · FULL · kickout losses → origin score against · FOR | 63% | 58% | 63% | 58% | FAIL | PASS |
| A | Full Review PDF (live) · Intelligence Summary · FULL · net kickout advantage (%pt) · FOR | -22 %pt | -21 %pt | -22 %pt | -21 %pt | FAIL | PASS |
| A | Full Review PDF (live) · Chain Intelligence · FULL · Won → Origin score · FOR | 11 (41%) | 10 (37%) | 11 (41%) | 10 (37%) | FAIL | PASS |
| B | Quick Review p1 (Overview) · FT · FULL · restarts won → shots (possession) · FOR | 11 shots | 12 shots | 11 shots | 12 shots | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Won → Score (origin) · FOR | 11 (27%) | 9 (22%) | 11 (27%) | 9 (22%) | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Won → Shot attempt · FOR | 25 (61%) | 18 (44%) | 25 (61%) | 18 (44%) | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Won → No shot · FOR | 16 | 23 | 16 | 23 | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Lost → Score against (origin) · FOR | 18 (51%) | 8 (23%) | 18 (51%) | 8 (23%) | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Lost → No score · FOR | 17 | 27 | 17 | 27 | FAIL | PASS |
| B | Full Review PDF (live) · Restart Analysis · FULL · Avg secs to score (won) · FOR | 23s | 19s | 30s | 20s | FAIL | FAIL |
| B | Full Review PDF (live) · Scoring Possession Origins · FULL · restart-origin scores · OPP | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | FAIL | PASS |
| B | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores for OPP · OPP | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | FAIL | PASS |
| B | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores conceded · OPP | 2 Goals, 13 Points, 3 Two-Point scores (25 pts) (51%) | 5 Points, 3 Two-Point scores (11 pts) (23%) | 2 Goals, 13 Points, 3 Two-Point scores (25 pts) (51%) | 5 Points, 3 Two-Point scores (11 pts) (23%) | FAIL | PASS |
| B | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores from our kickout losses · OPP | 5 Points, 3 Two-Point scores (11 pts) | 2 Points, 3 Two-Point scores (8 pts) | 5 Points, 3 Two-Point scores (11 pts) | 2 Points, 3 Two-Point scores (8 pts) | FAIL | PASS |
| B | Full Review PDF (live) · Intelligence Summary · FULL · kickout wins → origin score · FOR | 27% | 22% | 27% | 22% | FAIL | PASS |
| B | Full Review PDF (live) · Intelligence Summary · FULL · kickout losses → origin score against · FOR | 51% | 23% | 51% | 23% | FAIL | PASS |
| B | Full Review PDF (live) · Intelligence Summary · FULL · net kickout advantage (%pt) · FOR | -24 %pt | -1 %pt | -24 %pt | -1 %pt | FAIL | PASS |
| B | Full Review PDF (live) · Chain Intelligence · FULL · Won → Origin score · FOR | 11 (27%) | 9 (22%) | 11 (27%) | 9 (22%) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Won → Score (origin) · FOR | 12 (30%) | 10 (25%) | 12 (30%) | 10 (25%) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Won → Shot attempt · FOR | 25 (63%) | 18 (45%) | 25 (63%) | 18 (45%) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Won → No shot · FOR | 15 | 22 | 15 | 22 | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Lost → Score against (origin) · FOR | 20 (56%) | 8 (22%) | 20 (56%) | 8 (22%) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Lost → No score · FOR | 16 | 28 | 16 | 28 | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Restart Analysis · FULL · Avg secs to score (won) · FOR | 22s | 19s | 30s | 20s | FAIL | FAIL |
| B | Full Review PDF (reopened after review edits) · Scoring Possession Origins · FULL · restart-origin scores · OPP | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Opposition Origin · FULL · restart-origin scores for OPP · OPP | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | 6 Points, 3 Two-Point scores (12 pts) | 5 Points, 3 Two-Point scores (11 pts) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Opposition Origin · FULL · restart-origin scores conceded · OPP | 2 Goals, 15 Points, 3 Two-Point scores (27 pts) (56%) | 5 Points, 3 Two-Point scores (11 pts) (22%) | 2 Goals, 15 Points, 3 Two-Point scores (27 pts) (56%) | 5 Points, 3 Two-Point scores (11 pts) (22%) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Opposition Origin · FULL · restart-origin scores from our kickout losses · OPP | 6 Points, 3 Two-Point scores (12 pts) | 2 Points, 3 Two-Point scores (8 pts) | 6 Points, 3 Two-Point scores (12 pts) | 2 Points, 3 Two-Point scores (8 pts) | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Intelligence Summary · FULL · kickout wins → origin score · FOR | 30% | 25% | 30% | 25% | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Intelligence Summary · FULL · kickout losses → origin score against · FOR | 56% | 22% | 56% | 22% | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Intelligence Summary · FULL · net kickout advantage (%pt) · FOR | -26 %pt | +3 %pt | -26 %pt | +3 %pt | FAIL | PASS |
| B | Full Review PDF (reopened after review edits) · Chain Intelligence · FULL · Won → Origin score · FOR | 12 (30%) | 10 (25%) | 12 (30%) | 10 (25%) | FAIL | PASS |
| C | Quick Review p1 (Overview) · HT · 1H · restarts lost → scores against · FOR | 5 scores against | 4 scores against | 5 scores against | 4 scores against | FAIL | PASS |
| C | Quick Review p1 (Overview) · FT · FULL · restarts won → shots (possession) · FOR | 10 shots | 9 shots | 10 shots | 9 shots | FAIL | PASS |
| C | Quick Review p1 (Overview) · FT · FULL · restarts lost → scores against · FOR | 10 scores against | 9 scores against | 10 scores against | 9 scores against | FAIL | PASS |
| C | Full Review PDF (live) · Restart Analysis · FULL · Won → Shot attempt · FOR | 13 (54%) | 12 (50%) | 13 (54%) | 12 (50%) | FAIL | PASS |
| C | Full Review PDF (live) · Restart Analysis · FULL · Won → No shot · FOR | 11 | 12 | 11 | 12 | FAIL | PASS |
| C | Full Review PDF (live) · Restart Analysis · FULL · Lost → Score against (origin) · FOR | 15 (50%) | 14 (47%) | 15 (50%) | 14 (47%) | FAIL | PASS |
| C | Full Review PDF (live) · Restart Analysis · FULL · Lost → No score · FOR | 15 | 16 | 15 | 16 | FAIL | PASS |
| C | Full Review PDF (live) · Opposition Origin · FULL · restart-origin scores conceded · OPP | 1 Goal, 14 Points (17 pts) (50%) | 1 Goal, 13 Points (16 pts) (47%) | 1 Goal, 14 Points (17 pts) (50%) | 1 Goal, 13 Points (16 pts) (47%) | FAIL | PASS |
| C | Full Review PDF (live) · Intelligence Summary · FULL · kickout losses → origin score against · FOR | 50% | 47% | 50% | 47% | FAIL | PASS |
| C | Full Review PDF (live) · Intelligence Summary · FULL · net kickout advantage (%pt) · FOR | -21 %pt | -18 %pt | -21 %pt | -18 %pt | FAIL | PASS |

## Other checks whose printed value changed

| Match | Check | Expected | PR #374 printed | Intelligence printed | Status |
|---|---|---|---|---|---|
| C | Full Review PDF (live) · Restart Analysis · FULL · Avg secs to score (won) · FOR | 30s | 36s | 34s | FAIL → FAIL |
