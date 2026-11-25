# N-1 recheck: can the existing Event Map filters reach the 26 events? (read-only)

- **App version:** main `fc7beec`. No code changed.
- **Match:** saved match B as captured, 331 events.
- **Layout:** phone, 430 × 932.

## How the Event Map picks an event (from the code)

- **Filters:** half (ALL / H1 / H2) × team (ALL / FOR / OPP) × category.
  - The categories are ALL, SCORES, SHOTS, WIDES, T/O, K/O and FREES. Cards, 45/65s and sidelines appear only under ALL.
  - Markers are drawn in stored order, oldest first.
- **Tap area** (`draw-stats-markers.ts`): every marker has an invisible tap circle of at least 16 px radius (17.6 px for cards, 45s and sidelines), around a visible dot of 5–9 px.
- **Which event opens:** Pixi opens the *latest-drawn* marker whose tap circle contains the tap point. So any later marker within about 32 px takes over part of an earlier marker's tap area. Within about 16 px, it usually takes over the whole visible dot.
- **Team filter detail:** FOR + T/O shows both our turnovers won and our turnovers lost, and FOR + K/O shows kickouts won and lost. No filter separates won from lost.

## Method

1. **Geometry.** For each of the 26 events, and for every filter view that includes it (63 combinations; 4–12 apply per event), the analysis:
   - used the app's own `selectReviewEvents`, marker style and pitch-geometry functions;
   - sampled every pixel of the event's tap circle;
   - recorded where the event is the top-most marker, both on its visible dot and anywhere in its tap area.
2. **Real-app confirmation** (`scripts/n1/n1-verify.mjs`):
   - tapped the computed best point in the best view;
   - tapped the dot centre in the narrowest view (own half + team + category).

   Results:
   - 25 of 26 confirm the model; the miss is a 1 px sliver.
   - The dot-centre tap opens a *later* overlapping marker every time, the one predicted in 23 of 26 cases.
   - Every tap opens the top-most marker, exactly as coded: **no selection bug**.

Evidence: `results/n1-recheck/n1-geometry.json`, `n1-verify.json`, `n1-nearest.json`.

## Per event

| Event | Type | nx, ny | Filters that include it | Narrowest view: tapping its dot opens… | Nearest other marker in its best view (px) | Selectable by |
|---|---|---|---|---|---|---|
| 1H 00:51 | TURNOVER_WON | 0.443, 0.609 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER LOST 30:28 | 11.1 | edge only |
| 1H 01:19 | POINT | 0.905, 0.439 | 8 views; categories ALL, SCORES | H1/OPP/SCORES → opens POINT 22:08 | 6 | edge only |
| 1H 01:34 | KICKOUT_WON | 0.560, 0.327 | 8 views; categories ALL, KICKOUTS | H1/FOR/KICKOUTS → opens KICKOUT WON 32:28 | 10.1 | edge only |
| 1H 01:38 | POINT | 0.187, 0.616 | 8 views; categories ALL, SCORES | H1/FOR/SCORES → opens POINT 16:08 | 0.6 | edge only |
| 1H 03:38 | KICKOUT_CONCEDED | 0.290, 0.360 | 12 views; categories ALL, KICKOUTS | H1/OPP/KICKOUTS → opens KICKOUT LOST 31:12 | 7.8 | edge only |
| 1H 04:31 | TURNOVER_WON | 0.743, 0.753 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER LOST 11:16 | 5.2 | edge only |
| 1H 05:24 | FORTY_FIVE_WON | 0.690, 0.500 | 4 views; categories ALL | ALL/ALL/ALL → opens TURNOVER LOST 34:22 | 8.6 | edge only |
| 1H 06:14 | KICKOUT_WON | 0.640, 0.315 | 8 views; categories ALL, KICKOUTS | H1/FOR/KICKOUTS → opens KICKOUT WON 24:29 | 11.6 | dot (filter works) |
| 1H 10:33 | SIDELINE_WON | 0.217, 0.980 | 4 views; categories ALL | ALL/ALL/ALL → opens SIDELINE WON 22:37 | 3.2 | edge only |
| 1H 11:20 | TURNOVER_WON | 0.301, 0.278 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER LOST 12:32 | 9.2 | edge only |
| 1H 11:52 | YELLOW_CARD | 0.478, 0.584 | 4 views; categories ALL | ALL/ALL/ALL → opens FREE_WON 33:18 | 0 | never |
| 1H 14:00 | TURNOVER_WON | 0.548, 0.431 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER WON 28:43 | 1.7 | never |
| 1H 14:05 | TURNOVER_LOST | 0.535, 0.430 | 12 views; categories ALL, TURNOVERS | H1/OPP/TURNOVERS → opens TURNOVER LOST 16:59 | 13.3 | edge only |
| 1H 14:09 | TURNOVER_WON | 0.342, 0.509 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER LOST 33:52 | 4.1 | edge only |
| 1H 14:26 | FORTY_FIVE_WON | 0.310, 0.500 | 4 views; categories ALL | ALL/ALL/ALL → opens TWO_POINTER 25:57 | 7.7 | dot (filter works) |
| 1H 17:05 | SIDELINE_WON | 0.365, 0.020 | 4 views; categories ALL | ALL/ALL/ALL → opens SIDELINE WON 22:48 | 2 | edge only |
| 1H 18:37 | TURNOVER_WON | 0.841, 0.362 | 8 views; categories ALL, TURNOVERS | H1/FOR/TURNOVERS → opens TURNOVER LOST 28:33 | 9.7 | never |
| 1H 25:34 | KICKOUT_WON | 0.760, 0.771 | 8 views; categories ALL, KICKOUTS | H1/FOR/KICKOUTS → opens KICKOUT WON 34:31 | 5.9 | edge only |
| 2H 02:00 | WIDE | 0.306, 0.336 | 10 views; categories ALL, FREES, WIDES | H2/OPP/WIDES → opens WIDE 03:07 | 8.4 | edge only |
| 2H 02:29 | TURNOVER_WON | 0.454, 0.717 | 8 views; categories ALL, TURNOVERS | H2/FOR/TURNOVERS → opens TURNOVER WON 24:31 | 12.6 | dot (filter works) |
| 2H 04:07 | TURNOVER_WON | 0.830, 0.704 | 8 views; categories ALL, TURNOVERS | H2/FOR/TURNOVERS → opens TURNOVER WON 07:58 | 9.2 | edge only |
| 2H 04:23 | KICKOUT_WON | 0.797, 0.252 | 8 views; categories ALL, KICKOUTS | H2/OPP/KICKOUTS → opens KICKOUT LOST 34:17 | 10.1 | edge only |
| 2H 07:22 | TURNOVER_LOST | 0.139, 0.270 | 12 views; categories ALL, TURNOVERS | H2/OPP/TURNOVERS → opens TURNOVER LOST 26:58 | 4.4 | edge only |
| 2H 17:32 | TURNOVER_WON | 0.503, 0.484 | 8 views; categories ALL, TURNOVERS | H2/FOR/TURNOVERS → opens TURNOVER WON 31:49 | 4.1 | edge only |
| 2H 28:45 | TURNOVER_WON | 0.386, 0.661 | 8 views; categories ALL, TURNOVERS | H2/FOR/TURNOVERS → opens TURNOVER WON 29:58 | 6.6 | edge only |
| 2H 29:51 | KICKOUT_WON | 0.628, 0.707 | 8 views; categories ALL, KICKOUTS | H2/OPP/KICKOUTS → opens KICKOUT WON 31:28 | 3.6 | edge only |
"dot (filter works)" means a filter view exists in which tapping the visible marker opens it. "edge only" means it opens only from a tap on empty pitch beside the dot, inside its invisible tap circle. A coach has no way to know where that is. "never" means a later marker covers the whole tap circle in every view.

## Answer

| Result | Events |
|---|---|
| Reachable by tapping their own marker under an existing filter | **3**: kickout won 1H 06:14 (ALL/ALL/K/O), 45 won 1H 14:26 (H1/ALL/ALL), turnover won 2H 02:29 (ALL/ALL/T/O; only a ~1 px sliver of the dot, unreliable). The earlier sweep missed these because it did not use the half-ALL and team-ALL views. |
| **Still inaccessible after using the filters correctly** | **23** (24 counting the 02:29 sliver). Of these, 20 open only from a blind tap on empty pitch beside them, and 3 cannot be opened by any tap: the yellow card 1H 11:52, turnover won 1H 14:00 and turnover won 1H 18:37. |

### Cause

- **Overlapping markers: all 26.**
  - In the narrowest filter, the marker that takes the tap is of the same category for every event that has a category: a turnover over a turnover, a kickout over a kickout, a point over a point, a wide over a wide.
  - Filters cannot separate two events of the same half, team and category.
- **Missing filter category: contributes to 3.**
  - The yellow card (it sits exactly on its free, 0 px apart) and the two 45s are only in the ALL views.
  - The two sidelines are covered by other sidelines, so a sideline chip would not help them.
- **Filter semantics: contributes to 5.**
  - Turnovers won under FOR + T/O are covered by our turnovers lost, which the same filter also shows.
  - Each of these 5 is also covered by other markers.
- **Selection bug: none.** The app does exactly what it is coded to do. The design (large invisible tap circles, latest-drawn wins) is what hides earlier events.

### Why a filter or tap-rule change alone is not enough

- **More filters or chips** would fix at most the card and the two 45s.
- **Nearest-marker tapping** (picking the marker whose centre is closest to the tap) would make about 17 of the 26 reliably tappable. But 9 sit within 5 px of another marker, so their dots visibly stack:
  - a card exactly on its free;
  - a point 0.6 px from another point;
  - turnovers 1.7–4.4 px apart;
  - sidelines 2–3 px apart.

  Nothing tap-based can separate those.

## Smallest necessary correction (recommendation; not implemented)

**In the Review screen's existing Event detail panel only, list the other events at the tapped spot.**
- When a marker opens, also list the events in the current filtered view whose markers lie within two tap radii (about 32 px) of it, each as type and time.
- Tapping one shows that event's detail, with the existing Edit and Delete buttons.
- No new filters, no change to markers, tap areas or shared pitch code (Match Stats and Rapid Capture are untouched), and no change to stored data.

All 26 are reachable this way. Each one's covering marker is within 32 px, so the event appears in the list when its covering marker opens.
