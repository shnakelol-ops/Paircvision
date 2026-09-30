// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { deriveSegmentFromPeriodClock } from "../stats/statsSegments";
import { buildQuickReviewSegmentBreakdown } from "../stats/reporting/quickReviewSegmentBreakdown";
import { QuickReviewPage3 } from "./QuickReviewPage3";

afterEach(() => {
  cleanup();
});

/**
 * Regression lock for the V1 Full Time Page 3 blocker. At Half Time the page
 * renders exactly the original first-half-only layout (no half headings,
 * one Home + one Away table). At Full Time it stacks a First Half section
 * and a Second Half section vertically, each with Home + Away
 * Early/Mid/Late tables — never six horizontal columns.
 */

let nextId = 0;
function ev(kind: LoggedMatchEvent["kind"], teamSide: "FOR" | "OPP", half: 1 | 2, clock: number): LoggedMatchEvent {
  const period = half === 2 ? "2H" : "1H";
  return {
    id: `p3-${nextId++}`,
    kind,
    type: kind,
    teamSide,
    nx: 0.5,
    ny: 0.5,
    x: 50,
    y: 50,
    half,
    period,
    timestamp: clock,
    matchClockSeconds: clock,
    createdAt: clock,
    segment: deriveSegmentFromPeriodClock(period, clock),
  } as LoggedMatchEvent;
}

const HOME = "Ballylanders";
const AWAY = "Opposition";
const EVENTS = [
  ev("GOAL", "FOR", 1, 60),     // 1H Early: home 1-00
  ev("POINT", "OPP", 2, 1300),  // 2H Late: away 0-01
];

function renderPage(fullTime: boolean) {
  const model = buildQuickReviewSegmentBreakdown(EVENTS, HOME, AWAY, "RIGHT");
  const secondHalfModel = fullTime ? buildQuickReviewSegmentBreakdown(EVENTS, HOME, AWAY, "RIGHT", 2) : null;
  return render(
    <QuickReviewPage3 model={model} secondHalfModel={secondHalfModel} homeColour="#fff" awayColour="#000" />,
  );
}

describe("QuickReviewPage3 — Half Time vs Full Time", () => {
  it("Half Time: first half only — one table per team, no half headings, no second-half values", () => {
    const { container } = renderPage(false);
    expect(screen.queryByText("First Half")).toBeNull();
    expect(screen.queryByText("Second Half")).toBeNull();
    expect(screen.getAllByText(HOME.toUpperCase())).toHaveLength(1);
    expect(screen.getAllByText(AWAY.toUpperCase())).toHaveLength(1);
    expect(container.querySelectorAll("section")).toHaveLength(2);
    expect(screen.getByText("Early 0–10 · Mid 10–20 · Late 20+")).toBeTruthy();
    expect(screen.getAllByText("1-00")).toHaveLength(1);
    expect(screen.queryByText("0-01")).toBeNull();
  });

  it("Half Time: rendering is identical to the pre-fix call without a secondHalfModel prop", () => {
    const model = buildQuickReviewSegmentBreakdown(EVENTS, HOME, AWAY, "RIGHT");
    const a = render(<QuickReviewPage3 model={model} homeColour="#fff" awayColour="#000" />).container.innerHTML;
    cleanup();
    const b = renderPage(false).container.innerHTML;
    expect(b).toBe(a);
  });

  it("Full Time: stacks First Half then Second Half, each with both teams' Early/Mid/Late tables", () => {
    const { container } = renderPage(true);
    const firstHeading = screen.getByText("First Half");
    const secondHeading = screen.getByText("Second Half");
    expect(firstHeading.compareDocumentPosition(secondHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.firstElementChild?.textContent)).toEqual([
      HOME.toUpperCase(), AWAY.toUpperCase(), HOME.toUpperCase(), AWAY.toUpperCase(),
    ]);
    // Every table keeps the 3-column Early/Mid/Late layout.
    for (const s of sections) {
      expect(s.textContent).toContain("Early");
      expect(s.textContent).toContain("Mid");
      expect(s.textContent).toContain("Late");
    }

    // 1H home goal appears only in the first-half home table; 2H away point only in the second-half away table.
    expect(sections[0].textContent).toContain("1-00");
    expect(sections[2].textContent).not.toContain("1-00");
    expect(sections[3].textContent).toContain("0-01");
    expect(sections[1].textContent).not.toContain("0-01");
  });
});
