import { describe, expect, it } from "vitest";
import {
  deriveSegmentFromPeriodClock,
  resolveSecondHalfStartOffsetSeconds,
  deriveRebasedSegment,
  rebaseEventSegments,
} from "./statsSegments";

describe("deriveSegmentFromPeriodClock — unchanged half-relative behaviour", () => {
  it("buckets 1H clock into segments 1-3", () => {
    expect(deriveSegmentFromPeriodClock("1H", 0)).toBe(1);
    expect(deriveSegmentFromPeriodClock("1H", 599)).toBe(1);
    expect(deriveSegmentFromPeriodClock("1H", 600)).toBe(2);
    expect(deriveSegmentFromPeriodClock("1H", 1199)).toBe(2);
    expect(deriveSegmentFromPeriodClock("1H", 1200)).toBe(3);
  });

  it("buckets 2H HALF-RELATIVE clock into segments 4-6", () => {
    expect(deriveSegmentFromPeriodClock("2H", 0)).toBe(4);
    expect(deriveSegmentFromPeriodClock("2H", 600)).toBe(5);
    expect(deriveSegmentFromPeriodClock("2H", 1200)).toBe(6);
  });
});

describe("resolveSecondHalfStartOffsetSeconds", () => {
  it("returns the minimum matchClockSeconds among 2H events", () => {
    const events = [
      { period: "1H" as const, matchClockSeconds: 100 },
      { period: "2H" as const, matchClockSeconds: 2001 },
      { period: "2H" as const, matchClockSeconds: 2050 },
      { period: "2H" as const, matchClockSeconds: 1999 },
    ];
    expect(resolveSecondHalfStartOffsetSeconds(events)).toBe(1999);
  });

  it("returns null when there are no 2H events", () => {
    const events = [{ period: "1H" as const, matchClockSeconds: 100 }];
    expect(resolveSecondHalfStartOffsetSeconds(events)).toBeNull();
  });
});

describe("deriveRebasedSegment — the P0-7 fix", () => {
  it("1H events are unaffected by the offset", () => {
    const event = { period: "1H" as const, matchClockSeconds: 650 };
    expect(deriveRebasedSegment(event, 2001)).toBe(2);
  });

  it("rebases a 2H event's absolute clock against the actual recorded second-half start — the exact reported bug", () => {
    // Ground truth: 2H events run 2001-4023s absolute; halfDurationMinutes
    // is 30 (1800s), but the recorded second half actually starts at 2001s,
    // not 1800s. Every one of these must NOT all collapse into segment 6.
    const offset = 2001;
    expect(deriveRebasedSegment({ period: "2H", matchClockSeconds: 2001 }, offset)).toBe(4); // 0s in -> early
    expect(deriveRebasedSegment({ period: "2H", matchClockSeconds: 2001 + 650 }, offset)).toBe(5); // ~11min in -> mid
    expect(deriveRebasedSegment({ period: "2H", matchClockSeconds: 2001 + 1300 }, offset)).toBe(6); // ~22min in -> late
  });

  it("hardcoding halfDurationMinutes * 60 (1800) instead of the real offset would misbucket by the drift", () => {
    // Recorded second half starts at 2001s, not 1800s — a 201s drift.
    const realOffset = 2001;
    const wrongOffset = 1800;
    const event = { period: "2H" as const, matchClockSeconds: 2001 + 550 }; // 550s into the real second half
    expect(deriveRebasedSegment(event, realOffset)).toBe(4); // correctly early (550 < 600)
    expect(deriveRebasedSegment(event, wrongOffset)).toBe(5); // 751s against the wrong offset -> misbucketed to mid
  });
});

describe("rebaseEventSegments — full-match regression, matches Adare v Mungret ground truth", () => {
  it("distributes 2H events across halfSegments 1, 2 and 3 instead of clamping every one to 3", () => {
    const events = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `h1-${i}`, period: "1H" as const, matchClockSeconds: i * 90, segment: 6 as const, halfSegment: 3 as const })),
      ...Array.from({ length: 63 - 20 }, (_, i) => ({ id: `h1b-${i}`, period: "1H" as const, matchClockSeconds: 1800 + i * 10, segment: 6 as const, halfSegment: 3 as const })),
      // 66 2H events, absolute clock 2001-4023s, ALL poisoned to segment 6/halfSegment 3 by the old bug.
      ...Array.from({ length: 66 }, (_, i) => ({
        id: `h2-${i}`,
        period: "2H" as const,
        matchClockSeconds: 2001 + Math.round((i / 65) * (4023 - 2001)),
        segment: 6 as const,
        halfSegment: 3 as const,
      })),
    ];
    const rebased = rebaseEventSegments(events);
    const h2Rebased = rebased.filter((e) => e.period === "2H");
    const bySegment = new Map<number, number>();
    for (const e of h2Rebased) bySegment.set(e.segment, (bySegment.get(e.segment) ?? 0) + 1);
    // Non-zero count in every 2H segment (4, 5, 6) — not all clamped to 6.
    expect(bySegment.get(4) ?? 0).toBeGreaterThan(0);
    expect(bySegment.get(5) ?? 0).toBeGreaterThan(0);
    expect(bySegment.get(6) ?? 0).toBeGreaterThan(0);
    // halfSegment must agree with segment (4->1, 5->2, 6->3) for every event.
    for (const e of h2Rebased) {
      expect(e.halfSegment).toBe(e.segment - 3);
    }
  });

  it("never mutates the input array or its objects", () => {
    const events = [{ id: "a", period: "1H" as const, matchClockSeconds: 10, segment: 1 as const, halfSegment: 1 as const }];
    const original = { ...events[0] };
    rebaseEventSegments(events);
    expect(events[0]).toEqual(original);
  });
});
