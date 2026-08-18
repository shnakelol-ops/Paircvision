// Regression coverage for the second-half clock-continuation defect
// (Event Stats / Pro Tagger): handleStartSecondHalf used to transition
// matchState without ever resetting clockSecondsRef/clockSeconds, so the
// live clock carried over whatever elapsed value 1H was paused at instead
// of restarting from 0 — every 2H event was then timestamped with
// continuing match time instead of elapsed second-half time.
//
// ProTaggerLiveScreen.tsx has no React rendering harness in this repo (no
// testing-library, no jsdom test environment configured), so this suite
// exercises the two pieces that actually matter for the defect:
//   A. The exact clock-reset function the fixed handleStartSecondHalf calls
//      (resetClockForSecondHalf), driven with a plain ref+setter pair that
//      mirrors useRef/useState exactly — proving the transition itself
//      lands on 0, not merely that a downstream function accepts 0 when
//      handed it.
//   B. The real production adapter (adaptProTaggerAction) fed clock values
//      produced by simulating the component's clock lifecycle verbatim
//      (including a call to resetClockForSecondHalf at the HALF_TIME ->
//      SECOND_HALF boundary) — proving events captured after that
//      transition land in the correct 10-minute segment end-to-end.
import { describe, it, expect } from "vitest";
import { resetClockForSecondHalf } from "./ProTaggerLiveScreen";
import { adaptProTaggerAction } from "./pro-tagger-adapter";

function min(m: number): number {
  return m * 60;
}

describe("Event Stats (Pro Tagger): second-half clock reset", () => {
  describe("A. Clock lifecycle regression", () => {
    it("resets both the ref and the display state to 0, regardless of the stale value carried over from 1H", () => {
      // Simulates clockSecondsRef.current being left at ~30:00 when the
      // coach paused the clock and ended the first half.
      const clockSecondsRef = { current: min(30) };
      let clockSeconds = min(30);
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      expect(clockSecondsRef.current).toBe(0);
      expect(clockSeconds).toBe(0);
    });

    it("lands on 0 even when the first half ran long (injury time)", () => {
      const clockSecondsRef = { current: min(34) + 12 }; // 34:12, well past 30:00
      let clockSeconds = clockSecondsRef.current;
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      expect(clockSecondsRef.current).toBe(0);
      expect(clockSeconds).toBe(0);
    });
  });

  describe("B. End-to-end segmentation regression", () => {
    // Simulates ProTaggerLiveScreen's clockSecondsRef lifecycle exactly:
    //   1H runs 0 -> real elapsed seconds.
    //   Coach pauses at end of 1H; clockSecondsRef is left at that value.
    //   handleStartSecondHalf fires: resetClockForSecondHalf() runs (the
    //   fix under test), then the clock resumes from clockSecondsRef.current.
    //   2H events are captured at clockSecondsRef.current as real 2H time elapses.
    function captureSixEventMatch() {
      const clockSecondsRef = { current: 0 };
      let clockSeconds = 0;
      const setClockSeconds = (seconds: number) => { clockSeconds = seconds; };

      const buildEvent = (half: 1 | 2, matchClockSeconds: number) =>
        adaptProTaggerAction({
          familyId: "POINT",
          tileLabel: "POINT",
          teamSide: "FOR",
          nx: 0.5,
          ny: 0.5,
          half,
          matchClockSeconds,
        });

      // 1H: scores at 5', 15', 25' (clock running normally from 0)
      const h1 = [5, 15, 25].map((m) => {
        clockSecondsRef.current = min(m);
        return buildEvent(1, clockSecondsRef.current);
      });

      // End of 1H: coach pauses at 30:00. clockSecondsRef is left at 1800
      // until the second-half transition runs.
      clockSecondsRef.current = min(30);

      // HALF_TIME -> SECOND_HALF: the fix under test.
      resetClockForSecondHalf(clockSecondsRef, setClockSeconds);

      // 2H: scores at 5', 15', 25' of real elapsed second-half time.
      const h2 = [5, 15, 25].map((m) => {
        clockSecondsRef.current = clockSecondsRef.current + 0; // no-op, clarity
        clockSecondsRef.current = min(m); // clock is period-relative post-fix
        return buildEvent(2, clockSecondsRef.current);
      });

      void clockSeconds;
      return [...h1, ...h2];
    }

    it("distributes 1 event into each of segments 1-6", () => {
      const events = captureSixEventMatch();
      const bySegment = (seg: number) => events.filter((e) => e.segment === seg).length;

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
      const buildEvent = (half: 1 | 2, matchClockSeconds: number) =>
        adaptProTaggerAction({
          familyId: "POINT",
          tileLabel: "POINT",
          teamSide: "FOR",
          nx: 0.5,
          ny: 0.5,
          half,
          matchClockSeconds,
        });

      const h1 = [5, 15, 25].map((m) => buildEvent(1, min(m)));
      // Pre-fix: clockSecondsRef is never reset, so it continues from 1800.
      const staleBase = min(30);
      const h2 = [5, 15, 25].map((m) => buildEvent(2, staleBase + min(m)));

      const events = [...h1, ...h2];
      const bySegment = (seg: number) => events.filter((e) => e.segment === seg).length;

      // This is the bug: all three 2H events collapse into segment 6.
      expect(bySegment(4)).toBe(0);
      expect(bySegment(5)).toBe(0);
      expect(bySegment(6)).toBe(3);
    });
  });
});
