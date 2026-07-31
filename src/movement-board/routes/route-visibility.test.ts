import { describe, it, expect } from "vitest";
import { shouldRenderCommittedRoute, type ShouldRenderCommittedRouteInput } from "./route-visibility";

// Shorthand builder so test cases stay readable — override only what a case cares about.
const input = (overrides: Partial<ShouldRenderCommittedRouteInput>): ShouldRenderCommittedRouteInput => ({
  mode: "hidden",
  tokenId: "p1",
  selectedTokenId: null,
  activeTokenId: null,
  isPlaybackLocked: false,
  ...overrides,
});

describe("shouldRenderCommittedRoute", () => {
  describe("hidden", () => {
    it("hides every committed route, selected or not", () => {
      expect(shouldRenderCommittedRoute(input({ mode: "hidden", tokenId: "p1" }))).toBe(false);
      expect(
        shouldRenderCommittedRoute(input({ mode: "hidden", tokenId: "p1", selectedTokenId: "p1" })),
      ).toBe(false);
    });
  });

  describe("active", () => {
    it("shows only the active token's route", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "active", tokenId: "p1", activeTokenId: "p1" })),
      ).toBe(true);
    });

    it("hides every other player's route", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "active", tokenId: "p2", activeTokenId: "p1" })),
      ).toBe(false);
    });

    it("hides everything when there is no active movement", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "active", tokenId: "p1", activeTokenId: null })),
      ).toBe(false);
    });
  });

  describe("selected", () => {
    it("shows only the selected player's route", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "selected", tokenId: "p1", selectedTokenId: "p1" })),
      ).toBe(true);
    });

    it("hides every other player's route", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "selected", tokenId: "p2", selectedTokenId: "p1" })),
      ).toBe(false);
    });

    it("hides everything when no player is selected", () => {
      expect(
        shouldRenderCommittedRoute(input({ mode: "selected", tokenId: "p1", selectedTokenId: null })),
      ).toBe(false);
    });
  });

  describe("all", () => {
    it("shows every committed route regardless of selection or activity", () => {
      expect(shouldRenderCommittedRoute(input({ mode: "all", tokenId: "p1" }))).toBe(true);
      expect(shouldRenderCommittedRoute(input({ mode: "all", tokenId: "p2" }))).toBe(true);
    });
  });

  describe("playback lock", () => {
    it("hides routes during playback regardless of mode", () => {
      for (const mode of ["hidden", "active", "selected", "all"] as const) {
        expect(
          shouldRenderCommittedRoute(
            input({ mode, tokenId: "p1", selectedTokenId: "p1", activeTokenId: "p1", isPlaybackLocked: true }),
          ),
        ).toBe(false);
      }
    });

    it("restores the mode's answer once playback is no longer locked", () => {
      expect(
        shouldRenderCommittedRoute(
          input({ mode: "selected", tokenId: "p1", selectedTokenId: "p1", isPlaybackLocked: false }),
        ),
      ).toBe(true);
    });
  });
});
