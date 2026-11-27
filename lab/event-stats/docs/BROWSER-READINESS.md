> **Historical (superseded).** Written before the browser path was restored; kept as the record of
> the plan. Current state: `BROWSER-LAB.md`.

# Browser path — readiness (not yet restored)

The recovered browser scripts (`scripts/run-match.mjs`, `ui-driver.mjs`, `verify-events.mjs`,
`compare.mjs`, `compare-legacy.mjs`, `run-legacy-import.mjs`, `run-edit-probe.mjs`,
`dump-pdf-text.mjs`, `persistence/*.mjs`) are committed as recovered and have **not been run**
against current `main`.

| Area | Finding | Work needed |
|---|---|---|
| Playwright | Scripts `import "playwright"`; it is not a repo dependency (historically a symlink to a global install). | Add `@playwright/test` (or `playwright`) as a dev dependency — needs approval. |
| Chromium | `ui-driver.mjs` hard-codes `/opt/pw-browsers/chromium-1243/...` (present in Claude's cloud container; not on GitHub runners). | Make the path optional (Playwright's bundled Chromium in CI). |
| Server | Expects `vite` on `http://localhost:5199`. | `npx vite --port 5199 --strictPort` before a run, or `vite preview` of a build. |
| UI selectors | All 25 strings the driver depends on still exist in `src/` (static check: "Pitch - tap to place event", "No player / Unknown", "OUR K/O"/"OUR P/O" via `getRestartOwnerLabel`, turnover row labels, "e.g. Kilkenny" / "e.g. Tipperary" placeholders, Half Time, Start Second Half, Finish Match, Leave match?, Change not saved, …). Text selectors are brittle. | Run once and fix drift; consider `data-testid` on Event Stats controls later (an app change — separate approval). |
| Review markers | The 7 Nov run could not open two Review map markers (B-059, B-007) and one probe target (B-008). | Open events from the Review list rather than by map position. |
| PDF text | `compare.mjs` reads figures by label and position in the drawn PDF text. PRs #390–#403 changed wording and layout (hurling wording, Shot Profile, phone-readability pages). | Expect harness drift on PDF checks; re-map labels, never expected values. |
| Persistence | Probes target immediate write, storage-full, leave guard, reload/close. Current code still has these paths (`pro-tagger-live-persistence.ts`, `saveFailureText`, "Leave match?"). | Re-run; confirm messages and storage keys. |
| Time / CI | Historical runs: ~2.5 min each for A and C, ~5 min for B, plus PDF rendering. | ~10–15 min per full run; a separate weekly / on-demand CI job (needs approval). |

Estimate to restore: 1.5–3 days, dominated by PDF comparison drift.
