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
