import { useState, useEffect, useRef, useCallback } from "react";
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
import {
  inferNextPossession,
  type PossessionSide,
} from "../tactical/possession-inference";

type Sport = "hurling" | "camogie" | "gaelic" | "soccer";

// Possession metadata stamped on every Rapid Capture event.
// Optional fields — MatchEvent schema is not changed.
type RapidEventMeta = {
  possessionBefore?: PossessionSide;
  possessionAfter?: PossessionSide;
  possessionSource?: "EVENT_RULE" | "MANUAL_OVERRIDE" | "UNCHANGED";
};

type RapidMatchEvent = MatchEvent & RapidEventMeta;

type RapidBarItem = {
  kind: MatchEventKind;
  label: string;
  puckoutLabel?: string;
  // sports for which this button is hidden; omit = visible for all
  hideFor?: readonly Sport[];
};

// TWO_POINTER is the existing enum (not TWO_POINT — confirmed absent from schema)
const RAPID_BAR: RapidBarItem[] = [
  { kind: "SHOT",          label: "Shot"                                    },
  { kind: "POINT",         label: "Point"                                   },
  { kind: "GOAL",          label: "Goal"                                    },
  { kind: "TWO_POINTER",   label: "2pt",  hideFor: ["hurling", "camogie"]   },
  { kind: "WIDE",          label: "Wide"                                    },
  { kind: "TURNOVER_WON",  label: "Turn+"                                   },
  { kind: "TURNOVER_LOST", label: "Turn−"                                   },
  { kind: "KICKOUT_WON",   label: "Restart", puckoutLabel: "Puckout"        },
  { kind: "FREE_WON",      label: "Free"                                    },
];

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function RapidCaptureLitePage() {
  const [sport, setSport] = useState<Sport>("hurling");
  const [half, setHalf] = useState<1 | 2>(1);
  // possession is inferred by the engine; FOR/OPP buttons are manual correction only
  const [possession, setPossession] = useState<PossessionSide>("FOR");
  const [armedKind, setArmedKind] = useState<MatchEventKind | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<RapidMatchEvent[]>([]);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);

  const pitchHostRef = useRef<HTMLDivElement>(null);
  const pixiHandleRef = useRef<PixiPitchSurfaceHandle | null>(null);

  // Refs provide synchronous latest values for the Pixi closure and for undo
  const armedKindRef = useRef<MatchEventKind | null>(null);
  const possessionRef = useRef<PossessionSide>("FOR");
  const halfRef = useRef<1 | 2>(1);
  const clockSecondsRef = useRef(0);
  const loggedEventsRef = useRef<RapidMatchEvent[]>([]);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockStartRef = useRef<number | null>(null);

  // Keep mutable refs in sync with state
  useEffect(() => { armedKindRef.current = armedKind; }, [armedKind]);
  useEffect(() => { possessionRef.current = possession; }, [possession]);
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

    // Reset all session state synchronously before creating new surface
    setLoggedEvents([]);
    loggedEventsRef.current = [];
    setArmedKind(null);
    armedKindRef.current = null;
    setPossession("FOR");
    possessionRef.current = "FOR";
    setClockRunning(false);
    setClockSeconds(0);
    clockSecondsRef.current = 0;
    clockStartRef.current = null;
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

        const possessionBefore = possessionRef.current;
        const ts = clockSecondsRef.current;

        // Create base event via the existing factory — no schema change
        const baseEvent = createMatchEvent({
          kind,
          nx,
          ny,
          half: halfRef.current,
          timestamp: ts,
          matchClockSeconds: ts,
          teamSide: possessionBefore,
          createdAt: Date.now(),
        });

        // Derive next possession deterministically
        const inferred = inferNextPossession(possessionBefore, kind);

        // Enrich with possession metadata (intersection type, not MatchEvent mutation)
        const event: RapidMatchEvent = {
          ...baseEvent,
          possessionBefore: inferred.possessionBefore,
          possessionAfter: inferred.possessionAfter,
          possessionSource: inferred.inferredBy,
        };

        // Update events (ref first for immediate sync, then state for re-render)
        const next = [...loggedEventsRef.current, event];
        loggedEventsRef.current = next;
        setLoggedEvents(next);

        // Advance possession to the inferred next state
        possessionRef.current = inferred.possessionAfter;
        setPossession(inferred.possessionAfter);

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

  // Manual possession override — FOR/OPP buttons call this
  const handlePossessionOverride = useCallback((side: PossessionSide) => {
    possessionRef.current = side;
    setPossession(side);
  }, []);

  const toggleClock = useCallback(() => {
    if (clockRunning) {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
      setClockRunning(false);
    } else {
      // Resume from current elapsed time
      clockStartRef.current = Date.now() - clockSecondsRef.current * 1000;
      clockIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - clockStartRef.current!) / 1000);
        clockSecondsRef.current = elapsed;
        setClockSeconds(elapsed);
      }, 500);
      setClockRunning(true);
    }
  }, [clockRunning]);

  // Undo removes the last event and restores possession to before that event
  const undo = useCallback(() => {
    const last = loggedEventsRef.current.at(-1);
    if (!last) return;
    if (last.possessionBefore) {
      possessionRef.current = last.possessionBefore;
      setPossession(last.possessionBefore);
    }
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

  const isPuckout = sport === "hurling" || sport === "camogie";
  const visibleBar = RAPID_BAR.filter((item) => !item.hideFor?.includes(sport));
  // Full RAPID_BAR lookup so armed label survives a sport toggle
  const armedItem = armedKind ? RAPID_BAR.find((b) => b.kind === armedKind) : null;

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────── */}
      <div style={S.header}>
        <span style={S.title}>Rapid Capture</span>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value as Sport)}
          style={S.sportSelect}
        >
          <option value="hurling">Hurling</option>
          <option value="camogie">Camogie</option>
          <option value="gaelic">Gaelic</option>
          <option value="soccer">Soccer</option>
        </select>
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
      </div>

      {/* ── Pitch ──────────────────────────────── */}
      <div ref={pitchHostRef} style={S.pitchHost} />

      {/* ── Controls row ───────────────────────── */}
      <div style={S.controlsRow}>
        {/* FOR / OPP: inferred possession indicator + manual override */}
        <div style={S.teamGroup}>
          {(["FOR", "OPP"] as const).map((side) => (
            <button
              key={side}
              onClick={() => handlePossessionOverride(side)}
              style={{
                ...S.teamBtn,
                ...(possession === side
                  ? side === "FOR"
                    ? S.teamBtnFor
                    : S.teamBtnOpp
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
        <span style={S.clock}>{fmtClock(clockSeconds)}</span>
        <button onClick={toggleClock} style={S.clockBtn}>
          {clockRunning ? "⏸" : "▶"}
        </button>
        <button
          onClick={handleExport}
          disabled={loggedEvents.length === 0}
          style={S.exportBtn}
        >
          ↓ JSON
        </button>
      </div>

      {/* ── Rapid event bar ────────────────────── */}
      <div style={S.rapidBar}>
        {visibleBar.map((item) => {
          const label =
            item.puckoutLabel && isPuckout ? item.puckoutLabel : item.label;
          const isArmed = armedKind === item.kind;
          return (
            <button
              key={item.kind}
              onClick={() => setArmedKind(isArmed ? null : item.kind)}
              style={{ ...S.rapidBtn, ...(isArmed ? S.rapidBtnArmed : {}) }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Status banner ──────────────────────── */}
      <div style={S.statusBanner}>
        {armedItem ? (
          <span>
            <span style={{ ...S.possessionPip, ...(possession === "FOR" ? S.pipFor : S.pipOpp) }} />
            {possession}
            {" · Tap pitch · "}
            <strong>
              {armedItem.puckoutLabel && isPuckout
                ? armedItem.puckoutLabel
                : armedItem.label}
            </strong>
            {loggedEvents.length > 0 && (
              <span style={S.eventCount}>{loggedEvents.length} logged</span>
            )}
          </span>
        ) : (
          <span style={S.hint}>
            <span style={{ ...S.possessionPip, ...(possession === "FOR" ? S.pipFor : S.pipOpp) }} />
            {possession} · Select event then tap pitch
            {loggedEvents.length > 0 && (
              <span style={S.eventCount}>{loggedEvents.length} logged</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

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

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.3px",
    flex: 1,
    whiteSpace: "nowrap",
  },
  sportSelect: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 13,
    padding: "4px 8px",
    cursor: "pointer",
    outline: "none",
  },
  halfGroup: { display: "flex", gap: 4 },
  halfBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
  },
  halfBtnOn: {
    background: "#238636",
    borderColor: "#2ea043",
    color: "#ffffff",
  },

  // Pitch — dominant visual, fills remaining height
  pitchHost: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    background: "#0d1117",
  },

  // Controls row
  controlsRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
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
    fontSize: 13,
    fontWeight: 700,
    padding: "6px 12px",
    cursor: "pointer",
    minWidth: 48,
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
    fontSize: 13,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },
  spacer: { flex: 1 },
  clock: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 15,
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 48,
    textAlign: "center",
  },
  clockBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 15,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },
  exportBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },

  // Rapid event bar
  rapidBar: {
    display: "flex",
    gap: 6,
    padding: "10px 12px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    overflowX: "auto",
    flexShrink: 0,
  },
  rapidBtn: {
    background: "#161b22",
    border: "1.5px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    padding: "11px 16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    minWidth: 64,
    textAlign: "center",
    outline: "none",
    transition: "background 0.08s, border-color 0.08s, color 0.08s",
  },
  rapidBtnArmed: {
    background: "#f0883e",
    borderColor: "#f0883e",
    color: "#0d1117",
  },

  // Status banner — shows inferred possession + action hint
  statusBanner: {
    textAlign: "center",
    fontSize: 13,
    padding: "6px 14px 10px",
    background: "#0d1117",
    flexShrink: 0,
    minHeight: 32,
    color: "#e6edf3",
  },
  hint: { color: "#8b949e" },
  possessionPip: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    marginRight: 5,
    verticalAlign: "middle",
    flexShrink: 0,
  },
  pipFor: { background: "#388bfd" },
  pipOpp: { background: "#f87171" },
  eventCount: {
    marginLeft: 10,
    color: "#8b949e",
    fontWeight: 400,
  },
};
