/**
 * IntelligencePackPreview.test.ts
 *
 * Regression test for the "Intelligence Pack silently downloads three files
 * from a button labelled Share" bug documented in
 * docs/unified-share-audit.md §2.3.6 — desktop browsers (no
 * navigator.canShare({files})) used to have "Share Intelligence Pack"
 * silently fall back to three sequential anchor downloads with no change to
 * the button's label. The fix replaces that with two honestly-labelled
 * actions: "Share This Card" (opens the unified ShareSheet for the current
 * card only) and "Download All 3 Cards" (an explicit, unconditional
 * download that never pretends to be a share).
 *
 * Rendered via react-dom/server (no jsdom/RTL in this repo — vitest runs in
 * plain Node, see snapshotExport.test.ts) using React.createElement so no
 * JSX/.tsx transform is required for this test file.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntelligencePackPreview } from "./IntelligencePackPreview";
import type { IntelligencePack } from "./intelligencePack";

function makeCard(name: string): File {
  return new File([new Blob(["pixels"], { type: "image/png" })], name, { type: "image/png" });
}

function makePack(): IntelligencePack {
  return {
    stageLabel: "Full Time",
    restartOutcomesCard: makeCard("restart-outcomes.png"),
    turnoverFreeOutcomesCard: makeCard("turnover-free-outcomes.png"),
    matchIntelligenceCard: makeCard("match-impact.png"),
  };
}

describe("IntelligencePackPreview — Phase 1 unified Share fix", () => {
  it("never renders the old ambiguous 'Share Intelligence Pack' action", () => {
    const html = renderToStaticMarkup(
      createElement(IntelligencePackPreview, {
        pack: makePack(),
        homeTeamName: "Ballyboden",
        awayTeamName: "Na Fianna",
        stageLabel: "Full Time",
        onClose: () => {},
      }),
    );

    expect(html).not.toContain("Share Intelligence Pack");
  });

  it("offers 'Share This Card' (single-card unified Share) and an explicitly labelled bulk download", () => {
    const html = renderToStaticMarkup(
      createElement(IntelligencePackPreview, {
        pack: makePack(),
        homeTeamName: "Ballyboden",
        awayTeamName: "Na Fianna",
        stageLabel: "Full Time",
        onClose: () => {},
      }),
    );

    expect(html).toContain("Share This Card");
    expect(html).toContain("Download All 3 Cards");
  });

  it("does not render the ShareSheet's rows until it is opened", () => {
    // The unified ShareSheet is mounted but closed by default (open=false
    // renders null internally) — its Share Image / Copy Image / Save Image
    // rows must not appear on the initial preview render.
    const html = renderToStaticMarkup(
      createElement(IntelligencePackPreview, {
        pack: makePack(),
        homeTeamName: "Ballyboden",
        awayTeamName: "Na Fianna",
        stageLabel: "Full Time",
        onClose: () => {},
      }),
    );

    expect(html).not.toContain("Share Image…");
    expect(html).not.toContain("Copy Image");
    expect(html).not.toContain("Save Image");
  });
});
