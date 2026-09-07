// P0-5 regression coverage: selectReviewEvents widened the OPP team filter to
// infer opposition benefit from a FOR-tagged *_CONCEDED event (a restart
// "owner" losing their own kickout/45/sideline is recorded under the
// OWNER's side, not the winner's — see resolveRestartOutcome in
// pro-tagger-adapter.ts), but never mirrored that inference for the FOR
// filter. Result: winning back the opposition's own kickout (an OPP-tagged
// KICKOUT_CONCEDED event) disappeared when filtering Review to your own
// team. This suite proves the symmetric isInferredForEvent fix restores that
// visibility without altering restart semantics, event storage, or any
// existing OPP-side behaviour.
import { describe, expect, it } from "vitest";
import { selectReviewEvents } from "./review-selectors";
import type { ReviewSelectableEvent } from "./review-types";
import type { MatchEventKind } from "../core/stats/stats-event-model";

let nextId = 0;
function buildEvent(
  overrides: Partial<ReviewSelectableEvent> & Pick<ReviewSelectableEvent, "kind" | "teamSide">,
): ReviewSelectableEvent {
  return {
    id: `p0-5-${nextId++}`,
    nx: 0.5,
    ny: 0.5,
    half: 1,
    period: "1H",
    segment: 1,
    timestamp: 0,
    ...overrides,
  };
}

function filterBy(
  events: ReviewSelectableEvent[],
  teamSide: "ALL" | "FOR" | "OPP",
  category: string = "ALL",
  categoryKinds: Partial<Record<string, readonly MatchEventKind[]>> = {},
) {
  return selectReviewEvents(events, {
    half: "FULL",
    segment: "ALL",
    teamSide,
    category,
    categoryKinds,
    zone: "FULL",
    attackingDirection: "RIGHT",
  });
}

describe("selectReviewEvents — symmetric FOR/OPP restart inference (P0-5)", () => {
  it("FOR wins the opposition's own kickout (OPP-owned, OPP-tagged KICKOUT_CONCEDED) is visible under the FOR filter", () => {
    // resolveRestartOutcome: owner=OPP, tapped=FOR -> kind=KICKOUT_CONCEDED, teamSide=owner=OPP.
    const wonBackKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    const result = filterBy([wonBackKickout], "FOR");
    expect(result).toContain(wonBackKickout);
  });

  it("OPP wins a FOR-owned kickout (FOR-owned, FOR-tagged KICKOUT_CONCEDED) is visible under the OPP filter (pre-existing behaviour, unchanged)", () => {
    // owner=FOR, tapped=OPP -> kind=KICKOUT_CONCEDED, teamSide=owner=FOR.
    const lostOwnKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR" });
    const result = filterBy([lostOwnKickout], "OPP");
    expect(result).toContain(lostOwnKickout);
  });

  it("ordinary FOR events remain FOR — a FOR-tagged KICKOUT_WON is visible under FOR, not OPP", () => {
    const ownKickoutRetained = buildEvent({ kind: "KICKOUT_WON", teamSide: "FOR" });
    expect(filterBy([ownKickoutRetained], "FOR")).toContain(ownKickoutRetained);
    expect(filterBy([ownKickoutRetained], "OPP")).not.toContain(ownKickoutRetained);
  });

  it("ordinary OPP events remain OPP — an OPP-tagged KICKOUT_WON is visible under OPP, not FOR", () => {
    const oppKickoutRetained = buildEvent({ kind: "KICKOUT_WON", teamSide: "OPP" });
    expect(filterBy([oppKickoutRetained], "OPP")).toContain(oppKickoutRetained);
    expect(filterBy([oppKickoutRetained], "FOR")).not.toContain(oppKickoutRetained);
  });

  it("a CONCEDED event legitimately appears under both filters — its own owner's (genuinely tagged) and the winner's (inferred) — exactly mirroring the pre-existing FOR-tagged case, and no more widely than that", () => {
    // Pre-existing (untouched) case: FOR-tagged KICKOUT_CONCEDED already showed
    // under both FOR (genuinely tagged, isForEvent) and OPP (isInferredOppositionEvent).
    const lostOwnKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR" });
    expect(filterBy([lostOwnKickout], "FOR")).toContain(lostOwnKickout);
    expect(filterBy([lostOwnKickout], "OPP")).toContain(lostOwnKickout);

    // New symmetric case: OPP-tagged KICKOUT_CONCEDED now mirrors that exactly —
    // visible under OPP (genuinely tagged) and FOR (isInferredForEvent).
    const wonBackKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    expect(filterBy([wonBackKickout], "OPP")).toContain(wonBackKickout);
    expect(filterBy([wonBackKickout], "FOR")).toContain(wonBackKickout);
  });

  it("a genuinely one-sided event (KICKOUT_WON) never appears under both filters", () => {
    const forWon = buildEvent({ kind: "KICKOUT_WON", teamSide: "FOR" });
    expect(filterBy([forWon], "FOR")).toContain(forWon);
    expect(filterBy([forWon], "OPP")).not.toContain(forWon);

    const oppWon = buildEvent({ kind: "KICKOUT_WON", teamSide: "OPP" });
    expect(filterBy([oppWon], "OPP")).toContain(oppWon);
    expect(filterBy([oppWon], "FOR")).not.toContain(oppWon);
  });

  it("legacy/imported 45 and sideline CONCEDED shapes behave symmetrically", () => {
    const wonBackFortyFive = buildEvent({ kind: "FORTY_FIVE_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    expect(filterBy([wonBackFortyFive], "FOR")).toContain(wonBackFortyFive);

    const wonBackSideline = buildEvent({ kind: "SIDELINE_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    expect(filterBy([wonBackSideline], "FOR")).toContain(wonBackSideline);
  });

  it("turnovers/frees have no owner concept, so no OPP-tagged equivalent exists to infer FOR from — only genuinely FOR-tagged turnover/free events show under FOR", () => {
    const forWonTurnover = buildEvent({ kind: "TURNOVER_WON", teamSide: "FOR" });
    const forLostTurnover = buildEvent({ kind: "TURNOVER_LOST", teamSide: "FOR" }); // we lost it, OPP benefited
    expect(filterBy([forWonTurnover], "FOR")).toContain(forWonTurnover);
    // TURNOVER_LOST is FOR-tagged (isForEvent), so it stays visible under FOR — unchanged pre-existing behaviour.
    expect(filterBy([forLostTurnover], "FOR")).toContain(forLostTurnover);
    // ...and correctly inferred into OPP too, via the pre-existing isInferredOppositionEvent rule.
    expect(filterBy([forLostTurnover], "OPP")).toContain(forLostTurnover);
  });

  it("restart ownership semantics (restartOwner / resolveRestartOutcome) are untouched — the fix is selector-only", () => {
    // Same raw event, evaluated through the FOR filter both before and after
    // this test file exists: restartOwner and kind are read, never rewritten.
    const wonBackKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    const [result] = filterBy([wonBackKickout], "FOR");
    expect(result?.kind).toBe("KICKOUT_CONCEDED");
    expect(result?.teamSide).toBe("OPP");
    expect(result?.restartOwner).toBe("OPP");
  });

  it("KICKOUTS category (Event Stats / Rapid Capture's actual categoryKinds) still surfaces the symmetric FOR case", () => {
    const categoryKinds = { KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"] as readonly MatchEventKind[] };
    const wonBackKickout = buildEvent({ kind: "KICKOUT_CONCEDED", teamSide: "OPP", restartOwner: "OPP" });
    const result = filterBy([wonBackKickout], "FOR", "KICKOUTS", categoryKinds);
    expect(result).toContain(wonBackKickout);
  });
});
