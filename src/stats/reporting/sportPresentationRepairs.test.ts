// Regression tests for the Guardian V1 presentation repairs BL-F2, BL-F3 and BL-F4: sport-specific
// wording and the sin-bin row. (BL-F1, the snapshot badge placement, is a canvas drawing change —
// jsdom has no canvas — and is guarded by the Event Stats browser laboratory's overlap check.)
import { describe, expect, it } from "vitest";
import { freeAnalysisTitle, restartDeadLabel, sportHasSinBin } from "../reviewPdfExport";
import { getDisciplineOptions, showSinBinRow } from "../../pro-tagger/pro-tagger-discipline";

describe("restartDeadLabel — BL-F3", () => {
  it("football keeps 'Kicked Dead'", () => {
    expect(restartDeadLabel("gaelic")).toBe("Kicked Dead");
  });
  it("hurling and camogie say 'Puckout Dead'", () => {
    expect(restartDeadLabel("hurling")).toBe("Puckout Dead");
    expect(restartDeadLabel("camogie")).toBe("Puckout Dead");
  });
});

describe("freeAnalysisTitle — BL-F4", () => {
  it("football keeps 'Free Kick Analysis'", () => {
    expect(freeAnalysisTitle("gaelic")).toBe("Free Kick Analysis");
  });
  it("hurling and camogie say 'Free Analysis'", () => {
    expect(freeAnalysisTitle("hurling")).toBe("Free Analysis");
    expect(freeAnalysisTitle("camogie")).toBe("Free Analysis");
  });
});

describe("sin-bin row — BL-F2", () => {
  it("the Full Review rule matches the app's discipline ruleset for every Event Stats sport", () => {
    // The PDF's sport type has no ladies_football (ladies' matches export as "gaelic").
    for (const [pdfSport, appSport] of [["gaelic", "gaelic"], ["gaelic", "ladies_football"], ["hurling", "hurling"], ["camogie", "camogie"]] as const) {
      expect(sportHasSinBin(pdfSport)).toBe(getDisciplineOptions(appSport).includes("SIN_BIN"));
    }
  });
  it("football always shows the Sin Bins row, even at zero", () => {
    expect(showSinBinRow("gaelic", 0, 0)).toBe(true);
    expect(showSinBinRow("ladies_football", 0, 0)).toBe(true);
  });
  it("hurling and camogie hide a zero Sin Bins row", () => {
    expect(showSinBinRow("hurling", 0, 0)).toBe(false);
    expect(showSinBinRow("camogie", 0, 0)).toBe(false);
  });
  it("recorded sin bins are never hidden, whatever the sport", () => {
    expect(showSinBinRow("hurling", 1, 0)).toBe(true);
    expect(showSinBinRow("camogie", 0, 2)).toBe(true);
  });
});
