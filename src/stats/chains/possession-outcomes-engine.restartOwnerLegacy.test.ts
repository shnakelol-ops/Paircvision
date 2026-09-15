// Regression coverage for the legacy restart-ownership inversion (P1-3,
// Event Stats release audit): buildPossessionOutcomeSummary's ourKickouts /
// theirKickouts split used to derive restart ownership for legacy events
// (pre-V1.2 data with no explicit restartOwner) with a fallback that
// contradicted restartMetrics.ts's canonical, documented convention
// (owner = teamSide). The old fallback inverted a bare KICKOUT_WON:
// owner = opposite(teamSide) — so a legacy match where a team simply took
// and cleanly retained its own kickout (KICKOUT_WON, teamSide "FOR", no
// restartOwner) was classified as the OPPOSITION's kickout won back by us,
// exactly backwards. Confirmed via git history and every legacy adapter
// (Rapid Capture, StatsModeSurface) that restartOwner === teamSide was
// always the real legacy convention for both WON and CONCEDED, matching
// restartMetrics.ts, not possession-outcomes-engine.ts's old fallback.
//
// The fix replaces the engine's own inline fallback with
// restartMetrics.ts's resolveRestartOwner directly, so there is exactly one
// place restart ownership is ever derived.
import { describe, expect, it } from "vitest";
import { buildPossessionOutcomeSummary } from "./possession-outcomes-engine";
import { resolveRestartOwner } from "../restarts/restartMetrics";
import type { ChainableEvent } from "./chain-types";

function kickoutEvent(overrides: Partial<ChainableEvent> & Pick<ChainableEvent, "id" | "kind" | "teamSide">): ChainableEvent {
  return {
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...overrides,
  };
}

describe("buildPossessionOutcomeSummary — legacy restart ownership (P1-3)", () => {
  it("a legacy self-retained kickout (KICKOUT_WON, teamSide FOR, no restartOwner) is FOR's own kickout, not the opposition's", () => {
    const events: ChainableEvent[] = [
      kickoutEvent({ id: "ko-1", kind: "KICKOUT_WON", teamSide: "FOR" }),
    ];

    // Sanity: this is genuinely the canonical convention this fix aligns with.
    expect(resolveRestartOwner(events[0]!)).toBe("FOR");

    const summary = buildPossessionOutcomeSummary(events);

    expect(summary.ourKickouts).not.toBeNull();
    expect(summary.ourKickouts!.total).toBe(1);
    expect(summary.theirKickouts).toBeNull();
  });

  it("a legacy self-retained opposition kickout (KICKOUT_WON, teamSide OPP, no restartOwner) is the opposition's own kickout, not ours", () => {
    const events: ChainableEvent[] = [
      kickoutEvent({ id: "ko-2", kind: "KICKOUT_WON", teamSide: "OPP" }),
    ];

    const summary = buildPossessionOutcomeSummary(events);

    expect(summary.theirKickouts).not.toBeNull();
    expect(summary.theirKickouts!.total).toBe(1);
    expect(summary.ourKickouts).toBeNull();
  });

  it("a legacy conceded kickout (KICKOUT_CONCEDED, teamSide FOR, no restartOwner) is still FOR's own kickout (conceded to the opposition)", () => {
    const events: ChainableEvent[] = [
      kickoutEvent({ id: "ko-3", kind: "KICKOUT_CONCEDED", teamSide: "FOR" }),
    ];

    const summary = buildPossessionOutcomeSummary(events);

    expect(summary.ourKickouts).not.toBeNull();
    expect(summary.ourKickouts!.total).toBe(1);
    expect(summary.theirKickouts).toBeNull();
  });

  it("V1.2+ data with an explicit restartOwner is unaffected regardless of teamSide/kind", () => {
    const events: ChainableEvent[] = [
      // OPP won it back from FOR's own kickout — explicit restartOwner wins.
      kickoutEvent({ id: "ko-4", kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR" }),
    ];

    const summary = buildPossessionOutcomeSummary(events);

    expect(summary.ourKickouts).not.toBeNull();
    expect(summary.ourKickouts!.total).toBe(1);
    expect(summary.theirKickouts).toBeNull();
  });
});
