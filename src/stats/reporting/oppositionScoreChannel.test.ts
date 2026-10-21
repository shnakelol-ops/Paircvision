// Regression coverage: Opposition Facts "Score zone (avg position)".
//
// The label used to average nx — the LENGTH-of-pitch axis — and print it as
// a left/right channel, with no correction for which way the opposition was
// attacking or for the ends swapping at half-time. A score taken near the
// goal the opposition attacks in the first half (low nx) always read as
// "Left Channel", whatever channel it actually came from.
//
// Correct reading: channels run across the WIDTH (ny), seen from the
// opposition's own attacking direction for that half. In canonical
// RIGHT-attacking space high ny is the attacker's Right (zone-maps.ts).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveOppositionScoreChannel,
  exportReviewPdf,
  makeOppositionFactsPage,
  type PdfExportEvent,
} from "../reviewPdfExport";
import { buildMatchReport } from "./matchReport";
import { adaptProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { proTaggerMatchToPdfInput } from "../../pro-tagger/pro-tagger-review-adapter";
import type { ProTaggerSavedMatch } from "../../pro-tagger/pro-tagger-storage";
import type { ProTaggerFamilyId } from "../../pro-tagger/pro-tagger-families";
import type { AttackingDirection } from "../zones/zone-orientation";

type Channel = "Left" | "Centre" | "Right";
type Half = 1 | 2;

function oppAttackingDirection(homeFirstHalf: AttackingDirection, half: Half): AttackingDirection {
  const homeThisHalf = half === 1 ? homeFirstHalf : homeFirstHalf === "RIGHT" ? "LEFT" : "RIGHT";
  return homeThisHalf === "RIGHT" ? "LEFT" : "RIGHT";
}

/** Physical ny for a channel, as seen by a team attacking `direction`.
 *  Attacking RIGHT, the attacker's right hand points to high ny; attacking
 *  LEFT, it points to low ny. */
function physicalNy(channel: Channel, direction: AttackingDirection): number {
  const canonical = channel === "Left" ? 0.1 : channel === "Right" ? 0.9 : 0.5;
  return direction === "RIGHT" ? canonical : 1 - canonical;
}

/** Physical nx just in front of the goal the opposition attacks this half. */
function nearOppTargetGoal(direction: AttackingDirection): number {
  return direction === "RIGHT" ? 0.9 : 0.1;
}

function oppScore(
  homeFirstHalf: AttackingDirection,
  half: Half,
  channel: Channel,
  familyId: ProTaggerFamilyId = "POINT",
): PdfExportEvent {
  const dir = oppAttackingDirection(homeFirstHalf, half);
  return adaptProTaggerAction({
    familyId,
    tileLabel: "Play",
    teamSide: "OPP",
    nx: nearOppTargetGoal(dir),
    ny: physicalNy(channel, dir),
    half,
    matchClockSeconds: 600,
  }) as unknown as PdfExportEvent;
}

const LABEL: Record<Channel, string> = { Left: "Left Channel", Centre: "Central", Right: "Right Channel" };

describe("deriveOppositionScoreChannel — both directions, both halves", () => {
  for (const homeFirstHalf of ["RIGHT", "LEFT"] as const) {
    for (const half of [1, 2] as const) {
      for (const channel of ["Left", "Centre", "Right"] as const) {
        it(`home attacks ${homeFirstHalf} in 1H · ${half === 1 ? "1H" : "2H"} · opposition score from their ${channel}`, () => {
          const events = [oppScore(homeFirstHalf, half, channel)];
          expect(deriveOppositionScoreChannel(events, homeFirstHalf)).toBe(LABEL[channel]);
        });
      }
    }
  }

  it("the same channel in both halves stays that channel although the ends swapped", () => {
    // Their Left is high ny in one half and low ny in the other.
    const events = [oppScore("RIGHT", 1, "Left"), oppScore("RIGHT", 2, "Left"), oppScore("RIGHT", 2, "Left", "GOAL")];
    expect(new Set(events.map((e) => e.ny)).size).toBe(2);
    expect(deriveOppositionScoreChannel(events, "RIGHT")).toBe("Left Channel");
  });

  it("depth up the pitch (nx) never decides the channel", () => {
    const central = adaptProTaggerAction({
      familyId: "POINT", tileLabel: "Play", teamSide: "OPP",
      nx: 0.05, ny: 0.5, half: 1, matchClockSeconds: 100,
    }) as unknown as PdfExportEvent;
    expect(deriveOppositionScoreChannel([central], "RIGHT")).toBe("Central");
    expect(deriveOppositionScoreChannel([{ ...central, nx: 0.95, x: 0.95 }], "RIGHT")).toBe("Central");
  });

  it("ignores home scores and opposition non-scores; '—' when there are no opposition scores", () => {
    const homeScore = adaptProTaggerAction({
      familyId: "POINT", tileLabel: "Play", teamSide: "FOR", nx: 0.9, ny: 0.9, half: 1, matchClockSeconds: 10,
    }) as unknown as PdfExportEvent;
    const oppWide = adaptProTaggerAction({
      familyId: "WIDE", tileLabel: "Play", teamSide: "OPP", nx: 0.1, ny: 0.9, half: 1, matchClockSeconds: 20,
    }) as unknown as PdfExportEvent;
    expect(deriveOppositionScoreChannel([homeScore, oppWide], "RIGHT")).toBe("—");
    expect(deriveOppositionScoreChannel([homeScore, oppWide, oppScore("RIGHT", 1, "Right")], "RIGHT")).toBe("Right Channel");
  });
});

// ── Rendered page ────────────────────────────────────────────────────────────

class CaptureCanvasContext {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1;
  textBaseline = "alphabetic"; textAlign = "left"; globalAlpha = 1;
  texts: string[] = [];
  save() {} restore() {} fillRect() {} strokeRect() {}
  fillText(text: string) { this.texts.push(text); }
  stroke() {} beginPath() {} moveTo() {} lineTo() {} arc() {} ellipse() {}
  quadraticCurveTo() {} closePath() {} fill() {} setLineDash() {} clip() {}
  rect() {} roundRect() {} drawImage() {}
  measureText(text: string) { return { width: text.length * 8 }; }
  createLinearGradient() { return { addColorStop() {} }; }
}

class CaptureCanvas {
  width = 1920; height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() { return this.ctx as unknown as CanvasRenderingContext2D; }
  toDataURL() { return "data:image/jpeg;base64,AAAA"; }
}

function renderOppositionFacts(events: PdfExportEvent[], homeFirstHalf: AttackingDirection): string[] {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === "canvas" ? new CaptureCanvas() : {}),
  };
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: "Ballyboden", awayTeam: "Na Fianna" });
  const canvas = makeOppositionFactsPage(
    events, report, "Ballyboden", "Na Fianna", 1, 1, "gaelic", homeFirstHalf,
  ) as unknown as CaptureCanvas;
  return canvas.ctx.texts;
}

describe("Opposition Facts page — Score zone row", () => {
  it("prints the opposition's real channel for scores near the goal they attack in the 1st half", () => {
    // Home attacks RIGHT in 1H → opposition attacks LEFT, so its scores sit at
    // low nx. Old code: avg nx 0.1 → "Left Channel" regardless of width.
    const events = [oppScore("RIGHT", 1, "Right"), oppScore("RIGHT", 1, "Right", "GOAL")];
    const texts = renderOppositionFacts(events, "RIGHT");
    expect(texts).toContain("Score zone (avg position)");
    expect(texts).toContain("Right Channel");
    expect(texts).not.toContain("Left Channel");
  });

  it("reads the 2nd half from the swapped direction (home attacks LEFT first)", () => {
    const events = [oppScore("LEFT", 2, "Left"), oppScore("LEFT", 2, "Left")];
    const texts = renderOppositionFacts(events, "LEFT");
    expect(texts).toContain("Left Channel");
    expect(texts).not.toContain("Right Channel");
  });
});

// ── Saved-match compatibility ────────────────────────────────────────────────

function savedEventStatsMatch(events: PdfExportEvent[], firstHalfAttackingDirection: "left" | "right"): ProTaggerSavedMatch {
  return {
    id: "m1", createdAt: 1, homeTeamName: "Ballyboden", awayTeamName: "Na Fianna",
    venue: "", sport: "gaelic", matchType: "league", halfDurationMinutes: 30,
    scorelineSnapshot: "", eventCount: events.length,
    events: JSON.parse(JSON.stringify(events)),
    homeSquad: { id: "h", teamSide: "HOME", players: [] },
    awaySquad: { id: "a", teamSide: "AWAY", players: [] },
    homeSquadLiveState: [], awaySquadLiveState: [],
    restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 3600, firstHalfAttackingDirection },
  } as unknown as ProTaggerSavedMatch;
}

describe("Saved Event Stats match → Opposition Facts input", () => {
  it("uses the match's stored 1H attacking direction", () => {
    const events = [oppScore("LEFT", 1, "Right"), oppScore("LEFT", 2, "Right")];
    const input = proTaggerMatchToPdfInput(savedEventStatsMatch(events, "left"));
    expect(input.homeAttackingDirection).toBe("LEFT");
    expect(deriveOppositionScoreChannel(input.events as unknown as PdfExportEvent[], input.homeAttackingDirection))
      .toBe("Right Channel");
  });
});

describe("exportReviewPdf → Opposition Facts — stored 1H direction reaches the page", () => {
  // Every canvas the full export draws, so the Opposition Facts page can be
  // picked out by its own header text.
  const canvases: CaptureCanvas[] = [];

  // exportReviewPdf saves "<home>_v_<away>_review.pdf" into the working
  // directory (jsPDF writes synchronously under Node). Remove that one file
  // after each test, pass or fail — but only when this test created or
  // rewrote it, so an unrelated file of the same name is never touched.
  const EXPORTED_PDF = resolve("Ballyboden_v_Na_Fianna_review.pdf");
  const pdfMtime = () => statSync(EXPORTED_PDF, { throwIfNoEntry: false })?.mtimeMs;
  let mtimeBefore: number | undefined;
  beforeEach(() => {
    mtimeBefore = pdfMtime();
  });
  afterEach(() => {
    const after = pdfMtime();
    if (after !== undefined && after !== mtimeBefore) rmSync(EXPORTED_PDF, { force: true });
  });

  beforeEach(() => {
    canvases.length = 0;
    class MockPath2D {
      constructor(_d?: string) {}
    }
    (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        if (tag !== "canvas") return {};
        const canvas = new CaptureCanvas();
        canvases.push(canvas);
        return canvas;
      },
    };
  });

  it("prints the opposition's channel from the saved match's direction, in both halves", async () => {
    // Home attacked LEFT first. Both scores are from the opposition's Right;
    // read with the default RIGHT instead, both would print "Left Channel".
    const events = [oppScore("LEFT", 1, "Right"), oppScore("LEFT", 2, "Right", "GOAL")];
    await exportReviewPdf(proTaggerMatchToPdfInput(savedEventStatsMatch(events, "left")));

    const page = canvases.find((c) => c.ctx.texts.includes("Score zone (avg position)"));
    expect(page, "Opposition Facts page not rendered").toBeDefined();
    expect(page!.ctx.texts).toContain("Opposition Facts");
    expect(page!.ctx.texts).toContain("Right Channel");
    expect(page!.ctx.texts).not.toContain("Left Channel");
  });
});
