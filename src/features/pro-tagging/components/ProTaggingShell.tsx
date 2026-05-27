/**
 * ProTaggingShell.tsx
 *
 * PáircVision Pro Tagging — Main Experiment Shell
 *
 * Shell view state machine:
 *   SETUP  — ProSessionSetup screen (team names, direction, half, profile badge)
 *   LIVE   — Event keyboard → player picker → pitch tap capture loop
 *
 * Capture loop state machine (within LIVE):
 *   IDLE           — Event Keyboard shown
 *   AWAITING_PLAYER — Player Picker shown
 *   AWAITING_PITCH  — Pitch Tap Surface shown
 *
 * Nothing blocks the next event.
 * No confirmation modals.
 * No blocking popups.
 * Event is committed when pitch is tapped (or skipped).
 *
 * Phase 3 — Event → Player → Pitch Loop
 * Phase 4 — Sport Profile Switching (setup screen added)
 * Phase 5 — Possession Review Panel (REVIEW view added)
 * Phase 6 — Player Contribution Review (CONTRIBUTION view added)
 * Phase 7 — Visual Pitch Map Review (VISUAL view added)
 * Phase 7.6 — Ghost tap fix, team side toggle, clock contrast fix
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EventKeyboard from "./EventKeyboard";
import ProPlayerPicker from "./ProPlayerPicker";
import PitchTapSurface, { type PitchCoords } from "./PitchTapSurface";
import ProSessionSetup from "./ProSessionSetup";
import PossessionReviewPanel from "./PossessionReviewPanel";
import ContributionReviewPanel from "./ContributionReviewPanel";
import VisualReviewPanel from "./VisualReviewPanel";
import { getSportProfile } from "../model/profiles/index";
import type { EventButtonDef } from "../model/sport-profile-types";
import type { SportProfileId } from "../model/sport-profile-types";
import type { ProEvent, ProEventKind, ProPlayer, ProSessionState } from "../model/pro-event-model";
import { toMatchEventKind } from "../engine/pro-match-event-adapter";
import {
  createInitialProSession,
  loadProSession,
  saveProSession,
  clearProSession,
} from "../storage/pro-session-storage";
import { deriveContributions, DEFAULT_WEIGHTS } from "../engine/contribution-engine";
import { derivePossessions } from "../engine/possession-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Top-level shell view — what the analyst sees */
type ShellView = "SETUP" | "LIVE" | "REVIEW" | "CONTRIBUTION" | "VISUAL";

/** Capture-loop phase within LIVE view */
type CaptureState =
  | { phase: "IDLE" }
  | { phase: "AWAITING_PLAYER"; proKind: ProEventKind; button: EventButtonDef }
  | {
      phase: "AWAITING_PITCH";
      proKind: ProEventKind;
      button: EventButtonDef;
      player: ProPlayer | null;
    };

type ProTaggingShellProps = {
  profileId: SportProfileId;
  onExit: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newEventId(): string {
  return `pro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveSegment(clockSeconds: number, half: 1 | 2): 1 | 2 | 3 | 4 | 5 | 6 {
  const halfClock = half === 1 ? clockSeconds : clockSeconds - 35 * 60;
  if (halfClock < 12 * 60) return half === 1 ? 1 : 4;
  if (halfClock < 25 * 60) return half === 1 ? 2 : 5;
  return half === 1 ? 3 : 6;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProTaggingShell({ profileId, onExit }: ProTaggingShellProps) {
  const profile = getSportProfile(profileId);

  // Load saved session for this profile (or create blank template)
  const [session, setSession] = useState<ProSessionState>(() => {
    const saved = loadProSession();
    if (saved && saved.sportProfile === profileId) return saved;
    return createInitialProSession(profileId);
  });

  // Whether we have a saved session with events to offer a resume option
  const hasExistingSession = session.events.length > 0;

  // Shell view: start in SETUP so analyst always confirms profile + team names
  // If they have an active session already running, drop straight into LIVE
  const [shellView, setShellView] = useState<ShellView>(() =>
    session.hasStarted && session.events.length > 0 ? "LIVE" : "SETUP",
  );

  // Capture loop state machine (only active when shellView === "LIVE")
  const [capture, setCapture] = useState<CaptureState>({ phase: "IDLE" });

  // Team side for next event — persists between events, starts as FOR
  const [teamSide, setTeamSide] = useState<"FOR" | "OPP">("FOR");

  // Match clock ticker
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Ghost tap prevention — locked for 300ms after a pitch commit so the
  // touch release from the pitch tap surface cannot fire an event button
  const inputLockRef = useRef<boolean>(false);

  // Persist on every session change
  useEffect(() => {
    saveProSession(session);
  }, [session]);

  // Clock ticker — starts/stops with isRunning
  useEffect(() => {
    if (session.isRunning) {
      clockRef.current = setInterval(() => {
        setSession((prev) => ({
          ...prev,
          matchClockSeconds: prev.matchClockSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (clockRef.current !== null) {
        clearInterval(clockRef.current);
        clockRef.current = null;
      }
    };
  }, [session.isRunning]);

  // ---------------------------------------------------------------------------
  // Setup screen handlers
  // ---------------------------------------------------------------------------

  const handleSetupStart = useCallback(
    (draft: Pick<ProSessionState, "homeTeamName" | "awayTeamName" | "venueName" | "attackingDirection" | "half">) => {
      // Clear any existing session and apply the new setup values
      const fresh = createInitialProSession(profileId);
      const newSession: ProSessionState = {
        ...fresh,
        homeTeamName:      draft.homeTeamName,
        awayTeamName:      draft.awayTeamName,
        venueName:         draft.venueName,
        attackingDirection: draft.attackingDirection,
        half:              draft.half,
        // If starting at 2H, pre-set clock to 35:00
        matchClockSeconds: draft.half === 2 ? 35 * 60 : 0,
      };
      clearProSession();
      setSession(newSession);
      setCapture({ phase: "IDLE" });
      setShellView("LIVE");
    },
    [profileId],
  );

  const handleSetupResume = useCallback(() => {
    // Go directly to live with the existing session unchanged
    setCapture({ phase: "IDLE" });
    setShellView("LIVE");
  }, []);

  // Open setup from the live shell (settings tap)
  const handleOpenSetup = useCallback(() => {
    // Pause clock before going to setup
    setSession((prev) => ({ ...prev, isRunning: false }));
    setCapture({ phase: "IDLE" });
    setShellView("SETUP");
  }, []);

  // ---------------------------------------------------------------------------
  // Capture loop handlers
  // ---------------------------------------------------------------------------

  const handleEventSelected = useCallback(
    (proKind: ProEventKind, button: EventButtonDef) => {
      if (inputLockRef.current) return;  // Block ghost tap from prior pitch commit
      setCapture({ phase: "AWAITING_PLAYER", proKind, button });
    },
    [],
  );

  const handlePlayerSelected = useCallback((player: ProPlayer) => {
    setCapture((prev) => {
      if (prev.phase !== "AWAITING_PLAYER") return prev;
      return { phase: "AWAITING_PITCH", proKind: prev.proKind, button: prev.button, player };
    });
    setSession((prev) => ({ ...prev, activePlayerId: player.id }));
  }, []);

  const handlePlayerSkipped = useCallback(() => {
    setCapture((prev) => {
      if (prev.phase !== "AWAITING_PLAYER") return prev;
      return { phase: "AWAITING_PITCH", proKind: prev.proKind, button: prev.button, player: null };
    });
  }, []);

  const commitEvent = useCallback(
    (proKind: ProEventKind, player: ProPlayer | null, coords: PitchCoords) => {
      const now = Date.now();
      const cur = sessionRef.current;
      const half = cur.half;
      const clockSeconds = cur.matchClockSeconds;
      const segment = deriveSegment(clockSeconds, half);

      const newEvent: ProEvent = {
        id: newEventId(),
        proKind,
        mappedKind: toMatchEventKind(proKind),
        nx: coords.nx,
        ny: coords.ny,
        half,
        period: half === 1 ? "1H" : "2H",
        segment,
        timestamp: now,
        matchClockSeconds: clockSeconds,
        teamSide,
        sportProfile: profileId,
        playerId:     player?.id     ?? null,
        playerName:   player?.name   ?? null,
        playerNumber: player?.number ?? null,
        tags: null,
        possessionId: null,
      };

      setSession((prev) => ({
        ...prev,
        events: [...prev.events, newEvent],
        hasStarted: true,
        isRunning: true,
      }));

      // Lock event buttons for 300ms — prevents the pitch-tap touch release
      // from ghost-firing an event button that appeared at the same position
      inputLockRef.current = true;
      setTimeout(() => { inputLockRef.current = false; }, 300);

      setCapture({ phase: "IDLE" });
    },
    [profileId, teamSide],
  );

  const handlePitchTapped = useCallback(
    (coords: PitchCoords) => {
      setCapture((prev) => {
        if (prev.phase !== "AWAITING_PITCH") return prev;
        commitEvent(prev.proKind, prev.player, coords);
        return { phase: "IDLE" };
      });
    },
    [commitEvent],
  );

  const handlePitchSkipped = useCallback(() => {
    setCapture((prev) => {
      if (prev.phase !== "AWAITING_PITCH") return prev;
      commitEvent(prev.proKind, prev.player, { nx: 0.5, ny: 0.5 });
      return { phase: "IDLE" };
    });
  }, [commitEvent]);

  const handleUndo = useCallback(() => {
    setSession((prev) => ({ ...prev, events: prev.events.slice(0, -1) }));
    setCapture({ phase: "IDLE" });
  }, []);

  const handleHalfToggle = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      half: prev.half === 1 ? 2 : 1,
      matchClockSeconds: prev.half === 1 ? 35 * 60 : 0,
    }));
  }, []);

  const handleClockToggle = useCallback(() => {
    setSession((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  }, []);

  // Open possession review — pauses clock
  const handleOpenReview = useCallback(() => {
    setSession((prev) => ({ ...prev, isRunning: false }));
    setCapture({ phase: "IDLE" });
    setShellView("REVIEW");
  }, []);

  const handleCloseReview = useCallback(() => {
    setShellView("LIVE");
  }, []);

  // Open player contribution panel — pauses clock
  const handleOpenContribution = useCallback(() => {
    setSession((prev) => ({ ...prev, isRunning: false }));
    setCapture({ phase: "IDLE" });
    setShellView("CONTRIBUTION");
  }, []);

  const handleCloseContribution = useCallback(() => {
    setShellView("LIVE");
  }, []);

  // Open visual pitch map — pauses clock
  const handleOpenVisual = useCallback(() => {
    setSession((prev) => ({ ...prev, isRunning: false }));
    setCapture({ phase: "IDLE" });
    setShellView("VISUAL");
  }, []);

  const handleCloseVisual = useCallback(() => {
    setShellView("LIVE");
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const recentEvents = useMemo(
    () => [...session.events].slice(-8).reverse(),
    [session.events],
  );

  // Possession data feeds into contribution data (scoring/possession involvements)
  const possessionData = useMemo(
    () =>
      derivePossessions(session.events, {
        sorted: true,
        maxImplicitGapSeconds: profile.possessionRule.maxImplicitGapSeconds,
      }),
    [session.events, profile.possessionRule.maxImplicitGapSeconds],
  );

  // Full contribution dataset with possession involvements wired in
  const contributionDataset = useMemo(
    () => deriveContributions(session.events, possessionData.possessions, DEFAULT_WEIGHTS),
    [session.events, possessionData.possessions],
  );

  // Score map for the live player picker (derived from full dataset)
  const contributions = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of contributionDataset.players) {
      map.set(card.playerId, card.totalScore);
    }
    return map;
  }, [contributionDataset]);

  // ---------------------------------------------------------------------------
  // State bar label
  // ---------------------------------------------------------------------------

  const stateBarInfo = (): { text: string; mod: string } => {
    if (capture.phase === "IDLE")
      return { text: `${session.homeTeamName} vs ${session.awayTeamName}`, mod: "" };
    if (capture.phase === "AWAITING_PLAYER")
      return {
        text: `${capture.button.label} — Select player`,
        mod: "pro-tagging-shell__state-bar--player",
      };
    if (capture.phase === "AWAITING_PITCH") {
      const playerLabel = capture.player ? `#${capture.player.number}` : "no player";
      return {
        text: `${capture.button.label} · ${playerLabel} — Tap pitch`,
        mod: "pro-tagging-shell__state-bar--pitch",
      };
    }
    return { text: "", mod: "" };
  };

  const { text: stateText, mod: stateMod } = stateBarInfo();

  const pendingLabel =
    capture.phase !== "IDLE" ? capture.button.label : "";

  // ---------------------------------------------------------------------------
  // VISUAL view
  // ---------------------------------------------------------------------------

  if (shellView === "VISUAL") {
    return (
      <div className="pro-tagging-shell">
        <VisualReviewPanel
          session={session}
          profile={profile}
          events={session.events}
          onBack={handleCloseVisual}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // CONTRIBUTION view
  // ---------------------------------------------------------------------------

  if (shellView === "CONTRIBUTION") {
    return (
      <div className="pro-tagging-shell">
        <ContributionReviewPanel
          session={session}
          profile={profile}
          contributionData={contributionDataset}
          onBack={handleCloseContribution}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // REVIEW view
  // ---------------------------------------------------------------------------

  if (shellView === "REVIEW") {
    return (
      <div className="pro-tagging-shell">
        <PossessionReviewPanel
          session={session}
          profile={profile}
          possessionData={possessionData}
          onBack={handleCloseReview}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SETUP view
  // ---------------------------------------------------------------------------

  if (shellView === "SETUP") {
    return (
      <div className="pro-tagging-shell">
        <ProSessionSetup
          profile={profile}
          currentSession={session}
          hasExistingSession={hasExistingSession}
          onStart={handleSetupStart}
          onResume={handleSetupResume}
          onBack={onExit}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LIVE view
  // ---------------------------------------------------------------------------

  return (
    <div className="pro-tagging-shell">
      {/* Top bar */}
      <div className="pro-tagging-shell__topbar">
        <button
          type="button"
          className="pro-tagging-shell__back-btn"
          onClick={handleOpenSetup}
          title="Setup / change sport"
        >
          ⚙
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span className="pro-tagging-shell__topbar-sport">
            {profile.displayName} · {profile.restartLabel}
          </span>
          <button
            type="button"
            className={[
              "pro-tagging-shell__topbar-clock",
              session.isRunning ? "pro-tagging-shell__topbar-clock--running" : "",
            ].filter(Boolean).join(" ")}
            onClick={handleClockToggle}
            title={session.isRunning ? "Pause clock" : "Start clock"}
          >
            {formatClock(session.matchClockSeconds)}
            {session.isRunning ? " ▶" : " ⏸"}
          </button>
        </div>

        <button
          type="button"
          className="pro-tagging-shell__back-btn"
          onClick={handleHalfToggle}
          title="Toggle half"
        >
          {session.half === 1 ? "1H" : "2H"}
        </button>
      </div>

      {/* State bar */}
      <div
        className={["pro-tagging-shell__state-bar", stateMod]
          .filter(Boolean)
          .join(" ")}
      >
        {stateText}
      </div>

      {/* Team side toggle — FOR (home) vs OPP (away) */}
      <div className="pro-tagging-shell__team-bar">
        <button
          type="button"
          className={[
            "pro-tagging-shell__team-btn",
            teamSide === "FOR" ? "pro-tagging-shell__team-btn--for" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => setTeamSide("FOR")}
        >
          FOR{session.homeTeamName ? ` · ${session.homeTeamName}` : ""}
        </button>
        <button
          type="button"
          className={[
            "pro-tagging-shell__team-btn",
            teamSide === "OPP" ? "pro-tagging-shell__team-btn--opp" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => setTeamSide("OPP")}
        >
          OPP{session.awayTeamName ? ` · ${session.awayTeamName}` : ""}
        </button>
      </div>

      {/* Main content — capture loop */}
      <div className="pro-tagging-shell__content">
        {capture.phase === "IDLE" && (
          <EventKeyboard
            profile={profile}
            onEventSelected={handleEventSelected}
          />
        )}

        {capture.phase === "AWAITING_PLAYER" && (
          <ProPlayerPicker
            players={session.players}
            contributions={contributions}
            onSelectPlayer={handlePlayerSelected}
            onSkip={handlePlayerSkipped}
            activePlayerId={session.activePlayerId}
            pendingEventLabel={pendingLabel}
          />
        )}

        {capture.phase === "AWAITING_PITCH" && (
          <PitchTapSurface
            onPitchTapped={handlePitchTapped}
            onSkip={handlePitchSkipped}
            pitchSport={profile.pitchSport}
            attackingDirection={session.attackingDirection}
            pendingEventLabel={
              capture.player
                ? `${pendingLabel} · #${capture.player.number}`
                : pendingLabel
            }
          />
        )}
      </div>

      {/* Bottom log strip */}
      <div className="pro-tagging-shell__log">
        {session.events.length === 0 ? (
          <span className="pro-tagging-shell__log-empty">No events yet</span>
        ) : (
          recentEvents.map((event) => (
            <span
              key={event.id}
              className={[
                "pro-tagging-shell__log-item",
                event.teamSide === "OPP" ? "pro-tagging-shell__log-item--opp" : "",
              ].filter(Boolean).join(" ")}
            >
              {event.teamSide === "OPP" ? "OPP " : ""}
              {event.proKind.replace(/_/g, " ")}
              {event.playerNumber !== null && event.playerNumber !== undefined
                ? ` #${event.playerNumber}`
                : ""}
            </span>
          ))
        )}
        {session.events.length > 0 && (
          <div className="pro-tagging-shell__log-actions">
            <button
              type="button"
              className="pro-tagging-shell__log-review"
              onClick={handleOpenReview}
              title="Possession review"
            >
              📊
            </button>
            <button
              type="button"
              className="pro-tagging-shell__log-review"
              onClick={handleOpenContribution}
              title="Player impact"
            >
              👤
            </button>
            <button
              type="button"
              className="pro-tagging-shell__log-review"
              onClick={handleOpenVisual}
              title="Pitch map"
            >
              📍
            </button>
            <button
              type="button"
              className="pro-tagging-shell__log-undo"
              onClick={handleUndo}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
