/**
 * quickReviewSegmentBreakdown.provenance.test.ts
 *
 * Structural provenance guard for Quick Review Page 3, mirroring
 * quickReviewMatchOverview.provenance.test.ts's mechanism exactly. Page 3
 * has a different analytical scope than Page 1 (it deliberately DOES read
 * per-segment location and restart-ownership data Page 1 never touches),
 * so it gets its own forbidden-key list and its own guard rather than being
 * folded into Page 1's — see quickReviewSegmentBreakdown.ts's module header.
 *
 * This test specifically proves the deferred origin/outcome fields
 * (resultedInShot, resultedInScore, secondsToOutcome, nextShotOrScore, and
 * the chain-origin vocabulary already banned from Page 1) never appear in
 * the built model, even though Page 3's kickout-retention figures live in
 * the same event data those chain-origin fields are computed from.
 */
import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import {
  buildQuickReviewSegmentBreakdown,
  QUICK_REVIEW_SEGMENT_FORBIDDEN_KEYS,
} from "./quickReviewSegmentBreakdown";
import { scanForForbiddenKeys, containsCoachingLanguage } from "./reportProvenance";
import { buildBallylandersFrCaseysFixture, BALLYLANDERS_FRCASEYS_TEAMS } from "./ballylanders-frcaseys-fixture";

describe("quickReviewSegmentBreakdown — structural provenance guard", () => {
  it("the built model never contains a chain-origin/rule-match/outcome field name at any depth", () => {
    const events = buildBallylandersFrCaseysFixture() as unknown as LoggedMatchEvent[];
    const model = buildQuickReviewSegmentBreakdown(
      events,
      BALLYLANDERS_FRCASEYS_TEAMS.home,
      BALLYLANDERS_FRCASEYS_TEAMS.away,
      "RIGHT",
    );
    const hits = scanForForbiddenKeys(model, [...QUICK_REVIEW_SEGMENT_FORBIDDEN_KEYS]);
    expect(hits).toEqual([]);
  });

  it("no Page 3 display text contains recommendation/tactical/coaching language", () => {
    const events = buildBallylandersFrCaseysFixture() as unknown as LoggedMatchEvent[];
    const model = buildQuickReviewSegmentBreakdown(
      events,
      BALLYLANDERS_FRCASEYS_TEAMS.home,
      BALLYLANDERS_FRCASEYS_TEAMS.away,
      "RIGHT",
    );
    const texts = model.segments.flatMap((seg) => [
      seg.home.score.text,
      seg.away.score.text,
      seg.home.ownKORetained.text,
      seg.home.oppKORetained.text,
      seg.away.ownKORetained.text,
      seg.away.oppKORetained.text,
    ]);
    for (const text of texts) {
      expect(containsCoachingLanguage(text)).toBe(false);
    }
  });

  it("the model exposes exactly the three first-half segments (Early/Mid/Late) — never second-half or six-segment data", () => {
    const events = buildBallylandersFrCaseysFixture() as unknown as LoggedMatchEvent[];
    const model = buildQuickReviewSegmentBreakdown(
      events,
      BALLYLANDERS_FRCASEYS_TEAMS.home,
      BALLYLANDERS_FRCASEYS_TEAMS.away,
      "RIGHT",
    );
    expect(model.segments.map((s) => s.segment)).toEqual([1, 2, 3]);
    expect(model.segments.map((s) => s.label)).toEqual(["EARLY", "MID", "LATE"]);
  });
});
