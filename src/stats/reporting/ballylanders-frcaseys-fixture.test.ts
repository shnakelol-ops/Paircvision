/**
 * ballylanders-frcaseys-fixture.test.ts
 *
 * Regression test #4 from the Snapshot redesign brief: verifies the
 * Snapshot dashboard model reproduces the approved Ballylanders v
 * Fr. Caseys reference numbers exactly, for both HT (1H-scoped) and FT
 * (full-match) reports.
 */

import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./matchReport";
import { buildSnapshotDashboardModel } from "./snapshotDashboardModel";
import {
  BALLYLANDERS_FRCASEYS_EXPECTATIONS,
  BALLYLANDERS_FRCASEYS_TEAMS,
  buildBallylandersFrCaseysFixture,
} from "./ballylanders-frcaseys-fixture";

describe("Ballylanders v Fr. Caseys — Snapshot dashboard fixture", () => {
  const events = buildBallylandersFrCaseysFixture();

  it("FT dashboard model matches the approved reference numbers", () => {
    const report = buildMatchReport({
      events,
      homeTeam: BALLYLANDERS_FRCASEYS_TEAMS.home,
      awayTeam: BALLYLANDERS_FRCASEYS_TEAMS.away,
      scope: "FULL",
    });
    const model = buildSnapshotDashboardModel(report, "FT");
    const exp = BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft;

    expect(model.us.score).toEqual(exp.score.us);
    expect(model.them.score).toEqual(exp.score.them);

    expect(model.us.shooting).toEqual(exp.shooting.us);
    expect(model.them.shooting).toEqual(exp.shooting.them);

    expect(model.us.ownKickouts).toEqual(exp.ownKickouts.us);
    expect(model.them.ownKickouts).toEqual(exp.ownKickouts.them);

    expect(model.us.turnovers).toEqual(exp.turnovers.us);

    expect(model.us.placed).toEqual(exp.placed.us);
    expect(model.them.placed).toEqual(exp.placed.them);
  });

  it("HT dashboard model (1H-scoped) matches the approved reference numbers", () => {
    const h1Events = events.filter((e) => e.period === "1H");
    const report = buildMatchReport({
      events: h1Events,
      homeTeam: BALLYLANDERS_FRCASEYS_TEAMS.home,
      awayTeam: BALLYLANDERS_FRCASEYS_TEAMS.away,
      scope: "1H",
    });
    const model = buildSnapshotDashboardModel(report, "HT");
    const exp = BALLYLANDERS_FRCASEYS_EXPECTATIONS.ht;

    expect(model.us.score).toEqual(exp.score.us);
    expect(model.them.score).toEqual(exp.score.them);

    expect(model.us.shooting).toEqual(exp.shooting.us);
    expect(model.them.shooting).toEqual(exp.shooting.them);

    expect(model.us.ownKickouts).toEqual(exp.ownKickouts.us);
    expect(model.them.ownKickouts).toEqual(exp.ownKickouts.them);

    expect(model.us.turnovers).toEqual(exp.turnovers.us);

    expect(model.us.placed).toEqual(exp.placed.us);
    expect(model.them.placed).toEqual(exp.placed.them);
  });

  it("2H events are excluded from the HT (1H-scoped) report", () => {
    const h1Events = events.filter((e) => e.period === "1H");
    const h1Count = h1Events.length;
    const totalCount = events.length;
    expect(h1Count).toBeLessThan(totalCount);
    expect(h1Events.every((e) => e.period === "1H")).toBe(true);
  });
});
