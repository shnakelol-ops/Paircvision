// Layer-impact dump: runs ONE code tree (main or repair) over the events the
// app stored for each audit match and writes every core and Intelligence
// output as JSON, events reduced to their ids. Diffing the two dumps shows
// exactly which layer each repair changed.
import { it } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { proTaggerMatchToPdfInput } from "../pro-tagger/pro-tagger-review-adapter";
import { buildMatchReport } from "../stats/reporting/matchReport";
import { buildTeamSummaryBlock } from "../stats/reporting/teamStatsViews";
import { buildDirectScoringBreakdown } from "../stats/ledger/scoreLedger";
import { deriveReviewPrompts } from "../stats/chains/review-prompts";
import { buildMatchIntelligenceSummary } from "../stats/matchIntelligenceSummary";

const strip = (_k: string, v: any) =>
  v && typeof v === "object" && !Array.isArray(v) && typeof v.id === "string" && "kind" in v ? `#${v.id}` : v;

it("layer impact dump", () => {
  const R = process.env.RUNS_DIR!;
  const out: Record<string, unknown> = {};
  const sets: [string, string][] = [
    ["A-live", "A/state/FT.json"], ["B-live", "B/state/FT.json"], ["C-live", "C/state/FT.json"],
    ["A-final", "A/state/final.json"], ["B-final", "B/state/final.json"], ["C-final", "C/state/final.json"],
    ["A-legacy", "A-legacy/state/legacy-import.json"],
  ];
  for (const [name, rel] of sets) {
    const path = `${R}/${rel}`;
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const match = Array.isArray(raw) ? raw[0] : raw;
    const input = proTaggerMatchToPdfInput(match);
    const sport = match.sport;
    for (const scope of ["1H", "FULL"] as const) {
      const report = buildMatchReport({ events: input.events as any, scope, homeTeam: match.homeTeamName, awayTeam: match.awayTeamName });
      const ev = report.events as any;
      out[`${name}|${scope}`] = JSON.parse(JSON.stringify({
        core: {
          summaryFOR: buildTeamSummaryBlock(report as any, "FOR"),
          summaryOPP: buildTeamSummaryBlock(report as any, "OPP"),
          direct: buildDirectScoringBreakdown(ev, match.homeTeamName, match.awayTeamName),
          restarts: report.restarts,
          restartTeams: report.restartTeams,
          placedBalls: report.placedBalls,
          kickoutDataset: report.chain.kickouts,
        },
        intelligence: {
          turnoverDataset: report.chain.turnovers,
          turnovers: report.turnovers,
          ledger: report.ledger,
          chains: { summary: report.chain.summary, allChains: report.chain.allChains },
          possessions: report.possessions,
          prompts: deriveReviewPrompts(report.chain as any, match.homeTeamName, match.awayTeamName, sport),
          intelligenceSummary: buildMatchIntelligenceSummary(ev, match.homeTeamName, match.awayTeamName, scope === "1H" ? "HT" : "FT", sport === "hurling" ? "Puckout" : "Kickout"),
        },
      }, strip));
    }
  }
  writeFileSync(process.env.OUT_FILE!, JSON.stringify(out, null, 1));
});
