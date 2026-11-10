// @vitest-environment jsdom
// Entry points for the HT / FT dashboard PNG: Event Stats Live (Options sheet)
// and saved-match Review (Dashboard Image rows). HT appears only once the
// first half is complete; FT only at Full Time. Opening a dashboard never
// writes to storage or changes the match.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./htFtDashboardRenderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./htFtDashboardRenderer")>()),
  renderHtFtDashboardPng: vi.fn(async () => new File([new Uint8Array([1])], "dashboard.png", { type: "image/png" })),
}));

import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { ProTaggerLiveScreen } from "../ProTaggerLiveScreen";
import { ProTaggerReviewScreen } from "../ProTaggerReviewScreen";
import { buildDefaultSquad, type ProTaggerSession } from "../pro-tagger-session";
import type { ProTaggerSavedMatch } from "../pro-tagger-storage";
import { renderHtFtDashboardPng } from "./htFtDashboardRenderer";

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

describe("Event Stats Live — Options entry points", () => {
  it.each([
    ["FIRST_HALF", false, false],
    ["HALF_TIME", true, false],
    ["SECOND_HALF", true, false],
    ["FULL_TIME", true, true],
  ] as const)("%s → HT Dashboard %s, FT Dashboard %s", (state, ht, ft) => {
    mountLive(state);
    expect(screen.queryByRole("button", { name: "HT Dashboard (PNG)" }) !== null).toBe(ht);
    expect(screen.queryByRole("button", { name: "FT Dashboard (PNG)" }) !== null).toBe(ft);
    // The existing Share Summary PNG action is still there, unchanged.
    expect(screen.getByRole("button", { name: "Share Summary PNG" })).toBeTruthy();
  });

  it("HT during the second half shows first-half figures only, and writes nothing", async () => {
    mountLive("SECOND_HALF");
    const before = storageSnapshot();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "HT Dashboard (PNG)" })); });
    const dialog = await screen.findByRole("dialog", { name: "HT Dashboard" });
    expect(within(dialog).getByAltText(/HT Dashboard/)).toBeTruthy();
    const view = vi.mocked(renderHtFtDashboardPng).mock.calls[0][0];
    expect(view.period).toBe("HT");
    expect(view.home.score).toEqual({ goals: 0, points: 1, total: 1 });
    expect(view.away.score).toEqual({ goals: 1, points: 0, total: 3 });
    expect(storageSnapshot()).toBe(before);
  });

  it("FT at Full Time uses the complete match", async () => {
    mountLive("FULL_TIME");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "FT Dashboard (PNG)" })); });
    await screen.findByRole("dialog", { name: "FT Dashboard" });
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

describe("saved-match Review — Dashboard Image rows", () => {
  it.each([
    ["FIRST_HALF", false, false],
    ["HALF_TIME", true, false],
    ["SECOND_HALF", true, false],
    ["FULL_TIME", true, true],
  ] as const)("%s → HT enabled %s, FT enabled %s", (state, ht, ft) => {
    mountReview(state);
    expect(row("HT Dashboard (PNG)").disabled).toBe(!ht);
    expect(row("FT Dashboard (PNG)").disabled).toBe(!ft);
    if (!ht) expect(screen.getByText("Available once the first half is complete")).toBeTruthy();
    if (!ft) expect(screen.getByText("Available once the match is marked Full Time")).toBeTruthy();
  });

  it("an unfinished saved match never offers a Full-Time dashboard", () => {
    mountReview("SECOND_HALF");
    fireEvent.click(row("FT Dashboard (PNG)"));
    expect(screen.queryByRole("dialog", { name: "FT Dashboard" })).toBeNull();
    expect(renderHtFtDashboardPng).not.toHaveBeenCalled();
  });

  it("opens the HT and FT previews for a finished match without changing it or storage", async () => {
    const { match, before } = mountReview("FULL_TIME");
    const storageBefore = storageSnapshot();

    await act(async () => { fireEvent.click(row("HT Dashboard (PNG)")); });
    await screen.findByRole("dialog", { name: "HT Dashboard" });
    expect(vi.mocked(renderHtFtDashboardPng).mock.calls[0][0].home.score.total).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));

    await act(async () => { fireEvent.click(row("FT Dashboard (PNG)")); });
    await screen.findByRole("dialog", { name: "FT Dashboard" });
    expect(vi.mocked(renderHtFtDashboardPng).mock.calls[1][0].home.score.total).toBe(3);

    expect(JSON.stringify(match)).toBe(before);
    expect(storageSnapshot()).toBe(storageBefore);
  });
});
