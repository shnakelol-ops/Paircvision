// P0-2 regression coverage: Review edits (saveProEdit) used to update
// playerName/playerNumber but leave the pre-edit playerId untouched, which
// could desync discipline lockout, Player Influence, and corrected-event
// display from the actually-corrected identity.
//
// DIFF-AUDIT FIX: the roster resolveRosterPlayerId searches must not be
// chosen from the event's raw teamSide. Several capture families store
// teamSide as something other than the tagged player's own squad — a
// restart CONCEDED event stores the restart OWNER's side (see
// resolveRestartOutcome, pro-tagger-adapter.ts), and TURNOVER_LOST is
// deliberately always stored with teamSide "FOR" regardless of which team
// actually lost the ball. The event's own squadId (set by the live player
// picker from the squad it was actually showing, before any adapter-side
// ownership rewrite) is the authoritative signal instead, with raw teamSide
// used only as a legacy fallback when squadId is absent/unusable.
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
  player({ id: "home-8", number: 8, name: "Home Eight" }),
  player({ id: "home-9", number: 9, name: "Player B" }),
];
const awaySquadLiveState: ProTaggerSquadPlayer[] = [
  player({ id: "away-4", number: 4, name: "Opp A" }), // same number as home-4 — must not cross-match
  player({ id: "away-7", number: 7, name: "Away Seven" }),
  player({ id: "away-8", number: 8, name: "Away Eight" }), // duplicate number with home-8
  player({ id: "away-10", number: 10, name: "Away Ten" }),
  player({ id: "away-11", number: 11, name: "Opp B" }),
];

const matchRoster: Pick<ProTaggerSavedMatch, "homeSquad" | "awaySquad" | "homeSquadLiveState" | "awaySquadLiveState"> = {
  homeSquad: { id: "home-squad-id", teamSide: "HOME", players: [] },
  awaySquad: { id: "away-squad-id", teamSide: "AWAY", players: [] },
  homeSquadLiveState,
  awaySquadLiveState,
};

function ev(overrides: Partial<LoggedMatchEvent> & Pick<LoggedMatchEvent, "teamSide">): Pick<LoggedMatchEvent, "teamSide" | "squadId"> {
  return { squadId: undefined, ...overrides };
}

describe("resolveRosterPlayerId — squadId-first roster resolution (P0-2 diff-audit fix)", () => {
  it("Player A event corrected to Player B (same team, squadId present) → playerId becomes Player B's roster id", () => {
    const resolved = resolveRosterPlayerId(matchRoster, ev({ teamSide: "FOR", squadId: "home-squad-id" }), 9);
    expect(resolved).toBe("home-9");
  });

  it("player number changed to a different valid roster entry on the same team resolves to that entry", () => {
    expect(resolveRosterPlayerId(matchRoster, ev({ teamSide: "FOR", squadId: "home-squad-id" }), 4)).toBe("home-4");
    expect(resolveRosterPlayerId(matchRoster, ev({ teamSide: "OPP", squadId: "away-squad-id" }), 11)).toBe("away-11");
  });

  it("corrected event with no valid roster identity (unmatched number) clears the id rather than guessing", () => {
    expect(resolveRosterPlayerId(matchRoster, ev({ teamSide: "FOR", squadId: "home-squad-id" }), 99)).toBeUndefined();
  });

  it("a blank/invalid edited number (undefined) resolves to no id — never a stale one", () => {
    expect(resolveRosterPlayerId(matchRoster, ev({ teamSide: "FOR", squadId: "home-squad-id" }), undefined)).toBeUndefined();
  });

  // ── Case 1: opposition-owned kickout won by FOR ──────────────────────────
  it("Case 1 — KICKOUT_CONCEDED (teamSide OPP, restartOwner OPP, squadId=home) resolves against the HOME roster, not away", () => {
    const event = ev({ teamSide: "OPP", squadId: "home-squad-id" }); // original player: home #9
    // Correction: #9 -> home #8.
    const resolved = resolveRosterPlayerId(matchRoster, event, 8);
    expect(resolved).toBe("home-8");
    expect(resolved).not.toBe("away-8");
  });

  // ── Case 2: TURNOVER_LOST from an OPP player ─────────────────────────────
  it("Case 2 — TURNOVER_LOST (teamSide FOR always, squadId=away) resolves against the AWAY roster, not home", () => {
    const event = ev({ teamSide: "FOR", squadId: "away-squad-id" }); // original player: away #7
    // Correction: #7 -> away #10.
    const resolved = resolveRosterPlayerId(matchRoster, event, 10);
    expect(resolved).toBe("away-10");
    expect(resolved).not.toBe("home-10"); // home has no #10 anyway, but assert the intent explicitly
  });

  // ── Case 3: duplicate jersey number across teams, disambiguated by squadId ──
  it("Case 3a — a conceded-restart event carrying the HOME squadId resolves home #8 despite stored teamSide OPP", () => {
    const event = ev({ teamSide: "OPP", squadId: "home-squad-id" });
    expect(resolveRosterPlayerId(matchRoster, event, 8)).toBe("home-8");
  });

  it("Case 3b — a turnover-lost event carrying the AWAY squadId resolves away #8 despite stored teamSide FOR", () => {
    const event = ev({ teamSide: "FOR", squadId: "away-squad-id" });
    expect(resolveRosterPlayerId(matchRoster, event, 8)).toBe("away-8");
  });

  // ── Case 4: legacy event with no squadId ─────────────────────────────────
  it("Case 4 — a legacy event with no squadId falls back to raw teamSide and does not crash", () => {
    const legacyForEvent = ev({ teamSide: "FOR", squadId: undefined });
    expect(() => resolveRosterPlayerId(matchRoster, legacyForEvent, 4)).not.toThrow();
    expect(resolveRosterPlayerId(matchRoster, legacyForEvent, 4)).toBe("home-4");

    const legacyOppEvent = ev({ teamSide: "OPP", squadId: undefined });
    expect(resolveRosterPlayerId(matchRoster, legacyOppEvent, 11)).toBe("away-11");
  });

  it("a squadId that matches neither saved squad (foreign/corrupt data) falls back to raw teamSide safely", () => {
    const event = ev({ teamSide: "FOR", squadId: "some-other-squad-id" });
    expect(() => resolveRosterPlayerId(matchRoster, event, 4)).not.toThrow();
    expect(resolveRosterPlayerId(matchRoster, event, 4)).toBe("home-4");
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
    const misTagged = buildEvent({ playerId: "home-4", playerNumber: 4, playerName: "Player A", squadId: "home-squad-id" });
    const beforeCorrection = buildDisciplineStatusMap([misTagged], "1H", 200);
    expect(beforeCorrection.get("home-4")).toBe("RED");
    expect(beforeCorrection.get("home-9")).toBeUndefined();

    // Review correction: coach re-tags the event to #9 (Player B). saveProEdit's
    // exact resolution step — resolveRosterPlayerId — is what produces the
    // corrected playerId written back onto the event.
    const correctedNumber = 9;
    const correctedPlayerId = resolveRosterPlayerId(matchRoster, misTagged, correctedNumber);
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

  it("discipline follows the corrected id even on an owner-reassigned kind whose raw teamSide would have named the wrong roster", () => {
    // A restart CONCEDED event: teamSide is OPP (the restart owner), but the
    // carded player is a HOME player (squadId=home). A raw-teamSide resolver
    // would have looked up the away roster and produced the wrong (or no) id.
    const misTagged = buildEvent({
      kind: "RED_CARD", teamSide: "OPP", squadId: "home-squad-id",
      playerId: "home-4", playerNumber: 4, playerName: "Player A",
    });
    const correctedPlayerId = resolveRosterPlayerId(matchRoster, misTagged, 8);
    expect(correctedPlayerId).toBe("home-8");

    const corrected: LoggedMatchEvent = { ...misTagged, playerNumber: 8, playerName: "Home Eight", playerId: correctedPlayerId };
    const status = buildDisciplineStatusMap([corrected], "1H", 200);
    expect(status.get("home-8")).toBe("RED");
    expect(status.get("away-8")).toBeUndefined(); // must not have locked out the same-numbered opponent
  });

  it("unrelated edits (event kind only, player fields unchanged) resolve to the same playerId as before", () => {
    const original = buildEvent({ kind: "YELLOW_CARD", playerId: "home-9", playerNumber: 9, playerName: "Player B", squadId: "home-squad-id" });
    // saveProEdit always re-resolves by number even when the coach only
    // changed the event kind — the number field is prefilled unchanged by
    // openProEdit, so re-resolution is idempotent here.
    const reResolved = resolveRosterPlayerId(matchRoster, original, original.playerNumber);
    expect(reResolved).toBe("home-9");
  });
});
