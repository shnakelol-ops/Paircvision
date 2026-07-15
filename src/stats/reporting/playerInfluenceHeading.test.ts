/**
 * playerInfluenceHeading.test.ts — Player Influence heading regression.
 *
 * The Influence Index is a net-contribution ranking, not a scorer or raw-
 * involvement list. The page heading must say so plainly ("Net Influence")
 * rather than lean on the word "Index", which reads as a technical/formula
 * term on a phone screen. Ranking, weights, player inclusion and the
 * detailed formula footer are untouched by this test — only the heading
 * and its one-line explanation are asserted.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { makePlayerInfluencePage } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { mkAdareEvent } from "./adare-mungret-fixture";
import { buildMatchReport } from "./matchReport";

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

function fixtureEvents(): PdfExportEvent[] {
  return [
    mkAdareEvent({ kind: "POINT", teamSide: "FOR" }) as PdfExportEvent,
    mkAdareEvent({ kind: "POINT", teamSide: "OPP" }) as PdfExportEvent,
  ];
}

describe("Player Influence heading — identifies the ranking as net influence", () => {
  beforeEach(() => {
    installDomMocks();
  });

  it("headline reads 'Top Players by Net Influence', not the old formula-flavoured wording", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts).toContain("Top Players by Net Influence");
    expect(texts).not.toContain("Top Players by Influence Index");
  });

  it("carries a supporting line explaining what net influence combines", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    const explainer = texts.find((t) =>
      t.includes("Net contribution combines scoring, possession wins and losses, restarts, frees and assisted scoring actions."),
    );
    expect(explainer).toBeDefined();
  });

  it("still prints the detailed formula footer — heading change does not hide the calculation", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    const formulaLine = texts.find((t) => t.includes("How this is calculated"));
    expect(formulaLine).toBeDefined();
  });
});
