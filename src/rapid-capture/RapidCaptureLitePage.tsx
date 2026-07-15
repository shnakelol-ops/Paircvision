import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  createPixiPitchSurface,
  type PixiPitchSurfaceHandle,
} from "../core/pitch/create-pixi-pitch-surface";
import type { MatchEventKind } from "../core/stats/stats-event-model";
import type {
  RapidSession,
  Sport,
  MatchType,
  AttackDirection,
} from "./rapid-session";
import { RapidSignalBar } from "./RapidSignalBar";
import {
  clearActiveRapidSession,
  deleteSavedRapidMatch,
  listSavedRapidMatches,
  loadActiveRapidSession,
  newRapidMatchId,
  RAPID_CAPTURE_SCHEMA_VERSION,
  saveActiveRapidSession,
  saveCompletedRapidMatch,
  type RapidSavedMatch,
} from "./rapid-capture-storage";
import { RapidMatchHubFab, type MatchHubMenuSection } from "./RapidMatchHubFab";
import { RapidDetailBar } from "./RapidDetailBar";
import { RapidPlayerBar } from "./RapidPlayerBar";
import { RapidPausePanel } from "./RapidPausePanel";
import { RapidHalfBreakPanel } from "./RapidHalfBreakPanel";
import { RapidReviewScreen } from "./RapidReviewScreen";
import { deriveHalfAndClockFromEvents, parseImportedMatchFile } from "./rapid-match-import";
import {
  advanceEnrichment,
  applyDetailTag,
  applyPlayerNumber,
  buildCapturedEvent,
  computeRapidScoreboard,
  detailOptionsForKind,
  formatScoreLine,
  isEnrichmentTargetVisible,
  isKindAllowedForTeamSide,
  nextTeamSideAfterEvent,
  resolveTeamColour,
  startEnrichment,
  type EnrichmentState,
  type RapidMatchEvent,
  type RapidSquadPlayer,
} from "./rapid-capture-events";
import {
  halfForMatchState,
  initialMatchStateForHalf,
  isCaptureAllowed,
  isTaggingLocked,
  matchStateBadgeLabel,
  pauseActionForMatchState,
  requestEndFirstHalf,
  requestEndMatch,
  startSecondHalf,
  type RapidMatchState,
} from "./rapid-match-state";

const SPORT_LABELS: Record<Sport, string> = {
  hurling: "Hurling",
  camogie: "Camogie",
  gaelic: "Gaelic",
  soccer: "Soccer",
};

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  league: "League",
  championship: "Championship",
  friendly: "Friendly",
  training: "Training",
};

type RapidBarItem = {
  kind: MatchEventKind;
  label: string;
  puckoutLabel?: string;
  hideFor?: readonly Sport[];
};

// Poss+/Poss− were removed per the Match Stats parity audit: Match Stats has
// no capture equivalent for POSSESSION_WON/POSSESSION_LOST and no report
// consumes them. Legacy/imported events of those kinds still load and render
// correctly (rapid-capture-storage.ts and rapid-match-import.ts both still
// accept them) — this button set simply stops creating new ones.
export const RAPID_BAR: RapidBarItem[] = [
  { kind: "SHOT",              label: "Shot"                                      },
  { kind: "POINT",             label: "Point"                                     },
  { kind: "GOAL",              label: "Goal"                                      },
  { kind: "TWO_POINTER",       label: "2pt",      hideFor: ["hurling", "camogie"] },
  { kind: "WIDE",              label: "Wide"                                      },
  { kind: "TURNOVER_WON",      label: "Turn+"                                     },
  { kind: "TURNOVER_LOST",     label: "Turn−"                                     },
  { kind: "KICKOUT_WON",       label: "Kickout+", puckoutLabel: "Puckout+"        },
  { kind: "KICKOUT_CONCEDED",  label: "Kickout−", puckoutLabel: "Puckout−"        },
  { kind: "FREE_WON",          label: "Free+"                                     },
  { kind: "FREE_CONCEDED",     label: "Free−"                                     },
];

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Setup Screen ─────────────────────────────────────────────────────────────

function RapidSetupScreen({
  onStart,
  resumeCandidate,
  onResume,
  onOpenSavedMatches,
  onImportJsonFile,
  importError,
  onDismissImportError,
}: {
  onStart: (s: RapidSession) => void;
  resumeCandidate: RapidSavedMatch | null;
  onResume: () => void;
  onOpenSavedMatches: () => void;
  onImportJsonFile: (file: File) => void;
  importError: string | null;
  onDismissImportError: () => void;
}) {
  const [sport, setSport] = useState<Sport>("hurling");
  const [forTeamName, setForTeamName] = useState("");
  const [oppTeamName, setOppTeamName] = useState("");
  const [venue, setVenue] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("league");
  const [forColour, setForColour] = useState("#1f6feb");
  const [oppColour, setOppColour] = useState("#b91c1c");
  const [attackDir, setAttackDir] = useState<AttackDirection>("right");
  const [halfDuration, setHalfDuration] = useState(35);

  function handleStart() {
    onStart({
      sport,
      forTeamName: forTeamName.trim(),
      oppTeamName: oppTeamName.trim(),
      venue: venue.trim(),
      matchType,
      forTeamColour: forColour,
      oppTeamColour: oppColour,
      attackDirection: attackDir,
      halfDurationMinutes: halfDuration,
    });
  }

  const sections: MatchHubMenuSection[] = [
    {
      id: "match",
      label: "Match",
      items: [
        ...(resumeCandidate
          ? [{ id: "resume", label: "Resume Match", onSelect: onResume }]
          : []),
        { id: "saved-matches", label: "Saved Matches", onSelect: onOpenSavedMatches },
      ],
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "export-json", label: "Export JSON", disabled: true },
        {
          id: "import-json",
          label: "Import JSON",
          onFileSelect: onImportJsonFile,
          accept: "application/json,.json",
        },
      ],
    },
  ];

  return (
    <div style={S.shell}>
      <div style={S.header}>
        <span style={S.title}>⚡ Rapid Capture</span>
        <span style={S.setupBadge}>Setup</span>
      </div>

      <div style={S.setupBody}>
        {importError && (
          <div style={S.importErrorBanner}>
            <span style={S.importErrorText}>{importError}</span>
            <button onClick={onDismissImportError} style={S.importErrorDismissBtn}>
              ✕
            </button>
          </div>
        )}

        {/* Sport */}
        <span style={S.sectionLabel}>Sport</span>
        <div style={S.chipGroup}>
          {(["hurling", "camogie", "gaelic", "soccer"] as Sport[]).map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              style={{ ...S.chip, ...(sport === s ? S.chipActive : {}) }}
            >
              {SPORT_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Teams */}
        <span style={S.sectionLabel}>Teams</span>
        <div style={S.teamInputRow}>
          <span style={{ ...S.teamSwatch, background: forColour }} />
          <span style={S.teamSideLabel}>FOR</span>
          <input
            type="text"
            placeholder="Team name"
            value={forTeamName}
            onChange={(e) => setForTeamName(e.target.value)}
            style={S.textInput}
          />
        </div>
        <div style={S.teamInputRow}>
          <span style={{ ...S.teamSwatch, background: oppColour }} />
          <span style={S.teamSideLabel}>OPP</span>
          <input
            type="text"
            placeholder="Team name"
            value={oppTeamName}
            onChange={(e) => setOppTeamName(e.target.value)}
            style={S.textInput}
          />
        </div>

        {/* Venue */}
        <span style={S.sectionLabel}>
          Venue <span style={S.optionalTag}>(optional)</span>
        </span>
        <input
          type="text"
          placeholder="e.g. Croke Park"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          style={{ ...S.textInput, width: "100%", boxSizing: "border-box" } as CSSProperties}
        />

        {/* Match type */}
        <span style={S.sectionLabel}>Match Type</span>
        <div style={S.chipGroup}>
          {(["league", "championship", "friendly", "training"] as MatchType[]).map((mt) => (
            <button
              key={mt}
              onClick={() => setMatchType(mt)}
              style={{ ...S.chip, ...(matchType === mt ? S.chipActive : {}) }}
            >
              {MATCH_TYPE_LABELS[mt]}
            </button>
          ))}
        </div>

        {/* Team colours */}
        <span style={S.sectionLabel}>Team Colours</span>
        <div style={S.colourRow}>
          <div style={S.colourItem}>
            <span style={{ ...S.colourSwatch, background: forColour }} />
            <span style={S.colourName}>FOR</span>
            <input
              type="color"
              value={forColour}
              onChange={(e) => setForColour(e.target.value)}
              style={S.colourPicker}
            />
          </div>
          <div style={S.colourItem}>
            <span style={{ ...S.colourSwatch, background: oppColour }} />
            <span style={S.colourName}>OPP</span>
            <input
              type="color"
              value={oppColour}
              onChange={(e) => setOppColour(e.target.value)}
              style={S.colourPicker}
            />
          </div>
        </div>

        {/* Attack direction */}
        <span style={S.sectionLabel}>1H Attacking Direction</span>
        <div style={S.chipGroup}>
          <button
            onClick={() => setAttackDir("left")}
            style={{ ...S.chip, ...(attackDir === "left" ? S.chipActive : {}) }}
          >
            ← Left
          </button>
          <button
            onClick={() => setAttackDir("right")}
            style={{ ...S.chip, ...(attackDir === "right" ? S.chipActive : {}) }}
          >
            Right →
          </button>
        </div>

        {/* Half duration */}
        <span style={S.sectionLabel}>Half Duration</span>
        <div style={S.chipGroup}>
          {[25, 30, 35, 40].map((d) => (
            <button
              key={d}
              onClick={() => setHalfDuration(d)}
              style={{ ...S.chip, ...(halfDuration === d ? S.chipActive : {}) }}
            >
              {d} min
            </button>
          ))}
        </div>

        <button onClick={handleStart} style={S.startBtn}>
          Start Match
        </button>
      </div>

      <RapidMatchHubFab sections={sections} />
    </div>
  );
}

// ── Saved Matches Screen ───────────────────────────────────────────────────────

function fmtSavedMatchDate(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function RapidSavedMatchesScreen({
  onBack,
  onReopen,
  onReview,
}: {
  onBack: () => void;
  onReopen: (match: RapidSavedMatch) => void;
  onReview: (match: RapidSavedMatch) => void;
}) {
  const [matches, setMatches] = useState<RapidSavedMatch[]>(() => listSavedRapidMatches());

  function handleDelete(id: string) {
    deleteSavedRapidMatch(id);
    setMatches(listSavedRapidMatches());
  }

  return (
    <div style={S.shell}>
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>
          ← Back
        </button>
        <span style={S.title}>Saved Matches</span>
      </div>
      <div style={S.setupBody}>
        {matches.length === 0 ? (
          <span style={S.hint}>No saved matches yet.</span>
        ) : (
          matches.map((match) => (
            <div key={match.id} style={S.savedMatchRow}>
              <div style={S.savedMatchInfo}>
                <span style={S.savedMatchTeams}>
                  {match.session.forTeamName || "FOR"} v {match.session.oppTeamName || "OPP"}
                </span>
                <span style={S.savedMatchMeta}>
                  {fmtSavedMatchDate(match.createdAt)} · {match.events.length} events · {match.status === "COMPLETED" ? "Completed" : "In progress"}
                </span>
              </div>
              <div style={S.savedMatchActions}>
                <button onClick={() => handleDelete(match.id)} style={S.savedMatchDeleteBtn}>
                  Delete
                </button>
                <button onClick={() => onReview(match)} style={S.savedMatchReviewBtn}>
                  Review
                </button>
                <button onClick={() => onReopen(match)} style={S.savedMatchReopenBtn}>
                  Reopen
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Live Screen ───────────────────────────────────────────────────────────────

type RapidLiveScreenProps = {
  matchId: string;
  session: RapidSession;
  createdAt: number;
  initialEvents: RapidMatchEvent[];
  initialMatchState: RapidMatchState;
  initialClockSeconds: number;
  onFinish: () => void;
  onOpenSavedMatches: () => void;
  onImportJsonFile: (file: File) => void;
  importError: string | null;
  onDismissImportError: () => void;
};

// Active-session autosave cadence while the clock is running — frequent enough
// that a refresh loses at most a few seconds of clock progress, not the match.
const AUTOSAVE_INTERVAL_MS = 5000;

function RapidLiveScreen({
  matchId,
  session,
  createdAt,
  initialEvents,
  initialMatchState,
  initialClockSeconds,
  onFinish,
  onOpenSavedMatches,
  onImportJsonFile,
  importError,
  onDismissImportError,
}: RapidLiveScreenProps) {
  const { sport } = session;

  const [matchState, setMatchState] = useState<RapidMatchState>(initialMatchState);
  // teamSide = annotation perspective (whose story is this event).
  // Manual context — only ever auto-changes for the Match Stats-mirrored
  // active-team reset after a conceded/lost restart (KICKOUT_CONCEDED).
  const [teamSide, setTeamSide] = useState<"FOR" | "OPP">("FOR");
  const [armedKind, setArmedKind] = useState<MatchEventKind | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<RapidMatchEvent[]>(initialEvents);
  const [clockSeconds, setClockSeconds] = useState(initialClockSeconds);
  const [clockRunning, setClockRunning] = useState(false);
  // True once the coach has explicitly tapped pause mid-half — distinct from
  // "clock simply hasn't been started yet," which shows a plain ▶ instead.
  const [showPausedActions, setShowPausedActions] = useState(false);
  // Lets the halftime/full-time panel's "Actions" button open the same FAB
  // used everywhere else, instead of duplicating its menu.
  const [fabOpen, setFabOpen] = useState(false);
  // Full takeover by the shared Review screen — Event Map, filters, marker
  // inspect/edit/delete, and report exports, reachable from the Match Hub or
  // the Half Time / Full Time panel. Edits write straight back into
  // loggedEvents (the same session), never a second store.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Detail bar, then optional Player Recognition bar, for the most recently
  // logged event — never blocks capture. Starting another capture (a new
  // tap, or arming a different kind) always replaces this outright.
  const [enrichment, setEnrichment] = useState<EnrichmentState>(null);

  const pitchHostRef = useRef<HTMLDivElement>(null);
  const pixiHandleRef = useRef<PixiPitchSurfaceHandle | null>(null);

  // Refs provide synchronous latest values for the Pixi tap closure and for undo
  const armedKindRef = useRef<MatchEventKind | null>(null);
  const teamSideRef = useRef<"FOR" | "OPP">("FOR");
  const matchStateRef = useRef<RapidMatchState>(initialMatchState);
  const clockRunningRef = useRef(false);
  const clockSecondsRef = useRef(initialClockSeconds);
  const loggedEventsRef = useRef<RapidMatchEvent[]>(initialEvents);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockStartRef = useRef<number | null>(null);
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { armedKindRef.current = armedKind; }, [armedKind]);
  useEffect(() => { teamSideRef.current = teamSide; }, [teamSide]);
  useEffect(() => { matchStateRef.current = matchState; }, [matchState]);
  useEffect(() => { clockRunningRef.current = clockRunning; }, [clockRunning]);
  useEffect(() => { loggedEventsRef.current = loggedEvents; }, [loggedEvents]);

  useEffect(() => {
    pixiHandleRef.current?.setEvents(loggedEvents);
  }, [loggedEvents]);

  const persistActiveSession = useCallback(() => {
    saveActiveRapidSession({
      schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
      id: matchId,
      createdAt,
      updatedAt: Date.now(),
      status: "IN_PROGRESS",
      session,
      events: loggedEventsRef.current,
      half: halfForMatchState(matchStateRef.current),
      clockSeconds: clockSecondsRef.current,
      matchState: matchStateRef.current,
    });
  }, [matchId, createdAt, session]);

  // Autosave after every event or match-state change — the state that
  // matters most for a faithful resume (including mid-halftime/full-time).
  useEffect(() => {
    persistActiveSession();
  }, [loggedEvents, matchState, persistActiveSession]);

  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current);
    };
  }, []);

  // Each enrichment stage (detail, then optional player) gets its own ~4s
  // window. Changing `enrichment` (new capture, tap-driven advance, or this
  // timeout firing) always clears the previous timer and arms a fresh one —
  // only one bar, and one timer, exists at a time.
  useEffect(() => {
    if (!enrichment) return;
    const timeoutId = setTimeout(() => {
      setEnrichment((current) => advanceEnrichment(current));
    }, 4000);
    return () => clearTimeout(timeoutId);
  }, [enrichment]);

  const applyDetailChoice = useCallback((eventId: string, tag: string) => {
    const next = applyDetailTag(loggedEventsRef.current, eventId, tag);
    loggedEventsRef.current = next;
    setLoggedEvents(next);
    setEnrichment((current) => advanceEnrichment(current));
  }, []);

  const applyPlayerChoice = useCallback((eventId: string, player: RapidSquadPlayer) => {
    const next = applyPlayerNumber(loggedEventsRef.current, eventId, player);
    loggedEventsRef.current = next;
    setLoggedEvents(next);
    setEnrichment((current) => advanceEnrichment(current));
  }, []);

  // Sport is fixed for the lifetime of this screen — initialises Pixi once on
  // mount. Also depends on reviewOpen: opening Review early-returns a
  // completely different tree (RapidReviewScreen instead of this pitch host),
  // so without reviewOpen as a dependency this effect would never re-run and
  // its cleanup would never fire — leaving the live-capture Pixi instance
  // orphaned (detached from the DOM, but still alive and erroring on redraw).
  useEffect(() => {
    const host = pitchHostRef.current;
    if (!host) return;

    let handle: PixiPitchSurfaceHandle | null = null;
    let destroyed = false;

    createPixiPitchSurface(host, {
      sport,
      canLogEvents: true,
      onPitchTap: (nx, ny) => {
        const kind = armedKindRef.current;
        if (!kind) return;
        // Authoritative capture gate: tagging must be unlocked (FIRST_HALF/
        // SECOND_HALF, never HALF_TIME/FULL_TIME) AND the clock must
        // actually be running (not merely paused mid-half). The UI already
        // hides the tagging grid in every other case; this guard doesn't
        // depend on that UI state having rendered correctly.
        if (!isCaptureAllowed(matchStateRef.current, clockRunningRef.current)) return;
        // One incident, one event: turnovers/frees are only ever logged from
        // FOR's perspective — downstream intelligence derives the OPP-benefit
        // side by inversion. The UI already prevents arming these under OPP;
        // this is the authoritative guard regardless of UI state timing.
        if (!isKindAllowedForTeamSide(kind, teamSideRef.current)) return;

        const ts = clockSecondsRef.current;

        // teamSide = annotation perspective at log time — no inference, no auto-advance
        const event = buildCapturedEvent({
          kind,
          nx,
          ny,
          half: halfForMatchState(matchStateRef.current),
          timestamp: ts,
          teamSide: teamSideRef.current,
          createdAt: Date.now(),
        });

        // Update ref first for immediate sync, then state for re-render
        const next = [...loggedEventsRef.current, event];
        loggedEventsRef.current = next;
        setLoggedEvents(next);

        // Starting another capture always replaces whatever enrichment was
        // pending for the previous event — it keeps whatever it already has
        // (SOURCE_PLAY by default), nothing is lost or blocked.
        setEnrichment(startEnrichment(event.id, kind));

        // Match Stats resets its active-team toggle back to "own" immediately
        // after logging a conceded/lost restart — mirrored here exactly.
        const nextSide = nextTeamSideAfterEvent(kind, teamSideRef.current);
        if (nextSide !== teamSideRef.current) {
          teamSideRef.current = nextSide;
          setTeamSide(nextSide);
        }
      },
    }).then((h) => {
      if (destroyed) { h.destroy(); return; }
      handle = h;
      pixiHandleRef.current = h;
      // The [loggedEvents] effect may have already fired (and no-opped) before
      // this promise resolved — e.g. on resume, where events are pre-populated
      // at mount. Push whatever is logged right now so restored markers render.
      h.setEvents(loggedEventsRef.current);
    });

    return () => {
      destroyed = true;
      handle?.destroy();
      pixiHandleRef.current = null;
    };
  }, [sport, reviewOpen]);

  const handleTeamSideChange = useCallback((side: "FOR" | "OPP") => {
    teamSideRef.current = side;
    setTeamSide(side);
    // Switching to OPP can make the currently-armed kind unavailable
    // (Turn+/Turn−/Free+/Free−) — disarm rather than leave a stale armed
    // state the coach can no longer see feedback for.
    if (armedKindRef.current && !isKindAllowedForTeamSide(armedKindRef.current, side)) {
      armedKindRef.current = null;
      setArmedKind(null);
    }
  }, []);

  const toggleClock = useCallback(() => {
    if (clockRunning) {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }
      setClockRunning(false);
      // Pausing mid-half surfaces the Resume/End decision panel — see
      // RapidPausePanel. Only meaningful while a half is actually live.
      if (!isTaggingLocked(matchStateRef.current)) setShowPausedActions(true);
      persistActiveSession();
    } else {
      clockStartRef.current = Date.now() - clockSecondsRef.current * 1000;
      clockIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - clockStartRef.current!) / 1000);
        clockSecondsRef.current = elapsed;
        setClockSeconds(elapsed);
      }, 500);
      autosaveIntervalRef.current = setInterval(persistActiveSession, AUTOSAVE_INTERVAL_MS);
      setClockRunning(true);
      setShowPausedActions(false);
      persistActiveSession();
    }
  }, [clockRunning, persistActiveSession]);

  const handleStartSecondHalf = useCallback(() => {
    const next = startSecondHalf(matchStateRef.current);
    if (next === matchStateRef.current) return;
    matchStateRef.current = next;
    setMatchState(next);
    setShowPausedActions(false);
  }, []);

  const handleEndFirstHalf = useCallback(() => {
    const next = requestEndFirstHalf(matchStateRef.current, () =>
      window.confirm("End the first half now? The clock will pause and tagging will lock until the second half starts."),
    );
    if (next === matchStateRef.current) return;
    matchStateRef.current = next;
    setMatchState(next);
    setShowPausedActions(false);
  }, []);

  const completeMatch = useCallback(() => {
    matchStateRef.current = "FULL_TIME";
    setMatchState("FULL_TIME");
    setShowPausedActions(false);
    const record = {
      schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
      id: matchId,
      createdAt,
      updatedAt: Date.now(),
      status: "COMPLETED" as const,
      session,
      events: loggedEventsRef.current,
      half: halfForMatchState("FULL_TIME"),
      clockSeconds: clockSecondsRef.current,
      matchState: "FULL_TIME" as const,
    };
    saveCompletedRapidMatch(record);
    // Keep the active-session slot alive (now COMPLETED/FULL_TIME) so a
    // refresh while still viewing the Full Time summary restores it —
    // clearing only happens once the coach explicitly taps Done.
    saveActiveRapidSession(record);
  }, [matchId, createdAt, session]);

  const handleEndMatch = useCallback(() => {
    const next = requestEndMatch(matchStateRef.current, () =>
      window.confirm("End the match now? This will mark it completed and save it."),
    );
    if (next !== "FULL_TIME") return;
    completeMatch();
  }, [completeMatch]);

  const handleDoneAfterFullTime = useCallback(() => {
    clearActiveRapidSession();
    onFinish();
  }, [onFinish]);

  // Manual "abandon and save" escape hatch (Match Hub FAB), available at any
  // match state — always exits immediately, unlike the guided End Match flow.
  const finishAndSaveMatch = useCallback(() => {
    saveCompletedRapidMatch({
      schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
      id: matchId,
      createdAt,
      updatedAt: Date.now(),
      status: "COMPLETED",
      session,
      events: loggedEventsRef.current,
      half: halfForMatchState("FULL_TIME"),
      clockSeconds: clockSecondsRef.current,
      matchState: "FULL_TIME",
    });
    clearActiveRapidSession();
    onFinish();
  }, [matchId, createdAt, session, onFinish]);

  // Undo removes the last logged event — teamSide context is not affected
  const undo = useCallback(() => {
    if (loggedEventsRef.current.length === 0) return;
    const next = loggedEventsRef.current.slice(0, -1);
    loggedEventsRef.current = next;
    setLoggedEvents(next);
  }, []);

  const handleExport = useCallback(() => {
    if (loggedEvents.length === 0) return;
    const payload = JSON.stringify(
      {
        version: 2,
        session: {
          sport: session.sport,
          forTeamName: session.forTeamName,
          oppTeamName: session.oppTeamName,
          venue: session.venue,
          matchType: session.matchType,
          forTeamColour: session.forTeamColour,
          oppTeamColour: session.oppTeamColour,
          attackDirection: session.attackDirection,
          halfDurationMinutes: session.halfDurationMinutes,
        },
        events: loggedEvents,
        exportedAt: new Date().toISOString(),
      },
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
  }, [session, sport, loggedEvents]);

  const isPuckout = sport === "hurling" || sport === "camogie";
  const visibleBar = RAPID_BAR.filter((item) => !item.hideFor?.includes(sport));
  const armedItem = armedKind ? RAPID_BAR.find((b) => b.kind === armedKind) : null;

  const forLabel = session.forTeamName || "FOR";
  const oppLabel = session.oppTeamName || "OPP";

  const scoreboard = computeRapidScoreboard(loggedEvents);

  // Detail/player bar target — resolved from the live event list so a stage
  // that outlives an Undo (target removed) hides itself automatically.
  const showEnrichmentBar = enrichment != null && isEnrichmentTargetVisible(enrichment.eventId, loggedEvents);
  const enrichmentEvent = showEnrichmentBar ? loggedEvents.find((e) => e.id === enrichment!.eventId) : undefined;
  // Same canonical source tags Match Stats writes — label only, never the
  // stored tag, is sport-aware (45 for Gaelic games, 65 for hurling/camogie).
  const detailOptions =
    showEnrichmentBar && enrichment!.stage === "detail"
      ? (detailOptionsForKind(enrichment!.kind) ?? []).map((opt) =>
          opt.tag === "SOURCE_45" ? { ...opt, label: isPuckout ? "65" : "45" } : opt,
        )
      : [];
  const enrichmentSquad = enrichmentEvent?.teamSide === "OPP" ? session.oppSquad : session.forSquad;
  // Colour follows the event's actual teamSide, not the live toggle — the
  // toggle may have already moved on (e.g. the KICKOUT_CONCEDED auto-reset)
  // by the time the player bar renders.
  const enrichmentTeamColour = resolveTeamColour(enrichmentEvent?.teamSide as "FOR" | "OPP" | undefined, session);

  // Canonical match-state gates: tagging is only ever possible during a live,
  // running half — everything else (HALF_TIME, FULL_TIME, or simply paused
  // mid-half) replaces the tagging grid with a decision panel instead.
  const taggingLocked = isTaggingLocked(matchState);
  const pauseAction = pauseActionForMatchState(matchState);
  const showPauseMenu = !taggingLocked && !clockRunning && showPausedActions && pauseAction != null;
  const scoreLineText = `${formatScoreLine(scoreboard.for)} – ${formatScoreLine(scoreboard.opp)}`;

  const sections: MatchHubMenuSection[] = [
    {
      id: "match",
      label: "Match",
      items: [
        { id: "review", label: "Review", onSelect: () => setReviewOpen(true) },
        { id: "finish-save", label: "Finish & Save", onSelect: finishAndSaveMatch },
        { id: "saved-matches", label: "Saved Matches", onSelect: onOpenSavedMatches },
      ],
    },
    {
      id: "data",
      label: "Data",
      items: [
        { id: "export-json", label: "Export JSON", onSelect: handleExport, disabled: loggedEvents.length === 0 },
        {
          id: "import-json",
          label: "Import JSON",
          onFileSelect: onImportJsonFile,
          accept: "application/json,.json",
        },
      ],
    },
  ];

  if (reviewOpen) {
    // TEMP DIAGNOSTIC — see Review event-count investigation.
    // eslint-disable-next-line no-console
    console.log(
      "[REVIEW-PIPELINE-DEBUG] stage=loggedEvents (live session)",
      "count=", loggedEvents.length,
    );
    return (
      <RapidReviewScreen
        match={{
          schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
          id: matchId,
          createdAt,
          updatedAt: Date.now(),
          status: matchState === "FULL_TIME" ? "COMPLETED" : "IN_PROGRESS",
          session,
          events: loggedEvents,
          half: halfForMatchState(matchState),
          clockSeconds,
          matchState,
        }}
        backLabel="Rapid Capture"
        onBack={() => setReviewOpen(false)}
        onEventsChange={(next) => {
          loggedEventsRef.current = next;
          setLoggedEvents(next);
        }}
      />
    );
  }

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────── */}
      <div style={S.header}>
        <span style={S.title}>Rapid Capture</span>
        <span style={S.sportBadge}>{SPORT_LABELS[sport]}</span>
        {/* Read-only — half is derived from matchState, never picked manually. */}
        <span style={{ ...S.matchStateBadge, ...(taggingLocked ? S.matchStateBadgeLocked : {}) }}>
          {matchStateBadgeLabel(matchState)}
        </span>
      </div>

      {importError && (
        <div style={S.importErrorBanner}>
          <span style={S.importErrorText}>{importError}</span>
          <button onClick={onDismissImportError} style={S.importErrorDismissBtn}>
            ✕
          </button>
        </div>
      )}

      {/* ── Pitch ──────────────────────────────── */}
      <div style={S.pitchWrap}>
        <div ref={pitchHostRef} style={S.pitchHost} />
      </div>

      {/* ── Live scoreboard (above the timer) ───── */}
      <div style={S.scoreboardRow}>
        <span style={{ ...S.scoreboardTeam, color: session.forTeamColour }}>{forLabel}</span>
        <span style={S.scoreboardScore}>{formatScoreLine(scoreboard.for)}</span>
        <span style={S.scoreboardDivider}>–</span>
        <span style={S.scoreboardScore}>{formatScoreLine(scoreboard.opp)}</span>
        <span style={{ ...S.scoreboardTeam, color: session.oppTeamColour }}>{oppLabel}</span>
      </div>

      {/* ── Controls row ───────────────────────── */}
      <div style={S.controlsRow}>
        {/* FOR / OPP: annotation context toggle — whose story is this event? */}
        <div style={S.teamGroup}>
          {(["FOR", "OPP"] as const).map((side) => (
            <button
              key={side}
              onClick={() => handleTeamSideChange(side)}
              style={{
                ...S.teamBtn,
                ...(teamSide === side
                  ? side === "FOR"
                    ? S.teamBtnFor
                    : S.teamBtnOpp
                  : {}),
              }}
            >
              {side === "FOR" ? forLabel : oppLabel}
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
        <button
          onClick={toggleClock}
          disabled={taggingLocked}
          style={{ ...S.clockBtn, ...(taggingLocked ? S.clockBtnDisabled : {}) }}
        >
          {clockRunning ? "⏸" : "▶"}
        </button>
      </div>

      {/* ── Signal bar ─────────────────────────── */}
      <RapidSignalBar events={loggedEvents} clockSeconds={clockSeconds} />

      {/* ── Tagging surface, replaced by a decision panel whenever tagging
          is locked (HALF_TIME/FULL_TIME) or the clock is explicitly paused
          mid-half. The pitch and scoreboard above stay visible throughout. ── */}
      {taggingLocked ? (
        <RapidHalfBreakPanel
          matchState={matchState as "HALF_TIME" | "FULL_TIME"}
          forLabel={forLabel}
          oppLabel={oppLabel}
          scoreLine={scoreLineText}
          onStartSecondHalf={matchState === "HALF_TIME" ? handleStartSecondHalf : undefined}
          onDone={matchState === "FULL_TIME" ? handleDoneAfterFullTime : undefined}
          onOpenReview={() => setReviewOpen(true)}
          onOpenActions={() => setFabOpen(true)}
        />
      ) : showPauseMenu && pauseAction ? (
        <RapidPausePanel
          action={pauseAction}
          forLabel={forLabel}
          oppLabel={oppLabel}
          scoreLine={scoreLineText}
          onResume={toggleClock}
          onEndFirstHalf={handleEndFirstHalf}
          onEndMatch={handleEndMatch}
        />
      ) : (
        <>
          {/* ── Detail bar, then optional Player Recognition bar (~4s each, non-blocking) ── */}
          {showEnrichmentBar && enrichment!.stage === "detail" && (
            <RapidDetailBar
              options={detailOptions}
              onSelect={(tag) => applyDetailChoice(enrichment!.eventId, tag)}
            />
          )}
          {showEnrichmentBar && enrichment!.stage === "player" && (
            <RapidPlayerBar
              squad={enrichmentSquad}
              teamColour={enrichmentTeamColour}
              onSelect={(player) => applyPlayerChoice(enrichment!.eventId, player)}
            />
          )}

          {/* ── Rapid event bar ────────────────────── */}
          <div style={S.rapidBar}>
            {visibleBar.map((item) => {
              const label =
                item.puckoutLabel && isPuckout ? item.puckoutLabel : item.label;
              const isArmed = armedKind === item.kind;
              // Turn+/Turn−/Free+/Free− are one-sided by design — see
              // isKindAllowedForTeamSide. Kept in place (not removed) so the
              // grid layout stays spatially consistent between FOR and OPP.
              const isDisabledForTeamSide = !isKindAllowedForTeamSide(item.kind, teamSide);
              return (
                <button
                  key={item.kind}
                  disabled={isDisabledForTeamSide}
                  onClick={() => {
                    setEnrichment(null);
                    setArmedKind(isArmed ? null : item.kind);
                  }}
                  style={{
                    ...S.rapidBtn,
                    ...(isArmed ? S.rapidBtnArmed : {}),
                    ...(isDisabledForTeamSide ? S.rapidBtnDisabled : {}),
                  }}
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
                <span style={{ ...S.contextPip, ...(teamSide === "FOR" ? S.pipFor : S.pipOpp) }} />
                {teamSide === "FOR" ? forLabel : oppLabel}
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
                <span style={{ ...S.contextPip, ...(teamSide === "FOR" ? S.pipFor : S.pipOpp) }} />
                {teamSide === "FOR" ? forLabel : oppLabel} · Select event then tap pitch
                {loggedEvents.length > 0 && (
                  <span style={S.eventCount}>{loggedEvents.length} logged</span>
                )}
              </span>
            )}
          </div>
        </>
      )}

      {/* Fixed to the viewport, not the pitch — never covers pitch markers,
          the scoreboard, detail/player bars, or the tagging grid. */}
      <RapidMatchHubFab sections={sections} open={fabOpen} onOpenChange={setFabOpen} />
    </div>
  );
}

// ── Page Phase Controller ─────────────────────────────────────────────────────

type LiveSlot = {
  matchId: string;
  session: RapidSession;
  createdAt: number;
  events: RapidMatchEvent[];
  matchState: RapidMatchState;
  clockSeconds: number;
};

function liveSlotFromSavedMatch(match: RapidSavedMatch): LiveSlot {
  return {
    matchId: match.id,
    session: match.session,
    createdAt: match.createdAt,
    events: match.events,
    matchState: match.matchState,
    clockSeconds: match.clockSeconds,
  };
}

export default function RapidCaptureLitePage() {
  const [view, setView] = useState<"setup" | "live" | "matches" | "review">("setup");
  const [live, setLive] = useState<LiveSlot | null>(null);
  const [reviewMatch, setReviewMatch] = useState<RapidSavedMatch | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<RapidSavedMatch | null>(() =>
    loadActiveRapidSession(),
  );
  const [importError, setImportError] = useState<string | null>(null);

  function handleStart(session: RapidSession) {
    setLive({
      matchId: newRapidMatchId(),
      session,
      createdAt: Date.now(),
      events: [],
      matchState: "FIRST_HALF",
      clockSeconds: 0,
    });
    setView("live");
  }

  function handleResume() {
    if (!resumeCandidate) return;
    setLive(liveSlotFromSavedMatch(resumeCandidate));
    setView("live");
  }

  function handleReopenSavedMatch(match: RapidSavedMatch) {
    setLive(liveSlotFromSavedMatch(match));
    setView("live");
  }

  function handleReviewSavedMatch(match: RapidSavedMatch) {
    setReviewMatch(match);
    setView("review");
  }

  function handleFinish() {
    setResumeCandidate(null);
    setLive(null);
    setView("setup");
  }

  function handleImportJsonFile(file: File) {
    if (view === "live" && !window.confirm("Importing will replace the match you're currently capturing. Continue?")) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const result = parseImportedMatchFile(text);
      if (result.status === "error") {
        setImportError(result.reason);
        return;
      }
      setImportError(null);
      const { half, clockSeconds } = deriveHalfAndClockFromEvents(result.match.events);
      setLive({
        matchId: newRapidMatchId(),
        session: result.match.session,
        createdAt: Date.now(),
        events: result.match.events,
        matchState: initialMatchStateForHalf(half),
        clockSeconds,
      });
      setView("live");
    };
    reader.onerror = () => setImportError("Could not read the selected file.");
    reader.readAsText(file);
  }

  if (view === "matches") {
    return (
      <RapidSavedMatchesScreen
        onBack={() => setView("setup")}
        onReopen={handleReopenSavedMatch}
        onReview={handleReviewSavedMatch}
      />
    );
  }

  if (view === "review" && reviewMatch) {
    // TEMP DIAGNOSTIC — see Review event-count investigation.
    // eslint-disable-next-line no-console
    console.log(
      "[REVIEW-PIPELINE-DEBUG] stage=reviewMatch.events (from Saved Matches / storage)",
      "count=", reviewMatch.events.length,
    );
    return (
      <RapidReviewScreen
        match={reviewMatch}
        backLabel="Saved Matches"
        onBack={() => {
          setReviewMatch(null);
          setView("matches");
        }}
        onEventsChange={(next) => {
          // Every entry in the completed-matches store is already FULL_TIME —
          // saveCompletedRapidMatch upserts by id, updating the same session
          // in place rather than copying it into a second store.
          const updated: RapidSavedMatch = { ...reviewMatch, events: next };
          saveCompletedRapidMatch(updated);
          setReviewMatch(updated);
        }}
      />
    );
  }

  if (view === "live" && live) {
    return (
      <RapidLiveScreen
        key={live.matchId}
        matchId={live.matchId}
        session={live.session}
        createdAt={live.createdAt}
        initialEvents={live.events}
        initialMatchState={live.matchState}
        initialClockSeconds={live.clockSeconds}
        onFinish={handleFinish}
        onOpenSavedMatches={() => setView("matches")}
        onImportJsonFile={handleImportJsonFile}
        importError={importError}
        onDismissImportError={() => setImportError(null)}
      />
    );
  }

  return (
    <RapidSetupScreen
      onStart={handleStart}
      resumeCandidate={resumeCandidate}
      onResume={handleResume}
      onOpenSavedMatches={() => setView("matches")}
      onImportJsonFile={handleImportJsonFile}
      importError={importError}
      onDismissImportError={() => setImportError(null)}
    />
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
    position: "relative",
  },

  // ── Shared: Header ───────────────────────────────────────────────────────
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

  // ── Setup: Header badges ─────────────────────────────────────────────────
  setupBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  },

  // ── Setup: Scrollable body ───────────────────────────────────────────────
  setupBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "16px 16px 48px",
  },

  // ── Setup: Section labels ────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8b949e",
    marginTop: 4,
  },
  optionalTag: {
    fontWeight: 400,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 11,
    color: "#6e7681",
  },

  // ── Setup: Chip selector ─────────────────────────────────────────────────
  chipGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  // Split border (not shorthand) — chipActive overrides borderColor per-render
  // as the coach picks sport/match-type/etc; mixing shorthand/non-shorthand
  // for the same property trips a React styling warning across rerenders.
  chip: {
    background: "#21262d",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 14,
    fontWeight: 600,
    padding: "8px 14px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap",
  },
  chipActive: {
    background: "#238636",
    borderColor: "#2ea043",
    color: "#ffffff",
  },

  // ── Setup: Team input row ────────────────────────────────────────────────
  teamInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  teamSwatch: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1.5px solid rgba(255,255,255,0.15)",
  },
  teamSideLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#8b949e",
    minWidth: 28,
  },
  textInput: {
    flex: 1,
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    padding: "10px 12px",
    outline: "none",
    fontFamily: "inherit",
  },

  // ── Setup: Colour pickers ────────────────────────────────────────────────
  colourRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
  },
  colourItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  colourSwatch: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.15)",
    flexShrink: 0,
  },
  colourName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#8b949e",
    minWidth: 28,
  },
  colourPicker: {
    width: 36,
    height: 36,
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "none",
    cursor: "pointer",
    padding: 2,
  },

  // ── Setup: Start button ──────────────────────────────────────────────────
  startBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    padding: "16px",
    width: "100%",
    cursor: "pointer",
    marginTop: 8,
    outline: "none",
    letterSpacing: "-0.2px",
  },

  // ── Live: Header ─────────────────────────────────────────────────────────
  sportBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  },
  // Read-only — half is derived from matchState, never picked manually.
  // Split border (not shorthand) — borderColor/background/color are
  // overridden per-render when locked, and mixing shorthand/non-shorthand
  // for the same property trips a React styling warning across rerenders.
  matchStateBadge: {
    background: "#1f6feb22",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#388bfd",
    borderRadius: 6,
    color: "#79c0ff",
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  },
  matchStateBadgeLocked: {
    background: "#f0883e22",
    borderColor: "#f0883e",
    color: "#f0883e",
  },

  // ── Live: Pitch ──────────────────────────────────────────────────────────
  // pitchWrap owns the flex sizing; pitchHost fills it exactly and stays a
  // Pixi-only DOM node (no React children rendered into it — Pixi appends
  // its canvas here directly). The Match Hub FAB is no longer anchored here
  // — it's position:fixed to the viewport (see RapidMatchHubFab.tsx).
  pitchWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  pitchHost: {
    position: "absolute",
    inset: 0,
    background: "#0d1117",
  },

  // ── Live: Controls row ───────────────────────────────────────────────────
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
  // Split border (not shorthand) — teamBtnFor/teamBtnOpp override borderColor
  // every time the FOR/OPP toggle is tapped; mixing shorthand/non-shorthand
  // for the same property trips a React styling warning across rerenders.
  teamBtn: {
    background: "#21262d",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    cursor: "pointer",
    minWidth: 44,
    maxWidth: 100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  clockBtnDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  // ── Live: Scoreboard (above the timer) ────────────────────────────────────
  scoreboardRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "6px 12px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  scoreboardTeam: {
    fontSize: 12,
    fontWeight: 700,
    maxWidth: 90,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scoreboardScore: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 15,
    fontWeight: 700,
    color: "#e6edf3",
  },
  scoreboardDivider: {
    color: "#6e7681",
    fontSize: 13,
  },

  // ── Live: Rapid event bar ────────────────────────────────────────────────
  rapidBar: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
    padding: "10px 12px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  // Split border (not shorthand) — rapidBtnArmed overrides borderColor every
  // time a kind is armed/disarmed; mixing shorthand/non-shorthand for the
  // same property trips a React styling warning across rerenders.
  rapidBtn: {
    background: "#161b22",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "#30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    height: 52,
    cursor: "pointer",
    textAlign: "center",
    outline: "none",
    width: "100%",
    transition: "background 0.08s, border-color 0.08s, color 0.08s",
  },
  rapidBtnArmed: {
    background: "#f0883e",
    borderColor: "#f0883e",
    color: "#0d1117",
  },
  rapidBtnDisabled: {
    opacity: 0.35,
    cursor: "default",
  },

  // ── Live: Status banner ──────────────────────────────────────────────────
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
  contextPip: {
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

  // ── Import error banner (Setup + Live) ────────────────────────────────────
  importErrorBanner: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    background: "#2d1214",
    border: "1px solid #f85149",
    borderRadius: 10,
    padding: "10px 12px",
    margin: "8px 12px 4px",
  },
  importErrorText: {
    fontSize: 13,
    color: "#ffd7d5",
    lineHeight: 1.4,
  },
  importErrorDismissBtn: {
    background: "transparent",
    border: "none",
    color: "#ffd7d5",
    fontSize: 14,
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },

  backBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },

  // ── Saved Matches screen ──────────────────────────────────────────────────
  savedMatchRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 10,
    padding: "12px 14px",
  },
  savedMatchInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  savedMatchTeams: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e6edf3",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  savedMatchMeta: {
    fontSize: 12,
    color: "#8b949e",
  },
  savedMatchActions: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
  },
  savedMatchDeleteBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#f85149",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },
  savedMatchReviewBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },
  savedMatchReopenBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  },
};
