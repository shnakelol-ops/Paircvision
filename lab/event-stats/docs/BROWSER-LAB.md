# Browser laboratory

Drives the **real Event Stats UI** of the production build in Chromium (Playwright) with the
synthetic matches and compares what the app stores, shows and exports with the independent
expected ledgers. Developer-side only: nothing here is imported by `src/`, built, cached or served.

## Run

```bash
npm ci
npx playwright install chromium                     # or PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium binary>
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 5199 --strictPort &
node lab/event-stats/tools/run-browser-lab.mjs      # --matches A,C  --no-persistence  --summary <file>
```

Output (gitignored): `out/browser-report.{json,md}`, `results/`, `runs/<match>/{pdf,pdf-text,state,screens}`,
`persistence/results/`. About 12 minutes locally (match B, the stress match, takes about half).

## What a run checks

| Area | How | Fails on |
|---|---|---|
| Capture (A, B, C, D) | `scripts/run-match.mjs`: every fixture event entered as a coach would (family tile, owner toggle, player picker, pitch tap), Playwright fake clock, fresh browser profile per match | any step that cannot be done; a player the picker does not offer (except register entry BL-L1) |
| Stored events | `scripts/verify-events.mjs`: `localStorage` at HT, FT and after Review/reopen vs the fixture — kind, team, half, clock second, player, position, tags | any missing, extra or altered event or field |
| Lifecycle (B) | reloads mid-half, tab closed and reopened, storage writes failing then recovering (failure strip, leave guard, recovery), substitutions | any check not passing |
| Review Edit (A–D) | Review → Event Map → marker → (Events at this spot) → Edit/Delete; probes that a type is not offered or is refused | a target that cannot be opened, a probe that fails, an edit not applied |
| UI and PDF figures | `scripts/compare.mjs`: Quick Review panes and the text the app draws on every HT Snapshot, FT Snapshot and Full Review page (live and reopened) vs `expected-authoritative/` | any FAIL or MISSING not in the register |
| PDF presentation (automated) | drawn-text boxes: text off the page edge, overlapping text, internal enum names, `undefined/NaN/null`, page-header team names, kickout/puckout terminology, two-way splits totalling 100% | as above |
| PDF files | present, `%PDF-` header and `%%EOF` trailer, ≥ 1 KB, page count = `browser/expected-pdf-pages.json` = pages the app drew, no page with fewer than 5 drawn text items | any problem |
| Persistence | `persistence/probe-p0.mjs` (T1–T10: kill after event/undo/HT/FT, rapid taps, background, reload), `probe-sp.mjs` (21st match, unreadable stores, malformed record, storage full), `probe-final.mjs` (save/finish with a failing archive copy, storage full → backup → delete → recovery, leave guard) | any scenario not meeting its pass rule in `tools/run-browser-lab.mjs` |
| Constructed tests | legacy-format import of match A through Options → Import (`run-legacy-import.mjs`, `compare-legacy.mjs`); hurling Review Edit on a copy of match C (`run-edit-probe.mjs`) | any check not passing |

Constructed tests are kept apart from capture: they are the only places a match is loaded into
storage rather than entered through the UI.

## Results, classification and the register

`browser/known-findings.json` lists every accepted reason a result may not pass:

- **app-finding** — a genuine application defect, with location and evidence. It still **fails the
  run** until it is fixed or the product owner records `ownerAccepted: true`.
- **live-not-supported** — a fixture scenario the live UI does not offer by design (match D's lost-restart
  players). The engine path covers it.

A non-passing result that matches no entry fails as **UNCLASSIFIED**; an entry that matches nothing
in a run fails as **STALE** (remove it once the defect is fixed). Expected values are never edited to
make a run pass: comparator changes only re-map where the app now draws a figure or how it words it,
and every such change is listed in `PROVENANCE.md`. The register, the comparators, the page counts
and the pass rules are protected by the test-integrity guard.

## Visual checks that need a person

Automated: everything in the table above. Not automated (pixel content is not compared): colours,
chart and pitch drawings, marker placement, crests, legibility on a phone. The CI artifact holds every
PDF; review at least the first page of each report type and the Shot Profile, Restart Battle and
Player Breakdown pages when a PR changes `src/stats/reviewPdfExport.ts` or the snapshot renderers.

## CI

Workflow `.github/workflows/browser-lab.yml`, job **Event Stats laboratory (browser)**:

- weekly (Monday 02:41 UTC) and on demand (`workflow_dispatch`);
- every PR to `main` and push to `main`: the first step checks the changed paths and runs the full
  laboratory only for `src/pro-tagger/`, `src/stats/`, `src/core/stats/`, `lab/event-stats/`,
  `package.json`, `package-lock.json`, `vite.config.*`, `index.html`, `public/` or the workflow itself.
  Otherwise it passes in seconds with a notice, so the check always reports.
- The fast engine laboratory stays in `ci.yml` on every PR.
- Report and PDFs are uploaded as the artifact `event-stats-browser-lab-<run id>` (14 days).

### Making it mandatory for Event Stats changes (proposal — owner decision)

1. Let it run for two weeks (weekly + dispatch + Event Stats PRs) and confirm it is stable: no
   UNCLASSIFIED results that turn out to be harness timing, run time well under the 45-minute limit.
2. Resolve or explicitly accept the open app findings (BL-F1 to BL-F3) so `main` is green.
3. Add **Event Stats laboratory (browser)** to the `protect-main` ruleset's required status checks
   (same integration as the four existing checks). Because the job always reports — and passes
   quickly when no Event Stats path changed — it does not block unrelated PRs.
4. Keep "Require branches to be up to date" so the check is judged on the merge result.

## Limitations

- Match D's two lost-restart players (D-005, D-029) cannot be entered live; the run tags them with
  no player and the register records the expected differences (engine path covers them).
- The browser lab checks one browser engine (Chromium) and one viewport (430 × 932); no WebKit or
  real-device run.
- PDF pages are JPEG images; figures are read from the text the app draws, not from the pixels.
- Service-worker offline behaviour is not exercised beyond what the build registers by itself.
- `persistence/quota*.mjs`, `latency.mjs`, `savecost.mjs`, `probe-review.mjs`, `probe.mjs` and
  `run-match-clearplayer.mjs` are recovered measurement and historical probe scripts; they are not
  part of the automated run.
