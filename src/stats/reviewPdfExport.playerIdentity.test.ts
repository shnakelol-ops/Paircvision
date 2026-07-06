/**
 * reviewPdfExport.playerIdentity.test.ts
 *
 * Cross-surface regression test for the player-identity bug: the same
 * playerId, run through the SAME event set, must produce the SAME display
 * string on Player Breakdown (collectPlayerStats + resolvePlayerDisplayName)
 * and on Player Influence (buildInfluenceAnalysis, whose displayName field
 * is resolved through the identical function). Before the fix, a squad-
 * seeded blank name never backfilled from tagged events (Player Breakdown
 * showed "#14"), while the Influence engine had no playerId↔number alias
 * merging (a mixed-tagged player could fragment into a named row and an
 * unnamed "#N" row) — so the two surfaces could disagree even when reading
 * the exact same match log.
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "./chains/chain-engine";
import { buildInfluenceAnalysis } from "./players/influence";
import { resolvePlayerDisplayName } from "./player-display";
import {
  collectPlayerStats,
  type PdfExportEvent,
  type PdfSquadPlayer,
} from "./reviewPdfExport";

let nextId = 0;
function mk(partial: Partial<PdfExportEvent> & Pick<PdfExportEvent, "kind" | "teamSide">): PdfExportEvent {
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `pdf-${nextId++}`,
    period: partial.period ?? "1H",
    segment: partial.segment ?? 1,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("player identity — Player Breakdown and Player Influence agree", () => {
  it("a squad-seeded player with a blank name backfills from tagged events on Player Breakdown", () => {
    // Squad uploaded with jersey numbers but no names filled in — exactly the
    // reported Ballylanders scenario ("#1…#16" even though names exist in events).
    const homeSquad: PdfSquadPlayer[] = [
      { id: "squad-14", number: 14, name: "" },
    ];
    const events: PdfExportEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "squad-14", playerNumber: 14, playerName: "Shane" }),
      mk({ kind: "WIDE", teamSide: "FOR", playerId: "squad-14", playerNumber: 14 }),
    ];

    const rows = collectPlayerStats(events, homeSquad, undefined);
    const shaneRow = rows.find((r) => r.number === 14)!;
    expect(shaneRow.name).toBe("Shane"); // backfilled, not left null from the blank squad entry
    expect(resolvePlayerDisplayName(shaneRow.name, shaneRow.number)).toBe("Shane");
  });

  it("Player Breakdown and Player Influence print the identical label for a mixed id/number-tagged player", () => {
    const homeTeam = "Ballylanders";
    const awayTeam = "St.Patricks";

    // Same shape as the reported bug: a player tagged via the picker for the
    // score, and via number-only quick-tag for the misses.
    const events: PdfExportEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "p-shane", playerNumber: 14, playerName: "Shane" }),
      mk({ kind: "WIDE", teamSide: "FOR", playerNumber: 14 }),
      mk({ kind: "WIDE", teamSide: "FOR", playerNumber: 14 }),
      mk({ kind: "POINT", teamSide: "OPP", playerNumber: 15 }), // opposition — no names logged, as in the bug report
    ];

    const analysis = analyseChains(events);

    const breakdownRows = collectPlayerStats(events, undefined, undefined);
    const breakdownShane = breakdownRows.find((r) => r.number === 14)!;
    const breakdownLabel = resolvePlayerDisplayName(breakdownShane.name, breakdownShane.number);

    const influence = buildInfluenceAnalysis(events, analysis, homeTeam, awayTeam);
    const influenceShane = influence.home.players.find((p) => p.number === 14)!;

    // Same real player, same event set: identical label on both surfaces,
    // and only one row per surface (no name-row / number-row split).
    expect(breakdownRows.filter((r) => r.number === 14).length).toBe(1);
    expect(influence.home.players.filter((p) => p.number === 14).length).toBe(1);
    expect(breakdownLabel).toBe("Shane");
    expect(influenceShane.displayName).toBe("Shane");
    expect(breakdownLabel).toBe(influenceShane.displayName);

    // Opposition player with no name logged anywhere: both surfaces fall
    // back to the same "#N" form — no page invents a name the other lacks.
    const breakdownOpp = breakdownRows.find((r) => r.number === 15)!;
    const influenceOpp = influence.away.players.find((p) => p.number === 15)!;
    const breakdownOppLabel = resolvePlayerDisplayName(breakdownOpp.name, breakdownOpp.number);
    expect(breakdownOppLabel).toBe("#15");
    expect(influenceOpp.displayName).toBe("#15");
  });
});
