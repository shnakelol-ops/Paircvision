import { useState, useRef, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import type { ProTaggerFamilyId } from "./pro-tagger-families";
import type { LoggedMatchEvent, SavedMatch } from "../core/stats/saved-match";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import { saveProTaggerMatch } from "./pro-tagger-storage";
import { ProTaggerFamilyGrid } from "./ProTaggerFamilyGrid";
import { ProTaggerPlayerPicker } from "./ProTaggerPlayerPicker";
import type { SelectedPlayer } from "./ProTaggerPlayerPicker";
import { ProTaggerPitchView } from "./ProTaggerPitchView";

interface Props {
  session: ProTaggerSession;
  onEnd: () => void;
}

type CapturePhase = "IDLE" | "PLAYER_PICK" | "PITCH_TAP";

type PendingAction = {
  familyId: ProTaggerFamilyId;
  tileLabel: string;
  teamSide: "FOR" | "OPP";
  player: SelectedPlayer | null;
};

function newEventId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `pro-evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): { goals: number; points: number; total: number } {
  const scored = events.filter((e) => e.teamSide === side);
  const goals  = scored.filter((e) => e.kind === "GOAL").length;
  const pts    = scored.filter((e) =>
    (["POINT", "FREE_SCORED", "TWO_POINTER", "FORTY_FIVE_TWO_POINT"] as MatchEventKind[]).includes(e.kind),
  ).length;
  return { goals, points: pts, total: goals * 3 + pts };
}

function fmtScore(s: { goals: number; points: number; total: number }): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

function fmtClock(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ProTaggerLiveScreen({ session, onEnd }: Props) {
  const [phase, setPhase]           = useState<CapturePhase>("IDLE");
  const [pending, setPending]       = useState<PendingAction | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [half, setHalf]             = useState<1 | 2>(1);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const [feedbackDot, setFeedbackDot]   = useState<{ nx: number; ny: number } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const clockStartRef   = useRef<number | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockSecondsRef = useRef(0);
  const halfRef         = useRef<1 | 2>(1);
  const loggedRef       = useRef<readonly LoggedMatchEvent[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { clockSecondsRef.current = clockSeconds; }, [clockSeconds]);
  useEffect(() => { halfRef.current = half; }, [half]);
  useEffect(() => { loggedRef.current = loggedEvents; }, [loggedEvents]);

  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const toggleClock = useCallback(() => {
    if (clockRunning) {
      clearInterval(clockIntervalRef.current!);
      clockIntervalRef.current = null;
      setClockRunning(false);
    } else {
      clockStartRef.current = Date.now() - clockSecondsRef.current * 1000;
      clockIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - clockStartRef.current!) / 1000);
        clockSecondsRef.current = elapsed;
        setClockSeconds(elapsed);
      }, 500);
      setClockRunning(true);
    }
  }, [clockRunning]);

  const handleTileTap = useCallback(
    (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP") => {
      setPending({ familyId, tileLabel, teamSide, player: null });
      setPhase("PLAYER_PICK");
    },
    [],
  );

  const handlePlayerSelect = useCallback((player: SelectedPlayer | null) => {
    setPending((prev) => (prev ? { ...prev, player } : null));
    setPhase("PITCH_TAP");
  }, []);

  const handlePitchTap = useCallback(
    (nx: number, ny: number) => {
      const p = pending;
      if (!p) return;

      const event = adaptProTaggerAction({
        familyId:          p.familyId,
        tileLabel:         p.tileLabel,
        teamSide:          p.teamSide,
        nx,
        ny,
        half:              halfRef.current,
        matchClockSeconds: clockSecondsRef.current,
        playerId:          p.player?.playerId,
        playerName:        p.player?.playerName,
        playerNumber:      p.player?.playerNumber,
        squadId:           p.player?.squadId,
      });

      setLoggedEvents((prev) => [...prev, event]);
      setFeedbackDot({ nx, ny });
      setPending(null);
      setPhase("IDLE");

      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedbackDot(null), 600);
    },
    [pending],
  );

  const undo = useCallback(() => {
    setLoggedEvents((prev) => prev.slice(0, -1));
  }, []);

  const handleSaveAndEnd = useCallback(() => {
    const events = loggedRef.current;
    if (events.length === 0) {
      setSaveFeedback("No events to save.");
      setTimeout(() => setSaveFeedback(null), 2000);
      return;
    }

    const home  = session.homeTeamName.trim() || "Team A";
    const away  = session.awayTeamName.trim() || "Team B";
    const venue = session.venue.trim() || "Unknown venue";

    const forScore = computeScoreSide(events, "FOR");
    const oppScore = computeScoreSide(events, "OPP");

    const record: SavedMatch = {
      id:               `pro-tagger-${newEventId()}`,
      createdAt:        Date.now(),
      label:            `${home} v ${away}`,
      homeTeamName:     home,
      awayTeamName:     away,
      venue,
      events:           events as LoggedMatchEvent[],
      eventCount:       events.length,
      scorelineSnapshot: `${home} ${fmtScore(forScore)} v ${away} ${fmtScore(oppScore)}`,
      restoreContext: {
        matchState:                  halfRef.current === 2 ? "SECOND_HALF" : "FIRST_HALF",
        currentHalf:                 halfRef.current,
        matchTimeSeconds:            clockSecondsRef.current,
        firstHalfAttackingDirection: session.attackDirection === "left" ? "LEFT" : "RIGHT",
      },
    };

    const ok = saveProTaggerMatch(record);
    if (!ok) {
      setSaveFeedback("Save failed — storage unavailable.");
      setTimeout(() => setSaveFeedback(null), 3000);
      return;
    }
    onEnd();
  }, [session, onEnd]);

  const homeLabel = session.homeTeamName.trim() || "Home";
  const awayLabel = session.awayTeamName.trim() || "Away";

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <span style={S.matchLabel}>{homeLabel} v {awayLabel}</span>
        <div style={S.halfGroup}>
          {([1, 2] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHalf(h)}
              style={{ ...S.halfBtn, ...(half === h ? S.halfBtnOn : {}) }}
            >
              {h}H
            </button>
          ))}
        </div>
        <span style={S.spacer} />
        <span style={S.clock}>{fmtClock(clockSeconds)}</span>
        <button onClick={toggleClock} style={S.iconBtn}>
          {clockRunning ? "⏸" : "▶"}
        </button>
        <button
          onClick={undo}
          disabled={loggedEvents.length === 0}
          style={{ ...S.iconBtn, ...(loggedEvents.length === 0 ? S.btnDisabled : {}) }}
        >
          ↩
        </button>
        <button
          onClick={handleSaveAndEnd}
          style={S.saveBtn}
          disabled={loggedEvents.length === 0}
        >
          Save
        </button>
      </div>

      {/* ── Pitch ──────────────────────────────────────────────────── */}
      <ProTaggerPitchView
        sport={session.sport}
        attackDirection={session.attackDirection}
        half={half}
        feedbackDot={feedbackDot}
        interactive={phase === "PITCH_TAP"}
        onTap={handlePitchTap}
      />

      {/* ── Bottom panel ───────────────────────────────────────────── */}
      <div style={S.bottom}>
        {phase === "IDLE" && (
          <ProTaggerFamilyGrid sport={session.sport} onTileTap={handleTileTap} />
        )}
        {phase === "PLAYER_PICK" && (
          <ProTaggerPlayerPicker
            forTeamName={session.homeTeamName}
            onSelect={handlePlayerSelect}
          />
        )}
        {phase === "PITCH_TAP" && (
          <div style={S.pitchInstruction}>
            <span style={S.instructionText}>
              Tap the pitch to place the event
            </span>
            <button style={S.cancelBtn} onClick={() => { setPending(null); setPhase("IDLE"); }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Event count strip ──────────────────────────────────────── */}
      <div style={S.strip}>
        {saveFeedback ? (
          <span style={S.saveFeedback}>{saveFeedback}</span>
        ) : (
          <span style={S.eventCount}>
            {loggedEvents.length} event{loggedEvents.length !== 1 ? "s" : ""} logged
            {phase === "PLAYER_PICK" && pending && (
              <span style={S.pendingHint}>
                {" · "}
                {pending.teamSide === "OPP" ? "−" : ""}
                {pending.tileLabel}
              </span>
            )}
          </span>
        )}
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
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    WebkitTapHighlightColor: "transparent",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 12px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  matchLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 120,
  },
  halfGroup: { display: "flex", gap: 3, flexShrink: 0 },
  halfBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 5,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 9px",
    cursor: "pointer",
    outline: "none",
  },
  halfBtnOn: {
    background: "#1f6feb",
    borderColor: "#388bfd",
    color: "#ffffff",
  },
  spacer: { flex: 1 },
  clock: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 14,
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 44,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  iconBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 14,
    padding: "5px 9px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  btnDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  saveBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 12px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  bottom: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  pitchInstruction: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "0 16px",
  },
  instructionText: {
    fontSize: 16,
    fontWeight: 600,
    color: "#e6edf3",
    textAlign: "center" as const,
    letterSpacing: "-0.2px",
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 24px",
    cursor: "pointer",
    outline: "none",
  },
  strip: {
    padding: "6px 14px 8px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
    minHeight: 28,
    display: "flex",
    alignItems: "center",
  },
  eventCount: {
    fontSize: 12,
    color: "#8b949e",
    fontVariantNumeric: "tabular-nums",
  },
  pendingHint: {
    color: "#e6edf3",
    fontWeight: 600,
  },
  saveFeedback: {
    fontSize: 12,
    color: "#f85149",
    fontWeight: 600,
  },
};
