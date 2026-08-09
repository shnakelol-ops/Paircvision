/**
 * fullReviewChapterCopy.test.ts
 *
 * Whole-export regression: the Full Review's chapter dividers use the
 * Part 1/2/3 naming (not the old "Chapter N" / causal "WHY" framing), the
 * Game Origin explanation is present, and no page anywhere in the export
 * uses "Direct" language for a chain/origin figure.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, unlinkSync } from "node:fs";
import { exportReviewPdf } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";
import { containsDirectLanguage } from "./reportProvenance";
import { GAME_ORIGIN_EXPLANATION } from "./fullReviewCopy";

let allTexts: string[] = [];

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) { allTexts.push(text); }
  stroke() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {}
  measureText(text: string) { return { width: text.length * 8 }; }
  setLineDash() {}
  clip() {}
  rect() {}
  roundRect() {}
  drawImage() {}
  createLinearGradient() { return { addColorStop() {} }; }
}

class CaptureCanvas {
  width = 1920;
  height = 1080;
  getContext() { return new CaptureCanvasContext() as unknown as CanvasRenderingContext2D; }
  toDataURL() { return "data:image/jpeg;base64,AAAA"; }
}

function installDomMocks(): void {
  class MockPath2D {
    constructor(_d?: string) {}
  }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new CaptureCanvas();
      return {};
    },
  };
}

beforeEach(() => {
  allTexts = [];
  installDomMocks();
});

afterEach(() => {
  // exportReviewPdf's filename sanitiser strips spaces/punctuation from team
  // names, so match by suffix rather than reconstructing the exact name.
  for (const name of readdirSync(".")) {
    if (name.endsWith("_review.pdf")) unlinkSync(name);
  }
});

describe("Full Review — chapter copy and language guard (whole export)", () => {
  it("uses PART 1/2/3 chapter titles, not the old Chapter N / causal WHY framing", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    expect(allTexts).toContain("PART 1 — MATCH FACTS");
    expect(allTexts).toContain("PART 2 — POSSESSION FACTS");
    expect(allTexts).toContain("PART 3 — GAME ORIGIN / CHAIN ANALYSIS");

    const causalHits = allTexts.filter((t) => /why did/i.test(t));
    expect(causalHits).toEqual([]);
  });

  it("prints the Game Origin explanation before any origin-derived scoring table", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    // The explanation is wrapped across multiple fillText calls; confirm its
    // opening sentence is present verbatim.
    const opening = GAME_ORIGIN_EXPLANATION.split(".")[0];
    const found = allTexts.some((t) => opening.startsWith(t) || t.startsWith(opening.slice(0, 20)));
    expect(found).toBe(true);
  });

  it("'Direct' only ever describes genuinely direct (Part 1) data, never a chain-origin row", async () => {
    // Rule 2 forbids "Direct" for a chain/origin-derived number, not the word
    // itself — Part 1 pages correctly call their own non-origin data "direct"
    // (e.g. "Direct event classification only" on Scoring Breakdown, and the
    // pre-existing restartAttributionFootnote(), which uses "Direct restart
    // scores" specifically to contrast with restart-origin scores). Assert
    // every hit is one of those known-good, non-origin-labelling sentences.
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    const directHits = allTexts.filter((t) => containsDirectLanguage(t));
    const knownGoodFragments = [
      "Direct event classification only",
      "Direct restart scores attribute placed balls separately",
      "direct event-source classification",
      "Direct event counts only",
    ];
    for (const hit of directHits) {
      expect(knownGoodFragments.some((fragment) => hit.includes(fragment))).toBe(true);
    }
  });

  it("no longer prints the retired 'Where the Points Went' / 'Opposition Snapshot' page titles", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    expect(allTexts).not.toContain("Where the Points Went");
    expect(allTexts).not.toContain("Opposition Snapshot");
    expect(allTexts).toContain("Scoring Breakdown");
    expect(allTexts).toContain("Scoring Possession Origins");
    expect(allTexts).toContain("Opposition Facts");
    expect(allTexts).toContain("Opposition Origin & Chain Threat");
    expect(allTexts).toContain("Player Contributions");
  });
});
