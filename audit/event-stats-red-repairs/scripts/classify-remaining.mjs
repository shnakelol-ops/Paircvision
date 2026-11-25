// classify-remaining.mjs — classifies every FAIL / MISSING check left after the
// F-01 – F-06 repairs into one category, with the evidence for that call.
//
//   STATISTICAL   a printed number is wrong for what its label says
//   PRESENTATION  wording, terminology or layout; the numbers are right
//   UNSUPPORTED   the report has no support for something the capture or the
//                 sport has (the row prints a placeholder such as 0, or is absent)
//   HARNESS       the check itself is wrong, disputed or double-counts a defect
//
// Layout checks are split item by item: the overlap / off-page detector does
// not model canvas text halos or fillText maxWidth, so those items are
// reported as harness false positives while the real items keep the check
// failing. Nothing in expected/ is read for classification or changed.
//   node classify-remaining.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
// optional: <resultsSuffix> <outDir>, e.g. "-intel-vs-authoritative" "results/intelligence"
const SUFFIX = process.argv[2] ?? "";
const OUT = process.argv[3] ?? "results";
const pdfTextFor = { "PDF HT Snapshot": "HT-snapshot-live", "PDF FT Snapshot": "FT-snapshot-live", "PDF Full Review": "FullReview-live" };

function rule(c) {
  const s = c.stat;
  if (/raw enum label 'TWO_POINTER'/.test(s))
    return ["PRESENTATION", "F-12", "Raw enum \"TWO_POINTER Scores\" printed as a row label; the counts beside it are correct."];
  if (/internal enum names shown/.test(s))
    return ["HARNESS", "F-12", "Same two \"TWO_POINTER Scores\" strings already failed by the 'raw enum label' check on this PDF — one defect counted twice."];
  if (/^(45|65 \(row\))$/.test(s))
    return ["UNSUPPORTED", "F-10", "Event Stats records 45/65 won as its own family; no PDF reads that family, so the shot-detail row (a Match Stats 'shot went out for a 45' tag) always prints 0. The 0 misstates the match."];
  if (/Avg secs to score/.test(s))
    return ["STATISTICAL", "F-11", "Average is taken over restart-origin scores of BOTH teams but printed in our team's 'won' panel (PDF-local calculation over the chain kickout dataset)."];
  if (/Won → Shot \(label\)/.test(s))
    return ["PRESENTATION", "F-12", "Value is a correct 'shot, no score' count (matches Turnover Chain 'Shot / wide, no score'); the label says 'Won → Shot'. Misleading label, not a miscalculation."];
  if (/Sin Bins row absent/.test(s))
    return ["HARNESS", "F-07", "Disputed expectation: the reference assumes hurling has no sin-bin sanction, but hurling rules provide a 10-minute sin bin for a cynical foul that denies a goal-scoring chance. Owner to confirm before this is treated as a defect."];
  if (/2-POINT PROFILE absent/.test(s))
    return ["UNSUPPORTED", "F-07", "Football-only 2-point block rendered on a hurling page (all values 0). No sport-specific handling."];
  if (/terminology|'kickout'|KICKOUTS|kickout words/i.test(s) || /says '65'/.test(s))
    return ["PRESENTATION", "F-07", "Football wording in a hurling report (Kickout / 45 instead of Puckout / 65); values correct."];
  if (/source 65/.test(s))
    return ["UNSUPPORTED", "F-07 / F-10", "No '65' source row on the hurling efficiency table; 65 attempts are counted (F-02) but shown under the '45' row."];
  if (/overlapping text boxes/.test(s))
    return ["PRESENTATION", "F-13", null];
  if (/running off the page/.test(s))
    return ["PRESENTATION", "F-13", null];
  return ["UNCLASSIFIED", "?", ""];
}

function splitLayout(c, id) {
  const items = typeof c.note === "string" ? JSON.parse(c.note) : c.note ?? [];
  const pagesFile = pdfTextFor[c.surface] ? `${root}/runs/${id}/pdf-text/${id}-${pdfTextFor[c.surface]}.json` : null;
  const pages = pagesFile ? JSON.parse(readFileSync(pagesFile, "utf8")).pages : [];
  const real = {}, fp = {};
  const add = (m, k) => (m[k] = (m[k] ?? 0) + 1);
  for (const o of items) {
    if (o.a !== undefined) {
      if (/PáircVision/.test(o.a) && /STATISTICS|POSSESSION|CHAIN/.test(o.b)) add(real, "layer badge stamped over the PáircVision wordmark");
      else if (o.a === "↓" && o.b === "↓") add(fp, "pitch-marker halo (each ↓ is drawn twice: 1.5 px shadow + glyph)");
      else if (/total events$/.test(o.b)) add(real, "footer event count over the last summary value");
      else if (/^Origin possessions include/.test(o.a)) add(real, "squeezed origin footnote over the event count");
      else add(real, `${o.a} ⟂ ${o.b}`);
    } else {
      const rec = pages[o.page - 1]?.texts.find((t) => t.t === o.text);
      if (rec?.maxWidth && rec.x + rec.maxWidth <= 1920) add(fp, "maxWidth-clamped text measured at natural width (it is squeezed, not clipped)");
      else add(real, "Possession Chain Insights line runs off the right edge");
    }
  }
  const fmt = (m) => Object.entries(m).map(([k, v]) => `${v}× ${k}`).join("; ") || "none";
  return { realCount: Object.values(real).reduce((a, b) => a + b, 0), fpCount: Object.values(fp).reduce((a, b) => a + b, 0), text: `Real: ${fmt(real)}. Harness false positives: ${fmt(fp)}.` };
}

const rows = [];
for (const id of ["A", "B", "C"]) {
  const r = JSON.parse(readFileSync(`${root}/results/compare-${id}${SUFFIX}.json`, "utf8"));
  for (const c of r.checks.filter((x) => x.status === "FAIL" || x.status === "MISSING")) {
    let [cat, finding, why] = rule(c);
    let actual = c.actual;
    if (why === null) {
      const l = splitLayout(c, id);
      why = l.text;
      actual = `${c.actual} (${l.realCount} real, ${l.fpCount} false positive)`;
    }
    rows.push({ n: rows.length + 1, match: id, status: c.status, surface: c.surface, page: c.page, stat: c.stat, team: c.team ?? "", expected: c.expected, actual, category: cat, finding, why });
  }
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const fails = rows.filter((r) => r.status === "FAIL");
const tally = (list) => list.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {});
const out = [
  "# Remaining failures after F-01 – F-06 — classified one by one", "",
  "Source: `results/compare-{A,B,C}.json` (expected values from the unchanged independent ledgers). Generated by `scripts/classify-remaining.mjs`.", "",
  "| Category | FAIL checks | Meaning |", "|---|---|---|",
  ...Object.entries({ STATISTICAL: "a printed number is wrong for its label", PRESENTATION: "wording / terminology / layout; numbers correct", UNSUPPORTED: "no support for a captured event family or sport rule; placeholder printed", HARNESS: "check is duplicated or its expectation is disputed" })
    .map(([k, v]) => `| ${k} | ${tally(fails)[k] ?? 0} | ${v} |`),
  `| **Total** | **${fails.length}** | (+ ${rows.length - fails.length} MISSING checks listed at the end) |`, "",
  "| # | Match | Surface | Page | Statistic | Team | Expected | Actual | Category | Finding | Evidence |", "|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.n}${r.status === "MISSING" ? " (MISSING)" : ""} | ${r.match} | ${esc(r.surface)} | ${esc(r.page)} | ${esc(r.stat)} | ${esc(r.team)} | ${esc(r.expected)} | ${esc(r.actual).slice(0, 60)} | **${r.category}** | ${r.finding} | ${esc(r.why)} |`),
];
writeFileSync(`${root}/${OUT}/REMAINING-FAILURES.md`, out.join("\n") + "\n");
writeFileSync(`${root}/${OUT}/remaining-failures.json`, JSON.stringify(rows, null, 1));
console.log("FAIL", fails.length, tally(fails), "MISSING", rows.length - fails.length, tally(rows.filter((r) => r.status === "MISSING")));
