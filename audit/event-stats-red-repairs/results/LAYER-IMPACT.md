# Layer impact — core match facts vs Intelligence engine

**Question.** Which layer did each F-01 – F-06 fix change? Did any fix alter the Intelligence engine's outputs or scoring-origin attribution? Can the Intelligence engine change authoritative core statistics?

**Method.** `scripts/diagnostics/layer-impact.test.ts` runs **one** code tree over the events the app stored for each audit match. Those stored events are identical input for both runs: `runs/*/state/FT.json` (live), `final.json` (after review edits) and the legacy import. For each match and scope (1H and FULL), it writes every core and Intelligence output as JSON. It ran once against main (`a2384fd`) and once against the repair branch. `scripts/diagnostics/layer-diff.mjs` then lists every changed value (549 leaf values; raw list in `layer-impact-diffs.json`, grouped in `layer-impact-groups.txt`).

**Layers in the dump.**
- **Core match facts**:
  - Team Match Summary blocks: Snapshot, Quick Review and Full Review p1.
  - Direct scoring breakdown.
  - Placed balls.
  - Restart counts, own-kickout retention and Restart Share.
  - The kickout dataset (restart event plus resolved winner).
- **Intelligence**:
  - The chain engine's forward scans: turnover dataset and kickout `nextScore`.
  - Origin-attributed score ledger rows.
  - Turnover punishment.
  - Chain rule matches.
  - Possession outcomes.
  - Coaching prompts and the Intelligence Summary.

## What changed, by layer

| Output | Layer | Changed in | Finding | Before → after |
|---|---|---|---|---|
| Swarm/Int., Slack KP/HP, Foul Won/Conceded, Block/Save | Core | A, B, C, legacy | F-01 / F-06 | 0 → the tagged counts |
| Placed attempts / scores / points, Placed Scored | Core | C (hurling) | F-02 | Ballyhale 3/4 → 4/5, Na Piarsaigh 6/6 → 9/9 |
| Direct breakdown: Placed / Unattributed | Core | C | F-02 | Unattributed 0-01 / 0-03 → none |
| Own-kickout retention, own restarts retained | Core | legacy only | F-04 | 100% (27 of 27) → unavailable (0 taken, 46 owner-unknown) |
| `unknownOwnerRestarts` (new field) | Core | all | F-04 | absent → 0 (live) / 46 (legacy) |
| Turnover outcomes (`nextEvent`, `resultedInScore`) | Intelligence | A 2, B 21 (7 scoring), C 4, legacy 7 | F-03 | B: 7 opposition turnovers no longer credited with a later possession's score |
| Turnover loss punishment | Intelligence | B | F-03 | 56% (25/45) → 40% (18/45) live; 57% → 39% after edits |
| Ledger Turnover-won row (them) | Intelligence | B | F-03 | 21 → 20 pts; 1 point moves to From General Play |
| Ledger Placed / Unattributed rows | Intelligence (ledger) | C | F-02 | Placed 5/6 → 6/9; Unattributed 1/3 → removed |
| Coaching prompts | Intelligence | B | F-03 | "…against 56% for St Brigid's" → "against 40%"; the 56% / 50% sentences drop below their threshold |
| Possession outcomes: our / their kickout families | Intelligence | legacy only | F-04 | invented split (Ballyboden "took" 19 and kept 0; Na Fianna "took" 27 and kept 27) → null; the combined kickout family is unchanged |
| Intelligence Summary | Intelligence | legacy only | F-04 | "…9 of the 19 **Ballyboden** Kickouts they won" (owner invented) → "…9 of 19 Kickouts they won" |

## What did not change

Identical in every dataset (main vs repair):

- **Scores.** Score lines, totals and margins, both teams, all matches and scopes.
- **The kickout dataset.** Every restart's winner, the restart-origin `nextScore` and the restart totals.
- **Chain rule matches.** `allChains` is byte-identical: A 32, B 84 / 87, C 43, legacy 48.
- **Live possession outcomes.** All families for A, B and C. Only the legacy owner-split families changed.
- **Turnover won/lost counts** and every other Match Summary row not listed above.

## Conclusions

1. **The Intelligence engine was a cause of two of the six RED findings.**
   - **F-03** sat entirely in the chain engine's turnover forward scan (`buildTurnoverDataset`). The scan skipped any event with the "wrong" teamSide, so it never saw us win the ball back. Event Stats stores every turnover under FOR.
   - **F-04** had two independent sources:
     - The core owner fallback (`resolveRestartOwner`, owner = teamSide).
     - The possession-outcomes engine's own legacy shim, which split owner-less restarts into "our" and "their" kickouts. That shim is what produced the invented "Ballyboden Kickouts" sentence.
   - F-01, F-02, F-05 and F-06 had no Intelligence-engine involvement:
     - F-01 and F-02 were core classification gaps.
     - F-05 and F-06 were PDF-local definitions.

2. **The Intelligence engine did not alter authoritative core statistics.**
   - Scores, restart counts, retention, Restart Share, placed balls and turnover counts are computed from event-level fields: the event, its tags, and the restart's resolved winner. None of them reads any forward-scan result.
   - The F-03 defect therefore corrupted only origin-attributed Intelligence figures (Opposition Origin, punishment rate, prompts, ledger turnover row). The scoreline was never affected.
   - `src/stats/reporting/coreIntelligenceBoundary.test.ts` now enforces this. It blanks every forward-scan result and asserts that all core figures are unchanged. A deliberate mutation (core restart counts reading `nextShotOrScore`) failed 2 of its 5 tests.

3. **Intended changes to scoring-origin attribution:**
   - F-03: turnover origins in B.
   - F-02: hurling 65s move from Unattributed to Placed.
   - F-04: legacy owner-split possession families.
   - F-01, F-05 and F-06 changed no Intelligence output. The chain and possession engines read none of the translated tags (`INTERCEPT`, `SLACK_*`, `FOUL_*`, `BLOCK_SAVE`).

## Pre-existing Intelligence observations (not fixed, outside F-01 – F-06)

- **I-1: two-point scores valued at 1.** The possession-outcomes engine puts `TWO_POINTER` and `FORTY_FIVE_TWO_POINT` in `POINT_KINDS` (1 point each). As a result, `scoreValue` and `netOutcome` undervalue two-point scores. These feed the Intelligence card "net" badges and the turnover/free outcomes card. Score counts ("scored from N") are unaffected, and so is the core scoreline.
- **I-2: two "kickout → score" definitions.**
  - The possession engine stops at the first wide, shot or turnover.
  - The chain kickout dataset takes the next score before the next restart, within 60 s.
  - So the same idea yields different numbers on different pages. Legacy A: Intelligence Summary "9 of 27" vs Restart Chain "Won → Score (origin) 11".
  - Both match their own documented definitions. They are separate layers by design (`matchReport.ts`), but a coach sees two numbers.
- **I-3: different origin rules for restarts and turnovers.** The kickout forward scan does not end at a possession change (turnover); the turnover scan now does. The independent reference uses the same restart rule, so every restart-origin check passes, and the ledger resolves overlaps by nearer origin.
- The averages in F-11 ("Avg secs to score (won)") and the "Won → Shot" label in F-12 are also chain-layer figures. They remain open (see `REPAIR-VERIFICATION.md`).
