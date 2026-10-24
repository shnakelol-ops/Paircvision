# expected-authoritative/

These are the expected results under the **authoritative kickout-origin definition** (`../KICKOUT-ORIGIN-DEFINITION.md`). They are supplementary, not a replacement.

- **`../expected/` is unchanged.** It is byte-identical to the audit commit `a8581a5` and still encodes the previous restart rule. Every PR #374 comparison uses it.
- **How these files were generated:** `../scripts/reference-kickout-phase.mjs`. It imports the unchanged `reference.mjs` (no `src/` code), first checks that `reference.mjs` still reproduces `../expected/` exactly, and then recomputes **only** the fields that depend on the kickout-origin rule:
  - `chains.{FOR,OPP}.restart*`, `avgSecsToScoreWon` and `origins`;
  - `origins` (the ledger partition);
  - `possession.restartWon` / `restartLost`.

  Every other field is copied unchanged.
- **Validation:** `VALIDATION.json` compares the credited kickout-origin scores with possession roots rebuilt from the simulator's ground truth:
  - **A, B live and C:** 0 wrong.
  - **A:** 1 miss, a scripted fixture artifact (A-130).
  - **B after review edits:** 1 credit is explained by review edit B-266 (a wide edited to a score). The simulator truth predates the edit.
- **Use:** `EXPECTED_DIR=expected-authoritative RESULTS_SUFFIX=-intel-vs-authoritative node scripts/compare.mjs <A|B|C>`
