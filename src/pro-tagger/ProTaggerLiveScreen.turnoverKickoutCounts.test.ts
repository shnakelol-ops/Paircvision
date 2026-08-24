import { describe, expect, it } from "vitest";
import { computeProTaggerCounts } from "./ProTaggerLiveScreen";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import type { LoggedMatchEvent } from "../core/stats/saved-match";

const BASE = { nx: 0.5, ny: 0.5, half: 1 as const, matchClockSeconds: 100 };

describe("computeProTaggerCounts — combined totals stay correct after the WON/CONCEDED fixes", () => {
  it("turnoverWon: counts FOR's own wins plus opposition's turnovers now stored as TURNOVER_LOST", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }), // FOR wins
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }), // FOR wins
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" }), // OPP wins (stored as TURNOVER_LOST/FOR)
    ];

    expect(computeProTaggerCounts(events, "FOR").turnoverWon).toBe(2);
    expect(computeProTaggerCounts(events, "OPP").turnoverWon).toBe(1);
    // No split anywhere — a single combined figure per side, matching the
    // decision to keep the existing HT/FT turnover count (no Won/Lost split,
    // since legacy Event Stats data can't support that distinction reliably).
  });

  it("does not silently drop opposition turnovers the way an unwidened filter would", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }),
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }),
      adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "OPP" }),
    ];
    // All three are opposition wins (kind TURNOVER_LOST, teamSide FOR) — a
    // naive `filter(kind === "TURNOVER_WON")` on the OPP side would show 0.
    expect(computeProTaggerCounts(events, "OPP").turnoverWon).toBe(3);
    expect(computeProTaggerCounts(events, "FOR").turnoverWon).toBe(0);
  });

  it("kickoutWon: counts each side's own wins plus restarts the other side conceded", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" }), // FOR keeps its own
      adaptProTaggerAction({ ...BASE, familyId: "RESTART", tileLabel: "Break", teamSide: "FOR", restartOwner: "OPP" }), // FOR wins OPP's restart back (KICKOUT_CONCEDED, teamSide OPP)
      adaptProTaggerAction({ ...BASE, familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP", restartOwner: "OPP" }), // OPP keeps its own
    ];
    // FOR won: its own clean restart, plus the one it won back from OPP = 2.
    expect(computeProTaggerCounts(events, "FOR").kickoutWon).toBe(2);
    // OPP won: only its own clean restart = 1.
    expect(computeProTaggerCounts(events, "OPP").kickoutWon).toBe(1);
  });

  it("legacy-shaped data (every restart/turnover always WON, no CONCEDED/LOST at all) still counts correctly", () => {
    const legacyEvents: LoggedMatchEvent[] = [
      { ...adaptProTaggerAction({ ...BASE, familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR" }) },
      { ...adaptProTaggerAction({ ...BASE, familyId: "RESTART", tileLabel: "Clean", teamSide: "OPP" }) },
      { ...adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }) },
    ];
    expect(computeProTaggerCounts(legacyEvents, "FOR").kickoutWon).toBe(1);
    expect(computeProTaggerCounts(legacyEvents, "OPP").kickoutWon).toBe(1);
    expect(computeProTaggerCounts(legacyEvents, "FOR").turnoverWon).toBe(1);
    expect(computeProTaggerCounts(legacyEvents, "OPP").turnoverWon).toBe(0);
  });

  it("fortyFiveWon and sidelineWon follow the same combined-total pattern as kickoutWon", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "FOR", restartOwner: "FOR" }),
      adaptProTaggerAction({ ...BASE, familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "OPP", restartOwner: "FOR" }), // OPP wins FOR's 45
      adaptProTaggerAction({ ...BASE, familyId: "SIDELINE", tileLabel: "Won", teamSide: "OPP", restartOwner: "OPP" }),
    ];
    expect(computeProTaggerCounts(events, "FOR").fortyFiveWon).toBe(1);
    expect(computeProTaggerCounts(events, "OPP").fortyFiveWon).toBe(1);
    expect(computeProTaggerCounts(events, "OPP").sidelineWon).toBe(1);
    expect(computeProTaggerCounts(events, "FOR").sidelineWon).toBe(0);
  });

  it("discipline counts are simple per-side tallies with no derivation", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Yellow", teamSide: "FOR" }),
      adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Yellow", teamSide: "FOR" }),
      adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Sin Bin", teamSide: "OPP" }),
      adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Red", teamSide: "OPP" }),
    ];
    expect(computeProTaggerCounts(events, "FOR").yellowCards).toBe(2);
    expect(computeProTaggerCounts(events, "FOR").sinBins).toBe(0);
    expect(computeProTaggerCounts(events, "OPP").sinBins).toBe(1);
    expect(computeProTaggerCounts(events, "OPP").redCards).toBe(1);
  });

  it("existing goal/point/shot/wide/free counts are untouched by any of this", () => {
    const events: LoggedMatchEvent[] = [
      adaptProTaggerAction({ ...BASE, familyId: "GOAL", tileLabel: "Play", teamSide: "FOR" }),
      adaptProTaggerAction({ ...BASE, familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }),
      adaptProTaggerAction({ ...BASE, familyId: "FREE", tileLabel: "Won", teamSide: "FOR" }),
    ];
    const forCounts = computeProTaggerCounts(events, "FOR");
    expect(forCounts.goals).toBe(1);
    expect(forCounts.points).toBe(1);
    expect(forCounts.freeWon).toBe(1);
  });
});
