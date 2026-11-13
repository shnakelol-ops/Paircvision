// @vitest-environment jsdom
// Jersey Designer V2 — the full persistence workflow, through the real
// Squads screen, real Saved Teams storage, real match storage and the real
// reload path:
//   Save Team → Load Team → Go To Game → Live Player Picker → Close → Reload
// plus legacy records (no kit), Home/Away independence and legacy Match
// Stats coexistence on the shared Saved Teams key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// StatsModeSurface (imported for buildSavedSquadsStorageValue) pulls in the
// Pixi pitch, which cannot initialise under jsdom and is irrelevant here.
vi.mock("../core/pitch/create-pixi-pitch-surface", () => ({
  createPixiPitchSurface: () => new Promise(() => {}),
  exportPixiPitchSurfacePng: async () => null,
}));

import { buildSavedSquadsStorageValue } from "../StatsModeSurface";
import { ProTaggerSquadScreen } from "./ProTaggerSquadScreen";
import { ProTaggerPlayerPicker } from "./ProTaggerPlayerPicker";
import { savedMatchToSession } from "./ProTaggerPage";
import { buildDefaultSquad, type ProTaggerSession, type ProTaggerSquad } from "./pro-tagger-session";
import { buildNewTeam, exportTeamAsSquad, loadSavedTeams, saveTeam } from "./pro-tagger-team-storage";
import { readProTaggerMatches, saveProTaggerMatchFullResult, type ProTaggerSavedMatch } from "./pro-tagger-storage";
import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";
import type { JerseyKit } from "./jersey-kit";

function session(overrides: Partial<ProTaggerSession> = {}): ProTaggerSession {
  return {
    id: "s1",
    sport: "gaelic",
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    venue: "",
    matchType: "league",
    attackDirection: "right",
    halfDurationMinutes: 30,
    createdAt: 1,
    homeSquad: buildDefaultSquad("HOME"),
    awaySquad: buildDefaultSquad("AWAY"),
    ...overrides,
  };
}

function renderSquads(s: ProTaggerSession) {
  const onStart = vi.fn<(s: ProTaggerSession) => void>();
  const utils = render(<ProTaggerSquadScreen session={s} onBack={() => {}} onStart={onStart} crestStorageSupported={false} />);
  return { ...utils, onStart };
}

/** Kit shown on the Starting XV preview (every jersey must agree). */
function lineupKit(container: HTMLElement): JerseyKit {
  const svgs = [...container.querySelectorAll('svg[data-jersey-pattern]')].slice(-15);
  const kits = svgs.map((s) => ({
    pattern: s.getAttribute("data-jersey-pattern"),
    sleeves: s.getAttribute("data-jersey-sleeves"),
    collar: s.getAttribute("data-jersey-collar"),
  }));
  expect(new Set(kits.map((k) => JSON.stringify(k))).size).toBe(1);
  return kits[0] as JerseyKit;
}

function openDesigner() {
  fireEvent.click(screen.getByRole("button", { name: "Jersey design" }));
}

function choose(group: string, button: string) {
  fireEvent.click(within(screen.getByRole("group", { name: group })).getByRole("button", { name: new RegExp(button) }));
}

/** The record ProTaggerLiveScreen's buildSaveRecords writes (squads copied from session as-is). */
function matchRecord(s: ProTaggerSession): ProTaggerSavedMatch {
  return {
    id: s.id,
    createdAt: s.createdAt,
    homeTeamName: s.homeTeamName,
    awayTeamName: s.awayTeamName,
    venue: s.venue,
    sport: s.sport,
    matchType: s.matchType,
    halfDurationMinutes: s.halfDurationMinutes,
    scorelineSnapshot: "",
    eventCount: 0,
    events: [],
    homeSquad: s.homeSquad,
    awaySquad: s.awaySquad,
    homeSquadLiveState: s.homeSquad.players.map((p) => ({ ...p, isActive: true, activeSlot: p.number <= 15 ? p.number : undefined })),
    awaySquadLiveState: s.awaySquad.players.map((p) => ({ ...p, isActive: true, activeSlot: p.number <= 15 ? p.number : undefined })),
    restoreContext: { matchState: "FIRST_HALF", currentHalf: 1, matchTimeSeconds: 300, firstHalfAttackingDirection: "right" },
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Jersey Design panel", () => {
  it("is collapsed by default; the Starting XV shows the default kit", () => {
    const { container } = renderSquads(session());
    expect(screen.queryByRole("group", { name: "Jersey pattern" })).toBeNull();
    expect(screen.getByRole("button", { name: "Jersey design" }).getAttribute("aria-expanded")).toBe("false");
    expect(lineupKit(container)).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
  });

  it("four pattern buttons drawn in the team's own colours; choices combine and preview immediately", () => {
    const { container } = renderSquads(session());
    openDesigner();
    const patternButtons = within(screen.getByRole("group", { name: "Jersey pattern" })).getAllByRole("button");
    expect(patternButtons.map((b) => b.textContent)).toEqual(["Plain", "Chest V", "Hoop", "Stripes"]);
    for (const b of patternButtons) {
      expect(b.querySelector('[data-layer="body"]')!.getAttribute("fill")).toBe("#16a34a"); // home primary
    }
    choose("Jersey pattern", "Chest V");
    choose("Sleeves colour", "Secondary");
    choose("Collar colour", "Secondary");
    expect(lineupKit(container)).toEqual({ pattern: "chestV", sleeves: "secondary", collar: "secondary" });
    choose("Sleeves colour", "Primary");
    expect(lineupKit(container)).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });
    expect(within(screen.getByRole("group", { name: "Sleeves colour" })).getByRole("button", { name: /Primary/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Home and Away kits are independent", () => {
    const { container } = renderSquads(session());
    openDesigner();
    choose("Jersey pattern", "Hoop");
    fireEvent.click(screen.getByRole("button", { name: "Galbally" }));
    expect(lineupKit(container).pattern).toBe("plain");
    choose("Jersey pattern", "Stripes");
    fireEvent.click(screen.getByRole("button", { name: "Ballylanders" }));
    expect(lineupKit(container).pattern).toBe("hoop");
  });
});

describe("Save Team → Load Team → Go To Game → Picker → Close → Reload", () => {
  it("the kit survives every step of the workflow", () => {
    // 1. Design the home kit and Save Team.
    const first = renderSquads(session());
    openDesigner();
    choose("Jersey pattern", "Chest V");
    choose("Sleeves colour", "Primary");
    fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = loadSavedTeams();
    expect(saved).toHaveLength(1);
    expect(saved[0].kit).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });
    first.unmount();

    // 2. App closed and reopened: a fresh Squads screen loads the team.
    const second = renderSquads(session());
    expect(lineupKit(second.container).pattern).toBe("plain");
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(lineupKit(second.container)).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });

    // 3. Go To Game: the kit is on the match squad; the untouched away squad
    //    gets no kit written (legacy-style absent → default).
    fireEvent.click(screen.getAllByRole("button", { name: "Go To Game" })[0]);
    const started = second.onStart.mock.calls[0][0];
    expect(started.homeSquad.kit).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });
    expect(started.awaySquad.kit).toBeUndefined();
    second.unmount();

    // 4. The match is saved (autosave/manual save write the squads as-is).
    expect(saveProTaggerMatchFullResult(matchRecord(started)).ok).toBe(true);

    // 5. Close → Reload: read back from storage through the real resume path.
    const reloaded = savedMatchToSession(readProTaggerMatches()[0]);
    expect(reloaded.homeSquad.kit).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });

    // 6. Live Player Picker for the home team draws the same kit on every tile and the header.
    const picker = render(
      <ProTaggerPlayerPicker
        teamLabel="Ballylanders"
        squad={readProTaggerMatches()[0].homeSquadLiveState}
        squadId={reloaded.homeSquad.id}
        teamColour={reloaded.homeSquad.primaryColour}
        secondaryColour={reloaded.homeSquad.secondaryColour}
        kit={reloaded.homeSquad.kit}
        onSelect={() => {}}
      />,
    );
    const pickerJerseys = [...picker.container.querySelectorAll("svg[data-jersey-pattern]")];
    expect(pickerJerseys.length).toBeGreaterThanOrEqual(16); // header + 15 formation tiles
    for (const svg of pickerJerseys) {
      expect(svg.getAttribute("data-jersey-pattern")).toBe("chestV");
      expect(svg.getAttribute("data-jersey-sleeves")).toBe("primary");
    }
    picker.unmount();

    // 7. Returning to Squads with the reloaded session keeps the kit.
    const third = renderSquads(reloaded);
    expect(lineupKit(third.container)).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });
  });
});

describe("Backward compatibility — records from before Jersey Designer V2", () => {
  const LEGACY_TEAM = {
    id: "legacy-1",
    createdAt: 1,
    updatedAt: 1,
    teamName: "Old Club",
    primaryColour: "#7f1d1d",
    secondaryColour: "#ffffff",
    players: [{ id: "x", number: 1, name: "Keeper" }],
  };

  it("a legacy Saved Team loads with the default kit and is not rewritten", () => {
    const raw = JSON.stringify([LEGACY_TEAM]);
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, raw);
    const { container, onStart } = renderSquads(session());
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(lineupKit(container)).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
    fireEvent.click(screen.getAllByRole("button", { name: "Go To Game" })[0]);
    expect(onStart.mock.calls[0][0].homeSquad.kit).toBeUndefined();
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe(raw);
  });

  it("exportTeamAsSquad copies no kit for a legacy team and a cleaned kit otherwise", () => {
    expect(exportTeamAsSquad(LEGACY_TEAM, "HOME").kit).toBeUndefined();
    const withKit = { ...LEGACY_TEAM, kit: { pattern: "hoop", sleeves: "bogus" } as unknown as JerseyKit };
    expect(exportTeamAsSquad(withKit, "HOME").kit).toEqual({ pattern: "hoop", sleeves: "secondary", collar: "secondary" });
  });

  it("a legacy match (squads without kit) reloads and renders the default kit", () => {
    const legacySquad: ProTaggerSquad = { id: "h", teamSide: "HOME", players: [{ id: "a", number: 1, name: "" }], primaryColour: "#16a34a", secondaryColour: "#ffffff" };
    const legacy = matchRecord(session({ homeSquad: legacySquad }));
    expect(saveProTaggerMatchFullResult(legacy).ok).toBe(true);
    const reloaded = savedMatchToSession(readProTaggerMatches()[0]);
    expect(reloaded.homeSquad.kit).toBeUndefined();
    const { container } = renderSquads(reloaded);
    expect(lineupKit(container)).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
  });

  it("a corrupt stored kit renders the default and never throws", () => {
    const bad = { ...buildDefaultSquad("HOME"), kit: "chest" as unknown as JerseyKit };
    const { container } = renderSquads(session({ homeSquad: bad }));
    expect(lineupKit(container)).toEqual({ pattern: "plain", sleeves: "secondary", collar: "secondary" });
  });
});

describe("Legacy Match Stats coexistence on the shared Saved Teams key", () => {
  it("a Match Stats write keeps an Event Stats Saved Team's kit byte-for-byte", () => {
    const team = buildNewTeam({
      teamName: "Ballylanders",
      primaryColour: "#facc15",
      secondaryColour: "#166534",
      players: [],
      kit: { pattern: "chestV", sleeves: "primary", collar: "secondary" },
    });
    expect(saveTeam(team)).toBe(true);
    const stored = window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY);
    const matchStatsSquad = { id: "ms-1", name: "Match Stats squad", players: [], updatedAt: 5 };
    const next = buildSavedSquadsStorageValue(stored, [matchStatsSquad] as never);
    expect(next).not.toBeNull();
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, next!);
    expect(loadSavedTeams()[0].kit).toEqual({ pattern: "chestV", sleeves: "primary", collar: "secondary" });
  });
});
