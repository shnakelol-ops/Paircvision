import { describe, expect, it } from "vitest";
import {
  advanceEnrichment,
  applyDetailTag,
  applyPlayerNumber,
  buildCapturedEvent,
  computeRapidScoreboard,
  DEFAULT_SCORE_SOURCE_TAG,
  detailOptionsForKind,
  formatScoreLine,
  isEnrichmentTargetVisible,
  isKindAllowedForTeamSide,
  isPlayerRecognitionEligible,
  nextTeamSideAfterEvent,
  resolveTeamColour,
  startEnrichment,
  type RapidMatchEvent,
} from "./rapid-capture-events";

describe("restart ownership", () => {
  it("sets restartOwner equal to teamSide for KICKOUT_WON", () => {
    const event = buildCapturedEvent({ kind: "KICKOUT_WON", nx: 0.3, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    expect(event.restartOwner).toBe("FOR");
  });

  it("sets restartOwner equal to teamSide for KICKOUT_CONCEDED", () => {
    const event = buildCapturedEvent({ kind: "KICKOUT_CONCEDED", nx: 0.3, ny: 0.5, half: 1, timestamp: 10, teamSide: "OPP" });
    expect(event.restartOwner).toBe("OPP");
  });

  it("does not set restartOwner on non-restart kinds", () => {
    const event = buildCapturedEvent({ kind: "TURNOVER_WON", nx: 0.5, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    expect(event.restartOwner).toBeUndefined();
  });
});

describe("default source tags", () => {
  it.each(["POINT", "GOAL", "TWO_POINTER", "WIDE"] as const)("defaults %s to SOURCE_PLAY", (kind) => {
    const event = buildCapturedEvent({ kind, nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    expect(event.tags).toEqual([DEFAULT_SCORE_SOURCE_TAG]);
  });

  it("does not tag non-scoring kinds", () => {
    const event = buildCapturedEvent({ kind: "SHOT", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    expect(event.tags).toBeUndefined();
  });
});

describe("detail bar option vocabulary (must match StatsModeSurface.tsx exactly)", () => {
  it("scores offer Play/Free/Mark/45/Penalty via SOURCE_* tags", () => {
    const tags = detailOptionsForKind("POINT")!.map((o) => o.tag);
    expect(tags).toEqual(["SOURCE_PLAY", "SOURCE_FREE", "SOURCE_MARK", "SOURCE_45", "SOURCE_PENALTY"]);
  });

  it.each(["POINT", "GOAL", "TWO_POINTER", "WIDE"] as const)("%s uses the score option set", (kind) => {
    expect(detailOptionsForKind(kind)).toEqual(detailOptionsForKind("POINT"));
  });

  it("TURNOVER_WON offers Tackle/Intercept/Opposition Error", () => {
    expect(detailOptionsForKind("TURNOVER_WON")).toEqual([
      { tag: "TACKLE", label: "Tackle" },
      { tag: "INTERCEPT", label: "Intercept" },
      { tag: "OPP_ERROR", label: "Opposition Error" },
    ]);
  });

  it("TURNOVER_LOST offers Hand Pass/Kick Pass Error, Overcarried, Tackled", () => {
    expect(detailOptionsForKind("TURNOVER_LOST")).toEqual([
      { tag: "SLACK_HAND_PASS", label: "Hand Pass Error" },
      { tag: "SLACK_KICK_PASS", label: "Kick Pass Error" },
      { tag: "OVERCARRIED", label: "Overcarried" },
      { tag: "STRIPPED", label: "Tackled" },
    ]);
  });

  it("KICKOUT_WON offers Clean/Break/Foul Won — no Kicked Dead (matches Match Stats, not the looser brief)", () => {
    const options = detailOptionsForKind("KICKOUT_WON")!;
    expect(options.map((o) => o.label)).toEqual(["Clean", "Break", "Foul Won"]);
    expect(options.some((o) => o.tag === "KICKED_DEAD")).toBe(false);
  });

  it("KICKOUT_CONCEDED offers Clean Lost/Break Lost/Foul Conceded/Kicked Dead", () => {
    expect(detailOptionsForKind("KICKOUT_CONCEDED")).toEqual([
      { tag: "CLEAN", label: "Clean Lost" },
      { tag: "BREAK", label: "Break Lost" },
      { tag: "FOUL_CONCEDED", label: "Foul Conceded" },
      { tag: "KICKED_DEAD", label: "Kicked Dead" },
    ]);
  });

  it("KICKOUT_WON and KICKOUT_CONCEDED reuse the identical CLEAN/BREAK tag strings (side disambiguates, not the tag)", () => {
    const won = detailOptionsForKind("KICKOUT_WON")!;
    const conceded = detailOptionsForKind("KICKOUT_CONCEDED")!;
    expect(won.find((o) => o.label === "Clean")?.tag).toBe(conceded.find((o) => o.label === "Clean Lost")?.tag);
  });

  it.each(["SHOT", "FREE_WON", "FREE_CONCEDED"] as const)("%s has no detail options", (kind) => {
    expect(detailOptionsForKind(kind)).toBeNull();
  });
});

describe("player recognition eligibility", () => {
  it.each([
    "SHOT", "WIDE", "POINT", "GOAL", "TWO_POINTER",
    "TURNOVER_WON", "TURNOVER_LOST", "KICKOUT_WON", "KICKOUT_CONCEDED",
    "FREE_WON", "FREE_CONCEDED",
  ] as const)("%s is player-recognition eligible", (kind) => {
    expect(isPlayerRecognitionEligible(kind)).toBe(true);
  });

  it("every current RAPID_BAR kind is covered by either a detail option set or player recognition", async () => {
    const { RAPID_BAR } = await import("./RapidCaptureLitePage");
    for (const item of RAPID_BAR) {
      const hasDetail = detailOptionsForKind(item.kind) != null;
      const hasPlayer = isPlayerRecognitionEligible(item.kind);
      expect(hasDetail || hasPlayer).toBe(true);
    }
  });
});

describe("detail tag override", () => {
  it("replaces the tag on the matching event only", () => {
    const a = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, teamSide: "FOR" });
    const b = buildCapturedEvent({ kind: "WIDE", nx: 0.85, ny: 0.6, half: 1, timestamp: 20, teamSide: "FOR" });
    const next = applyDetailTag([a, b], a.id, "SOURCE_FREE");
    expect(next.find((e) => e.id === a.id)?.tags).toEqual(["SOURCE_FREE"]);
    expect(next.find((e) => e.id === b.id)?.tags).toEqual(["SOURCE_PLAY"]);
  });

  it("does not mutate the input array or its events", () => {
    const a = buildCapturedEvent({ kind: "GOAL", nx: 0.95, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    const original = [a];
    const next = applyDetailTag(original, a.id, "SOURCE_45");
    expect(next).not.toBe(original);
    expect(original[0].tags).toEqual(["SOURCE_PLAY"]);
  });

  it("applies a turnover follow-up tag", () => {
    const a = buildCapturedEvent({ kind: "TURNOVER_WON", nx: 0.5, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
    const next = applyDetailTag([a], a.id, "INTERCEPT");
    expect(next[0].tags).toEqual(["INTERCEPT"]);
  });

  it("is a no-op when the event id is not found (e.g. already undone)", () => {
    const a = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, teamSide: "FOR" });
    const next = applyDetailTag([a], "does-not-exist", "SOURCE_MARK");
    expect(next[0].tags).toEqual(["SOURCE_PLAY"]);
  });
});

describe("player number override", () => {
  it("sets playerNumber only when no name/id given", () => {
    const a = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, teamSide: "FOR" });
    const next = applyPlayerNumber([a], a.id, { number: 14 });
    expect(next[0].playerNumber).toBe(14);
    expect(next[0].playerName).toBeUndefined();
  });

  it("sets playerNumber, playerName and playerId when a squad match is given", () => {
    const a = buildCapturedEvent({ kind: "GOAL", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, teamSide: "FOR" });
    const next = applyPlayerNumber([a], a.id, { number: 9, name: "S. Óg", id: "sq-9" });
    expect(next[0]).toMatchObject({ playerNumber: 9, playerName: "S. Óg", playerId: "sq-9" });
  });

  it("does not affect other events", () => {
    const a = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, teamSide: "FOR" });
    const b = buildCapturedEvent({ kind: "WIDE", nx: 0.8, ny: 0.5, half: 1, timestamp: 20, teamSide: "FOR" });
    const next = applyPlayerNumber([a, b], a.id, { number: 3 });
    expect(next.find((e) => e.id === b.id)?.playerNumber).toBeUndefined();
  });
});

describe("enrichment sequencing (detail -> player -> none)", () => {
  it("a score kind starts at the detail stage", () => {
    expect(startEnrichment("e1", "POINT")).toEqual({ eventId: "e1", kind: "POINT", stage: "detail" });
  });

  it("a detail-less, player-eligible kind starts directly at the player stage", () => {
    expect(startEnrichment("e1", "SHOT")).toEqual({ eventId: "e1", kind: "SHOT", stage: "player" });
    expect(startEnrichment("e1", "FREE_WON")).toEqual({ eventId: "e1", kind: "FREE_WON", stage: "player" });
  });

  it("advancing from detail moves to player for eligible kinds", () => {
    const detail = startEnrichment("e1", "TURNOVER_WON");
    expect(advanceEnrichment(detail)).toEqual({ eventId: "e1", kind: "TURNOVER_WON", stage: "player" });
  });

  it("advancing from the player stage always dismisses", () => {
    const player = startEnrichment("e1", "SHOT");
    expect(advanceEnrichment(player)).toBeNull();
  });

  it("advancing null is a no-op", () => {
    expect(advanceEnrichment(null)).toBeNull();
  });
});

describe("active-team reset after a conceded/lost restart", () => {
  it("resets to FOR after KICKOUT_CONCEDED regardless of current teamSide", () => {
    expect(nextTeamSideAfterEvent("KICKOUT_CONCEDED", "OPP")).toBe("FOR");
    expect(nextTeamSideAfterEvent("KICKOUT_CONCEDED", "FOR")).toBe("FOR");
  });

  it("leaves teamSide unchanged for every other kind", () => {
    expect(nextTeamSideAfterEvent("KICKOUT_WON", "OPP")).toBe("OPP");
    expect(nextTeamSideAfterEvent("TURNOVER_LOST", "OPP")).toBe("OPP");
    expect(nextTeamSideAfterEvent("FREE_CONCEDED", "OPP")).toBe("OPP");
    expect(nextTeamSideAfterEvent("POINT", "FOR")).toBe("FOR");
  });
});

describe("one-event-per-tap behaviour", () => {
  it("never produces a mirrored companion event for TURNOVER_LOST / KICKOUT_CONCEDED / FREE_CONCEDED", () => {
    for (const kind of ["TURNOVER_LOST", "KICKOUT_CONCEDED", "FREE_CONCEDED"] as const) {
      const event = buildCapturedEvent({ kind, nx: 0.4, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR" });
      expect(event.kind).toBe(kind);
      expect(event.teamSide).toBe("FOR");
    }
  });

  it("preserves the exact tap coordinates, half and timestamp", () => {
    const event = buildCapturedEvent({ kind: "POINT", nx: 0.87, ny: 0.42, half: 2, timestamp: 1234, teamSide: "OPP" });
    expect(event.nx).toBe(0.87);
    expect(event.ny).toBe(0.42);
    expect(event.half).toBe(2);
    expect(event.timestamp).toBe(1234);
  });
});

describe("dismissal", () => {
  it("ignoring the detail bar leaves the default SOURCE_PLAY tag in place", () => {
    const event = buildCapturedEvent({ kind: "WIDE", nx: 0.8, ny: 0.6, half: 1, timestamp: 5, teamSide: "FOR" });
    expect(event.tags).toEqual([DEFAULT_SCORE_SOURCE_TAG]);
  });

  it("is visible while its event is pending and still logged", () => {
    const event = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 5, teamSide: "FOR" });
    expect(isEnrichmentTargetVisible(event.id, [event])).toBe(true);
  });

  it("dismisses when there is no pending event", () => {
    expect(isEnrichmentTargetVisible(null, [])).toBe(false);
  });

  it("dismisses once its event no longer exists (e.g. removed by Undo)", () => {
    const event = buildCapturedEvent({ kind: "GOAL", nx: 0.95, ny: 0.5, half: 1, timestamp: 5, teamSide: "FOR" });
    expect(isEnrichmentTargetVisible(event.id, [])).toBe(false);
  });
});

describe("legacy possession compatibility (UI side)", () => {
  it("no longer offers Poss+/Poss− — RAPID_BAR has no POSSESSION_WON/POSSESSION_LOST entry", async () => {
    const { RAPID_BAR } = await import("./RapidCaptureLitePage");
    const kinds = RAPID_BAR.map((item) => item.kind);
    expect(kinds).not.toContain("POSSESSION_WON");
    expect(kinds).not.toContain("POSSESSION_LOST");
  });
});

describe("live scoreboard", () => {
  function score(kind: "GOAL" | "POINT" | "TWO_POINTER" | "WIDE", teamSide: "FOR" | "OPP", nx = 0.9): RapidMatchEvent {
    return buildCapturedEvent({ kind, nx, ny: 0.5, half: 1, timestamp: 10, teamSide });
  }

  it("tallies goals, points and two-pointers per side", () => {
    const events = [
      score("GOAL", "FOR"),
      score("POINT", "FOR"),
      score("POINT", "FOR"),
      score("TWO_POINTER", "FOR"),
      score("POINT", "OPP"),
      score("WIDE", "OPP"), // wides never count toward score
    ];
    const board = computeRapidScoreboard(events);
    expect(board.for).toEqual({ goals: 1, points: 4, twoPointers: 1, total: 7 });
    expect(board.opp).toEqual({ goals: 0, points: 1, twoPointers: 0, total: 1 });
  });

  it("formats a scoreline in GAA notation", () => {
    expect(formatScoreLine({ goals: 1, points: 8, twoPointers: 0, total: 11 })).toBe("1-08");
    expect(formatScoreLine({ goals: 0, points: 7, twoPointers: 2, total: 7 })).toBe("0-07 (2×2pt)");
  });

  it("recalculates correctly after Undo removes the most recent score", () => {
    const events = [score("GOAL", "FOR"), score("POINT", "FOR")];
    const afterUndo = events.slice(0, -1);
    expect(computeRapidScoreboard(afterUndo).for.total).toBe(3);
  });

  it("is a pure function — same input always yields the same output, no hidden state", () => {
    const events = [score("POINT", "FOR"), score("GOAL", "OPP")];
    expect(computeRapidScoreboard(events)).toEqual(computeRapidScoreboard(events));
  });
});

describe("one incident, one event — OPP-side turnover/free capture disabled", () => {
  it("disallows Turn+/Turn-/Free+/Free- under OPP (downstream inversion already covers this)", () => {
    expect(isKindAllowedForTeamSide("TURNOVER_WON", "OPP")).toBe(false);
    expect(isKindAllowedForTeamSide("TURNOVER_LOST", "OPP")).toBe(false);
    expect(isKindAllowedForTeamSide("FREE_WON", "OPP")).toBe(false);
    expect(isKindAllowedForTeamSide("FREE_CONCEDED", "OPP")).toBe(false);
  });

  it("allows Turn+/Turn-/Free+/Free- under FOR", () => {
    expect(isKindAllowedForTeamSide("TURNOVER_WON", "FOR")).toBe(true);
    expect(isKindAllowedForTeamSide("TURNOVER_LOST", "FOR")).toBe(true);
    expect(isKindAllowedForTeamSide("FREE_WON", "FOR")).toBe(true);
    expect(isKindAllowedForTeamSide("FREE_CONCEDED", "FOR")).toBe(true);
  });

  it("still allows scores and wides under both FOR and OPP", () => {
    for (const kind of ["SHOT", "POINT", "GOAL", "TWO_POINTER", "WIDE"] as const) {
      expect(isKindAllowedForTeamSide(kind, "FOR")).toBe(true);
      expect(isKindAllowedForTeamSide(kind, "OPP")).toBe(true);
    }
  });

  it("still allows kickout/puckout ownership under both FOR and OPP — restart ownership is a distinct fact", () => {
    for (const kind of ["KICKOUT_WON", "KICKOUT_CONCEDED"] as const) {
      expect(isKindAllowedForTeamSide(kind, "FOR")).toBe(true);
      expect(isKindAllowedForTeamSide(kind, "OPP")).toBe(true);
    }
  });

  it("does not alter stored event semantics — a captured OPP-side turnover event, if built directly, keeps its normal shape", () => {
    // The restriction lives in the UI/tap-handler layer, not in buildCapturedEvent
    // or the storage schema. This proves the event model itself is untouched.
    const event = buildCapturedEvent({
      kind: "TURNOVER_WON",
      nx: 0.5,
      ny: 0.5,
      half: 1,
      timestamp: 30,
      teamSide: "OPP",
    });
    expect(event.kind).toBe("TURNOVER_WON");
    expect(event.teamSide).toBe("OPP");
  });

  it("does not break existing saved matches — legacy OPP-side turnover/free events still parse via the storage layer", async () => {
    const { parseRapidEvent } = await import("./rapid-capture-storage");
    const legacyEvent = buildCapturedEvent({
      kind: "FREE_WON",
      nx: 0.4,
      ny: 0.6,
      half: 2,
      timestamp: 500,
      teamSide: "OPP",
    });
    const parsed = parseRapidEvent(legacyEvent);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("FREE_WON");
    expect(parsed?.teamSide).toBe("OPP");
  });
});

describe("team-coloured player recognition", () => {
  const colours = { forTeamColour: "#1f6feb", oppTeamColour: "#b91c1c" };

  it("resolves the FOR colour for a FOR-side event", () => {
    expect(resolveTeamColour("FOR", colours)).toBe("#1f6feb");
  });

  it("resolves the OPP colour for an OPP-side event", () => {
    expect(resolveTeamColour("OPP", colours)).toBe("#b91c1c");
  });

  it("defaults to the FOR colour when teamSide is undefined", () => {
    expect(resolveTeamColour(undefined, colours)).toBe("#1f6feb");
  });
});
