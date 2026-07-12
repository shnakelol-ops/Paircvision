import { describe, expect, it } from "vitest";
import {
  halfForMatchState,
  initialMatchStateForHalf,
  isCaptureAllowed,
  isLiveMatchState,
  isTaggingLocked,
  matchStateBadgeLabel,
  pauseActionForMatchState,
  requestEndFirstHalf,
  requestEndMatch,
  startSecondHalf,
  type RapidMatchState,
} from "./rapid-match-state";

describe("half derivation", () => {
  it("FIRST_HALF and HALF_TIME are half 1", () => {
    expect(halfForMatchState("FIRST_HALF")).toBe(1);
    expect(halfForMatchState("HALF_TIME")).toBe(1);
  });

  it("SECOND_HALF and FULL_TIME are half 2", () => {
    expect(halfForMatchState("SECOND_HALF")).toBe(2);
    expect(halfForMatchState("FULL_TIME")).toBe(2);
  });
});

describe("tagging lock", () => {
  it("is unlocked during FIRST_HALF and SECOND_HALF", () => {
    expect(isTaggingLocked("FIRST_HALF")).toBe(false);
    expect(isTaggingLocked("SECOND_HALF")).toBe(false);
  });

  it("is locked during SETUP, HALF_TIME and FULL_TIME", () => {
    expect(isTaggingLocked("SETUP")).toBe(true);
    expect(isTaggingLocked("HALF_TIME")).toBe(true);
    expect(isTaggingLocked("FULL_TIME")).toBe(true);
  });
});

describe("capture gate (authoritative pitch-tap guard)", () => {
  it("allows capture only when live half AND clock running", () => {
    expect(isCaptureAllowed("FIRST_HALF", true)).toBe(true);
    expect(isCaptureAllowed("SECOND_HALF", true)).toBe(true);
  });

  it("blocks capture when the clock is paused mid-half", () => {
    expect(isCaptureAllowed("FIRST_HALF", false)).toBe(false);
    expect(isCaptureAllowed("SECOND_HALF", false)).toBe(false);
  });

  it("blocks capture at half time and full time regardless of clockRunning", () => {
    expect(isCaptureAllowed("HALF_TIME", true)).toBe(false);
    expect(isCaptureAllowed("FULL_TIME", true)).toBe(false);
  });
});

describe("pause action selection", () => {
  it("offers End First Half during FIRST_HALF", () => {
    expect(pauseActionForMatchState("FIRST_HALF")).toBe("END_FIRST_HALF");
  });

  it("offers End Match during SECOND_HALF", () => {
    expect(pauseActionForMatchState("SECOND_HALF")).toBe("END_MATCH");
  });

  it("offers nothing outside a live half", () => {
    expect(pauseActionForMatchState("HALF_TIME")).toBeNull();
    expect(pauseActionForMatchState("FULL_TIME")).toBeNull();
    expect(pauseActionForMatchState("SETUP")).toBeNull();
  });
});

describe("end-half confirmation", () => {
  it("transitions FIRST_HALF -> HALF_TIME when confirmed", () => {
    expect(requestEndFirstHalf("FIRST_HALF", () => true)).toBe("HALF_TIME");
  });

  it("stays in FIRST_HALF when the coach declines the confirmation", () => {
    expect(requestEndFirstHalf("FIRST_HALF", () => false)).toBe("FIRST_HALF");
  });

  it("is a no-op outside FIRST_HALF (confirm is never even consulted)", () => {
    let called = false;
    const confirm = () => {
      called = true;
      return true;
    };
    expect(requestEndFirstHalf("SECOND_HALF", confirm)).toBe("SECOND_HALF");
    expect(requestEndFirstHalf("HALF_TIME", confirm)).toBe("HALF_TIME");
    expect(called).toBe(false);
  });
});

describe("start second half", () => {
  it("transitions HALF_TIME -> SECOND_HALF", () => {
    expect(startSecondHalf("HALF_TIME")).toBe("SECOND_HALF");
  });

  it("is a no-op from any other state", () => {
    (["FIRST_HALF", "SECOND_HALF", "FULL_TIME", "SETUP"] as RapidMatchState[]).forEach((s) => {
      expect(startSecondHalf(s)).toBe(s);
    });
  });
});

describe("end-match confirmation", () => {
  it("transitions SECOND_HALF -> FULL_TIME when confirmed", () => {
    expect(requestEndMatch("SECOND_HALF", () => true)).toBe("FULL_TIME");
  });

  it("stays in SECOND_HALF when the coach declines the confirmation", () => {
    expect(requestEndMatch("SECOND_HALF", () => false)).toBe("SECOND_HALF");
  });

  it("is a no-op outside SECOND_HALF", () => {
    let called = false;
    const confirm = () => {
      called = true;
      return true;
    };
    expect(requestEndMatch("FIRST_HALF", confirm)).toBe("FIRST_HALF");
    expect(requestEndMatch("HALF_TIME", confirm)).toBe("HALF_TIME");
    expect(requestEndMatch("FULL_TIME", confirm)).toBe("FULL_TIME");
    expect(called).toBe(false);
  });
});

describe("restore from every state", () => {
  it("recognises every live match state", () => {
    expect(isLiveMatchState("FIRST_HALF")).toBe(true);
    expect(isLiveMatchState("HALF_TIME")).toBe(true);
    expect(isLiveMatchState("SECOND_HALF")).toBe(true);
    expect(isLiveMatchState("FULL_TIME")).toBe(true);
  });

  it("rejects SETUP and unknown values as a persisted live state", () => {
    expect(isLiveMatchState("SETUP")).toBe(false);
    expect(isLiveMatchState("NOT_A_STATE")).toBe(false);
    expect(isLiveMatchState(undefined)).toBe(false);
  });

  it("derives a sensible initial state for an imported/legacy half", () => {
    expect(initialMatchStateForHalf(1)).toBe("FIRST_HALF");
    expect(initialMatchStateForHalf(2)).toBe("SECOND_HALF");
  });
});

describe("full match lifecycle", () => {
  it("walks FIRST_HALF pause/resume -> end-half confirmation -> HALF_TIME lock -> start 2H -> SECOND_HALF pause/resume -> full-time completion", () => {
    let state: RapidMatchState = "FIRST_HALF";
    let clockRunning = true;

    // 1H: running, then paused (pause tapped), then resumed.
    expect(isCaptureAllowed(state, clockRunning)).toBe(true);
    clockRunning = false;
    expect(isCaptureAllowed(state, clockRunning)).toBe(false);
    expect(pauseActionForMatchState(state)).toBe("END_FIRST_HALF");
    clockRunning = true;
    expect(isCaptureAllowed(state, clockRunning)).toBe(true);

    // Pause again, then End First Half with confirmation.
    clockRunning = false;
    state = requestEndFirstHalf(state, () => true);
    expect(state).toBe("HALF_TIME");

    // Halftime lock: tagging is locked regardless of what clockRunning claims.
    expect(isTaggingLocked(state)).toBe(true);
    expect(isCaptureAllowed(state, true)).toBe(false);
    expect(halfForMatchState(state)).toBe(1);

    // Start Second Half.
    state = startSecondHalf(state);
    expect(state).toBe("SECOND_HALF");
    expect(halfForMatchState(state)).toBe(2);
    expect(isTaggingLocked(state)).toBe(false);

    // 2H: running, then paused, then resumed — offers End Match, not End First Half.
    clockRunning = true;
    expect(isCaptureAllowed(state, clockRunning)).toBe(true);
    clockRunning = false;
    expect(pauseActionForMatchState(state)).toBe("END_MATCH");
    clockRunning = true;
    expect(isCaptureAllowed(state, clockRunning)).toBe(true);

    // Pause again, then End Match with confirmation -> full-time completion.
    clockRunning = false;
    state = requestEndMatch(state, () => true);
    expect(state).toBe("FULL_TIME");
    expect(isTaggingLocked(state)).toBe(true);
    expect(halfForMatchState(state)).toBe(2);
  });

  it("declining the end-half/end-match confirmation keeps the half live and capturable", () => {
    let state: RapidMatchState = "FIRST_HALF";
    state = requestEndFirstHalf(state, () => false);
    expect(state).toBe("FIRST_HALF");
    expect(isCaptureAllowed(state, true)).toBe(true);

    state = "SECOND_HALF";
    state = requestEndMatch(state, () => false);
    expect(state).toBe("SECOND_HALF");
    expect(isCaptureAllowed(state, true)).toBe(true);
  });
});

describe("badge labels", () => {
  it("has a distinct label for every state", () => {
    const states: RapidMatchState[] = ["SETUP", "FIRST_HALF", "HALF_TIME", "SECOND_HALF", "FULL_TIME"];
    const labels = states.map(matchStateBadgeLabel);
    expect(new Set(labels).size).toBe(states.length);
  });
});
