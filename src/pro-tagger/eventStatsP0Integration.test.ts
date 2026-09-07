// Cross-P0 integration test (Event Stats P0 hardening pass).
//
// Exercises P0-2 (Review player correction resolves playerId against the
// roster), P0-3 (Quick Review Shots reconciliation), P0-5 (Review team
// filter symmetric FOR-side inference), and P0-6 (Player Influence team
// attribution from roster, not raw event teamSide) together on one
// realistic fixture, matching the brief's cross-P0 scenario:
//
//   - FOR and OPP squads share a duplicate jersey number (#9).
//   - The opposition's own kickout is won back by FOR (an owner-reassigned
//     KICKOUT_CONCEDED, tagged teamSide OPP even though FOR benefited).
//   - A turnover-family event is initially mis-tagged to the wrong player,
//     then corrected in Review — exercising the exact production
//     resolution step (resolveRosterPlayerId) so the corrected playerId is
//     authoritative going forward.
//   - Quick Review is generated (shot totals reconcile across Page 1/2).
//   - Review is filtered by FOR (the won-back kickout must be visible).
//   - Player Influence is generated (the corrected player lands under the
//     correct squad bucket, not merged with the same-numbered opponent).
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
  player("away-7", 7, "Away Seven"),
];

const rosterForP0_2: Pick<ProTaggerSavedMatch, "homeSquadLiveState" | "awaySquadLiveState"> = {
  homeSquadLiveState,
  awaySquadLiveState,
};

describe("Event Stats cross-P0 integration", () => {
  // 1. Opposition's own kickout, won back by FOR — owner-reassigned event:
  //    teamSide is OPP (the owner who conceded it), not the winner.
  const wonBackKickout = buildEvent({
    kind: "KICKOUT_CONCEDED",
    teamSide: "OPP",
    restartOwner: "OPP",
    playerId: "home-9", // the FOR player who fielded it
  });

  // 2. A turnover-family event, initially mis-tagged live to the WRONG
  //    player (away-9's identity, picked by mistake — same jersey number as
  //    home-9, different team), with teamSide "FOR" per the adapter's
  //    single-perspective turnover convention (see pro-tagger-adapter.ts) —
  //    the "awkward raw teamSide" the brief describes: this event's team
  //    tag doesn't disambiguate which #9 was meant.
  const misTaggedTurnover = buildEvent({
    kind: "TURNOVER_WON",
    teamSide: "FOR",
    playerId: "away-9", // WRONG — coach meant home-9
    playerNumber: 9,
    playerName: "Away Nine",
  });

  // Review correction (P0-2): coach re-tags the turnover event to #9 on the
  // home roster (the team the event itself belongs to — team-side editing
  // stays out of scope). This is the exact call saveProEdit makes.
  const correctedPlayerId = resolveRosterPlayerId(rosterForP0_2, misTaggedTurnover.teamSide, 9);
  const correctedTurnover: LoggedMatchEvent = {
    ...misTaggedTurnover,
    playerNumber: 9,
    playerName: "Home Nine",
    playerId: correctedPlayerId,
  };

  // 3. A few ordinary shot-attempt/score events to reconcile shot totals on.
  const forScoreEvent = buildEvent({ kind: "POINT", teamSide: "FOR", playerId: "home-4" });
  const forWideEvent = buildEvent({ kind: "WIDE", teamSide: "FOR", playerId: "home-4" });
  const oppScoreEvent = buildEvent({ kind: "GOAL", teamSide: "OPP", playerId: "away-7" });

  const finalEvents: LoggedMatchEvent[] = [
    wonBackKickout,
    correctedTurnover,
    forScoreEvent,
    forWideEvent,
    oppScoreEvent,
  ];

  it("P0-2: the corrected playerId is authoritative and resolves to the intended (not the same-numbered opposing) player", () => {
    expect(correctedPlayerId).toBe("home-9");
    expect(correctedPlayerId).not.toBe("away-9");
    expect(correctedTurnover.playerId).toBe("home-9");
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

    const homeNine = influence.home.players.find((p) => p.key === "home-9");
    const awayNine = influence.away.players.find((p) => p.key === "away-9");
    expect(homeNine).toBeDefined();
    expect(homeNine!.teamSide).toBe("FOR");
    // The mis-tagged identity must not have left a phantom row on the away side.
    expect(awayNine).toBeUndefined();
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

  it("no event ID change: the corrected event keeps its original id", () => {
    expect(correctedTurnover.id).toBe(misTaggedTurnover.id);
  });
});
