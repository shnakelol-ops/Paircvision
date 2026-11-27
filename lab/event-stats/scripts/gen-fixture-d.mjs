// gen-fixture-d.mjs — hand-scripted synthetic match D (hurling) for the Event Stats laboratory.
//
// Independent of PáircVision: imports only node: built-ins. Deterministic (no randomness).
//   node lab/event-stats/scripts/gen-fixture-d.mjs <out-dir>     → <out-dir>/match-D.json
//
// Written to close three coverage gaps left by matches A–C, and nothing else:
//   1. A player tagged on a LOST restart (per-player "restarts lost" was 0 everywhere).
//      The live picker shows the restart winner's squad, so this arises from a legacy
//      event (no squadId) corrected in Review, whose roster falls back to the restart
//      owner — typically the goalkeeper who took the puckout. D-005 (home GK) and D-029
//      (away GK) are such events.
//   2. An UNATTRIBUTED score: D-032, the first event of the second half, is a blocked home
//      shot with no restart or turnover before it, Review-edited to a point. The Edit form
//      has no source field, so the score's source is unknown and it has no chain origin.
//   3. A hurling match whose home team converts none of its 8 won puckouts but loses 9, six
//      of which the away team scores from — so the "net restart disadvantage" intelligence
//      sentence (the only one using the singular restart term) is produced for hurling.
//
// `truth` is the scenario's ground truth, written by hand from the story above (what
// actually happened), never from any calculator's output.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const squad = (label) => Array.from({ length: 20 }, (_, i) => ({ number: i + 1, name: `D ${label} ${i + 1}` }));
const P = (team, number) => ({ team, number });
const THROW_IN = { type: "THROW_IN", id: null };
const from = (type, id) => ({ type, id });

// [id, half, clock, family, row, tile, player, nx, ny, truth, owner?]
const H1 = [
  ["D-001", 1, 40, "TURNOVER", "FOR", "Interception", P("FOR", 7), 0.48, 0.42, { action: "turnover", winner: "FOR", loser: "OPP", method: "Interception" }],
  ["D-002", 1, 60, "WIDE", "FOR", "Play", P("FOR", 11), 0.82, 0.30, { action: "wide", team: "FOR", source: "Play", origin: from("TURNOVER", "D-001") }],
  // Lost #1 (away's own puckout) → away point.
  ["D-003", 1, 90, "RESTART", "OPP", "Clean", P("OPP", 8), 0.62, 0.55, { action: "restart", owner: "OPP", winner: "OPP", method: "Clean" }, "OPP"],
  ["D-004", 1, 115, "POINT", "OPP", "Play", P("OPP", 12), 0.20, 0.48, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-003") }],
  // Lost #2 (home's own puckout) — home goalkeeper tagged (legacy event corrected in Review) → away point.
  ["D-005", 1, 140, "RESTART", "OPP", "Break", P("FOR", 1), 0.40, 0.50, { action: "restart", owner: "FOR", winner: "OPP", method: "Break" }, "FOR"],
  ["D-006", 1, 160, "POINT", "OPP", "Play", P("OPP", 13), 0.18, 0.60, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-005") }],
  // Won #1 → home dispossessed, away wide.
  ["D-007", 1, 190, "RESTART", "FOR", "Clean", P("FOR", 6), 0.38, 0.40, { action: "restart", owner: "FOR", winner: "FOR", method: "Clean" }, "FOR"],
  ["D-008", 1, 205, "TURNOVER", "OPP", "Tackle", P("FOR", 10), 0.55, 0.35, { action: "turnover", winner: "OPP", loser: "FOR", method: "Tackle" }],
  ["D-009", 1, 225, "WIDE", "OPP", "Play", P("OPP", 14), 0.16, 0.70, { action: "wide", team: "OPP", source: "Play", origin: from("TURNOVER", "D-008") }],
  // Won #2 → blocked home shot, away recover and score a goal.
  ["D-010", 1, 255, "RESTART", "FOR", "Clean", P("FOR", 8), 0.36, 0.52, { action: "restart", owner: "FOR", winner: "FOR", method: "Clean" }, "FOR"],
  ["D-011", 1, 270, "SHOT", "FOR", "Block/Save", P("FOR", 14), 0.86, 0.47, { action: "shot", team: "FOR", source: "Block/Save", origin: from("RESTART", "D-010") }],
  ["D-012", 1, 290, "TURNOVER", "OPP", "Interception", P("FOR", 14), 0.80, 0.45, { action: "turnover", winner: "OPP", loser: "FOR", method: "Interception" }],
  ["D-013", 1, 310, "GOAL", "OPP", "Play", P("OPP", 15), 0.10, 0.50, { action: "score", team: "OPP", source: "Play", origin: from("TURNOVER", "D-012") }],
  // Lost #3 → away point.
  ["D-014", 1, 340, "RESTART", "OPP", "Clean", P("OPP", 9), 0.42, 0.62, { action: "restart", owner: "FOR", winner: "OPP", method: "Clean" }, "FOR"],
  ["D-015", 1, 360, "POINT", "OPP", "Play", P("OPP", 12), 0.22, 0.44, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-014") }],
  // Won #3 → home concede a free, away point from it.
  ["D-016", 1, 390, "RESTART", "FOR", "Break", P("FOR", 9), 0.40, 0.38, { action: "restart", owner: "FOR", winner: "FOR", method: "Break" }, "FOR"],
  ["D-017", 1, 410, "FREE", "FOR", "Conceded", P("FOR", 3), 0.30, 0.50, { action: "free", awardedTo: "OPP" }],
  ["D-018", 1, 430, "POINT", "OPP", "Free", P("OPP", 11), 0.26, 0.52, { action: "score", team: "OPP", source: "Free", origin: from("FREE", "D-017"), placed: true }],
  // Lost #4 → away wide.
  ["D-019", 1, 460, "RESTART", "OPP", "Clean", P("OPP", 8), 0.44, 0.58, { action: "restart", owner: "FOR", winner: "OPP", method: "Clean" }, "FOR"],
  ["D-020", 1, 480, "WIDE", "OPP", "Play", P("OPP", 13), 0.15, 0.30, { action: "wide", team: "OPP", source: "Play", origin: from("RESTART", "D-019") }],
  // Won #4 → home over-carry, away point.
  ["D-021", 1, 510, "RESTART", "FOR", "Clean", P("FOR", 6), 0.37, 0.45, { action: "restart", owner: "FOR", winner: "FOR", method: "Clean" }, "FOR"],
  ["D-022", 1, 530, "TURNOVER", "OPP", "Overcarried", P("FOR", 10), 0.58, 0.40, { action: "turnover", winner: "OPP", loser: "FOR", method: "Overcarried" }],
  ["D-023", 1, 555, "POINT", "OPP", "Play", P("OPP", 14), 0.20, 0.55, { action: "score", team: "OPP", source: "Play", origin: from("TURNOVER", "D-022") }],
  // Won #5 → sideline to the away team; a home yellow card.
  ["D-024", 1, 590, "RESTART", "FOR", "Clean", P("FOR", 8), 0.39, 0.50, { action: "restart", owner: "FOR", winner: "FOR", method: "Clean" }, "FOR"],
  ["D-025", 1, 615, "SIDELINE", "OPP", "Won", null, 0.50, 0.98, { action: "sideline", winner: "OPP" }],
  ["D-026", 1, 640, "DISCIPLINE", "FOR", "Yellow", P("FOR", 3), 0.40, 0.55, { action: "card", team: "FOR", card: "Yellow" }],
  // Home win the ball and go wide.
  ["D-027", 1, 660, "TURNOVER", "FOR", "HP Error", P("FOR", 4), 0.45, 0.50, { action: "turnover", winner: "FOR", loser: "OPP", method: "HP Error" }],
  ["D-028", 1, 690, "WIDE", "FOR", "Play", P("FOR", 12), 0.84, 0.66, { action: "wide", team: "FOR", source: "Play", origin: from("TURNOVER", "D-027") }],
  // Won #6 (away's own puckout) — away goalkeeper tagged (legacy event corrected in Review); a 65 to home, then a home wide.
  ["D-029", 1, 720, "RESTART", "FOR", "Clean", P("OPP", 1), 0.60, 0.48, { action: "restart", owner: "OPP", winner: "FOR", method: "Clean" }, "OPP"],
  ["D-030", 1, 745, "FORTY_FIVE", "FOR", "Won", P("FOR", 11), 0.92, 0.10, { action: "fortyFive", winner: "FOR" }],
  ["D-031", 1, 770, "WIDE", "FOR", "Play", P("FOR", 11), 0.80, 0.25, { action: "wide", team: "FOR", source: "Play", origin: from("RESTART", "D-029") }],
];

const H2 = [
  // Second-half throw-in: a blocked home shot, later Review-edited to a point (unattributed).
  ["D-032", 2, 40, "SHOT", "FOR", "Block/Save", P("FOR", 14), 0.14, 0.50, { action: "shot", team: "FOR", source: "Block/Save", origin: THROW_IN }],
  // Lost #5 (away's own puckout) → away point.
  ["D-033", 2, 70, "RESTART", "OPP", "Clean", P("OPP", 8), 0.40, 0.55, { action: "restart", owner: "OPP", winner: "OPP", method: "Clean" }, "OPP"],
  ["D-034", 2, 95, "POINT", "OPP", "Play", P("OPP", 12), 0.82, 0.45, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-033") }],
  // Won #7 → home wide.
  ["D-035", 2, 120, "RESTART", "FOR", "Clean", P("FOR", 6), 0.62, 0.40, { action: "restart", owner: "FOR", winner: "FOR", method: "Clean" }, "FOR"],
  ["D-036", 2, 140, "WIDE", "FOR", "Play", P("FOR", 11), 0.18, 0.28, { action: "wide", team: "FOR", source: "Play", origin: from("RESTART", "D-035") }],
  // Lost #6 (away's own puckout) → away goal.
  ["D-037", 2, 170, "RESTART", "OPP", "Break", P("OPP", 9), 0.45, 0.60, { action: "restart", owner: "OPP", winner: "OPP", method: "Break" }, "OPP"],
  ["D-038", 2, 190, "GOAL", "OPP", "Play", P("OPP", 15), 0.90, 0.50, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-037") }],
  // Lost #7 → home win the ball back and score (a turnover-origin home point).
  ["D-039", 2, 220, "RESTART", "OPP", "Clean", P("OPP", 8), 0.58, 0.62, { action: "restart", owner: "FOR", winner: "OPP", method: "Clean" }, "FOR"],
  ["D-040", 2, 250, "TURNOVER", "FOR", "Tackle", P("FOR", 5), 0.66, 0.50, { action: "turnover", winner: "FOR", loser: "OPP", method: "Tackle" }],
  ["D-041", 2, 270, "POINT", "FOR", "Play", P("FOR", 13), 0.20, 0.52, { action: "score", team: "FOR", source: "Play", origin: from("TURNOVER", "D-040") }],
  // Lost #8 (away's own puckout) → away wide.
  ["D-042", 2, 300, "RESTART", "OPP", "Clean", P("OPP", 8), 0.42, 0.50, { action: "restart", owner: "OPP", winner: "OPP", method: "Clean" }, "OPP"],
  ["D-043", 2, 320, "WIDE", "OPP", "Play", P("OPP", 14), 0.86, 0.70, { action: "wide", team: "OPP", source: "Play", origin: from("RESTART", "D-042") }],
  // Won #8 (home's own, from a foul) → home win a free in the same possession and miss it.
  ["D-044", 2, 350, "RESTART", "FOR", "Foul", P("FOR", 9), 0.60, 0.45, { action: "restart", owner: "FOR", winner: "FOR", method: "Foul" }, "FOR"],
  ["D-045", 2, 370, "FREE", "FOR", "Won", P("FOR", 11), 0.35, 0.50, { action: "free", awardedTo: "FOR" }],
  ["D-046", 2, 400, "WIDE", "FOR", "Free", P("FOR", 12), 0.30, 0.52, { action: "wide", team: "FOR", source: "Free", origin: from("FREE", "D-045"), placed: true }],
  // Lost #9 (home's own puckout) → away point.
  ["D-047", 2, 430, "RESTART", "OPP", "Clean", P("OPP", 8), 0.57, 0.58, { action: "restart", owner: "FOR", winner: "OPP", method: "Clean" }, "FOR"],
  ["D-048", 2, 450, "POINT", "OPP", "Play", P("OPP", 13), 0.84, 0.40, { action: "score", team: "OPP", source: "Play", origin: from("RESTART", "D-047") }],
];

const toStep = ([id, half, clock, family, row, tile, player, nx, ny, truth, owner]) => ({
  op: "tag",
  ev: { id, half, clock, family, ...(owner ? { owner } : {}), row, tile, player, nx, ny, truth },
});

const tags = [...H1, ...H2].map(toStep);
const steps = [...H1.map(toStep), { op: "halftime", clock: 2100 }, ...H2.map(toStep), { op: "fulltime", clock: 2100 }];
const reviewOps = [{ op: "edit", targetId: "D-032", newKind: "POINT", truthAfter: { action: "score", source: null } }];
const byFamily = {};
for (const s of tags) byFamily[s.ev.family] = (byFamily[s.ev.family] ?? 0) + 1;

const fixture = {
  matchId: "D",
  title: "Lab D — Hurling: lost-puckout player, unattributed score, restart net disadvantage",
  sport: "hurling",
  homeTeam: "Lab D Home",
  awayTeam: "Lab D Away",
  venue: "Synthetic Venue D",
  matchType: "Friendly",
  halfMinutes: 35,
  attackDirection: "right",
  squads: { FOR: squad("Home"), OPP: squad("Away") },
  steps,
  reviewOps,
  summary: { tagSteps: tags.length, liveEvents: tags.length, finalEventsAfterReviewOps: tags.length, byFamily },
};

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: gen-fixture-d.mjs <out-dir>");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "match-D.json"), JSON.stringify(fixture, null, 1));
console.log(`match D: ${tags.length} events, ${reviewOps.length} Review op`);
