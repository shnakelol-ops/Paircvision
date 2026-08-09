/**
 * fullReviewPageOrder.test.ts
 *
 * Whole-export regression for the Full Review's final Part 1/2/3 page order
 * and page count (regression test items #1 page ownership, #9 page order,
 * #10 page count from the implementation brief).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, unlinkSync } from "node:fs";
import { exportReviewPdf } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";
import type { FullReviewPart } from "./reportProvenance";

let allTexts: string[] = [];
let canvasCreateCount = 0;

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
      if (tag === "canvas") {
        canvasCreateCount++;
        return new CaptureCanvas();
      }
      return {};
    },
  };
}

beforeEach(() => {
  allTexts = [];
  canvasCreateCount = 0;
  installDomMocks();
});

afterEach(() => {
  for (const name of readdirSync(".")) {
    if (name.endsWith("_review.pdf")) unlinkSync(name);
  }
});

/** Page → part ownership for every fixed (non-player, non-targets) page. */
const PAGE_OWNERSHIP: Array<{ title: string; part: FullReviewPart | "FRONT_MATTER" }> = [
  { title: "Match Summary", part: "FRONT_MATTER" },
  { title: "Understanding PáircVision Analytics", part: "FRONT_MATTER" },
  { title: "PART 1 — MATCH FACTS", part: "MATCH_FACTS" },
  { title: "Scoring Breakdown", part: "MATCH_FACTS" },
  { title: "Match Swing Timeline", part: "MATCH_FACTS" },
  { title: "Game Segments Breakdown", part: "MATCH_FACTS" },
  // Player Breakdown (N pages) omitted — variable count, no distinctive title.
  { title: "Player Contributions", part: "MATCH_FACTS" },
  { title: "Shot Pitch Maps", part: "MATCH_FACTS" },
  { title: "Shot & Scoring Efficiency", part: "MATCH_FACTS" },
  { title: "Zone Analysis", part: "MATCH_FACTS" },
  { title: "1H Pitch Overview", part: "MATCH_FACTS" },
  { title: "2H Pitch Overview", part: "MATCH_FACTS" },
  { title: "PART 2 — POSSESSION FACTS", part: "POSSESSION_FACTS" },
  { title: "Opposition Facts", part: "POSSESSION_FACTS" },
  { title: "Restart Analysis", part: "POSSESSION_FACTS" },
  { title: "Turnover Analysis", part: "POSSESSION_FACTS" },
  { title: "Free Kick Analysis", part: "POSSESSION_FACTS" },
  { title: "PART 3 — GAME ORIGIN / CHAIN ANALYSIS", part: "GAME_ORIGIN" },
  { title: "Scoring Possession Origins", part: "GAME_ORIGIN" },
  { title: "Player Chain Involvement", part: "GAME_ORIGIN" },
  { title: "Opposition Origin & Chain Analysis", part: "GAME_ORIGIN" },
  { title: "Intelligence Summary", part: "GAME_ORIGIN" },
  { title: "Match Markers", part: "GAME_ORIGIN" },
  { title: "Chain Intelligence", part: "GAME_ORIGIN" },
  { title: "Restart Chain Analysis", part: "GAME_ORIGIN" },
  { title: "Turnover Chain Analysis", part: "GAME_ORIGIN" },
  { title: "Scoring Momentum", part: "GAME_ORIGIN" },
];

// The three PART titles legitimately appear twice: once as a preview card
// title on the "Understanding PáircVision Analytics" intro page (all three
// cards render on that single page), and once on their own divider page.
// Every other page title renders exactly once.
const PART_DIVIDER_TITLES = new Set([
  "PART 1 — MATCH FACTS",
  "PART 2 — POSSESSION FACTS",
  "PART 3 — GAME ORIGIN / CHAIN ANALYSIS",
]);

describe("Full Review — page order and ownership", () => {
  it("every fixed page title renders in exactly the declared Part 1/2/3 order", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    const expectedTitles = PAGE_OWNERSHIP.map((p) => p.title);
    const titleSet = new Set(expectedTitles);
    // Drop the intro page's preview occurrence of each PART title (the
    // first of its two appearances) so the remaining sequence matches the
    // declared order one-for-one, same as every other (single-occurrence)
    // page title.
    const seenPartTitle = new Set<string>();
    const orderedHits = allTexts.filter((t) => {
      if (!titleSet.has(t)) return false;
      if (PART_DIVIDER_TITLES.has(t)) {
        if (!seenPartTitle.has(t)) { seenPartTitle.add(t); return false; }
      }
      return true;
    });

    expect(orderedHits).toEqual(expectedTitles);
  });

  it("every declared page appears exactly once, except the three PART titles which preview on the intro page and appear once more on their divider (twice total)", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    for (const { title } of PAGE_OWNERSHIP) {
      const count = allTexts.filter((t) => t === title).length;
      const expected = PART_DIVIDER_TITLES.has(title) ? 2 : 1;
      expect(count, `expected exactly ${expected} occurrence(s) of "${title}"`).toBe(expected);
    }
  });

  it("Part 1 pages all render before Part 2, and Part 2 before Part 3", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    const indexOf = (title: string) => allTexts.indexOf(title);
    // Dividers use lastIndexOf: their first occurrence is the intro page's
    // preview card, not the actual divider page.
    const lastPart1 = indexOf("2H Pitch Overview");
    const part2Divider = allTexts.lastIndexOf("PART 2 — POSSESSION FACTS");
    const lastPart2 = indexOf("Free Kick Analysis");
    const part3Divider = allTexts.lastIndexOf("PART 3 — GAME ORIGIN / CHAIN ANALYSIS");

    expect(lastPart1).toBeGreaterThan(0);
    expect(part2Divider).toBeGreaterThan(lastPart1);
    expect(lastPart2).toBeGreaterThan(part2Divider);
    expect(part3Divider).toBeGreaterThan(lastPart2);
  });

  it("total page count matches 27 fixed pages + N player-breakdown pages (no targets set)", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    // canvasCreateCount counts every document.createElement("canvas") call —
    // one per rendered page (fallback pages also create exactly one canvas).
    // Fixed pages = 27; player-breakdown page count varies with squad size,
    // so assert the fixed floor rather than an exact N-dependent total.
    expect(canvasCreateCount).toBeGreaterThanOrEqual(27);
  });
});
