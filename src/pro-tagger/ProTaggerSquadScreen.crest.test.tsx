// @vitest-environment jsdom
// Club Crest V1, Checkpoint 1 — Saved Teams integration.
//
// The non-negotiable: crest operations never write to Saved Teams storage
// ("pitchflow_saved_squads_v1"), which is shared with legacy Match Stats.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// The Pixi pitch canvas cannot initialise under jsdom and is irrelevant here.
vi.mock("../core/pitch/create-pixi-pitch-surface", () => ({
  createPixiPitchSurface: () => new Promise(() => {}),
  exportPixiPitchSurfacePng: async () => null,
}));

import StatsModeSurface, { buildSavedSquadsStorageValue } from "../StatsModeSurface";
import { ProTaggerSquadScreen, isClubOnlyTeam } from "./ProTaggerSquadScreen";
import { buildDefaultSquad, type ProTaggerSession } from "./pro-tagger-session";
import { buildNewTeam, loadSavedTeams, type SavedTeam } from "./pro-tagger-team-storage";
import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";
import { checkCrestFile, crestVisibleBounds, type CrestCodec, type PixelImage } from "./crest/crest-image";
import { memoryCrestBackend, plainBackgroundCrest, pngFile, quotaError, transparentCrest, type MemoryCrestBackend } from "./crest/crestTestFixtures";

function session(): ProTaggerSession {
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
  };
}

function codec(images: Record<string, PixelImage>): CrestCodec {
  return {
    check: (f) => checkCrestFile(f),
    decode: async (f) => {
      const img = images[f.name];
      if (!img) throw new Error("decode failed");
      return img;
    },
    paint: () => {},
    encode: async (img, alpha) => {
      const b = crestVisibleBounds(img, alpha)!;
      return { blob: new Blob([`png:${b.width}x${b.height}`], { type: "image/png" }), width: b.width, height: b.height };
    },
  };
}

const NAMED: SavedTeam = {
  ...buildNewTeam({
    teamName: "Ballylanders",
    primaryColour: "#16a34a",
    secondaryColour: "#facc15",
    players: [{ id: "p1", number: 1, name: "Declan", position: "GK" }],
  }),
  id: "team-ballylanders",
};
const CLUB_ONLY: SavedTeam = {
  ...buildNewTeam({
    teamName: "Galbally",
    primaryColour: "#dc2626",
    secondaryColour: "#ffffff",
    players: buildDefaultSquad("AWAY").players.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position })),
  }),
  id: "team-galbally",
};
const MATCH_STATS_SQUAD = { id: "ms-1", name: "Senior Panel", players: [{ id: "m1", number: 1, name: "Seán" }], updatedAt: 5 };

let backend: MemoryCrestBackend;
let writes: string[];

function seedStorage(): string {
  const raw = JSON.stringify([NAMED, CLUB_ONLY, MATCH_STATS_SQUAD]);
  window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, raw);
  return raw;
}

function renderScreen(supported = true) {
  render(
    <ProTaggerSquadScreen
      session={session()}
      onBack={() => {}}
      onStart={() => {}}
      crestBackend={backend}
      crestCodec={codec({ "crest.png": plainBackgroundCrest(), "new.png": transparentCrest() })}
      crestStorageSupported={supported}
    />,
  );
}

function trackWrites() {
  writes = [];
  for (const m of ["setItem", "removeItem", "clear"] as const) {
    const original = Storage.prototype[m] as (...a: unknown[]) => unknown;
    vi.spyOn(Storage.prototype, m).mockImplementation(function (this: Storage, ...args: unknown[]) {
      writes.push(`${m}:${String(args[0])}`);
      return original.apply(this, args);
    });
  }
}

function row(name: string): HTMLElement {
  return screen.getByText(name, { selector: "span" }).closest("div[style]")!.parentElement as HTMLElement;
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Choose crest image"), { target: { files: [file] } });
}

beforeEach(() => {
  window.localStorage.clear();
  backend = memoryCrestBackend();
  // jsdom lacks these browser APIs; StatsModeSurface reads them on mount.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("Saved Teams storage is byte-for-byte unchanged by every crest operation", () => {
  it("upload, failed replace, replace, failed remove and remove never write Saved Teams", async () => {
    const before = seedStorage();
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    trackWrites();
    const unchanged = () => {
      expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe(before);
      expect(writes).toEqual([]);
    };

    // Upload with background removal accepted.
    fireEvent.click(screen.getByRole("button", { name: "Crest for Galbally" }));
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByLabelText("Remove plain background"));
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect(backend.data.get("team-galbally")).toMatchObject({ teamId: "team-galbally", backgroundRemoved: true });
    unchanged();

    // Failed replacement (quota) keeps the previous crest.
    const first = backend.data.get("team-galbally");
    backend.failPut = quotaError();
    choose(pngFile(60, 60, "new.png"));
    fireEvent.click(await screen.findByRole("button", { name: "Save crest" }));
    await screen.findByText(/previous crest has been kept/);
    expect(backend.data.get("team-galbally")).toBe(first);
    unchanged();

    // Successful replacement.
    backend.failPut = null;
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect(backend.data.get("team-galbally")).not.toBe(first);
    unchanged();

    // Failed then successful removal.
    backend.failDelete = new Error("tx failed");
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    await screen.findByText(/It is still saved/);
    expect(backend.data.has("team-galbally")).toBe(true);
    backend.failDelete = null;
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    await screen.findByText("Crest removed.");
    expect(backend.data.has("team-galbally")).toBe(false);
    unchanged();

    // The library still lists every team, unchanged.
    expect(loadSavedTeams().map((t) => t.id)).toEqual(["team-ballylanders", "team-galbally"]);
  });

  it("with crest storage unavailable, Saved Teams work exactly as before", () => {
    seedStorage();
    renderScreen(false);
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    expect(screen.queryByRole("button", { name: /^Crest for/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Load" })).toHaveLength(2);
  });
});

describe("deleting a Saved Team retains its crest", () => {
  it("the team is deleted from Saved Teams, the crest stays in the crest store", async () => {
    seedStorage();
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Crest for Galbally" }));
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(within(row("Galbally")).getByRole("button", { name: "✕" }));
    expect(loadSavedTeams().map((t) => t.id)).toEqual(["team-ballylanders"]);
    expect(backend.data.has("team-galbally")).toBe(true);
    // Match Stats' squad is still carried through untouched.
    expect(JSON.parse(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)!)).toContainEqual(MATCH_STATS_SQUAD);
  });
});

describe("Club only Saved Teams", () => {
  it("shows 'Club only' for a team of unnamed players and the player count otherwise", () => {
    seedStorage();
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "↓ Load Team" }));
    expect(within(row("Galbally")).getByText("Club only")).toBeTruthy();
    expect(within(row("Ballylanders")).getByText("1 players")).toBeTruthy();
    expect(isClubOnlyTeam({ players: [] })).toBe(true);
    expect(isClubOnlyTeam({ players: [{ id: "a", number: 1, name: "  " }] })).toBe(true);
    expect(isClubOnlyTeam({ players: [{ id: "a", number: 1, name: "Seán" }] })).toBe(false);
  });

  it("Save Team → Add crest saves an opposition club with no squad admin and files the crest under its new id", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Galbally" })); // away tab
    fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = loadSavedTeams();
    expect(saved).toHaveLength(1);
    expect(saved[0].teamName).toBe("Galbally");
    expect(isClubOnlyTeam(saved[0])).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add crest" }));
    expect(screen.getByRole("dialog", { name: "Club crest for Galbally" })).toBeTruthy();
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect([...backend.data.keys()]).toEqual([saved[0].id]);
  });

  it("without crest storage, Save keeps its previous behaviour (no Add crest)", () => {
    renderScreen(false);
    fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("button", { name: "Add crest" })).toBeNull();
    expect(screen.getByRole("button", { name: "Saved!" })).toBeTruthy();
  });

  it("a club-only Saved Team is compatible with Match Stats storage", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Galbally" }));
    fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    cleanup();
    const raw = window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)!;
    const clubOnly = JSON.parse(raw)[0];

    // Match Stats never treats it as one of its own squads and carries it through unchanged.
    const value = buildSavedSquadsStorageValue(raw, [MATCH_STATS_SQUAD]);
    expect(JSON.parse(value!)).toEqual([MATCH_STATS_SQUAD, clubOnly]);

    // Mounting Match Stats (which writes this key back on mount) keeps it.
    render(<StatsModeSurface />);
    const after = JSON.parse(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)!);
    expect(after).toContainEqual(clubOnly);
    expect(loadSavedTeams()).toEqual([clubOnly]);
  });
});
