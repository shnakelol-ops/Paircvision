import { describe, expect, it } from "vitest";
import { createMatchEvent } from "../core/stats/stats-event-model";
import {
  applySourceTag,
  buildCapturedEvent,
  DEFAULT_SCORE_SOURCE_TAG,
  isSourceBarVisible,
  isSourceTaggableKind,
  nextTeamSideAfterEvent,
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

  it.each(["POINT", "GOAL", "TWO_POINTER", "WIDE"] as const)("flags %s as source-taggable", (kind) => {
    expect(isSourceTaggableKind(kind)).toBe(true);
  });

  it.each(["SHOT", "TURNOVER_WON", "TURNOVER_LOST", "KICKOUT_WON", "KICKOUT_CONCEDED", "FREE_WON", "FREE_CONCEDED"] as const)(
    "does not flag %s as source-taggable",
    (kind) => {
      expect(isSourceTaggableKind(kind)).toBe(false);
    },
  );
});

describe("source override", () => {
  it("replaces the tag on the matching event only", () => {
    const a = createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, tags: ["SOURCE_PLAY"] });
    const b = createMatchEvent({ kind: "WIDE", nx: 0.85, ny: 0.6, half: 1, timestamp: 20, tags: ["SOURCE_PLAY"] });
    const next = applySourceTag([a, b], a.id, "SOURCE_FREE");
    expect(next.find((e) => e.id === a.id)?.tags).toEqual(["SOURCE_FREE"]);
    expect(next.find((e) => e.id === b.id)?.tags).toEqual(["SOURCE_PLAY"]);
  });

  it("does not mutate the input array or its events", () => {
    const a = createMatchEvent({ kind: "GOAL", nx: 0.95, ny: 0.5, half: 1, timestamp: 10, tags: ["SOURCE_PLAY"] });
    const original = [a];
    const next = applySourceTag(original, a.id, "SOURCE_45");
    expect(next).not.toBe(original);
    expect(original[0].tags).toEqual(["SOURCE_PLAY"]);
  });

  it("is a no-op when the event id is not found (e.g. already undone)", () => {
    const a = createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 10, tags: ["SOURCE_PLAY"] });
    const next = applySourceTag([a], "does-not-exist", "SOURCE_MARK");
    expect(next[0].tags).toEqual(["SOURCE_PLAY"]);
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
      // A single call returns a single event object — no array, no second event created.
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
  it("ignoring the source bar leaves the default SOURCE_PLAY tag in place", () => {
    const event = buildCapturedEvent({ kind: "WIDE", nx: 0.8, ny: 0.6, half: 1, timestamp: 5, teamSide: "FOR" });
    // Simulates the 4s timeout firing with no tap — no override is ever applied.
    expect(event.tags).toEqual([DEFAULT_SCORE_SOURCE_TAG]);
  });

  it("is visible while its event is pending and still logged", () => {
    const event = buildCapturedEvent({ kind: "POINT", nx: 0.9, ny: 0.4, half: 1, timestamp: 5, teamSide: "FOR" });
    expect(isSourceBarVisible(event.id, [event])).toBe(true);
  });

  it("dismisses when there is no pending event", () => {
    expect(isSourceBarVisible(null, [])).toBe(false);
  });

  it("dismisses once its event no longer exists (e.g. removed by Undo)", () => {
    const event = buildCapturedEvent({ kind: "GOAL", nx: 0.95, ny: 0.5, half: 1, timestamp: 5, teamSide: "FOR" });
    // Undo removes the event from the log without clearing the pending id directly.
    expect(isSourceBarVisible(event.id, [])).toBe(false);
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
