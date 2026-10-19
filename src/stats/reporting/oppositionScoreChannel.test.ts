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
import { describe, expect, it } from "vitest";
import {
  deriveOppositionScoreChannel,
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

describe("Saved Event Stats match → Opposition Facts input", () => {
  it("uses the match's stored 1H attacking direction", () => {
    const events = [oppScore("LEFT", 1, "Right"), oppScore("LEFT", 2, "Right")];
    const saved = {
      id: "m1", createdAt: 1, homeTeamName: "Ballyboden", awayTeamName: "Na Fianna",
      venue: "", sport: "gaelic", matchType: "league", halfDurationMinutes: 30,
      scorelineSnapshot: "", eventCount: events.length,
      events: JSON.parse(JSON.stringify(events)),
      homeSquad: { id: "h", teamSide: "HOME", players: [] },
      awaySquad: { id: "a", teamSide: "AWAY", players: [] },
      homeSquadLiveState: [], awaySquadLiveState: [],
      restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 3600, firstHalfAttackingDirection: "left" },
    } as unknown as ProTaggerSavedMatch;
    const input = proTaggerMatchToPdfInput(saved);
    expect(input.homeAttackingDirection).toBe("LEFT");
    expect(deriveOppositionScoreChannel(input.events as unknown as PdfExportEvent[], input.homeAttackingDirection))
      .toBe("Right Channel");
  });
});
