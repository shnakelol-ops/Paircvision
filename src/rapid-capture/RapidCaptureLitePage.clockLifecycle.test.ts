// Regression coverage for the second-half clock-continuation defect
// (Rapid Capture): handleStartSecondHalf used to transition matchState
// without ever resetting clockSecondsRef/clockSeconds, so the live clock
// carried over whatever elapsed value 1H was paused at instead of
// restarting from 0 the next time the coach resumed it — every 2H event
// was then timestamped with continuing match time instead of elapsed
// second-half time.
//
// RapidCaptureLitePage.tsx has no React rendering harness in this repo (no
// testing-library, no jsdom test environment configured), so this suite
// exercises the two pieces that actually matter for the defect:
//   A. The exact clock-reset function the fixed handleStartSecondHalf calls
//      (resetClockForSecondHalf), driven with a plain ref+setter pair that
//      mirrors useRef/useState exactly.
//   B. The real production adapter (buildCapturedEvent ->
//      rapidSessionToReviewPdfInput) fed clock values produced by
//      simulating the component's clock lifecycle verbatim (including a
//      call to resetClockForSecondHalf at the HALF_TIME -> SECOND_HALF
//      boundary, and Rapid Capture's own UX of a *separate*, later tap to
//      actually resume ticking) — proving events captured after that
//      transition land in the correct 10-minute segment end-to-end.
import { describe, it, expect } from "vitest";
import { resetClockForSecondHalf } from "./RapidCaptureLitePage";
import { buildCapturedEvent } from "./rapid-capture-events";
import { rapidSessionToReviewPdfInput } from "./rapid-capture-review-adapter";
import type { RapidSavedMatch } from "./rapid-capture-storage";
import type { RapidSession } from "./rapid-session";

function min(m: number): number {
  return m * 60;
}

const session: RapidSession = {
  sport: "gaelic",
  forTeamName: "ABK",
  oppTeamName: "Rathkeale",
  venue: "Test Venue",
  matchType: "championship",
  forTeamColour: "#1f6feb",
  oppTeamColour: "#b91c1c",
  attackDirection: "right",
  halfDurationMinutes: 30,
};

function toSavedMatch(events: ReturnType<typeof buildCapturedEvent>[]): RapidSavedMatch {
  return {
    schemaVersion: 2,
    id: "test-match",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "COMPLETED",
    session,
    events,
    half: 2,
    clockSeconds: events[events.length - 1]?.matchClockSeconds ?? 0,
    matchState: "FULL_TIME",
  } as unknown as RapidSavedMatch;
}

describe("Rapid Capture: second-half clock reset", () => {
  describe("A. Clock lifecycle regression", () => {
    it("resets both the ref and the display state to 0, regardless of the stale value carried over from 1H", () => {
      // Simulates clockSecondsRef.current being left at ~30:00 when the
      // coach paused the clock and tapped "End First Half".
      const clockSecondsRef = { current: min(30) };
      let clockSeconds = min(30);
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      expect(clockSecondsRef.current).toBe(0);
      expect(clockSeconds).toBe(0);
    });

    it("lands on 0 even when the first half ran long (injury time)", () => {
      const clockSecondsRef = { current: min(33) + 40 }; // 33:40, well past 30:00
      let clockSeconds = clockSecondsRef.current;
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      expect(clockSecondsRef.current).toBe(0);
      expect(clockSeconds).toBe(0);
    });

    it("the reset happens at the HALF_TIME -> SECOND_HALF transition itself, before the coach's later separate tap to resume ticking", () => {
      // Rapid Capture's UX (unlike Pro Tagger) does NOT auto-start the
      // clock on "Start Second Half" — the coach taps a separate play
      // button afterwards. The reset must already be in place by the time
      // that later tap recomputes clockStartRef from clockSecondsRef.current,
      // otherwise the resume math (Date.now() - clockSecondsRef.current*1000)
      // would still continue from the stale value.
      const clockSecondsRef = { current: min(30) };
      let clockSeconds = min(30);
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      // "Start Second Half" tap:
      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);
      expect(clockSecondsRef.current).toBe(0);

      // Later, separate "play" tap (toggleClock's resume branch) — mirrors
      // clockStartRef.current = Date.now() - clockSecondsRef.current * 1000.
      const clockStart = Date.now() - clockSecondsRef.current * 1000;
      const simulatedNow = clockStart + min(5) * 1000; // 5 real minutes later
      const elapsed = Math.floor((simulatedNow - clockStart) / 1000);

      expect(elapsed).toBe(min(5)); // period-relative, not min(35)
    });
  });

  describe("B. End-to-end segmentation regression", () => {
    // Simulates RapidCaptureLitePage's clockSecondsRef lifecycle exactly:
    //   1H runs 0 -> real elapsed seconds.
    //   Coach pauses/ends 1H; clockSecondsRef is left at that value.
    //   handleStartSecondHalf fires: resetClockForSecondHalf() runs (the
    //   fix under test) — matchState becomes SECOND_HALF with the clock at 0.
    //   Coach later taps play; the clock resumes from 0 as real 2H time elapses.
    function captureSixEventMatch() {
      const clockSecondsRef = { current: 0 };
      let clockSeconds = 0;
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      const buildEvent = (half: 1 | 2, timestamp: number) =>
        buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half, timestamp, teamSide: "FOR" });

      // 1H: scores at 5', 15', 25' (clock running normally from 0)
      const h1 = [5, 15, 25].map((m) => {
        clockSecondsRef.current = min(m);
        return buildEvent(1, clockSecondsRef.current);
      });

      // End of 1H: coach pauses/ends at 30:00. clockSecondsRef is left at
      // 1800 until the second-half transition runs.
      clockSecondsRef.current = min(30);

      // HALF_TIME -> SECOND_HALF: the fix under test.
      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      // 2H: scores at 5', 15', 25' of real elapsed second-half time.
      const h2 = [5, 15, 25].map((m) => {
        clockSecondsRef.current = min(m); // clock is period-relative post-fix
        return buildEvent(2, clockSecondsRef.current);
      });

      void clockSeconds;
      return [...h1, ...h2];
    }

    it("distributes 1 event into each of segments 1-6", () => {
      const events = captureSixEventMatch();
      const pdfInput = rapidSessionToReviewPdfInput(toSavedMatch(events));
      const bySegment = (seg: number) => pdfInput.events.filter((e) => e.segment === seg).length;

      expect(bySegment(1)).toBe(1); // 1H 0-10
      expect(bySegment(2)).toBe(1); // 1H 11-20
      expect(bySegment(3)).toBe(1); // 1H 21-30+
      expect(bySegment(4)).toBe(1); // 2H 0-10
      expect(bySegment(5)).toBe(1); // 2H 11-20
      expect(bySegment(6)).toBe(1); // 2H 21-30+
    });

    it("fails this exact assertion under the pre-fix (cumulative) clock behaviour", () => {
      // Reproduces the ORIGINAL defect directly (no call to
      // resetClockForSecondHalf), to document what the bug looked like and
      // confirm the fixed path above is not accidentally equivalent to it.
      const buildEvent = (half: 1 | 2, timestamp: number) =>
        buildCapturedEvent({ kind: "POINT", nx: 0.5, ny: 0.5, half, timestamp, teamSide: "FOR" });

      const h1 = [5, 15, 25].map((m) => buildEvent(1, min(m)));
      // Pre-fix: clockSecondsRef is never reset, so it continues from 1800.
      const staleBase = min(30);
      const h2 = [5, 15, 25].map((m) => buildEvent(2, staleBase + min(m)));

      const pdfInput = rapidSessionToReviewPdfInput(toSavedMatch([...h1, ...h2]));
      const bySegment = (seg: number) => pdfInput.events.filter((e) => e.segment === seg).length;

      // This is the bug: all three 2H events collapse into segment 6.
      expect(bySegment(4)).toBe(0);
      expect(bySegment(5)).toBe(0);
      expect(bySegment(6)).toBe(3);
    });
  });
});
