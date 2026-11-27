# Guardian V1 — Event Stats laboratory

Developer-side engineering infrastructure that independently checks whether PáircVision's
Event Stats statistics are correct. **Not part of the app.** Nothing under `lab/` is imported by
`src/`, built by Vite, precached by the service worker or served to users; it adds no runtime,
storage, download or processing cost for coaches.

## What is here

| Path | What it is |
|---|---|
| `scripts/reference.mjs`, `scripts/reference-kickout-phase.mjs` | **Independent** reference calculators. Import only `node:` built-ins (and each other); never `src/`. |
| `scripts/gen-fixtures.mjs` | Seeded generator of the three synthetic matches (seeds 20261107–09). |
| `fixtures/match-{A,B,C}.json` | Synthetic matches: A football (60 min), B football stress (undo, reloads, storage failure, tab close, Review edits), C hurling. `match-B.planned.json` is the generator's plan; `match-B.json` is as run. |
| `fixtures/match-D.json`, `scripts/gen-fixture-d.mjs` | Hand-scripted hurling match D (48 events) closing three coverage gaps: a player on a lost restart, an unattributed score, a restart net-disadvantage sentence. See `PROVENANCE.md`. |
| `expected-authoritative/` | **The expected results** (authoritative kickout-origin definition) + `VALIDATION.json`. |
| `expected/` | The same ledgers under the previous restart rule — kept because `reference-kickout-phase.mjs` must reproduce them before it recomputes. |
| `docs/KICKOUT-ORIGIN-DEFINITION.md` | The written kickout-origin definition the reference implements. |
| `engine/` | **Engine path**: feeds each match into the current production engine the way the live screen does and compares with the ledgers. `classifications.json` records why any mismatch exists. |
| `tools/reproduce.mjs` | Independence + reproducibility check (no `src/`). |
| `tools/recover-from-history.mjs` | The one-off recovery from branch `claude/pairc-event-stats-audit-ca55sj` @ `76c6139` (see `PROVENANCE.md`). |
| `scripts/` (other), `persistence/`, `browser/`, `tools/run-browser-lab.mjs` | **Browser path**: the real Event Stats UI in Chromium (Playwright) — capture, stored events, persistence, Review edits, PDFs — vs the same ledgers. `browser/known-findings.json` registers every accepted non-pass. See `docs/BROWSER-LAB.md`. |

## Run (repo root, after `npm ci`)

```bash
node lab/event-stats/tools/reproduce.mjs                                   # independence + reproducibility
node lab/event-stats/tools/check-lab-types.mjs                             # lab TypeScript (app settings)
npx vitest run --config lab/event-stats/engine/vitest.lab.config.ts        # engine path → lab/event-stats/out/
```

The engine path writes `out/engine-report.{json,md}` and fails if any mismatch is unclassified or
classified as an application defect or unresolved. In CI the same steps run as the
**Event Stats laboratory (engine)** check on every PR and push to `main`, followed by
`tools/verify-lab-run.mjs`, which fails if the lab did not run completely (missing or stale
report, a lab test skipped or not run, fewer checks than `engine/coverage-minimum.json`, a match
or ledger missing) and writes the per-match result to the job summary.

## What the engine path verifies (per match A, B and D before and after Review edits, C)

- Team totals for FULL / 1H / 2H, both teams: score, goals, 2-pointers, scores/attempts, shooting %,
  wides, short / post / blocked shots, own restarts retained / lost, restart share, turnovers,
  frees, placed balls, 45s / 65s.
- Kickout / puckout methods (clean, break, foul — won and lost); cards (yellow, sin bin, red).
- Score origins (ledger rows) and possession origins (restart / turnover) of each team's scores.
- Restart and turnover chain metrics (→ score, → opposition score, attempt-no-score, average
  seconds to score) and the longest scoring run.
- Live screen counts strip, including sidelines and cards.
- Full Review player table: per player actions, goals, points value, total value, attempts,
  wides, turnovers won / lost, restarts won / lost, frees won / conceded.
- Review edits and Review "not offered" probes; intelligence wording rules (every prompt names a
  team and states a number; no kickout / 2-pointer wording for hurling; the restart net-disadvantage
  sentence is produced wherever the reference shows a gap of more than 10 points).
- Every difference recorded in `VALIDATION.json` has an entry in `engine/classifications.json`.

Not verifiable on this path: per-player cards (the app keeps a live sin-bin / red status, not a
per-player card count), anything needing the browser (persistence, reloads, storage failure,
substitutions, PDFs themselves) — those are the browser path's job.

## Browser path

`node lab/event-stats/tools/run-browser-lab.mjs` against a served production build (including an
offline run of match A from the service worker); in CI the
**Event Stats laboratory (browser)** check (`.github/workflows/browser-lab.yml`: weekly, on demand,
and on PRs and pushes that touch Event Stats). What it checks, the failure rules and the register:
`docs/BROWSER-LAB.md`.

## Rules

- Expected results come only from the reference calculators — never from the app's output.
- An expected value, fixture or classification is never edited to make a run pass. Any approved
  correction is a separate, documented and independently justified change. These files are
  protected by the CI test-integrity guard (`.github/protected-expectations.txt`), so a change is
  listed under REVIEW REQUIRED — which is a request for human review, **not** an approval.
- Synthetic data only. Team, venue and player names are synthetic labels.
