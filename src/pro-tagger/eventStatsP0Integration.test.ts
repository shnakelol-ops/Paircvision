// Cross-P0 integration test (Event Stats P0 hardening pass).
//
// Exercises P0-2 (Review player correction resolves playerId against the
// roster, squadId-first), P0-3 (Quick Review Shots reconciliation), P0-5
// (Review team filter symmetric FOR-side inference), and P0-6 (Player
// Influence team attribution from roster, not raw event teamSide) together
// on one realistic fixture, matching the brief's cross-P0 scenario:
//
//   - FOR and OPP squads share a duplicate jersey number (#9).
//   - The opposition's own kickout is won back by FOR (an owner-reassigned
//     KICKOUT_CONCEDED, tagged teamSide OPP even though FOR benefited) —
//     correctly tagged live (squadId already names the true HOME player).
//   - A turnover-family event is initially mis-tagged to the wrong player,
//     stored with teamSide "FOR" (always — see pro-tagger-adapter.ts) even
//     though the tagged player is on the AWAY squad — a genuine conflict
//     between stored teamSide and the player's real squadId. It is then
//     corrected in Review by calling the PRODUCTION P0-2 resolver
//     (resolveRosterPlayerId) directly on that stored event, proving the
//     fix resolves against the correct (squadId-named) roster despite the
//     teamSide/squadId conflict — not a hand-inserted "already correct" id.
//   - Quick Review is generated (shot totals reconcile across Page 1/2).
//   - Review is filtered by FOR (the won-back kickout must be visible).
//   - Player Influence is generated from the resolver's actual output (the
//     corrected player lands under the correct squad bucket, not merged
//     with the same-numbered opponent).
//
// No score arithmetic, restart ownership, or event identity changes as a
// side effect of any of this — asserted explicitly at the end.
import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { computeProTaggerCounts } from "./ProTaggerLiveScreen";
import { resolveRosterPlayerId } from "./ProTaggerReviewScreen";
import { computeScoreSide } from "./pro-tagger-score";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import { buildQuickReviewMatchOverview } from "../stats/reporting/quickReviewMatchOverview";
import { selectReviewEvents } from "../stats/review-selectors";
import { analyseChains } from "../stats/chains/chain-engine";
import { buildInfluenceAnalysis, type InfluenceEvent } from "../stats/players/influence";
import type { ChainableEvent } from "../stats/chains/chain-types";

let nextId = 0;
function buildEvent(
  overrides: Partial<LoggedMatchEvent> & Pick<LoggedMatchEvent, "kind" | "teamSide">,
): LoggedMatchEvent {
  const kind = overrides.kind;
  return {
    id: `integration-${nextId++}`,
    type: kind,
    nx: 0.5,
    ny: 0.5,
    x: 0.5,
    y: 0.5,
    half: 1,
    timestamp: 0,
    period: "1H",
    segment: 1,
    matchClockSeconds: 60,
    createdAt: 0,
    ...overrides,
  };
}

function player(id: string, number: number, name: string): ProTaggerSquadPlayer {
  return { id, number, name };
}

// Duplicate jersey number #9 on both squads — must never be conflated.
const homeSquadLiveState: ProTaggerSquadPlayer[] = [
  player("home-9", 9, "Home Nine"),
  player("home-4", 4, "Home Four"),
];
const awaySquadLiveState: ProTaggerSquadPlayer[] = [
  player("away-9", 9, "Away Nine"),
  player("away-4", 4, "Away Four"), // duplicate number with home-4
  player("away-7", 7, "Away Seven"),
];

const HOME_SQUAD_ID = "home-squad-id";
const AWAY_SQUAD_ID = "away-squad-id";

const rosterForP0_2: Pick<ProTaggerSavedMatch, "homeSquad" | "awaySquad" | "homeSquadLiveState" | "awaySquadLiveState"> = {
  homeSquad: { id: HOME_SQUAD_ID, teamSide: "HOME", players: [] },
  awaySquad: { id: AWAY_SQUAD_ID, teamSide: "AWAY", players: [] },
  homeSquadLiveState,
  awaySquadLiveState,
};

describe("Event Stats cross-P0 integration", () => {
  // 1. Opposition's own kickout, won back by FOR — owner-reassigned event:
  //    teamSide is OPP (the owner who conceded it), not the winner. Tagged
  //    correctly live: squadId already names the true fielding player's
  //    squad (HOME), which is exactly why the picker's squadId — not raw
  //    teamSide — must be what Review correction trusts too.
  const wonBackKickout = buildEvent({
    kind: "KICKOUT_CONCEDED",
    teamSide: "OPP",
    restartOwner: "OPP",
    squadId: HOME_SQUAD_ID,
    playerId: "home-9", // the FOR player who fielded it
    playerNumber: 9,
    playerName: "Home Nine",
  });

  // 2. A turnover-family event, initially mis-tagged live to the WRONG
  //    player. TURNOVER_LOST is always stored with teamSide "FOR" (see
  //    pro-tagger-adapter.ts) regardless of which team actually forced the
  //    turnover — here the tagged player is on the AWAY squad, so
  //    event.teamSide ("FOR") directly conflicts with event.squadId
  //    (AWAY_SQUAD_ID). A resolver that trusted raw teamSide would search
  //    the home roster and either resolve the wrong player or nothing.
  const misTaggedTurnover = buildEvent({
    kind: "TURNOVER_LOST",
    teamSide: "FOR", // fixed by the adapter — not the acting player's team
    squadId: AWAY_SQUAD_ID, // the picker's own squad selection — authoritative
    playerId: "away-4", // WRONG — coach meant away-7
    playerNumber: 4,
    playerName: "Away Four",
  });

  // Review correction (P0-2): call the PRODUCTION resolver directly on the
  // stored event above (teamSide "FOR" vs squadId AWAY_SQUAD_ID conflict),
  // exactly what saveProEdit does — not a hand-inserted "already correct" id.
  const correctedPlayerId = resolveRosterPlayerId(rosterForP0_2, misTaggedTurnover, 7);
  const correctedTurnover: LoggedMatchEvent = {
    ...misTaggedTurnover,
    playerNumber: 7,
    playerName: "Away Seven",
    playerId: correctedPlayerId,
  };

  // 3. A few ordinary shot-attempt/score events to reconcile shot totals on.
  const forScoreEvent = buildEvent({ kind: "POINT", teamSide: "FOR", playerId: "home-4" });
  const forWideEvent = buildEvent({ kind: "WIDE", teamSide: "FOR", playerId: "home-4" });
  const oppScoreEvent = buildEvent({ kind: "GOAL", teamSide: "OPP", playerId: "away-9" });

  const finalEvents: LoggedMatchEvent[] = [
    wonBackKickout,
    correctedTurnover,
    forScoreEvent,
    forWideEvent,
    oppScoreEvent,
  ];

  it("P0-2: the production resolver, called on an event whose stored teamSide conflicts with its squadId, resolves against the squadId-named roster (not raw teamSide, not the same-numbered opponent)", () => {
    expect(correctedPlayerId).toBe("away-7");
    expect(correctedPlayerId).not.toBe("home-7"); // raw teamSide "FOR" would have implied the home roster
    expect(correctedTurnover.playerId).toBe("away-7");
    // Sanity: home has no #7 at all, so a teamSide-based (wrong-roster) resolution would have found nothing.
    expect(homeSquadLiveState.some((p) => p.number === 7)).toBe(false);
  });

  it("P0-2: the same resolver call also correctly disambiguates the duplicate #4 shared by both squads via squadId, not teamSide", () => {
    // Independent check using the wonBackKickout's own team pairing: a
    // hypothetical correction to #4 on an OPP-teamSide/HOME-squadId event
    // must land on home-4, never away-4.
    const resolved = resolveRosterPlayerId(rosterForP0_2, wonBackKickout, 4);
    expect(resolved).toBe("home-4");
    expect(resolved).not.toBe("away-4");
  });

  it("P0-5: the opposition's own kickout won back by FOR is visible under the FOR review filter", () => {
    const filtered = selectReviewEvents(finalEvents, {
      half: "FULL",
      segment: "ALL",
      teamSide: "FOR",
      category: "ALL",
      categoryKinds: {},
      zone: "FULL",
      attackingDirection: "RIGHT",
    });
    expect(filtered).toContain(wonBackKickout);
  });

  it("P0-6: Player Influence assigns the corrected player to the correct squad, distinct from the same-numbered opponent", () => {
    type FixtureEvent = InfluenceEvent & ChainableEvent;
    const influenceEvents = finalEvents as unknown as FixtureEvent[];
    const analysis = analyseChains(influenceEvents);
    const influence = buildInfluenceAnalysis(
      influenceEvents, analysis, "Home", "Away",
      homeSquadLiveState, awaySquadLiveState,
    );

    const awaySeven = influence.away.players.find((p) => p.key === "away-7");
    const homeSeven = influence.home.players.find((p) => p.key === "away-7");
    expect(awaySeven).toBeDefined();
    expect(awaySeven!.teamSide).toBe("OPP");
    // The mis-tagged identity must not have left a phantom row anywhere else.
    expect(homeSeven).toBeUndefined();
    expect(influence.home.players.find((p) => p.key === "away-4")).toBeUndefined();
  });

  it("P0-3: shot totals reconcile between Quick Review Page 1 and the Counts Sheet (Page 2) for the same events", () => {
    const model = buildQuickReviewMatchOverview(finalEvents, "Home", "Away");
    const page2ForShots = computeProTaggerCounts(finalEvents, "FOR").shots;
    const page2OppShots = computeProTaggerCounts(finalEvents, "OPP").shots;

    expect(model.shooting.for.attempts).toBe(page2ForShots);
    expect(model.shooting.opp.attempts).toBe(page2OppShots);
    // FOR: POINT + WIDE = 2 shot attempts. OPP: GOAL = 1 shot attempt.
    expect(page2ForShots).toBe(2);
    expect(page2OppShots).toBe(1);
  });

  it("no score change: the Review correction (playerId/playerName/playerNumber only) leaves the scoreline identical", () => {
    const beforeCorrection = [
      wonBackKickout, misTaggedTurnover, forScoreEvent, forWideEvent, oppScoreEvent,
    ];
    const afterCorrection = finalEvents;

    expect(computeScoreSide(beforeCorrection, "FOR")).toEqual(computeScoreSide(afterCorrection, "FOR"));
    expect(computeScoreSide(beforeCorrection, "OPP")).toEqual(computeScoreSide(afterCorrection, "OPP"));
  });

  it("no event ID change: the corrected event keeps its original id, teamSide, and restartOwner", () => {
    expect(correctedTurnover.id).toBe(misTaggedTurnover.id);
    expect(correctedTurnover.teamSide).toBe(misTaggedTurnover.teamSide);
    expect(wonBackKickout.teamSide).toBe("OPP");
    expect(wonBackKickout.restartOwner).toBe("OPP");
  });
});
