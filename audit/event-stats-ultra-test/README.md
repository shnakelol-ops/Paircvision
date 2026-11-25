# Event Stats Ultra Test — audit pack

Test-only audit of PáircVision **Event Stats** (`/pro-tagger`) at commit `a2384fd`. No production code was changed, no saved matches were touched and nothing was deployed.

**Verdict: 🔴 RED.** See [`DISCREPANCY-REPORT.md`](DISCREPANCY-REPORT.md).

## Contents

| Path | What it is |
|---|---|
| `SYSTEM-AUDIT.md` | Phase 1: schema, events, report surfaces, relationships, hurling, unsupported stats |
| `DISCREPANCY-REPORT.md` | Verdict, coverage, findings F-01…F-15 (IDs, expected/actual, root cause, file/function, repro, severity, fix), Phase 6 regression table |
| `results/COMPARISON-TABLE.md` | Statistic \| Expected \| Quick Review \| Snapshot PDF \| Full Review PDF \| Pass/Fail, per match |
| `results/checks-{A,B,C}.md` / `.csv` | Every automated check (2,186 in total) |
| `results/compare-*.json` | Raw comparison output, incl. capture mismatches and presentation scan |
| `results/diag-turnovers-*.json` | F-03 root-cause diagnostic (production engine vs reference, per turnover) |
| `results/edit-probe-hurling.json` | F-08 evidence (Edit dropdown + effect on a hurling score) |
| `fixtures/match-{A,B,C}.json` | Three deterministic match scripts (UI taps + lifecycle ops + truth) |
| `expected/ledger-*.json` | Independent expected results, with a `definition` (denominator) on every percentage. `ledger-B-live.json` = Match B before review edits |
| `pdfs/` | The real PDFs the app downloaded. `MANIFEST.json` = SHA-256 of all 24 generated PDFs |
| `pdf-images/` | Every page of the committed PDFs, rendered from the PDF files with poppler (JPEG) |
| `runs/{A,B,C}/pdf-text/` | Text the app drew on each PDF page (the PDFs are rasterised and have no text layer) |
| `runs/*/pdf-text-readable/` | Same, one line per text item |
| `runs/*/state/` | localStorage snapshots (HT, FT, reloads, before/after review ops, final), Quick Review captures, owner-toggle checks, run logs |
| `runs/*/screens/` | UI screenshots (setup, squads, HT, FT, Quick Review pages, review edits) |
| `runs/A-legacy/` | Historical-format import test (F-04) |
| `scripts/` | Everything needed to reproduce (below) |

## The three matches

| | Match A | Match B | Match C |
|---|---|---|---|
| Sport | Football | Football (stress) | Hurling |
| Teams | Ballyboden v Na Fianna | Kilmacud Crokes v St Brigid's | Ballyhale Shamrocks v Na Piarsaigh |
| Events | 152 | 313 taps → 308 after 5 undone mistakes → 306 after review deletes | 176 |
| HT | 1-08 (11) v 0-12 (12) | 1-06 (9) v 1-11 (14) | 0-09 (9) v 0-10 (10) |
| FT | 1-16 (19) v 3-25 (34) | 2-22 (28) v 2-34 (40), then 2-23 (29) v 2-34 (40) after review edits | 1-19 (22) v 2-21 (27) |

Per-match content:

- **Match A**
  - Scoring: 1- and 2-point scores, a 45 converted for 2, a Mark, a Penalty goal.
  - Shots: Short / Block-Save outcomes.
  - Restarts: kickouts with Clean / Break / Foul; 45s.
  - Turnovers: all 5 methods each way.
  - Other: sidelines, frees, Yellow + Sin Bin.
  - Players: named squads.
- **Match B**
  - Unknown players on 81 of 308 events (26%), including 29 of 76 kickouts (38%).
  - 5 live corrections: wrong team ×2, wrong owner ×2, wrong family ×1.
  - 3 pauses and 3 reloads (1H, HT break, 2H).
  - Rapid 4–15 s tagging.
  - 4 review edits and 2 deletes.
  - Discipline including a Red.
  - Away squad unnamed (number-only).
- **Match C**
  - Puckouts, 65s, frees, wides, Short / Block-Save / Post.
  - Penalty goal; Yellow → Red.
  - Away squad unnamed.

## Reproduce

Requirements: Node 22, Chromium (the scripts use `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`; edit `CHROME` in `scripts/ui-driver.mjs` for other machines), Playwright 1.6x, poppler (`pdftoppm`), Python 3 + Pillow.

1. **App.** The committed `node_modules/` is a Windows install. Use a clean copy of the commit:
   ```bash
   git archive a2384fd | tar -x -C /tmp/app && cd /tmp/app && npm ci
   npx vite --port 5199 --strictPort
   ```
2. **Fixtures and reference** (no `src/` imports):
   ```bash
   node scripts/gen-fixtures.mjs fixtures
   for m in A B C; do node scripts/reference.mjs fixtures/match-$m.json expected/ledger-$m.json; done
   ```
3. **Drive the real app** (≈2.5 min for A or C, ≈5 min for B):
   ```bash
   for m in A B C; do node scripts/run-match.mjs fixtures/match-$m.json runs/$m; done
   node scripts/run-legacy-import.mjs runs/A/state/final.json runs/A-legacy
   node scripts/run-edit-probe.mjs runs/C/state/final.json results
   ```
4. **Compare and report:**
   ```bash
   for m in A B C; do node scripts/compare.mjs $m; node scripts/dump-pdf-text.mjs runs/$m; ./scripts/render-pdfs.sh runs/$m; done
   node scripts/report-tables.mjs
   python3 scripts/package-artifacts.py .
   ```
5. **F-03 diagnostic:** see the header of `scripts/diagnostics/turnover-diag.test.ts`.

Scripts that use Playwright resolve it from a `node_modules` next to the audit directory. In this run that was a symlink to the global install; it is git-ignored.

## Independence and honesty rules followed

- The reference calculator (`scripts/reference.mjs`) imports nothing from `src/`. It derives every statistic from the fixture's facts, not from stored kinds or `teamSide`.
- Expected values were **never** changed to match production output. One reference *rule* was corrected during the audit, where production had been right and the reference over-counted (documented in `DISCREPANCY-REPORT.md` §5). Comparator extraction bugs were fixed so that the right cell was read; each fix is in `scripts/compare.mjs`.
- Values the reference cannot define (Player Contributions "NET BALL", chain-rule match counts, narrative timeline sentences) are reported as UNVERIFIED with their raw value, never as PASS.
- Baseline before testing: the repo's own suite was 2,848 / 2,849 passing. One Rapid Capture test times out under full-suite load and passes on its own; it is unrelated to Event Stats.
