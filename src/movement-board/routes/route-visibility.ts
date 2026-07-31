/**
 * Route-visibility decision logic for Tactical Play.
 *
 * Presentation-only: this never reads or mutates movement data. It only
 * decides which already-stored committed routes should be handed to the
 * renderer for a given frame. Movement data, playback, and selection are
 * untouched regardless of the answer.
 */

export type RouteVisibilityMode = "hidden" | "active" | "selected" | "all";

export type ShouldRenderCommittedRouteInput = {
  mode: RouteVisibilityMode;
  tokenId: string;
  selectedTokenId: string | null;
  activeTokenId: string | null;
  isPlaybackLocked: boolean;
};

/**
 * Decides whether a single player's committed route should be rendered.
 *
 * Playback always wins: while playing or paused, no committed route is ever
 * rendered, regardless of the coach's chosen authoring mode. This keeps the
 * pitch clean during a walkthrough and lets the coach's mode choice simply
 * resume once playback stops, without any separate "restore" step.
 */
export function shouldRenderCommittedRoute(input: ShouldRenderCommittedRouteInput): boolean {
  if (input.isPlaybackLocked) return false;

  switch (input.mode) {
    case "hidden":
      return false;
    case "active":
      return input.activeTokenId != null && input.tokenId === input.activeTokenId;
    case "selected":
      return input.selectedTokenId != null && input.tokenId === input.selectedTokenId;
    case "all":
      return true;
    default:
      return true;
  }
}

export const ROUTE_VISIBILITY_MODE_OPTIONS: ReadonlyArray<{ id: RouteVisibilityMode; label: string }> = [
  { id: "hidden", label: "Hide All" },
  { id: "active", label: "Active Movement" },
  { id: "selected", label: "Selected Player" },
  { id: "all", label: "Show All" },
];
