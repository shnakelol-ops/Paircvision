// gen-fixtures.mjs — deterministic synthetic championship matches for the
// Event Stats ultra test.
//
// Each fixture is a *UI script*: the exact sequence of taps a coach would make
// in Event Stats (family tile, row, owner toggle, player, pitch location),
// plus lifecycle operations (half-time, pause, reload, undo, review edits).
// It is independent of PáircVision's code: nothing here imports from src/.
//
// Every tagged event carries `truth` — the real-world fact the tap encodes
// (who acted, what happened, and the true origin of the possession it sits
// in). The reference calculator reads facts, never production kinds.
//
// Usage: node gen-fixtures.mjs <outDir>

import { writeFileSync, mkdirSync } from "node:fs";

// ─── Deterministic PRNG ──────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(r, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of entries) {
    if ((x -= w) < 0) return v;
  }
  return entries[entries.length - 1][0];
}
const between = (r, lo, hi) => lo + (hi - lo) * r();
const ibetween = (r, lo, hi) => Math.floor(between(r, lo, hi + 1));
const round3 = (v) => Math.round(v * 1000) / 1000;
const other = (t) => (t === "FOR" ? "OPP" : "FOR");

// ─── Match simulator ────────────────────────────────────────────────────────

function simulate(cfg) {
  const r = mulberry32(cfg.seed);
  const hurling = cfg.sport === "hurling";
  const steps = [];
  let seq = 0;
  const nextId = () => `${cfg.prefix}-${String(++seq).padStart(3, "0")}`;

  // FOR attacks high nx in 1H when direction is "right".
  const attacksHigh = (team, half) => {
    const forHigh = cfg.attackDirection === "right" ? half === 1 : half === 2;
    return team === "FOR" ? forHigh : !forHigh;
  };
  // d = distance from the goal `team` is attacking, as a fraction of pitch length.
  const attackNx = (team, half, d) => round3(attacksHigh(team, half) ? 1 - d : d);
  const ownNx = (team, half, d) => round3(attacksHigh(team, half) ? d : 1 - d);
  const centralNy = () => round3(between(r, 0.22, 0.78));

  const unknownP = cfg.unknownPlayerP;
  const playerOf = (team, pool, unknownOverride) => {
    if (r() < (unknownOverride ?? unknownP)) return null;
    return { team, number: weighted(r, pool) };
  };
  const FWD = [[10, 1], [11, 2], [12, 1], [13, 2], [14, 3], [15, 3], [8, 1], [9, 1]];
  const GOALSCORERS = [[13, 2], [14, 3], [15, 2], [11, 1]];
  const MID = [[8, 3], [9, 3], [11, 1], [12, 1], [10, 1]];
  const DEF = [[2, 1], [3, 2], [4, 1], [5, 2], [6, 2], [7, 2], [8, 1], [9, 1]];
  const ANY = [[2, 1], [4, 1], [6, 1], [8, 2], [9, 2], [10, 1], [11, 2], [12, 1], [13, 1], [14, 1]];
  const freeTaker = (team) => ({ team, number: team === "FOR" ? cfg.freeTaker.FOR : cfg.freeTaker.OPP });

  function tag(half, clock, ev) {
    const step = { op: "tag", ev: { id: nextId(), half, clock, ...ev } };
    steps.push(step);
    return step.ev;
  }

  for (const half of [1, 2]) {
    const halfLen = cfg.halfMinutes * 60;
    let t = ibetween(r, 15, 30);
    let poss = r() < 0.5 ? "FOR" : "OPP";
    let origin = { type: "THROW_IN", id: null };
    let cardBudget = [...(cfg.cards[half] ?? [])];

    const gap = () => ibetween(r, cfg.gap[0], cfg.gap[1]);

    function kickout(owner) {
      t += ibetween(r, cfg.kickoutDelay[0], cfg.kickoutDelay[1]);
      const retained = r() < cfg.ownRetention[owner];
      const winner = retained ? owner : other(owner);
      const tile = retained
        ? weighted(r, [["Clean", 55], ["Break", 35], ["Foul", 10]])
        : weighted(r, [["Clean", 30], ["Break", 55], ["Foul", 15]]);
      const d = between(r, 0.18, 0.5);
      const ev = tag(half, t, {
        family: "RESTART", owner, row: winner, tile,
        player: playerOf(winner, MID, cfg.unknownKickoutP),
        nx: ownNx(owner, half, d), ny: centralNy(),
        truth: { action: "restart", owner, winner, method: tile },
      });
      poss = winner;
      origin = { type: "RESTART", id: ev.id };
    }

    function shotFrom(team, family, tile, d, player, extraTruth) {
      return tag(half, t, {
        family, row: team, tile, player,
        nx: attackNx(team, half, d), ny: centralNy(),
        truth: { action: family === "WIDE" ? "wide" : family === "SHOT" ? "shot" : "score", team, source: tile, origin: { ...origin }, ...extraTruth },
      });
    }

    while (t < halfLen - 40) {
      t += gap();
      if (t >= halfLen - 20) break;
      const P = poss, D = other(P);
      const roll = weighted(r, [
        ["turnover", cfg.p.turnover],
        ["free", cfg.p.free],
        ["sideline", cfg.p.sideline],
        ["shot", cfg.p.shot],
      ]);

      if (roll === "turnover") {
        const method = P === "FOR"
          ? weighted(r, [["HP Error", 3], ["KP Error", 3], ["Tackle", 3], ["Interception", 2], ["Overcarried", 1]])
          : weighted(r, [["Tackle", 4], ["Interception", 3], ["HP Error", 2], ["KP Error", 2], ["Overcarried", 1]]);
        // Event Stats turnover rows: FOR row = we won it, OPP row = we lost it; both tag OUR player.
        const row = P === "FOR" ? "OPP" : "FOR";
        const ev = tag(half, t, {
          family: "TURNOVER", row, tile: method,
          player: playerOf("FOR", P === "FOR" ? FWD : DEF),
          nx: round3(between(r, 0.12, 0.88)), ny: centralNy(),
          truth: { action: "turnover", winner: D, loser: P, method },
        });
        poss = D;
        origin = { type: "TURNOVER", id: ev.id };
        continue;
      }

      if (roll === "sideline") {
        const awarded = r() < 0.5 ? P : D;
        const ev = tag(half, t, {
          family: "SIDELINE", row: awarded, tile: "Won",
          player: playerOf(awarded, ANY),
          nx: round3(between(r, 0.2, 0.8)), ny: r() < 0.5 ? 0.02 : 0.98,
          truth: { action: "sideline", winner: awarded },
        });
        poss = awarded;
        origin = { type: "SIDELINE", id: ev.id };
        continue;
      }

      if (roll === "free") {
        const fouled = P;
        const d = between(r, 0.12, hurling ? 0.6 : 0.55);
        // Event Stats records frees from the home perspective only: Won / Conceded.
        const ev = tag(half, t, {
          family: "FREE", row: "FOR", tile: fouled === "FOR" ? "Won" : "Conceded",
          player: playerOf("FOR", fouled === "FOR" ? FWD : DEF),
          nx: attackNx(fouled, half, d), ny: centralNy(),
          truth: { action: "free", awardedTo: fouled },
        });
        origin = { type: "FREE", id: ev.id };
        // Card for the fouling team, when scripted.
        const ci = cardBudget.findIndex((c) => c.team === D && t >= c.after);
        if (ci >= 0) {
          const card = cardBudget.splice(ci, 1)[0];
          t += 3;
          tag(half, t, {
            family: "DISCIPLINE", row: D, tile: card.tile,
            player: { team: D, number: card.number },
            nx: ev.nx, ny: ev.ny,
            truth: { action: "card", team: D, card: card.tile },
          });
        }
        const inRange = d < (hurling ? 0.5 : 0.33);
        if (inRange) {
          t += ibetween(r, 20, 35);
          const scored = r() < cfg.placedConv[fouled];
          const twoPt = !hurling && d > 0.28;
          if (scored) {
            shotFrom(fouled, twoPt ? "TWO_POINT" : "POINT", "Free", d, freeTaker(fouled), { placed: true });
          } else {
            shotFrom(fouled, "WIDE", "Free", d, freeTaker(fouled), { placed: true });
          }
          kickout(other(fouled));
        }
        continue;
      }

      // Shot from play.
      const outcome = weighted(r, [
        ["goal", cfg.p.goal], ["point", cfg.p.point], ...(hurling ? [] : [["two", cfg.p.two]]),
        ["wide", cfg.p.wide], ["Short", cfg.p.short], ["Block/Save", cfg.p.block], ["Post", cfg.p.post],
      ]);
      if (outcome === "goal") {
        shotFrom(P, "GOAL", "Play", between(r, 0.02, 0.09), playerOf(P, GOALSCORERS));
        kickout(D);
      } else if (outcome === "point") {
        shotFrom(P, "POINT", "Play", between(r, 0.08, hurling ? 0.45 : 0.27), playerOf(P, FWD));
        kickout(D);
      } else if (outcome === "two") {
        shotFrom(P, "TWO_POINT", "Play", between(r, 0.29, 0.34), playerOf(P, FWD));
        kickout(D);
      } else if (outcome === "wide") {
        shotFrom(P, "WIDE", "Play", between(r, 0.08, hurling ? 0.45 : 0.32), playerOf(P, FWD));
        kickout(D);
      } else if (outcome === "Block/Save" || outcome === "Short" || outcome === "Post") {
        shotFrom(P, "SHOT", outcome, between(r, 0.05, 0.3), playerOf(P, FWD));
        if (outcome === "Block/Save" && r() < 0.5) {
          // Deflected out → 45 (football) / 65 (hurling) to the attackers.
          t += ibetween(r, 5, 12);
          const fortyFive = hurling ? "65" : "45";
          const dist = hurling ? 0.45 : 0.31;
          const awardEv = tag(half, t, {
            family: "FORTY_FIVE", row: P, tile: "Won",
            player: playerOf(P, FWD),
            nx: attackNx(P, half, dist), ny: 0.5,
            truth: { action: "fortyFive", winner: P },
          });
          origin = { type: "FORTY_FIVE", id: awardEv.id };
          t += ibetween(r, 20, 35);
          if (r() < cfg.placedConv[P]) {
            shotFrom(P, hurling ? "POINT" : "TWO_POINT", fortyFive, dist, freeTaker(P), { placed: true });
          } else {
            shotFrom(P, "WIDE", fortyFive, dist, freeTaker(P), { placed: true });
          }
          kickout(D);
        } else if (outcome === "Post" && r() < 0.5) {
          // Rebound stays with the attackers — same possession continues.
        } else {
          poss = D;
          origin = { type: "OTHER", id: null };
        }
      }
    }

    // Scripted extra events for this half (penalty goals, marks, extra cards).
    for (const extra of cfg.extras.filter((e) => e.half === half)) {
      void extra; // extras are inserted by insertExtras below
    }
    steps.push({ op: half === 1 ? "halftime" : "fulltime", clock: Math.max(t + 20, halfLen) });
  }
  return steps;
}

// Inserts a scripted event at a given clock (kept in clock order). Used for rare
// facts the random model would not reliably produce (penalties, marks, cards).
function insertAt(steps, prefix, half, clock, ev) {
  const id = `${prefix}-X${String(steps.filter((s) => s.ev?.id?.includes("-X")).length + 1).padStart(2, "0")}`;
  const step = { op: "tag", ev: { id, half, clock, ...ev } };
  let idx = steps.findIndex((s) => (s.op === "tag" && s.ev.half === half && s.ev.clock > clock) || (s.op === "halftime" && half === 1) || (s.op === "fulltime" && half === 2));
  if (idx < 0) idx = steps.length;
  // Avoid clock collisions with neighbours.
  steps.splice(idx, 0, step);
  return step.ev;
}

function squad(names) {
  return Array.from({ length: 20 }, (_, i) => ({ number: i + 1, name: names[i] ?? "" }));
}

// ─── Match A — Football, realistic championship ─────────────────────────────

function matchA() {
  const cfg = {
    prefix: "A", seed: 20261023, sport: "football", attackDirection: "right", halfMinutes: 35,
    gap: [14, 40], kickoutDelay: [22, 35],
    unknownPlayerP: 0.04, unknownKickoutP: 0.1,
    ownRetention: { FOR: 0.66, OPP: 0.58 },
    placedConv: { FOR: 0.78, OPP: 0.7 },
    freeTaker: { FOR: 11, OPP: 14 },
    p: { turnover: 28, free: 22, sideline: 4, shot: 50, goal: 6, point: 46, two: 7, wide: 24, short: 5, block: 10, post: 3 },
    cards: {
      1: [{ team: "OPP", tile: "Yellow", number: 6, after: 900 }],
      2: [{ team: "FOR", tile: "Yellow", number: 3, after: 300 }, { team: "OPP", tile: "Sin Bin", number: 9, after: 1200 }],
    },
    extras: [],
  };
  const steps = simulate(cfg);
  // Scripted rare facts.
  insertAt(steps, "A", 1, 1111, {
    family: "POINT", row: "FOR", tile: "Mark", player: { team: "FOR", number: 11 },
    nx: 0.72, ny: 0.5, truth: { action: "score", team: "FOR", source: "Mark", placed: true, origin: { type: "OTHER", id: null } },
  });
  insertAt(steps, "A", 2, 1503, {
    family: "GOAL", row: "OPP", tile: "Penalty", player: { team: "OPP", number: 14 },
    nx: 0.92, ny: 0.5, truth: { action: "score", team: "OPP", source: "Penalty", placed: true, origin: { type: "OTHER", id: null } },
  });
  return {
    matchId: "A",
    title: "Match A — Football: Realistic Championship",
    sport: "football",
    homeTeam: "Ballyboden", awayTeam: "Na Fianna", venue: "Parnell Park",
    matchType: "Championship", halfMinutes: 35, attackDirection: "right",
    squads: {
      FOR: squad(["Paddy Durcan", "Darragh Ryan", "Eoin O'Hara", "Ross Kelly", "Ciaran Hogan", "Alan Byrne", "Shane Clarke", "Brian Fenton", "Cian Murphy", "Ronan Doyle", "Conor Keane", "Sean Bugler", "Aaron Lyons", "Colm Basquel", "Dara Kearns", "Luke Ward", "Niall Coakley", "Rob McDaid", "Ian Kelly", "Tom Rice"]),
      OPP: squad(["Mark Gaffney", "Ger Brennan", "Joe Fogarty", "Kev Doran", "Jack Walsh", "Liam Hayes", "Matt Ryan", "Gareth Quinn", "Ciaran Dowd", "Eoin Lowry", "Tom Kelly", "Paul Kirwan", "Dan Byrne", "Sam Hughes", "Kieran Mahon", "Ed Nolan", "Fergal Tuite", "Hugh Doyle", "Pat Lyons", "Dave Shiels"]),
    },
    steps,
    reviewOps: [],
  };
}

// ─── Match B — Football, extreme stress test ────────────────────────────────

function matchB() {
  const cfg = {
    prefix: "B", seed: 4242, sport: "football", attackDirection: "left", halfMinutes: 35,
    gap: [4, 15], kickoutDelay: [12, 25],
    unknownPlayerP: 0.3, unknownKickoutP: 0.45,
    ownRetention: { FOR: 0.52, OPP: 0.5 },
    placedConv: { FOR: 0.7, OPP: 0.66 },
    freeTaker: { FOR: 12, OPP: 11 },
    p: { turnover: 44, free: 16, sideline: 5, shot: 35, goal: 6, point: 40, two: 8, wide: 30, short: 6, block: 8, post: 4 },
    cards: {
      1: [{ team: "OPP", tile: "Yellow", number: 4, after: 400 }, { team: "FOR", tile: "Yellow", number: 7, after: 700 }],
      2: [{ team: "OPP", tile: "Red", number: 4, after: 600 }, { team: "FOR", tile: "Sin Bin", number: 5, after: 900 }],
    },
    extras: [],
  };
  const steps = simulate(cfg);
  const tags = () => steps.filter((s) => s.op === "tag");
  const byIndex = (i) => tags()[i].ev;

  // ── Live corrections (entered and undone through the real ↩ button) ──
  // Each erroneous tap is immediately undone, then the correct event is tagged.
  const injectBefore = (targetEv, wrong) => {
    const idx = steps.findIndex((s) => s.op === "tag" && s.ev.id === targetEv.id);
    const wrongEv = { ...targetEv, ...wrong, id: `${targetEv.id}-WRONG`, erroneous: true };
    steps.splice(idx, 0, { op: "tag", ev: wrongEv }, { op: "undo", undoes: wrongEv.id });
  };
  const pickKind = (pred, nth) => tags().filter((s) => pred(s.ev))[nth].ev;
  // 1. Wrong team attribution on a score → undo → correct team.
  injectBefore(pickKind((e) => e.family === "POINT" && e.row === "FOR", 2), { row: "OPP", player: null });
  injectBefore(pickKind((e) => e.family === "POINT" && e.row === "OPP", 5), { row: "FOR", player: null });
  // 2. Wrong restart ownership → undo → correct owner.
  injectBefore(pickKind((e) => e.family === "RESTART" && e.owner === "OPP", 3), { owner: "FOR" });
  injectBefore(pickKind((e) => e.family === "RESTART" && e.owner === "FOR", 6), { owner: "OPP" });
  // 3. Wrong family (turnover tagged as free) → undo.
  injectBefore(pickKind((e) => e.family === "TURNOVER", 10), { family: "FREE", row: "FOR", tile: "Won" });

  // ── Lifecycle stress ──
  const insertOpAfter = (ev, op) => {
    const idx = steps.findIndex((s) => s.op === "tag" && s.ev.id === ev.id);
    steps.splice(idx + 1, 0, op);
  };
  insertOpAfter(byIndex(20), { op: "pause", realSeconds: 150 });
  insertOpAfter(byIndex(45), { op: "reload" });
  insertOpAfter(byIndex(70), { op: "pause", realSeconds: 90 });
  const ht = steps.findIndex((s) => s.op === "halftime");
  steps.splice(ht + 1, 0, { op: "reload" }); // reload during the half-time break
  const secondHalf = tags().filter((s) => s.ev.half === 2);
  insertOpAfter(secondHalf[30].ev, { op: "reload" });
  insertOpAfter(secondHalf[60].ev, { op: "pause", realSeconds: 200 });

  // ── Review corrections after full time (Event Map → Edit / Delete) ──
  const ft = tags();
  const firstOf = (pred) => ft.find((s) => pred(s.ev)).ev;
  const reviewOps = [
    // A wide that was actually a point: Type WIDE → POINT (source tag PLAY stays valid).
    { op: "edit", targetId: firstOf((e) => e.family === "WIDE" && e.row === "FOR" && e.tile === "Play" && e.half === 2).id, newKind: "POINT",
      truthAfter: { action: "score", source: "Play" } },
    // A kickout logged as retained that the opposition actually broke: KICKOUT WON → KICKOUT LOST.
    { op: "edit", targetId: firstOf((e) => e.family === "RESTART" && e.owner === "FOR" && e.row === "FOR" && e.half === 2).id, newKind: "KICKOUT_CONCEDED",
      truthAfter: { action: "restart", winner: "OPP" } },
    // A blocked shot that actually went over: SHOT (Block/Save) → POINT. Stale tag check (regression #9).
    { op: "edit", targetId: firstOf((e) => e.family === "SHOT" && e.tile === "Block/Save" && e.row === "OPP").id, newKind: "POINT",
      truthAfter: { action: "score", source: "Play" } },
    // A turnover won that was actually lost: TURNOVER WON → TURNOVER LOST.
    { op: "edit", targetId: firstOf((e) => e.family === "TURNOVER" && e.row === "FOR" && e.half === 1 && e.player).id, newKind: "TURNOVER_LOST",
      truthAfter: { action: "turnover", winner: "OPP" } },
    // Duplicate/incorrect events removed.
    { op: "delete", targetId: firstOf((e) => e.family === "SIDELINE").id },
    { op: "delete", targetId: firstOf((e) => e.family === "POINT" && e.row === "OPP" && e.half === 2).id },
  ];

  return {
    matchId: "B",
    title: "Match B — Football: Extreme Stress Test",
    sport: "football",
    homeTeam: "Kilmacud Crokes", awayTeam: "St Brigid's", venue: "Glenalbyn",
    matchType: "Championship", halfMinutes: 35, attackDirection: "left",
    squads: {
      FOR: squad(["Shane O'Rourke", "Dan O'Brien", "Rory O'Carroll", "Andrew McGowan", "Theo Clancy", "Dara Mullin", "Paul Mannion", "Craig Dias", "Ben Shovlin", "Shane Walsh", "Tom Fox", "Aidan Jones", "Pat Burke", "Callum Pearson", "Hugh Kenny"]),
      OPP: squad([]),
    },
    steps,
    reviewOps,
  };
}

// ─── Match C — Hurling, championship ────────────────────────────────────────

function matchC() {
  const cfg = {
    prefix: "C", seed: 65065, sport: "hurling", attackDirection: "left", halfMinutes: 35,
    gap: [14, 34], kickoutDelay: [18, 30],
    unknownPlayerP: 0.06, unknownKickoutP: 0.15,
    ownRetention: { FOR: 0.6, OPP: 0.62 },
    placedConv: { FOR: 0.85, OPP: 0.8 },
    freeTaker: { FOR: 12, OPP: 10 },
    p: { turnover: 28, free: 14, sideline: 4, shot: 54, goal: 5, point: 56, wide: 26, short: 5, block: 6, post: 2 },
    cards: {
      1: [{ team: "FOR", tile: "Yellow", number: 7, after: 600 }],
      2: [{ team: "OPP", tile: "Yellow", number: 3, after: 300 }, { team: "OPP", tile: "Red", number: 3, after: 1500 }],
    },
    extras: [],
  };
  const steps = simulate(cfg);
  insertAt(steps, "C", 2, 1222, {
    family: "GOAL", row: "FOR", tile: "Penalty", player: { team: "FOR", number: 12 },
    nx: 0.06, ny: 0.5, truth: { action: "score", team: "FOR", source: "Penalty", placed: true, origin: { type: "OTHER", id: null } },
  });
  // Second yellow → red for the same Na Piarsaigh player (hurling has no Sin Bin tile).
  insertAt(steps, "C", 2, 1630, {
    family: "DISCIPLINE", row: "OPP", tile: "Red", player: { team: "OPP", number: 3 },
    nx: 0.3, ny: 0.4, truth: { action: "card", team: "OPP", card: "Red" },
  });
  return {
    matchId: "C",
    title: "Match C — Hurling: Championship",
    sport: "hurling",
    homeTeam: "Ballyhale Shamrocks", awayTeam: "Na Piarsaigh", venue: "Nowlan Park",
    matchType: "Championship", halfMinutes: 35, attackDirection: "left",
    squads: {
      FOR: squad(["Dean Mason", "Darren Mullen", "Joey Holden", "Evan Cody", "Richie Reid", "Michael Fennelly", "Brian Cody", "Ronan Corcoran", "Darragh Corcoran", "Eoin Cody", "TJ Reid", "Colin Fennelly", "Adrian Mullen", "Eoin Reid", "Niall Shortall", "Liam Barron", "Kevin Mullen", "Brian Butler", "Paddy Mullen", "Jack Holden"]),
      OPP: squad([]),
    },
    steps,
    reviewOps: [],
  };
}

const out = process.argv[2];
mkdirSync(out, { recursive: true });
for (const m of [matchA(), matchB(), matchC()]) {
  const tags = m.steps.filter((s) => s.op === "tag");
  // Guarantee unique ids and strictly increasing clocks within each half.
  const ids = new Set();
  for (const half of [1, 2]) {
    let last = -1;
    for (const s of tags.filter((x) => x.ev.half === half)) {
      if (ids.has(s.ev.id)) throw new Error(`duplicate id ${s.ev.id}`);
      ids.add(s.ev.id);
      if (s.ev.clock <= last) s.ev.clock = last + (s.ev.erroneous ? 0 : 1);
      if (!s.ev.erroneous) last = s.ev.clock;
    }
  }
  // Give every live correction (wrong tap → ↩ undo → correct tap) and every
  // reload a realistic time budget, so the corrected tap lands on its own second.
  for (let i = 0; i < m.steps.length; i++) {
    const st = m.steps[i];
    const needsGap = (st.op === "tag" && st.ev.erroneous) || st.op === "reload";
    if (!needsGap) continue;
    const prev = [...m.steps.slice(0, i)].reverse().find((x) => x.op === "tag" && !x.ev.erroneous);
    const next = m.steps.slice(i + 1).find((x) => x.op === "tag" && !x.ev.erroneous);
    if (!prev || !next || prev.ev.half !== next.ev.half) continue;
    if (st.op === "tag") st.ev.clock = prev.ev.clock + 1;
    const minNext = prev.ev.clock + (st.op === "reload" ? 5 : 4);
    if (next.ev.clock < minNext) {
      const shift = minNext - next.ev.clock;
      for (const later of m.steps.slice(m.steps.indexOf(next))) {
        if (later.op === "tag" && later.ev.half === next.ev.half) later.ev.clock += shift;
        if ((later.op === "halftime" && next.ev.half === 1) || (later.op === "fulltime" && next.ev.half === 2)) { later.clock += shift; break; }
      }
    }
  }
  const live = tags.filter((s) => !s.ev.erroneous);
  m.summary = {
    tagSteps: tags.length,
    liveEvents: live.length,
    finalEventsAfterReviewOps: live.length - m.reviewOps.filter((o) => o.op === "delete").length,
    byFamily: live.reduce((acc, s) => ((acc[s.ev.family] = (acc[s.ev.family] ?? 0) + 1), acc), {}),
  };
  writeFileSync(`${out}/match-${m.matchId}.json`, JSON.stringify(m, null, 1));
  console.log(m.matchId, JSON.stringify(m.summary));
}
