/**
 * pdfShotProfileZones.test.ts — Shot Profile zone-label regression tests.
 *
 * Verifies team-relative zone semantics on the actual PDF page builders
 * (not helper counts). Adare attacks LEFT in H1; scores in their attacking
 * third must read "Attacking Centre" on both Our and Opposition profiles.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  exportReviewPdf,
  makeOppShotProfilePage,
  makeOurShotProfilePage,
} from "../reviewPdfExport";
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

function adareZoneFixture() {
  return [
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", period: "1H", nx: 0.12, ny: 0.5 }),
    mkAdareEvent({ kind: "POINT", teamSide: "FOR", period: "1H", nx: 0.18, ny: 0.5 }),
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", period: "1H", nx: 0.85, ny: 0.5 }),
    mkAdareEvent({ kind: "POINT", teamSide: "OPP", period: "1H", nx: 0.90, ny: 0.5 }),
  ];
}

function zoneLabelFromCanvas(canvas: CaptureCanvas): string | undefined {
  for (const text of canvas.ctx.texts) {
    const callout = text.match(/best (?:zone|scoring zone):\s*([^(·]+)/i);
    if (callout) return callout[1].trim();
    const headline = text.match(/Best zone:\s*([^·]+)/i);
    if (headline) return headline[1].trim();
  }
  return undefined;
}

describe("Shot Profile zone labels — Adare v Mungret, attacking LEFT in H1", () => {
  beforeEach(() => {
    installDomMocks();
  });

  it("Our Shot Profile → Attacking Centre", () => {
    const events = adareZoneFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makeOurShotProfilePage(
      events,
      report,
      "gaelic",
      "Adare",
      "Mungret",
      1,
      7,
      "LEFT",
    ) as unknown as CaptureCanvas;

    expect(zoneLabelFromCanvas(canvas)).toBe("Attacking Centre");
  });

  it("Opposition Shot Profile → Attacking Centre (from their perspective)", () => {
    const events = adareZoneFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const canvas = makeOppShotProfilePage(
      events,
      report,
      "gaelic",
      "Adare",
      "Mungret",
      2,
      7,
      "LEFT",
    ) as unknown as CaptureCanvas;

    expect(zoneLabelFromCanvas(canvas)).toBe("Attacking Centre");
  });

  it("both profiles agree on zone label for the same fixture", () => {
    const events = adareZoneFixture();
    const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Adare", awayTeam: "Mungret" });
    const ourCanvas = makeOurShotProfilePage(
      events, report, "gaelic", "Adare", "Mungret", 1, 7, "LEFT",
    ) as unknown as CaptureCanvas;
    const oppCanvas = makeOppShotProfilePage(
      events, report, "gaelic", "Adare", "Mungret", 2, 7, "LEFT",
    ) as unknown as CaptureCanvas;

    expect(zoneLabelFromCanvas(ourCanvas)).toBe(zoneLabelFromCanvas(oppCanvas));
  });
});

describe("Full Review PDF Zone Analysis — homeAttackingDirection threaded end to end", () => {
  // Regression for the gap where StatsModeSurface.tsx's "Export PDF" button
  // called exportReviewPdf() without homeAttackingDirection at all (it
  // silently defaulted to "RIGHT"), even though HT/FT Snapshot already
  // threaded the real value — the Full Review's Zone Analysis page is the
  // one report surface that must also get this right when the caller
  // supplies homeAttackingDirection, exactly as the fixed call site does.
  const capturedTexts: string[] = [];

  class GlobalCaptureCanvasContext extends CaptureCanvasContext {
    override fillText(text: string) {
      capturedTexts.push(text);
      super.fillText(text);
    }
  }

  class GlobalCaptureCanvas {
    width = 1920;
    height = 1080;
    readonly ctx = new GlobalCaptureCanvasContext();
    getContext() {
      return this.ctx as unknown as CanvasRenderingContext2D;
    }
    toDataURL() {
      return "data:image/jpeg;base64,AAAA";
    }
  }

  beforeEach(() => {
    capturedTexts.length = 0;
    class MockPath2D {
      constructor(_d?: string) {}
    }
    (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        if (tag === "canvas") return new GlobalCaptureCanvas();
        return {};
      },
    };
  });

  it("Zone Analysis reads Attacking Centre when homeAttackingDirection is LEFT", async () => {
    const events = adareZoneFixture();
    await exportReviewPdf({
      events: events as PdfExportEvent[],
      homeTeamName: "Adare",
      awayTeamName: "Mungret",
      sport: "gaelic",
      homeAttackingDirection: "LEFT",
    });

    const zoneLine = capturedTexts.find((t) => /^Most scores for:/.test(t));
    expect(zoneLine).toBeDefined();
    expect(zoneLine).toContain("Attacking Centre");
  });

  it("Zone Analysis mislabels (Defensive, not Attacking) when the direction is omitted — proves the export path must supply it", async () => {
    const events = adareZoneFixture();
    await exportReviewPdf({
      events: events as PdfExportEvent[],
      homeTeamName: "Adare",
      awayTeamName: "Mungret",
      sport: "gaelic",
      // homeAttackingDirection intentionally omitted — this is the exact bug
      // that used to exist at StatsModeSurface.tsx's handleExportPdf call site.
    });

    const zoneLine = capturedTexts.find((t) => /^Most scores for:/.test(t));
    expect(zoneLine).toBeDefined();
    expect(zoneLine).not.toContain("Attacking Centre");
  });
});
