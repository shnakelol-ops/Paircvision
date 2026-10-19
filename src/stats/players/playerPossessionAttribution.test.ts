// Regression coverage: player credit on turnovers and kickouts.
//
// Turnover/kickout events store teamSide as possession OWNERSHIP (see
// resolveRestartOutcome in pro-tagger-adapter.ts). Event Stats tags the
// player on the row that was tapped — the team that won the ball — so an
// opposition player who wins our kickout sits on a KICKOUT_CONCEDED event
// with teamSide "FOR", and an opposition player who wins a turnover sits on
// a TURNOVER_LOST event with teamSide "FOR".
//
// Both player aggregators (collectPlayerStats → Player Breakdown pages;
// buildInfluenceAnalysis → Player Contributions, Player Chain Involvement,
// Opposition Markers) used to count by kind alone, crediting those
// ball-winners with "K/O Conceded" / "T/O Lost". Events are built here
// through the real capture adapters, not hand-written, so the fixtures
// carry exactly what Event Stats and Rapid Capture store.
import { describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { applyPlayerNumber, buildCapturedEvent } from "../../rapid-capture/rapid-capture-events";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import type { MatchEventKind } from "../../core/stats/stats-event-model";
import { analyseChains } from "../chains/chain-engine";
import type { ChainableEvent } from "../chains/chain-types";
import { collectPlayerStats, type PdfExportEvent } from "../reviewPdfExport";
import { buildInfluenceAnalysis, type InfluenceEvent, type PlayerRosterEntry } from "./influence";
import { resolvePlayerPossessionCredit } from "./player-possession-credit";

const HOME_SQUAD_ID = "home-squad";
const AWAY_SQUAD_ID = "away-squad";
// Same jersey numbers on both teams — attribution must never lean on number.
const homeRoster: PlayerRosterEntry[] = [
  { id: "home-4", number: 4, name: "Home Four" },
  { id: "home-8", number: 8, name: "Home Eight" },
];
const awayRoster: PlayerRosterEntry[] = [
  { id: "away-4", number: 4, name: "Away Four" },
  { id: "away-8", number: 8, name: "Away Eight" },
];

type Side = "FOR" | "OPP";
type Half = 1 | 2;

function rosterPlayer(side: Side, number: 4 | 8) {
  const roster = side === "FOR" ? homeRoster : awayRoster;
  const p = roster.find((r) => r.number === number)!;
  return {
    playerId: p.id,
    playerName: p.name,
    playerNumber: p.number,
    squadId: side === "FOR" ? HOME_SQUAD_ID : AWAY_SQUAD_ID,
  };
}

/** One Event Stats tap, exactly as ProTaggerLiveScreen.handlePitchTap builds it:
 *  the player always comes from the TAPPED row's squad. */
function proTap(
  action: Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide" | "restartOwner">,
  number: 4 | 8,
  half: Half,
  clock: number,
): LoggedMatchEvent {
  return adaptProTaggerAction({
    ...action,
    nx: 0.5,
    ny: 0.5,
    half,
    matchClockSeconds: clock,
    ...rosterPlayer(action.teamSide, number),
  });
}

/** Saved matches are JSON in localStorage — reports read the parsed copy. */
function viaStorage<T>(events: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(events)) as T[];
}

function pdfStats(events: readonly LoggedMatchEvent[]) {
  return collectPlayerStats(viaStorage(events) as unknown as PdfExportEvent[], homeRoster, awayRoster);
}

function influence(events: readonly (InfluenceEvent & ChainableEvent)[]) {
  const stored = viaStorage(events);
  const analysis = analyseChains(stored);
  return buildInfluenceAnalysis(stored, analysis, "Home", "Away", homeRoster, awayRoster);
}

function pdfRow(events: readonly LoggedMatchEvent[], id: string) {
  const row = pdfStats(events).find((p) => p.id === id);
  expect(row, `player ${id} missing from Player Breakdown`).toBeDefined();
  return row!;
}

function influenceRow(events: readonly LoggedMatchEvent[], id: string) {
  const a = influence(events as unknown as (InfluenceEvent & ChainableEvent)[]);
  const row = [...a.home.players, ...a.away.players].find((p) => p.key === id);
  expect(row, `player ${id} missing from Player Influence`).toBeDefined();
  return row!;
}

describe("resolvePlayerPossessionCredit — truth table", () => {
  const cases: Array<[MatchEventKind, Side, Side, string | null]> = [
    // player on the event's own teamSide → the kind as named
    ["TURNOVER_WON", "FOR", "FOR", "TURNOVER_WON"],
    ["TURNOVER_LOST", "FOR", "FOR", "TURNOVER_LOST"],
    ["KICKOUT_WON", "OPP", "OPP", "KICKOUT_WON"],
    ["KICKOUT_CONCEDED", "FOR", "FOR", "KICKOUT_LOST"],
    // player on the other team → the opposite outcome
    ["TURNOVER_WON", "FOR", "OPP", "TURNOVER_LOST"],
    ["TURNOVER_LOST", "FOR", "OPP", "TURNOVER_WON"],
    ["KICKOUT_WON", "OPP", "FOR", "KICKOUT_LOST"],
    ["KICKOUT_CONCEDED", "FOR", "OPP", "KICKOUT_WON"],
    ["KICKOUT_CONCEDED", "OPP", "FOR", "KICKOUT_WON"],
    // not a possession kind
    ["FREE_CONCEDED", "FOR", "OPP", null],
    ["POINT", "OPP", "OPP", null],
  ];
  it.each(cases)("%s (event %s, player %s) → %s", (kind, eventSide, playerSide, expected) => {
    expect(resolvePlayerPossessionCredit(kind, eventSide, playerSide)).toBe(expected);
  });
});

describe("Event Stats kickouts — the player who won the ball is credited with the win", () => {
  // Every owner × winner combination, in both halves.
  const combos: Array<{ owner: Side; winner: Side }> = [
    { owner: "FOR", winner: "FOR" },
    { owner: "FOR", winner: "OPP" },
    { owner: "OPP", winner: "OPP" },
    { owner: "OPP", winner: "FOR" },
  ];
  for (const half of [1, 2] as const) {
    for (const { owner, winner } of combos) {
      it(`${half === 1 ? "1H" : "2H"}: ${owner} kickout won by ${winner} #8`, () => {
        const e = proTap({ familyId: "RESTART", tileLabel: "Clean", teamSide: winner, restartOwner: owner }, 8, half, 300);
        // Capture stores the owner on the event, the winner on the player.
        expect(e.kind).toBe(owner === winner ? "KICKOUT_WON" : "KICKOUT_CONCEDED");
        expect(e.teamSide).toBe(owner);

        const id = winner === "FOR" ? "home-8" : "away-8";
        const pdf = pdfRow([e], id);
        expect(pdf.teamSide).toBe(winner);
        expect({ koWon: pdf.koWon, koCon: pdf.koCon }).toEqual({ koWon: 1, koCon: 0 });

        const inf = influenceRow([e], id);
        expect(inf.teamSide).toBe(winner);
        expect({ koWon: inf.koWon, koLost: inf.koLost }).toEqual({ koWon: 1, koLost: 0 });
        expect(inf.netBallImpact).toBe(1);
      });
    }
  }
});

describe("Event Stats turnovers — the player who won the ball is credited with the win", () => {
  for (const half of [1, 2] as const) {
    for (const winner of ["FOR", "OPP"] as const) {
      it(`${half === 1 ? "1H" : "2H"}: turnover won by ${winner} #4`, () => {
        const e = proTap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: winner }, 4, half, 600);
        // Both rows are stored from FOR's perspective.
        expect(e.kind).toBe(winner === "FOR" ? "TURNOVER_WON" : "TURNOVER_LOST");
        expect(e.teamSide).toBe("FOR");

        const id = winner === "FOR" ? "home-4" : "away-4";
        const pdf = pdfRow([e], id);
        expect(pdf.teamSide).toBe(winner);
        expect({ toWon: pdf.toWon, toLost: pdf.toLost }).toEqual({ toWon: 1, toLost: 0 });

        const inf = influenceRow([e], id);
        expect(inf.teamSide).toBe(winner);
        expect({ toWon: inf.toWon, toLost: inf.toLost }).toEqual({ toWon: 1, toLost: 0 });
        expect(inf.netBallImpact).toBe(1);
      });
    }
  }
});

describe("Event Stats — a full mixed sequence for both teams", () => {
  it("each player's won/lost totals match what they actually did", () => {
    const events = [
      proTap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" }, 8, 1, 60),   // home-8 wins own K/O
      proTap({ familyId: "RESTART", tileLabel: "Break", teamSide: "OPP", restartOwner: "FOR" }, 8, 1, 200),  // away-8 wins our K/O
      proTap({ familyId: "RESTART", tileLabel: "Break", teamSide: "FOR", restartOwner: "OPP" }, 8, 2, 100),  // home-8 wins their K/O
      proTap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }, 8, 2, 400),  // away-8 wins own K/O
      proTap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }, 4, 1, 900),                    // away-4 wins T/O
      proTap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "OPP" }, 4, 2, 900),              // away-4 wins T/O
      proTap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }, 4, 2, 1200),                   // home-4 wins T/O
    ];
    const pdf = pdfStats(events);
    const get = (id: string) => pdf.find((p) => p.id === id)!;
    expect(get("home-8")).toMatchObject({ teamSide: "FOR", koWon: 2, koCon: 0 });
    expect(get("away-8")).toMatchObject({ teamSide: "OPP", koWon: 2, koCon: 0 });
    expect(get("away-4")).toMatchObject({ teamSide: "OPP", toWon: 2, toLost: 0 });
    expect(get("home-4")).toMatchObject({ teamSide: "FOR", toWon: 1, toLost: 0 });

    const a = influence(events as unknown as (InfluenceEvent & ChainableEvent)[]);
    const inf = (id: string) => [...a.home.players, ...a.away.players].find((p) => p.key === id)!;
    expect(inf("home-8")).toMatchObject({ koWon: 2, koLost: 0, netBallImpact: 2 });
    expect(inf("away-8")).toMatchObject({ koWon: 2, koLost: 0, netBallImpact: 2 });
    expect(inf("away-4")).toMatchObject({ toWon: 2, toLost: 0, netBallImpact: 2 });
    expect(inf("home-4")).toMatchObject({ toWon: 1, toLost: 0, netBallImpact: 1 });
  });
});

describe("Chain Involvement — a kickout winner from the other team than the owner is credited", () => {
  it("away player who wins OUR kickout gets chain involvement for the away score that follows", () => {
    const events = [
      proTap({ familyId: "RESTART", tileLabel: "Break", teamSide: "OPP", restartOwner: "FOR" }, 8, 1, 300),
      proTap({ familyId: "POINT", tileLabel: "Play", teamSide: "OPP" }, 4, 1, 330),
    ];
    const a = influence(events as unknown as (InfluenceEvent & ChainableEvent)[]);
    const away8 = a.away.players.find((p) => p.key === "away-8")!;
    expect(away8.chainInvolvementCount).toBe(1);
    expect(away8.assistsProxy).toBe(1);
    expect(a.home.players.find((p) => p.key === "away-8")).toBeUndefined();
  });

  it("home player who wins THEIR kickout gets chain involvement for the home score that follows (2H)", () => {
    const events = [
      proTap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" }, 8, 2, 300),
      proTap({ familyId: "GOAL", tileLabel: "Play", teamSide: "FOR" }, 4, 2, 340),
    ];
    const a = influence(events as unknown as (InfluenceEvent & ChainableEvent)[]);
    const home8 = a.home.players.find((p) => p.key === "home-8")!;
    expect(home8.chainInvolvementCount).toBe(1);
    expect(home8.assistsProxy).toBe(1);
  });
});

describe("Match Stats / Rapid Capture shape — player on the event's own side — unchanged", () => {
  // Rapid Capture tags players from the event's teamSide squad
  // (RapidCaptureLitePage enrichmentSquad), as Match Stats does: a
  // KICKOUT_CONCEDED / TURNOVER_LOST player is the one who LOST the ball.
  function rapid(kind: MatchEventKind, teamSide: Side, number: 4 | 8, clock: number): LoggedMatchEvent {
    const e = buildCapturedEvent({ kind, nx: 0.5, ny: 0.5, half: 1, timestamp: clock, teamSide, createdAt: 1 });
    const roster = teamSide === "FOR" ? homeRoster : awayRoster;
    const p = roster.find((r) => r.number === number)!;
    return applyPlayerNumber([e], e.id, p)[0] as unknown as LoggedMatchEvent;
  }

  it("our player who lost our kickout / turnover is still credited with the loss", () => {
    const events = [
      rapid("KICKOUT_CONCEDED", "FOR", 8, 100),
      rapid("TURNOVER_LOST", "FOR", 4, 200),
      rapid("KICKOUT_WON", "OPP", 8, 300),
      rapid("TURNOVER_WON", "FOR", 8, 400),
    ];
    const pdf = pdfStats(events);
    const get = (id: string) => pdf.find((p) => p.id === id)!;
    expect(get("home-8")).toMatchObject({ koWon: 0, koCon: 1, toWon: 1 });
    expect(get("home-4")).toMatchObject({ toWon: 0, toLost: 1 });
    expect(get("away-8")).toMatchObject({ koWon: 1, koCon: 0 });

    const a = influence(events as unknown as (InfluenceEvent & ChainableEvent)[]);
    const inf = (id: string) => [...a.home.players, ...a.away.players].find((p) => p.key === id)!;
    expect(inf("home-8")).toMatchObject({ koWon: 0, koLost: 1, toWon: 1 });
    expect(inf("home-4")).toMatchObject({ toWon: 0, toLost: 1 });
    expect(inf("away-8")).toMatchObject({ koWon: 1, koLost: 0 });
  });
});

describe("Saved-match compatibility — legacy event shapes", () => {
  it("a number-only player with no roster match falls back to the event's own side (unchanged)", () => {
    // Pre-squadId / pre-playerId legacy shape: no id, no roster entry for #11.
    const legacy = {
      ...adaptProTaggerAction({
        familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP",
        nx: 0.4, ny: 0.6, half: 1, matchClockSeconds: 120,
      }),
      playerNumber: 11,
    };
    delete (legacy as { restartOwner?: unknown }).restartOwner;
    const pdf = pdfStats([legacy]);
    const row = pdf.find((p) => p.number === 11)!;
    expect(row).toMatchObject({ teamSide: "FOR", toWon: 0, toLost: 1 });

    const a = influence([legacy] as unknown as (InfluenceEvent & ChainableEvent)[]);
    const inf = [...a.home.players, ...a.away.players].find((p) => p.number === 11)!;
    expect(inf).toMatchObject({ teamSide: "FOR", toWon: 0, toLost: 1 });
  });

  it("a kickout recorded before restartOwner existed still counts as the kind names", () => {
    const e = proTap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }, 8, 1, 50);
    delete (e as { restartOwner?: unknown }).restartOwner;
    expect(pdfRow([e], "away-8")).toMatchObject({ koWon: 1, koCon: 0 });
    expect(influenceRow([e], "away-8")).toMatchObject({ koWon: 1, koLost: 0 });
  });
});
