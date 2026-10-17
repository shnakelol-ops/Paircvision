import { describe, expect, it } from "vitest";
import { ellipsize, fitText, formatCoverDate, formatThrowIn, type MeasureText } from "./matchday-cover-text";

// Deterministic: every glyph is half the font size wide.
const measure: MeasureText = (text, size) => [...text].length * size * 0.5;

describe("fitText", () => {
  it("keeps a short name on one line at full size", () => {
    expect(fitText(measure, "Oola", { maxWidth: 400, maxSize: 76, minSize: 40 })).toEqual({
      size: 76,
      lines: ["Oola"],
      truncated: false,
    });
  });

  it("shrinks a single line before wrapping, down to wrapBelow", () => {
    // 12 chars → fits 400px at size ≤ 66.
    const fit = fitText(measure, "Ballylanders", { maxWidth: 400, maxSize: 76, minSize: 40, maxLines: 2, wrapBelow: 58 });
    expect(fit.lines).toEqual(["Ballylanders"]);
    expect(fit.size).toBe(66);
  });

  it("wraps into two balanced lines rather than going tiny", () => {
    const fit = fitText(measure, "Cill Mhic Ciaráin agus Ráth Dubh", {
      maxWidth: 440,
      maxSize: 76,
      minSize: 40,
      maxLines: 2,
      wrapBelow: 58,
    });
    expect(fit.lines).toEqual(["Cill Mhic Ciaráin", "agus Ráth Dubh"]);
    expect(fit.size).toBeGreaterThanOrEqual(40);
    for (const line of fit.lines) expect(measure(line, fit.size)).toBeLessThanOrEqual(440);
  });

  it("shrinks a single unbreakable word below wrapBelow before truncating", () => {
    const fit = fitText(measure, "Ballinameenagh", { maxWidth: 300, maxSize: 76, minSize: 30, maxLines: 2, wrapBelow: 58 });
    expect(fit.lines).toEqual(["Ballinameenagh"]);
    expect(fit.size).toBeLessThan(58);
    expect(fit.truncated).toBe(false);
  });

  it("ellipsizes as a last resort and never overflows", () => {
    const fit = fitText(measure, "Supercalifragilisticexpialidocious", { maxWidth: 200, maxSize: 60, minSize: 30 });
    expect(fit.truncated).toBe(true);
    expect(fit.lines[0].endsWith("…")).toBe(true);
    expect(measure(fit.lines[0], fit.size)).toBeLessThanOrEqual(200);
  });

  it("never returns a line wider than maxWidth, for any input", () => {
    const samples = [
      "Na Piarsaigh",
      "Naomh Mearnóg Ó Súilleabháin",
      "St. Kieran's Ballyhahill–Loughill",
      "Corn Uí Mhuirí — All-Ireland Club Intermediate Ladies Football Championship",
      "x",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "a b c d e f g h i j k l m n o p q r s t u v w x y z",
    ];
    for (const text of samples) {
      for (const maxWidth of [120, 260, 440, 900]) {
        const fit = fitText(measure, text, { maxWidth, maxSize: 80, minSize: 20, maxLines: 2, wrapBelow: 50 });
        expect(fit.lines.length).toBeGreaterThan(0);
        expect(fit.lines.length).toBeLessThanOrEqual(2);
        expect(fit.size).toBeGreaterThanOrEqual(20);
        for (const line of fit.lines) expect(measure(line, fit.size)).toBeLessThanOrEqual(maxWidth);
      }
    }
  });

  it("returns no lines for empty or whitespace-only text", () => {
    expect(fitText(measure, "   ", { maxWidth: 100, maxSize: 40, minSize: 20 }).lines).toEqual([]);
  });

  it("ellipsize keeps at least one character", () => {
    expect(ellipsize(measure, "Ballylanders", 40, 1)).toBe("B…");
  });
});

describe("cover date and time formatting", () => {
  it("formats a date-only value without timezone drift", () => {
    expect(formatCoverDate("2026-10-25")).toBe("Sun 25 Oct");
    expect(formatCoverDate("2026-03-29")).toBe("Sun 29 Mar"); // Irish clocks change that morning
    expect(formatCoverDate("2027-01-01")).toBe("Fri 1 Jan");
  });

  it("returns empty for invalid dates", () => {
    expect(formatCoverDate("")).toBe("");
    expect(formatCoverDate("2026-02-30")).toBe("");
    expect(formatCoverDate("not-a-date")).toBe("");
  });

  it("uses the GAA throw-in convention", () => {
    expect(formatThrowIn("15:30")).toBe("3.30pm");
    expect(formatThrowIn("14:00")).toBe("2pm");
    expect(formatThrowIn("12:00")).toBe("12pm");
    expect(formatThrowIn("00:15")).toBe("12.15am");
    expect(formatThrowIn("11:05")).toBe("11.05am");
    expect(formatThrowIn("")).toBe("");
    expect(formatThrowIn("7pm")).toBe("");
  });
});
