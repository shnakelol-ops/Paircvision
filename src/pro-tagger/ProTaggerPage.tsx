import { useState } from "react";
import type { CSSProperties } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import { ProTaggerSetupScreen } from "./ProTaggerSetupScreen";
import { ProTaggerSquadScreen } from "./ProTaggerSquadScreen";
import { ProTaggerLiveScreen } from "./ProTaggerLiveScreen";
import type { RestoreState } from "./ProTaggerLiveScreen";
import { ProTaggerSavedMatchesScreen } from "./ProTaggerSavedMatchesScreen";
import { ProTaggerReviewScreen } from "./ProTaggerReviewScreen";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import { readProTaggerMatches, saveProTaggerMatchFull } from "./pro-tagger-storage";

type AppPhase = "home" | "setup" | "squads" | "live" | "saved-matches" | "review";

function savedMatchToSession(m: ProTaggerSavedMatch): ProTaggerSession {
  return {
    id:                  m.id,
    sport:               m.sport,
    homeTeamName:        m.homeTeamName,
    awayTeamName:        m.awayTeamName,
    venue:               m.venue,
    matchType:           m.matchType,
    attackDirection:     m.restoreContext.firstHalfAttackingDirection,
    halfDurationMinutes: m.halfDurationMinutes,
    createdAt:           m.createdAt,
    homeSquad:           m.homeSquad,
    awaySquad:           m.awaySquad,
  };
}

function savedMatchToRestoreState(m: ProTaggerSavedMatch): RestoreState {
  return {
    events:              m.events,
    homeSquadLiveState:  m.homeSquadLiveState,
    awaySquadLiveState:  m.awaySquadLiveState,
    matchState:          m.restoreContext.matchState,
    half:                m.restoreContext.currentHalf,
    clockSeconds:        m.restoreContext.matchTimeSeconds,
  };
}

// Autosave (see ProTaggerLiveScreen) keeps every in-progress match written to the
// same store as manual Save Match, so recovery after a refresh/crash is just:
// find the most recent match that hasn't reached Full Time and offer to resume it.
function findInProgressMatch(): ProTaggerSavedMatch | null {
  return readProTaggerMatches().find((m) => m.restoreContext.matchState !== "FULL_TIME") ?? null;
}

export default function ProTaggerPage() {
  const [phase, setPhase]               = useState<AppPhase>("home");
  const [draftSession, setDraftSession] = useState<ProTaggerSession | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState | undefined>(undefined);
  const [savedCount, setSavedCount]     = useState(() => readProTaggerMatches().length);
  const [reviewMatch, setReviewMatch]   = useState<ProTaggerSavedMatch | null>(null);
  const [inProgressMatch, setInProgressMatch] = useState<ProTaggerSavedMatch | null>(() => findInProgressMatch());

  function resumeMatch(match: ProTaggerSavedMatch) {
    setDraftSession(savedMatchToSession(match));
    setRestoreState(savedMatchToRestoreState(match));
    setPhase("live");
  }

  // ── Home landing ────────────────────────────────────────────────────────────

  if (phase === "home") {
    return (
      <div style={H.shell}>
        <div style={H.header}>
          <span style={H.title}>Event Stats</span>
        </div>

        <div style={H.body}>
          <div style={H.logoWrap}>
            <img src="/pv-logo-icon.svg" alt="PáircVision" style={H.logo} />
          </div>
          {inProgressMatch && (
            <button
              style={H.resumeBtn}
              onClick={() => resumeMatch(inProgressMatch)}
            >
              <span>Resume in-progress match</span>
              <small style={H.resumeSub}>
                {inProgressMatch.scorelineSnapshot || `${inProgressMatch.homeTeamName} v ${inProgressMatch.awayTeamName}`}
              </small>
            </button>
          )}
          <button
            style={H.primaryBtn}
            onClick={() => setPhase("setup")}
          >
            New Match
          </button>
          <button
            style={H.secondaryBtn}
            onClick={() => {
              setSavedCount(readProTaggerMatches().length);
              setInProgressMatch(findInProgressMatch());
              setPhase("saved-matches");
            }}
          >
            Saved Matches
            {savedCount > 0 && (
              <span style={H.badge}>{savedCount}</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Saved matches list ──────────────────────────────────────────────────────

  if (phase === "saved-matches") {
    return (
      <ProTaggerSavedMatchesScreen
        onBack={() => {
          setSavedCount(readProTaggerMatches().length);
          setInProgressMatch(findInProgressMatch());
          setPhase("home");
        }}
        onOpen={resumeMatch}
        onReview={(match: ProTaggerSavedMatch) => {
          setReviewMatch(match);
          setPhase("review");
        }}
      />
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────────

  if (phase === "review" && reviewMatch) {
    return (
      <ProTaggerReviewScreen
        match={reviewMatch}
        onBack={() => setPhase("saved-matches")}
        onMatchUpdate={(updated) => {
          saveProTaggerMatchFull(updated);
          setReviewMatch(updated);
        }}
      />
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <ProTaggerSetupScreen
        onContinue={(draft) => {
          setRestoreState(undefined);
          setDraftSession(draft);
          setPhase("squads");
        }}
      />
    );
  }

  // ── Squads ──────────────────────────────────────────────────────────────────

  if (phase === "squads" && draftSession) {
    return (
      <ProTaggerSquadScreen
        session={draftSession}
        onBack={() => setPhase("setup")}
        onStart={(finalSession) => {
          setDraftSession(finalSession);
          setPhase("live");
        }}
      />
    );
  }

  // ── Live ────────────────────────────────────────────────────────────────────

  if (phase === "live" && draftSession) {
    return (
      <ProTaggerLiveScreen
        session={draftSession}
        restoreState={restoreState}
        onEnd={() => {
          setDraftSession(null);
          setRestoreState(undefined);
          setSavedCount(readProTaggerMatches().length);
          setInProgressMatch(findInProgressMatch());
          setPhase("home");
        }}
      />
    );
  }

  return null;
}

// ── Home screen styles ────────────────────────────────────────────────────────

const H: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    width: "100%",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px 10px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "-0.4px",
    flex: 1,
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "0 32px 48px",
  },
  logoWrap: {
    marginBottom: 16,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 20,
    display: "block",
    filter: "drop-shadow(0 0 14px rgba(122,255,178,0.18))",
  },
  resumeBtn: {
    background: "rgba(31,111,235,0.1)",
    border: "1px solid #1f6feb",
    borderRadius: 12,
    color: "#79c0ff",
    fontSize: 15,
    fontWeight: 700,
    padding: "14px 0",
    width: "100%",
    maxWidth: 360,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.2px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  resumeSub: {
    fontSize: 12,
    fontWeight: 500,
    color: "#8b949e",
  },
  primaryBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 12,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: 700,
    padding: "18px 0",
    width: "100%",
    maxWidth: 360,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtn: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    color: "#e6edf3",
    fontSize: 17,
    fontWeight: 600,
    padding: "18px 0",
    width: "100%",
    maxWidth: 360,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  badge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "1px 7px",
    lineHeight: "1.4",
    flexShrink: 0,
  },
};
