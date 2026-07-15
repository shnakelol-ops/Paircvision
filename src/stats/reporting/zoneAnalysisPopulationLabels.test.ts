/**
 * zoneAnalysisPopulationLabels.test.ts — Zone Analysis population-label regression.
 *
 * makeZoneAnalysisPage() draws two different populations for the same team:
 *   - the pitch heatmap (top) merges Scores + Turnovers Won into one blended count
 *   - the "Key Zones" panel's scoring hotspot uses Scores only
 * Both are mathematically valid, but a coach reading only the numbers can see the
 * same zone report two different counts with no explanation. This locks the
 * distinguishing headings ("Attacking Activity — Scores + Turnovers Won" vs
 * "Top Scoring Zones — Scores Only") and proves neither population's underlying
 * count changed — only the labelling did.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { makeZoneAnalysisPage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";

class CaptureCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  font = "";
  lineWidth = 1;
  textBaseline = "alphabetic";
  textAlign = "left";
  globalAlpha = 1;
  texts: string[] = [];

  save() {}
  restore() {}
  fillRect() {}
  strokeRect() {}
  fillText(text: string) {
    this.texts.push(text);
  }
  stroke() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  quadraticCurveTo() {}
  closePath() {}
  fill() {}
  measureText(text: string) {
    return { width: text.length * 8 };
  }
  setLineDash() {}
  clip() {}
  rect() {}
  roundRect() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
}

class CaptureCanvas {
  width = 1920;
  height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() {
    return this.ctx as unknown as CanvasRenderingContext2D;
  }
  toDataURL() {
    return "data:image/jpeg;base64,AAAA";
  }
}

function installDomMocks(): void {
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new CaptureCanvas();
      return {};
    },
  };
}

// 3 scores + 4 turnovers won, all in the same zone — merged activity (7)
// deliberately diverges from the scores-only hotspot count (3).
function zoneFixture(): PdfExportEvent[] {
  const events: PdfExportEvent[] = [];
  for (let i = 0; i < 3; i++) {
    events.push(mkAdareEvent({ kind: "POINT", teamSide: "FOR", nx: 0.85, ny: 0.5 }) as PdfExportEvent);
  }
  for (let i = 0; i < 4; i++) {
    events.push(mkAdareEvent({ kind: "TURNOVER_WON", teamSide: "FOR", nx: 0.85, ny: 0.5 }) as PdfExportEvent);
  }
  return events;
}

describe("Zone Analysis population labels — Attacking Activity vs Top Scoring Zones", () => {
  beforeEach(() => {
    installDomMocks();
  });

  it("labels the heatmap and the scoring-only panel with distinct, population-accurate headings", () => {
    const events = zoneFixture();
    const canvas = makeZoneAnalysisPage(
      events, "gaelic", "Adare", "Mungret", 1, 7, "RIGHT",
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    const heatmapTitle = texts.find((t) => t.includes("ATTACKING ACTIVITY — SCORES + TURNOVERS WON"));
    expect(heatmapTitle).toBeDefined();
    expect(heatmapTitle).toContain("ADARE");

    const scoringOnlyHeading = texts.find((t) => t === "TOP SCORING ZONES — SCORES ONLY");
    expect(scoringOnlyHeading).toBeDefined();

    // The two headings must never collapse into identical or ambiguous wording.
    expect(heatmapTitle).not.toBe(scoringOnlyHeading);
  });

  it("does not alter either population — heatmap stays merged (scores+turnovers), Key Zones stays scores-only", () => {
    const events = zoneFixture();
    const canvas = makeZoneAnalysisPage(
      events, "gaelic", "Adare", "Mungret", 1, 7, "RIGHT",
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    // Pitch title shows the merged total (3 scores + 4 turnovers = 7 events).
    const eventsCountText = texts.find((t) => /^7 events$/.test(t));
    expect(eventsCountText).toBeDefined();

    // Key Zones hotspot row shows the scores-only count (3), not the merged 7.
    const hotspotValue = texts.find((t) => /\(3\)$/.test(t));
    expect(hotspotValue).toBeDefined();
    expect(hotspotValue).not.toMatch(/\(7\)$/);
  });
});
