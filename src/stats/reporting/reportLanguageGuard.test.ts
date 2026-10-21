/**
 * reportLanguageGuard.test.ts
 *
 * Change 8/9 of the professionalisation pass: a central forbidden-phrase
 * guard for generated Full Review narrative. Tests the narrative-string
 * arrays the report actually renders from (deriveReviewPrompts output,
 * influence.ts insight text) rather than scanning every PDF glyph, plus one
 * whole-export scan as defense in depth.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, unlinkSync } from "node:fs";
import { analyseChains } from "../chains/chain-engine";
import { deriveReviewPrompts } from "../chains/review-prompts";
import { buildInfluenceAnalysis } from "../players/influence";
import { exportReviewPdf } from "../reviewPdfExport";
import type { PdfExportEvent } from "../reviewPdfExport";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";
import {
  BALLYLANDERS_FRCASEYS_TEAMS,
  buildBallylandersFrCaseysFixture,
} from "./ballylanders-frcaseys-fixture";
import { scanForCoachingLanguage } from "./reportProvenance";
import { loadBallylandersGalballyFixture } from "./ballylanders-galbally-real-fixture";
import { buildRathkealeOolaChainFixture, RATHKEALE_OOLA_TEAMS } from "./rathkeale-oola-chain-fixture";

describe("deriveReviewPrompts() — no coaching/recommendation language", () => {
  it("golden fixture produces zero coaching-language hits", () => {
    const events = buildGoldenReportingFixture();
    const analysis = analyseChains(events);
    const prompts = deriveReviewPrompts(analysis, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, "gaelic");
    const hits = scanForCoachingLanguage(prompts.map((p) => p.text));
    expect(hits).toEqual([]);
  });

  it("Ballylanders v Fr. Caseys fixture produces zero coaching-language hits", () => {
    const events = buildBallylandersFrCaseysFixture();
    const analysis = analyseChains(events);
    const prompts = deriveReviewPrompts(analysis, BALLYLANDERS_FRCASEYS_TEAMS.home, BALLYLANDERS_FRCASEYS_TEAMS.away, "gaelic");
    const hits = scanForCoachingLanguage(prompts.map((p) => p.text));
    expect(hits).toEqual([]);
  });

  it("every generated prompt is a complete factual sentence (no trailing advice fragment)", () => {
    const events = buildGoldenReportingFixture();
    const analysis = analyseChains(events);
    const prompts = deriveReviewPrompts(analysis, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, "gaelic");
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p.text.toLowerCase()).not.toContain("worth reviewing");
    }
  });
});

describe("buildInfluenceAnalysis() insight text — no coaching/recommendation language", () => {
  it("golden fixture: dependency / efficiency / quiet-influence text is clean", () => {
    const events = buildGoldenReportingFixture();
    const analysis = analyseChains(events);
    const influence = buildInfluenceAnalysis(events, analysis, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away);

    const texts: string[] = [];
    for (const team of [influence.home, influence.away]) {
      if (team.dependencyInsight) texts.push(team.dependencyInsight.text);
      for (const f of team.efficiencyWatch) texts.push(f.text);
      if (team.quietInfluence) texts.push(team.quietInfluence.text);
    }
    const hits = scanForCoachingLanguage(texts);
    expect(hits).toEqual([]);
  });
});

describe("Full Review whole-export — language guard (defense in depth)", () => {
  let allTexts: string[] = [];

  class CaptureCanvasContext {
    fillStyle = "";
    strokeStyle = "";
    font = "";
    lineWidth = 1;
    textBaseline = "alphabetic";
    textAlign = "left";
    globalAlpha = 1;
    save() {}
    restore() {}
    fillRect() {}
    strokeRect() {}
    fillText(text: string) { allTexts.push(text); }
    stroke() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    ellipse() {}
    quadraticCurveTo() {}
    closePath() {}
    fill() {}
    measureText(text: string) { return { width: text.length * 8 }; }
    setLineDash() {}
    clip() {}
    rect() {}
    roundRect() {}
    drawImage() {}
    createLinearGradient() { return { addColorStop() {} }; }
  }

  class CaptureCanvas {
    width = 1920;
    height = 1080;
    getContext() { return new CaptureCanvasContext() as unknown as CanvasRenderingContext2D; }
    toDataURL() { return "data:image/jpeg;base64,AAAA"; }
  }

  beforeEach(() => {
    allTexts = [];
    class MockPath2D {
      constructor(_d?: string) {}
    }
    (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
    (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
      createElement(tag: string) {
        if (tag === "canvas") return new CaptureCanvas();
        return {};
      },
    };
  });

  afterEach(() => {
    for (const name of readdirSync(".")) {
      if (name.endsWith("_review.pdf")) unlinkSync(name);
    }
  });

  it("no rendered text anywhere in the export contains forbidden coaching language", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    const hits = scanForCoachingLanguage(allTexts);
    expect(hits).toEqual([]);
  });

  it("no page prints 'Influence Index', an evaluative player rating, or a numeric grade", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    const lower = allTexts.map((t) => t.toLowerCase());
    for (const forbidden of [
      "influence index", "performance rating", "impact score", "player rating",
      "match rating", "efficiency rating", "chain rating", "top players by net influence",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
    expect(allTexts.some((t) => /^index\s/i.test(t))).toBe(false);
  });

  it("no page prints 'Rematch Watchlist' or 'matchup' advice", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    expect(allTexts).not.toContain("Rematch Watchlist");
    expect(allTexts.some((t) => t.toLowerCase().includes("matchup"))).toBe(false);
  });

  it("no page prints 'Tactical Review Guide' — it renders as the factual 'Match Markers' page", async () => {
    const events = buildGoldenReportingFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({ events, homeTeamName: GOLDEN_TEAMS.home, awayTeamName: GOLDEN_TEAMS.away, sport: "gaelic" });

    expect(allTexts).not.toContain("Tactical Review Guide");
    expect(allTexts).toContain("Match Markers");
  });
});

// ─── Intelligence accuracy (Stage 1) — report-wide misattribution guard ──────
//
// Exports the whole Full Review for the real Ballylanders v Galbally event log
// and the constructed Rathkeale v Oola chain fixture, captures every rendered
// string, and asserts that none of the misleading phrases found in the
// October 2026 audit is printed anywhere — and that the corrected wording is.

describe("Full Review whole-export — intelligence accuracy guard", () => {
  let rendered: string[] = [];

  class CaptureCanvasContext {
    fillStyle = "";
    strokeStyle = "";
    font = "";
    lineWidth = 1;
    textBaseline = "alphabetic";
    textAlign = "left";
    globalAlpha = 1;
    save() {}
    restore() {}
    fillRect() {}
    strokeRect() {}
    fillText(text: string) { rendered.push(text); }
    stroke() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    ellipse() {}
    quadraticCurveTo() {}
    closePath() {}
    fill() {}
    measureText(text: string) { return { width: text.length * 8 }; }
    setLineDash() {}
    clip() {}
    rect() {}
    roundRect() {}
    drawImage() {}
    createLinearGradient() { return { addColorStop() {} }; }
    createRadialGradient() { return { addColorStop() {} }; }
  }

  class CaptureCanvas {
    width = 1920;
    height = 1080;
    getContext() { return new CaptureCanvasContext() as unknown as CanvasRenderingContext2D; }
    toDataURL() { return "data:image/jpeg;base64,AAAA"; }
  }

  beforeEach(() => {
    rendered = [];
    class MockPath2D {
      constructor(_d?: string) {}
    }
    (globalThis as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;
    (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
      createElement(tag: string) {
        if (tag === "canvas") return new CaptureCanvas();
        return {};
      },
    };
  });

  afterEach(() => {
    for (const name of readdirSync(".")) {
      if (name.endsWith("_review.pdf")) unlinkSync(name);
    }
  });

  const MISLEADING: Array<string | RegExp> = [
    /possession sequence/i,
    /chain sequence win rate/i,
    /chain sequences won/i,
    /chain share ≥/i,
    /kickout-to-score chains/i,
    /turnover-to-score chains/i,
    /lost → score against \(rule match\)/i,   // the "(origin)" rows are correctly home-perspective
    /Insufficient data for coaching prompts/,
    /\b1H \d+'–[6-9]\d'/,      // a first-half label running past minute 59
    /\b\d+th min/,             // "3th min" ordinals
  ];

  function expectNoMisleadingText(): void {
    for (const pattern of MISLEADING) {
      const hits = rendered.filter((t) => (typeof pattern === "string" ? t.includes(pattern) : pattern.test(t)));
      expect(hits, String(pattern)).toEqual([]);
    }
  }

  it("Ballylanders v Galbally (real event log): no misleading phrase, corrected wording present", async () => {
    const f = loadBallylandersGalballyFixture();
    await exportReviewPdf({
      events: f.events,
      homeTeamName: f.homeTeam,
      awayTeamName: f.awayTeam,
      sport: "gaelic",
      homeSquadPlayers: f.homeSquadPlayers,
      awaySquadPlayers: f.awaySquadPlayers,
      homeAttackingDirection: f.homeAttackingDirection,
      halfDurationMinutes: f.halfDurationMinutes,
    });

    expectNoMisleadingText();
    expect(rendered).toContain("Ballylanders and Galbally each recorded a 2-score unanswered run.");
    expect(rendered).toContain("Chain rule matches");
    expect(rendered).toContain("1H 7'–2H 1'");
    expect(rendered).toContain("No observation met the reporting threshold.");
    expect(rendered.some((t) => t.startsWith("Other team lost"))).toBe(true);
    // Galbally's frees were logged as Ballylanders' concessions: no structural 0.
    expect(rendered).toContain("Free-won → goal chains (rule match): —");
    expect(rendered).not.toContain("0 free-won → goal chains (rule match)");
  });

  it("Rathkeale v Oola (constructed chain fixture): no misleading phrase, corrected wording present", async () => {
    const events = buildRathkealeOolaChainFixture() as unknown as PdfExportEvent[];
    await exportReviewPdf({
      events,
      homeTeamName: RATHKEALE_OOLA_TEAMS.home,
      awayTeamName: RATHKEALE_OOLA_TEAMS.away,
      sport: "gaelic",
    });

    expectNoMisleadingText();
    expect(rendered).toContain("Rathkeale and Oola each recorded a 4-score unanswered run.");
    expect(rendered).toContain("1H 28'–2H 0'");
    expect(rendered.some((t) => t.includes("Rathkeale had more turnover-to-score chains (7)"))).toBe(false);
    expect(rendered.some((t) => t.includes("24 of 29"))).toBe(false);
  });
});
