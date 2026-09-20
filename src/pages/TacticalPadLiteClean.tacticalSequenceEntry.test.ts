import { describe, expect, it } from "vitest";

import {
  TACTICAL_SEQUENCE_ROUTE,
  TACTICAL_SEQUENCE_MENU_LABEL,
  TACTICAL_SEQUENCE_MENU_SUBTITLE,
} from "./TacticalPadLiteClean";

/**
 * Regression lock for the Tactical Sequence Menu entry (final release
 * integration — exposes the existing, already-audited Game Timing
 * experience from Standard Slate's Menu popout under its approved
 * coach-facing name). A live createTacticalPadLiteSurface() instance
 * cannot be constructed in this test environment (no jsdom/canvas — same
 * documented limitation as TacticalPadLiteClean.drawTools.test.ts and
 * TacticalPadLiteClean.kitEditor.test.ts), so this proves the two things
 * that actually matter and are cheaply, directly testable: the route this
 * entry navigates to, and the exact approved copy it renders. The menu
 * button itself just reads these same exported constants (see
 * goToTacticalSequence and the Menu popout JSX in TacticalPadLiteClean.tsx),
 * so this is not a duplicate of the button — it is its single source of
 * truth.
 */

describe("Tactical Sequence Menu entry — route and approved copy", () => {
  it("navigates to the existing, unchanged Game Timing route", () => {
    expect(TACTICAL_SEQUENCE_ROUTE).toBe("/vision-tactics/play");
  });

  it("uses the approved public name and supporting copy, verbatim", () => {
    expect(TACTICAL_SEQUENCE_MENU_LABEL).toBe("Tactical Sequence");
    expect(TACTICAL_SEQUENCE_MENU_SUBTITLE).toBe("Build in-game movement and timing");
  });
});
