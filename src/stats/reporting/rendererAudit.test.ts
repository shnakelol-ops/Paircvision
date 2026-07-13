/**
 * rendererAudit.test.ts
 *
 * Guards against renderer-local coach-facing metric calculations creeping
 * back into PDF export code.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PDF_EXPORT_PATH = resolve(__dirname, "../reviewPdfExport.ts");
const pdfSource = readFileSync(PDF_EXPORT_PATH, "utf8");

/** Patterns that must not appear in reviewPdfExport.ts (coach-facing metric math). */
const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "wonToScorePercent", pattern: /\bwonToScorePercent\b/ },
  { name: "lostAllowedScorePercent", pattern: /\blostAllowedScorePercent\b/ },
  { name: "wonToShotPercent", pattern: /\bwonToShotPercent\b/ },
  {
    name: "inline restart share division",
    pattern: /ko\.won\s*\/\s*\(?\s*ko\.(won|total)/,
  },
  {
    name: "inline Math.round percentage",
    pattern: /Math\.round\(\([^)]+\)\s*\/\s*[^)]+\)\s*\*\s*100\)/,
  },
];

describe("renderer audit — reviewPdfExport.ts", () => {
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    it(`must not contain ${name}`, () => {
      expect(pdfSource.match(pattern), `Found forbidden pattern: ${name}`).toBeNull();
    });
  }

  it("must import pdfReportViews for canonical PDF metrics", () => {
    expect(pdfSource).toContain("./reporting/pdfReportViews");
  });

  it("exportReviewPdf builds MatchReport once", () => {
    expect(pdfSource).toContain("const report = buildMatchReport(");
  });
});
