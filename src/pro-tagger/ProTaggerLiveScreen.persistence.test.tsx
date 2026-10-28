// @vitest-environment jsdom
/**
 * The live Event Stats screen writes every committed change to storage
 * immediately — no timer has to run — and the pitch screen's "✓ Event saved"
 * appears only once the event is actually stored. Drives the real screen
 * through the same taps a coach makes; storage is read straight after each
 * action, with fake timers frozen, so nothing can hide behind a debounce.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProTaggerLiveScreen, type RestoreState } from "./ProTaggerLiveScreen";
import { PRO_TAGGER_MATCHES_STORAGE_KEY, type ProTaggerSavedMatch } from "./pro-tagger-storage";
import { buildDefaultSquad, type ProTaggerSession } from "./pro-tagger-session";

const session: ProTaggerSession = {
  id: "p0-session",
  sport: "gaelic",
  homeTeamName: "Ballyboden",
  awayTeamName: "Na Fianna",
  venue: "Home ground",
  matchType: "league",
  attackDirection: "right",
  halfDurationMinutes: 30,
  createdAt: 1_790_000_000_000,
  homeSquad: buildDefaultSquad("HOME"),
  awaySquad: buildDefaultSquad("AWAY"),
};

function stored(): ProTaggerSavedMatch | undefined {
  const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ProTaggerSavedMatch[]).find((m) => m.id === session.id) : undefined;
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const click = (el: Element) => act(() => { fireEvent.click(el); });
const button = (name: string) => screen.getByRole("button", { name });

/** Tile → No player → pitch tap. Leaves the screen on the 750 ms confirmation. */
function tagTurnoverWon() {
  click(screen.getByLabelText("OUR TURNOVERS WON: Tackle"));
  click(button("No player / Unknown"));
  act(() => { fireEvent.pointerDown(screen.getByLabelText("Pitch - tap to place event")); });
}
/** Lets the confirmation finish so the tile grid is back. */
const finishConfirmation = () => tick(800);

function startMatch(restoreState?: RestoreState) {
  const view = render(<ProTaggerLiveScreen session={session} onEnd={() => {}} restoreState={restoreState} />);
  if (!restoreState) click(button("▶ Start"));
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-28T14:00:00Z") });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Event Stats live persistence (P0)", () => {
  it("stores a completed event at once, with the current clock, before any timer runs", () => {
    startMatch();
    tick(30_000);
    tagTurnoverWon();
    expect(stored()?.events).toHaveLength(1);
    expect(stored()?.events[0].kind).toBe("TURNOVER_WON");
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(30);
    expect(screen.getByText("✓ Event saved")).toBeTruthy();
  });

  it("stores each of five rapid events — none waits on, or cancels, another", () => {
    startMatch();
    tick(10_000);
    for (let i = 1; i <= 5; i++) {
      tagTurnoverWon();
      expect(stored()?.events).toHaveLength(i);
      finishConfirmation();
    }
    const ids = stored()!.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("stores Undo, Half Time, Start Second Half and Full Time at once", () => {
    startMatch();
    tick(20_000);
    tagTurnoverWon(); finishConfirmation();
    tagTurnoverWon(); finishConfirmation();
    click(button("↩"));
    expect(stored()?.events).toHaveLength(1);

    tick(100_000);                         // 20 s + two 0.8 s confirmations + 100 s = 121.6 s
    click(button("HT"));
    click(button("End Half"));
    expect(stored()?.restoreContext).toMatchObject({ matchState: "HALF_TIME", currentHalf: 1, matchTimeSeconds: 121 });

    click(button("START SECOND HALF"));
    expect(stored()?.restoreContext).toMatchObject({ matchState: "SECOND_HALF", currentHalf: 2, matchTimeSeconds: 0 });

    tick(95_000);
    click(button("FT"));
    click(button("Finish Match"));
    expect(stored()?.restoreContext).toMatchObject({ matchState: "FULL_TIME", currentHalf: 2, matchTimeSeconds: 95 });
    expect(stored()?.events).toHaveLength(1);
  });

  it("stores the latest clock when the app is backgrounded (visibilitychange → hidden, pagehide)", () => {
    startMatch();
    tick(60_000);
    tagTurnoverWon(); finishConfirmation();
    tick(7 * 60_000);                      // seven minutes with no events
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(60);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(480);
    visibility.mockRestore();
    tick(5_000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(485);
    expect(stored()?.events).toHaveLength(1);
  });

  it("stores the paused clock on Pause and keeps it while paused and backgrounded", () => {
    startMatch();
    tick(90_000);
    click(button("⏸ Pause"));
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(90);
    tick(120_000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(90);
  });

  it("reopens on the last stored state, paused, and resumes only when the coach taps Resume", () => {
    const first = startMatch();
    tick(45_000);
    tagTurnoverWon(); finishConfirmation();
    tick(30_000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    first.unmount();

    const m = stored()!;
    render(
      <ProTaggerLiveScreen
        session={session}
        onEnd={() => {}}
        restoreState={{
          events: m.events, homeSquadLiveState: m.homeSquadLiveState, awaySquadLiveState: m.awaySquadLiveState,
          matchState: m.restoreContext.matchState, half: m.restoreContext.currentHalf, clockSeconds: m.restoreContext.matchTimeSeconds,
        }}
      />,
    );
    expect(screen.getByText("MATCH REOPENED")).toBeTruthy();
    expect(screen.getByText(/paused at 01:15/)).toBeTruthy();
    tick(60_000);                          // still paused: nothing moves the stored clock
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(75);
    click(button("RESUME MATCH"));
    tick(5_000);
    tagTurnoverWon();
    expect(stored()?.events).toHaveLength(2);
    expect(stored()?.restoreContext.matchTimeSeconds).toBe(80);
  });

  it("never claims an event was saved when the write fails, and keeps it in memory for the next successful write", () => {
    startMatch();
    tick(10_000);
    tagTurnoverWon(); finishConfirmation();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    tagTurnoverWon();
    expect(screen.queryByText("✓ Event saved")).toBeNull();
    expect(screen.getAllByText("Save failed — storage unavailable.").length).toBeGreaterThan(0);
    expect(stored()?.events).toHaveLength(1);
    finishConfirmation();
    expect(screen.getByText("Save failed — storage unavailable.")).toBeTruthy();   // persistent strip warning

    setItem.mockRestore();
    tagTurnoverWon();
    expect(screen.getByText("✓ Event saved")).toBeTruthy();
    expect(stored()?.events).toHaveLength(3);
  });

  it("registers the background listeners once and removes them on unmount", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");
    const view = startMatch();
    tick(10_000);
    tagTurnoverWon(); finishConfirmation();
    tagTurnoverWon(); finishConfirmation();
    const count = (spy: typeof docAdd, type: string) => spy.mock.calls.filter((c) => c[0] === type).length;
    expect(count(docAdd, "visibilitychange")).toBe(1);
    expect(count(winAdd, "pagehide")).toBe(1);
    view.unmount();
    expect(count(docRemove, "visibilitychange")).toBe(1);
    expect(count(winRemove, "pagehide")).toBe(1);
  });
});
