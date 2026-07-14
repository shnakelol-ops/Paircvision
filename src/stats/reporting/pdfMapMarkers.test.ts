/**
 * pdfMapMarkers.test.ts — PDF pitch-map marker scope regression tests.
 *
 * Ensures map renderers plot the same event sets as their summary cards:
 *   Turnover & Territory — TURNOVER_WON + TURNOVER_LOST (beneficiary scope)
 *   Restart maps         — KICKOUT_WON + KICKOUT_CONCEDED per owner
 *   Free maps            — FREE_WON + FREE_CONCEDED per logging team
 */

import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import type { PdfExportEvent } from "../reviewPdfExport";
import {
  exportSnapshotPdf,
  pdfCountPlottableMarkers,
  pdfFreeMapEvents,
  pdfRestartLostEvents,
  pdfRestartOwnerEvents,
  pdfRestartRetainedEvents,
  pdfTurnoverLostEvents,
  pdfTurnoverMapEvents,
  pdfTurnoverWonEvents,
} from "../reviewPdfExport";
import {
  ADARE_MUNGRET_TEAMS,
  buildAdareMungretFixture,
  mkAdareEvent,
} from "./adare-mungret-fixture";

class MockCanvasContext {
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
  fillText() {}
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

class MockCanvas {
  width = 1920;
  height = 1080;
  getContext() {
    return new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  }
  toDataURL() {
    return "data:image/jpeg;base64,AAAA";
  }
}

function installDomMocks(): void {
  class MockPath2D {
    constructor(_d?: string) {}
  }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new MockCanvas();
      return {};
    },
  };
}

const PDF_FILES = [
  "Adare_v_Mungret_ht_snapshot.pdf",
  "Adare_v_Mungret_ft_snapshot.pdf",
] as const;

const allEvents = buildAdareMungretFixture() as PdfExportEvent[];
const h1Events = allEvents.filter((e) => e.period === "1H");

function lostTurnoverKinds(events: readonly PdfExportEvent[]): number {
  return events.filter(
    (e) => e.kind === "TURNOVER_LOST" || (e.kind === "TURNOVER_WON" && e.teamSide === "OPP"),
  ).length;
}

function concededRestartKinds(events: readonly PdfExportEvent[]): number {
  return events.filter((e) => e.kind === "KICKOUT_CONCEDED").length;
}

function concededFreeKinds(events: readonly PdfExportEvent[]): number {
  return events.filter((e) => e.kind === "FREE_CONCEDED").length;
}

describe("PDF map marker scopes — Adare v Mungret turnover & territory", () => {
  it("HT: map markers reconcile with Territory Balance won + lost counts", () => {
    const won = pdfTurnoverWonEvents(h1Events);
    const lost = pdfTurnoverLostEvents(h1Events);
    const map = pdfTurnoverMapEvents(h1Events);

    expect(won.length).toBe(10);
    expect(lost.length).toBe(5);
    expect(map.length).toBe(won.length + lost.length);
    expect(lostTurnoverKinds(map)).toBe(5);
    expect(pdfCountPlottableMarkers(map)).toBe(15);
  });

  it("FT: Won 10 · Lost 6 → 16 markers including exactly six losses", () => {
    const won = pdfTurnoverWonEvents(allEvents);
    const lost = pdfTurnoverLostEvents(allEvents);
    const map = pdfTurnoverMapEvents(allEvents);

    expect(won.length).toBe(10);
    expect(lost.length).toBe(6);
    expect(map.length).toBe(16);
    expect(map.length).toBe(won.length + lost.length);
    expect(lostTurnoverKinds(map)).toBe(6);
    expect(pdfCountPlottableMarkers(map)).toBe(16);
  });
});

describe("PDF map marker scopes — Adare v Mungret restart maps", () => {
  it("HT: owner restarts include retained and lost (won + conceded)", () => {
    const forOwned = pdfRestartOwnerEvents(h1Events, "FOR");
    const retained = pdfRestartRetainedEvents(h1Events, "FOR");
    const lost = pdfRestartLostEvents(h1Events, "FOR");

    expect(forOwned.length).toBe(10);
    expect(retained.length).toBe(5);
    expect(lost.length).toBe(5);
    expect(forOwned.length).toBe(retained.length + lost.length);
    expect(concededRestartKinds(forOwned)).toBe(5);
    expect(pdfCountPlottableMarkers(forOwned)).toBe(10);
  });

  it("FT: Adare own restarts reconcile retained + lost with owner scope", () => {
    const forOwned = pdfRestartOwnerEvents(allEvents, "FOR");
    const retained = pdfRestartRetainedEvents(allEvents, "FOR");
    const lost = pdfRestartLostEvents(allEvents, "FOR");

    expect(forOwned.length).toBe(22);
    expect(retained.length).toBe(12);
    expect(lost.length).toBe(10);
    expect(forOwned.length).toBe(retained.length + lost.length);
    expect(concededRestartKinds(forOwned)).toBe(10);
  });
});

describe("PDF map marker scopes — free possession maps", () => {
  const freeSample: PdfExportEvent[] = [
    mkAdareEvent({ kind: "FREE_WON", teamSide: "FOR", period: "1H", nx: 0.3, ny: 0.4 }),
    mkAdareEvent({ kind: "FREE_CONCEDED", teamSide: "FOR", period: "1H", nx: 0.6, ny: 0.5 }),
    mkAdareEvent({ kind: "FREE_WON", teamSide: "OPP", period: "1H", nx: 0.7, ny: 0.2 }),
    mkAdareEvent({ kind: "FREE_CONCEDED", teamSide: "OPP", period: "1H", nx: 0.2, ny: 0.8 }),
  ] as PdfExportEvent[];

  it("includes FREE_WON and FREE_CONCEDED logged by each team", () => {
    const forMap = pdfFreeMapEvents(freeSample, "FOR");
    const oppMap = pdfFreeMapEvents(freeSample, "OPP");

    expect(forMap.map((e) => e.kind).sort()).toEqual(["FREE_CONCEDED", "FREE_WON"]);
    expect(oppMap.map((e) => e.kind).sort()).toEqual(["FREE_CONCEDED", "FREE_WON"]);
    expect(concededFreeKinds(forMap)).toBe(1);
    expect(concededFreeKinds(oppMap)).toBe(1);
    expect(pdfCountPlottableMarkers(forMap)).toBe(2);
    expect(pdfCountPlottableMarkers(oppMap)).toBe(2);
  });
});

describe("PDF map marker scopes — snapshot PDF export", () => {
  const baseInput = {
    events: allEvents,
    homeTeamName: ADARE_MUNGRET_TEAMS.home,
    awayTeamName: ADARE_MUNGRET_TEAMS.away,
    sport: "gaelic" as const,
    homeAttackingDirection: "RIGHT" as const,
  };

  it("regenerates Adare HT and FT snapshot PDFs for visual map verification", async () => {
    installDomMocks();
    await exportSnapshotPdf({ ...baseInput, snapshotMode: "HALF_TIME_SNAPSHOT" });
    await exportSnapshotPdf({ ...baseInput, snapshotMode: "FULL_TIME_SNAPSHOT" });

    for (const file of PDF_FILES) {
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1000);
    }
  });
});
