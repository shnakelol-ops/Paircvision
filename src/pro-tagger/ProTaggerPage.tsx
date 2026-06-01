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
  const [menuOpen, setMenuOpen]         = useState(false);
  const [reviewMatch, setReviewMatch]   = useState<ProTaggerSavedMatch | null>(null);

  // ── Home landing ────────────────────────────────────────────────────────────

  if (phase === "home") {
    return (
      <div style={H.shell}>
        <div style={H.header}>
          <span style={H.title}>Pro Tagger</span>
          <button
            style={H.menuBtn}
            onClick={() => {
              setSavedCount(readProTaggerMatches().length);
              setMenuOpen(true);
            }}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>

        <div style={H.body}>
          <div style={H.logoWrap}>
            <span style={H.logo}>⬡</span>
          </div>
          <button
            style={H.primaryBtn}
            onClick={() => setPhase("setup")}
          >
            Setup Match
          </button>
        </div>

        {/* ── Menu sheet ────────────────────────────────────────────── */}
        {menuOpen && (
          <div
            style={H.overlay}
            onClick={() => setMenuOpen(false)}
          >
            <div
              style={H.sheet}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={H.sheetHandle} />

              <button
                style={H.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  setPhase("saved-matches");
                }}
              >
                <span style={H.menuItemIcon}>📋</span>
                <span style={H.menuItemLabel}>Saved Matches</span>
                {savedCount > 0 && (
                  <span style={H.menuBadge}>{savedCount}</span>
                )}
              </button>

              <button style={{ ...H.menuItem, ...H.menuItemDisabled }} disabled>
                <span style={H.menuItemIcon}>👥</span>
                <span style={H.menuItemLabel}>Team Library</span>
                <span style={H.menuItemPill}>Soon</span>
              </button>

              <button style={{ ...H.menuItem, ...H.menuItemDisabled }} disabled>
                <span style={H.menuItemIcon}>📊</span>
                <span style={H.menuItemLabel}>Saved Reviews</span>
                <span style={H.menuItemPill}>Soon</span>
              </button>

              <button style={{ ...H.menuItem, ...H.menuItemDisabled }} disabled>
                <span style={H.menuItemIcon}>📄</span>
                <span style={H.menuItemLabel}>Reports</span>
                <span style={H.menuItemPill}>Soon</span>
              </button>
            </div>
          </div>
        )}
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
  menuBtn: {
    background: "none",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 16,
    lineHeight: 1,
    padding: "5px 9px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
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
    marginBottom: 8,
  },
  logo: {
    fontSize: 56,
    opacity: 0.15,
    display: "block",
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
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 200,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  sheet: {
    background: "#161b22",
    borderTop: "1px solid #30363d",
    borderRadius: "16px 16px 0 0",
    paddingBottom: 32,
    display: "flex",
    flexDirection: "column",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    background: "#30363d",
    borderRadius: 2,
    margin: "10px auto 12px",
    flexShrink: 0,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "none",
    border: "none",
    borderTop: "1px solid #21262d",
    color: "#e6edf3",
    fontSize: 15,
    fontWeight: 500,
    padding: "15px 20px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
  },
  menuItemDisabled: {
    color: "#484f58",
    cursor: "default",
  },
  menuItemIcon: {
    fontSize: 18,
    flexShrink: 0,
    width: 24,
    textAlign: "center" as const,
  },
  menuItemLabel: {
    flex: 1,
  },
  menuBadge: {
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
  menuItemPill: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#6e7681",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 7px",
    flexShrink: 0,
  },
};
