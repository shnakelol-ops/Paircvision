# Provenance

## Source

- Branch `claude/pairc-event-stats-audit-ca55sj`, commit `76c6139` (8 Nov 2026).
- Folders `audit/release-audit/` (the 7 Nov three-match release audit of `fc7beec`) and
  `audit/event-stats-red-repairs/` (Review Edit probe, persistence probes, kickout-origin definition).
- Recovered with `tools/recover-from-history.mjs` (allow-listed files only). Not recovered:
  PDFs, page images, screenshots, run captures, probe results, the `n1/render-*.mjs` scripts
  (they import `src/`), and `expected-history/pre-pr382/` (it belongs to the earlier
  red-repairs match set, not to these matches).

## The one change made on recovery: synthetic names

The historical fixtures used real club, venue and player names. Every one was replaced by a
synthetic label (`Lab A Home`, `Lab B Away`, `Synthetic Venue A`, `A Home 4`, …): 17 club/venue
names and 75 player names. Nothing else changed.

Verified:
- All 13 recovered JSON files (4 fixtures, 8 ledgers, `VALIDATION.json`) are identical to the
  historical files apart from team/venue/player name strings.
- The recovery tool refuses to finish if any original name survives.
- Mentions of "Ballylanders" and "Galbally" in `docs/KICKOUT-ORIGIN-DEFINITION.md` refer to the
  anonymised real-match fixture already committed in `src/stats/reporting/fixtures/`; its other
  examples (B-265, B-266) refer to the earlier red-repairs match set.

## Reproducibility (`tools/reproduce.mjs`, 31/31)

- The reference calculators and the generator import only `node:` built-ins and each other.
- The generator reproduces `match-A`, `match-B.planned` and `match-C` byte for byte.
- `match-B` (as run) equals the plan except two planned Review edits that were not performed
  (B-059 → Sin Bin, B-007 → Wide). Historical run log: "could not open target marker" — a
  browser-harness limitation. Today's Review Edit rules offer and accept both edits
  (engine report `extras.plannedButNotPerformed`). No statistical effect: `ledger-B` is computed
  from the as-run fixture.
- `reference.mjs` reproduces every `expected/` ledger, and `reference-kickout-phase.mjs`
  reproduces every `expected-authoritative/` ledger and `VALIDATION.json`, byte for byte, twice.

## Known kickout-origin validation differences (`expected-authoritative/VALIDATION.json`)

`VALIDATION.json` compares the ledgers' kickout-origin credits with possession roots rebuilt
from the simulator's ground truth. Three credits differ:

| Ledger | Credit | Evidence | Classification |
|---|---|---|---|
| A | A-118 (Lab A Away own kickout, won clean, 2H 1400 s) → A-X02 (Lab A Away penalty goal, 1403 s) | A-X02 is a scripted event (`gen-fixtures.mjs` "scripted extra events … penalties, marks, cards") inserted 3 s after the kickout with nothing between; its truth origin is `OTHER` because the generator does not model possession for scripted events. The written definition credits "every score in a possession that began with a kickout, including frees won during it". | **Reference or fixture defect** — specifically the simulator's ground-truth label for scripted events. The credit itself follows the definition. |
| C | C-135 (Lab C Home wins Lab C Away's puckout, 2H 1198 s) → C-X01 (Lab C Home penalty goal, 1222 s) | Same pattern: scripted penalty goal, truth origin `OTHER`, no change of possession recorded in between. | **Reference or fixture defect** (same cause as A). |
| B | B-025 (Lab B Away own kickout, 1H 301 s) → B-026 | B-026 was captured as a blocked shot whose truth origin is RESTART B-025, then a Review edit made it a point. `VALIDATION.json` compares the post-edit ledger with pre-edit simulator truth (no score existed there before the edit). | **Reference or fixture defect** — the validation's truth predates the Review edit. The credit follows the definition. |

The current production engine agrees with all three credits: the engine path matches the
ledgers' RESTART origin counts and values in every match, half and team. None of the three is an
application defect. They remain documented here and in `VALIDATION.json`, unchanged.

## Match D (added for Guardian V1 engine completion — not historical)

Hand-scripted by `scripts/gen-fixture-d.mjs` (node built-ins only, deterministic) to close three
coverage gaps in A–C. Ground truth (`truth`) is written by hand from the scenario, never from a
calculator. Expected results come only from `reference.mjs` and `reference-kickout-phase.mjs`.

| Gap | Events | Expected (reference) | Check against the written definitions |
|---|---|---|---|
| Player on a lost restart | D-005: home puckout lost, home #1 tagged; D-029: away puckout lost, away #1 tagged. The live picker shows the winner's squad; these represent legacy events (no `squadId`) corrected in Review, whose roster falls back to the restart owner. | home #1 and away #1: restarts lost 1 | `playerTable`: a restart counts as lost for a player whose team is not the winner. |
| Unattributed score | D-032: first event of the 2nd half, a blocked home shot with no restart or turnover before it; Review-edited to a point. | ledger-D: UNATTRIBUTED home 1 score, 1 point; ledger-D-live: 0 | `applyReviewOp`: a former shot keeps no source; `attributeOrigins`: no source and no chain origin → UNATTRIBUTED. |
| Hurling restart net disadvantage | Home win 8 puckouts and score from none; lose 9, the away team scores from 6. | restart won → score 0/8 (0%); restart lost → opposition score 6/9 (67%) | Hand count of the script; the gap (−67 points) produces the only intelligence sentence that uses the singular restart term. |

Other hand-checked figures: FT Lab D Home 0-02 (2) v 2-07 (13) Lab D Away; HT 0-00 v 1-05;
restart methods won 6 clean / 1 break / 1 foul, lost 7 clean / 2 break.

The one change to a recovered script: `scripts/reference-kickout-phase.mjs` `TARGETS` gained
`["D", "ledger-D"], ["D", "ledger-D-live"]`. Its computation is unchanged; ledgers A, B, B-live, C
and their `VALIDATION.json` entries regenerate byte for byte. `VALIDATION.json` for D: 6 credited,
6 correct, 0 wrong, 0 missed against the hand-written ground truth.
