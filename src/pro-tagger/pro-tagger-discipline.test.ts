import { describe, expect, it } from "vitest";
import {
  SIN_BIN_DURATION_SECONDS,
  buildDisciplineStatusMap,
  getDisciplineOptions,
} from "./pro-tagger-discipline";
import type { LoggedMatchEvent } from "../core/stats/saved-match";

function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
  const kind = overrides.kind ?? "YELLOW_CARD";
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    type: kind,
    nx: 0.5,
    ny: 0.5,
    half: 1,
    timestamp: 0,
    teamSide: "FOR",
    x: 0.5,
    y: 0.5,
    period: "1H",
    segment: 1,
    matchClockSeconds: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("getDisciplineOptions — sport mode decides which sanctions exist", () => {
  it("Football (gaelic) returns Yellow, Sin Bin and Red", () => {
    expect(getDisciplineOptions("gaelic")).toEqual(["YELLOW_CARD", "SIN_BIN", "RED_CARD"]);
  });

  it("Ladies Football returns the same set as Football", () => {
    expect(getDisciplineOptions("ladies_football")).toEqual(["YELLOW_CARD", "SIN_BIN", "RED_CARD"]);
  });

  it("Hurling returns the configured set — Yellow and Red only (no confirmed Sin Bin ruleset yet)", () => {
    expect(getDisciplineOptions("hurling")).toEqual(["YELLOW_CARD", "RED_CARD"]);
    expect(getDisciplineOptions("hurling")).not.toContain("SIN_BIN");
  });

  it("Camogie does not expose Sin Bin merely because Football has one", () => {
    const options = getDisciplineOptions("camogie");
    expect(options).toEqual(["YELLOW_CARD", "RED_CARD"]);
    expect(options).not.toContain("SIN_BIN");
  });
});

describe("Yellow — recorded only, no live availability effect", () => {
  it("a Yellow Card event does not disable the player or create a timed status", () => {
    const events = [buildEvent({ kind: "YELLOW_CARD", playerId: "p1", period: "1H", matchClockSeconds: 100 })];
    const status = buildDisciplineStatusMap(events, "1H", 200);
    expect(status.get("p1")).toBeUndefined();
  });
});

describe("Red — permanent, derived from event history", () => {
  it("the correct player becomes disabled (status RED)", () => {
    const events = [buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 300 })];
    const status = buildDisciplineStatusMap(events, "1H", 300);
    expect(status.get("p1")).toBe("RED");
  });

  it("other players are unaffected", () => {
    const events = [buildEvent({ kind: "RED_CARD", playerId: "p1" })];
    const status = buildDisciplineStatusMap(events, "1H", 0);
    expect(status.get("p2")).toBeUndefined();
  });

  it("the same jersey number on the other team is unaffected — keyed by player ID, not team+number", () => {
    // Home #12 and Away #12 are different squad-generated IDs.
    const events = [buildEvent({ kind: "RED_CARD", teamSide: "FOR", playerId: "home-player-12" })];
    const status = buildDisciplineStatusMap(events, "1H", 0);
    expect(status.get("home-player-12")).toBe("RED");
    expect(status.get("away-player-12")).toBeUndefined();
  });

  it("Red is far in the past (a different half) and still applies — permanent, no time factor", () => {
    const events = [buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 100 })];
    const status = buildDisciplineStatusMap(events, "2H", 3000);
    expect(status.get("p1")).toBe("RED");
  });

  it("removing the Red event (Undo) restores the player to selectable immediately", () => {
    const events = [buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 100 })];
    const afterUndo = events.slice(0, -1); // mirrors ProTaggerLiveScreen's undo(): drop the last event
    const status = buildDisciplineStatusMap(afterUndo, "1H", 100);
    expect(status.get("p1")).toBeUndefined();
  });
});

describe("Sin Bin — active but selectable, derived from match clock", () => {
  it("active state appears immediately after the event, within the same period", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1200 })];
    const status = buildDisciplineStatusMap(events, "1H", 1200);
    expect(status.get("p1")).toBe("SIN_BIN");
  });

  it("does not disable — the picker's disabled logic only checks for RED", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1200 })];
    const status = buildDisciplineStatusMap(events, "1H", 1400);
    expect(status.get("p1")).toBe("SIN_BIN");
    expect(status.get("p1")).not.toBe("RED");
  });

  it("status derives from match time — active just under the 10-minute window, expired just at/after it", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1000 })];
    const stillActive = buildDisciplineStatusMap(events, "1H", 1000 + SIN_BIN_DURATION_SECONDS - 1);
    const expired = buildDisciplineStatusMap(events, "1H", 1000 + SIN_BIN_DURATION_SECONDS);
    expect(stillActive.get("p1")).toBe("SIN_BIN");
    expect(expired.get("p1")).toBeUndefined();
  });

  it("Pause does not consume the sanction window — the helper is a pure function of currentClockSeconds, not wall time; calling it repeatedly with the same frozen clock value (as happens while paused) always returns the same result", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1000 })];
    const frozenClock = 1300; // clock frozen at this value for the whole pause window
    const beforePause = buildDisciplineStatusMap(events, "1H", frozenClock);
    // Any number of re-evaluations against the same frozen match-clock value
    // (simulating real-world time passing while the interval is stopped)
    // must be identical — nothing here reads Date.now() or a timer.
    const duringPause1 = buildDisciplineStatusMap(events, "1H", frozenClock);
    const duringPause2 = buildDisciplineStatusMap(events, "1H", frozenClock);
    expect(duringPause1.get("p1")).toBe(beforePause.get("p1"));
    expect(duringPause2.get("p1")).toBe(beforePause.get("p1"));
    expect(duringPause1.get("p1")).toBe("SIN_BIN");
  });

  it("removing the Sin Bin event (Undo) clears the status immediately", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1000 })];
    const afterUndo = events.slice(0, -1);
    const status = buildDisciplineStatusMap(afterUndo, "1H", 1050);
    expect(status.get("p1")).toBeUndefined();
  });

  it("Red overrides an active Sin Bin — 'Sin Bin -> Red' resolves to RED with no Sin Bin status visible", () => {
    const events = [
      buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1000 }),
      buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 1100 }),
    ];
    const status = buildDisciplineStatusMap(events, "1H", 1150);
    expect(status.get("p1")).toBe("RED");
  });

  it("'Yellow -> Red' resolves to RED", () => {
    const events = [
      buildEvent({ kind: "YELLOW_CARD", playerId: "p1", period: "1H", matchClockSeconds: 500 }),
      buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 900 }),
    ];
    const status = buildDisciplineStatusMap(events, "1H", 950);
    expect(status.get("p1")).toBe("RED");
  });

  it("a Red recorded after an active Sin Bin is never masked by a later, unrelated Sin Bin re-scan order", () => {
    // Red must win regardless of array order.
    const events = [
      buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 900 }),
      buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1000 }),
    ];
    const status = buildDisciplineStatusMap(events, "1H", 1050);
    expect(status.get("p1")).toBe("RED");
  });
});

describe("Cross-half safety — the current model cannot compare matchClockSeconds across periods", () => {
  it("a Sin Bin still within its window in the issuing period stays SIN_BIN in that period", () => {
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1700 })];
    // Still 1H, well within the window.
    const status = buildDisciplineStatusMap(events, "1H", 1900);
    expect(status.get("p1")).toBe("SIN_BIN");
  });

  it("safe fallback: once the period changes relative to the sanction's own period, status is not auto-cleared — it keeps showing SIN_BIN rather than silently (and possibly wrongly) expiring", () => {
    // Sanction issued late in 1H, clock resets to 0 for 2H — matchClockSeconds
    // is not comparable across the boundary, so this must not attempt the
    // arithmetic at all.
    const events = [buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1750 })];
    const status = buildDisciplineStatusMap(events, "2H", 120);
    expect(status.get("p1")).toBe("SIN_BIN");
  });

  it("a Sin Bin issued in 1H is unaffected by unrelated 2H events for other players", () => {
    const events = [
      buildEvent({ kind: "SIN_BIN", playerId: "p1", period: "1H", matchClockSeconds: 1750 }),
      buildEvent({ kind: "GOAL", playerId: "p2", period: "2H", matchClockSeconds: 60 }),
    ];
    const status = buildDisciplineStatusMap(events, "2H", 120);
    expect(status.get("p1")).toBe("SIN_BIN");
    expect(status.get("p2")).toBeUndefined();
  });

  it("Red recorded in the prior period still overrides regardless of the period boundary", () => {
    const events = [buildEvent({ kind: "RED_CARD", playerId: "p1", period: "1H", matchClockSeconds: 1750 })];
    const status = buildDisciplineStatusMap(events, "2H", 120);
    expect(status.get("p1")).toBe("RED");
  });
});
