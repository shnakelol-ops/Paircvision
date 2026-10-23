// report-tables.mjs — renders results/compare-*.json into the markdown tables
// of the deliverable: a cross-surface pivot (Statistic | Expected | Quick
// Review | Snapshot PDF | Full Review PDF | Pass/Fail) and the full per-check
// listing for every match.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const matches = ["A", "B", "C"];
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

// Pivot rows: [label, scope, team, [surfaceRegex, statRegex] for QR, Snapshot, Full Review]
const PIVOT = [
  ["Final score", "FULL", "FOR", [/^Quick Review p1/, /^score$/], [/^Snapshot FT PDF$/, /^score$/], [/^Full Review PDF \(live\)$/, /^score$/]],
  ["Final score", "FULL", "OPP", [/^Quick Review p1/, /^score$/], [/^Snapshot FT PDF$/, /^score$/], [/^Full Review PDF \(live\)$/, /^score$/]],
  ["Half-time score", "1H", "FOR", [/^Quick Review p1/, /^score$/], [/^Snapshot HT PDF$/, /^score$/], null],
  ["Half-time score", "1H", "OPP", [/^Quick Review p1/, /^score$/], [/^Snapshot HT PDF$/, /^score$/], [/^Full Review PDF \(live\)$/, /^OPP 1st half$/]],
  ["Goals", "FULL", "FOR", [/Counts/, /^Goals$/], null, [/^Full Review PDF \(live\)$/, /^Goals$/]],
  ["Goals", "FULL", "OPP", [/Counts/, /^Goals$/], null, [/^Full Review PDF \(live\)$/, /^Goals$/]],
  ["2-point scores", "FULL", "FOR", [/Counts/, /^2PT$/], [/^Snapshot FT PDF$/, /^total 2PT scores$/], [/^Full Review PDF \(live\)$/, /^2-Pointers$/]],
  ["Shots (all attempts)", "FULL", "FOR", [/Counts/, /^Shots$/], [/^Snapshot FT PDF$/, /^attempts$/], [/^Full Review PDF \(live\)$/, /^Shots$/]],
  ["Shots (all attempts)", "FULL", "OPP", [/Counts/, /^Shots$/], [/^Snapshot FT PDF$/, /^attempts$/], [/^Full Review PDF \(live\)$/, /^Shots$/]],
  ["Scores / attempts", "FULL", "FOR", [/^Quick Review p1/, /^shooting$/], [/^Snapshot FT PDF$/, /^shooting scores\/attempts$/], null],
  ["Conversion %", "FULL", "FOR", null, [/^Snapshot FT PDF$/, /^shooting %$/], [/^Full Review PDF \(live\)$/, /^Conversion$/]],
  ["Conversion %", "FULL", "OPP", null, [/^Snapshot FT PDF$/, /^shooting %$/], [/^Full Review PDF \(live\)$/, /^Conversion$/]],
  ["Wides", "FULL", "FOR", [/Counts/, /^Wides$/], [/^Snapshot FT PDF$/, /^wides$/], [/^Full Review PDF \(live\)$/, /^Wides$/]],
  ["Wides", "FULL", "OPP", [/Counts/, /^Wides$/], [/^Snapshot FT PDF$/, /^wides$/], [/^Full Review PDF \(live\)$/, /^Wides$/]],
  ["Blocked / saved shots", "FULL", "FOR", null, [/^Snapshot FT PDF$/, /^blocked \/ saved$/], [/^Full Review PDF \(live\)$/, /^Block \/ Save$/]],
  ["Own restarts retained / taken", "FULL", "FOR", [/^Quick Review p1/, /^OUR (KICK|PUCK)OUTS retained$/], [/^Snapshot FT PDF$/, /^own restarts retained\/taken$/], [/^Full Review PDF \(live\)$/, /^Own (Kickout|Puckout) Retention$/]],
  ["Own restarts retained / taken", "FULL", "OPP", [/^Quick Review p1/, /^THEIR (KICK|PUCK)OUTS retained$/], [/^Snapshot FT PDF$/, /^own restarts retained\/taken$/], null],
  ["Restarts won (all restarts)", "FULL", "FOR", [/Counts/, /^(Kickout|Puckout) Won$/], null, [/^Full Review PDF \(live\)$/, /^Restart Share Won$/]],
  ["Restarts lost (all restarts)", "FULL", "FOR", [/Counts/, /^(Kickout|Puckout) Lost$/], null, [/^Full Review PDF \(live\)$/, /^Restart Share Conceded$/]],
  ["Restart Share %", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Restart Share$/]],
  ["Restarts won — by foul", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Foul Won$/]],
  ["Restarts lost — by foul", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Foul Conceded$/]],
  ["Own restarts retained clean (Restart Analysis)", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /Clean Won \(own restarts/]],
  ["Turnovers won", "FULL", "FOR", [/Counts/, /^Turnover Won$/], [/^Snapshot FT PDF$/, /^turnovers won$/], [/^Full Review PDF \(live\)$/, /^T\/O Won$/]],
  ["Turnovers lost", "FULL", "FOR", [/Counts/, /^Turnover Lost$/], [/^Snapshot FT PDF$/, /^turnovers lost$/], [/^Full Review PDF \(live\)$/, /^T\/O Lost$/]],
  ["Turnovers won by tackle", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Tackle \/ Press$/]],
  ["Turnovers won by interception", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Swarm \/ Int\.$/]],
  ["Turnovers lost — HP/KP errors", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Slack KP \/ HP$/]],
  ["Turnovers lost — over-carried", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^OC \/ Stripped$/]],
  ["Frees won (possession)", "FULL", "FOR", [/Counts/, /^Free Won$/], null, [/^Full Review PDF \(live\)$/, /^Frees Won$/]],
  ["Frees conceded", "FULL", "FOR", [/Counts/, /^Free Conceded$/], null, [/^Full Review PDF \(live\)$/, /^Frees Conceded$/]],
  ["Placed balls scored / attempted", "FULL", "FOR", [/^Quick Review p1/, /^placed balls$/], [/^Snapshot FT PDF$/, /^placed balls$/], [/^Full Review PDF \(live\)$/, /^direct placed-ball scoring$/]],
  ["Placed balls scored / attempted", "FULL", "OPP", null, [/^Snapshot FT PDF$/, /^placed balls$/], [/^Full Review PDF \(live\)$/, /^direct placed-ball scoring$/]],
  ["Placed-ball points value", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Placed Points$/]],
  ["Placed-ball points value", "FULL", "OPP", null, null, [/^Full Review PDF \(live\)$/, /^Placed Points$/]],
  ["Score source — from general play", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^from general play$/]],
  ["Score source — placed balls", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^placed balls$/]],
  ["Score source — placed balls", "FULL", "OPP", null, null, [/^Full Review PDF \(live\)$/, /^placed balls$/]],
  ["Restart-origin scores", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^restart-origin scores$/]],
  ["Turnover-origin scores", "FULL", "OPP", null, null, [/^Full Review PDF \(live\)$/, /^turnover-origin scores$/]],
  ["Turnover losses → scores against (QR: same possession; FR: chain origin ≤60 s)", "FULL", "FOR", [/^Quick Review p1/, /^turnovers lost → scores against$/], null, [/^Full Review PDF \(live\)$/, /^lost → scores conceded$/]],
  ["Turnover-origin punishment rate", "FULL", "OPP", null, null, [/^Full Review PDF \(live\)$/, /^turnover-origin punishment rate$/]],
  ["Restarts won → score (origin)", "FULL", "FOR", null, null, [/^Full Review PDF \(live\)$/, /^Won → Score \(origin\)$/]],
  ["45 / 65 won", "FULL", "FOR", [/Counts/, /^(45|65) Won$/], null, [/^Full Review PDF \(live\)$/, /^(45|65 \(row\))$/]],
  ["Sideline won", "FULL", "FOR", [/Counts/, /^Sideline Won$/], null, null],
  ["Yellow cards", "FULL", "OPP", [/Counts/, /^Yellow Cards$/], null, [/^Full Review PDF \(live\)$/, /Yellow cards$/]],
  ["Red cards", "FULL", "OPP", [/Counts/, /^Red Cards$/], null, [/^Full Review PDF \(live\)$/, /Red cards$/]],
  ["Longest scoring run (scores)", "FULL", "OPP", [/^Quick Review p1/, /^longest scoring run/], null, [/^Full Review PDF \(live\)$/, /longest burst$/]],
];

function find(checks, spec, scope, team) {
  if (!spec) return null;
  const [surf, stat] = spec;
  const scopeOk = (c) => c.scope === scope || (scope === "FULL" && c.scope === "FULL") || (scope === "1H" && c.scope === "1H");
  return checks.find((c) => surf.test(c.surface) && stat.test(c.stat) && (c.team === team || c.team == null) && scopeOk(c) && (scope !== "1H" || /HT|1H|Opposition/.test(c.page + c.surface + c.stat)))
    ?? checks.find((c) => surf.test(c.surface) && stat.test(c.stat) && (c.team === team || c.team == null));
}

const out = ["# Comparison tables", "", "Generated by `scripts/report-tables.mjs` from `results/compare-*.json`. Every value below was read from the running application (Quick Review DOM) or from the text the application drew onto each page of the actual downloaded PDF. **Expected** comes only from the independent reference ledger (`expected/ledger-*.json`).", "",
  "Columns follow the brief: *Snapshot* = HT/FT Snapshot PDF, *Full Review* = Full Review PDF, *Quick Review* = the in-app Quick Review sheet (Event Stats has no separate in-app \"Snapshot\" screen; the Quick Review sheet is what a coach sees in the app). `n/a` = the surface does not display this statistic. Pass/Fail is PASS only when every surface that shows the statistic matches the reference.", ""];
for (const id of matches) {
  const r = JSON.parse(readFileSync(`${root}/results/compare-${id}.json`, "utf8"));
  const fx = JSON.parse(readFileSync(`${root}/fixtures/match-${id}.json`, "utf8"));
  out.push(`## Match ${id} — ${fx.homeTeam} v ${fx.awayTeam} (${fx.sport})`, "");
  out.push(`Checks: ${r.summary.total} · PASS ${r.summary.pass} · FAIL ${r.summary.fail} · MISSING ${r.summary.missing} · UNVERIFIED ${r.summary.unverified} · LIMITATION ${r.summary.limitation}`, "");
  // Reopened (post-edit) exports carry a different surface name in the checks.
  const toReopened = (spec) => {
    if (!spec || /Quick Review/.test(spec[0].source)) return null;
    const src = spec[0].source;
    if (/Full Review/.test(src)) return [new RegExp(src.replace("\\(live\\)", "\\(reopened after review edits\\)")), spec[1]];
    return [new RegExp(src.replace(/\$$/, " \\[reopened after review edits\\]$")), spec[1]];
  };
  const variants = fx.reviewOps?.length
    ? [["As exported live at HT / full time (before review edits)", (s) => s], ["After review edits — reopened from Saved Matches (Quick Review not re-captured)", toReopened]]
    : [[null, (s) => s]];
  for (const [heading, mapSpec] of variants) {
    if (heading) out.push(`### ${heading}`, "");
    out.push("| Statistic | Team | Expected | Quick Review (in-app) | Snapshot PDF | Full Review PDF | Pass/Fail |", "|---|---|---|---|---|---|---|");
    for (const [label, scope, team, ...specs] of PIVOT) {
      const mapped = specs.map(mapSpec);
      const cells = mapped.map((s) => find(r.checks, s, scope, team));
      const present = cells.filter(Boolean);
      // Each cell is judged against its own definition. The Expected column
      // lists every distinct expectation; a failing cell also prints its own.
      const expected = [...new Set(present.map((c) => c.expected))].join(" / ") || "—";
      const show = (c, spec) => (!spec ? "n/a" : !c ? "(not shown)" : c.status === "PASS" ? c.actual : `${c.actual} ✗ (exp ${c.expected})`);
      const status = present.length === 0 ? "NOT SHOWN" : present.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
      if (fx.sport === "hurling" && /2-point/.test(label)) continue;
      const name = fx.sport === "hurling" ? label.replace("45 / 65", "65") : label;
      out.push(`| ${esc(name)}${scope === "1H" ? " (HT)" : ""} | ${team === "FOR" ? fx.homeTeam : fx.awayTeam} | ${esc(expected)} | ${esc(show(cells[0], mapped[0]))} | ${esc(show(cells[1], mapped[1]))} | ${esc(show(cells[2], mapped[2]))} | ${status} |`);
    }
    out.push("");
  }
}
writeFileSync(`${root}/results/COMPARISON-TABLE.md`, out.join("\n"));

// Full per-check listing.
for (const id of matches) {
  const r = JSON.parse(readFileSync(`${root}/results/compare-${id}.json`, "utf8"));
  const lines = [`# Match ${id} — every automated check`, "", `PASS ${r.summary.pass} · FAIL ${r.summary.fail} · MISSING ${r.summary.missing} · UNVERIFIED ${r.summary.unverified} · LIMITATION ${r.summary.limitation} (total ${r.summary.total})`, "",
    "| Status | Surface | Page | Scope | Statistic | Team | Expected | Actual | Note |", "|---|---|---|---|---|---|---|---|---|"];
  const order = { FAIL: 0, MISSING: 1, LIMITATION: 2, UNVERIFIED: 3, PASS: 4 };
  for (const c of [...r.checks].sort((a, b) => order[a.status] - order[b.status])) {
    lines.push(`| ${c.status} | ${esc(c.surface)} | ${esc(c.page)} | ${esc(c.scope)} | ${esc(c.stat)} | ${esc(c.team ?? "")} | ${esc(c.expected)} | ${esc(c.actual)} | ${esc((c.note ?? "").slice(0, 160))} |`);
  }
  writeFileSync(`${root}/results/checks-${id}.md`, lines.join("\n"));
  writeFileSync(`${root}/results/checks-${id}.csv`, ["status,surface,page,scope,statistic,team,expected,actual,note", ...r.checks.map((c) => [c.status, c.surface, c.page, c.scope, c.stat, c.team ?? "", c.expected, c.actual, c.note ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n"));
}
console.log("tables written");
