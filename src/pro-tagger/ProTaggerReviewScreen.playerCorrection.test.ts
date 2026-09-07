// P0-2 regression coverage: Review edits (saveProEdit) used to update
// playerName/playerNumber but leave the pre-edit playerId untouched, which
// could desync discipline lockout, Player Influence, and corrected-event
// display from the actually-corrected identity.
//
// ProTaggerReviewScreen.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite exercises the exact pure resolver saveProEdit calls
// (resolveRosterPlayerId), plus the real discipline engine
// (buildDisciplineStatusMap) fed a corrected event to prove the downstream
// consumer actually follows the corrected id end-to-end.
import { describe, expect, it } from "vitest";
import { resolveRosterPlayerId } from "./ProTaggerReviewScreen";
import { buildDisciplineStatusMap } from "./pro-tagger-discipline";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import type { LoggedMatchEvent } from "../core/stats/saved-match";

function player(overrides: Partial<ProTaggerSquadPlayer> & { id: string; number: number }): ProTaggerSquadPlayer {
  return { name: `Player ${overrides.number}`, ...overrides };
}

const homeSquadLiveState: ProTaggerSquadPlayer[] = [
  player({ id: "home-4", number: 4, name: "Player A" }),
  player({ id: "home-9", number: 9, name: "Player B" }),
];
const awaySquadLiveState: ProTaggerSquadPlayer[] = [
  player({ id: "away-4", number: 4, name: "Opp A" }), // same number as home-4 — must not cross-match
  player({ id: "away-11", number: 11, name: "Opp B" }),
];

const matchRoster: Pick<ProTaggerSavedMatch, "homeSquadLiveState" | "awaySquadLiveState"> = {
  homeSquadLiveState,
  awaySquadLiveState,
};

describe("resolveRosterPlayerId (P0-2)", () => {
  it("Player A event corrected to Player B (same team) → playerId becomes Player B's roster id", () => {
    const resolved = resolveRosterPlayerId(matchRoster, "FOR", 9);
    expect(resolved).toBe("home-9");
  });

  it("player number changed to a different valid roster entry on the same team resolves to that entry", () => {
    expect(resolveRosterPlayerId(matchRoster, "FOR", 4)).toBe("home-4");
    expect(resolveRosterPlayerId(matchRoster, "OPP", 11)).toBe("away-11");
  });

  it("corrected event with no valid roster identity (unmatched number) clears the id rather than guessing", () => {
    expect(resolveRosterPlayerId(matchRoster, "FOR", 99)).toBeUndefined();
  });

  it("a blank/invalid edited number (undefined) resolves to no id — never a stale one", () => {
    expect(resolveRosterPlayerId(matchRoster, "FOR", undefined)).toBeUndefined();
  });

  it("does not cross-match a number that exists only on the opposing team's roster", () => {
    // #11 exists on AWAY, not on HOME — a FOR-side correction to #11 must not
    // silently resolve to the AWAY player sharing that number.
    expect(resolveRosterPlayerId(matchRoster, "FOR", 11)).toBeUndefined();
  });

  it("duplicate jersey numbers on opposing teams resolve to the correct team's player, never the other team's", () => {
    expect(resolveRosterPlayerId(matchRoster, "FOR", 4)).toBe("home-4");
    expect(resolveRosterPlayerId(matchRoster, "OPP", 4)).toBe("away-4");
  });
});

describe("Discipline follows the corrected playerId (P0-2 integration)", () => {
  function buildEvent(overrides: Partial<LoggedMatchEvent> = {}): LoggedMatchEvent {
    const kind = overrides.kind ?? "RED_CARD";
    return {
      id: "evt-1",
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
      matchClockSeconds: 100,
      createdAt: 0,
      ...overrides,
    };
  }

  it("a red card mis-tagged to the wrong player, then corrected in Review, locks out the corrected player — not the original", () => {
    // Mis-tagged live: red card recorded against home-4.
    const misTagged = buildEvent({ playerId: "home-4", playerNumber: 4, playerName: "Player A" });
    const beforeCorrection = buildDisciplineStatusMap([misTagged], "1H", 200);
    expect(beforeCorrection.get("home-4")).toBe("RED");
    expect(beforeCorrection.get("home-9")).toBeUndefined();

    // Review correction: coach re-tags the event to #9 (Player B). saveProEdit's
    // exact resolution step — resolveRosterPlayerId — is what produces the
    // corrected playerId written back onto the event.
    const correctedNumber = 9;
    const correctedPlayerId = resolveRosterPlayerId(matchRoster, misTagged.teamSide, correctedNumber);
    const corrected: LoggedMatchEvent = {
      ...misTagged,
      playerNumber: correctedNumber,
      playerName: "Player B",
      playerId: correctedPlayerId,
    };

    const afterCorrection = buildDisciplineStatusMap([corrected], "1H", 200);
    expect(afterCorrection.get("home-9")).toBe("RED");
    expect(afterCorrection.get("home-4")).toBeUndefined(); // no longer locked out
  });

  it("unrelated edits (event kind only, player fields unchanged) resolve to the same playerId as before", () => {
    const original = buildEvent({ kind: "YELLOW_CARD", playerId: "home-9", playerNumber: 9, playerName: "Player B" });
    // saveProEdit always re-resolves by number even when the coach only
    // changed the event kind — the number field is prefilled unchanged by
    // openProEdit, so re-resolution is idempotent here.
    const reResolved = resolveRosterPlayerId(matchRoster, original.teamSide, original.playerNumber);
    expect(reResolved).toBe("home-9");
  });
});
