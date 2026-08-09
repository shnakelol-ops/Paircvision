/**
 * reportProvenance.test.ts
 *
 * Unit tests for the Full Review provenance guard: the invariant that
 * MATCH_FACTS only allows match-fact rows, POSSESSION_FACTS allows
 * match-fact | possession-fact, and GAME_ORIGIN allows
 * chain-origin | interpretive.
 */

import { describe, expect, it } from "vitest";
import {
  assertPartProvenance,
  containsDirectLanguage,
  isProvenanceAllowedInPart,
  scanForForbiddenKeys,
  type ProvenanceRow,
} from "./reportProvenance";

describe("isProvenanceAllowedInPart", () => {
  it("MATCH_FACTS allows only match-fact", () => {
    expect(isProvenanceAllowedInPart("MATCH_FACTS", "match-fact")).toBe(true);
    expect(isProvenanceAllowedInPart("MATCH_FACTS", "possession-fact")).toBe(false);
    expect(isProvenanceAllowedInPart("MATCH_FACTS", "chain-origin")).toBe(false);
    expect(isProvenanceAllowedInPart("MATCH_FACTS", "interpretive")).toBe(false);
  });

  it("POSSESSION_FACTS allows match-fact and possession-fact only", () => {
    expect(isProvenanceAllowedInPart("POSSESSION_FACTS", "match-fact")).toBe(true);
    expect(isProvenanceAllowedInPart("POSSESSION_FACTS", "possession-fact")).toBe(true);
    expect(isProvenanceAllowedInPart("POSSESSION_FACTS", "chain-origin")).toBe(false);
    expect(isProvenanceAllowedInPart("POSSESSION_FACTS", "interpretive")).toBe(false);
  });

  it("GAME_ORIGIN allows chain-origin and interpretive only", () => {
    expect(isProvenanceAllowedInPart("GAME_ORIGIN", "chain-origin")).toBe(true);
    expect(isProvenanceAllowedInPart("GAME_ORIGIN", "interpretive")).toBe(true);
    expect(isProvenanceAllowedInPart("GAME_ORIGIN", "match-fact")).toBe(false);
    expect(isProvenanceAllowedInPart("GAME_ORIGIN", "possession-fact")).toBe(false);
  });
});

describe("assertPartProvenance", () => {
  it("passes silently when every row is allowed", () => {
    const rows: ProvenanceRow[] = [
      { label: "Placed balls", provenance: "match-fact" },
      { label: "Kickout retained", provenance: "possession-fact" },
    ];
    expect(() => assertPartProvenance("POSSESSION_FACTS", rows)).not.toThrow();
  });

  it("throws listing every violation when a chain-origin row leaks into MATCH_FACTS", () => {
    const rows: ProvenanceRow[] = [
      { label: "From Play", provenance: "match-fact" },
      { label: "Restart-origin score", provenance: "chain-origin" },
      { label: "Chain share", provenance: "chain-origin" },
    ];
    expect(() => assertPartProvenance("MATCH_FACTS", rows)).toThrow(
      /Restart-origin score.*chain-origin.*Chain share.*chain-origin/s,
    );
  });

  it("throws when an interpretive row leaks into POSSESSION_FACTS", () => {
    const rows: ProvenanceRow[] = [{ label: "Worth reviewing shot selection", provenance: "interpretive" }];
    expect(() => assertPartProvenance("POSSESSION_FACTS", rows)).toThrow(/POSSESSION_FACTS/);
  });
});

describe("scanForForbiddenKeys", () => {
  it("finds a forbidden key at the top level", () => {
    const hits = scanForForbiddenKeys({ chainRate: 42 }, ["chainRate"]);
    expect(hits).toEqual(["chainRate"]);
  });

  it("finds a forbidden key nested inside arrays and objects", () => {
    const model = {
      teams: [
        { name: "Home", stats: { assistsProxy: 3 } },
        { name: "Away", stats: { assistsProxy: 0 } },
      ],
    };
    const hits = scanForForbiddenKeys(model, ["assistsProxy"]);
    expect(hits).toEqual(["teams.0.stats.assistsProxy", "teams.1.stats.assistsProxy"]);
  });

  it("returns no hits for a clean factual model", () => {
    const model = { goals: 1, points: 10, shotConversionPct: 55 };
    const hits = scanForForbiddenKeys(model, ["chainRate", "assistsProxy", "influenceIndex"]);
    expect(hits).toEqual([]);
  });
});

describe("containsDirectLanguage", () => {
  it("flags 'Direct' labels", () => {
    expect(containsDirectLanguage("Direct scores attributed to restarts")).toBe(true);
    expect(containsDirectLanguage("Directly attributed to turnover")).toBe(true);
    expect(containsDirectLanguage("Direct restart score")).toBe(true);
  });

  it("does not flag origin-labelled text", () => {
    expect(containsDirectLanguage("Restart-origin score")).toBe(false);
    expect(containsDirectLanguage("Score from turnover-origin possession")).toBe(false);
    expect(containsDirectLanguage("Scoring possession began from restart")).toBe(false);
  });
});
