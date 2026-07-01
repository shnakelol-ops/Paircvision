import { useState } from "react";

const TOUR_KEY = "paircvision_guided_tour_v1";

type TourStep = { icon: string; title: string; body: string };

const STEPS: TourStep[] = [
  {
    icon: "🏟",
    title: "Welcome to PáircVision",
    body: "PáircVision is built for Gaelic games coaches. Capture matches live, review reports at halftime, plan your tactics, bring your vision to life, and track your training — all in one place.",
  },
  {
    icon: "📋",
    title: "Match Stats",
    body: "Log live match events as they happen — shots, kickouts, turnovers, frees, and more. PáircVision builds halftime snapshots and full match reports automatically.",
  },
  {
    icon: "🔬",
    title: "Event Stats",
    body: "Live event capture with outcome-first tagging. Record players, team context and outcomes as they happen — PáircVision builds the same halftime snapshots and full match reports.",
  },
  {
    icon: "🎨",
    title: "Tactical Slate & Tactical Play",
    body: "Tactical Slate — plan and explain with players, drawings, phases and coaching tools. Tactical Play — bring your vision to life with coordinated movement, possession, passing and realistic game scenarios.",
  },
  {
    icon: "📁",
    title: "Training Tracker & Notes",
    body: "Log training sessions, record attendance, track player workloads, and keep coaching notes and general observations organised across your season.",
  },
  {
    icon: "📤",
    title: "Export, Share & Feedback",
    body: "Export match reports and share clips directly from PáircVision. If anything is unclear or broken, use the feedback option at any time — your feedback is how we improve the product.",
  },
];

const TOTAL = STEPS.length;

export default function GuidedTour() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(TOUR_KEY);
  });
  const [stepIndex, setStepIndex] = useState(0);

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === TOTAL - 1;

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOUR_KEY, "seen");
    }
    setVisible(false);
  }

  function next() {
    if (isLast) {
      dismiss();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  return (
    <div style={S.backdrop}>
      <div style={S.card} role="dialog" aria-modal="true" aria-label={step.title}>
        <div style={S.dots}>
          {STEPS.map((_, i) => (
            <span key={i} style={i === stepIndex ? S.dotActive : S.dot} />
          ))}
        </div>
        <span style={S.icon} aria-hidden="true">{step.icon}</span>
        <h2 style={S.title}>{step.title}</h2>
        <p style={S.body}>{step.body}</p>
        <div style={S.row}>
          <button type="button" style={S.skipBtn} onClick={dismiss}>
            Skip
          </button>
          <button type="button" style={S.nextBtn} onClick={next}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
        <p style={S.counter}>{stepIndex + 1} of {TOTAL}</p>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(3,16,11,0.90)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 16px",
  } as React.CSSProperties,

  card: {
    width: "100%",
    maxWidth: "340px",
    borderRadius: "20px",
    border: "1px solid #275C3B",
    background: "linear-gradient(180deg, rgba(23,61,40,0.99) 0%, rgba(16,41,27,0.99) 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 56px rgba(0,0,0,0.56)",
    padding: "24px 20px 18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  } as React.CSSProperties,

  dots: {
    display: "flex",
    gap: "6px",
    marginBottom: "20px",
  } as React.CSSProperties,

  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.15)",
    transition: "width 0.2s, background 0.2s",
    flexShrink: 0,
  } as React.CSSProperties,

  dotActive: {
    width: "22px",
    height: "7px",
    borderRadius: "999px",
    background: "#7CFF72",
    transition: "width 0.2s, background 0.2s",
    flexShrink: 0,
  } as React.CSSProperties,

  icon: {
    fontSize: "40px",
    lineHeight: "1",
    marginBottom: "14px",
    display: "block",
  } as React.CSSProperties,

  title: {
    margin: "0 0 10px",
    fontSize: "19px",
    fontWeight: 760,
    color: "#F1F7F0",
    textAlign: "center",
    lineHeight: "1.2",
    letterSpacing: "0.01em",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as React.CSSProperties,

  body: {
    margin: "0 0 20px",
    fontSize: "14px",
    color: "#8FA099",
    textAlign: "center",
    lineHeight: "1.52",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as React.CSSProperties,

  row: {
    display: "flex",
    width: "100%",
    gap: "10px",
  } as React.CSSProperties,

  skipBtn: {
    borderRadius: "12px",
    border: "1px solid #275C3B",
    padding: "11px 18px",
    fontSize: "14px",
    fontWeight: 650,
    cursor: "pointer",
    lineHeight: "1",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "rgba(16,41,27,0.84)",
    color: "#8FA099",
    flexShrink: 0,
  } as React.CSSProperties,

  nextBtn: {
    flex: 1,
    borderRadius: "12px",
    border: "1px solid #275C3B",
    padding: "11px 18px",
    fontSize: "14px",
    fontWeight: 650,
    cursor: "pointer",
    lineHeight: "1",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "linear-gradient(180deg, rgba(34,197,94,0.36) 0%, rgba(27,74,48,0.95) 100%)",
    boxShadow: "0 0 0 1px rgba(124,255,114,0.14), 0 0 14px rgba(124,255,114,0.28)",
    color: "#F1F7F0",
  } as React.CSSProperties,

  counter: {
    margin: "12px 0 0",
    fontSize: "11px",
    color: "rgba(143,160,153,0.6)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  } as React.CSSProperties,
};
