// P0-6 regression coverage: Player Influence used to derive a player's
// FOR/OPP bucket from the raw teamSide of their first processed event. This
// is unsafe because some capture families deliberately encode teamSide as
// restart/turnover *ownership*, not the acting player's own team — see
// resolveRestartOutcome in pro-tagger-adapter.ts, and P0-5's analysis of the
// same mechanism. A player whose first-seen event happens to be one of
// those "owner" kinds could be permanently bucketed under the wrong team.
//
// The fix derives team identity from squad/roster membership (home roster ->
// FOR, away roster -> OPP) whenever the player's key resolves to a known
// roster id, falling back to raw event teamSide only when no roster claims
// that player at all.
import { describe, expect, it } from "vitest";
import { analyseChains } from "../chains/chain-engine";
import type { ChainableEvent } from "../chains/chain-types";
import { buildInfluenceAnalysis, type InfluenceEvent, type PlayerRosterEntry } from "./influence";

type FixtureEvent = InfluenceEvent & ChainableEvent;

let nextId = 0;
function mk(partial: Partial<FixtureEvent> & Pick<FixtureEvent, "kind" | "teamSide">): FixtureEvent {
  const clock = partial.matchClockSeconds ?? 0;
  return {
    id: `p0-6-${nextId++}`,
    period: partial.period ?? "1H",
    segment: partial.segment ?? 1,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

const homeRoster: PlayerRosterEntry[] = [
  { id: "home-p9", number: 9, name: "Home Nine" },
];
const awayRoster: PlayerRosterEntry[] = [
  { id: "away-p9", number: 9, name: "Away Nine" }, // same jersey number as home-p9
];

describe("Player Influence team attribution from roster, not first-event teamSide (P0-6)", () => {
  it("a FOR player whose first-ever event carries misleading raw teamSide (OPP, an owner-reassigned KICKOUT_CONCEDED) is still bucketed under home/FOR", () => {
    const events: FixtureEvent[] = [
      // home-p9's first event: an OPP-owned kickout won back by FOR (P0-5's
      // exact scenario) — the event is tagged teamSide OPP (the owner), even
      // though the player logged here belongs to the home/FOR roster.
      mk({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP", playerId: "home-p9" }),
      // A later, unambiguous event for the same player.
      mk({ kind: "POINT", teamSide: "FOR", playerId: "home-p9", matchClockSeconds: 200 }),
    ];
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Home", "Away", homeRoster, awayRoster);

    const homeNine = influence.home.players.find((p) => p.key === "home-p9");
    expect(homeNine).toBeDefined();
    expect(homeNine!.teamSide).toBe("FOR");
    expect(influence.away.players.find((p) => p.key === "home-p9")).toBeUndefined();
  });

  it("an OPP player whose first-ever event carries misleading raw teamSide (FOR, an owner-reassigned KICKOUT_CONCEDED) is still bucketed under away/OPP", () => {
    const events: FixtureEvent[] = [
      // away-p9's first event: a FOR-owned kickout won by OPP — tagged FOR
      // (the owner) even though the player belongs to the away/OPP roster.
      mk({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", playerId: "away-p9" }),
      mk({ kind: "POINT", teamSide: "OPP", playerId: "away-p9", matchClockSeconds: 200 }),
    ];
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Home", "Away", homeRoster, awayRoster);

    const awayNine = influence.away.players.find((p) => p.key === "away-p9");
    expect(awayNine).toBeDefined();
    expect(awayNine!.teamSide).toBe("OPP");
    expect(influence.home.players.find((p) => p.key === "away-p9")).toBeUndefined();
  });

  it("the same jersey number on both teams never merges — each stays under its own roster's team bucket", () => {
    const events: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerId: "home-p9" }),
      mk({ kind: "POINT", teamSide: "OPP", playerId: "away-p9", matchClockSeconds: 200 }),
    ];
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, "Home", "Away", homeRoster, awayRoster);

    expect(influence.home.players).toHaveLength(1);
    expect(influence.home.players[0]!.key).toBe("home-p9");
    expect(influence.home.players[0]!.teamSide).toBe("FOR");

    expect(influence.away.players).toHaveLength(1);
    expect(influence.away.players[0]!.key).toBe("away-p9");
    expect(influence.away.players[0]!.teamSide).toBe("OPP");
  });

  it("processing order does not change the final team attribution — same events, reversed order, same result", () => {
    const forwardEvents: FixtureEvent[] = [
      mk({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP", playerId: "home-p9" }),
      mk({ kind: "POINT", teamSide: "FOR", playerId: "home-p9", matchClockSeconds: 200 }),
    ];
    const reversedEvents = [...forwardEvents].reverse();

    const forwardInfluence = buildInfluenceAnalysis(
      forwardEvents, analyseChains(forwardEvents), "Home", "Away", homeRoster, awayRoster,
    );
    const reversedInfluence = buildInfluenceAnalysis(
      reversedEvents, analyseChains(reversedEvents), "Home", "Away", homeRoster, awayRoster,
    );

    expect(forwardInfluence.home.players.find((p) => p.key === "home-p9")!.teamSide).toBe("FOR");
    expect(reversedInfluence.home.players.find((p) => p.key === "home-p9")!.teamSide).toBe("FOR");
  });

  it("a P0-2-corrected playerId (now resolved against the correct roster) is attributed to the correct squad even when the original mis-tagged event's raw teamSide pointed elsewhere", () => {
    // Simulates the cross-P0 flow: an event mis-tagged live to some other
    // identity, then corrected in Review so playerId now points at the true
    // roster entry — P0-2's resolveRosterPlayerId always resolves against
    // the event's own team's roster, so the corrected id is authoritative.
    const correctedEvent: FixtureEvent = mk({
      kind: "KICKOUT_CONCEDED", // an owner-reassigned kind — teamSide is OPP (the owner), not the player's team
      teamSide: "OPP",
      restartOwner: "OPP",
      playerId: "home-p9", // corrected via P0-2's resolveRosterPlayerId against the home (FOR) roster
    });
    const events = [correctedEvent];
    const influence = buildInfluenceAnalysis(events, analyseChains(events), "Home", "Away", homeRoster, awayRoster);

    expect(influence.home.players.find((p) => p.key === "home-p9")?.teamSide).toBe("FOR");
  });

  it("without any roster supplied, falls back to raw event teamSide unchanged (existing behaviour for untracked players)", () => {
    const events: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR", playerNumber: 3 }),
    ];
    const influence = buildInfluenceAnalysis(events, analyseChains(events), "Home", "Away");
    const player = influence.home.players.find((p) => p.number === 3);
    expect(player).toBeDefined();
    expect(player!.teamSide).toBe("FOR");
  });

  it("a null/unknown player (no playerId, no playerNumber) is excluded, same as existing behaviour", () => {
    const events: FixtureEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR" }), // no player identity at all
    ];
    const influence = buildInfluenceAnalysis(events, analyseChains(events), "Home", "Away", homeRoster, awayRoster);
    expect(influence.home.players).toHaveLength(0);
  });
});
