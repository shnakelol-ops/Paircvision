// @vitest-environment jsdom
/**
 * The live screen's coach-facing warnings when a save cannot complete:
 * unreadable saved-match storage is never written over, the warning names
 * the cause, it stays while saves keep failing, and it clears only when the
 * Event Stats record is actually stored. Drives the real screen.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProTaggerLiveScreen } from "./ProTaggerLiveScreen";
import { PRO_TAGGER_MATCHES_STORAGE_KEY, type ProTaggerSavedMatch } from "./pro-tagger-storage";
import { SAVED_MATCHES_STORAGE_KEY } from "../core/stats/saved-match";
import { buildDefaultSquad, type ProTaggerSession } from "./pro-tagger-session";

const session: ProTaggerSession = {
  id: "protect-session",
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

const BLOCKED = "Save blocked — saved matches storage is corrupted.";
const FULL = "Save failed — storage full. Back up and delete old matches.";
const CORRUPT = '[{"id":"older","createdAt":1}, {"trunc';

function stored(): ProTaggerSavedMatch | undefined {
  const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ProTaggerSavedMatch[]).find((m) => m.id === session.id) : undefined;
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const click = (el: Element) => act(() => { fireEvent.click(el); });
const button = (name: string) => screen.getByRole("button", { name });
function tagTurnoverWon() {
  click(screen.getByLabelText("OUR TURNOVERS WON: Tackle"));
  click(button("No player / Unknown"));
  act(() => { fireEvent.pointerDown(screen.getByLabelText("Pitch - tap to place event")); });
}
const finishConfirmation = () => tick(800);
function start(onEnd: () => void = () => {}) {
  render(<ProTaggerLiveScreen session={session} onEnd={onEnd} />);
  click(button("▶ Start"));
  tick(10_000);
}
function quotaFailures() {
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-03T14:00:00Z") });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("live capture against storage that cannot be saved to", () => {
  it("unreadable store: no 'Event saved', the 'Save blocked' warning shows, and the stored value is untouched", () => {
    window.localStorage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, CORRUPT);
    start();
    tagTurnoverWon();
    expect(screen.queryByText("✓ Event saved")).toBeNull();
    expect(screen.getAllByText(BLOCKED).length).toBeGreaterThan(0);
    finishConfirmation();
    expect(screen.getByText(BLOCKED)).toBeTruthy();
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("the warning stays while saves keep failing and clears only when the Event Stats save succeeds", () => {
    start();
    tagTurnoverWon(); finishConfirmation();
    const failing = quotaFailures();
    tagTurnoverWon(); finishConfirmation();
    expect(screen.getByText(FULL)).toBeTruthy();
    tagTurnoverWon(); finishConfirmation();
    expect(screen.getByText(FULL)).toBeTruthy();                        // still failing: still shown
    expect(stored()?.events).toHaveLength(1);                           // nothing was overwritten
    failing.mockRestore();
    tagTurnoverWon();
    expect(screen.getByText("✓ Event saved")).toBeTruthy();
    finishConfirmation();
    expect(screen.queryByText(FULL)).toBeNull();
    expect(stored()?.events).toHaveLength(4);                           // every in-memory event now stored
  });
});

describe("Save Match and Save & Finish", () => {
  it("Save Match with an unreadable Match Stats archive: match saved, archive untouched, coach told the copy is missing", () => {
    window.localStorage.setItem(SAVED_MATCHES_STORAGE_KEY, CORRUPT);
    start();
    tagTurnoverWon(); finishConfirmation();
    click(button("⋯ Options"));
    click(button("Save Match"));
    expect(screen.getByText("Match saved. Match Stats copy not updated — its storage is corrupted.")).toBeTruthy();
    expect(window.localStorage.getItem(SAVED_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
    expect(stored()?.events).toHaveLength(1);
  });

  it("Save & Finish with unreadable Event Stats storage: blocked, the match is not ended, storage untouched", () => {
    window.localStorage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, CORRUPT);
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    click(button("HT")); click(button("End Half"));
    click(button("START SECOND HALF")); tick(5_000);
    click(button("FT")); click(button("Finish Match"));
    click(button("Save & Finish"));
    expect(screen.getByText(BLOCKED)).toBeTruthy();
    tick(5_000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("Save & Finish with an unreadable Match Stats archive: match saved, coach told, then the match ends", () => {
    window.localStorage.setItem(SAVED_MATCHES_STORAGE_KEY, CORRUPT);
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    click(button("HT")); click(button("End Half"));
    click(button("START SECOND HALF")); tick(5_000);
    click(button("FT")); click(button("Finish Match"));
    click(button("Save & Finish"));
    expect(screen.getByText("Match saved. Match Stats copy not updated — its storage is corrupted.")).toBeTruthy();
    expect(onEnd).not.toHaveBeenCalled();
    tick(3_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(stored()?.restoreContext.matchState).toBe("FULL_TIME");
    expect(window.localStorage.getItem(SAVED_MATCHES_STORAGE_KEY)).toBe(CORRUPT);
  });
});

describe("leaving the live match with changes that could not be stored", () => {
  const LEAVE = "Leave match?";
  const goHome = () => { click(button("⋯ Options")); click(button("Home")); };

  it("fully saved match: Home leaves at once, no confirmation", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    goHome();
    expect(screen.queryByText(LEAVE)).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("after a failed save, Home asks first; Stay in Match keeps every event and changes nothing", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    const failing = quotaFailures();
    tagTurnoverWon(); finishConfirmation();
    const storedBefore = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
    goHome();
    expect(screen.getByText(LEAVE)).toBeTruthy();
    const body = screen.getByText(/Recent changes to this match have not been saved\./).textContent ?? "";
    expect(body).toMatch(/If you leave now, they may be permanently lost\./);
    expect(body).toMatch(/Stay in Match keeps them in memory, but they can only be saved once storage is available again\./);
    expect(body).toMatch(/Save failed — storage full\. Back up and delete old matches\.$/);
    expect(body).not.toMatch(/\.\)/);
    click(button("Stay in Match"));
    expect(screen.queryByText(LEAVE)).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(storedBefore);
    failing.mockRestore();
    tagTurnoverWon(); finishConfirmation();
    expect(stored()?.events).toHaveLength(3);                          // nothing held in memory was lost
  });

  it("Leave Anyway leaves only on that explicit tap", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    quotaFailures();
    tagTurnoverWon(); finishConfirmation();
    goHome();
    expect(onEnd).not.toHaveBeenCalled();
    click(button("Leave Anyway"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("once a later save succeeds, Home no longer asks", () => {
    const onEnd = vi.fn();
    start(onEnd);
    const failing = quotaFailures();
    tagTurnoverWon(); finishConfirmation();
    failing.mockRestore();
    tagTurnoverWon(); finishConfirmation();                           // catches up: both events stored
    goHome();
    expect(screen.queryByText(LEAVE)).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(stored()?.events).toHaveLength(2);
  });

  it("Home retries the save first: if storage is available again it saves and leaves without asking", () => {
    const onEnd = vi.fn();
    start(onEnd);
    const failing = quotaFailures();
    tagTurnoverWon(); finishConfirmation();
    failing.mockRestore();                                            // e.g. space freed in another tab
    goHome();
    expect(screen.queryByText(LEAVE)).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(stored()?.events).toHaveLength(1);
  });

  it("a failed Undo is protected the same way", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    tagTurnoverWon(); finishConfirmation();
    quotaFailures();
    click(button("↩"));
    goHome();
    expect(screen.getByText(LEAVE)).toBeTruthy();
    expect(onEnd).not.toHaveBeenCalled();
    expect(stored()?.events).toHaveLength(2);                          // storage still holds the pre-Undo state
  });

  it("a failed Half Time is protected from the half-time screen's Options → Home", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    quotaFailures();
    click(button("HT")); click(button("End Half"));
    expect(stored()?.restoreContext.matchState).toBe("FIRST_HALF");
    goHome();
    expect(screen.getByText(LEAVE)).toBeTruthy();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("a failed Full Time is protected from the full-time screen's Options → Home", () => {
    const onEnd = vi.fn();
    start(onEnd);
    tagTurnoverWon(); finishConfirmation();
    click(button("HT")); click(button("End Half"));
    click(button("START SECOND HALF")); tick(5_000);
    quotaFailures();
    click(button("FT")); click(button("Finish Match"));
    expect(stored()?.restoreContext.matchState).toBe("SECOND_HALF");
    goHome();
    expect(screen.getByText(LEAVE)).toBeTruthy();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
