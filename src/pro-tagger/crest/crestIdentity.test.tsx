// @vitest-environment jsdom
// Club Crest V1, Checkpoint 2 — Saved Team identity end to end.
//
// The crest is found by ProTaggerSquad.savedTeamId only. These tests follow
// that id through the real screens and the real storage: Squads → Go To Game
// → live capture → Half Time → Full Time → saved match → restore → Review /
// Live → the Match Analysis source → the crest store. Names are never used.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analysisSources: unknown[] = [];
vi.mock("../dashboard/MatchAnalysisPreview", () => ({
  MatchAnalysisPreview: (props: { source: unknown }) => {
    analysisSources.push(props.source);
    return null;
  },
}));

import { ProTaggerSquadScreen } from "../ProTaggerSquadScreen";
import { ProTaggerLiveScreen } from "../ProTaggerLiveScreen";
import { ProTaggerReviewScreen } from "../ProTaggerReviewScreen";
import { savedMatchToSession } from "../ProTaggerPage";
import { buildDefaultSquad, type ProTaggerSession } from "../pro-tagger-session";
import { PRO_TAGGER_MATCHES_STORAGE_KEY, isValidProMatch, readProTaggerMatches, type ProTaggerSavedMatch } from "../pro-tagger-storage";
import { buildNewTeam, deleteTeam, saveTeam, type SavedTeam } from "../pro-tagger-team-storage";
import { SAVED_SQUADS_STORAGE_KEY } from "../../core/stats/saved-match";
import { mapSourceFromLive, mapSourceFromSavedMatch, type MatchMapSource } from "../dashboard/matchMapPerspective";
import { ftFixtureMatch } from "../dashboard/matchMapTestFixtures";
import { loadMatchCrests } from "./crest-artwork";
import type { ClubCrestRecord } from "./crest-store";
import { memoryCrestBackend } from "./crestTestFixtures";

function baseSession(overrides: Partial<ProTaggerSession> = {}): ProTaggerSession {
  return {
    id: "crest-session",
    sport: "gaelic",
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    venue: "",
    matchType: "league",
    attackDirection: "right",
    halfDurationMinutes: 30,
    createdAt: 1_790_000_000_000,
    homeSquad: buildDefaultSquad("HOME"),
    awaySquad: buildDefaultSquad("AWAY"),
    ...overrides,
  };
}

function team(id: string, teamName: string, named = true): SavedTeam {
  return {
    ...buildNewTeam({
      teamName,
      primaryColour: "#16a34a",
      secondaryColour: "#ffffff",
      players: named
        ? [{ id: `${id}-p1`, number: 1, name: "Declan", position: "GK" }]
        : buildDefaultSquad("AWAY").players.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position })),
    }),
    id,
  };
}

function storedMatch(id = "crest-session"): ProTaggerSavedMatch | undefined {
  const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ProTaggerSavedMatch[]).find((m) => m.id === id) : undefined;
}

const sourceIds = (s: unknown) => ({
  home: (s as MatchMapSource).homeSavedTeamId,
  away: (s as MatchMapSource).awaySavedTeamId,
});

beforeEach(() => {
  window.localStorage.clear();
  analysisSources.length = 0;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Squads screen → Go To Game ────────────────────────────────────────────────

function startFromSquads(session: ProTaggerSession, steps: () => void): ProTaggerSession {
  const onStart = vi.fn();
  render(<ProTaggerSquadScreen session={session} onBack={() => {}} onStart={onStart} crestStorageSupported={false} />);
  steps();
  fireEvent.click(screen.getAllByRole("button", { name: "Go To Game" })[0]);
  return onStart.mock.calls[0][0] as ProTaggerSession;
}

function loadFromLibrary(tabName: string, rowIndex: number) {
  fireEvent.click(screen.getByRole("button", { name: tabName }));
  fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Load" })[rowIndex]);
}

describe("Squads: loading or saving a Saved Team links the squad to its id", () => {
  it("Home and Away Saved Teams: each side carries its own team's actual id", () => {
    saveTeam(team("t-galb", "Galbally"));
    saveTeam(team("t-bally", "Ballylanders")); // newest first in the library
    const started = startFromSquads(baseSession(), () => {
      loadFromLibrary("Ballylanders", 0);
      loadFromLibrary("Galbally", 1);
    });
    expect(started.homeSquad.savedTeamId).toBe("t-bally");
    expect(started.awaySquad.savedTeamId).toBe("t-galb");
    // The match's own squad ids (used by events as squadId) are untouched.
    expect(started.homeSquad.id).not.toBe("t-bally");
  });

  it("two Saved Teams with identical names stay distinct: the one loaded is the one linked", () => {
    saveTeam(team("st-marys-1", "St Mary's"));
    saveTeam(team("st-marys-2", "St Mary's"));
    const second = startFromSquads(baseSession(), () => loadFromLibrary("Ballylanders", 1));
    expect(second.homeSquad.savedTeamId).toBe("st-marys-1");
    cleanup();
    const first = startFromSquads(baseSession(), () => loadFromLibrary("Ballylanders", 0));
    expect(first.homeSquad.savedTeamId).toBe("st-marys-2");
  });

  it("loading a different team replaces the link", () => {
    saveTeam(team("a", "Kilfinane"));
    saveTeam(team("b", "Knocklong"));
    const started = startFromSquads(baseSession(), () => {
      loadFromLibrary("Ballylanders", 0);
      loadFromLibrary("Ballylanders", 1);
    });
    expect(started.homeSquad.savedTeamId).toBe("a");
  });

  it("a Club only opposition loaded from the library links its id", () => {
    saveTeam(team("t-club-only", "Galbally", false));
    const started = startFromSquads(baseSession(), () => loadFromLibrary("Galbally", 0));
    expect(started.awaySquad.savedTeamId).toBe("t-club-only");
    expect(started.awaySquad.players.every((p) => p.name === "")).toBe(true);
  });

  it("saving the current squad to the library links it to the new team's id", () => {
    const started = startFromSquads(baseSession(), () => {
      fireEvent.click(screen.getByRole("button", { name: "Galbally" }));
      fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    const saved = JSON.parse(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)!) as SavedTeam[];
    expect(saved).toHaveLength(1);
    expect(started.awaySquad.savedTeamId).toBe(saved[0].id);
    expect(started.homeSquad.savedTeamId).toBeUndefined();
  });

  it("an unlinked squad has no id, and a resumed draft keeps its existing links", () => {
    expect(startFromSquads(baseSession(), () => {}).homeSquad.savedTeamId).toBeUndefined();
    cleanup();
    const resumed = baseSession({
      homeSquad: { ...buildDefaultSquad("HOME"), savedTeamId: "t-bally" },
      awaySquad: { ...buildDefaultSquad("AWAY"), savedTeamId: "t-galb" },
    });
    const started = startFromSquads(resumed, () => {});
    expect([started.homeSquad.savedTeamId, started.awaySquad.savedTeamId]).toEqual(["t-bally", "t-galb"]);
  });
});

// ─── Live capture → HT → FT → saved match → restore → analysis ───────────────

describe("the link survives live capture, Half Time, Full Time, saving and restoring", () => {
  const linked = baseSession({
    homeSquad: { ...buildDefaultSquad("HOME"), savedTeamId: "t-bally", teamName: "Ballylanders" },
    awaySquad: { ...buildDefaultSquad("AWAY"), savedTeamId: "t-galb", teamName: "Galbally" },
  });
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const click = (el: Element) => act(() => { fireEvent.click(el); });
  const button = (name: string) => screen.getByRole("button", { name });
  const ids = (m?: ProTaggerSavedMatch) => [m?.homeSquad.savedTeamId, m?.awaySquad.savedTeamId];

  it("setup → live → HT → FT → saved → restored → Review / Live Match Analysis", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T14:00:00Z") });
    const live = render(<ProTaggerLiveScreen session={linked} onEnd={() => {}} />);
    click(button("▶ Start"));
    tick(30_000);
    click(screen.getByLabelText("OUR TURNOVERS WON: Tackle"));
    click(button("No player / Unknown"));
    act(() => { fireEvent.pointerDown(screen.getByLabelText("Pitch - tap to place event")); });
    tick(800);
    expect(ids(storedMatch())).toEqual(["t-bally", "t-galb"]);

    click(button("HT"));
    click(button("End Half"));
    expect(storedMatch()?.restoreContext.matchState).toBe("HALF_TIME");
    expect(ids(storedMatch())).toEqual(["t-bally", "t-galb"]);

    // Live Match Analysis at Half Time gets both ids.
    fireEvent.click(screen.getAllByRole("button", { name: /Options/ })[0]);
    click(button("Match Analysis (PNG)"));
    expect(sourceIds(analysisSources.at(-1))).toEqual({ home: "t-bally", away: "t-galb" });

    click(button("START SECOND HALF"));
    tick(60_000);
    click(button("FT"));
    click(button("Finish Match"));
    const saved = storedMatch()!;
    expect(saved.restoreContext.matchState).toBe("FULL_TIME");
    expect(ids(saved)).toEqual(["t-bally", "t-galb"]);
    live.unmount();
    vi.useRealTimers();

    // The app is closed and reopened: the stored record restores with its links.
    const reread = readProTaggerMatches().find((m) => m.id === saved.id)!;
    const restored = savedMatchToSession(reread);
    expect([restored.homeSquad.savedTeamId, restored.awaySquad.savedTeamId]).toEqual(["t-bally", "t-galb"]);
    expect(sourceIds(mapSourceFromSavedMatch(reread))).toEqual({ home: "t-bally", away: "t-galb" });
    expect(sourceIds(mapSourceFromLive(restored, reread.events, "FULL_TIME"))).toEqual({ home: "t-bally", away: "t-galb" });

    // Review → Match Analysis.
    render(<ProTaggerReviewScreen match={reread} onBack={() => {}} onMatchUpdate={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Match Analysis (PNG)" })); });
    expect(sourceIds(analysisSources.at(-1))).toEqual({ home: "t-bally", away: "t-galb" });
  });
});

// ─── Older matches, malformed ids, storage compatibility ───────────────────────

describe("older matches and storage compatibility", () => {
  it("a match recorded before Club Crest V1 has no ids (monograms) and is otherwise read exactly as before", () => {
    const old = ftFixtureMatch();
    expect("savedTeamId" in old.homeSquad).toBe(false);
    expect(sourceIds(mapSourceFromSavedMatch(old))).toEqual({ home: undefined, away: undefined });
    // The stored JSON of an old match is valid, unchanged by reading, and restores without inventing an id.
    window.localStorage.setItem(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify([old]));
    const raw = window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY);
    const read = readProTaggerMatches();
    expect(read).toHaveLength(1);
    expect(isValidProMatch(read[0])).toBe(true);
    expect(savedMatchToSession(read[0]).homeSquad.savedTeamId).toBeUndefined();
    expect(window.localStorage.getItem(PRO_TAGGER_MATCHES_STORAGE_KEY)).toBe(raw);
  });

  it("malformed stored ids are ignored rather than used", () => {
    const m = ftFixtureMatch();
    for (const bad of ["", "   ", 42, null, { id: "x" }]) {
      const src = mapSourceFromSavedMatch({ ...m, homeSquad: { ...m.homeSquad, savedTeamId: bad as unknown as string } });
      expect(src.homeSavedTeamId).toBeUndefined();
    }
  });
});

// ─── From id to crest ─────────────────────────────────────────────────────────

describe("from a match's ids to the crest store", () => {
  const rec = (teamId: string, updatedAt = 1): ClubCrestRecord => ({
    v: 1, teamId, image: new Blob([teamId]), width: 100, height: 140, backgroundRemoved: false, needsBacking: false, teamName: teamId, updatedAt,
  });
  const decode = async (b: Blob) => ({ image: { width: 100, height: 140 } as unknown as CanvasImageSource, width: 100, height: 140, release: () => {}, b });

  it("a deleted Saved Team's retained crest still shows on its historical matches", async () => {
    saveTeam(team("t-galb", "Galbally"));
    const backend = memoryCrestBackend();
    backend.data.set("t-galb", rec("t-galb"));
    deleteTeam("t-galb");
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("[]");
    const m = ftFixtureMatch();
    const src = mapSourceFromSavedMatch({ ...m, awaySquad: { ...m.awaySquad, savedTeamId: "t-galb" } });
    const { crests } = await loadMatchCrests({ home: src.homeSavedTeamId, away: src.awaySavedTeamId }, { backend, decode, storageSupported: true });
    expect(crests.home).toBeNull(); // older side: monogram
    expect(crests.away?.key).toBe("t-galb:1");
  });

  it("an unknown id, or a crest the coach removed, gives the monogram; a replaced crest is used next time", async () => {
    const backend = memoryCrestBackend();
    const ids = { home: "never-saved", away: "t-galb" };
    expect((await loadMatchCrests(ids, { backend, decode, storageSupported: true })).crests).toEqual({ home: null, away: null });
    backend.data.set("t-galb", rec("t-galb", 1));
    expect((await loadMatchCrests(ids, { backend, decode, storageSupported: true })).crests.away?.key).toBe("t-galb:1");
    backend.data.set("t-galb", rec("t-galb", 2));
    expect((await loadMatchCrests(ids, { backend, decode, storageSupported: true })).crests.away?.key).toBe("t-galb:2");
    backend.data.delete("t-galb");
    expect((await loadMatchCrests(ids, { backend, decode, storageSupported: true })).crests.away).toBeNull();
  });

  it("the Team selector in Match Analysis never consults Saved Teams by name", () => {
    // Two Saved Teams named exactly like the match's teams but with other ids
    // must not influence the source: only the squads' own links count.
    saveTeam(team("impostor-1", "Ballylanders"));
    saveTeam(team("impostor-2", "Galbally"));
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    expect(sourceIds(src)).toEqual({ home: undefined, away: undefined });
    expect(within(document.body).queryByText("impostor-1")).toBeNull();
  });
});
