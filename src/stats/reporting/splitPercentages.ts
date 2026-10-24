/**
 * splitPercentages.ts
 *
 * Whole-number percentages for an exhaustive partition — e.g. the two teams'
 * shares of the same restarts, or of the same origin scores — that always
 * sum to exactly 100.
 *
 * Rounding each share on its own can print 13% + 88% = 101% (12.5 / 87.5).
 * Method:
 *   1. Round every share exactly as each standalone percentage in the report
 *      is rounded — Math.round((count / total) * 100) — so a part that needs
 *      no correction prints the same figure as everywhere else.
 *   2. If those sum to more than 100, take 1 from the part rounded up the
 *      most; if less, add 1 to the part rounded down the most; repeat until
 *      the total is 100. Ties (within floating-point noise) are settled so
 *      earlier parts keep their standalone value: decrements go to the later
 *      part, increments to the earlier one. The result is deterministic, and
 *      for two parts the first part always equals its standalone figure.
 *
 * Counts are the raw values; they are never changed. Negative or non-finite
 * counts are treated as 0. Returns null when there is nothing to divide (all
 * zero), so callers can show "—" instead of a fabricated 0% / 0% or 50 / 50.
 */
const EPS = 1e-9;

export function splitPercentages(counts: readonly number[]): number[] | null {
  const values = counts.map((c) => (Number.isFinite(c) && c > 0 ? c : 0));
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const shares = values.map((v) => (v / total) * 100);
  const result = shares.map((x) => Math.round(x));
  let diff = result.reduce((s, x) => s + x, 0) - 100;

  while (diff !== 0) {
    let pick = -1;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < result.length; i++) {
      if (diff > 0) {
        if (result[i] <= 0) continue;
        const err = result[i] - shares[i];            // how far it was rounded up
        if (err > best + EPS || (Math.abs(err - best) <= EPS && i > pick)) { best = err; pick = i; }
      } else {
        const err = shares[i] - result[i];            // how far it was rounded down
        if (err > best + EPS) { best = err; pick = i; }
      }
    }
    if (pick < 0) break;
    result[pick] += diff > 0 ? -1 : 1;
    diff += diff > 0 ? -1 : 1;
  }
  return result;
}
