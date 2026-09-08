import type { CSSProperties } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import type { ProTaggerAttackDirection } from "./pro-tagger-session";

interface Props {
  onBack: () => void;
  onChoose: (direction: ProTaggerAttackDirection) => void;
}

// Mandatory 1H attacking-direction step, inserted between Squad Setup and the
// Event Stats live screen (see ProTaggerPage.tsx's "direction" phase). This
// moves the 1H Attacking Direction choice off the Squad Setup screen —
// freeing that screen's vertical space for the lineup — and makes the choice
// explicit and hard to skip: every transition from Squad Setup toward live
// now passes through here, so a stale/default attackDirection value already
// sitting on the session (e.g. Setup's own "right" default) can never
// silently reach live without the user actively choosing on this screen.
//
// Selecting LEFT or RIGHT both sets session.attackDirection — via onChoose,
// using the exact same ProTaggerAttackDirection value/semantics
// ProTaggerLiveScreen.tsx has always consumed from session.attackDirection —
// and immediately advances to live. The button press is the only
// confirmation needed; there is no second "Continue" step.
export function ProTaggerDirectionScreen({ onBack, onChoose }: Props) {
  return (
    <div style={S.shell}>
      <VisionStadiumBackground variant="training" />
      <div style={S.contentWrap}>

        <div style={S.header}>
          <button style={S.backBtn} onClick={onBack}>← Back</button>
          <span style={S.title}>1H Attacking Direction</span>
          <span style={S.headerSpacer} aria-hidden="true" />
        </div>

        <div style={S.body}>
          <span style={S.question}>Which way are we attacking in the 1st half?</span>
          <div style={S.choices}>
            <button style={S.choiceBtn} onClick={() => onChoose("left")}>
              <span style={S.choiceArrow}>←</span>
              <span>LEFT</span>
            </button>
            <button style={S.choiceBtn} onClick={() => onChoose("right")}>
              <span>RIGHT</span>
              <span style={S.choiceArrow}>→</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    width: "100%",
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    position: "relative",
  },
  contentWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },

  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px 8px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "-0.3px",
    flex: 1,
    textAlign: "center" as const,
  },
  // Mirrors backBtn's footprint so the centered title stays visually
  // centered against the header's actual content width, not the back
  // button's — this screen has no header-right action.
  headerSpacer: {
    width: 54,
    flexShrink: 0,
  },

  body: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    padding: "0 20px",
  },
  question: {
    fontSize: 18,
    fontWeight: 600,
    color: "#dce8f4",
    textAlign: "center" as const,
    lineHeight: 1.4,
    maxWidth: 320,
  },
  choices: {
    display: "flex",
    gap: 12,
    width: "100%",
    maxWidth: 420,
  },
  choiceBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 14,
    color: "#dce8f4",
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "0.02em",
    padding: "32px 12px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  choiceArrow: {
    fontSize: 30,
    lineHeight: 1,
  },
};
