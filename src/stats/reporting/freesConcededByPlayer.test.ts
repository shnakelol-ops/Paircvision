// Frees Conceded by Player — the ranking on the Player Contributions page.
//
// Built from saved Event Stats data only: Free Conceded taps (FREE_CONCEDED,
// teamSide FOR, OUR player who fouled) plus the other team's FREE_WON. Player
// counts come from collectPlayerStats (Player Breakdown's aggregation); the
// team total uses Free Kick Analysis' formula. These tests check the ranking
// and its reconciliation, and that the rendered PDF agrees with the Player
// Breakdown and Free Kick Analysis pages of the same export.
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectPlayerStats,
  exportReviewPdf,
  makePlayerContributionsPage,
  rankFreesConcededByPlayer,
  type FreesConcededRanking,
  type PdfExportEvent,
  type PdfSquadPlayer,
} from "../reviewPdfExport";
import { buildMatchReport } from "./matchReport";
import { adaptProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { proTaggerMatchToPdfInput } from "../../pro-tagger/pro-tagger-review-adapter";
import type { ProTaggerSavedMatch } from "../../pro-tagger/pro-tagger-storage";

const HOME = "Ballyboden";
const AWAY = "Na Fianna";
const LONG_NAME = "Seán Ó Cinnéide-Fitzgerald Mac Giolla Phádraig Uí Bhriain na hÉireann";

// Full 20-player squads, as Event Stats' default squad builds them.
const homeSquad: PdfSquadPlayer[] = Array.from({ length: 20 }, (_, i) => ({
  id: `home-${i + 1}`, number: i + 1, name: i + 1 === 9 ? LONG_NAME : `Home ${i + 1}`,
}));
const awaySquad: PdfSquadPlayer[] = Array.from({ length: 20 }, (_, i) => ({
  id: `away-${i + 1}`, number: i + 1, name: `Away ${i + 1}`,
}));

let clock = 0;
/** A Free tap exactly as Event Stats stores it: always the FOR row, our player. */
function free(tile: "Won" | "Conceded", half: 1 | 2, number: number | null): PdfExportEvent {
  clock += 20;
  const p = number == null ? null : homeSquad[number - 1];
  return adaptProTaggerAction({
    familyId: "FREE", tileLabel: tile, teamSide: "FOR",
    nx: 0.5, ny: 0.5, half, matchClockSeconds: clock,
    ...(p ? { playerId: p.id, playerName: p.name, playerNumber: p.number, squadId: "home-squad" } : {}),
  }) as unknown as PdfExportEvent;
}

// Ballyboden concede 15 frees: 13 to players, 2 untagged. Ballyboden win 4.
//   #7  1H 1 · 2H 2 = 3   (ties #4 on total, more in 2H → ranks first)
//   #4  1H 2 · 2H 1 = 3
//   #9  1H 0 · 2H 2 = 2   (ties #3, more in 2H → ahead of #3)
//   #3  1H 1 · 2H 1 = 2
//   #12 1H 0 · 2H 1 = 1   (ties #11 and #15, the only one with a 2H free → 5th)
//   #11 1H 1 · 2H 0 = 1   → Other players
//   #15 1H 1 · 2H 0 = 1   → Other players (after #11 on jersey number)
//   untagged 1H 1 · 2H 1
function matchEvents(): PdfExportEvent[] {
  clock = 0;
  return [
    free("Conceded", 1, 4), free("Conceded", 1, 4), free("Conceded", 1, 7), free("Conceded", 1, 3),
    free("Conceded", 1, 11), free("Conceded", 1, 15), free("Conceded", 1, null),
    free("Won", 1, 8), free("Won", 1, 10),
    free("Conceded", 2, 4), free("Conceded", 2, 7), free("Conceded", 2, 7), free("Conceded", 2, 9),
    free("Conceded", 2, 9), free("Conceded", 2, 3), free("Conceded", 2, 12), free("Conceded", 2, null),
    free("Won", 2, 8), free("Won", 2, null),
  ];
}

function expectReconciles(r: FreesConcededRanking) {
  for (const key of ["h1", "h2", "total"] as const) {
    const parts = r.top.reduce((n, p) => n + p[key], 0) + r.otherPlayers[key] + r.unattributed[key];
    expect(parts, `${r.teamSide} ${key}`).toBe(r.teamTotal[key]);
  }
}

describe("rankFreesConcededByPlayer — ranking, halves, Unknown and reconciliation", () => {
  const events = matchEvents();
  const home = rankFreesConcededByPlayer(events, "FOR", homeSquad, awaySquad);
  const away = rankFreesConcededByPlayer(events, "OPP", homeSquad, awaySquad);

  it("ranks the top five by full-match total, then second-half count, then jersey number", () => {
    expect(home.top.map((p) => [p.number, p.h1, p.h2, p.total])).toEqual([
      [7, 1, 2, 3],
      [4, 2, 1, 3],
      [9, 0, 2, 2],
      [3, 1, 1, 2],
      [12, 0, 1, 1],
    ]);
    expect(home.top[2].name).toBe(LONG_NAME);
  });

  it("puts every other player in Other players and untagged frees in Not attributed", () => {
    expect(home.otherPlayers).toEqual({ h1: 2, h2: 0, total: 2 });
    expect(home.unattributed).toEqual({ h1: 1, h2: 1, total: 2 });
    expect(home.teamTotal).toEqual({ h1: 7, h2: 8, total: 15 });
    expectReconciles(home);
  });

  it("each player's halves add up to their full-match total", () => {
    for (const p of home.top) expect(p.h1 + p.h2).toBe(p.total);
  });

  it("Free Won never counts as a free conceded", () => {
    // Ballyboden's 4 Free Won are Na Fianna's frees conceded — none attributable
    // to a Na Fianna player, because Event Stats tags OUR fouled player.
    expect(away.top).toEqual([]);
    expect(away.otherPlayers).toEqual({ h1: 0, h2: 0, total: 0 });
    expect(away.teamTotal).toEqual({ h1: 2, h2: 2, total: 4 });
    expect(away.unattributed).toEqual(away.teamTotal);
    expectReconciles(away);
  });

  it("agrees with Player Breakdown's Frees Con for every player", () => {
    const breakdown = collectPlayerStats(events, homeSquad, awaySquad).filter((p) => p.teamSide === "FOR");
    for (const p of home.top) {
      expect(breakdown.find((b) => b.id === p.id)!.freesCon).toBe(p.total);
    }
    const attributed = breakdown.reduce((n, p) => n + p.freesCon, 0);
    expect(attributed).toBe(home.teamTotal.total - home.unattributed.total);
  });

  it("a team with no frees conceded reconciles at zero", () => {
    const none = rankFreesConcededByPlayer([free("Won", 1, 8)], "FOR", homeSquad, awaySquad);
    expect(none.top).toEqual([]);
    expect(none.teamTotal).toEqual({ h1: 0, h2: 0, total: 0 });
    expectReconciles(none);
  });
});

describe("rankFreesConcededByPlayer — historical saved matches", () => {
  function saved(events: PdfExportEvent[], squads: boolean): ProTaggerSavedMatch {
    return {
      id: "m1", createdAt: 1, homeTeamName: HOME, awayTeamName: AWAY,
      venue: "", sport: "gaelic", matchType: "league", halfDurationMinutes: 30,
      scorelineSnapshot: "", eventCount: events.length,
      events: JSON.parse(JSON.stringify(events)),
      homeSquad: { id: "home-squad", teamSide: "HOME", players: squads ? homeSquad : [] },
      awaySquad: { id: "away-squad", teamSide: "AWAY", players: squads ? awaySquad : [] },
      homeSquadLiveState: [], awaySquadLiveState: [],
      restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 3600, firstHalfAttackingDirection: "right" },
    } as unknown as ProTaggerSavedMatch;
  }

  it("a saved match read back through the PDF adapter gives the same ranking", () => {
    const input = proTaggerMatchToPdfInput(saved(matchEvents(), true));
    const r = rankFreesConcededByPlayer(input.events as PdfExportEvent[], "FOR", input.homeSquadPlayers, input.awaySquadPlayers);
    expect(r.top.map((p) => p.number)).toEqual([7, 4, 9, 3, 12]);
    expect(r.teamTotal.total).toBe(15);
    expectReconciles(r);
  });

  it("a number-only tag (Review-edited / legacy) merges into the same player row", () => {
    const numberOnly = { ...free("Conceded", 2, null), playerNumber: 4 };
    const r = rankFreesConcededByPlayer([...matchEvents(), numberOnly], "FOR", homeSquad, awaySquad);
    expect(r.top.find((p) => p.number === 4)).toMatchObject({ h1: 2, h2: 2, total: 4 });
    expectReconciles(r);
  });

  it("a match saved without squad names still ranks by jersey number", () => {
    const events = [free("Conceded", 1, 6), free("Conceded", 2, 6), free("Conceded", 2, 2)]
      .map((e) => ({ ...e, playerId: undefined, playerName: undefined }));
    const r = rankFreesConcededByPlayer(events, "FOR");
    expect(r.top.map((p) => [p.number, p.h1, p.h2, p.total])).toEqual([[6, 1, 1, 2], [2, 0, 1, 1]]);
    expectReconciles(r);
  });

  it("legacy opposition FREE_WON events count as unattributed frees conceded", () => {
    const oppWon = { ...free("Won", 1, null), teamSide: "OPP" as const };
    const r = rankFreesConcededByPlayer([...matchEvents(), oppWon], "FOR", homeSquad, awaySquad);
    expect(r.teamTotal.total).toBe(16);
    expect(r.unattributed.total).toBe(3);
    expectReconciles(r);
  });
});

// ── Rendered pages ───────────────────────────────────────────────────────────

class CaptureCanvasContext {
  fillStyle = ""; strokeStyle = ""; font = ""; lineWidth = 1;
  textBaseline = "alphabetic"; textAlign = "left"; globalAlpha = 1;
  texts: string[] = [];
  save() {} restore() {} fillRect() {} strokeRect() {}
  fillText(text: string) { this.texts.push(text); }
  stroke() {} beginPath() {} moveTo() {} lineTo() {} arc() {} ellipse() {}
  quadraticCurveTo() {} closePath() {} fill() {} setLineDash() {} clip() {}
  rect() {} roundRect() {} drawImage() {} translate() {} rotate() {} scale() {}
  measureText(text: string) { return { width: text.length * 8 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}

class CaptureCanvas {
  width = 1920; height = 1080;
  readonly ctx = new CaptureCanvasContext();
  getContext() { return this.ctx as unknown as CanvasRenderingContext2D; }
  toDataURL() { return "data:image/jpeg;base64,AAAA"; }
}

const canvases: CaptureCanvas[] = [];
beforeEach(() => {
  canvases.length = 0;
  class MockPath2D { constructor(_d?: string) {} }
  (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      if (tag !== "canvas") return {};
      const c = new CaptureCanvas();
      canvases.push(c);
      return c;
    },
  };
});

function contributionsTexts(events: PdfExportEvent[]): string[] {
  const report = buildMatchReport<PdfExportEvent>({ events, homeTeam: HOME, awayTeam: AWAY });
  const canvas = makePlayerContributionsPage(events, report, HOME, AWAY, 8, 30, homeSquad, awaySquad) as unknown as CaptureCanvas;
  return canvas.ctx.texts;
}

describe("Player Contributions page — Frees Conceded by Player block", () => {
  it("renders both teams' blocks with player rows, Other players, Not attributed and the team total", () => {
    const texts = contributionsTexts(matchEvents());
    expect(texts.filter((t) => t === "FREES CONCEDED BY PLAYER")).toHaveLength(2);
    for (const label of ["#7 Home 7", "#4 Home 4", "#3 Home 3", "#12 Home 12", "Other players", "Not attributed to a player"]) {
      expect(texts).toContain(label);
    }
    expect(texts).toContain(`${HOME} total`);
    expect(texts).toContain(`${AWAY} total`);
    expect(texts).toContain(`No frees conceded attributed to a ${AWAY} player`);
    // Only five named players: #11 and #15 are folded into Other players.
    expect(texts).not.toContain("#11 Home 11");
    expect(texts).not.toContain("#15 Home 15");
  });

  it("truncates a long player name to the column width with an ellipsis", () => {
    const texts = contributionsTexts(matchEvents());
    const long = texts.find((t) => t.startsWith("#9 Seán"))!;
    expect(long.endsWith("…")).toBe(true);
    expect(long.length * 8).toBeLessThanOrEqual(560 + 8);
    expect(long).not.toBe(`#9 ${LONG_NAME}`);
  });

  it("existing table content is unchanged", () => {
    const texts = contributionsTexts(matchEvents());
    expect(texts).toContain("Player Contributions");
    for (const header of ["PLAYER", "SCORE", "SHARE", "SHOTS", "T/O W-L", "KO W-L", "NET BALL"]) {
      expect(texts).toContain(header);
    }
  });
});

describe("Full Match Review PDF export — ranking agrees with Player Breakdown and Free Kick Analysis", () => {
  it("one export: same totals on all three pages, no extra page", async () => {
    const input = proTaggerMatchToPdfInput({
      id: "m1", createdAt: 1, homeTeamName: HOME, awayTeamName: AWAY, venue: "", sport: "gaelic",
      matchType: "league", halfDurationMinutes: 30, scorelineSnapshot: "", eventCount: 0,
      events: JSON.parse(JSON.stringify(matchEvents())),
      homeSquad: { id: "home-squad", teamSide: "HOME", players: homeSquad },
      awaySquad: { id: "away-squad", teamSide: "AWAY", players: awaySquad },
      homeSquadLiveState: [], awaySquadLiveState: [],
      restoreContext: { matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 3600, firstHalfAttackingDirection: "right" },
    } as unknown as ProTaggerSavedMatch);
    await exportReviewPdf(input);

    const byHeader = (h: string) => canvases.filter((c) => c.ctx.texts.includes(h));
    const contributions = byHeader("Player Contributions");
    const freeKick = byHeader("Free Kick Analysis");
    expect(contributions).toHaveLength(1);
    expect(freeKick).toHaveLength(1);

    // Free Kick Analysis: Na Fianna won 15 (= Ballyboden conceded), Ballyboden won 4.
    expect(freeKick[0].ctx.texts).toContain("Opposition won 15 possession frees");
    expect(freeKick[0].ctx.texts).toContain("Won 4 possession frees");

    // The ranking's team totals print the same numbers (last cell of each total row).
    const t = contributions[0].ctx.texts;
    const totalCells = (team: string) => t.slice(t.indexOf(`${team} total`) + 1, t.indexOf(`${team} total`) + 4);
    expect(totalCells(HOME)).toEqual(["7", "8", "15"]);
    expect(totalCells(AWAY)).toEqual(["2", "2", "4"]);

    // Player Breakdown pages of the same export: each row draws #, Name, then
    // its stat cells in order — Frees Con is the 11th cell after the number.
    const breakdownTexts = byHeader("Player Breakdown").flatMap((c) => c.ctx.texts);
    expect(breakdownTexts.length).toBeGreaterThan(0);
    const freesConOnBreakdown = (n: number) => {
      const i = breakdownTexts.findIndex((v, k) => v === `#${n}` && breakdownTexts[k + 1] === homeSquad[n - 1].name);
      expect(i, `#${n} row on Player Breakdown`).toBeGreaterThanOrEqual(0);
      return Number(breakdownTexts[i + 11]);
    };
    const ranking = rankFreesConcededByPlayer(input.events as PdfExportEvent[], "FOR", input.homeSquadPlayers, input.awaySquadPlayers);
    for (const p of ranking.top) expect(freesConOnBreakdown(p.number!)).toBe(p.total);
    // Its Ballyboden Frees Con column sums to the attributed 13.
    const attributed = [3, 4, 7, 9, 11, 12, 15].reduce((n, num) => n + freesConOnBreakdown(num), 0);
    expect(attributed).toBe(13);
    expect(attributed + ranking.unattributed.total).toBe(15);
  });
});
