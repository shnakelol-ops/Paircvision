/**
 * snapshotExport.test.ts
 *
 * P0 regression: HT/FT Snapshot exports must not throw before page rendering.
 * Root cause (2026-07): exportSnapshotPdf referenced `home`/`away` in
 * buildMatchReport before const initialisation (TDZ ReferenceError).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { createMatchEvent } from "../core/stats/stats-event-model";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { buildGoldenReportingFixture } from "./reporting/golden-fixture";
import { exportReviewPdf, exportSnapshotPdf } from "./reviewPdfExport";
import { proTaggerMatchToPdfInput, proTaggerMatchToSnapshotInput } from "../pro-tagger/pro-tagger-review-adapter";
import type { ProTaggerSavedMatch } from "../pro-tagger/pro-tagger-storage";

// ─── Minimal DOM for Node (vitest has no jsdom) ─────────────────────────────

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
  const doc = {
    createElement(tag: string) {
      if (tag === "canvas") return new MockCanvas() as unknown as HTMLCanvasElement;
      return {} as HTMLElement;
    },
  };
  (globalThis as unknown as { document: typeof doc }).document = doc;
}

beforeEach(() => {
  installDomMocks();
});

afterEach(() => {
  for (const file of [
    "Adare_v_Mungret_ft_snapshot.pdf",
    "Adare_v_Mungret_ht_snapshot.pdf",
    "Adare_v_Mungret_review.pdf",
  ]) {
    if (existsSync(file)) unlinkSync(file);
  }
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function toLoggedEvent(
  partial: Partial<LoggedMatchEvent> & { kind: LoggedMatchEvent["kind"]; teamSide: "FOR" | "OPP"; period: "1H" | "2H" },
): LoggedMatchEvent {
  const base = createMatchEvent({
    kind: partial.kind,
    nx: partial.nx ?? 0.5,
    ny: partial.ny ?? 0.5,
    half: partial.period === "1H" ? 1 : 2,
    timestamp: partial.matchClockSeconds ?? 0,
  });
  return {
    ...base,
    type: base.kind,
    segment: partial.segment ?? 1,
    matchClockSeconds: partial.matchClockSeconds ?? 0,
    createdAt: partial.createdAt ?? Date.now(),
    x: partial.nx ?? 0.5,
    y: partial.ny ?? 0.5,
    ...partial,
  } as LoggedMatchEvent;
}

/** Adare v Mungret style imported match — mixed H1/H2 with restarts and scores. */
function buildAdareMungretEvents(): LoggedMatchEvent[] {
  const golden = buildGoldenReportingFixture();
  return golden.map((e, i) =>
    toLoggedEvent({
      id: e.id,
      kind: e.kind,
      teamSide: e.teamSide,
      period: e.period,
      segment: e.segment,
      matchClockSeconds: e.matchClockSeconds ?? i * 60,
      nx: e.nx,
      ny: e.ny,
      restartOwner: e.restartOwner ?? undefined,
      tags: e.tags ?? undefined,
    }),
  );
}

function buildAdareMungretMatch(events: LoggedMatchEvent[]): ProTaggerSavedMatch {
  return {
    id: "adare-v-mungret",
    createdAt: Date.now(),
    homeTeamName: "Adare",
    awayTeamName: "Mungret",
    venue: "Adare GAA Grounds",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "Adare 0-04 (4) v Mungret 0-02 (2)",
    eventCount: events.length,
    events,
    homeSquad: { id: "home-squad", teamSide: "HOME", players: [] },
    awaySquad: { id: "away-squad", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [],
    awaySquadLiveState: [],
    restoreContext: {
      matchState: "FULL_TIME",
      currentHalf: 2,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "right",
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("snapshot export — P0 regression", () => {
  it("exportSnapshotPdf must not throw ReferenceError on team name initialisation", async () => {
    const events = buildAdareMungretEvents();
    const match = buildAdareMungretMatch(events);

    await expect(
      exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "HALF_TIME_SNAPSHOT")),
    ).resolves.toBeUndefined();

    await expect(
      exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "FULL_TIME_SNAPSHOT")),
    ).resolves.toBeUndefined();
  });

  it("all three PDF exports succeed from imported Adare v Mungret match", async () => {
    const events = buildAdareMungretEvents();
    const match = buildAdareMungretMatch(events);

    await expect(exportReviewPdf(proTaggerMatchToPdfInput(match))).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "HALF_TIME_SNAPSHOT")),
    ).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "FULL_TIME_SNAPSHOT")),
    ).resolves.toBeUndefined();
  });

  it("all three PDF exports succeed from native-style input (no import adapter)", async () => {
    const events = buildAdareMungretEvents();
    const base = {
      events,
      homeTeamName: "Adare",
      awayTeamName: "Mungret",
      sport: "gaelic" as const,
      homeAttackingDirection: "RIGHT" as const,
    };

    await expect(exportReviewPdf(base)).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf({ ...base, snapshotMode: "HALF_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
    await expect(
      exportSnapshotPdf({ ...base, snapshotMode: "FULL_TIME_SNAPSHOT" }),
    ).resolves.toBeUndefined();
  });

  it("snapshot MatchReport receives team names (not undefined)", async () => {
    const events = buildAdareMungretEvents();
    const match = buildAdareMungretMatch(events);
    const input = proTaggerMatchToSnapshotInput(match, "FULL_TIME_SNAPSHOT");

    // Exercise the export path; if home/away were undefined the builders would
    // render blank headers or throw during chain prompt derivation.
    let threw: unknown;
    try {
      await exportSnapshotPdf(input);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeUndefined();
    expect(input.homeTeamName).toBe("Adare");
    expect(input.awayTeamName).toBe("Mungret");
  });
});
