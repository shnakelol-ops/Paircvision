import { describe, expect, it } from "vitest";
import {
  buildPendingWinnerSummary,
  getShortTeamName,
  resolveTeamDisplayName,
} from "./pro-tagger-team-labels";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import { tileNeedsOppositionAttribution, getRestartOwnerLabel } from "./pro-tagger-families";

const HOME = "Ballylanders";
const AWAY = "Rathkeale";

describe("getShortTeamName", () => {
  it("returns the full name when it already fits", () => {
    expect(getShortTeamName("Ballylanders")).toBe("Ballylanders");
  });

  it("cuts a long name at the last whole word within the limit", () => {
    expect(getShortTeamName("St Patrick's GAA Club")).toBe("St Patrick's");
  });

  it("falls back to the provided placeholder for a blank team name", () => {
    expect(getShortTeamName("", "Home")).toBe("Home");
    expect(getShortTeamName("   ", "Away")).toBe("Away");
  });

  it("hard-cuts a single very long word with no usable space", () => {
    const long = "Ballinamallardstownabbeydunmanwaycross";
    const short = getShortTeamName(long);
    expect(short.length).toBeLessThanOrEqual(14);
    expect(long.startsWith(short)).toBe(true);
  });
});

describe("resolveTeamDisplayName", () => {
  it("trims and falls back on blank input", () => {
    expect(resolveTeamDisplayName("  Ballylanders  ", "Home")).toBe("Ballylanders");
    expect(resolveTeamDisplayName("", "Home")).toBe("Home");
  });
});

describe("buildPendingWinnerSummary — Turnover", () => {
  it("home team won turnover, plain tile — no attribution needed", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "TURNOVER",
      tileLabel: "HP Error",
      teamSide: "FOR",
      sport: "gaelic",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(summary).toBe("Ballylanders won turnover · HP Error");
  });

  it("away team won turnover on a home-team error tile — names the team that erred", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "TURNOVER",
      tileLabel: "HP Error",
      teamSide: "OPP",
      sport: "gaelic",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(summary).toBe("Rathkeale won turnover · Ballylanders HP Error");
  });

  it("away team won turnover via their own tackle — no attribution on Tackle", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "TURNOVER",
      tileLabel: "Tackle",
      teamSide: "OPP",
      sport: "gaelic",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(summary).toBe("Rathkeale won turnover · Tackle");
  });
});

describe("buildPendingWinnerSummary — Restart (Kickout/Puckout)", () => {
  it("home team won the opposition's kickout", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "RESTART",
      tileLabel: "Break",
      teamSide: "FOR",
      restartOwner: "OPP",
      sport: "gaelic",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(summary).toBe("Ballylanders won their kickout · Break");
  });

  it("home team won their own kickout", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "FOR",
      restartOwner: "FOR",
      sport: "gaelic",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(summary).toBe("Ballylanders won our kickout · Clean");
  });

  it("uses puckout terminology for hurling and camogie", () => {
    const hurling = buildPendingWinnerSummary({
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "OPP",
      restartOwner: "FOR",
      sport: "hurling",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(hurling).toBe("Rathkeale won our puckout · Clean");

    const camogie = buildPendingWinnerSummary({
      familyId: "RESTART",
      tileLabel: "Foul",
      teamSide: "OPP",
      restartOwner: "OPP",
      sport: "camogie",
      homeTeamName: HOME,
      awayTeamName: AWAY,
    });
    expect(camogie).toBe("Rathkeale won their puckout · Foul");
  });

  it("falls back to blank-team placeholders", () => {
    const summary = buildPendingWinnerSummary({
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "OPP",
      restartOwner: "FOR",
      sport: "gaelic",
      homeTeamName: "",
      awayTeamName: "",
    });
    expect(summary).toBe("Away won our kickout · Clean");
  });
});

describe("buildPendingWinnerSummary — other families are untouched", () => {
  it("returns null for a non-Turnover/Restart family, so callers keep their existing display", () => {
    expect(
      buildPendingWinnerSummary({
        familyId: "GOAL",
        tileLabel: "Play",
        teamSide: "FOR",
        sport: "gaelic",
        homeTeamName: HOME,
        awayTeamName: AWAY,
      }),
    ).toBeNull();

    expect(
      buildPendingWinnerSummary({
        familyId: "FREE",
        tileLabel: "Won",
        teamSide: "FOR",
        sport: "gaelic",
        homeTeamName: HOME,
        awayTeamName: AWAY,
      }),
    ).toBeNull();
  });
});

describe("pro-tagger-families — restart terminology and attribution lookup", () => {
  it("labels the restart-owner toggle with K/O for football and P/O for hurling/camogie", () => {
    expect(getRestartOwnerLabel("gaelic", "FOR")).toBe("OUR K/O");
    expect(getRestartOwnerLabel("gaelic", "OPP")).toBe("THEIR K/O");
    expect(getRestartOwnerLabel("hurling", "FOR")).toBe("OUR P/O");
    expect(getRestartOwnerLabel("camogie", "OPP")).toBe("THEIR P/O");
  });

  it("flags only the opponent-error turnover tiles for opposition-row attribution", () => {
    expect(tileNeedsOppositionAttribution("TURNOVER", "Tackle", "gaelic")).toBe(false);
    expect(tileNeedsOppositionAttribution("TURNOVER", "HP Error", "gaelic")).toBe(true);
    expect(tileNeedsOppositionAttribution("TURNOVER", "KP Error", "gaelic")).toBe(true);
    expect(tileNeedsOppositionAttribution("TURNOVER", "Overcarried", "gaelic")).toBe(true);
  });

  it("does not flag any Restart tiles for attribution", () => {
    expect(tileNeedsOppositionAttribution("RESTART", "Clean", "gaelic")).toBe(false);
    expect(tileNeedsOppositionAttribution("RESTART", "Break", "gaelic")).toBe(false);
    expect(tileNeedsOppositionAttribution("RESTART", "Foul", "gaelic")).toBe(false);
  });
});

describe("regression — display label changes never alter the stored event payload", () => {
  it("an OPP-row turnover tap still stores the plain tile tag and teamSide, unaffected by the display prefix", () => {
    // This is exactly the label the FamilyGrid taps with — the raw tile label,
    // never the "Ballylanders HP Error" display string.
    const event = adaptProTaggerAction({
      familyId: "TURNOVER",
      tileLabel: "HP Error",
      teamSide: "OPP",
      nx: 0.5,
      ny: 0.5,
      half: 1,
      matchClockSeconds: 120,
    });
    expect(event.kind).toBe("TURNOVER_WON");
    expect(event.teamSide).toBe("OPP");
    expect(event.tags).toEqual(["HP ERROR"]);
  });

  it("a FOR-row restart tap still stores KICKOUT_WON with teamSide FOR and the chosen restartOwner", () => {
    const event = adaptProTaggerAction({
      familyId: "RESTART",
      tileLabel: "Break",
      teamSide: "FOR",
      restartOwner: "OPP",
      nx: 0.5,
      ny: 0.5,
      half: 1,
      matchClockSeconds: 300,
    });
    expect(event.kind).toBe("KICKOUT_WON");
    expect(event.teamSide).toBe("FOR");
    expect(event.restartOwner).toBe("OPP");
    expect(event.tags).toEqual(["BREAK"]);
  });
});
