import { useState, useRef, useEffect, useMemo } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { exportReviewPdf, exportSnapshotPdf } from "../stats/reviewPdfExport";
import {
  proTaggerMatchToPdfInput,
  proTaggerMatchToSnapshotInput,
} from "./pro-tagger-review-adapter";
import { saveProTaggerMatchFull } from "./pro-tagger-storage";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import { buildIntelligencePack } from "../stats/intelligencePack";
import type { IntelligencePack } from "../stats/intelligencePack";
import { IntelligencePackPreview } from "../stats/IntelligencePackPreview";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { NotesQuickPanel, getMatchNotes } from "../features/notes";
import { selectReviewEvents } from "../stats/review-selectors";
import { createPixiPitchSurface } from "../core/pitch/create-pixi-pitch-surface";
import type { PixiPitchSurfaceHandle } from "../core/pitch/create-pixi-pitch-surface";
import { MATCH_EVENT_KINDS, type MatchEventKind } from "../core/stats/stats-event-model";
import { formatMatchClock } from "../core/match/match-state-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): { goals: number; points: number; total: number } {
  const scored      = events.filter((e) => e.teamSide === side);
  const goals       = scored.filter((e) => e.kind === "GOAL").length;
  const onePointers = scored.filter((e) => e.kind === "POINT").length;
  const twoPointers = scored.filter((e) => e.kind === "TWO_POINTER").length;
  const pts = onePointers + twoPointers * 2;
  return { goals, points: pts, total: goals * 3 + pts };
}

function deriveStageLabel(
  matchState: ProTaggerSavedMatch["restoreContext"]["matchState"],
): "Half Time" | "Full Time" {
  return matchState === "HALF_TIME" ? "Half Time" : "Full Time";
}

const SPORT_LABEL: Record<string, string> = {
  gaelic:          "Gaelic Football",
  ladies_football: "Ladies Football",
  hurling:         "Hurling",
  camogie:         "Camogie",
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  league:       "League",
  championship: "Championship",
  friendly:     "Friendly",
  training:     "Training",
};

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function getProPitchSport(
  sport: ProTaggerSavedMatch["sport"],
): "gaelic" | "hurling" | "camogie" | "soccer" {
  return sport === "ladies_football" ? "gaelic" : sport;
}

function getProEventTypeLabel(kind: MatchEventKind): string {
  if (kind === "KICKOUT_CONCEDED") return "KICKOUT LOST";
  if (kind === "KICKOUT_WON")      return "KICKOUT WON";
  if (kind === "TURNOVER_LOST")    return "TURNOVER LOST";
  if (kind === "TURNOVER_WON")     return "TURNOVER WON";
  return kind;
}

// ── Pitch review filter config ────────────────────────────────────────────────

type ReviewHalf     = "FULL" | "H1" | "H2";
type ReviewTeam     = "ALL"  | "FOR" | "OPP";
type ReviewCategory =
  | "ALL" | "SCORES" | "SHOTS" | "WIDES"
  | "TURNOVERS" | "KICKOUTS" | "FREES";

const FILTER_KINDS: Record<Exclude<ReviewCategory, "ALL">, readonly MatchEventKind[]> = {
  SCORES:    ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  SHOTS:     ["SHOT"],
  WIDES:     ["WIDE"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS:  ["KICKOUT_WON", "KICKOUT_CONCEDED"],
  FREES:     ["FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED",
              "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE"],
};

function isValidProMatch(obj: unknown): obj is ProTaggerSavedMatch {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["createdAt"] === "number" &&
    typeof r["homeTeamName"] === "string" &&
    typeof r["awayTeamName"] === "string" &&
    Array.isArray(r["events"]) &&
    typeof r["restoreContext"] === "object" &&
    r["restoreContext"] !== null
  );
}

// ── Pitch canvas sub-component ────────────────────────────────────────────────

function PitchCanvas({
  events,
  sport,
  onMarkerTap,
}: {
  events: readonly LoggedMatchEvent[];
  sport: "gaelic" | "hurling" | "camogie" | "soccer";
  onMarkerTap?: (eventId: string) => void;
}) {
  const hostRef        = useRef<HTMLDivElement>(null);
  const handleRef      = useRef<PixiPitchSurfaceHandle | null>(null);
  const eventsRef      = useRef(events);
  eventsRef.current    = events;
  const onMarkerTapRef = useRef(onMarkerTap);
  onMarkerTapRef.current = onMarkerTap;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const stableTap = onMarkerTapRef.current
      ? (id: string) => onMarkerTapRef.current?.(id)
      : undefined;
    void createPixiPitchSurface(host, {
      sport,
      canLogEvents: false,
      onMarkerTap: stableTap,
    }).then((h) => {
      if (disposed) { h.destroy(); return; }
      handleRef.current = h;
      h.setEvents(eventsRef.current);
    });
    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  // onMarkerTap intentionally omitted: stableTap is built once from the ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  useEffect(() => {
    handleRef.current?.setEvents(events);
  }, [events]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ExportKey    = "full" | "ht" | "ft";
type ExportResult = { ok: boolean; text: string };

interface Props {
  match: ProTaggerSavedMatch;
  onBack: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProTaggerReviewScreen({ match: _match, onBack }: Props) {
  const [exporting, setExporting]           = useState<ExportKey | null>(null);
  const [results, setResults]               = useState<Partial<Record<ExportKey, ExportResult>>>({});
  const [packGenerating, setPackGenerating] = useState(false);
  const [pack, setPack]                     = useState<IntelligencePack | null>(null);
  const [previewOpen, setPreviewOpen]       = useState(false);
  const [mapOpen,     setMapOpen]           = useState(false);

  // ── Review filter state ────────────────────────────────────────────────────
  const [reviewHalf,     setReviewHalf]     = useState<ReviewHalf>("FULL");
  const [reviewTeam,     setReviewTeam]     = useState<ReviewTeam>("ALL");
  const [reviewCategory, setReviewCategory] = useState<ReviewCategory>("ALL");

  // ── Import state ───────────────────────────────────────────────────────────
  const [importedMatch, setImportedMatch]   = useState<ProTaggerSavedMatch | null>(null);
  const [importResult,  setImportResult]    = useState<{ ok: boolean; text: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ── Event Map marker tap state ─────────────────────────────────────────────
  const [selectedMapEventId,   setSelectedMapEventId]   = useState<string | null>(null);
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [proEditMode,          setProEditMode]          = useState(false);
  const [proEditKind,          setProEditKind]          = useState<MatchEventKind>("GOAL");
  const [proEditPlayerName,    setProEditPlayerName]    = useState("");
  const [proEditPlayerNumber,  setProEditPlayerNumber]  = useState("");
  // localMatch holds a mutated copy of the match after in-session edits/deletes.
  // It shadows importedMatch and _match so every export path sees the same data.
  const [localMatch,           setLocalMatch]           = useState<ProTaggerSavedMatch | null>(null);

  // Active match: localMatch (post-delete) > importedMatch > prop match.
  // All exports, PDFs, snapshots, and Intelligence Pack read from this value.
  const match = localMatch ?? importedMatch ?? _match;

  // Reset local-delete state when the underlying match changes (prop swap or import).
  useEffect(() => {
    setLocalMatch(null);
    setSelectedMapEventId(null);
  }, [_match.id, importedMatch]);

  // Reset delete-confirm and edit state whenever the selected event changes.
  useEffect(() => {
    setDeleteConfirmPending(false);
    setProEditMode(false);
  }, [selectedMapEventId]);

  // Clear selection when the Event Map board is closed.
  useEffect(() => {
    if (!mapOpen) setSelectedMapEventId(null);
  }, [mapOpen]);

  const pitchSport = getProPitchSport(match.sport);
  const isHurling  = match.sport === "hurling" || match.sport === "camogie";
  const koLabel    = isHurling ? "P/O" : "K/O";

  const filteredEvents = useMemo(
    () => selectReviewEvents(match.events, {
      half:               reviewHalf,
      segment:            "ALL",
      teamSide:           reviewTeam,
      category:           reviewCategory,
      categoryKinds:      FILTER_KINDS,
      zone:               "FULL",
      attackingDirection: "RIGHT",
    }),
    [match.events, reviewHalf, reviewTeam, reviewCategory],
  );

  // ── Selected event derivations ─────────────────────────────────────────────
  const selectedMapEvent = selectedMapEventId == null
    ? null
    : match.events.find((e) => e.id === selectedMapEventId) ?? null;

  const selectedMapTeamLabel = selectedMapEvent == null
    ? null
    : selectedMapEvent.team === "HOME"
      ? match.homeTeamName
      : selectedMapEvent.team === "AWAY"
        ? match.awayTeamName
        : selectedMapEvent.teamSide === "FOR"
          ? match.homeTeamName
          : match.awayTeamName;

  const selectedMapPlayerLabel = selectedMapEvent == null
    ? null
    : selectedMapEvent.playerName
      ? (selectedMapEvent.playerNumber
          ? `#${selectedMapEvent.playerNumber} ${selectedMapEvent.playerName}`
          : selectedMapEvent.playerName)
      : "No player";

  const deleteSelectedMapEvent = () => {
    if (!selectedMapEventId) return;
    const targetId = selectedMapEventId;
    const updatedEvents = match.events.filter((e) => e.id !== targetId);
    setLocalMatch({
      ...match,
      events:     updatedEvents,
      eventCount: updatedEvents.length,
    });
    setSelectedMapEventId(null);
    setDeleteConfirmPending(false);
  };

  const openProEdit = () => {
    if (!selectedMapEvent) return;
    setProEditKind(selectedMapEvent.type);
    setProEditPlayerName(selectedMapEvent.playerName ?? "");
    setProEditPlayerNumber(selectedMapEvent.playerNumber != null ? String(selectedMapEvent.playerNumber) : "");
    setProEditMode(true);
  };

  const saveProEdit = () => {
    if (!selectedMapEventId) return;
    const num = parseInt(proEditPlayerNumber, 10);
    const updatedEvents = match.events.map((e) =>
      e.id === selectedMapEventId
        ? {
            ...e,
            kind:         proEditKind,
            type:         proEditKind,
            playerName:   proEditPlayerName.trim() || undefined,
            playerNumber: Number.isFinite(num) && num > 0 ? num : undefined,
          }
        : e,
    );
    setLocalMatch({ ...match, events: updatedEvents, eventCount: updatedEvents.length });
    setProEditMode(false);
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const hasFirstHalfEvents = match.events.some((e) => e.period === "1H");
  const busy = exporting !== null;

  function setResult(key: ExportKey, result: ExportResult) {
    setResults((prev) => ({ ...prev, [key]: result }));
  }

  function handleFullReview() {
    if (busy) return;
    setExporting("full");
    setResult("full", { ok: true, text: "" });
    void exportReviewPdf(proTaggerMatchToPdfInput(match))
      .then(() => setResult("full", { ok: true, text: "Exported" }))
      .catch(() => setResult("full", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleHtSnapshot() {
    if (busy || !hasFirstHalfEvents) return;
    setExporting("ht");
    setResult("ht", { ok: true, text: "" });
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "HALF_TIME_SNAPSHOT"))
      .then(() => setResult("ht", { ok: true, text: "Exported" }))
      .catch(() => setResult("ht", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleFtSnapshot() {
    if (busy) return;
    setExporting("ft");
    setResult("ft", { ok: true, text: "" });
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "FULL_TIME_SNAPSHOT"))
      .then(() => setResult("ft", { ok: true, text: "Exported" }))
      .catch(() => setResult("ft", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleGeneratePack() {
    if (packGenerating || busy) return;
    setPackGenerating(true);
    const stageLabel = deriveStageLabel(match.restoreContext.matchState);
    const homeScore  = computeScoreSide(match.events, "FOR");
    const awayScore  = computeScoreSide(match.events, "OPP");
    void buildIntelligencePack({
      stageLabel,
      homeTeamName: match.homeTeamName || "Home",
      awayTeamName: match.awayTeamName || "Away",
      venueLabel:   match.venue || "",
      clockLabel:   stageLabel,
      homeScore,
      awayScore,
      events:       match.events,
    })
      .then((result) => {
        setPack(result);
        setPreviewOpen(true);
      })
      .catch(() => { /* canvas unavailable — silently ignore */ })
      .finally(() => setPackGenerating(false));
  }

  function handleExportJson() {
    const json = JSON.stringify(match, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    const home = (match.homeTeamName || "home").replace(/[^a-z0-9]+/gi, "-").slice(0, 20);
    const away = (match.awayTeamName || "away").replace(/[^a-z0-9]+/gi, "-").slice(0, 20);
    const date = new Date(match.createdAt).toISOString().slice(0, 10);
    a.download = `paircvision-pro-${home}-v-${away}-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result;
        if (typeof raw !== "string") throw new Error("Could not read file");
        const parsed: unknown = JSON.parse(raw);
        if (!isValidProMatch(parsed)) throw new Error("Not a valid Event Stats match file");
        saveProTaggerMatchFull(parsed);
        setImportedMatch(parsed);
        setImportResult({ ok: true, text: "Imported" });
      } catch (err) {
        setImportResult({
          ok:   false,
          text: err instanceof Error ? err.message : "Import failed",
        });
      }
      if (importFileRef.current) importFileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const metaParts: string[] = [
    SPORT_LABEL[match.sport]          ?? match.sport,
    MATCH_TYPE_LABEL[match.matchType] ?? match.matchType,
    ...(match.venue ? [match.venue]   : []),
    fmtDate(match.createdAt),
  ];

  const packBusy   = packGenerating || busy;
  const stageLabel = deriveStageLabel(match.restoreContext.matchState);

  const categoryOptions: { id: ReviewCategory; label: string }[] = [
    { id: "ALL",       label: "ALL"   },
    { id: "SCORES",    label: "SCORES" },
    { id: "SHOTS",     label: "SHOTS" },
    { id: "WIDES",     label: "WIDES" },
    { id: "TURNOVERS", label: "T/O"   },
    { id: "KICKOUTS",  label: koLabel },
    { id: "FREES",     label: "FREES" },
  ];

  return (
    <div style={S.shell}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Event Stats</button>
        <span style={S.title}>Review</span>
        <span style={S.headerBadge}>Event</span>
      </div>

      {importedMatch && (
        <div style={S.importBanner}>
          Viewing imported match · {importedMatch.homeTeamName || "Home"} v {importedMatch.awayTeamName || "Away"}
        </div>
      )}

      <div style={S.body}>
        {/* ── Match card ───────────────────────────────────────────────── */}
        <div style={S.matchCard}>
          <div style={S.teams}>
            <span style={S.teamName}>{match.homeTeamName || "Home"}</span>
            <span style={S.vs}>v</span>
            <span style={S.teamName}>{match.awayTeamName || "Away"}</span>
          </div>
          <div style={S.scoreline}>{match.scorelineSnapshot}</div>
          <div style={S.meta}>
            {metaParts.map((part, i) => (
              <span key={i} style={S.metaItem}>{part}</span>
            ))}
          </div>
          <div style={S.eventCount}>{match.eventCount} events</div>
        </div>

        {/* ── Event Map card ────────────────────────────────────────────── */}
        <button style={S.eventMapCard} onClick={() => setMapOpen(true)}>
          <div style={S.eventMapInfo}>
            <span style={S.eventMapTitle}>Event Map</span>
            <span style={S.eventMapDesc}>
              {match.eventCount} event{match.eventCount !== 1 ? "s" : ""} · tap to open full board
            </span>
          </div>
          <span style={S.eventMapArrow}>→</span>
        </button>

        {/* ── Voice Notes ───────────────────────────────────────────────── */}
        {(() => {
          const noteCount = getMatchNotes(match.id).length;
          return (
            <>
              <div style={S.sectionLabel}>
                Voice Notes{noteCount > 0 ? ` (${noteCount})` : ""}
              </div>
              <div style={S.voiceNotesCard}>
                <NotesQuickPanel
                  matchContext={{ matchId: match.id, half: 1, matchClockMs: 0 }}
                  readonly={true}
                  notesMatchId={match.id}
                />
              </div>
            </>
          );
        })()}

        {/* ── Intelligence Pack (primary action) ───────────────────────── */}
        <div style={S.sectionLabel}>Intelligence Pack</div>

        <div style={S.packCard}>
          <div style={S.packInfo}>
            <span style={S.packTitle}>Generate Intelligence Pack</span>
            <span style={S.packDesc}>
              3 coaching cards · Possession Outcomes · Match Intelligence
            </span>
          </div>
          <button
            style={{ ...S.packBtn, ...(packBusy ? S.packBtnBusy : {}) }}
            onClick={handleGeneratePack}
            disabled={packBusy}
          >
            {packGenerating ? "Generating…" : "Generate"}
          </button>
        </div>

        {/* ── Match Data ────────────────────────────────────────────────── */}
        <div style={S.sectionLabel}>Match Data</div>

        <ExportRow
          label="Export Match JSON"
          description="Download full match data as JSON"
          loading={false}
          result={undefined}
          disabled={false}
          onClick={handleExportJson}
        />

        <div style={S.exportRow}>
          <button style={S.exportBtn} onClick={() => importFileRef.current?.click()}>
            <span style={S.exportBtnLabel}>Import Match JSON</span>
          </button>
          <div style={S.exportMeta}>
            <span style={S.exportDesc}>Restore a previously exported Event Stats match</span>
            {importResult && (
              <span style={{ ...S.exportStatus, color: importResult.ok ? "#3fb950" : "#f85149" }}>
                {importResult.text}
              </span>
            )}
          </div>
        </div>

        <input
          ref={importFileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleImportFileChange}
        />

        {/* ── PDF Export (secondary) ────────────────────────────────────── */}
        <div style={S.sectionLabel}>PDF Export</div>

        <ExportRow
          label="Full Review PDF"
          description="37+ pages · complete match analysis"
          loading={exporting === "full"}
          result={results.full}
          disabled={busy && exporting !== "full"}
          onClick={handleFullReview}
        />

        <ExportRow
          label="HT Snapshot PDF"
          description="5 pages · first-half debrief"
          loading={exporting === "ht"}
          result={results.ht}
          disabled={(busy && exporting !== "ht") || !hasFirstHalfEvents}
          disabledReason={!hasFirstHalfEvents ? "No first-half events" : undefined}
          onClick={handleHtSnapshot}
        />

        <ExportRow
          label="FT Snapshot PDF"
          description="10 pages · full-match summary"
          loading={exporting === "ft"}
          result={results.ft}
          disabled={busy && exporting !== "ft"}
          onClick={handleFtSnapshot}
        />

        <span style={S.footNote}>
          PDF opens or downloads depending on your browser.
        </span>
      </div>

      {/* ── Full-screen Pixi board ───────────────────────────────────── */}
      {mapOpen && (
        <div style={B.shell}>
          <div style={B.header}>
            <button style={B.backBtn} onClick={() => setMapOpen(false)}>← Review</button>
            <div style={B.headerCenter}>
              <span style={B.headerTeams}>
                {match.homeTeamName || "Home"} v {match.awayTeamName || "Away"}
              </span>
              <span style={B.headerMeta}>
                {[match.scorelineSnapshot, match.venue, fmtDate(match.createdAt)]
                  .filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <div style={B.filterRow}>
            {(["FULL", "H1", "H2"] as const).map((h) => (
              <button
                key={h}
                style={{ ...B.chip, ...(reviewHalf === h ? B.chipActive : {}) }}
                onClick={() => setReviewHalf(h)}
              >
                {h === "FULL" ? "ALL" : h}
              </button>
            ))}
            <div style={B.chipSep} />
            {(["ALL", "FOR", "OPP"] as const).map((t) => (
              <button
                key={t}
                style={{ ...B.chip, ...(reviewTeam === t ? B.chipActive : {}) }}
                onClick={() => setReviewTeam(t)}
              >
                {t}
              </button>
            ))}
            <div style={B.chipSep} />
            {categoryOptions.map(({ id, label }) => (
              <button
                key={id}
                style={{ ...B.chip, ...(reviewCategory === id ? B.chipActive : {}) }}
                onClick={() => setReviewCategory(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={B.pitchArea}>
            <PitchCanvas
              events={filteredEvents}
              sport={pitchSport}
              onMarkerTap={(id) => setSelectedMapEventId(id)}
            />
          </div>
          <div style={B.footer}>
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </div>

          {/* ── Event detail / edit card ──────────────────────────────── */}
          {selectedMapEvent ? (
            <div style={B.sheet}>
              <div style={B.sheetHandle} />
              <div style={B.sheetInner}>
                <div style={B.sheetHead}>
                  <span style={B.sheetTitle}>{proEditMode ? "Edit event" : "Event detail"}</span>
                  <button
                    style={B.sheetClose}
                    onClick={() => {
                      if (proEditMode) {
                        setProEditMode(false);
                      } else {
                        setSelectedMapEventId(null);
                      }
                    }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                {proEditMode ? (
                  <div style={B.editForm}>
                    <div style={B.editField}>
                      <label style={B.editLabel}>Type</label>
                      <select
                        style={B.editSelect}
                        value={proEditKind}
                        onChange={(e) => setProEditKind(e.target.value as MatchEventKind)}
                      >
                        {MATCH_EVENT_KINDS.map((k) => (
                          <option key={k} value={k}>{getProEventTypeLabel(k)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={B.editField}>
                      <label style={B.editLabel}>Player #</label>
                      <input
                        style={B.editInput}
                        type="number"
                        min="1"
                        max="99"
                        placeholder="—"
                        value={proEditPlayerNumber}
                        onChange={(e) => setProEditPlayerNumber(e.target.value)}
                      />
                    </div>
                    <div style={B.editField}>
                      <label style={B.editLabel}>Player name</label>
                      <input
                        style={B.editInput}
                        type="text"
                        placeholder="—"
                        maxLength={40}
                        value={proEditPlayerName}
                        onChange={(e) => setProEditPlayerName(e.target.value)}
                      />
                    </div>
                    <div style={B.editActions}>
                      <button style={B.editCancel} onClick={() => setProEditMode(false)}>
                        Cancel
                      </button>
                      <button style={B.editSave} onClick={saveProEdit}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Type</span>
                      <span style={B.sheetRowValue}>{getProEventTypeLabel(selectedMapEvent.type)}</span>
                    </div>
                    {selectedMapTeamLabel ? (
                      <div style={B.sheetRow}>
                        <span style={B.sheetRowLabel}>Team</span>
                        <span style={B.sheetRowValue}>{selectedMapTeamLabel}</span>
                      </div>
                    ) : null}
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Player</span>
                      <span style={B.sheetRowValue}>{selectedMapPlayerLabel}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Half</span>
                      <span style={B.sheetRowValue}>{selectedMapEvent.period}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Time</span>
                      <span style={B.sheetRowValue}>
                        {formatMatchClock(selectedMapEvent.matchClockSeconds)}
                      </span>
                    </div>
                    <div style={B.sheetActions}>
                      <button
                        style={B.sheetBtnEdit}
                        aria-label="Edit event"
                        onClick={openProEdit}
                      >
                        Edit
                      </button>
                      <button
                        style={deleteConfirmPending ? B.sheetBtnDeleteConfirm : B.sheetBtnDelete}
                        aria-label={deleteConfirmPending ? "Confirm delete" : "Delete event"}
                        onClick={() => {
                          if (deleteConfirmPending) {
                            deleteSelectedMapEvent();
                          } else {
                            setDeleteConfirmPending(true);
                          }
                        }}
                      >
                        {deleteConfirmPending ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Intelligence Pack Preview (fullscreen overlay) ────────────── */}
      {previewOpen && pack && (
        <IntelligencePackPreview
          pack={pack}
          homeTeamName={match.homeTeamName || "Home"}
          awayTeamName={match.awayTeamName || "Away"}
          stageLabel={stageLabel}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ── Export row sub-component ──────────────────────────────────────────────────

interface ExportRowProps {
  label: string;
  description: string;
  loading: boolean;
  result: ExportResult | undefined;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}

function ExportRow({
  label, description, loading, result, disabled, disabledReason, onClick,
}: ExportRowProps) {
  let statusText  = "";
  let statusColor = "#8b949e";
  if (loading) {
    statusText  = "Exporting…";
    statusColor = "#8b949e";
  } else if (result) {
    statusText  = result.text;
    statusColor = result.ok ? "#3fb950" : "#f85149";
  }

  const isDisabled = disabled || loading;

  return (
    <div style={S.exportRow}>
      <button
        style={{
          ...S.exportBtn,
          ...(isDisabled ? S.exportBtnDisabled : {}),
          ...(loading    ? S.exportBtnLoading  : {}),
        }}
        onClick={onClick}
        disabled={isDisabled}
      >
        <span style={S.exportBtnLabel}>{label}</span>
        {loading && <span style={S.spinner}>⟳</span>}
      </button>
      <div style={S.exportMeta}>
        <span style={S.exportDesc}>
          {disabledReason ?? description}
        </span>
        {statusText ? (
          <span style={{ ...S.exportStatus, color: statusColor }}>{statusText}</span>
        ) : null}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  shell: {
    display:       "flex",
    flexDirection: "column",
    height:        "100dvh",
    width:         "100%",
    background:    "#0d1117",
    color:         "#e6edf3",
    fontFamily:    "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect:    "none",
    overflow:      "hidden",
  },
  header: {
    display:       "flex",
    alignItems:    "center",
    gap:           10,
    padding:       "10px 14px",
    background:    "#161b22",
    borderBottom:  "1px solid #21262d",
    flexShrink:    0,
  },
  backBtn: {
    background:   "transparent",
    border:       "1px solid #30363d",
    borderRadius: 7,
    color:        "#8b949e",
    fontSize:     13,
    fontWeight:   600,
    padding:      "5px 10px",
    cursor:       "pointer",
    outline:      "none",
    whiteSpace:   "nowrap" as const,
    flexShrink:   0,
  },
  title: {
    fontWeight:    700,
    fontSize:      15,
    flex:          1,
    letterSpacing: "-0.3px",
  },
  headerBadge: {
    background:   "#21262d",
    border:       "1px solid #30363d",
    borderRadius: 6,
    color:        "#8b949e",
    fontSize:     11,
    fontWeight:   600,
    padding:      "3px 8px",
    flexShrink:   0,
  },
  body: {
    flex:          1,
    overflowY:     "auto",
    display:       "flex",
    flexDirection: "column",
    gap:           12,
    padding:       "16px 16px 48px",
  },
  matchCard: {
    background:    "#161b22",
    border:        "1px solid #21262d",
    borderRadius:  10,
    padding:       "14px 16px",
    display:       "flex",
    flexDirection: "column",
    gap:           6,
  },
  teams: {
    display:    "flex",
    alignItems: "center",
    gap:        8,
  },
  teamName: {
    fontSize:      16,
    fontWeight:    700,
    color:         "#e6edf3",
    letterSpacing: "-0.3px",
  },
  vs: {
    fontSize:  12,
    fontWeight: 600,
    color:     "#6e7681",
  },
  scoreline: {
    fontSize:      14,
    fontWeight:    700,
    color:         "#58a6ff",
    letterSpacing: "0.02em",
  },
  meta: {
    display:   "flex",
    flexWrap:  "wrap" as const,
    gap:       4,
    rowGap:    3,
  },
  metaItem: {
    fontSize:     11,
    color:        "#8b949e",
    background:   "#0d1117",
    border:       "1px solid #21262d",
    borderRadius: 4,
    padding:      "1px 6px",
    whiteSpace:   "nowrap" as const,
  },
  eventCount: {
    fontSize:  11,
    color:     "#6e7681",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize:       10,
    fontWeight:     600,
    letterSpacing:  "0.12em",
    textTransform:  "uppercase" as const,
    color:          "#484f58",
    marginTop:      4,
  },

  // ── Event Map card ──────────────────────────────────────────────────────────
  eventMapCard: {
    background:     "rgba(34,211,238,0.06)",
    border:         "1px solid rgba(34,211,238,0.28)",
    borderRadius:   12,
    padding:        "16px",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    cursor:         "pointer",
    outline:        "none",
    width:          "100%",
    textAlign:      "left" as const,
    WebkitTapHighlightColor: "transparent",
  },
  eventMapInfo: {
    display:       "flex",
    flexDirection: "column",
    gap:           4,
  },
  eventMapTitle: {
    fontSize:      16,
    fontWeight:    700,
    color:         "#e6edf3",
    letterSpacing: "-0.3px",
  },
  eventMapDesc: {
    fontSize: 12,
    color:    "#6e7681",
  },
  eventMapArrow: {
    fontSize:   20,
    color:      "#22d3ee",
    flexShrink: 0,
  },

  // ── Voice notes ─────────────────────────────────────────────────────────────
  voiceNotesCard: {
    background:   "#0d1117",
    border:       "1px solid #21262d",
    borderRadius: 12,
    overflow:     "hidden",
  },

  // ── Intelligence Pack card ───────────────────────────────────────────────────
  packCard: {
    background:  "rgba(34, 197, 94, 0.06)",
    border:      "1px solid rgba(34, 197, 94, 0.22)",
    borderRadius: 12,
    padding:     "14px 16px",
    display:     "flex",
    alignItems:  "center",
    justifyContent: "space-between",
    gap:         12,
  },
  packInfo: {
    display:       "flex",
    flexDirection: "column",
    gap:           3,
    flex:          1,
    minWidth:      0,
  },
  packTitle: {
    fontSize:      15,
    fontWeight:    700,
    color:         "#e6edf3",
    letterSpacing: "-0.2px",
  },
  packDesc: {
    fontSize: 11,
    color:    "#6e7681",
  },
  packBtn: {
    background:    "#22c55e",
    border:        "none",
    borderRadius:  9,
    color:         "#050d09",
    fontSize:      14,
    fontWeight:    700,
    padding:       "10px 18px",
    cursor:        "pointer",
    outline:       "none",
    flexShrink:    0,
    whiteSpace:    "nowrap" as const,
    letterSpacing: "-0.2px",
  },
  packBtnBusy: {
    background: "#166534",
    color:      "#4ade80",
    cursor:     "default",
  },

  // ── Export rows ─────────────────────────────────────────────────────────────
  exportRow: {
    display:       "flex",
    flexDirection: "column",
    gap:           5,
  },
  exportBtn: {
    background:     "#161b22",
    border:         "1px solid #30363d",
    borderRadius:   10,
    color:          "#e6edf3",
    fontSize:       15,
    fontWeight:     600,
    padding:        "14px 16px",
    width:          "100%",
    cursor:         "pointer",
    outline:        "none",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    letterSpacing:  "-0.2px",
    textAlign:      "left" as const,
  },
  exportBtnDisabled: {
    opacity: 0.4,
    cursor:  "default",
  },
  exportBtnLoading: {
    borderColor: "#388bfd",
    color:       "#58a6ff",
  },
  exportBtnLabel: {
    flex: 1,
  },
  spinner: {
    fontSize:   16,
    display:    "inline-block",
    animation:  "spin 1s linear infinite",
    flexShrink: 0,
  },
  exportMeta: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    paddingLeft:    4,
    gap:            8,
  },
  exportDesc: {
    fontSize: 11,
    color:    "#6e7681",
  },
  exportStatus: {
    fontSize:  11,
    fontWeight: 600,
    flexShrink: 0,
  },
  footNote: {
    fontSize:  11,
    color:     "#484f58",
    textAlign: "center" as const,
    marginTop: 8,
  },
  importBanner: {
    background:   "rgba(34,211,238,0.08)",
    borderBottom: "1px solid rgba(34,211,238,0.2)",
    color:        "#22d3ee",
    fontSize:     11,
    fontWeight:   600,
    padding:      "6px 14px",
    textAlign:    "center" as const,
    flexShrink:   0,
  },
};

// ── Full-screen board styles ──────────────────────────────────────────────────

const B: Record<string, CSSProperties> = {
  shell: {
    position:      "fixed",
    inset:         0,
    zIndex:        100,
    display:       "flex",
    flexDirection: "column",
    background:    "#0d1117",
    color:         "#e6edf3",
    fontFamily:    "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect:    "none",
  },
  header: {
    display:      "flex",
    alignItems:   "center",
    gap:          10,
    padding:      "10px 14px",
    background:   "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink:   0,
  },
  backBtn: {
    background:   "transparent",
    border:       "1px solid #30363d",
    borderRadius: 7,
    color:        "#8b949e",
    fontSize:     13,
    fontWeight:   600,
    padding:      "5px 10px",
    cursor:       "pointer",
    outline:      "none",
    whiteSpace:   "nowrap" as const,
    flexShrink:   0,
  },
  headerCenter: {
    display:       "flex",
    flexDirection: "column",
    gap:           2,
    flex:          1,
    minWidth:      0,
  },
  headerTeams: {
    fontSize:      14,
    fontWeight:    700,
    color:         "#e6edf3",
    letterSpacing: "-0.3px",
    overflow:      "hidden",
    textOverflow:  "ellipsis",
    whiteSpace:    "nowrap" as const,
  },
  headerMeta: {
    fontSize:     11,
    color:        "#6e7681",
    overflow:     "hidden",
    textOverflow: "ellipsis",
    whiteSpace:   "nowrap" as const,
  },
  filterRow: {
    display:        "flex",
    alignItems:     "center",
    gap:            6,
    padding:        "9px 16px 9px 10px",
    overflowX:      "auto" as const,
    scrollbarWidth: "none" as const,
    flexShrink:     0,
    background:     "#161b22",
    borderBottom:   "1px solid #21262d",
  },
  chip: {
    background:    "#0d1117",
    border:        "1px solid #30363d",
    borderRadius:  6,
    color:         "#8b949e",
    fontSize:      11,
    fontWeight:    600,
    padding:       "6px 11px",
    cursor:        "pointer",
    outline:       "none",
    whiteSpace:    "nowrap" as const,
    flexShrink:    0,
    letterSpacing: "0.04em",
    WebkitTapHighlightColor: "transparent",
  },
  chipActive: {
    background: "rgba(14,116,144,0.38)",
    border:     "1px solid rgba(125,211,252,0.9)",
    color:      "#7dd3fc",
  },
  chipSep: {
    width:      1,
    height:     16,
    background: "#30363d",
    flexShrink: 0,
    margin:     "0 4px",
  },
  pitchArea: {
    flex:      1,
    background: "#0a1628",
    position:  "relative" as const,
    overflow:  "hidden",
    minHeight: 0,
  },
  footer: {
    padding:    "6px 14px",
    fontSize:   11,
    color:      "#484f58",
    background: "#161b22",
    borderTop:  "1px solid #21262d",
    flexShrink: 0,
  },

  // ── Event detail card (compact right-anchored) ────────────────────────────
  sheet: {
    position:             "absolute",
    right:                12,
    bottom:               12,
    left:                 "auto",
    zIndex:               10,
    minWidth:             224,
    maxWidth:             280,
    background:           "rgba(10, 20, 35, 0.97)",
    backdropFilter:       "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius:         14,
    border:               "1px solid rgba(148, 163, 184, 0.34)",
    boxShadow:            "0 8px 24px rgba(4, 12, 24, 0.44)",
    display:              "flex",
    flexDirection:        "column",
    overflow:             "hidden",
  } as CSSProperties,
  sheetHandle: {
    display: "none",
  },
  sheetInner: {
    padding:       "10px 12px 14px",
    display:       "flex",
    flexDirection: "column",
    gap:           6,
  } as CSSProperties,
  sheetHead: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    gap:            8,
    marginBottom:   2,
  },
  sheetTitle: {
    color:         "#e6edf3",
    fontSize:      10,
    fontWeight:    700,
    letterSpacing: "0.18px",
    textTransform: "uppercase" as const,
  },
  sheetClose: {
    width:        22,
    height:       22,
    borderRadius: 999,
    border:       "1px solid rgba(148, 163, 184, 0.34)",
    background:   "rgba(15, 23, 42, 0.86)",
    color:        "#e6edf3",
    fontSize:     13,
    lineHeight:   "1",
    display:      "inline-flex",
    alignItems:   "center",
    justifyContent: "center",
    cursor:       "pointer",
    outline:      "none",
  } as CSSProperties,
  sheetRow: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    gap:            10,
    color:          "#e6edf3",
    fontSize:       11,
    minHeight:      22,
  },
  sheetRowLabel: {
    opacity:       0.72,
    textTransform: "uppercase" as const,
    fontSize:      10,
    flexShrink:    0,
  },
  sheetRowValue: {
    fontWeight: 700,
    textAlign:  "right" as const,
  },
  sheetActions: {
    display:   "flex",
    gap:       8,
    marginTop: 8,
  },
  sheetBtnEdit: {
    flex:         1,
    minHeight:    42,
    borderRadius: 10,
    border:       "1px solid rgba(148, 163, 184, 0.34)",
    background:   "rgba(30, 41, 59, 0.8)",
    color:        "#e6edf3",
    fontSize:     12,
    fontWeight:   700,
    cursor:       "pointer",
    outline:      "none",
  },
  sheetBtnDelete: {
    flex:         1,
    minHeight:    42,
    borderRadius: 10,
    border:       "1px solid rgba(239, 68, 68, 0.5)",
    background:   "rgba(127, 29, 29, 0.4)",
    color:        "#fca5a5",
    fontSize:     12,
    fontWeight:   700,
    cursor:       "pointer",
    outline:      "none",
  },
  sheetBtnDeleteConfirm: {
    flex:         1,
    minHeight:    42,
    borderRadius: 10,
    border:       "1px solid rgba(239, 68, 68, 0.9)",
    background:   "rgba(185, 28, 28, 0.92)",
    color:        "#fff",
    fontSize:     12,
    fontWeight:   700,
    cursor:       "pointer",
    outline:      "none",
  },
  // ── Edit form ─────────────────────────────────────────────────────────────
  editForm: {
    display:       "flex",
    flexDirection: "column",
    gap:           8,
  } as CSSProperties,
  editField: {
    display:       "flex",
    flexDirection: "column",
    gap:           3,
  } as CSSProperties,
  editLabel: {
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: "0.14px",
    textTransform: "uppercase" as const,
    opacity:       0.72,
    color:         "#e6edf3",
  },
  editSelect: {
    minHeight:   34,
    borderRadius: 8,
    border:      "1px solid rgba(148, 163, 184, 0.38)",
    background:  "rgba(15, 23, 42, 0.86)",
    color:       "#e6edf3",
    fontSize:    11,
    fontWeight:  600,
    padding:     "0 10px",
    width:       "100%",
    boxSizing:   "border-box" as const,
  },
  editInput: {
    minHeight:   34,
    borderRadius: 8,
    border:      "1px solid rgba(148, 163, 184, 0.38)",
    background:  "rgba(15, 23, 42, 0.86)",
    color:       "#e6edf3",
    fontSize:    11,
    fontWeight:  600,
    padding:     "0 10px",
    width:       "100%",
    boxSizing:   "border-box" as const,
  },
  editActions: {
    display:   "flex",
    gap:       8,
    marginTop: 4,
  },
  editCancel: {
    flex:         1,
    minHeight:    38,
    borderRadius: 10,
    border:       "1px solid rgba(148, 163, 184, 0.34)",
    background:   "rgba(30, 41, 59, 0.8)",
    color:        "#e6edf3",
    fontSize:     11,
    fontWeight:   700,
    cursor:       "pointer",
    outline:      "none",
  },
  editSave: {
    flex:         1,
    minHeight:    38,
    borderRadius: 10,
    border:       "1px solid rgba(34, 197, 94, 0.6)",
    background:   "rgba(22, 101, 52, 0.7)",
    color:        "#86efac",
    fontSize:     11,
    fontWeight:   700,
    cursor:       "pointer",
    outline:      "none",
  },
};
