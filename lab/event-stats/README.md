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
| `expected-authoritative/` | **The expected results** (authoritative kickout-origin definition) + `VALIDATION.json`. |
| `expected/` | The same ledgers under the previous restart rule — kept because `reference-kickout-phase.mjs` must reproduce them before it recomputes. |
| `docs/KICKOUT-ORIGIN-DEFINITION.md` | The written kickout-origin definition the reference implements. |
| `engine/` | **Engine path**: feeds each match into the current production engine the way the live screen does and compares with the ledgers. `classifications.json` records why any mismatch exists. |
| `tools/reproduce.mjs` | Independence + reproducibility check (no `src/`). |
| `tools/recover-from-history.mjs` | The one-off recovery from branch `claude/pairc-event-stats-audit-ca55sj` @ `76c6139` (see `PROVENANCE.md`). |
| `scripts/` (other), `persistence/` | Browser path (real UI in Chromium) — recovered, **not yet restored**; see `docs/BROWSER-READINESS.md`. |

## Run (repo root, after `npm ci`)

```bash
node lab/event-stats/tools/reproduce.mjs                                   # independence + reproducibility
npx vitest run --config lab/event-stats/engine/vitest.lab.config.ts        # engine path → lab/event-stats/out/
```

The engine path writes `out/engine-report.{json,md}` and fails if any mismatch is unclassified or
classified as an application defect or unresolved.

## Rules

- Expected results come only from the reference calculators — never from the app's output.
- An expected value, fixture or classification is never edited to make a run pass. Any approved
  correction is a separate, documented and independently justified change. These files are
  protected by the CI test-integrity guard (`.github/protected-expectations.txt`), so a change is
  listed under REVIEW REQUIRED — which is a request for human review, **not** an approval.
- Synthetic data only. Team, venue and player names are synthetic labels.
