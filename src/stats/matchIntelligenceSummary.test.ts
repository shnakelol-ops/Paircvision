import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../core/stats/stats-event-model";
import { buildMatchIntelligenceSummary } from "./matchIntelligenceSummary";

let nextId = 0;
function ev(
  kind: MatchEvent["kind"],
  teamSide: "FOR" | "OPP",
  clock: number,
  restartOwner?: "FOR" | "OPP",
): MatchEvent {
  return {
    id: `mis-${nextId++}`,
    kind,
    teamSide,
    period: "1H",
    segment: 1,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
    ...(restartOwner ? { restartOwner } : {}),
  } as MatchEvent;
}

/** Home took 6 kickouts: kept 3 (scored from 2), lost 3 (opposition scored from 2). */
function ownKickoutEvents(withOwner: boolean): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (let i = 0; i < 6; i++) {
    const t = 100 + i * 200;
    const kept = i < 3;
    events.push(ev(kept ? "KICKOUT_WON" : "KICKOUT_CONCEDED", "FOR", t, withOwner ? "FOR" : undefined));
    if (i === 0 || i === 1) events.push(ev("POINT", "FOR", t + 20));
    if (i === 3 || i === 4) events.push(ev("POINT", "OPP", t + 20));
  }
  return events;
}

describe("buildMatchIntelligenceSummary — kickout wording names whose kickouts", () => {
  it("with the restartOwner split, the figures are about the home team's own kickouts and say so", () => {
    const s = buildMatchIntelligenceSummary(ownKickoutEvents(true), "Home", "Away", "FT", "kickout");
    expect(s.dangerInsights).toContain("Away scored from 2 of the 3 Home kickouts they won");
    expect(s.weaponInsights).toContain("Home scored from 2 of 3 own kickouts retained");
    expect(s.coachingPriorities).toContain("Win the kickout — Away scored from 2 of the 3 Home kickouts they won");
    expect(s.coachingPriorities).toContain("Keep winning kickouts — Home scored from 2 of 3 own kickouts retained");
  });

  it("never states the possession-frees family as 'placed balls'", () => {
    const s = buildMatchIntelligenceSummary(ownKickoutEvents(true), "Home", "Away", "FT", "kickout");
    const all = [
      ...s.dangerInsights, ...s.weaponInsights, ...s.coachingPriorities,
      s.bestAttackInsight ?? "", s.worstExposureInsight ?? "",
    ];
    expect(all.some((t) => t.includes("placed balls"))).toBe(false);
  });
});
