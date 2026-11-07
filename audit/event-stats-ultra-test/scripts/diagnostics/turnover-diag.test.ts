// DIAGNOSTIC ONLY (root-cause analysis, not part of the reference): runs the
// production chain engine on the events the app actually stored, and lists
// every turnover whose production outcome differs from the reference.
//
// Run from a checkout: copy to src/__audit__/turnover-diag.test.ts, then
//   AUDIT_DIR=$PWD/audit/event-stats-ultra-test npx vitest run src/__audit__/turnover-diag.test.ts
// Output: audit/event-stats-ultra-test/results/diag-turnovers-{A,B,C}.json
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { analyseChains } from "../stats/chains/chain-engine";
it("turnover diagnostics", () => {
  const A = process.env.AUDIT_DIR!;
  for (const id of ["A", "B", "C"]) {
    const fx = JSON.parse(readFileSync(`${A}/fixtures/match-${id}.json`, "utf8"));
    const ledger = JSON.parse(readFileSync(`${A}/expected/ledger-${id}${id === "B" ? "-live" : ""}.json`, "utf8"));
    const stored = JSON.parse(readFileSync(`${A}/runs/${id}/state/FT.json`, "utf8"))[0].events;
    const taps = fx.steps.filter((s: any) => s.op === "tag" && !s.ev.erroneous).map((s: any) => s.ev);
    const toFixture = new Map<string, any>(stored.map((e: any, i: number) => [e.id, taps[i]]));
    const prod = analyseChains(stored).turnovers.outcomes;
    const ref = new Map(ledger.FULL.chains.turnoverDetail.map((t: any) => [t.id, t]));
    const diffs: any[] = [];
    for (const o of prod) {
      const fxEv = toFixture.get(o.turnoverEvent.id);
      const r: any = ref.get(fxEv.id);
      const prodNext = o.nextEvent ? toFixture.get(o.nextEvent.id)?.id : null;
      if (r.score !== o.resultedInScore || (r.next ?? null) !== (prodNext ?? null)) {
        const between = taps.filter((t: any) => t.half === fxEv.half && t.clock > fxEv.clock && t.clock <= (o.nextEvent?.matchClockSeconds ?? fxEv.clock + 60)).map((t: any) => `${t.id}:${t.family}/${t.row}${t.tile ? "/" + t.tile : ""}@${t.clock}`);
        diffs.push({ turnover: fxEv.id, wonBy: r.winner, refNext: r.next, refScore: r.score, prodNext, prodScore: o.resultedInScore, eventsInWindow: between });
      }
    }
    writeFileSync(`${A}/results/diag-turnovers-${id}.json`, JSON.stringify(diffs, null, 1));
    console.log(id, "turnovers differing:", diffs.length);
  }
});
