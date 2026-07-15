import { describe, expect, it } from "vitest";
import { buildCapturedEvent, type RapidMatchEvent } from "./rapid-capture-events";
import { deriveRapidReportCapability } from "./rapid-report-capability";

function event(half: 1 | 2, kind: RapidMatchEvent["kind"] = "POINT"): RapidMatchEvent {
  return buildCapturedEvent({ kind, nx: 0.5, ny: 0.5, half, timestamp: 10, teamSide: "FOR" });
}

describe("deriveRapidReportCapability", () => {
  it("disables every export for a match with no events", () => {
    const cap = deriveRapidReportCapability([]);
    expect(cap.hasAnyEvents).toBe(false);
    expect(cap.canExportHtSnapshot).toBe(false);
    expect(cap.canExportFtSnapshot).toBe(false);
    expect(cap.canExportFullReview).toBe(false);
    expect(cap.canExportIntelligencePack).toBe(false);
    expect(cap.reasons.htSnapshot).toBeTruthy();
    expect(cap.reasons.ftSnapshot).toBeTruthy();
    expect(cap.reasons.fullReview).toBeTruthy();
    expect(cap.reasons.intelligencePack).toBeTruthy();
  });

  it("disables only HT Snapshot when events exist but none are first-half", () => {
    const cap = deriveRapidReportCapability([event(2)]);
    expect(cap.hasFirstHalfEvents).toBe(false);
    expect(cap.hasSecondHalfEvents).toBe(true);
    expect(cap.canExportHtSnapshot).toBe(false);
    expect(cap.reasons.htSnapshot).toBe("No first-half events recorded");
    expect(cap.canExportFtSnapshot).toBe(true);
    expect(cap.canExportFullReview).toBe(true);
    expect(cap.canExportIntelligencePack).toBe(true);
    expect(cap.reasons.ftSnapshot).toBeUndefined();
    expect(cap.reasons.fullReview).toBeUndefined();
    expect(cap.reasons.intelligencePack).toBeUndefined();
  });

  it("enables every export once first-half events exist", () => {
    const cap = deriveRapidReportCapability([event(1)]);
    expect(cap.canExportHtSnapshot).toBe(true);
    expect(cap.canExportFtSnapshot).toBe(true);
    expect(cap.canExportFullReview).toBe(true);
    expect(cap.canExportIntelligencePack).toBe(true);
    expect(Object.values(cap.reasons).every((r) => r === undefined)).toBe(true);
  });

  it("enables every export with a full match (both halves)", () => {
    const cap = deriveRapidReportCapability([event(1), event(2)]);
    expect(cap.hasFirstHalfEvents).toBe(true);
    expect(cap.hasSecondHalfEvents).toBe(true);
    expect(cap.canExportHtSnapshot).toBe(true);
    expect(cap.canExportFtSnapshot).toBe(true);
    expect(cap.canExportFullReview).toBe(true);
    expect(cap.canExportIntelligencePack).toBe(true);
  });

  it("is a pure function of its events argument", () => {
    const events = [event(1), event(2)];
    const a = deriveRapidReportCapability(events);
    const b = deriveRapidReportCapability(events);
    expect(a).toEqual(b);
  });

  it("never mutates the input events array", () => {
    const events = [event(1)];
    const snapshot = JSON.stringify(events);
    deriveRapidReportCapability(events);
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
