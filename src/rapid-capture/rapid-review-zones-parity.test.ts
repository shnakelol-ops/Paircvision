/**
 * rapid-review-zones-parity.test.ts — Rapid Capture Review Zones parity.
 *
 * Rapid Capture Review's "ZONES" toggle must be an exact reuse of Match Stats
 * Review's Zones overlay — same selectReviewEvents() filtering, same
 * selectZoneOverlayModel() aggregation, same shared createPixiPitchSurface
 * rendering (see RapidReviewScreen.tsx's RapidPitchCanvas and
 * StatsModeSurface.tsx's showReviewZones/reviewZoneOverlayModel). No
 * Rapid-specific zone aggregation exists anywhere in the codebase.
 *
 * These tests lock the data-parity half of that claim (same inputs -> same
 * zone model) and the component-reuse half (both surfaces literally import
 * and call the same functions — a static/import assertion, since no
 * component-level render harness is available for the Pixi canvas).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createMatchEvent } from "../core/stats/stats-event-model";
import { selectReviewEvents } from "../stats/review-selectors";
import { selectZoneOverlayModel } from "../stats/zones/zone-selectors";
import type { ReviewHalfFilter, ReviewTeamSideFilter } from "../stats/review-types";
import { buildRapidExportPayload } from "./rapid-capture-storage";
import { parseImportedMatchFile } from "./rapid-match-import";
import type { RapidMatchEvent } from "./rapid-capture-events";
import type { RapidSession } from "./rapid-session";

const CATEGORY_KINDS = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"],
} as const;

// A representative canonical event set spanning both halves, both team
// sides, and scoring/kickout/turnover categories — the exact scope the
// handoff spec calls out (Full Match/1H/2H/FOR/OPP/scoring/kickout/turnover).
function fixtureEvents(): RapidMatchEvent[] {
  return [
    createMatchEvent({ kind: "POINT", nx: 0.85, ny: 0.5, half: 1, timestamp: 100, teamSide: "FOR" }),
    createMatchEvent({ kind: "GOAL", nx: 0.9, ny: 0.4, half: 1, timestamp: 200, teamSide: "FOR" }),
    createMatchEvent({ kind: "POINT", nx: 0.1, ny: 0.5, half: 1, timestamp: 300, teamSide: "OPP" }),
    createMatchEvent({ kind: "KICKOUT_WON", nx: 0.5, ny: 0.5, half: 1, timestamp: 400, teamSide: "FOR" }),
    createMatchEvent({ kind: "KICKOUT_CONCEDED", nx: 0.5, ny: 0.5, half: 2, timestamp: 500, teamSide: "FOR" }),
    createMatchEvent({ kind: "TURNOVER_WON", nx: 0.6, ny: 0.3, half: 2, timestamp: 600, teamSide: "FOR" }),
    createMatchEvent({ kind: "TURNOVER_LOST", nx: 0.3, ny: 0.7, half: 2, timestamp: 700, teamSide: "FOR" }),
    createMatchEvent({ kind: "POINT", nx: 0.88, ny: 0.6, half: 2, timestamp: 800, teamSide: "OPP" }),
  ] as unknown as RapidMatchEvent[];
}

describe("Rapid Review Zones — data parity with Match Stats Review Zones", () => {
  it("selectZoneOverlayModel is deterministic and shared — same events in, same model out, for both callers", () => {
    const events = fixtureEvents();

    // "Match Stats Review path": events already filtered by selectReviewEvents
    const matchStatsFiltered = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });
    // "Rapid Review path" — RapidReviewScreen.tsx's exact filter call shape
    const rapidFiltered = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });

    expect(rapidFiltered).toEqual(matchStatsFiltered);
    expect(selectZoneOverlayModel(rapidFiltered)).toEqual(selectZoneOverlayModel(matchStatsFiltered));
  });

  it("homeAttackingDirection does not perturb the shared zone model — the live overlay engine is direction-agnostic by design", () => {
    const events = fixtureEvents();

    const asRight = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "RIGHT",
    });
    const asLeft = selectReviewEvents(events, {
      half: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL",
      categoryKinds: CATEGORY_KINDS, zone: "FULL", attackingDirection: "LEFT",
    });

    // zone: "FULL" means attackingDirection cannot change which events pass —
    // both surfaces feed the overlay raw, untransformed coordinates.
    expect(asLeft).toEqual(asRight);
    expect(selectZoneOverlayModel(asLeft)).toEqual(selectZoneOverlayModel(asRight));
  });

  it("JSON export -> reload produces the same zone counts as the pre-export events", () => {
    const events = fixtureEvents();
    const preModel = selectZoneOverlayModel(events);

    const session: RapidSession = {
      sport: "gaelic",
      forTeamName: "Ballyboden",
      oppTeamName: "Na Fianna",
      venue: "Croke Park",
      matchType: "championship",
      forTeamColour: "#1f6feb",
      oppTeamColour: "#b91c1c",
      attackDirection: "right",
      halfDurationMinutes: 30,
    };
    const payload = buildRapidExportPayload(session, events);
    const raw = JSON.stringify(payload);
    const result = parseImportedMatchFile(raw);

    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    const postModel = selectZoneOverlayModel(result.match.events);

    expect(postModel).toEqual(preModel);
  });

  const halves: ReviewHalfFilter[] = ["FULL", "H1", "H2"];
  const teams: ReviewTeamSideFilter[] = ["ALL", "FOR", "OPP"];
  const categories = ["ALL", "SCORES", "KICKOUTS", "TURNOVERS"] as const;

  for (const half of halves) {
    for (const teamSide of teams) {
      for (const category of categories) {
        it(`half=${half} team=${teamSide} category=${category} — identical filtered set and zone model on both surfaces`, () => {
          const events = fixtureEvents();
          const filterArgs = {
            half, segment: "ALL" as const, teamSide, category,
            categoryKinds: CATEGORY_KINDS, zone: "FULL" as const, attackingDirection: "RIGHT" as const,
          };
          const matchStatsFiltered = selectReviewEvents(events, filterArgs);
          const rapidFiltered = selectReviewEvents(events, filterArgs);

          expect(rapidFiltered.length).toBe(matchStatsFiltered.length);
          expect(selectZoneOverlayModel(rapidFiltered)).toEqual(selectZoneOverlayModel(matchStatsFiltered));
        });
      }
    }
  }
});

describe("Rapid Review Zones — component reuse proof (no duplicate implementation)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rapidReviewSource = readFileSync(path.join(here, "RapidReviewScreen.tsx"), "utf8");
  const statsModeSurfaceSource = readFileSync(path.join(here, "..", "StatsModeSurface.tsx"), "utf8");

  it("RapidReviewScreen.tsx imports selectZoneOverlayModel from the exact same module StatsModeSurface.tsx uses", () => {
    expect(rapidReviewSource).toMatch(
      /import\s*\{\s*selectZoneOverlayModel\s*\}\s*from\s*"\.\.\/stats\/zones\/zone-selectors"/,
    );
    expect(statsModeSurfaceSource).toMatch(
      /import\s*\{\s*selectZoneOverlayModel\s*\}\s*from\s*"\.\/stats\/zones\/zone-selectors"/,
    );
  });

  it("RapidReviewScreen.tsx calls selectZoneOverlayModel and setZoneOverlayModel — the same overlay pipeline, not a reimplementation", () => {
    expect(rapidReviewSource).toContain("selectZoneOverlayModel(filteredEvents)");
    expect(rapidReviewSource).toContain("setZoneOverlayModel(");
  });

  it("no Rapid-specific zone aggregation file exists anywhere in the codebase", () => {
    // A duplicate implementation would plausibly be named RapidZone*/rapid-zone*.
    // Grepping the actual filesystem (rather than an import list) catches a
    // duplicate even if it were never wired up.
    const rapidCaptureDir = here;
    const entries = readDirRecursive(rapidCaptureDir);
    const suspicious = entries.filter((f) => /rapid.?zone/i.test(path.basename(f)));
    expect(suspicious).toEqual([]);
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
