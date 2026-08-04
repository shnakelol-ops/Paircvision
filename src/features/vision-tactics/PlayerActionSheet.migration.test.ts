import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import PlayerActionSheet, { CONCEPT_OPTIONS } from "./PlayerActionSheet";
import { saveScenario, listScenarios } from "./tacticalPlayStorage";
import type {
  BallState,
  MovementBoardRoute,
  MovementConcept,
  RouteMetadata,
  TacticalPassEvent,
  TacticalShotEvent,
} from "../../movement-board/shell/types";

// The active-chip background used by the card (CHIP_ACTIVE). Presence of this
// colour next to a control proves that control renders in its selected state.
const ACTIVE_BG = "rgba(18, 56, 34, 0.82)";

type CardOverrides = {
  hasRoute?: boolean;
  routeMeta?: RouteMetadata | null;
  passEventsFromPlayer?: TacticalPassEvent[];
  shotEventsFromPlayer?: TacticalShotEvent[];
  initialExpanded?: "run-timing" | "pass" | "shot" | "ball" | null;
};

function renderCard(overrides: CardOverrides = {}): string {
  const noop = () => {};
  const props = {
    playerId: "p1",
    playerNumber: 8,
    hasBall: false,
    hasRoute: overrides.hasRoute ?? true,
    routeMeta: overrides.routeMeta ?? null,
    routes: [
      { playerId: "p1", points: [] },
      { playerId: "p2", points: [] },
    ] as MovementBoardRoute[],
    passEventsFromPlayer: overrides.passEventsFromPlayer ?? [],
    shotEventsFromPlayer: overrides.shotEventsFromPlayer ?? [],
    tokenNumberById: { p1: 8, p2: 9 },
    awayTokenIds: new Set<string>(),
    onClose: noop,
    onGiveBall: noop,
    onDrawRun: noop,
    onSetRunDelay: noop,
    onSetRunTrigger: noop,
    onSetRunConcept: noop,
    onAddPass: noop,
    onRemovePass: noop,
    onAddShot: noop,
    onRemoveShot: noop,
    sport: "football" as const,
    onEditRun: noop,
    onResetRun: noop,
    onBallChoice: noop,
    onFreeBall: noop,
    initialExpanded: overrides.initialExpanded ?? null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(createElement(PlayerActionSheet, props as any));
}

describe("PlayerActionSheet — migrated authoring parity", () => {
  it("exposes every movement concept the retired global panel had, with stable ids", () => {
    const ids = CONCEPT_OPTIONS.map((o) => o.id);
    // The full MovementConcept union, unchanged.
    const expected: MovementConcept[] = ["support-run", "overlap", "shadow-run", "rotation", "custom"];
    expect(ids).toEqual(expected);
  });

  it("renders all five concept chips inside the run section (only with a run)", () => {
    const html = renderCard({ hasRoute: true, initialExpanded: "run-timing" });
    expect(html).toContain("Concept");
    for (const label of ["Support", "Overlap", "Decoy", "Rotation", "Custom"]) {
      expect(html).toContain(label);
    }
  });

  it("marks the current concept active when editing an existing run", () => {
    const html = renderCard({
      hasRoute: true,
      routeMeta: { concept: "overlap" },
      initialExpanded: "run-timing",
    });
    // The active-state background must be present, proving the saved concept
    // is reflected on reopen.
    expect(html).toContain(ACTIVE_BG);
  });

  it("reflects an existing run's after-Pn trigger on reopen", () => {
    const html = renderCard({
      hasRoute: true,
      routeMeta: { triggeredBy: "p2" },
      initialExpanded: "run-timing",
    });
    expect(html).toContain("After");
    expect(html).toContain(ACTIVE_BG);
  });

  it("renders a saved triggered pass with its 'after Pn' label on reopen", () => {
    const html = renderCard({
      passEventsFromPlayer: [
        { id: "pass-1", fromPlayerId: "p1", toPlayerId: "p2", triggeredBy: "p2" },
      ],
      initialExpanded: "pass",
    });
    expect(html).toContain("after P9");
  });

  it("renders a saved delayed pass with its timing label on reopen", () => {
    const html = renderCard({
      passEventsFromPlayer: [
        { id: "pass-2", fromPlayerId: "p1", toPlayerId: "p2", delayMs: 2000 },
      ],
      initialExpanded: "pass",
    });
    expect(html).toContain("P9 +2s");
  });

  it("lists this player's shots with a removal control on the card", () => {
    const html = renderCard({
      shotEventsFromPlayer: [{ id: "shot-1", shooterId: "p1", delayMs: 3000 }],
      initialExpanded: "shot",
    });
    expect(html).toContain("Shot");
    expect(html).toContain("Remove shot");
  });
});

// Minimal localStorage polyfill for the node test environment.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string): void { this.store.set(k, String(v)); }
  removeItem(k: string): void { this.store.delete(k); }
  clear(): void { this.store.clear(); }
}

describe("Saved-play schema compatibility", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  it("loads a legacy play containing concepts and a triggered pass without mutation", () => {
    const routes: MovementBoardRoute[] = [
      { playerId: "p1", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], concept: "overlap", delayMs: 2000 },
      { playerId: "p2", points: [{ x: 0.2, y: 0.2 }], concept: "shadow-run", triggeredBy: "p1" },
    ];
    const passEvents: TacticalPassEvent[] = [
      { id: "pass-1", fromPlayerId: "p1", toPlayerId: "p2", delayMs: 1000 },
      { id: "pass-2", fromPlayerId: "p2", toPlayerId: "p1", triggeredBy: "p1" },
    ];
    const shotEvents: TacticalShotEvent[] = [{ id: "shot-1", shooterId: "p1", delayMs: 3000 }];
    const ballState: BallState = { carrierId: "p1" };

    const saved = saveScenario("Legacy", [], routes, ballState, passEvents, shotEvents);
    const loaded = listScenarios().find((s) => s.id === saved.id);

    expect(loaded).toBeDefined();
    // Routes preserve concept + timing + trigger exactly.
    expect(loaded!.routes).toEqual(routes);
    // Passes preserve delay and triggeredBy exactly.
    expect(loaded!.passEvents).toEqual(passEvents);
    expect(loaded!.shotEvents).toEqual(shotEvents);
    // Concept ids are not renamed on the round-trip.
    expect(loaded!.routes.map((r) => r.concept)).toEqual(["overlap", "shadow-run"]);
    expect(loaded!.passEvents[1].triggeredBy).toBe("p1");
  });
});
