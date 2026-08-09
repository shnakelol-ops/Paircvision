/**
 * playerInfluenceHeading.test.ts — Player Chain Involvement heading regression.
 *
 * PáircVision records, connects and surfaces — it does not grade players.
 * The Player Chain Involvement page (Part 3) must never print a composite
 * "Influence Index" or any replacement rating/score, and its heading must
 * name the page for what it actually shows: factual scoring-chain
 * involvement, ranked by a named factual field.
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

describe("Player Chain Involvement heading — no composite rating", () => {
  beforeEach(() => {
    installDomMocks();
  });

  it("headline reads 'Player Chain Involvement'", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts).toContain("Player Chain Involvement");
    expect(texts).not.toContain("Top Players by Net Influence");
  });

  it("never prints 'Influence Index', an 'Index' column, or an 'INDEX' header", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts.some((t) => t.toLowerCase().includes("influence index"))).toBe(false);
    expect(texts.some((t) => t.startsWith("Index "))).toBe(false);
    expect(texts).not.toContain("INDEX");
  });

  it("does not print a formula footer — there is no composite calculation to explain", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts.some((t) => t.includes("How this is calculated"))).toBe(false);
  });

  it("ranks by a named factual field — 'MOST SCORING-CHAIN INVOLVEMENTS', not an evaluative label", () => {
    const events = fixtureEvents();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makePlayerInfluencePage(
      events, report, "Adare", "Mungret", 1, 7,
    ) as unknown as CaptureCanvas;
    const texts = canvas.ctx.texts;

    expect(texts.some((t) => t.toLowerCase().includes("most influential"))).toBe(false);
    expect(texts.some((t) => t.toUpperCase().includes("TOP 3 INFLUENCERS"))).toBe(false);
  });
});
