// Turnover capture: both rows tag OUR player.
//
// The Turnover card is OUR TURNOVERS WON (FOR row) and OUR TURNOVERS LOST
// (OPP row). Both rows open our squad's picker — the row only decides the
// outcome. Stored events are unchanged: FOR row → TURNOVER_WON, OPP row →
// TURNOVER_LOST, both teamSide "FOR", tag = the tile's stored value — so the
// opposition's turnover is still derived from the same single event.
//
// Saved matches from before this change hold an OPPOSITION player on
// TURNOVER_LOST (the old picker followed the tapped row). Player credit is
// resolved against each player's own squad (resolvePlayerPossessionCredit),
// so old, new and mixed matches all report truthfully.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import { PRO_TAGGER_FAMILIES, getTileRowLabel, resolvePickerTeamSide } from "./pro-tagger-families";
import { computeProTaggerCounts } from "./ProTaggerLiveScreen";
import { resolveRosterPlayerId } from "./ProTaggerReviewScreen";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { analyseChains } from "../stats/chains/chain-engine";
import type { ChainableEvent } from "../stats/chains/chain-types";
import { buildInfluenceAnalysis, type InfluenceEvent } from "../stats/players/influence";
import { collectPlayerStats, type PdfExportEvent } from "../stats/reviewPdfExport";
import { buildMatchReport } from "../stats/reporting/matchReport";
import { buildQuickReviewMatchOverview } from "../stats/reporting/quickReviewMatchOverview";
import { buildQuickReviewSegmentBreakdown } from "../stats/reporting/quickReviewSegmentBreakdown";

const HOME_SQUAD_ID = "home-squad";
const AWAY_SQUAD_ID = "away-squad";
// Same jersey numbers on both teams — attribution must never lean on number.
const homeRoster: ProTaggerSquadPlayer[] = [
  { id: "home-4", number: 4, name: "Home Four" },
  { id: "home-6", number: 6, name: "Home Six" },
];
const awayRoster: ProTaggerSquadPlayer[] = [
  { id: "away-4", number: 4, name: "Away Four" },
  { id: "away-6", number: 6, name: "Away Six" },
];

type Row = "FOR" | "OPP";
type PickedPlayer = { side: Row; number: 4 | 6 } | null;

/** One live Turnover tap: the tapped row, the stored tile value, then the
 *  player picked from whichever squad the picker opened (null = "No player /
 *  Unknown"), then the pitch tap — exactly the adapter input handlePitchTap
 *  builds. */
function turnoverTap(row: Row, tile: string, player: PickedPlayer, half: 1 | 2, clock: number): LoggedMatchEvent {
  const p = player ? (player.side === "FOR" ? homeRoster : awayRoster).find((r) => r.number === player.number)! : null;
  return adaptProTaggerAction({
    familyId: "TURNOVER",
    tileLabel: tile,
    teamSide: row,
    nx: 0.4,
    ny: 0.3,
    half,
    matchClockSeconds: clock,
    ...(p
      ? { playerId: p.id, playerName: p.name, playerNumber: p.number, squadId: player!.side === "FOR" ? HOME_SQUAD_ID : AWAY_SQUAD_ID }
      : {}),
  });
}

/** The new capture: the picker always opens our squad for Turnover. */
function newCapture(row: Row, tile: string, number: 4 | 6 | null, half: 1 | 2, clock: number) {
  return turnoverTap(row, tile, number == null ? null : { side: resolvePickerTeamSide("TURNOVER", row), number }, half, clock);
}

function viaStorage<T>(events: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(events)) as T[];
}

function playerTables(events: readonly LoggedMatchEvent[]) {
  const stored = viaStorage(events);
  const pdf = collectPlayerStats(stored as unknown as PdfExportEvent[], homeRoster, awayRoster);
  const ie = stored as unknown as (InfluenceEvent & ChainableEvent)[];
  const inf = buildInfluenceAnalysis(ie, analyseChains(ie), "Ballyboden", "Na Fianna", homeRoster, awayRoster);
  return {
    pdf: (id: string) => pdf.find((r) => r.id === id),
    inf: (id: string) => [...inf.home.players, ...inf.away.players].find((r) => r.key === id),
  };
}

const TURNOVER = PRO_TAGGER_FAMILIES.find((f) => f.id === "TURNOVER")!;

describe("Turnover picker — both rows open OUR squad; every other family is unchanged", () => {
  it("Turnover Won and Turnover Lost both resolve to our (FOR) squad", () => {
    expect(resolvePickerTeamSide("TURNOVER", "FOR")).toBe("FOR");
    expect(resolvePickerTeamSide("TURNOVER", "OPP")).toBe("FOR");
  });

  it("every other family — kickouts included — still opens the tapped row's squad", () => {
    for (const family of PRO_TAGGER_FAMILIES) {
      if (family.id === "TURNOVER") continue;
      expect(resolvePickerTeamSide(family.id, "FOR"), family.id).toBe("FOR");
      expect(resolvePickerTeamSide(family.id, "OPP"), family.id).toBe("OPP");
    }
  });
});

describe("Live screen wiring — picker side, unchanged tap count, Unknown kept", () => {
  // ProTaggerLiveScreen has no render harness (Pixi pitch); read its source.
  const live = readFileSync(fileURLToPath(new URL("./ProTaggerLiveScreen.tsx", import.meta.url)), "utf8");
  const picker = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
  const pickerBlock = live.slice(live.indexOf("<ProTaggerPlayerPicker"), live.indexOf("onSelect={handlePlayerSelect}"));

  it("the picker's team label, squad, squadId and colours all follow resolvePickerTeamSide", () => {
    expect(live).toMatch(/const pickerTeamSide = pending \? resolvePickerTeamSide\(pending\.familyId, pending\.teamSide\) : "FOR";/);
    expect(pickerBlock.match(/pickerTeamSide === "FOR"/g)).toHaveLength(5);
    expect(pickerBlock).not.toMatch(/pending\.teamSide/);
  });

  it("the flow is still tile → player → pitch (no added step)", () => {
    const tileTap = live.slice(live.indexOf("const handleTileTap"), live.indexOf("const handlePlayerSelect"));
    const playerSelect = live.slice(live.indexOf("const handlePlayerSelect"), live.indexOf("const handlePitchTap"));
    expect(tileTap).toMatch(/setPhase\("PLAYER_PICK"\)/);
    expect(playerSelect).toMatch(/setPhase\("PITCH_TAP"\)/);
  });

  it("the picker still offers No player / Unknown, resolving to no player", () => {
    expect(picker).toMatch(/onClick=\{\(\) => onSelect\(null\)\}/);
    expect(picker).toMatch(/No player \/ Unknown/);
  });
});

describe("Display labels → existing stored events and tags", () => {
  // Every displayed option, its row, and the exact event it must store.
  const MAPPING: Array<[Row, string, "TURNOVER_WON" | "TURNOVER_LOST", string]> = [
    ["FOR", "Tackle", "TURNOVER_WON", "TACKLE"],
    ["FOR", "Interception", "TURNOVER_WON", "INTERCEPTION"],
    ["FOR", "Opposition HP Error", "TURNOVER_WON", "HP ERROR"],
    ["FOR", "Opposition KP Error", "TURNOVER_WON", "KP ERROR"],
    ["FOR", "Opposition Overcarried", "TURNOVER_WON", "OVERCARRIED"],
    ["OPP", "Dispossessed", "TURNOVER_LOST", "TACKLE"],
    ["OPP", "Intercepted", "TURNOVER_LOST", "INTERCEPTION"],
    ["OPP", "HP Error", "TURNOVER_LOST", "HP ERROR"],
    ["OPP", "KP Error", "TURNOVER_LOST", "KP ERROR"],
    ["OPP", "Overcarried", "TURNOVER_LOST", "OVERCARRIED"],
  ];

  it("the two sections show exactly the approved options, in order", () => {
    expect(TURNOVER.tiles.map((t) => getTileRowLabel(t, "gaelic", "FOR"))).toEqual(
      MAPPING.filter(([row]) => row === "FOR").map(([, label]) => label),
    );
    expect(TURNOVER.tiles.map((t) => getTileRowLabel(t, "gaelic", "OPP"))).toEqual(
      MAPPING.filter(([row]) => row === "OPP").map(([, label]) => label),
    );
  });

  it.each(MAPPING)("%s row · %s → %s with tag %s, teamSide FOR", (row, display, kind, tag) => {
    const tile = TURNOVER.tiles.find((t) => getTileRowLabel(t, "gaelic", row) === display)!;
    const e = newCapture(row, tile.label, 6, 1, 100);
    expect(e.kind).toBe(kind);
    expect(e.teamSide).toBe("FOR");
    expect(e.tags).toEqual([tag]);
    expect(e.playerId).toBe("home-6");
    expect(e.squadId).toBe(HOME_SQUAD_ID);
    expect({ nx: e.nx, ny: e.ny }).toEqual({ nx: 0.4, ny: 0.3 });
  });
});

describe("New capture — our player credited in Player Breakdown and Influence", () => {
  for (const half of [1, 2] as const) {
    it(`${half === 1 ? "1H" : "2H"}: our #6 dispossessed → T/O Lost +1; our #4 tackle → T/O Won +1`, () => {
      const t = playerTables([
        newCapture("OPP", "Tackle", 6, half, 200),
        newCapture("FOR", "Tackle", 4, half, 400),
      ]);
      expect(t.pdf("home-6")).toMatchObject({ teamSide: "FOR", toWon: 0, toLost: 1 });
      expect(t.inf("home-6")).toMatchObject({ teamSide: "FOR", toWon: 0, toLost: 1, netBallImpact: -1 });
      expect(t.pdf("home-4")).toMatchObject({ teamSide: "FOR", toWon: 1, toLost: 0 });
      expect(t.inf("home-4")).toMatchObject({ teamSide: "FOR", toWon: 1, toLost: 0, netBallImpact: 1 });
      // No opposition player is touched by the new capture.
      expect(t.inf("away-6")).toBeUndefined();
      expect(t.pdf("away-6")).toMatchObject({ toWon: 0, toLost: 0 });
    });
  }

  it("Unknown player on either row records the event with no player", () => {
    for (const row of ["FOR", "OPP"] as const) {
      const e = newCapture(row, "HP Error", null, 1, 50);
      expect(e.kind).toBe(row === "FOR" ? "TURNOVER_WON" : "TURNOVER_LOST");
      expect(e.playerId).toBeUndefined();
      expect(e.squadId).toBeUndefined();
    }
  });
});

describe("Historical and mixed saved matches", () => {
  it("an old opposition-winner tag is still credited truthfully (their T/O Won)", () => {
    const old = turnoverTap("OPP", "Tackle", { side: "OPP", number: 6 }, 1, 300);
    const t = playerTables([old]);
    expect(t.pdf("away-6")).toMatchObject({ teamSide: "OPP", toWon: 1, toLost: 0 });
    expect(t.inf("away-6")).toMatchObject({ teamSide: "OPP", toWon: 1, toLost: 0 });
  });

  it("a match holding old and new shapes credits each player correctly", () => {
    const events = [
      turnoverTap("OPP", "HP Error", { side: "OPP", number: 6 }, 1, 300), // old: away #6 won it
      newCapture("OPP", "HP Error", 6, 2, 300),                           // new: our #6 lost it
      newCapture("FOR", "Interception", 4, 2, 900),                       // new: our #4 won it
    ];
    const t = playerTables(events);
    expect(t.inf("away-6")).toMatchObject({ teamSide: "OPP", toWon: 1, toLost: 0 });
    expect(t.inf("home-6")).toMatchObject({ teamSide: "FOR", toWon: 0, toLost: 1 });
    expect(t.inf("home-4")).toMatchObject({ teamSide: "FOR", toWon: 1, toLost: 0 });
    expect(t.pdf("away-6")).toMatchObject({ toWon: 1, toLost: 0 });
    expect(t.pdf("home-6")).toMatchObject({ toWon: 0, toLost: 1 });
    expect(t.pdf("home-4")).toMatchObject({ toWon: 1, toLost: 0 });
  });

  it("a Review player correction on a new Turnover Lost resolves against our roster", () => {
    const match = {
      homeSquad: { id: HOME_SQUAD_ID, teamSide: "HOME", players: homeRoster },
      awaySquad: { id: AWAY_SQUAD_ID, teamSide: "AWAY", players: awayRoster },
      homeSquadLiveState: homeRoster,
      awaySquadLiveState: awayRoster,
    } as unknown as ProTaggerSavedMatch;
    const lost = newCapture("OPP", "Tackle", 6, 1, 100);
    expect(resolveRosterPlayerId(match, lost, 4)).toBe("home-4");
  });
});

describe("Team-level outputs do not depend on which player was tagged", () => {
  // The same turnovers, tagged three ways: our players (new capture), the
  // old opposition-winner shape, and no player at all. Team totals, Quick
  // Review and the canonical report must be identical across all three.
  const SEQUENCE: Array<[Row, string, 1 | 2, number]> = [
    ["FOR", "Tackle", 1, 120],
    ["OPP", "HP Error", 1, 600],
    ["OPP", "Tackle", 1, 1500],
    ["FOR", "KP Error", 2, 300],
    ["OPP", "Overcarried", 2, 1200],
  ];
  const ourPlayers = SEQUENCE.map(([row, tile, half, clock]) => newCapture(row, tile, 6, half, clock));
  const oldShape = SEQUENCE.map(([row, tile, half, clock]) => turnoverTap(row, tile, { side: row, number: 6 }, half, clock));
  const noPlayer = SEQUENCE.map(([row, tile, half, clock]) => turnoverTap(row, tile, null, half, clock));

  it("live HT/FT turnover counts", () => {
    for (const side of ["FOR", "OPP"] as const) {
      const expected = computeProTaggerCounts(noPlayer, side);
      expect(computeProTaggerCounts(ourPlayers, side)).toEqual(expected);
      expect(computeProTaggerCounts(oldShape, side)).toEqual(expected);
    }
    expect(computeProTaggerCounts(ourPlayers, "FOR").turnoverWon).toBe(2);
    expect(computeProTaggerCounts(ourPlayers, "OPP").turnoverWon).toBe(3);
  });

  it("Quick Review match overview and segment breakdown", () => {
    const overview = (ev: LoggedMatchEvent[]) => buildQuickReviewMatchOverview(ev, "Ballyboden", "Na Fianna");
    expect(overview(ourPlayers)).toEqual(overview(noPlayer));
    expect(overview(oldShape)).toEqual(overview(noPlayer));
    for (const half of [1, 2] as const) {
      const seg = (ev: LoggedMatchEvent[]) => buildQuickReviewSegmentBreakdown(ev, "Ballyboden", "Na Fianna", "RIGHT", half);
      expect(seg(ourPlayers)).toEqual(seg(noPlayer));
      expect(seg(oldShape)).toEqual(seg(noPlayer));
    }
  });

  it("canonical report turnover and restart metrics", () => {
    const report = (ev: LoggedMatchEvent[]) => buildMatchReport({ events: ev, homeTeam: "Ballyboden", awayTeam: "Na Fianna" });
    const base = report(noPlayer);
    expect({ won: base.chain.turnovers.won, lost: base.chain.turnovers.lost }).toEqual({ won: 2, lost: 3 });
    for (const ev of [ourPlayers, oldShape]) {
      const r = report(ev);
      expect(r.turnovers).toEqual(base.turnovers);
      expect(r.restarts).toEqual(base.restarts);
      expect(r.chain.turnovers.won).toBe(base.chain.turnovers.won);
      expect(r.chain.turnovers.lost).toBe(base.chain.turnovers.lost);
    }
  });
});
