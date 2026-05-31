import { useState, useRef, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import type { ProTaggerSession, ProTaggerSquadPlayer } from "./pro-tagger-session";
import type { ProTaggerFamilyId } from "./pro-tagger-families";
import { PRO_TAGGER_FAMILIES, getFamilyLabel } from "./pro-tagger-families";
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

// Families where a placement in the wrong attacking half is suspicious.
const SCORING_FAMILY_IDS = new Set<ProTaggerFamilyId>([
  "GOAL", "POINT", "TWO_POINT", "SHOT", "WIDE",
]);

// ── Match state machine ───────────────────────────────────────────────────────

type MatchState =
  | "PRE_MATCH"
  | "FIRST_HALF"
  | "HALF_TIME"
  | "SECOND_HALF"
  | "FULL_TIME";

const MATCH_STATE_LABEL: Record<MatchState, string> = {
  PRE_MATCH:   "PRE",
  FIRST_HALF:  "1H",
  HALF_TIME:   "HT",
  SECOND_HALF: "2H",
  FULL_TIME:   "FT",
};

const MATCH_STATE_COLOUR: Record<MatchState, string> = {
  PRE_MATCH:   "#6e7681",
  FIRST_HALF:  "#2ea043",
  HALF_TIME:   "#d97706",
  SECOND_HALF: "#2ea043",
  FULL_TIME:   "#6e7681",
};

// ── Capture phase ─────────────────────────────────────────────────────────────

type CapturePhase = "IDLE" | "PLAYER_PICK" | "PITCH_TAP";

type PendingAction = {
  familyId:       ProTaggerFamilyId;
  tileLabel:      string;
  teamSide:       "FOR" | "OPP";
  player:         SelectedPlayer | null;
  playerResolved: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function fmtGP(goals: number, points: number): string {
  return `${goals}-${String(points).padStart(2, "0")}`;
}

function fmtScore(s: { goals: number; points: number; total: number }): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

function fmtClock(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Initialise live squad from session — always starts with starters 1–15 active.
function initSquad(players: ProTaggerSquadPlayer[]): ProTaggerSquadPlayer[] {
  return players.map((p, i) => ({
    ...p,
    isActive:   i < 15,
    activeSlot: i < 15 ? i + 1 : undefined,
  }));
}

// ── PendingContextBar ─────────────────────────────────────────────────────────

function PendingContextBar({
  pending,
  sport,
  showPlayer,
  onCancel,
}: {
  pending: PendingAction;
  sport: ProTaggerSession["sport"];
  showPlayer: boolean;
  onCancel: () => void;
}) {
  const family = PRO_TAGGER_FAMILIES.find((f) => f.id === pending.familyId);
  const colour = family?.colour ?? "#8b949e";
  const familyLabel = family ? getFamilyLabel(family, sport) : pending.familyId;
  const isOpp = pending.teamSide === "OPP";

  return (
    <div style={{ ...CB.bar, borderLeftColor: colour }}>
      <div style={CB.left}>
        <span style={{ ...CB.dot, background: colour }} />
        <span style={CB.familyText}>{familyLabel}</span>
        <span style={CB.sep}>·</span>
        <span style={CB.tileText}>{isOpp ? "−" : ""}{pending.tileLabel}</span>
        {isOpp && <span style={CB.oppBadge}>OPP</span>}
        {showPlayer && (
          <span style={CB.playerText}>
            {pending.player
              ? ` · #${pending.player.playerNumber} ${pending.player.playerName}`
              : " · No player"}
          </span>
        )}
      </div>
      <button style={CB.cancelBtn} onClick={onCancel}>Cancel</button>
    </div>
  );
}

const CB: Record<string, CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px 8px 10px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    borderLeft: "3px solid transparent",
    flexShrink: 0,
    gap: 8,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    overflow: "hidden",
  },
  dot:       { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  familyText: { fontSize: 12, fontWeight: 700, color: "#e6edf3", whiteSpace: "nowrap" as const, flexShrink: 0 },
  sep:        { color: "#30363d", fontSize: 12, flexShrink: 0 },
  tileText:   { fontSize: 12, fontWeight: 600, color: "#e6edf3", whiteSpace: "nowrap" as const, flexShrink: 0 },
  oppBadge: {
    fontSize: 10, fontWeight: 700, color: "#f87171",
    background: "rgba(248,113,113,0.12)", borderRadius: 4, padding: "1px 5px", flexShrink: 0,
  },
  playerText: { fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  cancelBtn: {
    background: "transparent", border: "1px solid #30363d", borderRadius: 6,
    color: "#8b949e", fontSize: 12, fontWeight: 600, padding: "4px 10px",
    cursor: "pointer", outline: "none", flexShrink: 0, whiteSpace: "nowrap" as const,
  },
};

// ── ProTaggerLiveScreen ───────────────────────────────────────────────────────

export function ProTaggerLiveScreen({ session, onEnd }: Props) {
  const [phase, setPhase]               = useState<CapturePhase>("IDLE");
  const [pending, setPending]           = useState<PendingAction | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [half, setHalf]                 = useState<1 | 2>(1);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [matchState, setMatchState]     = useState<MatchState>("PRE_MATCH");
  const [feedbackDot, setFeedbackDot]   = useState<{ nx: number; ny: number } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [wrongWayActive, setWrongWayActive] = useState(false);

  // ── Live squad state (substitutions) ─────────────────────────────────────
  const [homeSquadState, setHomeSquadState] = useState<ProTaggerSquadPlayer[]>(() =>
    initSquad(session.homeSquad.players),
  );
  const [awaySquadState, setAwaySquadState] = useState<ProTaggerSquadPlayer[]>(() =>
    initSquad(session.awaySquad.players),
  );
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [subTeam, setSubTeam]           = useState<"home" | "away">("home");
  const [subOutId, setSubOutId]         = useState<string | null>(null);
  const [subInId, setSubInId]           = useState<string | null>(null);

  const clockStartRef    = useRef<number | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockSecondsRef  = useRef(0);
  const halfRef          = useRef<1 | 2>(1);
  const loggedRef        = useRef<readonly LoggedMatchEvent[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchStateRef    = useRef<MatchState>("PRE_MATCH");
  const wrongWayActiveRef  = useRef(false);
  const wrongWayTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { clockSecondsRef.current = clockSeconds; }, [clockSeconds]);
  useEffect(() => { halfRef.current = half; }, [half]);
  useEffect(() => { loggedRef.current = loggedEvents; }, [loggedEvents]);
  useEffect(() => { matchStateRef.current = matchState; }, [matchState]);
  useEffect(() => { wrongWayActiveRef.current = wrongWayActive; }, [wrongWayActive]);

  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (wrongWayTimerRef.current) clearTimeout(wrongWayTimerRef.current);
    };
  }, []);

  // ── Match flow transitions ────────────────────────────────────────────────

  const handleStartMatch = useCallback(() => {
    clockSecondsRef.current = 0;
    setClockSeconds(0);
    clockStartRef.current = Date.now();
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    clockIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - clockStartRef.current!) / 1000);
      clockSecondsRef.current = elapsed;
      setClockSeconds(elapsed);
    }, 500);
    halfRef.current = 1;
    setHalf(1);
    matchStateRef.current = "FIRST_HALF";
    setMatchState("FIRST_HALF");
  }, []);

  function freezeMatch(nextState: "HALF_TIME" | "FULL_TIME") {
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (wrongWayTimerRef.current) { clearTimeout(wrongWayTimerRef.current); wrongWayTimerRef.current = null; }
    wrongWayActiveRef.current = false;
    setWrongWayActive(false);
    setFeedbackDot(null);
    setPending(null);
    setPhase("IDLE");
    matchStateRef.current = nextState;
    setMatchState(nextState);
  }

  const handleHalfTime = useCallback(() => {
    freezeMatch("HALF_TIME");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartSecondHalf = useCallback(() => {
    clockStartRef.current = Date.now() - clockSecondsRef.current * 1000;
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    clockIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - clockStartRef.current!) / 1000);
      clockSecondsRef.current = elapsed;
      setClockSeconds(elapsed);
    }, 500);
    halfRef.current = 2;
    setHalf(2);
    matchStateRef.current = "SECOND_HALF";
    setMatchState("SECOND_HALF");
  }, []);

  const handleFullTime = useCallback(() => {
    freezeMatch("FULL_TIME");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Capture flow ──────────────────────────────────────────────────────────

  // Tagging is only allowed during active halves.
  const handleTileTap = useCallback(
    (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP") => {
      const ms = matchStateRef.current;
      if (ms !== "FIRST_HALF" && ms !== "SECOND_HALF") return;
      setPending({ familyId, tileLabel, teamSide, player: null, playerResolved: false });
      setPhase("PLAYER_PICK");
    },
    [],
  );

  const handlePlayerSelect = useCallback((player: SelectedPlayer | null) => {
    setPending((prev) =>
      prev ? { ...prev, player, playerResolved: true } : null,
    );
    setPhase("PITCH_TAP");
  }, []);

  // Attack direction logic: `nx` is normalised landscape-X [0,1] — the
  // length-of-pitch axis. attackingDown=true means FOR attacks toward nx=1.
  // Scoring events in the wrong half trigger a 3-second override window.
  // A second tap within that window (or any tap in the correct half) saves.
  const handlePitchTap = useCallback(
    (nx: number, ny: number) => {
      const p = pending;
      if (!p) return;

      if (SCORING_FAMILY_IDS.has(p.familyId)) {
        const attackingDown =
          (halfRef.current === 1 && session.attackDirection === "right") ||
          (halfRef.current === 2 && session.attackDirection === "left");
        const forExpectsHighNx = attackingDown;
        const tapHighNx = nx > 0.5;
        const inCorrectHalf =
          p.teamSide === "FOR"
            ? tapHighNx === forExpectsHighNx
            : tapHighNx !== forExpectsHighNx;

        if (!inCorrectHalf && !wrongWayActiveRef.current) {
          // First wrong-way tap — show warning, do not save.
          setWrongWayActive(true);
          wrongWayActiveRef.current = true;
          if (wrongWayTimerRef.current) clearTimeout(wrongWayTimerRef.current);
          wrongWayTimerRef.current = setTimeout(() => {
            setWrongWayActive(false);
            wrongWayActiveRef.current = false;
            wrongWayTimerRef.current = null;
          }, 3000);
          return;
        }
      }

      // Clear wrong-way state (normal tap or override second tap).
      if (wrongWayTimerRef.current) { clearTimeout(wrongWayTimerRef.current); wrongWayTimerRef.current = null; }
      setWrongWayActive(false);
      wrongWayActiveRef.current = false;

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

      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackDot(null);
        setPending(null);
        setPhase("IDLE");
      }, 750);
    },
    [pending, session.attackDirection],
  );

  const cancelFlow = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (wrongWayTimerRef.current) { clearTimeout(wrongWayTimerRef.current); wrongWayTimerRef.current = null; }
    wrongWayActiveRef.current = false;
    setWrongWayActive(false);
    setFeedbackDot(null);
    setPending(null);
    setPhase("IDLE");
  }, []);

  // ── Substitutions ─────────────────────────────────────────────────────────

  const openSubSheet = useCallback(() => {
    setSubTeam("home");
    setSubOutId(null);
    setSubInId(null);
    setSubSheetOpen(true);
  }, []);

  const confirmSub = useCallback(() => {
    if (!subOutId || !subInId) return;
    const setter = subTeam === "home" ? setHomeSquadState : setAwaySquadState;
    setter((prev) => {
      const outgoing = prev.find((p) => p.id === subOutId);
      const outgoingSlot = outgoing?.activeSlot;
      return prev.map((p) => {
        if (p.id === subOutId) return { ...p, isActive: false as const, activeSlot: undefined };
        if (p.id === subInId)  return { ...p, isActive: true as const,  activeSlot: outgoingSlot };
        return p;
      });
    });
    setSubOutId(null);
    setSubInId(null);
    setSubSheetOpen(false);
  }, [subOutId, subInId, subTeam]);

  // ── Undo / Save ───────────────────────────────────────────────────────────

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
      id:                `pro-tagger-${newEventId()}`,
      createdAt:         Date.now(),
      label:             `${home} v ${away}`,
      homeTeamName:      home,
      awayTeamName:      away,
      venue,
      events:            events as LoggedMatchEvent[],
      eventCount:        events.length,
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

  // ── Render ────────────────────────────────────────────────────────────────

  const homeLabel = session.homeTeamName.trim() || "Home";
  const awayLabel = session.awayTeamName.trim() || "Away";
  const canUndo   = phase === "IDLE" && loggedEvents.length > 0;
  const canSave   = phase === "IDLE" && loggedEvents.length > 0;

  const forScore = computeScoreSide(loggedEvents, "FOR");
  const oppScore = computeScoreSide(loggedEvents, "OPP");

  const badgeAccent   = MATCH_STATE_COLOUR[matchState];
  const homeColour    = session.homeSquad.primaryColour ?? "#16a34a";
  const awayColour    = session.awaySquad.primaryColour ?? "#dc2626";

  // Subs sheet derived values (computed once per render, outside JSX).
  const subSquadState     = subTeam === "home" ? homeSquadState : awaySquadState;
  const subTeamLabel      = subTeam === "home" ? homeLabel : awayLabel;
  const subTeamColour     = subTeam === "home" ? homeColour : awayColour;
  const subActivePlayers  = subSquadState.filter((p) => p.isActive !== false);
  const subBenchPlayers   = subSquadState.filter((p) => p.isActive === false);
  const subCanConfirm     = subOutId !== null && subInId !== null;

  const isActivePlaying = matchState === "FIRST_HALF" || matchState === "SECOND_HALF";

  return (
    <div style={S.shell}>

      {/* ── Compact match header (always visible) ──────────────────────── */}
      <div style={S.header}>

        {/* Scoreboard row */}
        <div style={S.scoreboard}>
          <span style={{ ...S.teamNameLeft, color: homeColour }}>{homeLabel}</span>
          <span style={S.scoreLeft}>{fmtGP(forScore.goals, forScore.points)}</span>
          <span style={S.vSep}>v</span>
          <span style={S.scoreRight}>{fmtGP(oppScore.goals, oppScore.points)}</span>
          <span style={{ ...S.teamNameRight, color: awayColour }}>{awayLabel}</span>
        </div>

        {/* Controls row */}
        <div style={S.controls}>
          <span style={{ ...S.stateBadge, borderColor: badgeAccent, color: badgeAccent }}>
            {MATCH_STATE_LABEL[matchState]}
          </span>
          <span style={S.clock}>{fmtClock(clockSeconds)}</span>
          <span style={S.spacer} />

          {matchState === "PRE_MATCH" && (
            <button onClick={handleStartMatch} style={S.startBtn}>▶ Start</button>
          )}
          {matchState === "FIRST_HALF" && (
            <button onClick={handleHalfTime} style={S.htBtn}>HT</button>
          )}
          {matchState === "SECOND_HALF" && (
            <button onClick={handleFullTime} style={S.ftBtn}>FT</button>
          )}
          {isActivePlaying && (
            <button style={S.subsBtn} onClick={openSubSheet}>⇄ Subs</button>
          )}

          <button
            onClick={undo}
            disabled={!canUndo}
            style={{ ...S.iconBtn, ...(!canUndo ? S.btnDisabled : {}) }}
          >
            ↩
          </button>
          <button
            onClick={handleSaveAndEnd}
            disabled={!canSave}
            style={{ ...S.saveBtn, ...(!canSave ? S.btnDisabled : {}) }}
          >
            Save
          </button>
        </div>
      </div>

      {/* ══ MATCH BREAK SCREENS ════════════════════════════════════════════ */}

      {matchState === "HALF_TIME" && (
        <div style={S.breakScreen}>
          <span style={S.breakLabel}>HALF TIME</span>
          <div style={S.breakScoreLine}>
            <span style={S.breakScoreTeam}>{homeLabel}</span>
            <span style={S.breakScoreValue}>
              {fmtGP(forScore.goals, forScore.points)}
            </span>
            <span style={S.breakScoreVSep}>–</span>
            <span style={S.breakScoreValue}>
              {fmtGP(oppScore.goals, oppScore.points)}
            </span>
            <span style={S.breakScoreTeam}>{awayLabel}</span>
          </div>
          <button onClick={handleStartSecondHalf} style={S.resumeBtn}>
            START SECOND HALF
          </button>
          {saveFeedback && <span style={S.saveFeedbackText}>{saveFeedback}</span>}
        </div>
      )}

      {matchState === "FULL_TIME" && (
        <div style={S.breakScreen}>
          <span style={S.breakLabel}>MATCH COMPLETE</span>
          <div style={S.breakScoreLine}>
            <span style={S.breakScoreTeam}>{homeLabel}</span>
            <span style={S.breakScoreValue}>
              {fmtGP(forScore.goals, forScore.points)}
            </span>
            <span style={S.breakScoreVSep}>–</span>
            <span style={S.breakScoreValue}>
              {fmtGP(oppScore.goals, oppScore.points)}
            </span>
            <span style={S.breakScoreTeam}>{awayLabel}</span>
          </div>
          {canSave ? (
            <button onClick={handleSaveAndEnd} style={S.resumeBtn}>Save &amp; Finish</button>
          ) : (
            <button onClick={onEnd} style={{ ...S.resumeBtn, background: "#21262d", borderColor: "#30363d" }}>
              Finish
            </button>
          )}
          {saveFeedback && <span style={S.saveFeedbackText}>{saveFeedback}</span>}
        </div>
      )}

      {/* ══ NORMAL CAPTURE FLOW (hidden during break screens) ═══════════════ */}

      {matchState !== "HALF_TIME" && matchState !== "FULL_TIME" && (
        <>
          {/* SCREEN: IDLE */}
          {phase === "IDLE" && (
            <>
              <ProTaggerFamilyGrid sport={session.sport} onTileTap={handleTileTap} />
              <div style={S.strip}>
                {saveFeedback ? (
                  <span style={S.saveFeedbackText}>{saveFeedback}</span>
                ) : matchState === "PRE_MATCH" ? (
                  <span style={S.eventCount}>Press ▶ Start to begin</span>
                ) : (
                  <span style={S.eventCount}>
                    {loggedEvents.length > 0
                      ? `${loggedEvents.length} event${loggedEvents.length !== 1 ? "s" : ""} logged`
                      : "Tap a tile to log an event"}
                  </span>
                )}
              </div>
            </>
          )}

          {/* SCREEN: PLAYER_PICK */}
          {phase === "PLAYER_PICK" && pending && (
            <>
              <PendingContextBar
                pending={pending}
                sport={session.sport}
                showPlayer={false}
                onCancel={cancelFlow}
              />
              <div style={S.pickerWrap}>
                <ProTaggerPlayerPicker
                  teamLabel={
                    pending.teamSide === "FOR"
                      ? (session.homeTeamName.trim() || "Home")
                      : (session.awayTeamName.trim() || "Away")
                  }
                  squad={
                    pending.teamSide === "FOR"
                      ? homeSquadState
                      : awaySquadState
                  }
                  squadId={
                    pending.teamSide === "FOR"
                      ? session.homeSquad.id
                      : session.awaySquad.id
                  }
                  teamColour={
                    pending.teamSide === "FOR" ? homeColour : awayColour
                  }
                  onSelect={handlePlayerSelect}
                />
              </div>
            </>
          )}

          {/* SCREEN: PITCH_TAP */}
          {phase === "PITCH_TAP" && pending && (
            <>
              <PendingContextBar
                pending={pending}
                sport={session.sport}
                showPlayer={true}
                onCancel={cancelFlow}
              />
              <div style={S.pitchWrap}>
                <ProTaggerPitchView
                  sport={session.sport}
                  attackDirection={session.attackDirection}
                  half={half}
                  feedbackDot={feedbackDot}
                  interactive={feedbackDot === null}
                  onTap={handlePitchTap}
                />
              </div>
              <div style={S.pitchFooter}>
                {feedbackDot ? (
                  <span style={S.savedText}>✓ Event saved</span>
                ) : wrongWayActive ? (
                  <span style={S.wrongWayText}>Wrong way? Tap again to override</span>
                ) : (
                  <span style={S.tapHintText}>Tap the pitch to place the event</span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Substitutions sheet ────────────────────────────────────── */}
      {subSheetOpen && (
        <div style={SS.overlay} onClick={() => setSubSheetOpen(false)}>
          <div style={SS.sheet} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={SS.header}>
              <div style={SS.teamToggle}>
                <button
                  style={{ ...SS.teamBtn, ...(subTeam === "home" ? { ...SS.teamBtnOn, borderColor: homeColour, color: homeColour } : {}) }}
                  onClick={() => { setSubTeam("home"); setSubOutId(null); setSubInId(null); }}
                >
                  {homeLabel}
                </button>
                <button
                  style={{ ...SS.teamBtn, ...(subTeam === "away" ? { ...SS.teamBtnOn, borderColor: awayColour, color: awayColour } : {}) }}
                  onClick={() => { setSubTeam("away"); setSubOutId(null); setSubInId(null); }}
                >
                  {awayLabel}
                </button>
              </div>
              <span style={SS.title}>Substitutions</span>
              <button style={SS.closeBtn} onClick={() => setSubSheetOpen(false)}>✕</button>
            </div>

            {/* Body */}
            <div style={SS.body}>
              <div style={SS.sectionLabel}>Sub Out — Active ({subActivePlayers.length})</div>
              <div style={SS.pillRow}>
                {subActivePlayers.map((p) => (
                  <button
                    key={p.id}
                    style={{
                      ...SS.pill,
                      ...(subOutId === p.id
                        ? { border: `1px solid ${subTeamColour}`, color: "#e6edf3", background: "#21262d" }
                        : {}),
                    }}
                    onClick={() => setSubOutId((prev) => prev === p.id ? null : p.id)}
                  >
                    #{p.number}{p.name.trim() ? ` ${p.name.trim()}` : ""}
                  </button>
                ))}
                {subActivePlayers.length === 0 && (
                  <span style={SS.emptyNote}>No active players</span>
                )}
              </div>

              <div style={SS.sectionLabel}>Sub In — Bench ({subBenchPlayers.length})</div>
              <div style={SS.pillRow}>
                {subBenchPlayers.map((p) => (
                  <button
                    key={p.id}
                    style={{
                      ...SS.pill,
                      ...(subInId === p.id
                        ? { border: "1px solid #2ea043", color: "#e6edf3", background: "#21262d" }
                        : {}),
                    }}
                    onClick={() => setSubInId((prev) => prev === p.id ? null : p.id)}
                  >
                    #{p.number}{p.name.trim() ? ` ${p.name.trim()}` : ""}
                  </button>
                ))}
                {subBenchPlayers.length === 0 && (
                  <span style={SS.emptyNote}>No bench players</span>
                )}
              </div>

              {subOutId && subInId && (
                <div style={SS.preview}>
                  <span style={SS.previewText}>
                    #{subSquadState.find(p => p.id === subOutId)?.number} off →{" "}
                    #{subSquadState.find(p => p.id === subInId)?.number} on ({subTeamLabel})
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={SS.footer}>
              <button
                style={{ ...SS.confirmBtn, ...(!subCanConfirm ? SS.confirmDisabled : {}) }}
                disabled={!subCanConfirm}
                onClick={confirmSub}
              >
                Confirm Sub
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// ── Main styles ───────────────────────────────────────────────────────────────

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
    position: "relative",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    display: "flex",
    flexDirection: "column",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },

  // Scoreboard row
  scoreboard: {
    display: "flex",
    alignItems: "center",
    padding: "8px 14px 4px",
    gap: 6,
  },
  teamNameLeft: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    textAlign: "left" as const,
  },
  teamNameRight: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    textAlign: "right" as const,
  },
  scoreLeft: {
    fontSize: 22,
    fontWeight: 800,
    color: "#e6edf3",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.5px",
    flexShrink: 0,
  },
  scoreRight: {
    fontSize: 22,
    fontWeight: 800,
    color: "#e6edf3",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.5px",
    flexShrink: 0,
  },
  vSep: {
    fontSize: 13,
    fontWeight: 600,
    color: "#30363d",
    flexShrink: 0,
  },

  // Controls row
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px 8px",
    borderTop: "1px solid #21262d",
  },
  stateBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    border: "1px solid",
    borderRadius: 4,
    padding: "2px 6px",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  clock: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 14,
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 44,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  spacer: { flex: 1 },
  startBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 12px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  htBtn: {
    background: "rgba(180,83,9,0.18)",
    border: "1px solid #d97706",
    borderRadius: 6,
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    padding: "4px 11px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  ftBtn: {
    background: "rgba(185,28,28,0.18)",
    border: "1px solid #dc2626",
    borderRadius: 6,
    color: "#f87171",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    padding: "4px 11px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  subsBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 9px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
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
  btnDisabled: { opacity: 0.35, cursor: "default" },
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

  // ── Break screens (HALF_TIME / FULL_TIME) ───────────────────────────────────
  breakScreen: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    background: "#0d1117",
    padding: "24px 20px",
  },
  breakLabel: {
    fontSize: 28,
    fontWeight: 800,
    color: "#e6edf3",
    letterSpacing: "0.06em",
    textAlign: "center" as const,
  },
  breakScoreLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  breakScoreTeam: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6e7681",
    maxWidth: 80,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  breakScoreValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#e6edf3",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.5px",
  },
  breakScoreVSep: {
    fontSize: 20,
    fontWeight: 600,
    color: "#30363d",
  },
  resumeBtn: {
    background: "#1f6feb",
    border: "1px solid #388bfd",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px 28px",
    cursor: "pointer",
    outline: "none",
    letterSpacing: "0.03em",
  },

  // ── IDLE: strip ─────────────────────────────────────────────────────────────
  strip: {
    padding: "7px 14px 9px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  eventCount:       { fontSize: 12, color: "#8b949e", fontVariantNumeric: "tabular-nums" },
  saveFeedbackText: { fontSize: 12, color: "#f85149", fontWeight: 600 },

  // ── PLAYER_PICK ─────────────────────────────────────────────────────────────
  pickerWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  // ── PITCH_TAP ───────────────────────────────────────────────────────────────
  pitchWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    background: "#0d1117",
    overflow: "hidden",
  },
  pitchFooter: {
    padding: "10px 14px 12px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tapHintText:  { fontSize: 13, color: "#8b949e", fontWeight: 500 },
  savedText:    { fontSize: 13, color: "#2ea043", fontWeight: 700 },
  wrongWayText: { fontSize: 13, color: "#f59e0b", fontWeight: 700 },
};

// ── Subs sheet styles ─────────────────────────────────────────────────────────

const SS: Record<string, CSSProperties> = {
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.65)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  sheet: {
    background: "#161b22",
    borderRadius: "14px 14px 0 0",
    maxHeight: "72vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px 10px",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  teamToggle: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
  },
  teamBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  teamBtnOn: {
    background: "transparent",
    fontWeight: 800,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
    textAlign: "center" as const,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#6e7681",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
    outline: "none",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 14px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#8b949e",
    paddingBottom: 2,
  },
  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginBottom: 4,
  },
  pill: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    whiteSpace: "nowrap" as const,
  },
  emptyNote: {
    fontSize: 12,
    color: "#6e7681",
    fontStyle: "italic",
    padding: "4px 0",
  },
  preview: {
    padding: "8px 0 2px",
    borderTop: "1px solid #21262d",
  },
  previewText: {
    fontSize: 12,
    color: "#2ea043",
    fontWeight: 600,
  },
  footer: {
    padding: "10px 14px 20px",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  confirmBtn: {
    width: "100%",
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px",
    cursor: "pointer",
    outline: "none",
    boxSizing: "border-box" as const,
    WebkitTapHighlightColor: "transparent",
  },
  confirmDisabled: {
    background: "#21262d",
    borderColor: "#30363d",
    color: "#6e7681",
    cursor: "default",
    opacity: 0.6,
  },
};
