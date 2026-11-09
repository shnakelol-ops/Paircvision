// @vitest-environment jsdom
// Save Team must say "library full" only when the 50-team limit is reached,
// and give an accurate save-failure message when Saved Teams storage is
// unreadable or the browser refuses the write.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ProTaggerSquadScreen } from "./ProTaggerSquadScreen";
import { buildDefaultSquad, type ProTaggerSession } from "./pro-tagger-session";
import { buildNewTeam, saveTeam } from "./pro-tagger-team-storage";
import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";

const FULL = /Library is full \(50 \/ 50\)/;
const UNAVAILABLE = /Couldn't save this team on this device/;

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

function trySave() {
  render(<ProTaggerSquadScreen session={session()} onBack={() => {}} onStart={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "↑ Save Team" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ProTaggerSquadScreen Save Team failure messages", () => {
  it("unreadable storage shows the save-failure message, not 'Library is full', and is not overwritten", () => {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, "{not json");
    trySave();
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText(FULL)).toBeNull();
    expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe("{not json");
  });

  it("a refused browser write shows the save-failure message", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    trySave();
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it("a genuinely full library still shows 'Library is full'", () => {
    for (let i = 0; i < 50; i++) {
      saveTeam(buildNewTeam({ teamName: `Team ${i}`, primaryColour: "#000000", secondaryColour: "#ffffff", players: [] }));
    }
    trySave();
    expect(screen.getByText(FULL)).toBeTruthy();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });
});
