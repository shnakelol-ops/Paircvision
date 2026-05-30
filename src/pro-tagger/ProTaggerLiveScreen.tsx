import { useState, useRef, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import type { ProTaggerFamilyId } from "./pro-tagger-families";
import { PRO_TAGGER_FAMILIES, getFamilyLabel } from "./pro-tagger-families";

// Families where a placement in the wrong attacking half is suspicious.
const SCORING_FAMILY_IDS = new Set<ProTaggerFamilyId>(["GOAL", "POINT", "TWO_POINT", "SHOT", "WIDE"]);
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
  familyId:       ProTaggerFamilyId;
  tileLabel:      string;
  teamSide:       "FOR" | "OPP";
  player:         SelectedPlayer | null;
  playerResolved: boolean; // true once player step completed (even if null = skipped)
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

function fmtScore(s: { goals: number; points: number; total: number }): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

function fmtClock(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ── PendingContextBar ─────────────────────────────────────────────────────────
// Shown at the top of the PLAYER_PICK and PITCH_TAP screens.

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
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  familyText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#e6edf3",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  sep: {
    color: "#30363d",
    fontSize: 12,
    flexShrink: 0,
  },
  tileText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#e6edf3",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  oppBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#f87171",
    background: "rgba(248,113,113,0.12)",
    borderRadius: 4,
    padding: "1px 5px",
    flexShrink: 0,
  },
  playerText: {
    fontSize: 12,
    color: "#8b949e",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
};

// ── ProTaggerLiveScreen ───────────────────────────────────────────────────────

export function ProTaggerLiveScreen({ session, onEnd }: Props) {
  const [phase, setPhase]               = useState<CapturePhase>("IDLE");
  const [pending, setPending]           = useState<PendingAction | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [half, setHalf]                 = useState<1 | 2>(1);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const [feedbackDot, setFeedbackDot]     = useState<{ nx: number; ny: number } | null>(null);
  const [saveFeedback, setSaveFeedback]   = useState<string | null>(null);
  const [wrongWayActive, setWrongWayActive] = useState(false);

  const clockStartRef    = useRef<number | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockSecondsRef  = useRef(0);
  const halfRef          = useRef<1 | 2>(1);
  const loggedRef        = useRef<readonly LoggedMatchEvent[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongWayActiveRef  = useRef(false);
  const wrongWayTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { clockSecondsRef.current = clockSeconds; }, [clockSeconds]);
  useEffect(() => { halfRef.current = half; }, [half]);
  useEffect(() => { loggedRef.current = loggedEvents; }, [loggedEvents]);

  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (wrongWayTimerRef.current) clearTimeout(wrongWayTimerRef.current);
    };
  }, []);

  // ── Clock ──────────────────────────────────────────────────────────────────

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

  // ── Capture flow ───────────────────────────────────────────────────────────

  // Step 1: tile tapped → go to player pick screen
  const handleTileTap = useCallback(
    (familyId: ProTaggerFamilyId, tileLabel: string, teamSide: "FOR" | "OPP") => {
      setPending({ familyId, tileLabel, teamSide, player: null, playerResolved: false });
      setPhase("PLAYER_PICK");
    },
    [],
  );

  // Step 2: player selected or skipped → go to pitch screen
  const handlePlayerSelect = useCallback((player: SelectedPlayer | null) => {
    setPending((prev) =>
      prev ? { ...prev, player, playerResolved: true } : null,
    );
    setPhase("PITCH_TAP");
  }, []);

  // Step 3: pitch tapped → wrong-way guard, then save + pulse dot, return to IDLE.
  //
  // Attack direction logic: `nx` is normalised landscape-X [0,1], i.e. the
  // length-of-pitch axis.  attackingDown=true means FOR attacks toward nx=1.
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
          }, 3000);
          return;
        }
      }

      // Clear wrong-way state (normal tap or override second tap).
      if (wrongWayTimerRef.current) clearTimeout(wrongWayTimerRef.current);
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

      // Show pulse confirmation dot for 750 ms, then return to IDLE.
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

  // Cancel from any mid-flow screen
  const cancelFlow = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (wrongWayTimerRef.current) clearTimeout(wrongWayTimerRef.current);
    setWrongWayActive(false);
    wrongWayActiveRef.current = false;
    setFeedbackDot(null);
    setPending(null);
    setPhase("IDLE");
  }, []);

  // ── Undo / Save ────────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const homeLabel = session.homeTeamName.trim() || "Home";
  const awayLabel = session.awayTeamName.trim() || "Away";
  const canUndo   = phase === "IDLE" && loggedEvents.length > 0;
  const canSave   = phase === "IDLE" && loggedEvents.length > 0;

  return (
    <div style={S.shell}>

      {/* ── Header — always visible ─────────────────────────────────── */}
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

      {/* ══ SCREEN: IDLE — event family grid only ══════════════════════ */}
      {phase === "IDLE" && (
        <>
          <ProTaggerFamilyGrid sport={session.sport} onTileTap={handleTileTap} />
          <div style={S.strip}>
            {saveFeedback ? (
              <span style={S.saveFeedbackText}>{saveFeedback}</span>
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

      {/* ══ SCREEN: PLAYER_PICK — player picker only ═══════════════════ */}
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
                  ? session.homeSquad.players
                  : session.awaySquad.players
              }
              squadId={
                pending.teamSide === "FOR"
                  ? session.homeSquad.id
                  : session.awaySquad.id
              }
              teamColour={
                pending.teamSide === "FOR"
                  ? (session.homeSquad.primaryColour ?? "#16a34a")
                  : (session.awaySquad.primaryColour ?? "#dc2626")
              }
              onSelect={handlePlayerSelect}
            />
          </div>
        </>
      )}

      {/* ══ SCREEN: PITCH_TAP — SVG pitch only ═════════════════════════ */}
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

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // ── Header ──────────────────────────────────────────────────────────────
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
    flexShrink: 1,
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

  // ── IDLE: strip ──────────────────────────────────────────────────────────
  strip: {
    padding: "7px 14px 9px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  eventCount: {
    fontSize: 12,
    color: "#8b949e",
    fontVariantNumeric: "tabular-nums",
  },
  saveFeedbackText: {
    fontSize: 12,
    color: "#f85149",
    fontWeight: 600,
  },

  // ── PLAYER_PICK: picker wrapper ──────────────────────────────────────────
  pickerWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  // ── PITCH_TAP: pitch area + footer ───────────────────────────────────────
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
  tapHintText: {
    fontSize: 13,
    color: "#8b949e",
    fontWeight: 500,
  },
  savedText: {
    fontSize: 13,
    color: "#2ea043",
    fontWeight: 700,
  },
  wrongWayText: {
    fontSize: 13,
    color: "#f59e0b",
    fontWeight: 700,
  },
};
