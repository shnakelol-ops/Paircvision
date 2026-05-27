/**
 * ProTaggingShell.tsx
 *
 * PáircVision Pro Tagging — Main Experiment Shell
 *
 * Wires together the full capture loop:
 *   EVENT KEYBOARD → PLAYER PICKER → PITCH TAP → back to EVENT KEYBOARD
 *
 * State machine:
 *   IDLE           — showing Event Keyboard
 *   AWAITING_PLAYER — showing Player Picker (event kind selected)
 *   AWAITING_PITCH  — showing Pitch Tap Surface (player selected or skipped)
 *
 * Nothing blocks the next event.
 * No confirmation modals.
 * No blocking popups.
 * Event is committed when pitch is tapped (or skipped).
 *
 * Phase 3 — Event → Player → Pitch Loop
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EventKeyboard from "./EventKeyboard";
import ProPlayerPicker from "./ProPlayerPicker";
import PitchTapSurface, { type PitchCoords } from "./PitchTapSurface";
import { getSportProfile } from "../model/profiles/index";
import type { EventButtonDef } from "../model/sport-profile-types";
import type { SportProfileId } from "../model/sport-profile-types";
import type { ProEvent, ProEventKind, ProPlayer, ProSessionState } from "../model/pro-event-model";
import { toMatchEventKind } from "../engine/pro-match-event-adapter";
import {
  createInitialProSession,
  loadProSession,
  saveProSession,
} from "../storage/pro-session-storage";
import { deriveContributions, DEFAULT_WEIGHTS } from "../engine/contribution-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  // Simple 10-minute segment splits within each half
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

  // Session state
  const [session, setSession] = useState<ProSessionState>(() => {
    const saved = loadProSession();
    if (saved && saved.sportProfile === profileId) return saved;
    return createInitialProSession(profileId);
  });

  // Capture loop state machine
  const [capture, setCapture] = useState<CaptureState>({ phase: "IDLE" });

  // Match clock ticker
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Persist session on change
  useEffect(() => {
    saveProSession(session);
  }, [session]);

  // Clock tick
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
  // Capture loop handlers
  // ---------------------------------------------------------------------------

  const handleEventSelected = useCallback(
    (proKind: ProEventKind, button: EventButtonDef) => {
      setCapture({ phase: "AWAITING_PLAYER", proKind, button });
    },
    [],
  );

  const handlePlayerSelected = useCallback(
    (player: ProPlayer) => {
      setCapture((prev) => {
        if (prev.phase !== "AWAITING_PLAYER") return prev;
        return { phase: "AWAITING_PITCH", proKind: prev.proKind, button: prev.button, player };
      });
      setSession((prev) => ({ ...prev, activePlayerId: player.id }));
    },
    [],
  );

  const handlePlayerSkipped = useCallback(() => {
    setCapture((prev) => {
      if (prev.phase !== "AWAITING_PLAYER") return prev;
      return { phase: "AWAITING_PITCH", proKind: prev.proKind, button: prev.button, player: null };
    });
  }, []);

  const commitEvent = useCallback(
    (proKind: ProEventKind, player: ProPlayer | null, coords: PitchCoords) => {
      const now = Date.now();
      const currentSession = sessionRef.current;
      const half = currentSession.half;
      const clockSeconds = currentSession.matchClockSeconds;
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
        teamSide: "FOR",
        sportProfile: profileId,
        playerId: player?.id ?? null,
        playerName: player?.name ?? null,
        playerNumber: player?.number ?? null,
        tags: null,
        possessionId: null,
      };

      setSession((prev) => ({
        ...prev,
        events: [...prev.events, newEvent],
        hasStarted: true,
        isRunning: prev.isRunning || true,
      }));

      setCapture({ phase: "IDLE" });
    },
    [profileId],
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
    setSession((prev) => ({
      ...prev,
      events: prev.events.slice(0, -1),
    }));
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

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const contributions = useMemo(() => {
    const dataset = deriveContributions(session.events, [], DEFAULT_WEIGHTS);
    const map = new Map<string, number>();
    for (const card of dataset.players) {
      map.set(card.playerId, card.totalScore);
    }
    return map;
  }, [session.events]);

  const recentEvents = useMemo(
    () => [...session.events].slice(-8).reverse(),
    [session.events],
  );

  // ---------------------------------------------------------------------------
  // State bar label
  // ---------------------------------------------------------------------------

  const stateBarLabel = (): { text: string; mod: string } => {
    if (capture.phase === "IDLE") return { text: "Select event", mod: "" };
    if (capture.phase === "AWAITING_PLAYER")
      return { text: `${capture.button.label} — Select player`, mod: "pro-tagging-shell__state-bar--player" };
    if (capture.phase === "AWAITING_PITCH") {
      const playerLabel = capture.player ? `#${capture.player.number}` : "no player";
      return {
        text: `${capture.button.label} · ${playerLabel} — Tap pitch`,
        mod: "pro-tagging-shell__state-bar--pitch",
      };
    }
    return { text: "", mod: "" };
  };

  const { text: stateText, mod: stateMod } = stateBarLabel();

  // Pending event label for sub-screens
  const pendingLabel =
    capture.phase !== "IDLE"
      ? capture.button.label
      : "";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="pro-tagging-shell">
      {/* Top bar */}
      <div className="pro-tagging-shell__topbar">
        <button
          type="button"
          className="pro-tagging-shell__back-btn"
          onClick={onExit}
        >
          ← Back
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span className="pro-tagging-shell__topbar-sport">{profile.displayName} · Pro</span>
          <span className="pro-tagging-shell__topbar-clock" onClick={handleClockToggle}>
            {formatClock(session.matchClockSeconds)}
            {session.isRunning ? " ▶" : " ⏸"}
          </span>
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
      <div className={["pro-tagging-shell__state-bar", stateMod].filter(Boolean).join(" ")}>
        {stateText || "PáircVision Pro Tagging"}
      </div>

      {/* Main content */}
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
            <span key={event.id} className="pro-tagging-shell__log-item">
              {event.proKind.replace(/_/g, " ")}
              {event.playerNumber !== null && event.playerNumber !== undefined
                ? ` #${event.playerNumber}`
                : ""}
            </span>
          ))
        )}
        {session.events.length > 0 && (
          <button
            type="button"
            className="pro-tagging-shell__log-undo"
            onClick={handleUndo}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
