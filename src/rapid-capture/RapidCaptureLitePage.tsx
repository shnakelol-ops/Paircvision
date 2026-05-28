import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  createPixiPitchSurface,
  type PixiPitchSurfaceHandle,
} from "../core/pitch/create-pixi-pitch-surface";
import {
  createMatchEvent,
  type MatchEvent,
  type MatchEventKind,
} from "../core/stats/stats-event-model";
import { computeTerritorialPressure } from "../tactical/pressure-engine";
import { computeTacticalSignals, type TacticalSignal } from "../tactical/tactical-signals";

type Sport = "hurling" | "camogie" | "gaelic" | "soccer";

type KeyGroup = "scoring" | "turnover" | "restart" | "free";

type RapidBarItem = {
  kind: MatchEventKind;
  label: string;
  puckoutLabel?: string;
  group: KeyGroup;
  hideFor?: readonly Sport[];
};

const SCORING_ROW: RapidBarItem[] = [
  { kind: "GOAL",        label: "Goal",  group: "scoring"                                },
  { kind: "POINT",       label: "Point", group: "scoring"                                },
  { kind: "SHOT",        label: "Shot",  group: "scoring"                                },
  { kind: "TWO_POINTER", label: "2pt",   group: "scoring", hideFor: ["hurling","camogie"] },
  { kind: "WIDE",        label: "Wide",  group: "scoring"                                },
];

const TERRITORIAL_ROW: RapidBarItem[] = [
  { kind: "TURNOVER_WON",    label: "Turn+",  group: "turnover"                                         },
  { kind: "TURNOVER_LOST",   label: "Turn−",  group: "turnover"                                         },
  { kind: "KICKOUT_WON",     label: "Kick+",  puckoutLabel: "Puck+",  group: "restart"                  },
  { kind: "KICKOUT_CONCEDED",label: "Kick−",  puckoutLabel: "Puck−",  group: "restart"                  },
  { kind: "FREE_WON",        label: "Free+",  group: "free"                                             },
  { kind: "FREE_CONCEDED",   label: "Free−",  group: "free"                                             },
];

// Flat list for armed-label lookup (sport toggle may hide some items)
const ALL_BAR_ITEMS: RapidBarItem[] = [...SCORING_ROW, ...TERRITORIAL_ROW];

const SPORT_LABELS: Record<Sport, string> = {
  hurling: "Hurling",
  camogie: "Camogie",
  gaelic: "Football",
  soccer: "Soccer",
};

const SPORT_CYCLE: Sport[] = ["hurling", "camogie", "gaelic", "soccer"];

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Score type: goals + points
type Score = { g: number; p: number };
function fmtScore(s: Score): string {
  return `${s.g}-${s.p.toString().padStart(2, "0")}`;
}
function incGoal(s: Score): Score { return { ...s, g: s.g + 1 }; }
function incPoint(s: Score): Score { return { ...s, p: s.p + 1 }; }
function decGoal(s: Score): Score { return { ...s, g: Math.max(0, s.g - 1) }; }
function decPoint(s: Score): Score { return { ...s, p: Math.max(0, s.p - 1) }; }

export default function RapidCaptureLitePage() {
  const [sport, setSport] = useState<Sport>("hurling");
  const [half, setHalf] = useState<1 | 2>(1);
  // teamSide = annotation perspective (whose story is this event).
  // Sticky manual context — never auto-switches. Mirrors Stats Lite semantics.
  const [teamSide, setTeamSide] = useState<"FOR" | "OPP">("FOR");
  const [armedKind, setArmedKind] = useState<MatchEventKind | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<MatchEvent[]>([]);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const [forScore, setForScore] = useState<Score>({ g: 0, p: 0 });
  const [oppScore, setOppScore] = useState<Score>({ g: 0, p: 0 });

  const pitchHostRef = useRef<HTMLDivElement>(null);
  const pixiHandleRef = useRef<PixiPitchSurfaceHandle | null>(null);

  // Refs provide synchronous latest values for the Pixi closure and for undo
  const armedKindRef = useRef<MatchEventKind | null>(null);
  const teamSideRef = useRef<"FOR" | "OPP">("FOR");
  const halfRef = useRef<1 | 2>(1);
  const clockSecondsRef = useRef(0);
  const loggedEventsRef = useRef<MatchEvent[]>([]);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockStartRef = useRef<number | null>(null);

  // Keep mutable refs in sync with state
  useEffect(() => { armedKindRef.current = armedKind; }, [armedKind]);
  useEffect(() => { teamSideRef.current = teamSide; }, [teamSide]);
  useEffect(() => { halfRef.current = half; }, [half]);
  useEffect(() => { loggedEventsRef.current = loggedEvents; }, [loggedEvents]);

  // Push every event array change to the Pixi surface for dot rendering
  useEffect(() => {
    pixiHandleRef.current?.setEvents(loggedEvents);
  }, [loggedEvents]);

  // Clear clock interval on unmount
  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, []);

  // Re-init Pixi when sport changes; resets the whole session
  useEffect(() => {
    const host = pitchHostRef.current;
    if (!host) return;

    setLoggedEvents([]);
    loggedEventsRef.current = [];
    setArmedKind(null);
    armedKindRef.current = null;
    setTeamSide("FOR");
    teamSideRef.current = "FOR";
    setClockRunning(false);
    setClockSeconds(0);
    clockSecondsRef.current = 0;
    clockStartRef.current = null;
    setForScore({ g: 0, p: 0 });
    setOppScore({ g: 0, p: 0 });
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }

    let handle: PixiPitchSurfaceHandle | null = null;
    let destroyed = false;

    createPixiPitchSurface(host, {
      sport,
      canLogEvents: true,
      onPitchTap: (nx, ny) => {
        const kind = armedKindRef.current;
        if (!kind) return;

        const ts = clockSecondsRef.current;

        // teamSide = annotation perspective at log time — no inference, no auto-advance
        const event = createMatchEvent({
          kind,
          nx,
          ny,
          half: halfRef.current,
          timestamp: ts,
          matchClockSeconds: ts,
          teamSide: teamSideRef.current,
          createdAt: Date.now(),
        });

        const next = [...loggedEventsRef.current, event];
        loggedEventsRef.current = next;
        setLoggedEvents(next);

        // Disarm — next tap must re-select an event type
        armedKindRef.current = null;
        setArmedKind(null);
      },
    }).then((h) => {
      if (destroyed) { h.destroy(); return; }
      handle = h;
      pixiHandleRef.current = h;
    });

    return () => {
      destroyed = true;
      handle?.destroy();
      pixiHandleRef.current = null;
    };
  }, [sport]);

  // FOR/OPP toggle — sets annotation context, persists until coach changes it
  const handleTeamSideChange = useCallback((side: "FOR" | "OPP") => {
    teamSideRef.current = side;
    setTeamSide(side);
  }, []);

  const toggleClock = useCallback(() => {
    if (clockRunning) {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
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

  // Undo removes the last logged event — teamSide is not affected
  const undo = useCallback(() => {
    if (loggedEventsRef.current.length === 0) return;
    const next = loggedEventsRef.current.slice(0, -1);
    loggedEventsRef.current = next;
    setLoggedEvents(next);
  }, []);

  const handleExport = useCallback(() => {
    if (loggedEvents.length === 0) return;
    const payload = JSON.stringify(
      { version: 1, sport, events: loggedEvents, exportedAt: new Date().toISOString() },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapid-capture-${sport}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sport, loggedEvents]);

  const cycleSport = useCallback(() => {
    setSport((current) => {
      const idx = SPORT_CYCLE.indexOf(current);
      return SPORT_CYCLE[(idx + 1) % SPORT_CYCLE.length];
    });
  }, []);

  // Tactical signals — recomputed on every event or clock tick
  const signals: TacticalSignal[] = useMemo(() => {
    if (loggedEvents.length < 2) return [];
    const states = computeTerritorialPressure(loggedEvents, clockSeconds);
    return computeTacticalSignals(states);
  }, [loggedEvents, clockSeconds]);

  const isPuckout = sport === "hurling" || sport === "camogie";

  const visibleScoring = SCORING_ROW.filter((item) => !item.hideFor?.includes(sport));
  const visibleTerritorial = TERRITORIAL_ROW;

  const armedItem = armedKind ? ALL_BAR_ITEMS.find((b) => b.kind === armedKind) : null;
  const armedLabel = armedItem
    ? (armedItem.puckoutLabel && isPuckout ? armedItem.puckoutLabel : armedItem.label)
    : null;

  const attackDir = half === 1 ? "Attacking →" : "Attacking ←";

  return (
    <div style={S.shell}>
      {/* ── Match Context Header ─────────────────── */}
      <div style={S.matchHeader}>
        <div style={S.headerTopRow}>
          <span style={S.wordmark}>PÁIRC</span>
          <div style={S.headerMiddle}>
            <button onClick={cycleSport} style={S.sportChip}>
              {SPORT_LABELS[sport]}
            </button>
            <span style={S.attackDir}>{attackDir}</span>
          </div>
          <div style={S.headerRight}>
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
            <span style={S.clockDisplay}>{fmtClock(clockSeconds)}</span>
            <button onClick={toggleClock} style={S.clockBtn}>
              {clockRunning ? "⏸" : "▶"}
            </button>
          </div>
        </div>

        {/* Scoreline row */}
        <div style={S.scoreRow}>
          <span style={S.teamLabel}>FOR</span>
          <div style={S.scoreGroup}>
            <button
              style={S.scoreCell}
              onClick={() => setForScore(incGoal)}
              onContextMenu={(e) => { e.preventDefault(); setForScore(decGoal); }}
            >
              {forScore.g}
            </button>
            <span style={S.scoreSep}>-</span>
            <button
              style={S.scoreCell}
              onClick={() => setForScore(incPoint)}
              onContextMenu={(e) => { e.preventDefault(); setForScore(decPoint); }}
            >
              {forScore.p.toString().padStart(2, "0")}
            </button>
          </div>
          <span style={S.scoreDivider}>·</span>
          <div style={S.scoreGroup}>
            <button
              style={S.scoreCell}
              onClick={() => setOppScore(incGoal)}
              onContextMenu={(e) => { e.preventDefault(); setOppScore(decGoal); }}
            >
              {oppScore.g}
            </button>
            <span style={S.scoreSep}>-</span>
            <button
              style={S.scoreCell}
              onClick={() => setOppScore(incPoint)}
              onContextMenu={(e) => { e.preventDefault(); setOppScore(decPoint); }}
            >
              {oppScore.p.toString().padStart(2, "0")}
            </button>
          </div>
          <span style={S.teamLabel}>OPP</span>
          <span style={S.scoreHint}>tap ±1</span>
        </div>
      </div>

      {/* ── Pitch ──────────────────────────────────── */}
      <div ref={pitchHostRef} style={S.pitchHost} />

      {/* ── Controls row ───────────────────────────── */}
      <div style={S.controlsRow}>
        <div style={S.teamGroup}>
          {(["FOR", "OPP"] as const).map((side) => (
            <button
              key={side}
              onClick={() => handleTeamSideChange(side)}
              style={{
                ...S.teamBtn,
                ...(teamSide === side
                  ? side === "FOR" ? S.teamBtnFor : S.teamBtnOpp
                  : {}),
              }}
            >
              {side}
            </button>
          ))}
        </div>
        <button
          onClick={undo}
          disabled={loggedEvents.length === 0}
          style={S.undoBtn}
        >
          ↩ Undo
        </button>
        <span style={S.spacer} />
        <span style={S.eventCount}>{loggedEvents.length > 0 ? `${loggedEvents.length} logged` : ""}</span>
        <button
          onClick={handleExport}
          disabled={loggedEvents.length === 0}
          style={S.exportBtn}
        >
          ↓ JSON
        </button>
      </div>

      {/* ── Keyboard — Scoring row ─────────────────── */}
      <div
        style={{
          ...S.keyRow,
          gridTemplateColumns: `repeat(${visibleScoring.length}, 1fr)`,
        }}
      >
        {visibleScoring.map((item) => {
          const isArmed = armedKind === item.kind;
          return (
            <button
              key={item.kind}
              onClick={() => setArmedKind(isArmed ? null : item.kind)}
              style={{
                ...S.keyBtn,
                ...S.keyBtnScoring,
                ...(isArmed ? S.keyBtnArmed : {}),
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* ── Keyboard — Territorial row ─────────────── */}
      <div
        style={{
          ...S.keyRow,
          gridTemplateColumns: `repeat(${visibleTerritorial.length}, 1fr)`,
        }}
      >
        {visibleTerritorial.map((item) => {
          const label = item.puckoutLabel && isPuckout ? item.puckoutLabel : item.label;
          const isArmed = armedKind === item.kind;
          const groupStyle =
            item.group === "turnover" ? S.keyBtnTurnover :
            item.group === "restart"  ? S.keyBtnRestart  :
                                        S.keyBtnFree;
          return (
            <button
              key={item.kind}
              onClick={() => setArmedKind(isArmed ? null : item.kind)}
              style={{
                ...S.keyBtn,
                ...groupStyle,
                ...(isArmed ? S.keyBtnArmed : {}),
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Signal bar ─────────────────────────────── */}
      {signals.length > 0 && (
        <div style={S.signalBar}>
          {signals.map((sig) => (
            <div
              key={sig.id}
              style={{
                ...S.signalChip,
                ...(sig.level === "red" ? S.signalChipRed : S.signalChipAmber),
              }}
            >
              {sig.text}
            </div>
          ))}
        </div>
      )}

      {/* ── Status banner ──────────────────────────── */}
      <div style={S.statusBanner}>
        {armedLabel ? (
          <span>
            <span style={{ ...S.contextPip, ...(teamSide === "FOR" ? S.pipFor : S.pipOpp) }} />
            {teamSide} · Tap pitch ·{" "}
            <strong>{armedLabel}</strong>
          </span>
        ) : (
          <span style={S.hint}>
            <span style={{ ...S.contextPip, ...(teamSide === "FOR" ? S.pipFor : S.pipOpp) }} />
            {teamSide} · Select event then tap pitch
          </span>
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

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

  // ─── Match context header
  matchHeader: {
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    padding: "9px 14px 8px",
    flexShrink: 0,
  },
  headerTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
    gap: 8,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: 800,
    color: "#8b949e",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    flexShrink: 0,
  },
  headerMiddle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
  },
  sportChip: {
    fontSize: 11,
    color: "#e6edf3",
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: "2px 7px",
    cursor: "pointer",
    fontWeight: 600,
    outline: "none",
    letterSpacing: "0.2px",
  },
  attackDir: {
    fontSize: 11,
    color: "#6e7681",
    fontWeight: 500,
    letterSpacing: "0.3px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  halfGroup: { display: "flex", gap: 3 },
  halfBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 5,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 7px",
    cursor: "pointer",
    outline: "none",
  },
  halfBtnOn: {
    background: "#238636",
    borderColor: "#2ea043",
    color: "#ffffff",
  },
  clockDisplay: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 14,
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 44,
    textAlign: "center" as const,
  },
  clockBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 5,
    color: "#e6edf3",
    fontSize: 13,
    padding: "3px 7px",
    cursor: "pointer",
    outline: "none",
  },

  // ─── Score row
  scoreRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#8b949e",
    letterSpacing: "0.5px",
    minWidth: 28,
    textAlign: "center" as const,
  },
  scoreGroup: {
    display: "flex",
    alignItems: "center",
    gap: 1,
  },
  scoreCell: {
    background: "transparent",
    border: "none",
    color: "#e6edf3",
    fontSize: 16,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    padding: "2px 5px",
    cursor: "pointer",
    borderRadius: 4,
    outline: "none",
    lineHeight: 1,
  },
  scoreSep: {
    fontSize: 15,
    fontWeight: 700,
    color: "#8b949e",
    lineHeight: 1,
  },
  scoreDivider: {
    fontSize: 14,
    color: "#30363d",
    padding: "0 4px",
  },
  scoreHint: {
    fontSize: 9,
    color: "#484f58",
    marginLeft: 4,
    letterSpacing: "0.3px",
  },

  // ─── Pitch — capped height, no flex stretching
  pitchHost: {
    height: 290,
    maxHeight: 290,
    flexShrink: 0,
    position: "relative",
    background: "#0d1117",
  },

  // ─── Controls row
  controlsRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  teamGroup: { display: "flex", gap: 4 },
  teamBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 11px",
    cursor: "pointer",
    minWidth: 44,
    outline: "none",
  },
  teamBtnFor: {
    background: "#1f6feb",
    borderColor: "#388bfd",
    color: "#ffffff",
  },
  teamBtnOpp: {
    background: "#b91c1c",
    borderColor: "#f87171",
    color: "#ffffff",
  },
  undoBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    padding: "5px 9px",
    cursor: "pointer",
    outline: "none",
  },
  spacer: { flex: 1 },
  eventCount: {
    fontSize: 11,
    color: "#484f58",
    fontVariantNumeric: "tabular-nums",
  },
  exportBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    padding: "5px 9px",
    cursor: "pointer",
    outline: "none",
  },

  // ─── Keyboard rows
  keyRow: {
    display: "grid",
    gap: 4,
    padding: "5px 10px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  keyBtn: {
    border: "1.5px solid",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 4px",
    cursor: "pointer",
    textAlign: "center" as const,
    outline: "none",
    letterSpacing: "-0.2px",
    transition: "background 0.07s, border-color 0.07s, color 0.07s",
  },
  // Scoring group — green family
  keyBtnScoring: {
    background: "#0d1f14",
    borderColor: "#1a3d22",
    color: "#57a875",
  },
  // Turnover group — amber family
  keyBtnTurnover: {
    background: "#1f1800",
    borderColor: "#3d2e00",
    color: "#c99a00",
  },
  // Restart group — blue family
  keyBtnRestart: {
    background: "#0c1a2e",
    borderColor: "#1a2f4a",
    color: "#5a8fd4",
  },
  // Free group — purple family
  keyBtnFree: {
    background: "#160e2a",
    borderColor: "#2e1f50",
    color: "#9a70d4",
  },
  // Armed state — high-contrast orange, overrides group colour
  keyBtnArmed: {
    background: "#f0883e",
    borderColor: "#f0883e",
    color: "#0d1117",
  },

  // ─── Signal bar
  signalBar: {
    display: "flex",
    gap: 6,
    padding: "5px 10px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
    flexWrap: "wrap" as const,
  },
  signalChip: {
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 8px",
    borderRadius: 5,
    borderLeft: "3px solid",
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
  },
  signalChipAmber: {
    background: "#1f1800",
    borderLeftColor: "#d4a017",
    color: "#c99a00",
  },
  signalChipRed: {
    background: "#1f0a0a",
    borderLeftColor: "#f87171",
    color: "#e06060",
  },

  // ─── Status banner
  statusBanner: {
    textAlign: "center" as const,
    fontSize: 12,
    padding: "5px 14px 8px",
    background: "#0d1117",
    flexShrink: 0,
    minHeight: 28,
    color: "#e6edf3",
  },
  hint: { color: "#8b949e" },
  contextPip: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginRight: 5,
    verticalAlign: "middle",
    flexShrink: 0,
  },
  pipFor: { background: "#388bfd" },
  pipOpp: { background: "#f87171" },
};
