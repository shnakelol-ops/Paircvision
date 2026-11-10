// @vitest-environment jsdom
// Entry points for Match Analysis (Dashboard / Scoring / Turnovers PNGs):
// Event Stats Live (one Options action) and saved-match Review (one Match
// Analysis row). Match Analysis appears once the first half is complete; its
// FT selector only at Full Time. Opening it never writes to storage or
// changes the match.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./htFtDashboardRenderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./htFtDashboardRenderer")>()),
  renderHtFtDashboardPng: vi.fn(async () => new File([new Uint8Array([1])], "dashboard.png", { type: "image/png" })),
}));
vi.mock("./matchMapRenderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./matchMapRenderer")>()),
  renderScoringMapPng: vi.fn(async () => new File([new Uint8Array([1])], "scoring.png", { type: "image/png" })),
  renderTurnoverMapPng: vi.fn(async () => new File([new Uint8Array([1])], "turnovers.png", { type: "image/png" })),
}));

import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { ProTaggerLiveScreen } from "../ProTaggerLiveScreen";
import { ProTaggerReviewScreen } from "../ProTaggerReviewScreen";
import { buildDefaultSquad, type ProTaggerSession } from "../pro-tagger-session";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";
import { renderHtFtDashboardPng } from "./htFtDashboardRenderer";
import { renderScoringMapPng, renderTurnoverMapPng } from "./matchMapRenderer";

type MatchState = ProTaggerSavedMatch["restoreContext"]["matchState"];

function ev(id: string, kind: LoggedMatchEvent["kind"], teamSide: "FOR" | "OPP", period: "1H" | "2H"): LoggedMatchEvent {
  return { id, kind, type: kind, teamSide, period, half: period === "1H" ? 1 : 2, nx: 0.5, ny: 0.5, x: 0.5, y: 0.5, segment: 1, timestamp: 1, matchClockSeconds: 1, createdAt: 1 } as LoggedMatchEvent;
}

const EVENTS: LoggedMatchEvent[] = [
  ev("e1", "POINT", "FOR", "1H"),
  ev("e2", "GOAL", "OPP", "1H"),
  ev("e3", "POINT", "FOR", "2H"),
  ev("e4", "POINT", "FOR", "2H"),
];

const session: ProTaggerSession = {
  id: "dash-session",
  sport: "gaelic",
  homeTeamName: "Ballylanders",
  awayTeamName: "Galbally",
  venue: "Home ground",
  matchType: "league",
  attackDirection: "right",
  halfDurationMinutes: 30,
  createdAt: 1_790_000_000_000,
  homeSquad: buildDefaultSquad("HOME"),
  awaySquad: buildDefaultSquad("AWAY"),
};

function savedMatch(matchState: MatchState): ProTaggerSavedMatch {
  return {
    id: "dash-match",
    createdAt: 1_790_000_000_000,
    updatedAt: 1_790_000_000_000,
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    venue: "Home ground",
    sport: "gaelic",
    matchType: "league",
    halfDurationMinutes: 30,
    scorelineSnapshot: "",
    eventCount: EVENTS.length,
    events: EVENTS,
    homeSquad: session.homeSquad,
    awaySquad: session.awaySquad,
    homeSquadLiveState: session.homeSquad.players,
    awaySquadLiveState: session.awaySquad.players,
    restoreContext: {
      matchState,
      currentHalf: matchState === "FIRST_HALF" || matchState === "PRE_MATCH" ? 1 : 2,
      matchTimeSeconds: 0,
      firstHalfAttackingDirection: "right",
    },
  } as ProTaggerSavedMatch;
}

function storageSnapshot(): string {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)!;
    out[k] = window.localStorage.getItem(k);
  }
  return JSON.stringify(out);
}

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:dashboard") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.mocked(renderHtFtDashboardPng).mockClear();
  vi.mocked(renderScoringMapPng).mockClear();
  vi.mocked(renderTurnoverMapPng).mockClear();
});

afterEach(() => {
  cleanup();
});

// ─── Live ─────────────────────────────────────────────────────────────────────

function mountLive(matchState: MatchState) {
  const events = matchState === "FIRST_HALF" ? EVENTS.filter((e) => e.period === "1H") : EVENTS;
  render(
    <ProTaggerLiveScreen
      session={session}
      onEnd={() => {}}
      restoreState={{
        events,
        homeSquadLiveState: session.homeSquad.players,
        awaySquadLiveState: session.awaySquad.players,
        matchState,
        half: matchState === "FIRST_HALF" ? 1 : 2,
        clockSeconds: 600,
      }}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /Options/ })[0]);
}

const pressed = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name }) as HTMLButtonElement;

describe("Event Stats Live — one Match Analysis action", () => {
  it.each([
    ["FIRST_HALF", false],
    ["HALF_TIME", true],
    ["SECOND_HALF", true],
    ["FULL_TIME", true],
  ] as const)("%s → Match Analysis %s", (state, shown) => {
    mountLive(state);
    expect(screen.queryByRole("button", { name: "Match Analysis (PNG)" }) !== null).toBe(shown);
    // One entry, not a button per page / half.
    expect(screen.queryByRole("button", { name: "HT Dashboard (PNG)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "FT Dashboard (PNG)" })).toBeNull();
    // The existing Share Summary PNG action is still there, unchanged.
    expect(screen.getByRole("button", { name: "Share Summary PNG" })).toBeTruthy();
  });

  it("during the second half: HT only, first-half figures only, and writes nothing", async () => {
    mountLive("SECOND_HALF");
    const before = storageSnapshot();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Match Analysis (PNG)" })); });
    const dialog = await screen.findByRole("dialog", { name: "Match Analysis" });
    expect(await within(dialog).findByAltText(/HT Dashboard/)).toBeTruthy();
    expect(pressed("Half", "FT").disabled).toBe(true);
    const view = vi.mocked(renderHtFtDashboardPng).mock.calls[0][0];
    expect(view.period).toBe("HT");
    expect(view.home.score).toEqual({ goals: 0, points: 1, total: 1 });
    expect(view.away.score).toEqual({ goals: 1, points: 0, total: 3 });
    expect(storageSnapshot()).toBe(before);
  });

  it("at Full Time opens on FT with the complete match", async () => {
    mountLive("FULL_TIME");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Match Analysis (PNG)" })); });
    await screen.findByRole("dialog", { name: "Match Analysis" });
    await screen.findByAltText(/FT Dashboard/);
    const view = vi.mocked(renderHtFtDashboardPng).mock.calls[0][0];
    expect(view.period).toBe("FT");
    expect(view.home.score).toEqual({ goals: 0, points: 3, total: 3 });
    expect(view.stageLabel).toBe("FULL-TIME");
  });
});

// ─── Review ───────────────────────────────────────────────────────────────────

function mountReview(matchState: MatchState) {
  const match = savedMatch(matchState);
  const before = JSON.stringify(match);
  render(<ProTaggerReviewScreen match={match} onBack={() => {}} onMatchUpdate={() => {}} />);
  return { match, before };
}

const row = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("saved-match Review — one Match Analysis row", () => {
  it.each([
    ["PRE_MATCH", false],
    ["FIRST_HALF", false],
    ["HALF_TIME", true],
    ["SECOND_HALF", true],
    ["FULL_TIME", true],
  ] as const)("%s → Match Analysis enabled %s", (state, enabled) => {
    mountReview(state);
    expect(row("Match Analysis (PNG)").disabled).toBe(!enabled);
    if (!enabled) expect(screen.getByText("Available once the first half is complete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "HT Dashboard (PNG)" })).toBeNull();
  });

  it("an unfinished saved match never offers Full Time", async () => {
    mountReview("SECOND_HALF");
    await act(async () => { fireEvent.click(row("Match Analysis (PNG)")); });
    await screen.findByRole("dialog", { name: "Match Analysis" });
    expect(pressed("Half", "FT").disabled).toBe(true);
    fireEvent.click(pressed("Half", "FT"));
    await screen.findByAltText(/HT Dashboard/);
    expect(vi.mocked(renderHtFtDashboardPng).mock.calls.every(([v]) => v.period === "HT")).toBe(true);
  });

  it("a record with no match state shows a reason instead of crashing", () => {
    const match = savedMatch("FULL_TIME");
    const partial = { ...match, restoreContext: { ...match.restoreContext, matchState: undefined } } as unknown as ProTaggerSavedMatch;
    render(<ProTaggerReviewScreen match={partial} onBack={() => {}} onMatchUpdate={() => {}} />);
    expect(row("Match Analysis (PNG)").disabled).toBe(true);
    expect(screen.getByText("Match state not recorded for this saved match")).toBeTruthy();
  });

  it("all three pages, HT and FT, both teams — without changing the match or storage", async () => {
    const { match, before } = mountReview("FULL_TIME");
    const storageBefore = storageSnapshot();
    await act(async () => { fireEvent.click(row("Match Analysis (PNG)")); });
    await screen.findByRole("dialog", { name: "Match Analysis" });

    // Opens on FT dashboard.
    await screen.findByAltText(/FT Dashboard/);
    expect(vi.mocked(renderHtFtDashboardPng).mock.calls[0][0].home.score.total).toBe(3);
    await act(async () => { fireEvent.click(pressed("Half", "HT")); });
    await screen.findByAltText(/HT Dashboard/);
    expect(vi.mocked(renderHtFtDashboardPng).mock.calls[1][0].home.score.total).toBe(1);

    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Scoring" })); });
    await screen.findByAltText("Scoring Map, Ballylanders, Half-Time");
    await act(async () => { fireEvent.click(pressed("Team", "Galbally")); });
    await screen.findByAltText("Scoring Map, Galbally, Half-Time");
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Turnovers" })); });
    await screen.findByAltText("Turnover Map, Galbally, Half-Time");

    expect(JSON.stringify(match)).toBe(before);
    expect(storageSnapshot()).toBe(storageBefore);
  });
});
