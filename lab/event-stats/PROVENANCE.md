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

## Reproducibility (`tools/reproduce.mjs`, 65/65)

- The reference calculators and the generator import only `node:` built-ins and each other.
- The generators reproduce `match-A`, `match-B.planned`, `match-C`, `match-D`, `match-E` and `match-F` byte for byte.
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

## Browser scripts: adaptations after recovery (Guardian V1 browser laboratory)

The recovered browser scripts were run against `main` (`79b8d92`) and adapted. No expected value,
fixture or ledger changed; every comparator change only re-maps where or how the app now draws a figure.

| File | Change | Why |
|---|---|---|
| `tools/recover-from-history.mjs`, `scripts/run-match.mjs`, `persistence/run-match-clearplayer.mjs` | App UI strings used as selectors (the venue placeholder "e.g. Croke Park") are no longer anonymised | the recovery had replaced the app's own placeholder text, so the venue field could not be found |
| `scripts/ui-driver.mjs`, `persistence/ui-driver.mjs` | Chromium from `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or Playwright's own install (no hard-coded path); the player picker is matched on the exact shirt number **and** the squad name; `PickerUnsupported` when the live picker does not offer the fixture's player | picker buttons now show the number twice; a same-numbered player of the other team must never pass silently |
| `scripts/run-match.mjs` | squads passed to the driver; opt-in `UNSUPPORTED_PLAYER=unknown` records an unsupported player and tags no player (match D only); Review targets are opened through "Events at this spot" by default (`USE_SPOT_LIST=0` disables) | match D lost-restart players (register BL-L1); the plan's "open from a list" — the Review screen has no full event list, the spot list is the list a coach uses |
| `scripts/run-match.mjs` (hardening) | every undo, pause and reload in a fixture now records a pass/fail lifecycle check (undone tap not stored — frozen count while storage is failing; paused clock does not move, read once paused; reload keeps every event and resumes the clock) | these steps were only logged; a run could not fail on them |
| `scripts/run-match.mjs` (offline) | `OFFLINE_SERVE_ROOT` offline mode (own preview server, install, server stopped, browser offline, negative control, Save & Finish) and `OFFLINE_PLAN` inserted close / reload steps; close and reload now also require the stored events to be byte-identical before and after | Checkpoint 2 offline reliability; the online runs keep their flow |
| `scripts/compare.mjs` (hardening) | sport-wording checks over every page of every distinct report, Quick Review panes and counts, and the Review screen; presentation checks also on reopened reports that Review edits changed | the earlier hurling terminology check read page 1 only and missed pages 2, 16, 20, 25 and 28 |
| `scripts/compare.mjs` | label/position re-mapping for the post-#403 layouts (value nearest a label, value below a column heading, value above a tile label); wording: singular/plural, "Own PO Retained" in hurling, "No placed balls" for 0/0, the placed-ball callout rule (scores and wides, each only when non-zero), "—" for an undefined average and for no scoring run of ≥2; drop-shadow text pairs are not overlaps | harness drift only — every adapted check still compares with the same ledger value |
| `scripts/run-edit-probe.mjs` | team names from the saved match; passes when the football-only 2-pointer is **not** offered for a hurling point | written for the historical defect; today's rule (`pro-tagger-review-edit`) |
| `persistence/probe-p0.mjs` | waits for any "Save failed — …" message | a quota error is now reported as "storage full" (`pro-tagger-storage.ts`) |
| `persistence/probe-final.mjs` | realistic matches from this lab's match B run; f3 observes the leave guard instead of assuming none | the recovered f3 hard-coded "no confirmation"; the app has since added "Leave match?" (f4) |
| `persistence/{quota,quota2,latency,savecost,probe-review}.mjs` | paths relative to the lab instead of a past session's scratch directory | no behaviour change; not part of the automated run |

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

## Golden Matches E (Ladies Football) and F (Camogie) — Guardian V1 Phase B, not historical

Built before any Ladies Football or Camogie repair, from the official rules only
(`rules/sport-rules.json`, every rule cited): E — LGFA Official Guide 2026 as amended by the motions
approved at Special Congress, 15 April 2026, senior adult club championship; F — Camogie Official
Guide 2025 standard playing rules. Expected results come only from `reference.mjs` and
`reference-kickout-phase.mjs`; ground truth (`truth`) is written by the generator from the scenario,
never by a calculator.

**Generator.** `scripts/gen-fixture-ef.mjs` reuses the seeded simulator of `gen-fixtures.mjs` (now
exporting `simulate`, `insertAt`, `squad`, `applySubsAndDiscipline`, `finalize`). A scenario hook in
`simulate()` (`cfg.scenarios`) plays each rule scenario at a possession boundary, so the possession
chain around it stays coherent; it draws nothing from the PRNG and A, B.planned and C regenerate
byte for byte. A scenario that is never played throws. Only cards are inserted by time.
The camogie flag also selects hurling's restart model (puck-outs) and a "45" end-line free.

| Match | Events | Rule scenarios | Discipline | Review |
|---|---|---|---|---|
| E | 140 taps (2 erroneous, undone), 137 final; FT Lab E Home 2-12 (18) v 0-24 (24) | fisted point beyond the arc (1); kick-out mark from the arc (2); 45 retouched by a team-mate (1); foul on the 45 → free from the arc (2); penalty goal; penalty point (1, never 2 — Rule 426); kick-out mark wide; solo-and-go from the arc (2); team-official misconduct free from the arc apex (2); 45 direct (2); 45 bouncing over (2); 13 m free point | OPP #4 Yellow 1H 10:00 and 2H 20:00 (sin bin, then dismissal); FOR #6 Yellow 1H 27:00, Yellow 2H 15:00, Red 2H 15:03 (one dismissal); OPP #12 direct Red 2H 25:00 | 6 edits, 1 delete; probes: penalty point → 2PT not offered, Yellow → Sin Bin not offered, turnover |
| F | 155 taps (2 erroneous), 152 final; FT Lab F Home 4-10 (22) v 0-20 (20) | sideline 2-pointer FOR 1H and OPP 2H (Rule 15.4); sideline touched in flight → 1 point; sideline wides FOR and OPP; 45 wide; penalty goal; 45 point | FOR #7 Yellow, Yellow + Red; OPP #6 Red; no sin bin | 6 edits, 1 delete; probes: point → no 2PT kinds, Yellow → no Sin Bin, 45 |

Lifecycle in both: 2 undos, pause, reload, tab close and reopen, 2 substitutions per team (limit 5).

**Never substituted.** An event the app does not offer (F: the five sideline events) is recorded as
not entered — engine path `blocked`, browser path `NOT_OFFERED=record` → `state/tag-results.json` —
and never replaced by another event. Its effect is classified by recomputing the same reference
without it (`excludeIds`): what then passes is downstream of the capture defect.

**Kickout-origin validation (`VALIDATION.json`).** Classified like A–C (none is an application defect):

| Ledger | Difference | Classification |
|---|---|---|
| E, E-live | E-014 (kickout) → E-017 (score) missed | the written definition's 90-second cap: the score comes more than 90 s after the kickout; the simulator's truth has no cap — reference definition, not a defect |
| F, F-live | F-095 → F-098 missed | same 90-second cap |
| E | E-078 → E-079 wrong; E-020 → E-022 and E-075 → E-077 missed | Review edits (E-079, E-022, E-077 changed by Review) — the validation's truth predates the edit, as B-025 → B-026 |

**Comparator / runner additions (no expected value changed).** `compare.mjs`: Ladies / Camogie
wording from the rules table; camogie "Sideline 2PT" Quick Review row, "Sideline 2-pointers" Match
Summary row (shown at zero too), Sideline source breakdown, "45" for camogie, Opposition Facts points
label; singular "1 score conceded" / "1 shot against" (the app's correct grammar — A–D never had
exactly one); capture alignment skips not-entered taps and counts them. `run-match.mjs`: the Review
restart filter chip is "P/O" in camogie as in hurling. `verify-events.mjs`: the camogie end-line
free stored under the app's internal code `65` is decoded as the 45-metre free (display wording is
checked separately).
