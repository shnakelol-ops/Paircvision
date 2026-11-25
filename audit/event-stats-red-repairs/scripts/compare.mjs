// compare.mjs — automated comparison: independent reference ledger vs what the
// REAL application displayed (Quick Review DOM) and exported (PDF page text
// captured at rasterisation time from the actual downloaded PDFs).
//
//   node compare.mjs <matchId>      (reads fixtures/, expected/, runs/<id>/)
//
// Every check records: surface, page, scope, statistic, team, expected, actual,
// PASS/FAIL. Values the reference cannot define independently are recorded as
// UNVERIFIED with the raw value, never silently passed.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const id = process.argv[2];
const root = new URL("..", import.meta.url).pathname;
const fx = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
// EXPECTED_DIR (default "expected") selects the ledger set; RESULTS_SUFFIX
// keeps a second comparison next to the default one (repair batch).
const EXPECTED_DIR = process.env.EXPECTED_DIR ?? "expected";
const RESULTS_SUFFIX = process.env.RESULTS_SUFFIX ?? "";
const L_FINAL = JSON.parse(readFileSync(`${root}/${EXPECTED_DIR}/ledger-${id}.json`, "utf8"));
const liveLedgerPath = `${root}/${EXPECTED_DIR}/ledger-${id}-live.json`;
// Live surfaces (HT/FT Quick Review, PDFs exported during the match) are judged
// against the match as it stood then; reopened exports against the final match.
const L_LIVE = existsSync(liveLedgerPath) ? JSON.parse(readFileSync(liveLedgerPath, "utf8")) : L_FINAL;
let L = L_LIVE;
const run = `${root}/runs/${id}`;
const hurling = fx.sport === "hurling";
const HOME = fx.homeTeam, AWAY = fx.awayTeam;
const checks = [];

const gp = (s) => `${s.goals}-${String(s.points).padStart(2, "0")}`;
const gpt = (s) => `${gp(s)} (${s.total})`;
const pctS = (f) => (f.den > 0 ? `${f.pct}%` : "—");
/** The report's truncTeam (reviewPdfExport.ts) — team names on compact lines. */
const truncTeamPdf = (name, max) => {
  if (name.length <= max) return name;
  const cut = name.lastIndexOf(" ", max - 2);
  return cut > 0 ? `${name.slice(0, cut)}…` : `${name.slice(0, max - 1)}…`;
};
// Formatting-only normalisation: whitespace, and the "A, B & C" vs "A, B" list joiner.
const norm = (v) => (v == null ? "∅" : String(v).replace(/\s+/g, " ").replace(/ & /g, ", ").trim());

function check(surface, page, scope, stat, team, expected, actual, note) {
  const status = actual === undefined ? "MISSING" : norm(expected) === norm(actual) ? "PASS" : "FAIL";
  checks.push({ match: id, surface, page, scope, stat, team, expected: norm(expected), actual: actual === undefined ? "(not found)" : norm(actual), status, note: note ?? null });
}
function unverified(surface, page, scope, stat, team, actual, note) {
  checks.push({ match: id, surface, page, scope, stat, team, expected: "—", actual: norm(actual), status: "UNVERIFIED", note });
}

// ─── PDF text helpers ────────────────────────────────────────────────────────
function loadPdf(label) {
  const f = `${run}/pdf-text/${id}-${label}.json`;
  if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, "utf8"));
  return d.pages.map((p, i) => {
    const texts = p.texts.filter((t) => !t.nested);
    const title = texts.find((t) => Math.abs(t.y - 38) < 3 && t.x < 100)?.t ?? null;
    return { index: i + 1, title, texts, all: p.texts, w: p.w, h: p.h };
  });
}
const byTitle = (pages, title, nth = 0) => pages?.filter((p) => p.title === title)[nth] ?? null;
function rightOf(page, label, { side, nth = 0, maxDx = 2000, dy = 3 } = {}) {
  if (!page) return undefined;
  const labels = page.texts.filter((t) => t.t === label && (side == null || (side === "L" ? t.x < 960 : t.x >= 960)));
  const lab = labels[nth];
  if (!lab) return undefined;
  const lim = side === "L" ? 960 : side === "R" ? 1920 : lab.x + maxDx;
  return page.texts.filter((t) => t !== lab && Math.abs(t.y - lab.y) <= dy && t.x > lab.x && t.x < Math.min(lim, lab.x + maxDx)).sort((a, b) => a.x - b.x).map((t) => t.t);
}
const val = (page, label, opts) => { const r = rightOf(page, label, opts); return r === undefined ? undefined : r.length ? r[r.length - 1] : undefined; };
const firstMatch = (page, re) => page?.texts.find((t) => re.test(t.t))?.t;
const column = (page, x, tol = 4) => page.texts.filter((t) => Math.abs(t.x - x) <= tol).sort((a, b) => a.y - b.y).map((t) => t.t);

// ─── 0. Capture integrity: fixture taps vs events the app stored ─────────────
function captureIntegrity() {
  const finalStore = JSON.parse(readFileSync(`${run}/state/final.json`, "utf8"))[0];
  const ftStore = JSON.parse(readFileSync(`${run}/state/FT.json`, "utf8"))[0];
  const taps = fx.steps.filter((s) => s.op === "tag" && !s.ev.erroneous).map((s) => s.ev);
  check("Capture", "store@FT", "FULL", "stored events after undo of erroneous taps", null, taps.length, ftStore.events.length);
  const deleted = new Set((fx.reviewOps ?? []).filter((o) => o.op === "delete").map((o) => o.targetId));
  check("Capture", "store@final", "FULL", "stored events after review edits/deletes", null, taps.length - deleted.size, finalStore.events.length);
  // Documented capture contract (pro-tagger-adapter.ts header comments) — the
  // check is that each tap was recorded with the right clock / player / place.
  let clockBad = 0, playerBad = 0, posBad = 0, halfBad = 0;
  const bad = [];
  taps.forEach((ev, i) => {
    const e = ftStore.events[i];
    if (!e) return;
    if (e.matchClockSeconds !== ev.clock) { clockBad++; bad.push({ id: ev.id, field: "clock", exp: ev.clock, got: e.matchClockSeconds }); }
    if ((e.period === "1H" ? 1 : 2) !== ev.half) halfBad++;
    const expNum = ev.player?.number ?? null;
    if ((e.playerNumber ?? null) !== expNum) { playerBad++; bad.push({ id: ev.id, field: "playerNumber", exp: expNum, got: e.playerNumber ?? null }); }
    if (Math.abs(e.nx - ev.nx) > 0.01 || Math.abs(e.ny - ev.ny) > 0.01) { posBad++; bad.push({ id: ev.id, field: "position", exp: [ev.nx, ev.ny], got: [e.nx, e.ny] }); }
  });
  check("Capture", "store@FT", "FULL", "events with exact match-clock second", null, 0, clockBad, "count of mismatches");
  check("Capture", "store@FT", "FULL", "events in correct half", null, 0, halfBad, "count of mismatches");
  check("Capture", "store@FT", "FULL", "player number recorded as tapped (incl. Unknown)", null, 0, playerBad, "count of mismatches");
  check("Capture", "store@FT", "FULL", "pitch position within 0.01", null, 0, posBad, "count of mismatches");
  return bad;
}

// ─── 1. Quick Review (in-app) ────────────────────────────────────────────────
function quickReview(label, S) {
  const f = `${run}/state/${label}-quickreview.json`;
  if (!existsSync(f)) return;
  const q = JSON.parse(readFileSync(f, "utf8"));
  const scope = label === "HT" ? "1H" : "FULL";
  const rows = Object.fromEntries(q.counts.slice(1).map(([a, l, b]) => [l, [a, b]]));
  // Hurling rows are looked up under the correct word first, then the football
  // word, so a terminology defect never hides the value check.
  const alt = (lab) => (rows[lab] ? lab : lab.replace("Puckout", "Kickout").replace(/^65 /, "45 "));
  const C = (lab, team, exp, note) => check("Quick Review p2 (Counts)", label, scope, lab, team, exp, rows[alt(lab)]?.[team === "FOR" ? 0 : 1], rows[lab] ? note : `${note ?? ""} [row shown as '${alt(lab)}']`.trim());
  for (const [t, b] of [["FOR", S.FOR], ["OPP", S.OPP]]) {
    C("Goals", t, b.goals);
    C("Points", t, b.pointScores, "count of 1-point scores");
    if (!hurling) C("2PT", t, b.twoPointScores);
    C("Shots", t, b.attempts);
    C("Wides", t, b.wides);
    C("Turnover Won", t, b.turnoversWon);
    C("Turnover Lost", t, b.turnoversLost);
    C(hurling ? "Puckout Won" : "Kickout Won", t, b.restartsWon);
    C(hurling ? "Puckout Lost" : "Kickout Lost", t, b.restartsLost);
    C("Free Won", t, b.freesWon);
    C("Free Conceded", t, b.freesConceded);
    C(hurling ? "65 Won" : "45 Won", t, b.fortyFivesWon);
    C(hurling ? "65 Lost" : "45 Lost", t, S[t === "FOR" ? "OPP" : "FOR"].fortyFivesWon);
    C("Sideline Won", t, b.sidelinesWon);
    C("Sideline Lost", t, S[t === "FOR" ? "OPP" : "FOR"].sidelinesWon);
    C("Yellow Cards", t, b.cards.yellow);
    if (!hurling) C("Sin Bins", t, b.cards.sinBin);
    C("Red Cards", t, b.cards.red);
  }
  if (hurling) {
    check("Quick Review p2 (Counts)", label, scope, "terminology: no 'Kickout' label in hurling", null, 0, q.counts.filter((r) => /Kickout/i.test(r[1])).length, "rows labelled Kickout");
    check("Quick Review p2 (Counts)", label, scope, "Sin Bins row absent in hurling (no sanction)", null, 0, q.counts.filter((r) => r[1] === "Sin Bins").length);
  }
  // Page 1 — Match Overview (text)
  const p1 = q.panes[0].split("\n").map((s) => s.trim()).filter(Boolean);
  const after = (lab, k = 1, from = 0) => { const i = p1.indexOf(lab, from); return i < 0 ? undefined : p1[i + k]; };
  const P = (stat, team, exp, act) => check("Quick Review p1 (Overview)", label, scope, stat, team, exp, act);
  P("score", "FOR", gp(S.FOR.score), p1[p1.indexOf(HOME) + 1]);
  P("score", "OPP", gp(S.OPP.score), p1[p1.indexOf(AWAY) - 1]);
  const shootIdx = p1.indexOf("SHOOTING");
  P("shooting", "FOR", `${S.FOR.conversion.num}/${S.FOR.conversion.den} (${pctS(S.FOR.conversion)})`, after(HOME, 1, shootIdx));
  P("shooting", "OPP", `${S.OPP.conversion.num}/${S.OPP.conversion.den} (${pctS(S.OPP.conversion)})`, after(AWAY, 1, shootIdx));
  const runIdx = p1.indexOf("LONGEST SCORING RUN");
  P("longest scoring run (scores)", "FOR", S.longestRun.FOR, after(HOME, 1, runIdx));
  P("longest scoring run (scores)", "OPP", S.longestRun.OPP, after(AWAY, 1, runIdx));
  const ko = hurling ? "PUCKOUTS" : "KICKOUTS";
  P(`OUR ${ko} retained`, "FOR", `${S.FOR.ownRestarts.retained}/${S.FOR.ownRestarts.taken} retained (${pctS(S.FOR.ownRestarts.retention)})`, after(`OUR ${ko}`) ?? after("OUR KICKOUTS"));
  P(`THEIR ${ko} retained`, "OPP", `${S.OPP.ownRestarts.retained}/${S.OPP.ownRestarts.taken} retained (${pctS(S.OPP.ownRestarts.retention)})`, after(`THEIR ${ko}`) ?? after("THEIR KICKOUTS"));
  if (hurling) P("terminology: hurling overview never says KICKOUTS", null, 0, p1.filter((x) => /KICKOUT/i.test(x)).length);
  const po = S.possession;
  const pick = (lab, n) => { const i = p1.indexOf(lab); return i < 0 ? undefined : p1.slice(i, i + 8).filter((x) => /\bshots?\b|\bscores?\b/.test(x))[n]; };
  P("restarts won → shots (possession)", "FOR", `${po.restartWon.shots} shots`, pick("Our restart won", 0));
  P("restarts won → scores (possession)", "FOR", `${po.restartWon.scores} scores`, pick("Our restart won", 1));
  P("restarts lost → shots against", "FOR", `${po.restartLost.shots} shots against`, pick("Our restart lost", 0));
  P("restarts lost → scores against", "FOR", `${po.restartLost.scores} scores against`, pick("Our restart lost", 1));
  P("turnovers won (count)", "FOR", S.FOR.turnoversWon, after("OUR TURNOVERS WON"));
  P("turnovers won → shots", "FOR", `${po.turnoverWon.shots} shots`, pick("OUR TURNOVERS WON", 0));
  P("turnovers won → scores", "FOR", `${po.turnoverWon.scores} score${po.turnoverWon.scores === 1 ? "" : "s"}`, pick("OUR TURNOVERS WON", 1));
  P("turnovers lost (count)", "FOR", S.FOR.turnoversLost, after("OUR TURNOVERS LOST"));
  P("turnovers lost → shots against", "FOR", `${po.turnoverLost.shots} shots against`, pick("OUR TURNOVERS LOST", 0));
  P("turnovers lost → scores against", "FOR", `${po.turnoverLost.scores} score${po.turnoverLost.scores === 1 ? "" : "s"} against`, pick("OUR TURNOVERS LOST", 1));
  P("frees won", "FOR", S.FOR.freesWon, after("Frees won"));
  P("frees conceded", "FOR", S.FOR.freesConceded, after("Frees conceded"));
  P("placed balls", "FOR", `${S.FOR.placed.scores}/${S.FOR.placed.attempts} scored`, after("Placed balls"));
  // Page 3 — Segment comparison
  if (q.panes[2]) segmentPane(label, q.panes[2]);
}

function segmentPane(label, text) {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const halves = label === "HT" ? [1] : [1, 2];
  for (const half of halves) {
    let hIdx = lines.indexOf(half === 1 ? "FIRST HALF" : "SECOND HALF");
    if (hIdx < 0 && half === 1 && /First Half$/.test(lines[0])) hIdx = 0; // HT pane covers the first half only
    if (hIdx < 0) { check("Quick Review p3 (Segments)", label, `${half}H`, "half block present", null, "present", undefined); continue; }
    for (const [team, name] of [["FOR", HOME.toUpperCase()], ["OPP", AWAY.toUpperCase()]]) {
      const tIdx = lines.indexOf(name, hIdx);
      const block = lines.slice(tIdx, tIdx + 60);
      const rowVals = (lab, n = 0) => { let i = -1; for (let k = 0; k <= n; k++) i = block.indexOf(lab, i + 1); return i < 0 ? undefined : block.slice(i + 1, i + 4); };
      const segs = half === 1 ? [1, 2, 3] : [4, 5, 6];
      const exp = (k) => segs.map((s) => L.segments[s][team][k]);
      const C = (stat, e, a) => check("Quick Review p3 (Segments)", label, `${half}H E/M/L`, stat, team, e.join(" | "), a?.join(" | "));
      C("score", exp("score"), rowVals("Score"));
      C("shots (attempts)", exp("attempts"), rowVals("Shots"));
      C("wides", exp("wides"), rowVals("Wides"));
      C("turnovers won", exp("turnoversWon"), rowVals("Turnovers Won"));
      C("turnovers won — own half", exp("turnoversWonOwnHalf"), rowVals("↳ Own Half", 0));
      C("turnovers won — opposition half", exp("turnoversWonOppHalf"), rowVals("↳ Opposition Half", 0));
      C("turnovers lost", exp("turnoversLost"), rowVals("Turnovers Lost"));
      C("turnovers lost — own half", exp("turnoversLostOwnHalf"), rowVals("↳ Own Half", 1));
      C("turnovers lost — opposition half", exp("turnoversLostOppHalf"), rowVals("↳ Opposition Half", 1));
      const ownKO = rowVals("Own KO Retained")?.map((x) => x.split(" ")[0]);
      C("own kickouts retained/taken", exp("ownRestarts").map((x) => (x.endsWith("/0") ? "—" : x)), ownKO);
    }
  }
}

// ─── 2. Snapshot PDFs ────────────────────────────────────────────────────────
function snapshotDashboard(pages, label, S) {
  const p = pages?.[0];
  const surf = `Snapshot ${label} PDF`;
  const pg = "p1 Dashboard";
  if (!p) { check(surf, pg, label, "page exists", null, "present", undefined); return; }
  const scope = label === "HT" ? "1H" : "FULL";
  check(surf, pg, scope, "title", null, label === "HT" ? "Half-Time Dashboard" : "Full-Time Dashboard", p.title);
  const scores = p.texts.filter((t) => /^\d+-\d{2} \(\d+\)$/.test(t.t)).sort((a, b) => a.x - b.x).map((t) => t.t);
  check(surf, pg, scope, "score", "FOR", gpt(S.FOR.score), scores[0]);
  check(surf, pg, scope, "score", "OPP", gpt(S.OPP.score), scores[1]);
  const m = S.margin;
  check(surf, pg, scope, "margin label", null, m === 0 ? "Level" : m > 0 ? `${HOME} lead by ${m}` : `${AWAY} lead by ${-m}`, firstMatch(p, /lead by|^Level$/));
  const shoot = column(p, 86);
  check(surf, pg, scope, "shooting scores/attempts", "FOR", `${S.FOR.conversion.num}/${S.FOR.conversion.den}`, shoot[2]);
  check(surf, pg, scope, "shooting %", "FOR", pctS(S.FOR.conversion), shoot[3]);
  check(surf, pg, scope, "shooting scores/attempts", "OPP", `${S.OPP.conversion.num}/${S.OPP.conversion.den}`, shoot[5]);
  check(surf, pg, scope, "shooting %", "OPP", pctS(S.OPP.conversion), shoot[6]);
  const ours = column(p, 540), theirs = column(p, 994), to = column(p, 1448);
  const KO = hurling ? "PUCKOUTS" : "KICKOUTS";
  check(surf, pg, scope, "terminology: our restart panel heading", null, `OUR ${KO}`, ours[0]);
  check(surf, pg, scope, "own restarts retained/taken", "FOR", `${S.FOR.ownRestarts.retained}/${S.FOR.ownRestarts.taken}`, ours[1]);
  check(surf, pg, scope, "own restart retention %", "FOR", pctS(S.FOR.ownRestarts.retention), ours[2]);
  check(surf, pg, scope, "own restarts lost", "FOR", `Lost ${S.FOR.ownRestarts.lost}/${S.FOR.ownRestarts.taken}`, ours[3]);
  check(surf, pg, scope, "terminology: their restart panel heading", null, `THEIR ${KO}`, theirs[0]);
  check(surf, pg, scope, "own restarts retained/taken", "OPP", `${S.OPP.ownRestarts.retained}/${S.OPP.ownRestarts.taken}`, theirs[1]);
  check(surf, pg, scope, "own restart retention %", "OPP", pctS(S.OPP.ownRestarts.retention), theirs[2]);
  check(surf, pg, scope, "own restarts lost", "OPP", `Lost ${S.OPP.ownRestarts.lost}/${S.OPP.ownRestarts.taken}`, theirs[3]);
  check(surf, pg, scope, "turnovers won", "FOR", S.FOR.turnoversWon, to[2]);
  check(surf, pg, scope, "turnovers lost", "FOR", S.FOR.turnoversLost, to[4]);
  check(surf, pg, scope, "placed balls", "FOR", `${S.FOR.placed.scores}/${S.FOR.placed.attempts} scored`, p.texts.find((t) => t.x < 100 && /scored$/.test(t.t))?.t);
  check(surf, pg, scope, "placed balls", "OPP", `${S.OPP.placed.scores}/${S.OPP.placed.attempts} scored`, p.texts.find((t) => t.x > 900 && t.x < 1100 && /scored$/.test(t.t))?.t);
  check(surf, pg, scope, "event count footer", null, `${L.eventCounts[label === "HT" ? "h1" : "total"]} events`, firstMatch(p, /^\d+ events$/));
}

function snapshotPages(pages, label) {
  const surf = `Snapshot ${label} PDF`;
  if (!pages) return;
  const S = label === "HT" ? L.H1 : L.FULL;
  const scope = label === "HT" ? "1H" : "FULL";
  // Shot profile pages
  const our = pages[1], their = pages[2];
  check(surf, "p2 Our Shot Profile", scope, "summary", "FOR", `${S.FOR.scoresCount} scores from ${S.FOR.attempts} shots · ${pctS(S.FOR.conversion)} efficiency`, our && firstMatch(our, /scores from \d+ shots/)?.split(/ · (Best|Most)/)[0]);
  check(surf, "p2 Our Shot Profile", scope, "placed-ball scores", "FOR", `${S.FOR.placed.scores} placed-ball score${S.FOR.placed.scores === 1 ? "" : "s"}`, our && firstMatch(our, /placed-ball/)?.replace(/^[^:]*: /, "").split(" · ")[0]);
  check(surf, "p3 Their Shot Profile", scope, "summary", "OPP", `${S.OPP.scoresCount} scores from ${S.OPP.attempts} shots · ${pctS(S.OPP.conversion)} efficiency`, their && firstMatch(their, /scores from \d+ shots/)?.split(/ · (Best|Most)/)[0]);
  // Restart battle pages
  const rb = pages.filter((p) => /^Restart Battle/.test(p.title ?? ""));
  const halves = label === "HT" ? [["1H", L.H1]] : [["1H", L.H1], ["2H", L.H2]];
  halves.forEach(([h, HS], i) => {
    const p = rb[i];
    const rr = (team) => p?.texts.find((t) => / retained \d+\/\d+/.test(t.t) && (team === "FOR" ? t.x < 960 : t.x >= 960))?.t?.replace(/^.* retained /, "retained ");
    check(surf, `Restart Battle ${h}`, h, "own restarts retained", "FOR", `retained ${HS.FOR.ownRestarts.retained}/${HS.FOR.ownRestarts.taken} (${pctS(HS.FOR.ownRestarts.retention)})`, rr("FOR"));
    check(surf, `Restart Battle ${h}`, h, "own restarts retained", "OPP", `retained ${HS.OPP.ownRestarts.retained}/${HS.OPP.ownRestarts.taken} (${pctS(HS.OPP.ownRestarts.retention)})`, rr("OPP"));
    if (hurling && p) check(surf, `Restart Battle ${h}`, h, "terminology: 'Kickout' words on hurling page", null, 0, p.texts.filter((t) => /kickout/i.test(t.t)).length);
  });
  const tt = pages.filter((p) => /^Turnover & Territory/.test(p.title ?? ""));
  halves.forEach(([h, HS], i) => {
    const p = tt[i];
    const w = HS.FOR.turnoversWon, l = HS.FOR.turnoversLost;
    check(surf, `Turnover & Territory ${h}`, h, "turnovers won/lost", "FOR", `Won ${w} · Lost ${l} (${w + l > 0 ? Math.round((w / (w + l)) * 100) : 0}% won)`, p && firstMatch(p, /^Won \d+ · Lost/));
  });
  if (label === "FT") efficiencyPage(pages[7], surf, "p8 Shot & Scoring Efficiency", L.FULL);
}

function efficiencyPage(p, surf, pg, S) {
  for (const [team, side] of [["FOR", "L"], ["OPP", "R"]]) {
    const b = S[team];
    check(surf, pg, "FULL", "attempts", team, b.attempts, val(p, "Attempts", { side }));
    check(surf, pg, "FULL", "scores", team, b.scoresCount, val(p, "Scores", { side }));
    check(surf, pg, "FULL", "conversion", team, pctS(b.conversion), val(p, "Conversion", { side }));
    check(surf, pg, "FULL", "wides", team, b.wides, val(p, "Wides", { side }));
    check(surf, pg, "FULL", "blocked / saved", team, b.shotBlockSave, val(p, "Blocked / Saved", { side }));
    const src = [["Open Play", "Play"], ["Free", "Free"], ["Mark", "Mark"], [hurling ? "65" : "45", hurling ? "65" : "45"], ["Penalty", "Penalty"], ["Unclassified", "Unclassified"]];
    for (const [lab, key] of src) {
      const r = rightOf(p, lab, { side });
      const e = b.bySource[key];
      // The app prints a zero SC cell as "—" (noted as a presentation nit, not a numeric error).
      const exp = e.attempts === 0 ? "— | — | — | —" : `${e.attempts} | ${e.scores === 0 ? "—" : e.scores} | ${e.misses} | ${Math.round((e.scores / e.attempts) * 100)}%`;
      // A source row with no attempts may be omitted entirely — equivalent to "—".
      check(surf, pg, "FULL", `source ${lab}: ATT|SC|MISS|CONV`, team, exp, r === undefined && e.attempts === 0 ? exp : r?.join(" | "));
    }
    if (!hurling) {
      check(surf, pg, "FULL", "2PT scores (play/free/mark)", team, b.twoPointBySource.fromPlayFreeMark, val(p, "TWO_POINTER Scores", { side }), "label printed as raw enum");
      check(surf, pg, "FULL", "2PT scores from 45", team, b.twoPointBySource.from45, val(p, "45+2 Scores", { side }));
      check(surf, pg, "FULL", "total 2PT scores", team, b.twoPointScores, val(p, "Total 2PT Scores", { side }));
      check(surf, pg, "FULL", "2PT points value", team, b.twoPointScores * 2, val(p, "Total 2PT Pts Value", { side }));
    } else {
      check(surf, pg, "FULL", "2-POINT PROFILE absent in hurling", team, 0, p?.texts.filter((t) => /2-POINT|2PT|TWO_POINTER/.test(t.t)).length);
    }
    check(surf, pg, "FULL", "placed scored", team, b.placed.scores, val(p, "Placed Scored", { side }));
    check(surf, pg, "FULL", "placed missed", team, b.placed.misses, val(p, "Placed Missed", { side }));
    check(surf, pg, "FULL", "placed conv %", team, pctS(b.placed.conversion), val(p, "Placed Conv %", { side }));
  }
  check(surf, pg, "FULL", "raw enum label 'TWO_POINTER' not shown to coaches", null, 0, p?.texts.filter((t) => t.t.includes("TWO_POINTER")).length);
}

// ─── 3. Full Review PDF ──────────────────────────────────────────────────────
function fullReview(pages, label) {
  if (!pages) return;
  const surf = `Full Review PDF (${label})`;
  const S = L.FULL;
  // p1 Match Summary
  const p1 = byTitle(pages, "Match Summary");
  const scores = p1?.texts.filter((t) => /^\d+-\d{2} \(\d+\)$/.test(t.t)).sort((a, b) => a.x - b.x).map((t) => t.t) ?? [];
  check(surf, "p1 Match Summary", "FULL", "score", "FOR", gpt(S.FOR.score), scores[0]);
  check(surf, "p1 Match Summary", "FULL", "score", "OPP", gpt(S.OPP.score), scores[1]);
  for (const [team, side] of [["FOR", "L"], ["OPP", "R"]]) {
    const b = S[team], o = S[team === "FOR" ? "OPP" : "FOR"];
    const R = (lab, exp, note) => check(surf, "p1 Match Summary", "FULL", lab, team, exp, val(p1, lab, { side }), note);
    R("Goals", b.goals); R("Points", b.score.points, "points value incl. 2-pointers"); if (!hurling) R("2-Pointers", b.twoPointScores);
    R("Total Score", b.score.total); R("Shots", b.attempts); R("Wides", b.wides); R("Conversion", pctS(b.conversion));
    R("Short", b.shotShort); R("Post", b.shotPost);
    if (hurling) check(surf, "p1 Match Summary", "FULL", "terminology: shot-detail row says '65' in hurling", team, "65", val(p1, "65", { side }) !== undefined ? "65" : val(p1, "45", { side }) !== undefined ? "45" : undefined);
    check(surf, "p1 Match Summary", "FULL", hurling ? "65 (row)" : "45", team, b.fortyFivesWon, val(p1, hurling ? "65" : "45", { side }) ?? val(p1, "45", { side }), "shots that went out for a 45/65 — recorded by the 45/65 family");
    R("Block / Save", b.shotBlockSave);
    R("Restart Share Won", b.restartsWon); R("Restart Share Conceded", b.restartsLost); R("Restart Share", pctS(b.restartShare));
    // Repair batch: these rows were renamed "Restart Share — <method>" (they count
    // all restarts won / lost, not own kickouts). The statistic name is kept so
    // the before/after join stays like-for-like; either label is read.
    const RS = (lab, exp) => check(surf, "p1 Match Summary", "FULL", lab, team, exp, val(p1, `Restart Share — ${lab}`, { side }) ?? val(p1, lab, { side }));
    RS("Clean Won", b.restartMethods.wonClean); RS("Break Won", b.restartMethods.wonBreak); RS("Foul Won", b.restartMethods.wonFoul);
    RS("Clean Lost", b.restartMethods.lostClean); RS("Break Lost", b.restartMethods.lostBreak); RS("Foul Conceded", b.restartMethods.lostFoul);
    R("T/O Won", b.turnoversWon); R("T/O Lost", b.turnoversLost);
    const net = b.turnoversWon - b.turnoversLost; R("Net T/O", net >= 0 ? `+${net}` : `${net}`);
    R("Tackle / Press", b.turnoverMethodsWon.Tackle, "won by tackle");
    R("Swarm / Int.", b.turnoverMethodsWon.Interception, "won by interception");
    R("Slack KP / HP", b.turnoverMethodsLost["HP Error"] + b.turnoverMethodsLost["KP Error"], "lost through hand-pass / kick-pass errors");
    R("OC / Stripped", b.turnoverMethodsLost.Overcarried, "lost through over-carrying");
    R("Frees Won", b.freesWon); R("Frees Conceded", b.freesConceded);
    R("Placed Attempts", b.placed.attempts); R("Placed Scores", b.placed.scores); R("Placed Points", b.placed.pointsValue); R("Placed Misses", b.placed.misses);
    void o;
  }
  if (hurling) check(surf, "p1 Match Summary", "FULL", "terminology: KICKOUTS section heading in hurling", null, 0, p1?.texts.filter((t) => /KICKOUT|Kicked/i.test(t.t)).length);

  // p4 Scoring Breakdown (direct)
  const p4 = byTitle(pages, "Scoring Breakdown");
  for (const [team, i] of [["FOR", 0], ["OPP", 1]]) {
    const d = S[team].directBreakdown;
    const play = rightOf(p4, "From general play");
    const placed = rightOf(p4, "Placed balls");
    check(surf, "p4 Scoring Breakdown", "FULL", "from general play", team, d.fromPlay.text, play?.[i]);
    check(surf, "p4 Scoring Breakdown", "FULL", "placed balls", team, `${d.placed.scores}/${d.placed.attempts} scored · ${d.placed.value} pts`, placed?.[i]);
    if (d.unattributed.scores > 0 || (team === "FOR" && S.OPP.directBreakdown.unattributed.scores > 0)) {
      check(surf, "p4 Scoring Breakdown", "FULL", "unattributed (no source)", team, d.unattributed.text, rightOf(p4, "Unattributed")?.[i]);
    }
  }
  // p6 Game Segments
  const p6 = byTitle(pages, "Game Segments Breakdown");
  if (p6) {
    const segRows = p6.texts.filter((t) => /^(Early|Mid|Late)/.test(t.t)).sort((a, b) => a.y - b.y);
    segRows.forEach((r, k) => {
      const seg = k + 1;
      const cells = p6.texts.filter((t) => Math.abs(t.y - r.y) <= 2 && t.x > r.x + 50).sort((a, b) => a.x - b.x).map((t) => t.t);
      for (const [team, off] of [["FOR", 0], ["OPP", 5]]) {
        const sf = L.facts.filter((f) => (f.half === 1 ? (f.clock < 600 ? 1 : f.clock < 1200 ? 2 : 3) : (f.clock < 600 ? 4 : f.clock < 1200 ? 5 : 6)) === seg);
        const opp = team === "FOR" ? "OPP" : "FOR";
        const sc = sf.filter((f) => f.type === "score" && f.team === team);
        const g = sc.filter((f) => f.goal).length, v = sc.reduce((a, f) => a + f.value, 0);
        const att = sf.filter((f) => ["score", "wide", "shot"].includes(f.type) && f.team === team).length;
        const wd = sf.filter((f) => f.type === "wide" && f.team === team).length;
        const kw = sf.filter((f) => f.type === "restart" && f.winner === team).length, kl = sf.filter((f) => f.type === "restart" && f.winner === opp).length;
        const tw = sf.filter((f) => f.type === "turnover" && f.winner === team).length, tl = sf.filter((f) => f.type === "turnover" && f.loser === team).length;
        const fw = sf.filter((f) => f.type === "free" && f.awardedTo === team).length, fc = sf.filter((f) => f.type === "free" && f.awardedTo === opp).length;
        const net = tw - tl;
        const exp = [`${g}-${String(v - 3 * g).padStart(2, "0")} (${v})`, `${att} / ${wd}`, `${kw}-${kl}`, net >= 0 ? `+${net}` : `${net}`, `${fw} / ${fc}`];
        check(surf, "p6 Game Segments", `seg ${seg}`, "Score | Shots/W | KO W-L | Net T/O | Frees W/C", team, exp.join(" | "), cells.slice(off, off + 5).join(" | "));
      }
    });
  }
  // Player Breakdown pages
  playerPages(pages.filter((p) => p.title === "Player Breakdown"), surf);
  // Player Contributions (component counts only — NET BALL formula is undocumented)
  const p10 = byTitle(pages, "Player Contributions");
  if (p10) contributionsPage(p10, surf);
  // Shot & Scoring Efficiency
  efficiencyPage(byTitle(pages, "Shot & Scoring Efficiency"), surf, "Shot & Scoring Efficiency", S);
  // Zone Analysis headline counts
  const z = byTitle(pages, "Zone Analysis");
  if (z) {
    check(surf, "Zone Analysis", "FULL", "Scores", "FOR", S.FOR.scoresCount, val(z, "Scores", { maxDx: 700 }));
    check(surf, "Zone Analysis", "FULL", "Turnovers Won", "FOR", S.FOR.turnoversWon, val(z, "Turnovers Won", { maxDx: 700 }));
    check(surf, "Zone Analysis", "FULL", "Scores Against", "FOR", S.OPP.scoresCount, val(z, "Scores Against", { maxDx: 700 }));
    check(surf, "Zone Analysis", "FULL", "Opposition Gains", "FOR", S.FOR.turnoversLost, val(z, "Opposition Gains", { maxDx: 700 }));
  }
  // Pitch overview pages
  for (const [t, H, h] of [["1H Pitch Overview", L.H1, "1H"], ["2H Pitch Overview", L.H2, "2H"]]) {
    const p = byTitle(pages, t);
    if (!p) continue;
    check(surf, t, h, "all events", null, H.eventCount, val(p, `${h} — ALL EVENTS`, { maxDx: 930 }));
    check(surf, t, h, "scores", null, H.FOR.scoresCount + H.OPP.scoresCount, val(p, `${h} — SCORES`, { maxDx: 930 }));
    check(surf, t, h, "shots", "FOR", H.FOR.attempts, val(p, `${h} — ${HOME.toUpperCase()} SHOTS`, { maxDx: 930 }));
    check(surf, t, h, "shots", "OPP", H.OPP.attempts, val(p, `${h} — ${AWAY.toUpperCase()} SHOTS`, { maxDx: 930 }));
  }
  // Opposition Facts
  const of = byTitle(pages, "Opposition Facts");
  if (of) {
    check(surf, "Opposition Facts", "FULL", "OPP full-match score", "OPP", gpt(S.OPP.score), of.texts.find((t) => /^\d+-\d{2} \(\d+\)$/.test(t.t) && t.y < 170)?.t);
    check(surf, "Opposition Facts", "1H", "OPP 1st half", "OPP", gpt(L.H1.OPP.score), val(of, "1st Half", { maxDx: 920 }));
    check(surf, "Opposition Facts", "2H", "OPP 2nd half", "OPP", gpt(L.H2.OPP.score), val(of, "2nd Half", { maxDx: 920 }));
    check(surf, "Opposition Facts", "FULL", "OPP goals", "OPP", S.OPP.goals, val(of, "Goals", { maxDx: 920 }));
    check(surf, "Opposition Facts", "FULL", "OPP points value", "OPP", S.OPP.score.points, val(of, hurling ? "Points (incl. frees)" : "Points (incl. frees & 2-pointers)", { maxDx: 920 }) ?? val(of, "Points (incl. frees & 2-pointers)", { maxDx: 920 }));
    check(surf, "Opposition Facts", "FULL", "OPP conversion", "OPP", pctS(S.OPP.conversion), val(of, "Score Conversion", { maxDx: 920 }));
    check(surf, "Opposition Facts", "FULL", "restart share won by OPP", "OPP", `${S.OPP.restartsWon} of ${S.OPP.restartsWon + S.OPP.restartsLost}`, val(of, "Restart Share won by OPP", { maxDx: 920 }));
    check(surf, "Opposition Facts", "FULL", "turnovers gifted to OPP", "FOR", S.FOR.turnoversLost, of.texts.find((t) => t.x > 960 && t.y > 590 && t.y < 620 && /^\d+$/.test(t.t))?.t);
  }
  restartAnalysis(byTitle(pages, "Restart Analysis"), surf);
  turnoverAnalysis(byTitle(pages, "Turnover Analysis"), surf);
  freeAnalysis(byTitle(pages, "Free Kick Analysis"), surf);
  originsPages(pages, surf);
  intelligencePages(pages, surf);
}

function playerPages(pps, surf) {
  const rows = [];
  for (const p of pps) {
    const nums = p.texts.filter((t) => /^#\d+$/.test(t.t) && Math.abs(t.x - 278) < 3);
    const teamHeads = p.texts.filter((t) => (t.t === HOME || t.t === AWAY) && Math.abs(t.x - 282) < 4);
    for (const n of nums) {
      const head = teamHeads.filter((h) => h.y < n.y).sort((a, b) => b.y - a.y)[0] ?? rows[rows.length - 1]?._head;
      const cells = p.texts.filter((t) => Math.abs(t.y - n.y) <= 2 && t.x > 600).sort((a, b) => a.x - b.x).map((t) => t.t);
      rows.push({ team: (head?.t ?? head) === HOME ? "FOR" : "OPP", number: +n.t.slice(1), cells, _head: head?.t ?? head });
    }
  }
  for (const ex of L.players) {
    const r = rows.find((x) => x.team === ex.team && x.number === ex.number);
    const exp = [`${ex.goals}-${String(ex.pointsValue).padStart(2, "0")} (${ex.totalValue})`, ex.attempts, ex.wides, ex.toWon, ex.toLost, (ex.toWon - ex.toLost >= 0 ? "+" : "") + (ex.toWon - ex.toLost), ex.koWon, ex.koLost, ex.freesWon, ex.freesConceded, ex.actions].join(" | ");
    check(surf, "Player Breakdown", "FULL", "Score|Shots|Wides|TO W|TO L|Net|KO W|KO L|Frees W|Frees C|Actions", `${ex.team} #${ex.number}`, exp, r?.cells.join(" | "));
  }
  // Players listed by the PDF with activity the reference does not know about.
  for (const r of rows) {
    if (r.cells[0] === "—") continue;
    if (!L.players.find((x) => x.team === r.team && x.number === r.number)) {
      check(surf, "Player Breakdown", "FULL", "unexpected player row with activity", `${r.team} #${r.number}`, "(no tagged events)", r.cells.join(" | "));
    }
  }
}

function contributionsPage(p, surf) {
  for (const ex of L.players.filter((x) => x.attempts > 0 || x.toWon + x.toLost + x.koWon + x.koLost > 0)) {
    const name = fx.squads[ex.team].find((s) => s.number === ex.number)?.name || `#${ex.number}`;
    const lab = p.texts.find((t) => t.t === name && (ex.team === "FOR" ? t.x < 960 : t.x >= 960) && t.y < 560);
    if (!lab) {
      checks.push({ match: id, surface: surf, page: "Player Contributions", scope: "FULL", stat: "row present", team: `${ex.team} #${ex.number}`, expected: "present", actual: "not shown", status: "LIMITATION", note: "page renders only the top 12 players per team (ranked.slice(0, 12)) with no '+N more' indicator" });
      continue;
    }
    const cells = p.texts.filter((t) => Math.abs(t.y - lab.y) <= 2 && t.x > lab.x && t.x < lab.x + 940).sort((a, b) => a.x - b.x).map((t) => t.t);
    const scored = ex.attempts > 0 ? `${ex.goals}-${String(ex.pointsValue).padStart(2, "0")}` : "—";
    const shots = ex.attempts > 0 ? `${ex.goals + Math.round(0)}` : "—";
    void shots;
    check(surf, "Player Contributions", "FULL", "T/O W-L", `${ex.team} #${ex.number}`, `${ex.toWon}-${ex.toLost}`, cells[3]);
    check(surf, "Player Contributions", "FULL", "KO W-L", `${ex.team} #${ex.number}`, `${ex.koWon}-${ex.koLost}`, cells[4]);
    if (ex.totalValue > 0) check(surf, "Player Contributions", "FULL", "score", `${ex.team} #${ex.number}`, scored, cells[0]);
    unverified(surf, "Player Contributions", "FULL", "NET BALL", `${ex.team} #${ex.number}`, cells[5], "formula not documented on the page");
  }
}

function restartAnalysis(p, surf) {
  if (!p) return;
  const S = L.FULL;
  const pg = "Restart Analysis";
  const KO = hurling ? "puckout" : "kickout";
  for (const [team, name] of [["FOR", HOME], ["OPP", AWAY]]) {
    const b = S[team];
    check(surf, pg, "FULL", "restarts won of total", team, `${name} won ${b.restartsWon} of ${b.restartsWon + b.restartsLost} restarts`, firstMatch(p, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} won \\d+ of`)));
    check(surf, pg, "1H/2H", "won–lost by half", team, `H1: ${L.H1[team].restartsWon}–${L.H1[team].restartsLost} / H2: ${L.H2[team].restartsWon}–${L.H2[team].restartsLost}`, p.texts.find((t) => /^H1: /.test(t.t) && (team === "FOR" ? t.x < 960 : t.x >= 960))?.t);
  }
  const c = S.chains.FOR;
  const L1 = (lab, exp, note) => check(surf, pg, "FULL", lab, "FOR", exp, val(p, lab, { maxDx: 610 }), note);
  L1("Won → Score (origin)", `${c.restartWonToScore.num} (${pctS(c.restartWonToScore)})`);
  L1("Won → Shot attempt", `${c.restartWonToAttempt.num} (${pctS(c.restartWonToAttempt)})`);
  L1("Won → No shot", c.restartWonNoAttempt);
  L1("Lost → Score against (origin)", `${c.restartLostToScoreAgainst.num} (${pctS(c.restartLostToScoreAgainst)})`);
  L1("Lost → No score", c.restartLostToScoreAgainst.den - c.restartLostToScoreAgainst.num);
  L1("Restart Share", `${pctS(S.FOR.restartShare)} (${S.FOR.restartShare.num} of ${S.FOR.restartShare.den})`);
  L1(hurling ? "Own Puckout Retention" : "Own Kickout Retention", `${pctS(S.FOR.ownRestarts.retention)} (${S.FOR.ownRestarts.retained} of ${S.FOR.ownRestarts.taken})`);
  L1("Avg secs to score (won)", c.avgSecsToScoreWon == null ? "—" : `${c.avgSecsToScoreWon}s`, "mean seconds restart→score over restarts won that produced a score");
  const m = S.FOR.ownRestartMethods;
  const pv = (lab) => val(p, lab, { maxDx: 610 });
  check(surf, pg, "FULL", "HOW WON — Clean Won (own restarts retained clean)", "FOR", m.retainedClean, pv("Clean Won"));
  check(surf, pg, "FULL", "HOW WON — Break Won (own restarts retained on the break)", "FOR", m.retainedBreak, pv("Break Won"));
  check(surf, pg, "FULL", "HOW WON — Foul Won (own restarts retained via foul)", "FOR", m.retainedFoul, pv("Foul Won"));
  if (hurling) check(surf, pg, "FULL", "terminology: 'kickout' words on hurling page", null, 0, p.texts.filter((t) => /kickout/i.test(t.t)).length, `expected ${KO}`);
}

function turnoverAnalysis(p, surf) {
  if (!p) return;
  const S = L.FULL, c = S.chains.FOR, o = S.chains.OPP;
  const pg = "Turnover Analysis";
  check(surf, pg, "FULL", "turnovers won", "FOR", `Won ${S.FOR.turnoversWon} turnovers`, firstMatch(p, /^Won \d+ turnovers$/));
  check(surf, pg, "FULL", "turnovers won by opposition", "OPP", `Opposition won ${S.FOR.turnoversLost} turnovers`, firstMatch(p, /^Opposition won \d+ turnovers$/));
  check(surf, pg, "FULL", "won → score", "FOR", `${c.turnoverWonToScore.num} led to score${c.turnoverWonToScore.num === 1 ? "" : "s"}`, p.texts.find((t) => /led to scores?$/.test(t.t) && t.x < 100)?.t);
  check(surf, pg, "FULL", "won → shots", "FOR", `${c.turnoverWonToAttempt.num} led to shots`, firstMatch(p, /led to shots$/));
  check(surf, pg, "FULL", "lost → scores conceded", "FOR", `${c.turnoverLostToScoreAgainst.num} scores conceded`, firstMatch(p, /scores conceded$/));
  check(surf, pg, "FULL", "lost → shots against", "FOR", `${c.turnoverLostToAttemptAgainst.num} shots against`, firstMatch(p, /shots against$/));
  const pv = (lab, n = 0) => val(p, lab, { maxDx: 640, nth: n });
  check(surf, pg, "FULL", "HOW WON — Tackle / Press", "FOR", S.FOR.turnoverMethodsWon.Tackle, pv("Tackle / Press"));
  check(surf, pg, "FULL", "HOW WON — Swarm / Intercept", "FOR", S.FOR.turnoverMethodsWon.Interception, pv("Swarm / Intercept"));
  const unf = pv("Unforced error"), slack = pv("Slack pass");
  check(surf, pg, "FULL", "HOW WON — Unforced error + Slack pass (opposition HP/KP errors)", "FOR", S.FOR.turnoverMethodsWon["HP Error"] + S.FOR.turnoverMethodsWon["KP Error"], unf === undefined || slack === undefined ? undefined : String(+unf + +slack), "Event Stats 'Opposition HP Error' + 'Opposition KP Error' rows");
  void o;
}

function freeAnalysis(p, surf) {
  if (!p) return;
  const S = L.FULL, pg = "Free Kick Analysis";
  check(surf, pg, "FULL", "possession frees won", "FOR", `Won ${S.FOR.freesWon} possession frees`, firstMatch(p, /^Won \d+ possession frees$/));
  check(surf, pg, "FULL", "possession frees won by opposition", "OPP", `Opposition won ${S.OPP.freesWon} possession frees`, firstMatch(p, /^Opposition won \d+ possession frees$/));
  check(surf, pg, "FULL", "direct placed-ball scoring", "FOR", `Direct placed-ball scoring: ${S.FOR.placed.scores}/${S.FOR.placed.attempts} scored`, p.texts.find((t) => /^Direct placed-ball scoring/.test(t.t) && t.x < 960)?.t);
  check(surf, pg, "FULL", "direct placed-ball scoring", "OPP", `Direct placed-ball scoring: ${S.OPP.placed.scores}/${S.OPP.placed.attempts} scored`, p.texts.find((t) => /^Direct placed-ball scoring/.test(t.t) && t.x >= 960)?.t);
  const tot = S.FOR.placed.scores + S.OPP.placed.scores, miss = S.FOR.placed.misses + S.OPP.placed.misses;
  check(surf, pg, "FULL", "all placed balls scored", null, tot, val(p, "Total scored", { maxDx: 640 }));
  check(surf, pg, "FULL", "all placed balls missed", null, miss, val(p, "Total missed", { maxDx: 640 }));
  check(surf, pg, "FULL", "overall placed conversion", null, tot + miss > 0 ? `${Math.round((tot / (tot + miss)) * 100)}%` : "—", val(p, "Overall conv.", { maxDx: 640 }));
  const adv = S.FOR.freesWon - S.OPP.freesWon;
  check(surf, pg, "FULL", "free advantage", "FOR", adv > 0 ? `+${adv}` : `${adv}`, val(p, "Advantage", { maxDx: 640 }));
}

function fmtBreakdown(b) {
  if (b.count === 0) return "—";
  const parts = [];
  if (b.goals) parts.push(`${b.goals} Goal${b.goals > 1 ? "s" : ""}`);
  if (b.points) parts.push(`${b.points} Point${b.points > 1 ? "s" : ""}`);
  if (b.twoPointers) parts.push(`${b.twoPointers} Two-Point score${b.twoPointers > 1 ? "s" : ""}`);
  const head = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}` : parts[0];
  return `${head} (${b.value} pts)`;
}

function originsPages(pages, surf) {
  const S = L.FULL;
  const p = byTitle(pages, "Scoring Possession Origins");
  if (p) {
    for (const [team, i] of [["FOR", 0], ["OPP", 1]]) {
      check(surf, "Scoring Possession Origins", "FULL", "restart-origin scores", team, fmtBreakdown(S.chains[team].origins.restartOrigin), rightOf(p, "Restart-origin scores")?.[i]);
      check(surf, "Scoring Possession Origins", "FULL", "turnover-origin scores", team, fmtBreakdown(S.chains[team].origins.turnoverOrigin), rightOf(p, "Turnover-origin scores")?.[i]);
    }
  }
  const q = byTitle(pages, "Opposition Origin & Chain Analysis");
  if (q) {
    const o = S.chains.OPP, f = S.chains.FOR;
    // R1: the former "Restart-origin scores for OPP" and "…conceded" rows (the
    // same statistic) are one headline; the % keeps its definition (restarts
    // lost → opposition origin score ÷ restarts lost) and names its denominator.
    const headline = val(q, "Opposition scores from restart-origin attacks", { maxDx: 920 });
    check(surf, "Opposition Origin", "FULL", "restart-origin scores for OPP (headline)", "OPP", `${fmtBreakdown(o.origins.restartOrigin)}${f.restartLostToScoreAgainst.den > 0 ? ` (${pctS(f.restartLostToScoreAgainst)})` : ""}`, headline);
    check(surf, "Opposition Origin", "FULL", "restart-origin headline = restart-loss score breakdown (ledger consistency)", "OPP", fmtBreakdown(f.restartLostScoreBreakdown), fmtBreakdown(o.origins.restartOrigin));
    check(surf, "Opposition Origin", "FULL", "restart-loss % denominator line", "FOR", `% = ${truncTeamPdf(HOME, 24)} restarts lost that led to a ${truncTeamPdf(AWAY, 24)} score (${f.restartLostToScoreAgainst.num} of ${f.restartLostToScoreAgainst.den})`, q.texts.find((t) => t.t.startsWith("% = "))?.t);
    check(surf, "Opposition Origin", "FULL", "restart-origin scores from our kickout losses (subset)", "OPP", fmtBreakdown(f.ownRestartLostScoreBreakdown), val(q, hurling ? "Of which: from our puckout losses" : "Of which: from our kickout losses", { maxDx: 920 }));
    check(surf, "Opposition Origin", "FULL", "duplicate restart-origin row removed", null, 0, q.texts.filter((t) => t.t.startsWith("Restart-origin scores")).length);
    check(surf, "Opposition Origin", "FULL", "turnover-origin scores for OPP", "OPP", fmtBreakdown(o.origins.turnoverOrigin), val(q, "Turnover-origin scores for OPP", { maxDx: 920 }));
    check(surf, "Opposition Origin", "FULL", "turnover-origin scores conceded", "OPP", f.turnoverLostToScoreAgainst.num, val(q, "Turnover-origin scores conceded", { maxDx: 920 }));
    check(surf, "Opposition Origin", "FULL", "turnover-origin punishment rate", "OPP", pctS(f.turnoverLostToScoreAgainst), val(q, "Turnover-origin punishment rate", { maxDx: 920 }));
    check(surf, "Opposition Origin", "FULL", "longest unanswered run (scores)", "OPP", `${S.longestRun.OPP} scores`, val(q, "Longest unanswered run", { maxDx: 920 }));
    check(surf, "Opposition Origin", "FULL", "OPP runs ≥ 2", "OPP", S.scoringRuns.filter((r) => r.team === "OPP").length, val(q, "Total OPP runs ≥ 2", { maxDx: 920 }));
  }
}

function intelligencePages(pages, surf) {
  const S = L.FULL, f = S.chains.FOR, o = S.chains.OPP;
  const p = byTitle(pages, "Intelligence Summary");
  if (p) {
    const pg = "Intelligence Summary";
    const lv = (lab, n) => val(p, lab, { maxDx: 920, nth: n ?? 0 });
    check(surf, pg, "FULL", "restart share", "FOR", pctS(S.FOR.restartShare), p.texts.find((t) => t.x < 100 && t.y > 150 && t.y < 170)?.t);
    check(surf, pg, "FULL", "kickout wins → origin score", "FOR", pctS(f.restartWonToScore), lv("Kickout wins → origin score") ?? lv("Puckout wins → origin score"));
    check(surf, pg, "FULL", "kickout losses → origin score against", "FOR", pctS(f.restartLostToScoreAgainst), lv("Kickout losses → origin score against") ?? lv("Puckout losses → origin score against"));
    const net = f.restartWonToScore.pct - f.restartLostToScoreAgainst.pct;
    check(surf, pg, "FULL", "net kickout advantage (%pt)", "FOR", `${net > 0 ? "+" : ""}${net} %pt`, lv("Net kickout advantage (%pt)") ?? lv("Net puckout advantage (%pt)"));
    check(surf, pg, "FULL", "turnover wins → origin score", "FOR", pctS(f.turnoverWonToScore), lv("Turnover wins → origin score"));
    check(surf, pg, "FULL", "turnover wins → shot, no score", "FOR", pctS(f.turnoverWonAttemptNoScore), lv("Turnover wins → shot, no score"));
    check(surf, pg, "FULL", "turnover losses → origin score against", "FOR", pctS(f.turnoverLostToScoreAgainst), lv("Turnover losses → origin score against"));
    check(surf, pg, "FULL", `${HOME} longest burst`, "FOR", `${S.longestRun.FOR} scores`, lv(`${HOME} longest burst`));
    check(surf, pg, "FULL", `${AWAY} longest burst`, "OPP", `${S.longestRun.OPP} scores`, lv(`${AWAY} longest burst`));
    for (const [lab, key] of [["Yellow cards", "yellow"], ["Sin bins", "sinBin"], ["Red cards", "red"]]) {
      const r = rightOf(p, lab);
      check(surf, pg, "FULL", `team comparison — ${lab}`, "FOR", S.FOR.cards[key], r?.[0]);
      check(surf, pg, "FULL", `team comparison — ${lab}`, "OPP", S.OPP.cards[key], r?.[1]);
    }
    const tc = rightOf(p, "Turnover conversion rate");
    check(surf, pg, "FULL", "team comparison — turnover conversion rate", "OPP", pctS(o.turnoverWonToScore), tc?.[1]);
    const rs = rightOf(p, "Restart Share");
    check(surf, pg, "FULL", "team comparison — restart share", "OPP", pctS(S.OPP.restartShare), rs?.[1]);
    unverified(surf, pg, "FULL", "team comparison — chain rule matches", "OPP", rightOf(p, "Chain rule matches")?.[1], "rule matches anchor on TURNOVER_WON / KICKOUT_WON kinds only");
  }
  const ci = byTitle(pages, "Chain Intelligence");
  if (ci) {
    const pg = "Chain Intelligence";
    const v = (lab) => val(ci, lab, { maxDx: 600 });
    check(surf, pg, "FULL", hurling ? "total puckouts" : "total kickouts", null, S.FOR.restartsWon + S.FOR.restartsLost, v(hurling ? "Total puckouts" : "Total kickouts"));
    check(surf, pg, "FULL", "Won → Origin score", "FOR", `${f.restartWonToScore.num} (${pctS(f.restartWonToScore)})`, val(ci, "Won → Origin score", { maxDx: 600 }));
    check(surf, pg, "FULL", "turnovers: Won → Shot (label) vs shot-without-score value", "FOR", `${f.turnoverWonToAttempt.num} (${pctS(f.turnoverWonToAttempt)})`, val(ci, "Won → Shot", { maxDx: 600 }), "label says 'Won → Shot'");
    // R1: the run label is drawn with double spaces ("Team  ×4  2H S6"), which
    // the original single-space pattern never matched, so these rows went
    // unchecked. Run length is the number of scoring events (approved unit:
    // "scores"); the ledger's `scores` field is that count.
    const scoresLabel = (n) => `${n} score${n === 1 ? "" : "s"}`;
    const runRows = ci.texts.filter((t) => /×\d+\s+(1H|2H) S\d$/.test(t.t));
    for (const r of runRows) {
      const m = r.t.match(/^(.*?)\s+×(\d+)\s+(1H|2H) S(\d)$/);
      const team = HOME.startsWith(m[1].replace(/…$/, "")) ? "FOR" : "OPP";
      const value = ci.texts.find((t) => Math.abs(t.y - r.y) <= 2 && t.x > r.x + 300)?.t;
      const ref = S.scoringRuns.find((x) => x.team === team && x.scores === +m[2] && `${x.startHalf}H` === m[3] && (x.startMin < 10 ? 1 : x.startMin < 20 ? 2 : 3) + (x.startHalf === 2 ? 3 : 0) === +m[4]);
      check(surf, pg, "FULL", `scoring run ${r.t.replace(/\s+/g, " ")}: length`, team, ref ? scoresLabel(ref.scores) : "(run not in reference)", value);
    }
    check(surf, pg, "FULL", "longest scoring run (scores)", "FOR", scoresLabel(S.longestRun.FOR), val(ci, "Longest run (For)", { maxDx: 600 }));
    check(surf, pg, "FULL", "longest scoring run (scores)", "OPP", scoresLabel(S.longestRun.OPP), val(ci, "Longest run (Opp)", { maxDx: 600 }));
  }
}

// ─── 4. Presentation checks on every captured page ───────────────────────────
function presentation(pages, label) {
  if (!pages) return;
  const surf = `PDF ${label}`;
  let clipped = [], overlaps = [], kickoutWords = 0, puckoutWords = 0, enumLeak = [], undefinedLeak = [], nameIssues = [];
  for (const p of pages) {
    const boxes = p.texts.map((t) => {
      const size = +((t.font.match(/(\d+(?:\.\d+)?)px/) || [0, 16])[1]);
      const left = t.align === "center" ? t.x - t.w / 2 : t.align === "right" || t.align === "end" ? t.x - t.w : t.x;
      const top = t.base === "middle" ? t.y - size / 2 : t.base === "top" ? t.y : t.y - size * 0.8;
      return { t, left, right: left + t.w, top, bottom: top + size };
    });
    for (const b of boxes) {
      if (b.left < -1 || b.right > p.w + 1) clipped.push({ page: p.index, title: p.title, text: b.t.t, left: Math.round(b.left), right: Math.round(b.right) });
      if (/kickout/i.test(b.t.t)) kickoutWords++;
      if (/puckout/i.test(b.t.t)) puckoutWords++;
      if (/\b(TWO_POINTER|KICKOUT_WON|KICKOUT_CONCEDED|TURNOVER_WON|TURNOVER_LOST|FREE_WON|FORTY_FIVE)\b/.test(b.t.t)) enumLeak.push({ page: p.index, title: p.title, text: b.t.t });
      if (/undefined|NaN|null|Infinity/.test(b.t.t)) undefinedLeak.push({ page: p.index, title: p.title, text: b.t.t });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!a.t.t.trim() || !b.t.t.trim()) continue;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 4 && iy > 4) {
        const area = ix * iy, minA = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
        if (area / minA > 0.25) overlaps.push({ page: p.index, title: p.title, a: a.t.t, b: b.t.t });
      }
    }
    const header = p.texts.find((t) => Math.abs(t.y - 62) < 3 && t.x < 100)?.t ?? "";
    if (p.index > 1 && /v/.test(header) && !(header.includes(HOME) && header.includes(AWAY)) && !/·/.test(header)) nameIssues.push({ page: p.index, header });
  }
  check(surf, "all pages", "—", "text running off the page edge", null, 0, clipped.length, JSON.stringify(clipped));
  // R1: two-way split bars ("Team 13%" … "87% Team" on one line) must total 100.
  const splitBad = [];
  for (const p of pages) {
    for (const l of p.texts) {
      const a = l.t.match(/^(.+?)\s+(\d+)%$/);
      if (!a) continue;
      const r = p.texts.find((t) => t !== l && Math.abs(t.y - l.y) <= 2 && t.x > l.x && /^(\d+)%\s+\S/.test(t.t));
      if (!r) continue;
      const total = +a[2] + +r.t.match(/^(\d+)%/)[1];
      if (total !== 100) splitBad.push({ page: p.index, title: p.title, left: l.t, right: r.t, total });
    }
  }
  check(surf, "all pages", "—", "two-way split bars total 100%", null, 0, splitBad.length, JSON.stringify(splitBad));
  check(surf, "all pages", "—", "overlapping text boxes (>25% of smaller box)", null, 0, overlaps.length, JSON.stringify(overlaps));
  check(surf, "all pages", "—", "internal enum names shown", null, 0, enumLeak.length, JSON.stringify(enumLeak.slice(0, 4)));
  check(surf, "all pages", "—", "undefined/NaN/null text", null, 0, undefinedLeak.length, JSON.stringify(undefinedLeak.slice(0, 4)));
  check(surf, "all pages", "—", "page header team names", null, 0, nameIssues.length, JSON.stringify(nameIssues.slice(0, 4)));
  if (hurling) check(surf, "all pages", "—", "terminology: 'kickout' in a hurling report", null, 0, kickoutWords);
  else check(surf, "all pages", "—", "terminology: 'puckout' in a football report", null, 0, puckoutWords);
  return { clipped, overlaps, enumLeak, undefinedLeak, nameIssues, kickoutWords, puckoutWords };
}

// ─── 5. Reopen stability: identical text across live / reopened exports ─────
function sameText(a, b, label) {
  if (!a || !b) return;
  const flat = (pages) => pages.map((p) => p.all.map((t) => t.t).join("\u0001")).join("\u0002");
  const eq = flat(a) === flat(b);
  let firstDiff = null;
  if (!eq) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i]?.all.map((t) => t.t) ?? [], y = b[i]?.all.map((t) => t.t) ?? [];
      const k = x.findIndex((v, j) => v !== y[j]);
      if (k >= 0 || x.length !== y.length) { firstDiff = { page: i + 1, title: a[i]?.title, live: x[k], reopened: y[k] }; break; }
    }
  }
  check("Reopen", label, "—", "identical page text after save → reload → reopen", null, "identical", eq ? "identical" : "different", firstDiff ? JSON.stringify(firstDiff) : null);
}

// ─── Run ─────────────────────────────────────────────────────────────────────
L = L_LIVE;
const captureMismatches = captureIntegrity();
quickReview("HT", L.H1);
quickReview("FT", L.FULL);
const htLive = loadPdf("HT-snapshot-live"), ftLive = loadPdf("FT-snapshot-live"), frLive = loadPdf("FullReview-live");
const htRe = loadPdf("HT-snapshot-reopened"), ftRe = loadPdf("FT-snapshot-reopened"), frRe = loadPdf("FullReview-reopened"), ftRe2 = loadPdf("FT-snapshot-reopened2");
const finalIsLive = !(fx.reviewOps?.length);
// Live PDFs are compared against the reference only when no review edits follow
// (Match B's reference describes the post-edit match; its reopened PDFs are the
// ones that must match).
// Live exports vs the live ledger (all matches).
L = L_LIVE;
snapshotDashboard(htLive, "HT", L.H1);
snapshotPages(htLive, "HT");
snapshotDashboard(ftLive, "FT", L.FULL);
snapshotPages(ftLive, "FT");
fullReview(frLive, "live");
// Reopened exports vs the final ledger — only adds checks when review edits changed the match.
if (!finalIsLive) {
  L = L_FINAL;
  const tag = (pages, suffix) => pages && pages.map((p) => p);
  const before = checks.length;
  snapshotDashboard(tag(htRe), "HT", L.H1);
  snapshotPages(tag(htRe), "HT");
  snapshotDashboard(tag(ftRe), "FT", L.FULL);
  snapshotPages(tag(ftRe), "FT");
  fullReview(frRe, "reopened after review edits");
  for (const c of checks.slice(before)) if (!/reopened/.test(c.surface)) c.surface = `${c.surface} [reopened after review edits]`;
}
const pres = {};
for (const [lab, pages] of [["HT Snapshot", htLive], ["FT Snapshot", ftLive], ["Full Review", frLive]]) pres[lab] = presentation(pages, lab);
if (finalIsLive) {
  sameText(htLive, htRe, "HT Snapshot live vs reopened");
  sameText(ftLive, ftRe, "FT Snapshot live vs reopened");
  sameText(frLive, frRe, "Full Review live vs reopened");
}
sameText(ftRe, ftRe2, "FT Snapshot reopened vs reopened again");
// Cross-surface consistency for the same fact on different pages.
const blockSavePages = [];
const fr = finalIsLive ? frLive : frRe;
const sumBS = val(byTitle(fr, "Match Summary"), "Block / Save", { side: "L" });
const effBS = val(byTitle(fr, "Shot & Scoring Efficiency"), "Blocked / Saved", { side: "L" });
blockSavePages.push(sumBS, effBS);
check("Cross-page", "Match Summary vs Shot Efficiency", "FULL", `${HOME} blocked/saved shots agree`, "FOR", sumBS, effBS);

const summary = { match: id, total: checks.length, pass: checks.filter((c) => c.status === "PASS").length, fail: checks.filter((c) => c.status === "FAIL").length, missing: checks.filter((c) => c.status === "MISSING").length, unverified: checks.filter((c) => c.status === "UNVERIFIED").length, limitation: checks.filter((c) => c.status === "LIMITATION").length };
writeFileSync(`${root}/results/compare-${id}${RESULTS_SUFFIX}.json`, JSON.stringify({ summary, checks, captureMismatches, presentation: pres }, null, 1));
console.log(JSON.stringify(summary));
