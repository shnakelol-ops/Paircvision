/**
 * quickReviewMatchOverview.test.ts
 *
 * Numerical correctness, match-time scope, and sparse/empty-data coverage
 * for Quick Review Page 1's model. Reuses the existing Ballylanders v
 * Fr. Caseys golden fixture (already locked against the HT/FT Snapshot)
 * for score/shooting/kickout-retention/turnover-count/placed-ball/longest-run
 * checks, so Quick Review is proven to agree with the Snapshot on every
 * field they share, on the same data.
 *
 * Restart/turnover consequence (shots/scores) numerical correctness and the
 * immediate-possession-outcome vs chain-origin divergence are covered
 * separately in quickReviewMatchOverview.provenance.test.ts, where a
 * purpose-built fixture is needed to exercise the difference.
 */
import { describe, expect, it } from "vitest";
import type { ChainableEvent } from "../chains/chain-types";
import { buildQuickReviewMatchOverview } from "./quickReviewMatchOverview";
import {
  BALLYLANDERS_FRCASEYS_EXPECTATIONS,
  BALLYLANDERS_FRCASEYS_TEAMS,
  buildBallylandersFrCaseysFixture,
} from "./ballylanders-frcaseys-fixture";

const { home, away } = BALLYLANDERS_FRCASEYS_TEAMS;

describe("quickReviewMatchOverview — numerical correctness against the golden fixture", () => {
  const events = buildBallylandersFrCaseysFixture();

  it("FT (all captured events) matches the locked reference numbers", () => {
    const model = buildQuickReviewMatchOverview(events, home, away);
    const exp = BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft;

    expect(model.score.home).toEqual({ ...exp.score.us, text: "1-10" });
    expect(model.score.away).toEqual({ ...exp.score.them, text: "1-10" });
    expect(model.score.text).toBe("Ballylanders 1-10 — 1-10 Fr. Caseys");

    expect(model.shooting.for).toEqual({
      scores: exp.shooting.us.num,
      attempts: exp.shooting.us.den,
      pct: exp.shooting.us.pct,
      text: "11/20 (55%)",
    });
    expect(model.shooting.opp).toEqual({
      scores: exp.shooting.them.num,
      attempts: exp.shooting.them.den,
      pct: exp.shooting.them.pct,
      text: "11/21 (52%)",
    });

    expect(model.restarts.ours).toEqual({
      retained: exp.ownKickouts.us.retained,
      total: exp.ownKickouts.us.total,
      pct: exp.ownKickouts.us.pct,
      text: "6/13 retained (46%)",
    });
    expect(model.restarts.theirs).toEqual({
      retained: exp.ownKickouts.them.retained,
      total: exp.ownKickouts.them.total,
      pct: exp.ownKickouts.them.pct,
      text: "11/15 retained (73%)",
    });

    expect(model.turnovers.won.count).toBe(exp.turnovers.us.won);
    expect(model.turnovers.lost.count).toBe(exp.turnovers.us.lost);

    expect(model.frees.placed.scores).toBe(exp.placed.us.scores);
    expect(model.frees.placed.attempts).toBe(exp.placed.us.attempts);
    expect(model.frees.placed.text).toBe("6/8 scored");
  });

  it("HT (only 1H events captured so far) matches the locked reference numbers", () => {
    const h1Events = events.filter((e) => e.period === "1H");
    const model = buildQuickReviewMatchOverview(h1Events, home, away);
    const exp = BALLYLANDERS_FRCASEYS_EXPECTATIONS.ht;

    expect(model.score.home).toEqual({ ...exp.score.us, text: "0-05" });
    expect(model.score.away).toEqual({ ...exp.score.them, text: "0-04" });
    expect(model.score.text).toBe("Ballylanders 0-05 — 0-04 Fr. Caseys");

    expect(model.shooting.for.text).toBe("5/11 (45%)");
    expect(model.shooting.opp.text).toBe("4/12 (33%)");

    expect(model.restarts.ours.text).toBe("3/7 retained (43%)");
    expect(model.restarts.theirs.text).toBe("7/7 retained (100%)");

    expect(model.turnovers.won.count).toBe(11);
    expect(model.turnovers.lost.count).toBe(8);

    expect(model.frees.placed.text).toBe("2/4 scored");

    // The fixture pushes each team's scores as one contiguous block per half
    // (5 Ballylanders scores, then 4 Fr. Caseys scores, with no scoring
    // events interleaved between them) — so the 1H-only longest run is
    // exactly those two block sizes.
    expect(model.longestRun.for).toBe(5);
    expect(model.longestRun.opp).toBe(4);
  });

  it("mid-second-half scope (1H complete + partial 2H) sits strictly between HT and FT and uses only currently-captured events", () => {
    const twoHEvents = events.filter((e) => e.period === "2H");
    const partial2H = events.filter((e) => e.period === "1H").concat(twoHEvents.slice(0, 5));
    const model = buildQuickReviewMatchOverview(partial2H, home, away);

    const htModel = buildQuickReviewMatchOverview(events.filter((e) => e.period === "1H"), home, away);
    const ftModel = buildQuickReviewMatchOverview(events, home, away);

    expect(model.score.home.total).toBeGreaterThanOrEqual(htModel.score.home.total);
    expect(model.score.home.total).toBeLessThanOrEqual(ftModel.score.home.total);
    expect(model.shooting.for.attempts).toBeGreaterThanOrEqual(htModel.shooting.for.attempts);
    expect(model.shooting.for.attempts).toBeLessThanOrEqual(ftModel.shooting.for.attempts);
  });

  it("reflects an edited/deleted event on the next build — no stale caching across calls", () => {
    const h1Events = events.filter((e) => e.period === "1H");
    const before = buildQuickReviewMatchOverview(h1Events, home, away);

    // Simulate a review-screen deletion of one Ballylanders score.
    const firstForScoreIdx = h1Events.findIndex((e) => e.teamSide === "FOR" && e.kind === "POINT");
    const edited = h1Events.filter((_, i) => i !== firstForScoreIdx);
    const after = buildQuickReviewMatchOverview(edited, home, away);

    expect(after.score.home.total).toBe(before.score.home.total - 1);
    expect(after.shooting.for.attempts).toBe(before.shooting.for.attempts - 1);
  });
});

// ─── Sparse / empty data ────────────────────────────────────────────────────

let sparseId = 0;
function sparseEvent(
  kind: ChainableEvent["kind"],
  teamSide: "FOR" | "OPP",
): ChainableEvent {
  sparseId += 1;
  return {
    id: `sparse-${sparseId}`,
    kind,
    teamSide,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    matchClockSeconds: sparseId,
  };
}

describe("quickReviewMatchOverview — sparse and empty data safety", () => {
  it("renders safely with zero events at all (no NaN/Infinity/undefined, dash for undefined percentages)", () => {
    const model = buildQuickReviewMatchOverview([], "Home", "Away");

    expect(model.score.home).toEqual({ goals: 0, points: 0, total: 0, text: "0-00" });
    expect(model.shooting.for).toEqual({ scores: 0, attempts: 0, pct: 0, text: "0/0 (—)" });
    expect(model.restarts.ours).toEqual({ retained: 0, total: 0, pct: 0, text: "0/0 retained (—)" });
    expect(model.restarts.won).toEqual({ shots: 0, scores: 0 });
    expect(model.turnovers.won).toEqual({ count: 0, shots: 0, scores: 0 });
    expect(model.frees).toEqual({
      won: 0,
      conceded: 0,
      placed: { scores: 0, attempts: 0, pct: 0, text: "0/0 scored" },
    });
    expect(model.longestRun).toEqual({ for: 0, opp: 0 });

    for (const value of Object.values(flatten(model))) {
      expect(Number.isNaN(value as never)).toBe(false);
      expect(value).not.toBe(Infinity);
      expect(value).not.toBeUndefined();
    }
  });

  it("handles one team with zero events while the other has data", () => {
    const events = [
      sparseEvent("POINT", "FOR"),
      sparseEvent("WIDE", "FOR"),
      sparseEvent("KICKOUT_WON", "FOR"),
    ];
    const model = buildQuickReviewMatchOverview(events, "Home", "Away");

    expect(model.shooting.opp).toEqual({ scores: 0, attempts: 0, pct: 0, text: "0/0 (—)" });
    expect(model.restarts.theirs).toEqual({ retained: 0, total: 0, pct: 0, text: "0/0 retained (—)" });
    expect(model.turnovers.won).toEqual({ count: 0, shots: 0, scores: 0 });
    expect(model.turnovers.lost).toEqual({ count: 0, shots: 0, scores: 0 });
  });

  it("handles zero kickouts, zero turnovers, zero frees, zero placed attempts, no scoring run independently", () => {
    const events = [sparseEvent("POINT", "FOR"), sparseEvent("WIDE", "OPP")];
    const model = buildQuickReviewMatchOverview(events, "Home", "Away");

    expect(model.restarts.ours.text).toBe("0/0 retained (—)");
    expect(model.turnovers.won.count).toBe(0);
    expect(model.frees.won).toBe(0);
    expect(model.frees.placed.text).toBe("0/0 scored");
    expect(model.longestRun.for).toBe(0);
    expect(model.longestRun.opp).toBe(0);
  });
});

/** Recursively flattens a plain object/array into a { path: value } map of leaves. */
function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}
