/**
 * pdfMapMarkers.test.ts — Turnover & Territory regression archaeology tests.
 *
 * Known-good reference: main @ c72daebf ("Snapshot visual refresh: dots-first clarity pass")
 * and its descendant 08061bb9 (original Turnover & Territory page).
 *
 * Turnover & Territory scoping (locked):
 *   card won  = TURNOVER_WON logged by FOR
 *   card lost = TURNOVER_LOST by FOR OR TURNOVER_WON by OPP
 *   map       = all events in PDF_KIND_SETS.TURNOVERS (renderHtMarkers — purple/orange dots)
 *
 * Renderer paths:
 *   HT Snapshot / FT Snapshot → makeTurnoverTerritoryPage (single map, renderHtMarkers)
 *   Full Review               → makeTurnoverVisualPage (split pitches, renderEventMarkers)
 */

import { describe, expect, it } from "vitest";
import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { PdfExportEvent } from "../reviewPdfExport";
import {
  buildAdareMungretFixture,
  mkAdareEvent,
} from "./adare-mungret-fixture";
import {
  buildGoldenReportingFixture,
} from "./golden-fixture";

const TURNOVER_KINDS = new Set<MatchEventKind>(["TURNOVER_WON", "TURNOVER_LOST"]);

/** Known-good Territory Balance card — won scope (FOR logged wins only). */
function territoryCardWon(events: readonly PdfExportEvent[]): PdfExportEvent[] {
  return events.filter((e) => e.kind === "TURNOVER_WON" && e.teamSide === "FOR");
}

/** Known-good Territory Balance card — lost scope (beneficiary mirror). */
function territoryCardLost(events: readonly PdfExportEvent[]): PdfExportEvent[] {
  return events.filter(
    (e) => (e.kind === "TURNOVER_LOST" && e.teamSide === "FOR") ||
           (e.kind === "TURNOVER_WON"  && e.teamSide === "OPP"),
  );
}

/** Known-good map scope — every turnover event in the feed. */
function territoryMapEvents(events: readonly PdfExportEvent[]): PdfExportEvent[] {
  return events.filter((e) => TURNOVER_KINDS.has(e.kind));
}

function countByKind(events: readonly PdfExportEvent[], kind: MatchEventKind): number {
  return events.filter((e) => e.kind === kind).length;
}

function spreadTurnovers(
  count: number,
  kind: "TURNOVER_WON" | "TURNOVER_LOST",
  period: "1H" | "2H",
  startNx: number,
): PdfExportEvent[] {
  const out: PdfExportEvent[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      mkAdareEvent({
        kind,
        teamSide: "FOR",
        period,
        nx: startNx + i * 0.04,
        ny: 0.3 + (i % 3) * 0.15,
      }) as PdfExportEvent,
    );
  }
  return out;
}

/** Ballylanders-style single-perspective turnover log (5 won · 5 lost). */
function buildBallylandersTurnoverFixture(): PdfExportEvent[] {
  return [
    ...spreadTurnovers(5, "TURNOVER_WON", "1H", 0.2),
    ...spreadTurnovers(5, "TURNOVER_LOST", "1H", 0.55),
  ] as PdfExportEvent[];
}

/** Adare HT turnover log shape from production QA (7 won · 1 lost, first half). */
function buildAdareHtTurnoverFixture(): PdfExportEvent[] {
  return [
    ...spreadTurnovers(7, "TURNOVER_WON", "1H", 0.15),
    ...spreadTurnovers(1, "TURNOVER_LOST", "1H", 0.75),
  ] as PdfExportEvent[];
}

describe("Turnover & Territory — known-good scope (c72daebf / main)", () => {
  it("Ballylanders v St.Patricks golden fixture: card 7 · 5, map 12, both kinds on pitch", () => {
    const events = buildGoldenReportingFixture() as PdfExportEvent[];
    const won = territoryCardWon(events);
    const lost = territoryCardLost(events);
    const map = territoryMapEvents(events);

    expect(won.length).toBe(7);
    expect(lost.length).toBe(5);
    expect(map.length).toBe(12);
    expect(countByKind(map, "TURNOVER_WON")).toBe(7);
    expect(countByKind(map, "TURNOVER_LOST")).toBe(5);
  });

  it("Ballylanders 5 · 5 turnover log: map markers reconcile with Territory Balance card", () => {
    const events = buildBallylandersTurnoverFixture();
    const won = territoryCardWon(events);
    const lost = territoryCardLost(events);
    const map = territoryMapEvents(events);

    expect(won.length).toBe(5);
    expect(lost.length).toBe(5);
    expect(map.length).toBe(10);
    expect(map.length).toBe(won.length + lost.length);
    expect(countByKind(map, "TURNOVER_WON")).toBe(5);
    expect(countByKind(map, "TURNOVER_LOST")).toBe(5);
  });

  it("Adare HT (7 won · 1 lost): map plots 8 markers with exactly one loss", () => {
    const events = buildAdareHtTurnoverFixture();
    const won = territoryCardWon(events);
    const lost = territoryCardLost(events);
    const map = territoryMapEvents(events);

    expect(won.length).toBe(7);
    expect(lost.length).toBe(1);
    expect(map.length).toBe(8);
    expect(map.length).toBe(won.length + lost.length);
    expect(countByKind(map, "TURNOVER_LOST")).toBe(1);
  });

  it("Adare FT: card Won 10 · Lost 6 → 16 purple/orange map markers", () => {
    const events = buildAdareMungretFixture() as PdfExportEvent[];
    const won = territoryCardWon(events);
    const lost = territoryCardLost(events);
    const map = territoryMapEvents(events);

    expect(won.length).toBe(10);
    expect(lost.length).toBe(6);
    expect(map.length).toBe(16);
    expect(map.length).toBe(won.length + lost.length);
    expect(countByKind(map, "TURNOVER_WON")).toBe(10);
    expect(countByKind(map, "TURNOVER_LOST")).toBe(6);
  });
});

describe("Turnover & Territory — renderer path separation", () => {
  it("snapshot path uses makeTurnoverTerritoryPage (renderHtMarkers + allTurnoverEvts)", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/stats/reviewPdfExport.ts"),
      "utf8",
    );
    expect(src).toContain("makeTurnoverTerritoryPage(");
    expect(src).toContain("renderHtMarkers(ctx, allTurnoverEvts, inner)");
    expect(src).not.toMatch(/makeTurnoverTerritoryPage[\s\S]*?renderHtMarkers\(ctx, mapEvts/);
  });

  it("Full Review turnover chapter uses makeTurnoverVisualPage (split renderEventMarkers)", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/stats/reviewPdfExport.ts"),
      "utf8",
    );
    expect(src).toContain("makeTurnoverVisualPage(");
    expect(src).toContain("renderEventMarkers(ctx, wonEvts, leftInner)");
    expect(src).toContain("renderEventMarkers(ctx, lostEvts, rightInner)");
  });
});

describe("Turnover & Territory — regression guard against a687d965 invented scopes", () => {
  it("does not export pdfTurnoverMapEvents helper (replaced by allTurnoverEvts inline filter)", async () => {
    const mod = await import("../reviewPdfExport");
    expect("pdfTurnoverMapEvents" in mod).toBe(false);
    expect("pdfTurnoverWonEvents" in mod).toBe(false);
  });
});
