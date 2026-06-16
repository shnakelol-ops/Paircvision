import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const TOUR_KEY = "paircvision_tp_tour_v1";

type Step = {
  title: string;
  body: string;
  targetId: string | null;
  openControls?: true;
};

const STEPS: Step[] = [
  {
    title: "Bring Your Vision to Life",
    body: "Create realistic player movement to rehearse your coaching ideas before training.",
    targetId: null,
  },
  {
    title: "Set the Scene",
    body: "Start with a shape or scenario. You can move players and make changes at any time.",
    targetId: "tp-setup",
  },
  {
    title: "Draw a Run",
    body: "Choose Route, tap a player, then draw where you want them to run.",
    targetId: "tp-route",
    openControls: true,
  },
  {
    title: "Add the Ball",
    body: "Choose who starts in possession before the movement begins.",
    targetId: "tp-ball",
  },
  {
    title: "Press Play",
    body: "Watch the movement back and bring your coaching idea to life.",
    targetId: "tp-play",
  },
  {
    title: "You're Ready",
    body: "You've created your first movement. Add more runs, passes and behaviours whenever you're ready.",
    targetId: null,
  },
];

const TOTAL = STEPS.length;
const SPOT_PAD = 10;

type SpotRect = { top: number; left: number; width: number; height: number };

type Props = {
  isPortrait: boolean;
  onOpenControls: () => void;
};

export default function TacticalPlayTour({ isPortrait, onOpenControls }: Props) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(TOUR_KEY);
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);

  // Keep a stable ref so the effect dependency on onOpenControls doesn't cause re-fires
  const openControlsRef = useRef(onOpenControls);
  useEffect(() => { openControlsRef.current = onOpenControls; }, [onOpenControls]);

  const resolveSpot = useCallback((targetId: string, delay: number) => {
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-tour-id="${targetId}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setSpotRect(null);
      }
    }, delay);
    return t;
  }, []);

  useEffect(() => {
    if (!visible || isPortrait) return;

    const s = STEPS[stepIndex];

    if (s.openControls) {
      openControlsRef.current();
    }

    if (!s.targetId) {
      setSpotRect(null);
      return;
    }

    // Delay when the CTRL panel needs to open first so buttons are in the DOM
    const t = resolveSpot(s.targetId, s.openControls ? 100 : 0);
    return () => window.clearTimeout(t);
  }, [stepIndex, visible, isPortrait, resolveSpot]);

  if (!visible || isPortrait) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === TOTAL - 1;
  const showProgress = !isLast;

  function dismiss() {
    window.localStorage.setItem(TOUR_KEY, "seen");
    setVisible(false);
  }

  function advance() {
    if (isLast) {
      dismiss();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  // Build padded spotlight rect
  const spot: SpotRect | null = spotRect
    ? {
        top: spotRect.top - SPOT_PAD,
        left: spotRect.left - SPOT_PAD,
        width: spotRect.width + SPOT_PAD * 2,
        height: spotRect.height + SPOT_PAD * 2,
      }
    : null;

  // Card vertical position: if spotlight is in bottom half, card appears above it; no spotlight → centered
  const vh = window.innerHeight;
  const cardTop: number | string = spot
    ? spot.top > vh * 0.5
      ? Math.max(20, spot.top - 180)
      : spot.top + spot.height + 16
    : "50%";
  const cardTransform = spot ? "translateX(-50%)" : "translate(-50%, -50%)";

  const cardStyle: CSSProperties = {
    position: "fixed",
    top: cardTop,
    left: "50%",
    transform: cardTransform,
    width: "min(272px, calc(100vw - 48px))",
    zIndex: 29,
    borderRadius: 16,
    border: "1px solid rgba(180, 210, 255, 0.13)",
    background:
      "linear-gradient(160deg, rgba(10, 18, 38, 0.97) 0%, rgba(6, 12, 28, 0.97) 100%)",
    boxShadow:
      "0 24px 56px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    padding: "18px 16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    pointerEvents: "auto",
  };

  return (
    <>
      {/* Full-screen event capture layer — stops accidental taps on underlying controls */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 28,
          background: spot ? "rgba(0,0,0,0.01)" : "rgba(0, 0, 0, 0.74)",
          pointerEvents: "auto",
        }}
      />

      {/* Spotlight hole: box-shadow creates the dark frame around the target */}
      {spot && (
        <div
          style={{
            position: "fixed",
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.74)",
            zIndex: 28,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tour card */}
      <div style={cardStyle} role="dialog" aria-modal="true" aria-label={step.title}>
        {showProgress && (
          <div style={S.dots}>
            {STEPS.slice(0, TOTAL - 1).map((_, i) => (
              <span key={i} style={i === stepIndex ? S.dotActive : S.dot} />
            ))}
          </div>
        )}

        <h2 style={S.title}>{step.title}</h2>
        <p style={S.body}>{step.body}</p>

        {showProgress && (
          <p style={S.counter}>{stepIndex + 1} / {TOTAL}</p>
        )}

        <div style={S.row}>
          {isLast ? (
            <button type="button" style={{ ...S.nextBtn, flex: 1 }} onClick={dismiss}>
              {"Let's go →"}
            </button>
          ) : (
            <>
              <button type="button" style={S.skipBtn} onClick={dismiss}>
                Skip
              </button>
              {stepIndex > 0 && (
                <button type="button" style={S.backBtn} onClick={back}>
                  Back
                </button>
              )}
              <button type="button" style={S.nextBtn} onClick={advance}>
                Next
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const FONT = "Inter, system-ui, -apple-system, sans-serif";

const S = {
  dots: {
    display: "flex",
    gap: 5,
  } as CSSProperties,

  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.15)",
    flexShrink: 0,
    transition: "width 0.18s, background 0.18s",
  } as CSSProperties,

  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 999,
    background: "#22c55e",
    flexShrink: 0,
    transition: "width 0.18s, background 0.18s",
  } as CSSProperties,

  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 760,
    color: "#f1f7f0",
    lineHeight: 1.2,
    letterSpacing: "0.01em",
    fontFamily: FONT,
  } as CSSProperties,

  body: {
    margin: 0,
    fontSize: 13,
    color: "#8fa099",
    lineHeight: 1.5,
    fontFamily: FONT,
  } as CSSProperties,

  counter: {
    margin: 0,
    fontSize: 10,
    color: "rgba(143, 160, 153, 0.55)",
    fontFamily: FONT,
  } as CSSProperties,

  row: {
    display: "flex",
    gap: 8,
  } as CSSProperties,

  skipBtn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(180, 210, 255, 0.12)",
    background: "transparent",
    color: "rgba(143, 160, 153, 0.80)",
    fontSize: 12,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: FONT,
    flexShrink: 0,
  } as CSSProperties,

  backBtn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(180, 210, 255, 0.12)",
    background: "transparent",
    color: "rgba(200, 220, 255, 0.70)",
    fontSize: 12,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: FONT,
    flexShrink: 0,
  } as CSSProperties,

  nextBtn: {
    flex: 1,
    height: 34,
    padding: "0 16px",
    borderRadius: 10,
    border: "1px solid rgba(34, 197, 94, 0.30)",
    background:
      "linear-gradient(180deg, rgba(34, 197, 94, 0.28) 0%, rgba(20, 83, 45, 0.90) 100%)",
    boxShadow:
      "0 0 0 1px rgba(124, 255, 114, 0.10), 0 0 12px rgba(34, 197, 94, 0.22)",
    color: "#f1f7f0",
    fontSize: 12,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: FONT,
  } as CSSProperties,
};
