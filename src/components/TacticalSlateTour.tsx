import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

// Tactical Slate's own first-run guided tour — separate from the app-wide
// GuidedTour (src/components/GuidedTour.tsx), which is a generic slideshow
// and does not teach any workflow. This tour teaches exactly one thing:
// design a starting shape, phase through it, watch it, save it. See
// "Tactical Slate Phase D" for the design brief this implements.
//
// Deliberately has no dimmed backdrop / cutout mask. A full-screen overlay
// with a "hole" over the pitch would risk intercepting pointer events on
// player tokens if the cutout math were ever off by a pixel — since player
// movement must never be blocked, this tour only draws a non-interactive
// ring around the current step's target button and leaves the entire pitch
// (and everything else) fully interactive throughout.

// Permanent — only ever written once all four steps are actually completed.
// Checked before ever auto-starting the tour again.
const TACTICAL_SLATE_TOUR_COMPLETED_KEY = "paircvision_tactical_slate_tour_v1";
// Session-only — written by "Not Now". Cleared automatically when the browser
// tab/session ends (sessionStorage, not localStorage), or immediately by a
// manual replay from the menu. Never marks the tour as done.
const TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY = "paircvision_tactical_slate_tour_session_dismissed_v1";

export { TACTICAL_SLATE_TOUR_COMPLETED_KEY, TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY };

export type TacticalSlateTourStep = 1 | 2 | 3 | 4;

export type TacticalSlateTourSignals = {
  /** Gates the automatic first-run start only — tactical surface, fresh board. */
  autoStartEligible: boolean;
  phaseCount: number;
  isPlaying: boolean;
  isPaused: boolean;
  /** Increments once per completed Set Start call (see doSetStart in TacticalPadLiteClean). */
  setStartSignal: number;
  /** The board's last-saved timestamp (existing lastBoardSavedAtMillis state) — any
   *  change while on step 4 means a save completed. */
  boardSavedSignal: number | null;
  /** Increments when the coach picks "Guided Tour" from the menu. Always
   *  (re)starts the tour from step 1, bypassing both the completed flag and
   *  the session dismissal — a deliberate replay overrides both. */
  restartSignal: number;
};

export type TacticalSlateTourState = {
  active: boolean;
  step: TacticalSlateTourStep | null;
  justFinished: boolean;
  /** "Not Now" — dismiss for this session only. Does not mark the tour complete. */
  notNow: () => void;
};

function initBaselineRefs(
  signals: TacticalSlateTourSignals,
  refs: {
    prevSetStartSignalRef: RefObject<number | null>;
    prevIsPlayingRef: RefObject<boolean>;
    boardSavedBaselineRef: RefObject<number | null>;
    boardSavedBaselineSetRef: RefObject<boolean>;
  },
) {
  refs.prevSetStartSignalRef.current = signals.setStartSignal;
  refs.prevIsPlayingRef.current = signals.isPlaying;
  refs.boardSavedBaselineRef.current = signals.boardSavedSignal;
  refs.boardSavedBaselineSetRef.current = true;
}

export function useTacticalSlateTour(signals: TacticalSlateTourSignals): TacticalSlateTourState {
  const [step, setStep] = useState<TacticalSlateTourStep | null>(null);
  const [justFinished, setJustFinished] = useState(false);

  const hasAutoStartedRef = useRef(false);
  const phaseCountAtStep2StartRef = useRef(0);
  const prevSetStartSignalRef = useRef<number | null>(null);
  const prevIsPlayingRef = useRef(false);
  const prevRestartSignalRef = useRef<number | null>(null);
  // boardSavedSignal is number | null — null is *also* the legitimate "never
  // saved" value, so it can't double as its own "not initialized yet"
  // sentinel the way prevSetStartSignalRef (always a number) can. A separate
  // boolean tracks whether the baseline has actually been captured.
  const boardSavedBaselineRef = useRef<number | null>(null);
  const boardSavedBaselineSetRef = useRef(false);

  // Auto-start once per mount, the first time the surface is ready — unless
  // already completed (permanent) or dismissed for this session.
  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    if (!signals.autoStartEligible) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TACTICAL_SLATE_TOUR_COMPLETED_KEY)) return;
    if (window.sessionStorage.getItem(TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY)) return;
    hasAutoStartedRef.current = true;
    initBaselineRefs(signals, {
      prevSetStartSignalRef,
      prevIsPlayingRef,
      boardSavedBaselineRef,
      boardSavedBaselineSetRef,
    });
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.autoStartEligible]);

  // Manual replay from the menu — always (re)starts from step 1, regardless
  // of current step or stored completed/dismissed state. A deliberate replay
  // request overrides both.
  useEffect(() => {
    if (prevRestartSignalRef.current === null) {
      prevRestartSignalRef.current = signals.restartSignal;
      return;
    }
    if (signals.restartSignal === prevRestartSignalRef.current) return;
    prevRestartSignalRef.current = signals.restartSignal;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY);
    }
    hasAutoStartedRef.current = true;
    initBaselineRefs(signals, {
      prevSetStartSignalRef,
      prevIsPlayingRef,
      boardSavedBaselineRef,
      boardSavedBaselineSetRef,
    });
    setJustFinished(false);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.restartSignal]);

  // Step 1 -> 2: Set Start actually ran.
  useEffect(() => {
    if (step !== 1) return;
    if (prevSetStartSignalRef.current === null) {
      prevSetStartSignalRef.current = signals.setStartSignal;
      return;
    }
    if (signals.setStartSignal !== prevSetStartSignalRef.current) {
      phaseCountAtStep2StartRef.current = signals.phaseCount;
      setStep(2);
    }
  }, [step, signals.setStartSignal, signals.phaseCount]);

  // Step 2 -> 3: two phases added since this step began (handles any starting count).
  useEffect(() => {
    if (step !== 2) return;
    if (signals.phaseCount >= phaseCountAtStep2StartRef.current + 2) {
      setStep(3);
    }
  }, [step, signals.phaseCount]);

  // Step 3 -> 4: playback finished on its own (isPlaying true->false with isPaused
  // still false). A manual Pause instead leaves isPaused true and does not advance —
  // the tour never interrupts playback and never treats a pause as "watched."
  useEffect(() => {
    if (step !== 3) {
      prevIsPlayingRef.current = signals.isPlaying;
      return;
    }
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = signals.isPlaying;
    if (wasPlaying && !signals.isPlaying && !signals.isPaused) {
      setStep(4);
    }
  }, [step, signals.isPlaying, signals.isPaused]);

  // Step 4 -> done: a save completed.
  useEffect(() => {
    if (step !== 4) return;
    if (!boardSavedBaselineSetRef.current) {
      boardSavedBaselineRef.current = signals.boardSavedSignal;
      boardSavedBaselineSetRef.current = true;
      return;
    }
    if (signals.boardSavedSignal !== boardSavedBaselineRef.current) {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, signals.boardSavedSignal]);

  function finish() {
    if (typeof window !== "undefined") {
      // Completed — permanent, never auto-shown again. A prior "Not Now"
      // dismissal for this session is moot now, but clear it anyway so
      // nothing stale lingers in sessionStorage.
      window.localStorage.setItem(TACTICAL_SLATE_TOUR_COMPLETED_KEY, "seen");
      window.sessionStorage.removeItem(TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY);
    }
    setStep(null);
    setJustFinished(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setJustFinished(false), 2600);
    }
  }

  function notNow() {
    if (typeof window !== "undefined") {
      // Session-only — deliberately does NOT touch the completed flag, so
      // the tour is still eligible to auto-start next session (or right away
      // via a manual replay from the menu).
      window.sessionStorage.setItem(TACTICAL_SLATE_TOUR_SESSION_DISMISSED_KEY, "dismissed");
    }
    setStep(null);
    setJustFinished(false);
  }

  return { active: step !== null, step, justFinished, notNow };
}

const STEP_COPY: Record<TacticalSlateTourStep, { title: string; instruction: string; explain?: string }> = {
  1: {
    title: "Set your starting shape",
    instruction: "Move your players into their starting positions, then tap Set Start.",
    explain: "Set Start tells Tactical Slate where your team begins before building phases.",
  },
  2: {
    title: "Build your sequence",
    instruction: "Move your players into their next shape, then tap Add Phase. Repeat once more.",
    explain: "Each Phase saves your team's next position.",
  },
  3: {
    title: "Watch your board",
    instruction: "Press Play to watch your team move through each phase.",
  },
  4: {
    title: "Save your board",
    instruction: "Save your board so you can edit and reuse it later.",
  },
};

export function TacticalSlateTour({
  step,
  justFinished,
  onNotNow,
  targetRef,
}: {
  step: TacticalSlateTourStep | null;
  justFinished: boolean;
  onNotNow: () => void;
  targetRef: RefObject<HTMLElement | null> | null;
}) {
  const [ring, setRing] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!targetRef) {
      setRing(null);
      return;
    }
    // Reads targetRef.current fresh on every call — not captured once at setup
    // — because the button lives inside a panel (Phases controls / My Boards)
    // that the tour opens itself right as a step begins. That panel mount
    // happens a render after this effect first runs, so el is null on the
    // first measure; the MutationObserver below is what catches it mounting a
    // moment later (and any subsequent layout change).
    const measure = () => {
      const el = targetRef.current;
      if (!el) {
        setRing(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setRing({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [targetRef, step]);

  if (justFinished) {
    return (
      <div style={S.closingToast} role="status" aria-live="polite">
        You're ready to build your own tactical boards.
      </div>
    );
  }

  if (step == null) return null;

  const copy = STEP_COPY[step];

  return (
    <>
      {ring ? (
        <div
          aria-hidden="true"
          style={{
            ...S.ring,
            top: ring.top - 6,
            left: ring.left - 6,
            width: ring.width + 12,
            height: ring.height + 12,
          }}
        />
      ) : null}
      <div style={S.card} role="status" aria-live="polite" aria-label={copy.title}>
        <p style={S.title}>{copy.title}</p>
        <p style={S.instruction}>{copy.instruction}</p>
        {copy.explain ? <p style={S.explain}>{copy.explain}</p> : null}
        <button type="button" style={S.skipBtn} onClick={onNotNow}>
          Not Now
        </button>
      </div>
    </>
  );
}

const S = {
  ring: {
    position: "fixed",
    zIndex: 9990,
    borderRadius: "12px",
    border: "2px solid #7CFF72",
    boxShadow: "0 0 0 3px rgba(124,255,114,0.22), 0 0 18px rgba(124,255,114,0.45)",
    pointerEvents: "none",
    transition: "top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease",
  } as CSSProperties,

  card: {
    // Anchored to the top, not the bottom: the controls popout (Set Start /
    // Add Phase / Play) and the My Boards panel both live in the bottom/middle
    // of the screen, so a bottom-anchored card would sit on top of the very
    // buttons it's meant to be pointing at.
    position: "fixed",
    left: "50%",
    top: "max(18px, env(safe-area-inset-top))",
    transform: "translateX(-50%)",
    zIndex: 9991,
    width: "min(92vw, 360px)",
    borderRadius: "16px",
    border: "1px solid #275C3B",
    background: "linear-gradient(180deg, rgba(23,61,40,0.97) 0%, rgba(16,41,27,0.97) 100%)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    padding: "14px 16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as CSSProperties,

  title: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 760,
    color: "#7CFF72",
    letterSpacing: "0.01em",
  } as CSSProperties,

  instruction: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 600,
    color: "#F1F7F0",
    lineHeight: 1.4,
  } as CSSProperties,

  explain: {
    margin: 0,
    fontSize: "12px",
    color: "#8FA099",
    lineHeight: 1.4,
  } as CSSProperties,

  skipBtn: {
    alignSelf: "flex-end",
    marginTop: "6px",
    border: "none",
    background: "transparent",
    color: "#8FA099",
    fontSize: "12px",
    fontWeight: 650,
    cursor: "pointer",
    padding: "4px 2px",
  } as CSSProperties,

  closingToast: {
    position: "fixed",
    left: "50%",
    top: "max(18px, env(safe-area-inset-top))",
    transform: "translateX(-50%)",
    zIndex: 9991,
    width: "min(92vw, 360px)",
    borderRadius: "16px",
    border: "1px solid #275C3B",
    background: "linear-gradient(180deg, rgba(23,61,40,0.97) 0%, rgba(16,41,27,0.97) 100%)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    padding: "14px 16px",
    color: "#F1F7F0",
    fontSize: "14px",
    fontWeight: 650,
    textAlign: "center",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as CSSProperties,
};
