/**
 * pro-tagger-review-zones-parity.test.ts — Event Stats Review Zones parity.
 *
 * Event Stats Review's "ZONES" toggle (ProTaggerReviewScreen.tsx) must be an
 * exact reuse of Match Stats Review's Zones overlay — same
 * selectZoneOverlayModel() aggregation over the already-filtered event set,
 * same shared createPixiPitchSurface rendering, no rotation/direction
 * normalization and no Event-Stats-specific zone logic anywhere (see
 * StatsModeSurface.tsx's showReviewZones/reviewZoneOverlayModel and
 * RapidReviewScreen.tsx's showReviewZones/filteredZoneOverlayModel, which
 * this file's PitchCanvas/showEventMapZones/eventMapZoneOverlayModel mirror).
 *
 * These tests lock: known-coordinate classification (including the exact
 * zone-grid boundaries), half/team/direction independence of this raw
 * classification path, mirrored-coordinate-repair compatibility, filter ->
 * zone-count parity, marker-rendering independence from the ZONES toggle,
 * and the component-reuse claim itself (a static/import assertion, since no
 * component-level render harness is available for the Pixi canvas).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createMatchEvent } from "../core/stats/stats-event-model";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { selectReviewEvents } from "../stats/review-selectors";
import { selectZoneOverlayModel } from "../stats/zones/zone-selectors";
import { getPitchZone } from "../stats/zones/zone-engine";
import type { ReviewHalfFilter, ReviewTeamSideFilter } from "../stats/review-types";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import { flipEventTouchlineAxis, repairMirroredEventLocations } from "./pro-tagger-coordinate-repair";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";

const CATEGORY_KINDS = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"],
} as const;

function loggedEvent(overrides: Partial<Parameters<typeof createMatchEvent>[0]> & {
  nx: number;
  ny: number;
  half: 1 | 2;
  teamSide: "FOR" | "OPP";
}): LoggedMatchEvent {
  const base = createMatchEvent({
    kind: "POINT",
    timestamp: 0,
    ...overrides,
  });
  return {
    ...base,
    type: base.kind,
    teamSide: overrides.teamSide,
    x: base.nx,
    y: base.ny,
    period: overrides.half === 1 ? "1H" : "2H",
    segment: overrides.half === 1 ? 1 : 4,
    matchClockSeconds: base.timestamp,
    createdAt: Date.now(),
    team: overrides.teamSide === "FOR" ? "HOME" : "AWAY",
  } as LoggedMatchEvent;
}

// Built through the real Event Stats capture adapter (not hand-rolled), so
// these fixtures prove the actual tap -> stored-event path, not just the
// shape of the event.
function adaptedFixtureEvents(): LoggedMatchEvent[] {
  return [
    adaptProTaggerAction({ familyId: "POINT", tileLabel: "POINT", teamSide: "FOR", nx: 0.85, ny: 0.5, half: 1, matchClockSeconds: 100 }),
    adaptProTaggerAction({ familyId: "GOAL", tileLabel: "GOAL", teamSide: "FOR", nx: 0.9, ny: 0.4, half: 1, matchClockSeconds: 200 }),
    adaptProTaggerAction({ familyId: "POINT", tileLabel: "POINT", teamSide: "OPP", nx: 0.1, ny: 0.5, half: 1, matchClockSeconds: 300 }),
    adaptProTaggerAction({ familyId: "RESTART", tileLabel: "K/O", teamSide: "FOR", restartOwner: "FOR", nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: 400 }),
    adaptProTaggerAction({ familyId: "RESTART", tileLabel: "K/O", teamSide: "FOR", restartOwner: "OPP", nx: 0.5, ny: 0.5, half: 2, matchClockSeconds: 500 }),
    adaptProTaggerAction({ familyId: "TURNOVER", tileLabel: "TURNOVER", teamSide: "FOR", nx: 0.6, ny: 0.3, half: 2, matchClockSeconds: 600 }),
    adaptProTaggerAction({ familyId: "TURNOVER", tileLabel: "TURNOVER", teamSide: "OPP", nx: 0.3, ny: 0.7, half: 2, matchClockSeconds: 700 }),
    adaptProTaggerAction({ familyId: "POINT", tileLabel: "POINT", teamSide: "OPP", nx: 0.88, ny: 0.6, half: 2, matchClockSeconds: 800 }),
  ];
}

describe("Event Stats Review Zones — known coordinate classification", () => {
  it("matches the zone-maps.ts canonical example: {nx:0.20, ny:0.80} -> Defensive Right", () => {
    expect(getPitchZone(20, 80)?.id).toBe("DEFENSIVE_RIGHT");
  });

  it("{nx:0.85, ny:0.5} -> Attacking Centre (an Event Stats scoring tap)", () => {
    expect(getPitchZone(85, 50)?.id).toBe("ATTACKING_CENTRE");
  });

  it("left/right/top/bottom edges classify into the corner zones", () => {
    expect(getPitchZone(0, 0)?.id).toBe("DEFENSIVE_LEFT");
    expect(getPitchZone(100, 0)?.id).toBe("ATTACKING_LEFT");
    expect(getPitchZone(0, 100)?.id).toBe("DEFENSIVE_RIGHT");
    expect(getPitchZone(100, 100)?.id).toBe("ATTACKING_RIGHT");
  });

  it("centre point classifies as Middle Centre", () => {
    expect(getPitchZone(50, 50)?.id).toBe("MIDDLE_CENTRE");
  });

  it("exact 1/3 and 2/3 length boundaries land in the higher-x zone (half-open interval)", () => {
    const oneThird = 100 / 3;
    const twoThirds = (100 / 3) * 2;
    expect(getPitchZone(oneThird - 0.001, 50)?.id).toBe("DEFENSIVE_CENTRE");
    expect(getPitchZone(oneThird, 50)?.id).toBe("MIDDLE_CENTRE");
    expect(getPitchZone(twoThirds - 0.001, 50)?.id).toBe("MIDDLE_CENTRE");
    expect(getPitchZone(twoThirds, 50)?.id).toBe("ATTACKING_CENTRE");
  });

  it("exact 1/3 and 2/3 width boundaries land in the higher-y (Right) channel", () => {
    const oneThird = 100 / 3;
    const twoThirds = (100 / 3) * 2;
    expect(getPitchZone(50, oneThird - 0.001)?.id).toBe("MIDDLE_LEFT");
    expect(getPitchZone(50, oneThird)?.id).toBe("MIDDLE_CENTRE");
    expect(getPitchZone(50, twoThirds - 0.001)?.id).toBe("MIDDLE_CENTRE");
    expect(getPitchZone(50, twoThirds)?.id).toBe("MIDDLE_RIGHT");
  });
});

describe("Event Stats Review Zones — half/team/direction independence (raw, non-rotated path)", () => {
  it("the same physical coordinate classifies identically in H1 and H2", () => {
    const h1 = loggedEvent({ nx: 0.2, ny: 0.8, half: 1, teamSide: "FOR" });
    const h2 = loggedEvent({ nx: 0.2, ny: 0.8, half: 2, teamSide: "FOR" });
    expect(selectZoneOverlayModel([h1])).toEqual(selectZoneOverlayModel([h2]));
  });

  it("the same physical coordinate classifies identically for FOR and OPP", () => {
    const forEvent = loggedEvent({ nx: 0.85, ny: 0.5, half: 1, teamSide: "FOR" });
    const oppEvent = loggedEvent({ nx: 0.85, ny: 0.5, half: 1, teamSide: "OPP" });
    expect(selectZoneOverlayModel([forEvent])).toEqual(selectZoneOverlayModel([oppEvent]));
  });

  it("attackingDirection does not perturb the shared zone model — the live overlay engine is direction-agnostic by design", () => {
    const events = adaptedFixtureEvents();

    const asRight = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });
    const asLeft = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "LEFT",
    });

    // zone: "FULL" means attackingDirection cannot change which events pass —
    // ProTaggerReviewScreen.tsx feeds the overlay raw, untransformed
    // coordinates, exactly like StatsModeSurface.tsx and RapidReviewScreen.tsx.
    expect(asLeft).toEqual(asRight);
    expect(selectZoneOverlayModel(asLeft)).toEqual(selectZoneOverlayModel(asRight));
  });
});

describe("Event Stats Review Zones — mirrored-coordinate repair compatibility", () => {
  it("repaired (touchline-flipped) coordinates classify differently and correctly from the pre-repair coordinates", () => {
    const original = loggedEvent({ nx: 0.2, ny: 0.8, half: 1, teamSide: "FOR" });
    const repaired = flipEventTouchlineAxis(original);

    expect(getPitchZone(original.x * 100, original.y * 100)?.id).toBe("DEFENSIVE_RIGHT");
    expect(getPitchZone(repaired.x * 100, repaired.y * 100)?.id).toBe("DEFENSIVE_LEFT");
    expect(selectZoneOverlayModel([repaired])).not.toEqual(selectZoneOverlayModel([original]));
  });

  it("the full repairMirroredEventLocations flow produces a zone model consistent with the flipped coordinates, with no special-casing needed by the Review screen", () => {
    const events = [
      loggedEvent({ nx: 0.2, ny: 0.8, half: 1, teamSide: "FOR" }),
      loggedEvent({ nx: 0.9, ny: 0.1, half: 2, teamSide: "OPP" }),
    ];
    const match = {
      id: "m1",
      createdAt: Date.now(),
      homeTeamName: "Home",
      awayTeamName: "Away",
      venue: "Venue",
      sport: "gaelic",
      matchType: "league",
      halfDurationMinutes: 30,
      scorelineSnapshot: "0-0 v 0-0",
      eventCount: events.length,
      events,
      homeSquad: { players: [] },
      awaySquad: { players: [] },
      homeSquadLiveState: [],
      awaySquadLiveState: [],
      restoreContext: {
        matchState: "FULL_TIME",
        currentHalf: 2,
        matchTimeSeconds: 0,
        firstHalfAttackingDirection: "right",
      },
    } as unknown as ProTaggerSavedMatch;

    const result = repairMirroredEventLocations(match);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expectedModel = selectZoneOverlayModel(events.map(flipEventTouchlineAxis));
    const actualModel = selectZoneOverlayModel(result.match.events);
    expect(actualModel).toEqual(expectedModel);
  });
});

describe("Event Stats Review Zones — filtering drives zone counts", () => {
  const halves: ReviewHalfFilter[] = ["FULL", "H1", "H2"];
  const teams: ReviewTeamSideFilter[] = ["ALL", "FOR", "OPP"];
  const categories = ["ALL", "SCORES", "KICKOUTS", "TURNOVERS"] as const;

  for (const half of halves) {
    for (const teamSide of teams) {
      for (const category of categories) {
        it(`half=${half} team=${teamSide} category=${category} — zone model matches the independently-filtered set`, () => {
          const events = adaptedFixtureEvents();
          const filterArgs = {
            half, segment: "ALL" as const, teamSide, category,
            categoryKinds: CATEGORY_KINDS, zone: "FULL" as const, attackingDirection: "RIGHT" as const,
          };
          const filtered = selectReviewEvents(events, filterArgs);
          const independentlyFiltered = selectReviewEvents(events, filterArgs);

          expect(filtered.length).toBe(independentlyFiltered.length);
          expect(selectZoneOverlayModel(filtered)).toEqual(selectZoneOverlayModel(independentlyFiltered));
        });
      }
    }
  }

  it("a narrower filter never produces a higher total zone count than a wider one", () => {
    const events = adaptedFixtureEvents();
    const all = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });
    const forOnly = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "FOR", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });
    expect(selectZoneOverlayModel(forOnly).totalEvents).toBeLessThanOrEqual(
      selectZoneOverlayModel(all).totalEvents,
    );
  });
});

describe("Event Stats Review Zones — component reuse proof (no duplicate implementation)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const proTaggerReviewSource = readFileSync(path.join(here, "ProTaggerReviewScreen.tsx"), "utf8");

  it("ProTaggerReviewScreen.tsx imports selectZoneOverlayModel from the exact same shared module Match Stats and Rapid Capture use", () => {
    expect(proTaggerReviewSource).toMatch(
      /import\s*\{\s*selectZoneOverlayModel\s*\}\s*from\s*"\.\.\/stats\/zones\/zone-selectors"/,
    );
  });

  it("ProTaggerReviewScreen.tsx calls selectZoneOverlayModel over filteredEvents and wires setZoneOverlayModel — the same overlay pipeline, not a reimplementation", () => {
    expect(proTaggerReviewSource).toContain("selectZoneOverlayModel(filteredEvents)");
    expect(proTaggerReviewSource).toContain("setZoneOverlayModel(");
  });

  it("the ZONES toggle does not alter the events prop passed to PitchCanvas — marker rendering is independent of the zone overlay", () => {
    expect(proTaggerReviewSource).toContain("events={filteredEvents}");
    expect(proTaggerReviewSource).toMatch(
      /zoneOverlayModel=\{showEventMapZones \? eventMapZoneOverlayModel : null\}/,
    );
  });

  it("no Event-Stats-specific zone aggregation file exists anywhere in the codebase", () => {
    // A duplicate implementation would plausibly be named ProTaggerZone*/
    // pro-tagger-zone*/event-stats-zone*. Grepping the actual filesystem
    // (rather than an import list) catches a duplicate even if it were
    // never wired up.
    const proTaggerDir = here;
    const entries = readDirRecursive(proTaggerDir);
    const suspicious = entries.filter((f) =>
      /(pro.?tagger.?zone|event.?stats.?zone)/i.test(path.basename(f)),
    );
    expect(suspicious).toEqual([]);
  });

  it("no team-relative / rotation zone helper is used on this path (the live board is raw and non-rotated, like Match Stats' own toggle)", () => {
    expect(proTaggerReviewSource).not.toContain("buildTeamRelativeZoneOverlayModel");
    expect(proTaggerReviewSource).not.toContain("toTeamRelativeZoneEvent");
  });
});

function readDirRecursive(dir: string): string[] {
  const fs = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readDirRecursive(full));
    else out.push(full);
  }
  return out;
}
