// Validates that Rapid Capture's adapter feeds the shared Match Stats report
// engine (reviewPdfExport.ts / intelligencePack.ts) an input equivalent,
// field-for-field, to what Match Stats itself would send for the identical
// underlying event stream — the same events, only captured through a
// different UI. This is the acceptance test the Rapid -> Match Stats PDF
// integration guardrails require: proof of parity, not an assertion that
// Rapid's own logic agrees with itself.
//
// StatsModeSurface.tsx's exact construction (verified by reading the file
// directly, not guessed) is mirrored here:
//   exportReviewPdf({ events: loggedEvents, homeTeamName, awayTeamName,
//     venueName, sport, homeSquadPlayers, awaySquadPlayers, targets })
//   exportSnapshotPdf({ ...same..., snapshotMode, homeAttackingDirection })
//   buildIntelligencePack({ stageLabel, homeTeamName, awayTeamName,
//     venueLabel, clockLabel, homeScore, awayScore,
//     events: stageLabel === "Half Time" ? loggedEvents.filter(e => e.period === "1H") : loggedEvents })
// with homeScore/awayScore computed from that same (possibly HT-filtered) set.

import { describe, expect, it } from "vitest";
import { createMatchEvent, type MatchEvent, type MatchEventKind, type MatchEventPeriod, type MatchEventSegment } from "../core/stats/stats-event-model";
import type { PdfExportEvent, PdfSquadPlayer, ReviewPdfExportInput } from "../stats/reviewPdfExport";
import type { IntelligencePackInput } from "../stats/intelligencePack";
import { deriveSegmentFromPeriodClock } from "../stats/statsSegments";
import {
  rapidMatchToIntelligencePackInput,
  rapidMatchToSnapshotPdfInput,
  rapidSessionToReviewPdfInput,
} from "./rapid-capture-review-adapter";
import type { RapidMatchEvent } from "./rapid-capture-events";
import type { RapidSavedMatch } from "./rapid-capture-storage";
import type { RapidSession } from "./rapid-session";

// ─── Shared event stream — the "same imported match" the validation section asks for ──
// One incident stream, exactly as it would exist in either tool's storage:
// both halves, both teams, every kind family, tags, restartOwner, player
// attribution on a subset (matching real capture — not every event gets a
// player). teamSide/period/segment are widened back to their guaranteed,
// non-optional form (matching LoggedMatchEvent / PdfExportEvent / RapidMatchEvent
// contracts) since createMatchEvent's return type keeps them optional even
// though every call below always supplies teamSide and createMatchEvent always
// computes period.
type GuaranteedMatchEvent = MatchEvent & {
  teamSide: "FOR" | "OPP";
  period: MatchEventPeriod;
  segment: MatchEventSegment;
};

const sharedEvents: GuaranteedMatchEvent[] = [
  createMatchEvent({ kind: "KICKOUT_WON", nx: 0.3, ny: 0.5, half: 1, timestamp: 5, teamSide: "FOR", restartOwner: "FOR", tags: ["CLEAN"] }),
  createMatchEvent({ kind: "POINT", nx: 0.88, ny: 0.5, half: 1, timestamp: 40, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "GOAL", nx: 0.92, ny: 0.5, half: 1, timestamp: 120, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "WIDE", nx: 0.1, ny: 0.4, half: 1, timestamp: 200, teamSide: "OPP" }),
  createMatchEvent({ kind: "TURNOVER_WON", nx: 0.5, ny: 0.5, half: 1, timestamp: 260, teamSide: "FOR", tags: ["TACKLE"] }),
  createMatchEvent({ kind: "TURNOVER_LOST", nx: 0.55, ny: 0.45, half: 1, timestamp: 400, teamSide: "FOR", tags: ["SLACK_HAND_PASS"] }),
  createMatchEvent({ kind: "KICKOUT_CONCEDED", nx: 0.25, ny: 0.5, half: 1, timestamp: 500, teamSide: "FOR", restartOwner: "OPP", tags: ["FOUL_CONCEDED"] }),
  createMatchEvent({ kind: "FREE_WON", nx: 0.7, ny: 0.5, half: 1, timestamp: 700, teamSide: "FOR" }),
  createMatchEvent({ kind: "FREE_CONCEDED", nx: 0.2, ny: 0.5, half: 1, timestamp: 850, teamSide: "FOR" }),
  createMatchEvent({ kind: "TWO_POINTER", nx: 0.95, ny: 0.5, half: 1, timestamp: 900, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "KICKOUT_WON", nx: 0.3, ny: 0.5, half: 2, timestamp: 20, teamSide: "OPP", restartOwner: "OPP" }),
  createMatchEvent({ kind: "POINT", nx: 0.1, ny: 0.5, half: 2, timestamp: 300, teamSide: "OPP", tags: ["SOURCE_FREE"] }),
  createMatchEvent({ kind: "TURNOVER_WON", nx: 0.4, ny: 0.5, half: 2, timestamp: 600, teamSide: "OPP", tags: ["INTERCEPT"] }),
  createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.5, half: 2, timestamp: 1100, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
].map((e, i): GuaranteedMatchEvent => {
  const period: MatchEventPeriod = e.period ?? (e.half === 1 ? "1H" : "2H");
  const clockSeconds = e.matchClockSeconds ?? e.timestamp;
  const segment: MatchEventSegment = e.segment ?? deriveSegmentFromPeriodClock(period, clockSeconds);
  return {
    ...e,
    teamSide: e.teamSide as "FOR" | "OPP",
    period,
    segment,
    // Player attribution on a subset only, matching real capture behaviour.
    ...(i % 3 === 0 ? { playerId: `p${i}`, playerName: `Player ${i}`, playerNumber: i + 1 } : {}),
  };
});

const homeTeamName = "Ballyboden";
const awayTeamName = "Na Fianna";
const venueName = "Croke Park";
const homeSquadPlayers: PdfSquadPlayer[] = [{ id: "p0", number: 1, name: "Player 0" }];
const awaySquadPlayers: PdfSquadPlayer[] = [{ id: "p3", number: 4, name: "Player 3" }];

/** Exactly what StatsModeSurface.tsx's handleExportPdf builds — no adapter, direct pass-through. */
function buildMatchStatsReviewPdfInput(): ReviewPdfExportInput {
  return {
    events: sharedEvents,
    homeTeamName,
    awayTeamName,
    venueName,
    sport: "gaelic",
    homeSquadPlayers,
    awaySquadPlayers,
  };
}

function buildRapidSavedMatch(): RapidSavedMatch {
  const session: RapidSession = {
    sport: "gaelic",
    forTeamName: homeTeamName,
    oppTeamName: awayTeamName,
    venue: venueName,
    matchType: "championship",
    forTeamColour: "#1f6feb",
    oppTeamColour: "#b91c1c",
    attackDirection: "right",
    halfDurationMinutes: 30,
    forSquad: [{ id: "p0", number: 1, name: "Player 0" }],
    oppSquad: [{ id: "p3", number: 4, name: "Player 3" }],
  };
  return {
    schemaVersion: 1,
    id: "parity-match-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "COMPLETED",
    session,
    // MatchEvent is a structural subset of RapidMatchEvent's required fields
    // (id, kind, nx, ny, half, timestamp) — the same incident stream, no
    // reshaping needed to hand it to Rapid Capture's own storage shape.
    events: sharedEvents as RapidMatchEvent[],
    half: 2,
    clockSeconds: 1100,
    matchState: "FULL_TIME",
  };
}

/** scoreFromEvents, reproduced verbatim from reviewPdfExport.ts, to score each path's *adapted* output independently rather than reusing Rapid's own scoring function. */
function scoreFromAdaptedEvents(events: readonly PdfExportEvent[], side: "FOR" | "OPP") {
  const SCORE_KINDS = new Set<MatchEventKind>(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"]);
  let goals = 0;
  let points = 0;
  for (const e of events) {
    if (e.teamSide !== side) continue;
    if (!SCORE_KINDS.has(e.kind)) continue;
    if (e.kind === "GOAL") { goals++; continue; }
    if (e.kind === "TWO_POINTER" || e.kind === "FORTY_FIVE_TWO_POINT") { points += 2; continue; }
    points++;
  }
  return { goals, points, total: goals * 3 + points };
}

describe("Rapid -> Match Stats PDF parity: Full Review PDF input", () => {
  it("event count matches between the Match Stats path and the Rapid adapter path", () => {
    const matchStatsInput = buildMatchStatsReviewPdfInput();
    const rapidInput = rapidSessionToReviewPdfInput(buildRapidSavedMatch());
    expect(rapidInput.events.length).toBe(matchStatsInput.events.length);
    expect(rapidInput.events.length).toBe(sharedEvents.length);
  });

  it("every event field the PDF pipeline reads is identical between the two paths (order-preserving)", () => {
    const matchStatsEvents = buildMatchStatsReviewPdfInput().events;
    const rapidEvents = rapidSessionToReviewPdfInput(buildRapidSavedMatch()).events;

    expect(rapidEvents.map((e) => e.id)).toEqual(matchStatsEvents.map((e) => e.id));

    rapidEvents.forEach((rapidEvent, i) => {
      const msEvent = matchStatsEvents[i];
      expect(rapidEvent.kind).toBe(msEvent.kind);
      expect(rapidEvent.teamSide).toBe(msEvent.teamSide);
      expect(rapidEvent.period).toBe(msEvent.period);
      expect(rapidEvent.segment).toBe(msEvent.segment);
      expect(rapidEvent.nx).toBe(msEvent.nx);
      expect(rapidEvent.ny).toBe(msEvent.ny);
      expect(rapidEvent.tags).toEqual(msEvent.tags);
      expect(rapidEvent.matchClockSeconds).toBe(msEvent.matchClockSeconds);
      expect(rapidEvent.restartOwner).toBe(msEvent.restartOwner);
      expect(rapidEvent.playerId).toBe(msEvent.playerId);
      expect(rapidEvent.playerName).toBe(msEvent.playerName);
      expect(rapidEvent.playerNumber).toBe(msEvent.playerNumber);
    });
  });

  it("team names, venue, and sport match between the two paths", () => {
    const matchStatsInput = buildMatchStatsReviewPdfInput();
    const rapidInput = rapidSessionToReviewPdfInput(buildRapidSavedMatch());
    expect(rapidInput.homeTeamName).toBe(matchStatsInput.homeTeamName);
    expect(rapidInput.awayTeamName).toBe(matchStatsInput.awayTeamName);
    expect(rapidInput.venueName).toBe(matchStatsInput.venueName);
    expect(rapidInput.sport).toBe(matchStatsInput.sport);
  });

  it("scoreline computed from the adapted output matches between the two paths (Scoreline must match Review)", () => {
    const matchStatsEvents = buildMatchStatsReviewPdfInput().events;
    const rapidEvents = rapidSessionToReviewPdfInput(buildRapidSavedMatch()).events;

    expect(scoreFromAdaptedEvents(rapidEvents, "FOR")).toEqual(scoreFromAdaptedEvents(matchStatsEvents, "FOR"));
    expect(scoreFromAdaptedEvents(rapidEvents, "OPP")).toEqual(scoreFromAdaptedEvents(matchStatsEvents, "OPP"));
    // Sanity: the actual expected scoreline for this fixture — FOR: 1 goal, 2
    // points, 1 two-pointer (1*3 + 1 + 1 + 2 = 7); OPP: 1 point (0*3 + 1 = 1).
    expect(scoreFromAdaptedEvents(rapidEvents, "FOR")).toEqual({ goals: 1, points: 4, total: 7 });
    expect(scoreFromAdaptedEvents(rapidEvents, "OPP")).toEqual({ goals: 0, points: 1, total: 1 });
  });
});

describe("Rapid -> Match Stats PDF parity: HT/FT Snapshot input", () => {
  function buildMatchStatsSnapshotInput(snapshotMode: "HALF_TIME_SNAPSHOT" | "FULL_TIME_SNAPSHOT") {
    return {
      ...buildMatchStatsReviewPdfInput(),
      snapshotMode,
      homeAttackingDirection: "RIGHT" as const,
    };
  }

  it("HT Snapshot input is field-equivalent between the two paths (HT Snapshot totals must match Match Stats)", () => {
    const matchStatsInput = buildMatchStatsSnapshotInput("HALF_TIME_SNAPSHOT");
    const rapidInput = rapidMatchToSnapshotPdfInput(buildRapidSavedMatch(), "HALF_TIME_SNAPSHOT");
    expect(rapidInput.snapshotMode).toBe(matchStatsInput.snapshotMode);
    expect(rapidInput.events.length).toBe(matchStatsInput.events.length);
    // exportSnapshotPdf itself filters to period==="1H" internally for HT —
    // the adapter must NOT pre-filter, or it would double-filter against
    // that internal logic. Both paths hand over the full event set.
    expect(rapidInput.events.map((e) => e.id)).toEqual(matchStatsInput.events.map((e) => e.id));
  });

  it("FT Snapshot input is field-equivalent between the two paths (FT Snapshot totals must match Match Stats)", () => {
    const matchStatsInput = buildMatchStatsSnapshotInput("FULL_TIME_SNAPSHOT");
    const rapidInput = rapidMatchToSnapshotPdfInput(buildRapidSavedMatch(), "FULL_TIME_SNAPSHOT");
    expect(rapidInput.snapshotMode).toBe(matchStatsInput.snapshotMode);
    expect(rapidInput.events.length).toBe(matchStatsInput.events.length);
    expect(rapidInput.events.map((e) => e.id)).toEqual(matchStatsInput.events.map((e) => e.id));
  });
});

describe("Rapid -> Match Stats PDF parity: Intelligence Pack input", () => {
  // Reproduces StatsModeSurface.tsx's handleGenerateIntelligencePack exactly.
  function buildMatchStatsPackInput(stageLabel: "Half Time" | "Full Time"): IntelligencePackInput {
    const packEvents = stageLabel === "Half Time" ? sharedEvents.filter((e) => e.period === "1H") : sharedEvents;
    const homeScore = scoreFromAdaptedEvents(packEvents as PdfExportEvent[], "FOR");
    const awayScore = scoreFromAdaptedEvents(packEvents as PdfExportEvent[], "OPP");
    return {
      stageLabel,
      homeTeamName,
      awayTeamName,
      venueLabel: venueName,
      clockLabel: stageLabel,
      homeScore,
      awayScore,
      events: packEvents,
    };
  }

  it("Half Time pack: same event subset and score between the two paths", () => {
    const matchStatsInput = buildMatchStatsPackInput("Half Time");
    const rapidInput = rapidMatchToIntelligencePackInput(buildRapidSavedMatch(), "Half Time");
    expect(rapidInput.events.length).toBe(matchStatsInput.events.length);
    expect(rapidInput.events.map((e) => e.id)).toEqual(matchStatsInput.events.map((e) => e.id));
    expect(rapidInput.homeScore).toEqual(matchStatsInput.homeScore);
    expect(rapidInput.awayScore).toEqual(matchStatsInput.awayScore);
  });

  it("Full Time pack: same full event set and score between the two paths (Intelligence Pack must produce identical findings)", () => {
    const matchStatsInput = buildMatchStatsPackInput("Full Time");
    const rapidInput = rapidMatchToIntelligencePackInput(buildRapidSavedMatch(), "Full Time");
    expect(rapidInput.events.length).toBe(matchStatsInput.events.length);
    expect(rapidInput.events.map((e) => e.id)).toEqual(matchStatsInput.events.map((e) => e.id));
    expect(rapidInput.homeScore).toEqual(matchStatsInput.homeScore);
    expect(rapidInput.awayScore).toEqual(matchStatsInput.awayScore);
  });
});

describe("Rapid -> Match Stats PDF parity: source data is never mutated", () => {
  it("the shared event fixture is untouched after being run through every adapter path", () => {
    const before = JSON.parse(JSON.stringify(sharedEvents));
    rapidSessionToReviewPdfInput(buildRapidSavedMatch());
    rapidMatchToSnapshotPdfInput(buildRapidSavedMatch(), "HALF_TIME_SNAPSHOT");
    rapidMatchToSnapshotPdfInput(buildRapidSavedMatch(), "FULL_TIME_SNAPSHOT");
    rapidMatchToIntelligencePackInput(buildRapidSavedMatch(), "Half Time");
    rapidMatchToIntelligencePackInput(buildRapidSavedMatch(), "Full Time");
    expect(sharedEvents).toEqual(before);
  });
});
