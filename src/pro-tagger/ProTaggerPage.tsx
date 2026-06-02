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
import { readProTaggerMatches } from "./pro-tagger-storage";

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

export default function ProTaggerPage() {
  const [phase, setPhase]               = useState<AppPhase>("home");
  const [draftSession, setDraftSession] = useState<ProTaggerSession | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState | undefined>(undefined);
  const [savedCount, setSavedCount]     = useState(() => readProTaggerMatches().length);
  const [reviewMatch, setReviewMatch]   = useState<ProTaggerSavedMatch | null>(null);

  // ── Home landing ────────────────────────────────────────────────────────────

  if (phase === "home") {
    return (
      <div style={H.shell}>
        <div style={H.header}>
          <span style={H.title}>Pro Tagger</span>
        </div>

        <div style={H.nav}>
          <button
            style={H.newMatchBtn}
            onClick={() => setPhase("setup")}
          >
            <span style={H.navIcon}>🟢</span>
            <span style={H.navLabel}>New Match</span>
          </button>

          <button
            style={H.navBtn}
            onClick={() => {
              setSavedCount(readProTaggerMatches().length);
              setPhase("saved-matches");
            }}
          >
            <span style={H.navIcon}>📂</span>
            <span style={H.navLabel}>Saved Matches</span>
            {savedCount > 0 && (
              <span style={H.navBadge}>{savedCount}</span>
            )}
          </button>

          <button style={{ ...H.navBtn, ...H.navBtnDisabled }} disabled>
            <span style={H.navIcon}>👥</span>
            <span style={H.navLabel}>Team Library</span>
            <span style={H.navPill}>Soon</span>
          </button>

          <button style={{ ...H.navBtn, ...H.navBtnDisabled }} disabled>
            <span style={H.navIcon}>ℹ️</span>
            <span style={H.navLabel}>About</span>
            <span style={H.navPill}>Soon</span>
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
          setPhase("home");
        }}
        onOpen={(match: ProTaggerSavedMatch) => {
          const session      = savedMatchToSession(match);
          const restore      = savedMatchToRestoreState(match);
          setDraftSession(session);
          setRestoreState(restore);
          setPhase("live");
        }}
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
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "20px 20px 32px",
    gap: 10,
    overflowY: "auto" as const,
  },
  newMatchBtn: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#1a3d22",
    border: "1px solid #2ea043",
    borderRadius: 14,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: 700,
    padding: "20px 20px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
    letterSpacing: "-0.3px",
  },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 14,
    color: "#e6edf3",
    fontSize: 16,
    fontWeight: 500,
    padding: "18px 20px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
  },
  navBtnDisabled: {
    color: "#484f58",
    cursor: "default",
    borderColor: "#1c2128",
  },
  navIcon: {
    fontSize: 20,
    flexShrink: 0,
    width: 28,
    textAlign: "center" as const,
  },
  navLabel: {
    flex: 1,
  },
  navBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "1px 8px",
    lineHeight: "1.5",
    flexShrink: 0,
  },
  navPill: {
    background: "#21262d",
    border: "1px solid #1c2128",
    borderRadius: 8,
    color: "#484f58",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 7px",
    flexShrink: 0,
  },
};
