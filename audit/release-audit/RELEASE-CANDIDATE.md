# Event Stats release candidate

| | |
|---|---|
| **Baseline** | main `c96d2323b9eafad2f33899d6b471efb916fb9822` (merge of PR #388, 7 Nov 2026) |
| **Production** | GitHub deployment 7625499452 (environment Production): success, 18:49 UTC. |
| **Rule** | No code change to this baseline without an identified release-blocking defect and owner approval. |

## What this baseline contains (since the release audit)

| PR | Merge commit | Change |
|---|---|---|
| #382 | `fc7beec` | Review Edit: only safe type changes |
| #387 | `81d2347` | Event Map: the "N events here" list makes every event reachable (N-1) |
| #388 | `c96d232` | Chain Intelligence label "Won → Shot, no score" (R-1) |

## Verification of the baseline

- **Tests:** 3264/3264 pass; the type check shows the same errors as before; the production build passes.
- **Release audit** (640 fresh events across three matches, independent ledgers):
  - no calculation or storage defects;
  - R-1 resolved (4 label checks now PASS);
  - N-1 resolved (26/26 events reachable on desktop and Pixel 7 touch).
- **No remaining RED findings.**

## Known non-blocking limitations (for the release note; not part of acceptance)

1. **Hurling reports:** some reports still use "Kickouts" wording, and an empty 2-point block shows on the efficiency pages (K-1, K-2).
2. **Raw labels:** some labels show internal names, e.g. "TWO_POINTER Scores" (K-3).
3. **PDF layout:** minor overlaps (header badge, one footnote) (K-4).
4. **Player Contributions:** shows the top 12 players per team (K-5). The NET BALL formula is not explained on the page (K-6).
5. **Unsaved events can be lost while storage writes are failing,** if the coach uses browser back, reloads, closes the tab or Android kills the app (K-7). Options → Home is guarded.
6. **Opposition players without names** show as "#15 #15" in Event detail (K-8).
7. **Crowded Event Map spots:** "N events here" can list up to ~9 events and scrolls.
