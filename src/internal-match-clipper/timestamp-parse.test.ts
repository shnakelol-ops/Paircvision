import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMESTAMP_SETTINGS,
  formatClock,
  formatPrecise,
  parseTimestamp,
  parseTimestampList,
} from "./timestamp-parse";

describe("parseTimestamp", () => {
  it("reads MM:SS", () => {
    expect(parseTimestamp("25:30")).toBe(1530);
    expect(parseTimestamp("00:05")).toBe(5);
    expect(parseTimestamp("5:05")).toBe(305);
  });
  it("reads minutes past 59 in MM:SS form, as match clocks do", () => {
    expect(parseTimestamp("77:12")).toBe(77 * 60 + 12);
  });
  it("reads HH:MM:SS", () => {
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("01:16:59")).toBe(4619);
  });
  it("reads fractional seconds", () => {
    expect(parseTimestamp("25:30.5")).toBeCloseTo(1530.5);
  });
  it("rejects invalid text", () => {
    for (const bad of ["", "25", "25:3", "25:60", "1:60:00", "ab:cd", "25:30:", "-1:00", "1:2:3"]) {
      expect(parseTimestamp(bad), bad).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("formats clock and precise values", () => {
    expect(formatClock(1529)).toBe("25:29");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatPrecise(1529.04)).toBe("25:29.0");
    expect(formatPrecise(1529.46)).toBe("25:29.5");
    expect(formatPrecise(59.96)).toBe("01:00.0");
  });
});

describe("parseTimestampList", () => {
  const d = DEFAULT_TIMESTAMP_SETTINGS;

  it("applies the 1 s pre-roll and 6 s default length: 25:30 → 25:29–25:35", () => {
    const { entries, errors } = parseTimestampList("25:30", d, null);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ timestamp: 1530, start: 1529, end: 1535, category: "other", label: "" });
  });

  it("reads a pasted list with categories and labels, mixed formats", () => {
    const text = [
      "12:04 score Conor point",
      "",
      "25:30 - kickout won clean",
      "1:02:03, hit/tackle Big hit",
      "41:10 Celebration",
      "50:00 tackle",
    ].join("\n");
    const { entries, errors } = parseTimestampList(text, d, null);
    expect(errors).toEqual([]);
    expect(entries.map((e) => [e.line, e.category, e.label])).toEqual([
      [1, "score", "Conor point"],
      [3, "kickout", "won clean"],
      [4, "hit", "Big hit"],
      [5, "celebration", ""],
      [6, "hit", ""],
    ]);
  });

  it("keeps an unknown first word as the label and uses the default category", () => {
    const { entries } = parseTimestampList("25:30 Point from 45", { ...d, category: "score" }, null);
    expect(entries[0]).toMatchObject({ category: "score", label: "Point from 45" });
  });

  it("expands a line of comma-separated timestamps", () => {
    const { entries, errors } = parseTimestampList("12:04, 25:30 41:10", d, null);
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.timestamp)).toEqual([724, 1530, 2470]);
  });

  it("reports unreadable lines instead of dropping them", () => {
    const { entries, errors } = parseTimestampList("25:30\nhalf time\n25:99", d, null);
    expect(entries).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("clamps the start at 0 and respects custom settings", () => {
    const { entries } = parseTimestampList("00:00\n10:00", { preRoll: 3, duration: 10, category: "other" }, null);
    expect(entries[0]).toMatchObject({ start: 0, end: 10 });
    expect(entries[1]).toMatchObject({ start: 597, end: 607 });
  });

  it("clamps to the video's end and rejects times after it", () => {
    const { entries, errors } = parseTimestampList("76:58\n77:30", d, 4620);
    expect(entries[0]).toMatchObject({ start: 4617, end: 4620 });
    expect(errors).toEqual([{ line: 2, text: "77:30", reason: "After the end of the video" }]);
  });
});
