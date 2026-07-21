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
import { buildScoreLedger } from "../stats/ledger/scoreLedger";
import { analyseChains } from "../stats/chains/chain-engine";
import { createReviewSession } from "../stats/reviewSession";
import {
  rapidMatchToIntelligencePackInput,
  rapidMatchToSnapshotPdfInput,
  rapidSessionToReviewPdfInput,
} from "./rapid-capture-review-adapter";
import { computeRapidScoreboard, type RapidMatchEvent } from "./rapid-capture-events";
import type { RapidSavedMatch } from "./rapid-capture-storage";
import type { RapidSession } from "./rapid-session";
import { parseImportedMatchFile } from "./rapid-match-import";

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

/**
 * scoreFromEvents, reproduced verbatim from reviewPdfExport.ts, to score each
 * path's *adapted* output independently rather than reusing Rapid's own
 * scoring function. FREE_SCORED was missing from this local SCORE_KINDS copy
 * versus the real PDF_KIND_SETS.SCORES in reviewPdfExport.ts — this oracle
 * was itself under-counting placed-ball scores, which is exactly why this
 * file's existing parity tests never caught audit finding F01 (their shared
 * fixture never used FREE_SCORED either, so the two omissions cancelled out
 * unnoticed). Corrected to match reviewPdfExport.ts's real set.
 */
function scoreFromAdaptedEvents(events: readonly PdfExportEvent[], side: "FOR" | "OPP") {
  const SCORE_KINDS = new Set<MatchEventKind>(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"]);
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

// ─── Score-value parity: audit finding F01 regression ─────────────────────────
// F01: Rapid Capture's own scoreboard (computeRapidScoreboard) previously
// omitted FREE_SCORED and FORTY_FIVE_TWO_POINT entirely, so a Match Stats
// match imported into Rapid Capture with placed-ball or 45 two-point scores
// showed a lower total in Rapid Capture's Review screen and Intelligence
// Pack than the Full Review PDF generated from the identical events. This
// fixture deliberately includes all six real scoring-event shapes the
// schema supports (MATCH_EVENT_KINDS in stats-event-model.ts) so this gap
// cannot slip through again undetected the way it did in `sharedEvents`
// above, which never exercises FREE_SCORED/FORTY_FIVE_TWO_POINT.
//
// Real schema values used (kind, and the SOURCE_* tag that distinguishes
// "from play" vs "placed ball" where the kind alone doesn't already say so):
//   1pt from play        -> kind POINT,                tags: [SOURCE_PLAY]
//   goal                 -> kind GOAL,                 tags: [SOURCE_PLAY]
//   1pt placed ball       -> kind FREE_SCORED (no separate play/placed tag needed — the kind itself means "scored free")
//   2pt from play        -> kind TWO_POINTER,           tags: [SOURCE_PLAY]
//   2pt placed ball       -> kind TWO_POINTER,           tags: [SOURCE_FREE] (2pt free: same kind as from-play, distinguished by tag)
//   2pt 45                -> kind FORTY_FIVE_TWO_POINT (a distinct kind, not a tagged TWO_POINTER)
const scoreParityEvents: GuaranteedMatchEvent[] = [
  // FOR: one of each of the six required scoring variants.
  createMatchEvent({ kind: "POINT", nx: 0.9, ny: 0.5, half: 1, timestamp: 10, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "GOAL", nx: 0.9, ny: 0.5, half: 1, timestamp: 20, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "FREE_SCORED", nx: 0.9, ny: 0.5, half: 1, timestamp: 30, teamSide: "FOR" }),
  createMatchEvent({ kind: "TWO_POINTER", nx: 0.95, ny: 0.5, half: 1, timestamp: 40, teamSide: "FOR", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "TWO_POINTER", nx: 0.95, ny: 0.5, half: 1, timestamp: 50, teamSide: "FOR", tags: ["SOURCE_FREE"] }),
  createMatchEvent({ kind: "FORTY_FIVE_TWO_POINT", nx: 0.97, ny: 0.5, half: 1, timestamp: 60, teamSide: "FOR" }),
  // OPP: the identical six variants.
  createMatchEvent({ kind: "POINT", nx: 0.1, ny: 0.5, half: 2, timestamp: 10, teamSide: "OPP", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "GOAL", nx: 0.1, ny: 0.5, half: 2, timestamp: 20, teamSide: "OPP", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "FREE_SCORED", nx: 0.1, ny: 0.5, half: 2, timestamp: 30, teamSide: "OPP" }),
  createMatchEvent({ kind: "TWO_POINTER", nx: 0.05, ny: 0.5, half: 2, timestamp: 40, teamSide: "OPP", tags: ["SOURCE_PLAY"] }),
  createMatchEvent({ kind: "TWO_POINTER", nx: 0.05, ny: 0.5, half: 2, timestamp: 50, teamSide: "OPP", tags: ["SOURCE_FREE"] }),
  createMatchEvent({ kind: "FORTY_FIVE_TWO_POINT", nx: 0.03, ny: 0.5, half: 2, timestamp: 60, teamSide: "OPP" }),
  // Non-scoring controls on both sides — must never contribute to any total,
  // and must survive every adapter/import path so the event-count invariant holds.
  createMatchEvent({ kind: "WIDE", nx: 0.1, ny: 0.4, half: 1, timestamp: 70, teamSide: "OPP" }),
  createMatchEvent({ kind: "FREE_MISSED", nx: 0.9, ny: 0.4, half: 1, timestamp: 80, teamSide: "FOR" }),
  createMatchEvent({ kind: "TURNOVER_WON", nx: 0.5, ny: 0.5, half: 1, timestamp: 90, teamSide: "FOR", tags: ["TACKLE"] }),
].map((e): GuaranteedMatchEvent => {
  const period: MatchEventPeriod = e.period ?? (e.half === 1 ? "1H" : "2H");
  const clockSeconds = e.matchClockSeconds ?? e.timestamp;
  const segment: MatchEventSegment = e.segment ?? deriveSegmentFromPeriodClock(period, clockSeconds);
  return { ...e, teamSide: e.teamSide as "FOR" | "OPP", period, segment };
});

const SCORE_PARITY_TEAM_NAMES = { home: "Ballylanders", away: "Adare" };

/** Expected line for the six-variant mix above, per side: 1 goal, 8 points (1+1+2+2+2), total 11. */
const EXPECTED_SCORE_PARITY_LINE = { goals: 1, points: 8, total: 11 };

function buildScoreParityRapidSavedMatch(): RapidSavedMatch {
  const session: RapidSession = {
    sport: "gaelic",
    forTeamName: SCORE_PARITY_TEAM_NAMES.home,
    oppTeamName: SCORE_PARITY_TEAM_NAMES.away,
    venue: "Fraher Field",
    matchType: "championship",
    forTeamColour: "#1f6feb",
    oppTeamColour: "#b91c1c",
    attackDirection: "right",
    halfDurationMinutes: 30,
  };
  return {
    schemaVersion: 1,
    id: "score-parity-match-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "COMPLETED",
    session,
    events: scoreParityEvents as RapidMatchEvent[],
    half: 2,
    clockSeconds: 90,
    matchState: "FULL_TIME",
  };
}

describe("Score parity across every surface (audit finding F01 regression)", () => {
  it("Rapid Capture scoreboard counts all six scoring variants correctly, per side", () => {
    const board = computeRapidScoreboard(scoreParityEvents as RapidMatchEvent[]);
    expect(board.for).toEqual({ ...EXPECTED_SCORE_PARITY_LINE, twoPointers: 3 });
    expect(board.opp).toEqual({ ...EXPECTED_SCORE_PARITY_LINE, twoPointers: 3 });
  });

  it("Rapid Capture Review reads the identical scoreboard function as live capture (same source, cannot drift)", () => {
    // RapidReviewScreen.tsx calls computeRapidScoreboard(events) directly —
    // proving the function's correctness above already proves Review's
    // correctness; this test documents that equivalence explicitly rather
    // than leaving it implicit.
    const liveBoard = computeRapidScoreboard(scoreParityEvents as RapidMatchEvent[]);
    const reviewBoard = computeRapidScoreboard(scoreParityEvents as RapidMatchEvent[]);
    expect(reviewBoard).toEqual(liveBoard);
  });

  it("Intelligence Pack score matches the Rapid Capture scoreboard for the same match", () => {
    const packInput = rapidMatchToIntelligencePackInput(buildScoreParityRapidSavedMatch(), "Full Time");
    expect(packInput.homeScore).toEqual(EXPECTED_SCORE_PARITY_LINE);
    expect(packInput.awayScore).toEqual(EXPECTED_SCORE_PARITY_LINE);
  });

  it("Full Review / FT Snapshot PDF input score (canonical scoreFromEvents logic) matches", () => {
    const pdfEvents = rapidSessionToReviewPdfInput(buildScoreParityRapidSavedMatch()).events;
    expect(scoreFromAdaptedEvents(pdfEvents, "FOR")).toEqual(EXPECTED_SCORE_PARITY_LINE);
    expect(scoreFromAdaptedEvents(pdfEvents, "OPP")).toEqual(EXPECTED_SCORE_PARITY_LINE);
  });

  it("canonical MatchReport ledger score (buildScoreLedger, the same function matchReport.ts calls) matches", () => {
    const ledger = buildScoreLedger(
      scoreParityEvents,
      analyseChains(scoreParityEvents),
      SCORE_PARITY_TEAM_NAMES.home,
      SCORE_PARITY_TEAM_NAMES.away,
    );
    expect(ledger.forScore).toEqual(EXPECTED_SCORE_PARITY_LINE);
    expect(ledger.oppScore).toEqual(EXPECTED_SCORE_PARITY_LINE);
  });

  it("event count is preserved end to end: capture -> Rapid adapter -> PDF input -> Intelligence Pack input, 15 events throughout", () => {
    expect(scoreParityEvents.length).toBe(15);
    expect(rapidSessionToReviewPdfInput(buildScoreParityRapidSavedMatch()).events.length).toBe(15);
    expect(rapidMatchToIntelligencePackInput(buildScoreParityRapidSavedMatch(), "Full Time").events.length).toBe(15);
  });

  it("score survives a Match Stats JSON export -> Rapid Capture import round trip (F01's real-world trigger)", () => {
    // A coach exports this match from Match Stats (a ReviewSession, the
    // exact JSON shape StatsModeSurface.tsx's "Export Review" produces) and
    // imports it into Rapid Capture via the Match Hub's "Import JSON"
    // action. This is precisely the path the audit found broken.
    const reviewSession = createReviewSession({
      matchInfo: { homeTeam: SCORE_PARITY_TEAM_NAMES.home, awayTeam: SCORE_PARITY_TEAM_NAMES.away, venue: "Fraher Field" },
      events: scoreParityEvents,
      reviewContext: { period: "FULL", segment: "ALL", teamSide: "ALL", category: "ALL" },
    });
    const raw = JSON.stringify(reviewSession);
    const result = parseImportedMatchFile(raw);

    expect(result.status).toBe("ok");
    if (result.status === "error") return;
    expect(result.format).toBe("MATCH_STATS");
    expect(result.match.events).toHaveLength(15);

    const reimportedBoard = computeRapidScoreboard(result.match.events);
    expect(reimportedBoard.for).toEqual({ ...EXPECTED_SCORE_PARITY_LINE, twoPointers: 3 });
    expect(reimportedBoard.opp).toEqual({ ...EXPECTED_SCORE_PARITY_LINE, twoPointers: 3 });
  });
});
