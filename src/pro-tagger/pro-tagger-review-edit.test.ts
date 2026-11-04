import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import { applyReviewKindEdit, editableKindsFor, isCapturableKind } from "./pro-tagger-review-edit";

const SQUADS = { home: "home-squad", away: "away-squad" };
function ev(kind: MatchEventKind, tags: string[], extra: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  return {
    id: "e1", kind, type: kind, tags, teamSide: "FOR", team: "HOME", nx: 0.7, ny: 0.4, x: 0.7, y: 0.4,
    half: 1, period: "1H", segment: 1, timestamp: 600, matchClockSeconds: 600, createdAt: 1,
    ...extra,
  } as LoggedMatchEvent;
}
const edit = (e: LoggedMatchEvent, k: MatchEventKind, sport: "gaelic" | "hurling" | "camogie" | "ladies_football" = "gaelic", hasPlayer = false) =>
  applyReviewKindEdit(e, k, sport, hasPlayer, SQUADS);

describe("shot → score corrections keep an unknown source unknown", () => {
  it("Shot → Point and Shot → Goal: allowed, same team, no source invented", () => {
    for (const to of ["POINT", "GOAL"] as const) {
      const r = edit(ev("SHOT", ["SHORT"], { teamSide: "OPP", team: "AWAY" }), to);
      expect(r.ok).toBe(true);
      expect(r.event).toMatchObject({ kind: to, type: to, teamSide: "OPP", team: "AWAY", tags: [] });
    }
  });

  it("blocked shot → Point removes the Block/Save tag", () => {
    const r = edit(ev("SHOT", ["BLOCK/SAVE"]), "POINT");
    expect(r.ok).toBe(true);
    expect(r.event?.tags).toEqual([]);
  });

  it("a score or wide is never turned into a shot (its outcome isn't known)", () => {
    expect(editableKindsFor(ev("POINT", ["PLAY"]), "gaelic")).not.toContain("SHOT");
    const r = edit(ev("POINT", ["PLAY"]), "SHOT");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/can't be changed to a shot/);
  });
});

describe("cross-family edits are refused", () => {
  it("Turnover → Point is not offered and is refused, so no event moves team", () => {
    const turnover = ev("TURNOVER_LOST", ["HP ERROR"]);
    expect(editableKindsFor(turnover, "gaelic")).toEqual(["TURNOVER_WON", "TURNOVER_LOST"]);
    const r = edit(turnover, "POINT");
    expect(r).toMatchObject({ ok: false, event: null });
    expect(r.reason).toBe("A turnover lost can't be changed to a point — delete it and tag the event again.");
  });

  it("kickout → score, card → anything and free → turnover are refused", () => {
    expect(edit(ev("KICKOUT_CONCEDED", ["CLEAN"], { restartOwner: "OPP" }), "POINT").ok).toBe(false);
    expect(edit(ev("YELLOW_CARD", ["YELLOW"]), "FREE_CONCEDED").ok).toBe(false);
    expect(edit(ev("FREE_WON", ["WON"]), "TURNOVER_WON").ok).toBe(false);
  });
});

describe("kickout won ↔ lost", () => {
  const won = ev("KICKOUT_WON", ["BREAK"], { restartOwner: "FOR", squadId: "home-squad", playerId: "p2", playerNumber: 2, playerName: "Two" });

  it("is refused while a player is still attached (they were on the winning side)", () => {
    const r = edit(won, "KICKOUT_CONCEDED", "gaelic", true);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Clear the player/);
  });

  it("with the player cleared: owner, team side and tags kept; squad becomes the new winner's", () => {
    const r = edit(won, "KICKOUT_CONCEDED", "gaelic", false);
    expect(r.ok).toBe(true);
    expect(r.event).toMatchObject({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", tags: ["BREAK"], squadId: "away-squad" });
    const back = edit({ ...r.event!, playerId: undefined, playerNumber: undefined, playerName: undefined }, "KICKOUT_WON", "gaelic", false);
    expect(back.event).toMatchObject({ kind: "KICKOUT_WON", squadId: "home-squad" });
  });

  it("a player-only edit (type unchanged) is not affected", () => {
    expect(edit(won, "KICKOUT_WON", "gaelic", true)).toMatchObject({ ok: true, event: won });
  });
});

describe("sport rules", () => {
  it("two-pointers are not available in hurling or camogie", () => {
    for (const sport of ["hurling", "camogie"] as const) {
      const kinds = editableKindsFor(ev("POINT", ["65"]), sport);
      expect(kinds).toEqual(["GOAL", "POINT", "WIDE"]);
      expect(edit(ev("POINT", ["65"]), "TWO_POINTER", sport).ok).toBe(false);
      expect(isCapturableKind("FORTY_FIVE_TWO_POINT", sport)).toBe(false);
    }
  });

  it("Sin Bin is offered only where capture offers it", () => {
    expect(editableKindsFor(ev("YELLOW_CARD", ["YELLOW"]), "gaelic")).toEqual(["YELLOW_CARD", "SIN_BIN", "RED_CARD"]);
    expect(editableKindsFor(ev("YELLOW_CARD", ["YELLOW"]), "hurling")).toEqual(["YELLOW_CARD", "RED_CARD"]);
    expect(edit(ev("YELLOW_CARD", ["YELLOW"]), "SIN_BIN", "camogie").ok).toBe(false);
  });

  it("kinds Event Stats never captures are never offered", () => {
    const offered = new Set(
      (["GOAL", "SHOT", "KICKOUT_WON", "TURNOVER_WON", "FREE_WON", "YELLOW_CARD"] as const)
        .flatMap((k) => editableKindsFor(ev(k, []), "gaelic")),
    );
    for (const never of ["FREE_SCORED", "FREE_MISSED", "POSSESSION_WON", "POSSESSION_LOST"]) expect(offered.has(never as MatchEventKind)).toBe(false);
    // A legacy record of such a kind keeps its own kind (player edits stay possible) and cannot become another.
    expect(editableKindsFor(ev("POSSESSION_WON", []), "gaelic")).toEqual(["POSSESSION_WON"]);
    expect(edit(ev("POSSESSION_WON", []), "TURNOVER_WON").ok).toBe(false);
  });
});

describe("45/65 and sideline awards", () => {
  it("offer only their own kind; won ↔ lost and any other change is refused", () => {
    for (const k of ["FORTY_FIVE_WON", "SIDELINE_WON"] as const) {
      expect(editableKindsFor(ev(k, ["WON"]), "gaelic")).toEqual([k]);
      expect(edit(ev(k, ["WON"]), k === "FORTY_FIVE_WON" ? "FORTY_FIVE_CONCEDED" : "SIDELINE_CONCEDED").ok).toBe(false);
      expect(edit(ev(k, ["WON"]), "POINT").ok).toBe(false);
    }
  });
});

describe("valid same-family edits keep everything that still applies", () => {
  it("source tags carry over between scores and wides", () => {
    expect(edit(ev("POINT", ["PLAY"]), "WIDE").event?.tags).toEqual(["PLAY"]);
    expect(edit(ev("POINT", ["FREE"]), "GOAL").event?.tags).toEqual(["FREE"]);
    expect(edit(ev("POINT", ["65"]), "GOAL", "hurling").event?.tags).toEqual(["65"]);
    expect(edit(ev("WIDE", ["MARK"]), "TWO_POINTER").event).toMatchObject({ kind: "TWO_POINTER", tags: ["MARK"] });
  });

  it("a 45 source makes a two-pointer a 45 two-pointer, and back to a point keeps the 45", () => {
    expect(editableKindsFor(ev("POINT", ["45"]), "gaelic")).toEqual(["GOAL", "POINT", "FORTY_FIVE_TWO_POINT", "WIDE"]);
    expect(edit(ev("POINT", ["45"]), "TWO_POINTER").event).toMatchObject({ kind: "FORTY_FIVE_TWO_POINT", tags: ["45"] });
    expect(edit(ev("FORTY_FIVE_TWO_POINT", ["45"]), "POINT").event).toMatchObject({ kind: "POINT", tags: ["45"] });
    expect(edit(ev("POINT", ["PLAY"]), "FORTY_FIVE_TWO_POINT").ok).toBe(false);   // never invents a 45 source
  });

  it("turnover, free and card changes keep the team and rewrite only the kind's own tag", () => {
    expect(edit(ev("TURNOVER_WON", ["INTERCEPTION"]), "TURNOVER_LOST").event).toMatchObject({ kind: "TURNOVER_LOST", teamSide: "FOR", tags: ["INTERCEPTION"] });
    expect(edit(ev("FREE_WON", ["WON"]), "FREE_CONCEDED").event).toMatchObject({ kind: "FREE_CONCEDED", tags: ["CONCEDED"] });
    expect(edit(ev("YELLOW_CARD", ["YELLOW"], { teamSide: "OPP" }), "RED_CARD").event).toMatchObject({ kind: "RED_CARD", teamSide: "OPP", tags: ["RED"] });
  });

  it("every other field — position, clock, half, player, ids — is unchanged", () => {
    const before = ev("SHOT", ["POST"], { playerId: "p9", playerNumber: 9, playerName: "Nine", squadId: "home-squad" });
    const after = edit(before, "GOAL", "gaelic", true).event!;
    const { kind: _k, type: _t, tags: _g, ...rest } = after;
    const { kind: _k2, type: _t2, tags: _g2, ...restBefore } = before;
    expect(rest).toEqual(restBefore);
  });

  it("tags Event Stats does not know are left in place", () => {
    expect(edit(ev("SHOT", ["BLOCK/SAVE", "IMPORTED_NOTE"]), "POINT").event?.tags).toEqual(["IMPORTED_NOTE"]);
  });
});
