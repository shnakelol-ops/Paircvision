/**
 * player-display.test.ts
 *
 * Regression coverage for the shared player-identity resolution used by
 * every report surface that prints a player (Player Breakdown, Player
 * Influence, the scoring ledger's "Top influence" tiles, and any generated
 * insight text). Fixes a bug where the same real player rendered as a name
 * on one page and a bare jersey number on another, because two different
 * code paths computed the display string independently and a third
 * fragmented a player's events into a named row and a "#N" row depending
 * on whether individual events carried playerId or only playerNumber.
 */

import { describe, expect, it } from "vitest";
import {
  buildPlayerNumberAliasMap,
  resolvePlayerDisplayName,
  resolvePlayerIdentityKey,
  type PlayerIdentityEvent,
} from "./player-display";

describe("resolvePlayerDisplayName", () => {
  it("prefers a real name over the jersey number", () => {
    expect(resolvePlayerDisplayName("Shane", 14)).toBe("Shane");
  });

  it("falls back to #N when no name is present", () => {
    expect(resolvePlayerDisplayName(null, 14)).toBe("#14");
    expect(resolvePlayerDisplayName(undefined, 14)).toBe("#14");
    expect(resolvePlayerDisplayName("", 14)).toBe("#14");
    expect(resolvePlayerDisplayName("   ", 14)).toBe("#14");
  });

  it("falls back to an em dash when neither name nor number is present", () => {
    expect(resolvePlayerDisplayName(null, null)).toBe("—");
  });

  it("rejects an auto-generated '#N' placeholder stored as a name", () => {
    expect(resolvePlayerDisplayName("#14", 14)).toBe("#14");
  });

  it("rejects known demo/test names", () => {
    expect(resolvePlayerDisplayName("dave", 7)).toBe("#7");
    expect(resolvePlayerDisplayName("Dave Clifford", 7)).toBe("Dave Clifford");
  });
});

describe("player identity keying — mixed playerId / number-only tagging", () => {
  type Ev = PlayerIdentityEvent & { playerName?: string | null };

  function ev(partial: Partial<Ev> & Pick<Ev, "teamSide">): Ev {
    return { playerId: null, playerNumber: null, ...partial };
  }

  it("routes a number-only event to the same key as an id-tagged event for the same jersey", () => {
    const events: Ev[] = [
      ev({ teamSide: "FOR", playerId: "p-shane", playerNumber: 14, playerName: "Shane" }),
      ev({ teamSide: "FOR", playerNumber: 14 }), // number-only quick-tag, same player
    ];
    const aliasMap = buildPlayerNumberAliasMap(events);
    const keys = events.map((e) => resolvePlayerIdentityKey(e, aliasMap));
    expect(keys[0]).toBe("p-shane");
    expect(keys[1]).toBe("p-shane"); // merged, not "__num_FOR_14"
  });

  it("keeps distinct players on distinct teams with the same number separate", () => {
    const events: Ev[] = [
      ev({ teamSide: "FOR", playerId: "p-for-9", playerNumber: 9, playerName: "Danny" }),
      ev({ teamSide: "OPP", playerNumber: 9 }),
    ];
    const aliasMap = buildPlayerNumberAliasMap(events);
    expect(resolvePlayerIdentityKey(events[0], aliasMap)).toBe("p-for-9");
    expect(resolvePlayerIdentityKey(events[1], aliasMap)).toBe("__num_OPP_9");
  });

  it("falls back to the raw number key when no playerId is ever seen for that number", () => {
    const events: Ev[] = [ev({ teamSide: "OPP", playerNumber: 15 })];
    const aliasMap = buildPlayerNumberAliasMap(events);
    expect(resolvePlayerIdentityKey(events[0], aliasMap)).toBe("__num_OPP_15");
  });

  it("returns null when an event carries neither playerId nor playerNumber", () => {
    const aliasMap = buildPlayerNumberAliasMap([]);
    expect(resolvePlayerIdentityKey(ev({ teamSide: "FOR" }), aliasMap)).toBeNull();
  });

  it("order of the alias-establishing event vs. the number-only event doesn't matter", () => {
    const events: Ev[] = [
      ev({ teamSide: "FOR", playerNumber: 14 }), // number-only tag arrives first in the log
      ev({ teamSide: "FOR", playerId: "p-shane", playerNumber: 14, playerName: "Shane" }),
    ];
    const aliasMap = buildPlayerNumberAliasMap(events); // built from the whole event set up front
    const keys = events.map((e) => resolvePlayerIdentityKey(e, aliasMap));
    expect(keys[0]).toBe("p-shane");
    expect(keys[1]).toBe("p-shane");
  });
});
