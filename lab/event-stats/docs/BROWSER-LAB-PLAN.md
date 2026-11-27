> **Historical (superseded).** Written before the browser path was restored; kept as the record of
> the plan. Current state: `BROWSER-LAB.md`.

# Browser laboratory — implementation plan (not started)

Playwright is approved in principle as a development-only dependency. Nothing in this plan is
implemented yet; it is the scope of the next PR. Findings behind it: `BROWSER-READINESS.md`.

## 1. Dependencies and Chromium
- Add `@playwright/test` as a **devDependency** with an exact version; commit the `package-lock.json`
  change. It is never imported by `src/`, so the production bundle cannot change — verified by the
  usual byte-for-byte build comparison.
- Install the browser reproducibly in CI with `npx playwright install --with-deps chromium`
  (version pinned by the lockfile). Locally: the same command, or an existing install via
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Remove the hard-coded `/opt/pw-browsers/...` path from
  `ui-driver.mjs` (fallback only).

## 2. Isolation and data
- One fresh browser context per match run (`browser.newContext()`), so `localStorage`, IndexedDB and
  the service worker start empty and are discarded afterwards. No persistent profile, no
  production URL: the app is served from the PR's own build (`vite preview` on `localhost`).
- Synthetic data only: matches A, B, C (and any later approved fixtures). The service worker is
  allowed to register so offline behaviour is part of the test.

## 3. What a run does
1. **Capture** each fixture through the real Event Stats UI (`ui-driver.mjs`: family tile, owner
   toggle, player picker, pitch tap) with Playwright's fake clock.
2. **Persistence**: read `localStorage` after every event batch and compare stored events with the
   fixture (`verify-events.mjs`); immediate-write check after single events.
3. **Lifecycle**: half time, second half, full time, save, reopen from Saved Matches; reload mid-half;
   close the context mid-half and reopen in a new page on the same context (B).
4. **Storage exhaustion**: make `localStorage.setItem` throw `QuotaExceededError` for a set of
   events (B), check the save-failure strip, the leave guard and recovery once writes succeed
   (`persistence/quota*.mjs`).
5. **Review Edit**: open events from the **Review event list** (not by map position — the cause of
   the three misses on 7 Nov), apply the fixture's edits, deletes and probes; then reopen.
6. **Legacy import** of a stored match (`run-legacy-import.mjs`).
7. **PDFs**: export HT Snapshot, FT Snapshot and Full Review. Capture the text the app draws
   (`fillText` hook, as before) and compare figures with the same independent ledgers the engine
   path uses (`compare.mjs`, labels re-mapped for the post-#390 layouts — never expected values).
8. **Visual**: render each downloaded PDF page to PNG (pdf.js in the page, no system poppler
   dependency) and check page count, non-blank pages and that drawn text stays inside the page;
   pixel baselines deferred.

## 4. Reporting and failure rules
- Same report model as the engine path: per match, per surface, expected vs actual, classification,
  evidence paths (screenshots, PDFs, stored-state JSON uploaded as a CI artifact — needs a pinned
  `actions/upload-artifact`).
- A missing step, skipped test, crashed browser or missing artefact fails the run; no retries.

## 5. CI strategy
- Separate workflow job **Event Stats laboratory (browser)**, not on every PR at first:
  `workflow_dispatch`, weekly schedule, and PRs that touch `src/pro-tagger/**`, `src/stats/**`,
  `src/core/stats/**` or `lab/event-stats/**` (path filter).
- Expected time: ~10–15 min (A and C ≈ 2.5 min each, B ≈ 5 min, PDFs ≈ 2–3 min); one runner;
  $0 on a public repo. Make it a required check only after two weeks of stable runs.

## 6. Estimate
1.5–3 days, dominated by PDF label drift and Review-list selectors. Stop and report if the UI cannot
be driven without app changes (e.g. `data-testid`), which would need separate approval.
