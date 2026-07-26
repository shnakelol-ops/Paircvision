import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PlayerActionSheet from "./PlayerActionSheet";

// Static render of the Player Card. PlayerActionSheet is a leaf presentational
// component (no WebGL / canvas shell), so it renders with react-dom/server in
// the node test environment without a DOM. JSX is avoided (via createElement)
// so the file fits the suite's `.test.ts` convention.
//
// These tests guard the duplicate-removal pass:
//   - The Player Card is the single home for player-specific authoring
//     (Give Ball, Draw Run, Pass — with Shoot reachable inside Pass).
//   - "Play" is playback transport, not a card action, and must NOT appear on
//     the card after this pass.
function renderCard(overrides: Record<string, unknown> = {}): string {
  const noop = () => {};
  const props = {
    playerId: "p1",
    playerNumber: 8,
    hasBall: false,
    hasRoute: true,
    routeMeta: null,
    routes: [],
    passEventsFromPlayer: [],
    tokenNumberById: { p1: 8, p2: 9 },
    awayTokenIds: new Set<string>(),
    onClose: noop,
    onGiveBall: noop,
    onDrawRun: noop,
    onSetRunDelay: noop,
    onSetRunTrigger: noop,
    onAddPass: noop,
    onRemovePass: noop,
    onAddShot: noop,
    sport: "football" as const,
    onEditRun: noop,
    onResetRun: noop,
    onBallChoice: noop,
    onFreeBall: noop,
    onBehaviour: noop,
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(createElement(PlayerActionSheet, props as any));
}

describe("PlayerActionSheet — canonical player actions", () => {
  it("renders the player-specific authoring controls", () => {
    const html = renderCard();
    expect(html).toContain("Give Ball");
    expect(html).toContain("Draw Run");
    expect(html).toContain("Pass");
    // Run Timing is the delay + after-trigger control, present when the player
    // has a route.
    expect(html).toContain("Run Timing");
  });

  it("does not render a Play button (playback lives in the transport, not the card)", () => {
    const html = renderCard();
    expect(html).not.toMatch(/>\s*Play\s*</);
  });

  it("never surfaces Play regardless of route state", () => {
    const html = renderCard({ hasRoute: false });
    expect(html).not.toMatch(/>\s*Play\s*</);
    expect(html).toContain("Give Ball");
  });
});
