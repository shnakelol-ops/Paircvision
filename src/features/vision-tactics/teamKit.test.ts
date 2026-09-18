import { describe, expect, it } from "vitest";

import {
  DEFAULT_OUR_TEAM_KIT,
  DEFAULT_GOALKEEPER_KIT,
  DEFAULT_BIB_KIT,
  applyTeamKitsToTokens,
  deriveLegacyTeamKit,
  isGoalkeeperToken,
  isOppositionToken,
  resolveTokenKit,
  type TeamKit,
  type TeamKitSet,
} from "./teamKit";
import type { MovementBoardToken } from "../../movement-board/shell/types";

/**
 * Coverage for Game Timing's team-kit model (KIT belongs to TEAM,
 * GOALKEEPER may override, IDENTITY/MOVEMENT belong to PLAYER). Every
 * function here is pure and independent of the live Pixi shell, so this
 * directly proves the resolution/application logic without needing a
 * canvas — the same practical boundary PlayerKitEditor.test.tsx and every
 * other kit-editor test file in this repo already documents.
 */
function makeToken(overrides: Partial<MovementBoardToken> = {}): MovementBoardToken {
  return {
    id: "p1",
    number: 9,
    color: "red",
    position: { x: 50, y: 50 },
    ...overrides,
  };
}

const RED_PLAIN: TeamKit = { baseColor: "red", pattern: "plain", patternColor: "white" };
const YELLOW_HOOPS: TeamKit = { baseColor: "yellow", pattern: "hoops", patternColor: "black" };
const BLUE_SLASH: TeamKit = { baseColor: "blue", pattern: "slash", patternColor: "white" };

describe("isOppositionToken / isGoalkeeperToken", () => {
  it("a plain home outfield token is neither opposition nor (usually) goalkeeper", () => {
    const token = makeToken({ team: "home", playerRole: "team", number: 9 });
    expect(isOppositionToken(token)).toBe(false);
    expect(isGoalkeeperToken(token)).toBe(false);
  });

  it("team === 'away' is opposition", () => {
    expect(isOppositionToken(makeToken({ team: "away" }))).toBe(true);
  });

  it("playerRole === 'bib' is opposition", () => {
    expect(isOppositionToken(makeToken({ playerRole: "bib" }))).toBe(true);
  });

  it("jersey #1 on Our Team is the goalkeeper", () => {
    expect(isGoalkeeperToken(makeToken({ number: 1, team: "home" }))).toBe(true);
  });

  it("jersey #1 on the opposition/bib side is NOT treated as 'the' goalkeeper for kit purposes", () => {
    expect(isGoalkeeperToken(makeToken({ number: 1, playerRole: "bib" }))).toBe(false);
    expect(isGoalkeeperToken(makeToken({ number: 1, team: "away" }))).toBe(false);
  });
});

describe("resolveTokenKit", () => {
  const kits: TeamKitSet = { ourTeamKit: RED_PLAIN, goalkeeperKit: YELLOW_HOOPS, bibKit: BLUE_SLASH };

  it("outfield Our Team player gets ourTeamKit", () => {
    expect(resolveTokenKit(makeToken({ number: 9, team: "home" }), kits)).toBe(RED_PLAIN);
  });

  it("goalkeeper gets goalkeeperKit when one is set", () => {
    expect(resolveTokenKit(makeToken({ number: 1, team: "home" }), kits)).toBe(YELLOW_HOOPS);
  });

  it("goalkeeper falls back to ourTeamKit when no override is set", () => {
    const noOverride: TeamKitSet = { ourTeamKit: RED_PLAIN, bibKit: BLUE_SLASH };
    expect(resolveTokenKit(makeToken({ number: 1, team: "home" }), noOverride)).toBe(RED_PLAIN);
  });

  it("opposition/bib gets bibKit regardless of number, including #1", () => {
    expect(resolveTokenKit(makeToken({ number: 1, playerRole: "bib" }), kits)).toBe(BLUE_SLASH);
    expect(resolveTokenKit(makeToken({ number: 7, team: "away" }), kits)).toBe(BLUE_SLASH);
  });
});

describe("applyTeamKitsToTokens — the core product-requirement proofs", () => {
  const kits: TeamKitSet = { ourTeamKit: RED_PLAIN, goalkeeperKit: YELLOW_HOOPS, bibKit: BLUE_SLASH };

  it("OUR TEAM kit change -> every Our Team outfield token changes", () => {
    const tokens = [
      makeToken({ id: "p2", number: 2, team: "home" }),
      makeToken({ id: "p3", number: 3, team: "home" }),
      makeToken({ id: "p4", number: 4, team: "home" }),
    ];
    const next = applyTeamKitsToTokens(tokens, kits);
    for (const token of next) {
      expect(token.color).toBe("red");
      expect(token.kitPattern).toBe("plain");
      expect(token.kitPatternColor).toBe("white");
    }
  });

  it("GK override -> GK only changes, teammates are untouched", () => {
    const gk = makeToken({ id: "gk", number: 1, team: "home" });
    const p9 = makeToken({ id: "p9", number: 9, team: "home" });
    const next = applyTeamKitsToTokens([gk, p9], kits);
    const nextGk = next.find((t) => t.id === "gk")!;
    const nextP9 = next.find((t) => t.id === "p9")!;
    expect(nextGk.color).toBe("yellow");
    expect(nextGk.kitPattern).toBe("hoops");
    expect(nextP9.color).toBe("red");
    expect(nextP9.kitPattern).toBe("plain");
  });

  it("opposition/bib kit -> only that side changes, Our Team and GK are untouched", () => {
    const gk = makeToken({ id: "gk", number: 1, team: "home" });
    const p9 = makeToken({ id: "p9", number: 9, team: "home" });
    const opp = makeToken({ id: "opp1", number: 5, playerRole: "bib" });
    const next = applyTeamKitsToTokens([gk, p9, opp], kits);
    expect(next.find((t) => t.id === "opp1")!.color).toBe("blue");
    expect(next.find((t) => t.id === "gk")!.color).toBe("yellow");
    expect(next.find((t) => t.id === "p9")!.color).toBe("red");
  });

  it("identity fields (id, number, label) are never touched by a kit change", () => {
    const token = makeToken({ id: "p9", number: 9, label: "Dozer", team: "home" });
    const next = applyTeamKitsToTokens([token], kits)[0]!;
    expect(next.id).toBe("p9");
    expect(next.number).toBe(9);
    expect(next.label).toBe("Dozer");
  });

  it("movement-adjacent fields (position, draggable, isGhost) pass through untouched", () => {
    const token = makeToken({ position: { x: 12, y: 34 }, draggable: false, isGhost: true, team: "home" });
    const next = applyTeamKitsToTokens([token], kits)[0]!;
    expect(next.position).toEqual({ x: 12, y: 34 });
    expect(next.draggable).toBe(false);
    expect(next.isGhost).toBe(true);
  });

  it("is pure — never mutates the input array or its tokens", () => {
    const token = makeToken({ team: "home" });
    const tokens = [token];
    const before = JSON.stringify(tokens);
    applyTeamKitsToTokens(tokens, kits);
    expect(JSON.stringify(tokens)).toBe(before);
    expect(tokens[0]).toBe(token);
  });
});

describe("deriveLegacyTeamKit — legacy scenario compatibility", () => {
  it("seeds base colour from the first matching token, plain pattern, no migration needed", () => {
    const tokens = [
      makeToken({ id: "p2", number: 2, team: "home", color: "purple" }),
      makeToken({ id: "p3", number: 3, team: "home", color: "purple" }),
    ];
    const kit = deriveLegacyTeamKit(tokens, (t) => !isOppositionToken(t), DEFAULT_OUR_TEAM_KIT);
    expect(kit).toEqual({ baseColor: "purple", pattern: "plain", patternColor: "white" });
  });

  it("falls back to the given default when no matching token exists at all", () => {
    const kit = deriveLegacyTeamKit([], (t) => !isOppositionToken(t), DEFAULT_OUR_TEAM_KIT);
    expect(kit).toEqual(DEFAULT_OUR_TEAM_KIT);
  });

  it("a legacy scenario with zero bib/opposition players falls back to the bib default, not a crash", () => {
    const tokens = [makeToken({ team: "home" })];
    const kit = deriveLegacyTeamKit(tokens, isOppositionToken, DEFAULT_BIB_KIT);
    expect(kit).toEqual(DEFAULT_BIB_KIT);
  });
});

describe("Default kits", () => {
  it("Our Team and Goalkeeper defaults are visually distinct (red vs yellow), matching the pre-existing convention", () => {
    expect(DEFAULT_OUR_TEAM_KIT.baseColor).not.toBe(DEFAULT_GOALKEEPER_KIT.baseColor);
  });
});
