// gen-fixture-ef.mjs — Golden Matches E (Ladies Football) and F (Camogie).
//
// Deterministic: the shared seeded simulator (gen-fixtures.mjs) plays the match; every
// rule-specific passage of play is a scripted scenario started at a possession boundary (so the
// possession chain stays coherent) and cites the official rule it represents
// (rules/sport-rules.json). Facts only — nothing here imports src/ or reflects what the app can
// currently record: an event the app does not offer stays in the fixture, and the laboratory
// reports that it could not be entered.
//
// Usage: node gen-fixture-ef.mjs <outDir>

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { simulate, insertAt, squad, applySubsAndDiscipline, finalize } from "./gen-fixtures.mjs";

const fortyFiveDist = 0.31;

// ─── Scenario building blocks (each ends the passage of play the way the simulator does) ───────

/** P shoots; the attempt is blocked out over the end line → a 45 to P. Returns the 45 award. */
function blockedTo45(s, shooter) {
  s.shot(s.P, "SHOT", "Block/Save", 0.12, { team: s.P, number: shooter });
  s.wait(8);
  const award = s.tag({ family: "FORTY_FIVE", row: s.P, tile: "Won", player: { team: s.P, number: shooter }, nx: s.attackNx(s.P, fortyFiveDist), ny: 0.5,
    truth: { action: "fortyFive", winner: s.P } });
  s.setPossession(s.P, { type: "FORTY_FIVE", id: award.id });
  s.wait(22);
  return award;
}
/** A free to P at distance d from the goal P attacks (home-perspective Won / Conceded row). */
function freeTo(s, d, note) {
  const ev = s.tag({ family: "FREE", row: "FOR", tile: s.P === "FOR" ? "Won" : "Conceded", player: null, nx: s.attackNx(s.P, d), ny: 0.5,
    truth: { action: "free", awardedTo: s.P, ...(note ? { note } : {}) } });
  s.setPossession(s.P, { type: "FREE", id: ev.id });
  s.wait(20);
  return ev;
}
/** After a score or wide by P, the defending team restarts (as the simulator does). */
const restart = (s) => s.kickout(s.D);

// ─── LGFA discipline consistency (Official Guide 2026 Rule 327) ───────────────────────────────

/**
 * A first Yellow sends the player off for 10 minutes of playing time — carried across half-time —
 * and a second Yellow or a Red dismisses her. The sanctioned player is never tagged while off; the
 * action is credited to a team-mate on the field (deterministic choice).
 */
function lgfaDiscipline(steps, halfEnd1, sinBinSeconds) {
  const tags = () => steps.filter((s) => s.op === "tag");
  const abs = (ev) => (ev.half === 2 ? halfEnd1 : 0) + ev.clock; // playing time from the throw-in
  const yellows = new Map();
  for (const s of tags().filter((x) => x.ev.family === "DISCIPLINE" && x.ev.player)) {
    const key = `${s.ev.player.team}#${s.ev.player.number}`;
    const n = s.ev.tile === "Yellow" ? (yellows.get(key) ?? 0) + 1 : 0;
    if (s.ev.tile === "Yellow") yellows.set(key, n);
    const start = abs(s.ev);
    const until = s.ev.tile === "Red" || n >= 2 ? Infinity : n === 1 ? start + sinBinSeconds : -1;
    if (until < 0) continue;
    const { team, number } = s.ev.player;
    const alt = number === 9 ? 8 : 9;
    for (const t of tags()) {
      if (t === s || !t.ev.player || t.ev.player.team !== team || t.ev.player.number !== number || t.ev.family === "DISCIPLINE") continue;
      const at = abs(t.ev);
      if (at > start && at < until) t.ev.player = { team, number: alt };
    }
  }
}

/** Lifecycle steps (as in match B): two corrected taps (undo), a pause, a reload and an app closure. */
function addLifecycle(steps) {
  const tags = () => steps.filter((s) => s.op === "tag" && !s.ev.erroneous);
  const injectBefore = (target, wrong) => {
    const idx = steps.findIndex((s) => s.op === "tag" && s.ev.id === target.id);
    const wrongEv = { ...target, ...wrong, id: `${target.id}-WRONG`, erroneous: true };
    steps.splice(idx, 0, { op: "tag", ev: wrongEv }, { op: "undo", undoes: wrongEv.id });
  };
  const after = (ev, op) => steps.splice(steps.findIndex((s) => s.op === "tag" && s.ev.id === ev.id) + 1, 0, op);
  const pick = (pred, nth) => tags().filter((s) => pred(s.ev))[nth].ev;
  injectBefore(pick((e) => e.family === "POINT" && e.row === "FOR" && e.tile === "Play", 1), { row: "OPP", player: null });
  injectBefore(pick((e) => e.family === "TURNOVER", 6), { family: "FREE", row: "FOR", tile: "Won" });
  after(tags()[25].ev, { op: "pause", realSeconds: 120 });
  after(tags()[50].ev, { op: "reload" });
  const second = tags().filter((s) => s.ev.half === 2);
  after(second[25].ev, { op: "close" });
}

// ─── Golden Match E — Ladies Football (LGFA 2026 as amended 15 April 2026) ─────────────────────

function matchE() {
  const score = (s, family, tile, d, number, note) => s.shot(s.P, family, tile, d, { team: s.P, number }, { note, ...(tile !== "Play" ? { placed: true } : {}) });
  const scenarios = [
    { name: "fisted point from outside the arc", half: 1, at: 400, team: "FOR", run: (s) => {
      score(s, "POINT", "Play", 0.33, 12, "fisted over from outside the 40m arc — not 'kicked', so 1 point (Motion 3)"); restart(s); } },
    { name: "kick-out mark → 2 points", half: 1, at: 700, team: "OPP", run: (s) => {
      s.shot(s.P, "WIDE", "Play", 0.2, { team: s.P, number: 15 }); s.wait(25);
      // The defending team (D) kicks out; P's #8 catches it cleanly past the 40m arc — a kick-out mark.
      const ko = s.tag({ family: "RESTART", owner: s.D, row: s.P, tile: "Clean", player: { team: s.P, number: 8 }, nx: s.ownNx(s.D, 0.32), ny: 0.5,
        truth: { action: "restart", owner: s.D, winner: s.P, method: "Clean", note: "clean catch on/past the 40m arc — kick-out mark (Motion 1)" } });
      s.setPossession(s.P, { type: "RESTART", id: ko.id }); s.wait(15);
      s.tag({ family: "TWO_POINT", row: s.P, tile: "Mark", player: { team: s.P, number: 8 }, nx: s.ownNx(s.D, 0.32), ny: 0.5,
        truth: { action: "score", team: s.P, source: "Mark", origin: s.origin(), placed: true, note: "kick-out mark free from the hands, outside the attacking 40m arc → 2 points (Motions 1, 3)" } });
      restart(s); } },
    { name: "45 played again by a team-mate → 1 point", half: 1, at: 1000, team: "FOR", run: (s) => {
      blockedTo45(s, 14); score(s, "POINT", "45", 0.2, 15, "45 played again by a team-mate, then over → 1 point (Motion 11)"); restart(s); } },
    { name: "foul on a 45 → free from the arc → 2 points", half: 1, at: 1180, team: "OPP", run: (s) => {
      blockedTo45(s, 14); freeTo(s, fortyFiveDist, "the 45 was fouled — free with the option of the 40m arc (Motion 11)");
      score(s, "TWO_POINT", "Free", 0.29, 13, "free taken from the 40m arc after a foul on the 45 → 2 points (Motion 11)"); restart(s); } },
    { name: "penalty goal", half: 2, at: 180, team: "FOR", run: (s) => {
      freeTo(s, 0.08, "foul in the large rectangle — penalty (Rule 425)"); score(s, "GOAL", "Penalty", 0.08, 14, "penalty from 11 m (Rule 426)"); restart(s); } },
    { name: "penalty point (1, never 2)", half: 2, at: 480, team: "OPP", run: (s) => {
      freeTo(s, 0.08, "penalty awarded (Rule 425)"); score(s, "POINT", "Penalty", 0.08, 14, "penalty put over the bar from 11 m — 1 point, never 2 (Rule 426)"); restart(s); } },
    { name: "kick-out mark free wide", half: 2, at: 620, team: "FOR", run: (s) => {
      s.shot(s.P, "WIDE", "Play", 0.22, { team: s.P, number: 13 }); s.wait(25);
      const ko = s.tag({ family: "RESTART", owner: s.D, row: s.P, tile: "Clean", player: { team: s.P, number: 9 }, nx: s.ownNx(s.D, 0.33), ny: 0.45,
        truth: { action: "restart", owner: s.D, winner: s.P, method: "Clean", note: "kick-out mark (Motion 1)" } });
      s.setPossession(s.P, { type: "RESTART", id: ko.id }); s.wait(15);
      s.tag({ family: "WIDE", row: s.P, tile: "Mark", player: { team: s.P, number: 9 }, nx: s.ownNx(s.D, 0.33), ny: 0.45,
        truth: { action: "wide", team: s.P, source: "Mark", origin: s.origin(), placed: true, note: "kick-out mark free missed" } });
      restart(s); } },
    { name: "solo-and-go from outside the arc → 2 points", half: 2, at: 1080, team: "FOR", run: (s) => {
      freeTo(s, 0.3, "free — taken as a solo-and-go (Motion 5)"); score(s, "TWO_POINT", "Free", 0.3, 11, "solo-and-go from outside the 40m arc → 2 points (Motions 3, 5)"); restart(s); } },
    { name: "team-official misconduct free from the arc apex → 2 points", half: 2, at: 1300, team: "OPP", run: (s) => {
      freeTo(s, 0.09, "team-official misconduct — free on the 13 m line or from the apex of the 40m arc (Motion 6)");
      score(s, "TWO_POINT", "Free", 0.286, 13, "taken from the apex of the 40m arc → 2 points (Motion 6)"); restart(s); } },
    { name: "45 directly over → 2 points", half: 2, at: 1380, team: "FOR", run: (s) => {
      blockedTo45(s, 15); score(s, "TWO_POINT", "45", fortyFiveDist, 11, "45m kick off the ground directly over → 2 points (Motion 11)"); restart(s); } },
    { name: "45 bounced over, no team-mate touch → 2 points", half: 2, at: 1540, team: "OPP", run: (s) => {
      blockedTo45(s, 15); score(s, "TWO_POINT", "45", fortyFiveDist, 13, "45m kick bounced over with no team-mate touch → 2 points (Motion 11)"); restart(s); } },
    { name: "free from the 13 m line → 1 point", half: 1, at: 1450, team: "FOR", run: (s) => {
      freeTo(s, 0.09); score(s, "POINT", "Free", 0.09, 11, "free from the 13 m line → 1 point"); restart(s); } },
  ];
  const cfg = {
    prefix: "E", seed: 20261110, sport: "ladies_football", attackDirection: "right", halfMinutes: 30,
    gap: [16, 42], kickoutDelay: [22, 35],
    unknownPlayerP: 0.04, unknownKickoutP: 0.1,
    ownRetention: { FOR: 0.62, OPP: 0.6 },
    placedConv: { FOR: 0.75, OPP: 0.72 },
    freeTaker: { FOR: 11, OPP: 13 },
    p: { turnover: 28, free: 22, sideline: 4, shot: 50, goal: 6, point: 46, two: 6, wide: 24, short: 5, block: 10, post: 3 },
    cards: {},
    extras: [],
    scenarios,
  };
  const steps = simulate(cfg);
  const card = (half, clock, team, tile, number, note) => insertAt(steps, "E", half, clock, {
    family: "DISCIPLINE", row: team, tile, player: { team, number }, nx: 0.5, ny: 0.45, truth: { action: "card", team, card: tile, note } });
  card(1, 600, "OPP", "Yellow", 4, "first yellow = 10-minute sin bin (Rule 327)");
  card(1, 1620, "FOR", "Yellow", 6, "first yellow at 27:00 — the sin bin carries into the second half (Rule 327: playing time)");
  card(2, 900, "FOR", "Yellow", 6, "second yellow → dismissed (Rule 327)");
  card(2, 903, "FOR", "Red", 6, "the red shown after the second yellow, recorded explicitly — one dismissal, not two");
  card(2, 1200, "OPP", "Yellow", 4, "second yellow, no red recorded → still a dismissal (Rule 327)");
  card(2, 1500, "OPP", "Red", 12, "direct red");

  applySubsAndDiscipline(steps, [
    { half: 1, clock: 1500, team: "OPP", out: 5, in: 19 },
    { half: 2, clock: 300, team: "FOR", out: 10, in: 16 },
    { half: 2, clock: 700, team: "OPP", out: 9, in: 18 },
    { half: 2, clock: 1000, team: "FOR", out: 13, in: 17 },
  ], 600);
  lgfaDiscipline(steps, steps.find((s) => s.op === "halftime").clock, 600);
  addLifecycle(steps);

  const tags = steps.filter((s) => s.op === "tag" && !s.ev.erroneous);
  const firstOf = (pred) => tags.find((s) => pred(s.ev)).ev;
  const reviewOps = [
    { op: "edit", targetId: firstOf((e) => e.family === "WIDE" && e.row === "FOR" && e.tile === "Play" && e.half === 2).id, newKind: "POINT", truthAfter: { action: "score", source: "Play" } },
    { op: "edit", targetId: firstOf((e) => e.family === "RESTART" && e.owner === "FOR" && e.row === "FOR" && e.half === 2).id, newKind: "KICKOUT_CONCEDED", clearPlayer: true, truthAfter: { action: "restart", winner: "OPP" } },
    { op: "edit", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "FOR" && e.half === 1 && e.player).id, newKind: "TURNOVER_LOST", truthAfter: { action: "turnover", winner: "OPP" } },
    { op: "edit", targetId: firstOf((e) => e.family === "FREE" && e.tile === "Won" && e.half === 2).id, newKind: "FREE_CONCEDED", truthAfter: { action: "free", awardedTo: "OPP" } },
    { op: "edit", targetId: firstOf((e) => e.family === "POINT" && e.row === "OPP" && e.tile === "Play" && e.half === 1).id, newKind: "WIDE", truthAfter: { action: "wide" } },
    { op: "edit", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "OPP" && e.half === 2 && e.player).id, newKind: "TURNOVER_WON", truthAfter: { action: "turnover", winner: "FOR" } },
    { op: "delete", targetId: firstOf((e) => e.family === "SIDELINE").id },
    // Probes — must change nothing. A penalty can never be a two-pointer (Rule 426) and there is no
    // separate sin-bin sanction (Rule 327): neither may be offered by Review Edit.
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "POINT" && e.tile === "Penalty").id, attemptKinds: ["TWO_POINTER"], rule: "Rule 426" },
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "DISCIPLINE" && e.tile === "Yellow").id, attemptKinds: ["SIN_BIN"], rule: "Rule 327" },
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "OPP").id, attemptKinds: ["POINT", "GOAL", "WIDE", "FREE_WON", "KICKOUT_WON"] },
  ];

  return {
    matchId: "E",
    title: "Golden Match E — Ladies Football: senior adult club championship (LGFA Official Guide 2026 as amended at Special Congress, 15 April 2026)",
    sport: "ladies_football",
    homeTeam: "Lab E Home", awayTeam: "Lab E Away", venue: "Synthetic Venue E",
    matchType: "Championship", halfMinutes: 30, attackDirection: "right",
    squads: {
      FOR: squad(Array.from({ length: 20 }, (_, i) => `E Home ${i + 1}`)),
      OPP: squad(Array.from({ length: 20 }, (_, i) => `E Away ${i + 1}`)),
    },
    steps,
    reviewOps,
  };
}

// ─── Golden Match F — Camogie (Official Guide 2025, standard playing rules) ──────────────────────

function matchF() {
  const sideline = (family, tile, number, d, ny, note) => (s) => {
    const award = s.tag({ family: "SIDELINE", row: s.P, tile: "Won", player: { team: s.P, number }, nx: s.attackNx(s.P, d), ny,
      truth: { action: "sideline", winner: s.P } });
    s.setPossession(s.P, { type: "SIDELINE", id: award.id }); s.wait(15);
    s.tag({ family, row: s.P, tile, player: { team: s.P, number }, nx: s.attackNx(s.P, d), ny,
      truth: { action: family === "WIDE" ? "wide" : "score", team: s.P, source: "Sideline", origin: s.origin(), placed: true, note } });
    restart(s);
  };
  const scenarios = [
    { name: "sideline puck directly over → 2 points", half: 1, at: 380, team: "FOR", run: sideline("TWO_POINT", "Sideline", 12, 0.22, 0.03, "sideline puck directly over, untouched in flight → 2 points (Rule 15.4)") },
    { name: "sideline puck wide", half: 1, at: 880, team: "OPP", run: sideline("WIDE", "Sideline", 10, 0.25, 0.97, "sideline puck wide — one missed placed-ball attempt (Rule 11.3)") },
    { name: "sideline puck touched in flight → 1 point", half: 1, at: 1280, team: "OPP", run: sideline("POINT", "Sideline", 10, 0.2, 0.96, "sideline puck touched in flight, then over → 1 point (Rule 15.4)") },
    { name: "45-metre free wide", half: 1, at: 1580, team: "FOR", run: (s) => {
      blockedTo45(s, 12); s.shot(s.P, "WIDE", "45", fortyFiveDist, { team: s.P, number: 12 }, { placed: true, note: "45-metre free wide (Rule 11.14)" }); restart(s); } },
    { name: "sideline puck directly over → 2 points (second half)", half: 2, at: 280, team: "OPP", run: sideline("TWO_POINT", "Sideline", 10, 0.18, 0.04, "sideline puck directly over → 2 points (Rule 15.4)") },
    { name: "sideline puck wide (second half)", half: 2, at: 780, team: "FOR", run: sideline("WIDE", "Sideline", 12, 0.24, 0.97, "sideline puck wide (Rule 11.3)") },
    { name: "penalty goal", half: 2, at: 1180, team: "FOR", run: (s) => {
      freeTo(s, 0.06, "foul in the large parallelogram — penalty (Rule 11.13)");
      s.shot(s.P, "GOAL", "Penalty", 0.06, { team: s.P, number: 12 }, { placed: true }); restart(s); } },
    { name: "45-metre free over the bar → 1 point", half: 2, at: 1580, team: "OPP", run: (s) => {
      blockedTo45(s, 10); s.shot(s.P, "POINT", "45", fortyFiveDist, { team: s.P, number: 10 }, { placed: true, note: "45-metre free over the bar — 1 point (Rule 11.14)" }); restart(s); } },
  ];
  const cfg = {
    prefix: "F", seed: 20261111, sport: "camogie", attackDirection: "left", halfMinutes: 30,
    gap: [14, 36], kickoutDelay: [18, 30],
    unknownPlayerP: 0.05, unknownKickoutP: 0.12,
    ownRetention: { FOR: 0.6, OPP: 0.6 },
    placedConv: { FOR: 0.8, OPP: 0.78 },
    freeTaker: { FOR: 12, OPP: 10 },
    p: { turnover: 28, free: 16, sideline: 4, shot: 52, goal: 5, point: 54, wide: 26, short: 5, block: 7, post: 2 },
    cards: {},
    extras: [],
    scenarios,
  };
  const steps = simulate(cfg);
  const card = (half, clock, team, tile, number, note) => insertAt(steps, "F", half, clock, {
    family: "DISCIPLINE", row: team, tile, player: { team, number }, nx: 0.5, ny: 0.45, truth: { action: "card", team, card: tile, note } });
  card(1, 700, "FOR", "Yellow", 7, "first offence — yellow card warning, no time off (Rule 10)");
  card(2, 600, "FOR", "Yellow", 7, "second offence — second yellow …");
  card(2, 603, "FOR", "Red", 7, "… followed by a red card and dismissal (Rule 10)");
  card(2, 1400, "OPP", "Red", 6, "direct red");

  applySubsAndDiscipline(steps, [
    { half: 1, clock: 1500, team: "OPP", out: 5, in: 18 },
    { half: 2, clock: 400, team: "FOR", out: 11, in: 16 },
    { half: 2, clock: 1000, team: "OPP", out: 14, in: 19 },
    { half: 2, clock: 1300, team: "FOR", out: 13, in: 17 },
  ], 600);
  addLifecycle(steps);

  const tags = steps.filter((s) => s.op === "tag" && !s.ev.erroneous);
  const firstOf = (pred) => tags.find((s) => pred(s.ev)).ev;
  const reviewOps = [
    { op: "edit", targetId: firstOf((e) => e.family === "WIDE" && e.row === "FOR" && e.tile === "Play" && e.half === 2).id, newKind: "POINT", truthAfter: { action: "score", source: "Play" } },
    { op: "edit", targetId: firstOf((e) => e.family === "RESTART" && e.owner === "OPP" && e.row === "OPP" && e.half === 1 && e.player).id, newKind: "KICKOUT_CONCEDED", clearPlayer: true, truthAfter: { action: "restart", winner: "FOR" } },
    { op: "edit", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "FOR" && e.half === 2 && e.player).id, newKind: "TURNOVER_LOST", truthAfter: { action: "turnover", winner: "OPP" } },
    { op: "edit", targetId: firstOf((e) => e.family === "FREE" && e.tile === "Conceded" && e.half === 1).id, newKind: "FREE_WON", truthAfter: { action: "free", awardedTo: "FOR" } },
    { op: "edit", targetId: firstOf((e) => e.family === "POINT" && e.row === "OPP" && e.tile === "Play" && e.half === 2).id, newKind: "WIDE", truthAfter: { action: "wide" } },
    { op: "edit", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "OPP" && e.half === 1 && e.player).id, newKind: "TURNOVER_WON", truthAfter: { action: "turnover", winner: "FOR" } },
    { op: "delete", targetId: firstOf((e) => e.family === "WIDE" && e.row === "OPP" && e.tile === "Play" && e.half === 1).id },
    // Probes — must change nothing. Only a sideline score can be worth two (Rule 15.4), and camogie
    // has no sin bin (standard rules).
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "POINT" && e.tile === "Play" && e.row === "FOR").id, attemptKinds: ["TWO_POINTER", "FORTY_FIVE_TWO_POINT"], rule: "Rule 15.4" },
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "DISCIPLINE" && e.tile === "Yellow").id, attemptKinds: ["SIN_BIN"], rule: "standard rules: no sin bin" },
    { op: "probe", expect: "notOffered", targetId: firstOf((e) => e.family === "FORTY_FIVE").id, attemptKinds: ["FORTY_FIVE_CONCEDED", "POINT"] },
  ];

  return {
    matchId: "F",
    title: "Golden Match F — Camogie: senior adult club championship (Camogie Official Guide 2025, standard playing rules)",
    sport: "camogie",
    homeTeam: "Lab F Home", awayTeam: "Lab F Away", venue: "Synthetic Venue F",
    matchType: "Championship", halfMinutes: 30, attackDirection: "left",
    squads: {
      FOR: squad(Array.from({ length: 20 }, (_, i) => `F Home ${i + 1}`)),
      OPP: squad(Array.from({ length: 20 }, (_, i) => `F Away ${i + 1}`)),
    },
    steps,
    reviewOps,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  mkdirSync(out, { recursive: true });
  for (const m of [matchE(), matchF()]) {
    finalize(m);
    writeFileSync(`${out}/match-${m.matchId}.json`, JSON.stringify(m, null, 1));
    console.log(m.matchId, JSON.stringify(m.summary));
  }
}
