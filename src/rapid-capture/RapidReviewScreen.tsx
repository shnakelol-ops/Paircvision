// Rapid Capture's own flavour of the shared Review pattern already
// established by Event Stats (src/pro-tagger/ProTaggerReviewScreen.tsx):
// match header, an Event Map card that opens a full-screen filterable pitch
// board, tap-to-inspect markers with edit/delete, and a Reports section
// wired to the exact same shared engines Match Stats and Event Stats already
// use — selectReviewEvents, createPixiPitchSurface, exportReviewPdf/
// exportSnapshotPdf, buildIntelligencePack. Nothing here re-implements any
// of those; this file is UI chrome plus the rapid-capture-review-adapter.ts
// mapping.
//
// Edits/deletes call onEventsChange with the corrected event list — the
// caller (RapidLiveScreen for an in-progress session, or the page controller
// for a saved match) owns writing it back into Rapid Capture's own storage.
// This component never holds its own copy of the events beyond render state;
// there is exactly one source of truth, the Rapid saved session.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  createPixiPitchSurface,
  type PixiPitchSurfaceHandle,
} from "../core/pitch/create-pixi-pitch-surface";
import { MATCH_EVENT_KINDS, type MatchEventKind } from "../core/stats/stats-event-model";
import { exportReviewPdf, exportSnapshotPdf } from "../stats/reviewPdfExport";
import { buildIntelligencePack, type IntelligencePack } from "../stats/intelligencePack";
import { IntelligencePackPreview } from "../stats/IntelligencePackPreview";
import { selectReviewEvents } from "../stats/review-selectors";
import type { ReviewHalfFilter, ReviewTeamSideFilter } from "../stats/review-types";
import {
  rapidMatchToIntelligencePackInput,
  rapidMatchToSnapshotPdfInput,
  rapidSessionToReviewPdfInput,
} from "./rapid-capture-review-adapter";
import { deriveRapidReportCapability } from "./rapid-report-capability";
import { computeRapidScoreboard, formatScoreLine, type RapidMatchEvent } from "./rapid-capture-events";
import type { RapidSavedMatch } from "./rapid-capture-storage";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPORT_LABEL: Record<string, string> = {
  hurling: "Hurling",
  camogie: "Camogie",
  gaelic: "Gaelic",
  soccer: "Soccer",
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  league: "League",
  championship: "Championship",
  friendly: "Friendly",
  training: "Training",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// CLAUDE.md terminology (LOCKED): FREE_SCORED/FREE_MISSED display as
// Placed Scored/Placed Missed, never "Free Scored"/"Free Missed".
function getRapidEventTypeLabel(kind: MatchEventKind, isPuckout: boolean): string {
  switch (kind) {
    case "KICKOUT_WON":
      return isPuckout ? "Puckout Won" : "Kickout Won";
    case "KICKOUT_CONCEDED":
      return isPuckout ? "Puckout Lost" : "Kickout Lost";
    case "TURNOVER_WON":
      return "Turnover Won";
    case "TURNOVER_LOST":
      return "Turnover Lost";
    case "FREE_SCORED":
      return "Placed Scored";
    case "FREE_MISSED":
      return "Placed Missed";
    case "TWO_POINTER":
      return "Two Pointer";
    case "FORTY_FIVE_TWO_POINT":
      return isPuckout ? "65 (2pt)" : "45 (2pt)";
    default:
      return kind.charAt(0) + kind.slice(1).toLowerCase().replace(/_/g, " ");
  }
}

// ── Filters — same category vocabulary Event Stats already uses ─────────────

type RapidReviewCategory = "ALL" | "SCORES" | "SHOTS" | "WIDES" | "TURNOVERS" | "KICKOUTS" | "FREES";

const CATEGORY_KINDS: Record<Exclude<RapidReviewCategory, "ALL">, readonly MatchEventKind[]> = {
  SCORES: ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"],
  SHOTS: ["SHOT"],
  WIDES: ["WIDE"],
  TURNOVERS: ["TURNOVER_WON", "TURNOVER_LOST"],
  KICKOUTS: ["KICKOUT_WON", "KICKOUT_CONCEDED"],
  FREES: [
    "FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED",
    "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "WIDE",
  ],
};

// ── Pitch canvas sub-component — same engine and marker colours Rapid
// Capture's own live pitch uses (kind-based: goal/point/wide/turnover/
// kickout/free each keep their distinct colour). Team identity is conveyed
// by the FOR/OPP filter chips, not by recolouring markers — recolouring by
// team would make different event kinds indistinguishable on the board. ──

function RapidPitchCanvas({
  events,
  sport,
  onMarkerTap,
}: {
  events: readonly RapidMatchEvent[];
  sport: "gaelic" | "hurling" | "camogie" | "soccer";
  onMarkerTap?: (eventId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PixiPitchSurfaceHandle | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onMarkerTapRef = useRef(onMarkerTap);
  onMarkerTapRef.current = onMarkerTap;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const stableTap = onMarkerTapRef.current ? (id: string) => onMarkerTapRef.current?.(id) : undefined;
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

    // TEMP DIAGNOSTIC — see Review event-count investigation.
    // Groups events by rounded (nx, ny) to surface markers that would render
    // exactly (or near-exactly) on top of one another and be visually
    // indistinguishable, even though every one of them is still drawn.
    const coordGroups = new Map<string, RapidMatchEvent[]>();
    for (const event of events) {
      const key = `${event.nx.toFixed(3)},${event.ny.toFixed(3)}`;
      const group = coordGroups.get(key);
      if (group) group.push(event);
      else coordGroups.set(key, [event]);
    }
    const overlapping = [...coordGroups.entries()].filter(([, group]) => group.length > 1);
    // eslint-disable-next-line no-console
    console.log(
      "[REVIEW-PIPELINE-DEBUG] stage=markersToRender (fed into RapidPitchCanvas)",
      "count=", events.length,
      "distinctCoordGroups=", coordGroups.size,
      "overlappingCoordGroups=", overlapping.length,
      overlapping.length > 0
        ? overlapping.map(([coord, group]) => ({ coord, ids: group.map((e) => e.id), kinds: group.map((e) => e.kind) }))
        : undefined,
    );
  }, [events]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}

// ── Export row sub-component ─────────────────────────────────────────────────

type ExportKey = "full" | "ht" | "ft";
type ExportResult = { ok: boolean; text: string };

function RapidExportRow({
  label,
  description,
  loading,
  result,
  disabled,
  disabledReason,
  onClick,
}: {
  label: string;
  description: string;
  loading: boolean;
  result: ExportResult | undefined;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  let statusText = "";
  let statusColor = "#8b949e";
  if (loading) {
    statusText = "Exporting…";
  } else if (result) {
    statusText = result.text;
    statusColor = result.ok ? "#3fb950" : "#f85149";
  }
  const isDisabled = disabled || loading;
  return (
    <div style={S.exportRow}>
      <button
        style={{ ...S.exportBtn, ...(isDisabled ? S.exportBtnDisabled : {}) }}
        onClick={onClick}
        disabled={isDisabled}
      >
        <span>{label}</span>
        {loading && <span style={S.spinner}>⟳</span>}
      </button>
      <div style={S.exportMeta}>
        <span style={S.exportDesc}>{disabledReason ?? description}</span>
        {statusText ? <span style={{ ...S.exportStatus, color: statusColor }}>{statusText}</span> : null}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type RapidReviewScreenProps = {
  match: RapidSavedMatch;
  /** e.g. "Rapid Capture" or "Saved Matches" — the back button reads "← Back to {backLabel}". */
  backLabel: string;
  onBack: () => void;
  /** Edits/deletes call this with the corrected event list — updates the same Rapid saved session, never a copy. */
  onEventsChange: (next: RapidMatchEvent[]) => void;
};

export function RapidReviewScreen({ match, backLabel, onBack, onEventsChange }: RapidReviewScreenProps) {
  const [exporting, setExporting] = useState<ExportKey | null>(null);
  const [results, setResults] = useState<Partial<Record<ExportKey, ExportResult>>>({});
  const [packGenerating, setPackGenerating] = useState(false);
  const [pack, setPack] = useState<IntelligencePack | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const [reviewHalf, setReviewHalf] = useState<ReviewHalfFilter>("FULL");
  const [reviewTeam, setReviewTeam] = useState<ReviewTeamSideFilter>("ALL");
  const [reviewCategory, setReviewCategory] = useState<RapidReviewCategory>("ALL");

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editKind, setEditKind] = useState<MatchEventKind>("POINT");
  const [editPlayerName, setEditPlayerName] = useState("");
  const [editPlayerNumber, setEditPlayerNumber] = useState("");

  useEffect(() => {
    setDeleteConfirmPending(false);
    setEditMode(false);
  }, [selectedEventId]);

  useEffect(() => {
    if (!mapOpen) setSelectedEventId(null);
  }, [mapOpen]);

  const { session, events } = match;
  const pitchSport = session.sport;
  const isPuckout = session.sport === "hurling" || session.sport === "camogie";
  const koLabel = isPuckout ? "P/O" : "K/O";
  const forLabel = session.forTeamName || "FOR";
  const oppLabel = session.oppTeamName || "OPP";

  // TEMP DIAGNOSTIC — see Review event-count investigation.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[REVIEW-PIPELINE-DEBUG] stage=reviewEvents (match.events reaching RapidReviewScreen)", "count=", events.length);
  }, [events]);

  const filteredEvents = useMemo(
    () =>
      selectReviewEvents<RapidMatchEvent, RapidReviewCategory>(events, {
        half: reviewHalf,
        segment: "ALL",
        teamSide: reviewTeam,
        category: reviewCategory,
        categoryKinds: CATEGORY_KINDS,
        zone: "FULL",
        attackingDirection: "RIGHT",
      }),
    [events, reviewHalf, reviewTeam, reviewCategory],
  );

  // TEMP DIAGNOSTIC — see Review event-count investigation.
  useEffect(() => {
    const dropped = events.filter((e) => !filteredEvents.some((f) => f.id === e.id));
    // eslint-disable-next-line no-console
    console.log(
      "[REVIEW-PIPELINE-DEBUG] stage=filteredEvents (after selectReviewEvents)",
      "filter=", { reviewHalf, reviewTeam, reviewCategory },
      "count=", filteredEvents.length,
      "droppedByFilter=", dropped.length,
      dropped.length > 0 ? dropped : undefined,
    );
  }, [events, filteredEvents, reviewHalf, reviewTeam, reviewCategory]);

  const selectedEvent = selectedEventId == null ? null : events.find((e) => e.id === selectedEventId) ?? null;
  const selectedTeamLabel = selectedEvent == null ? null : selectedEvent.teamSide === "OPP" ? oppLabel : forLabel;
  const selectedPlayerLabel =
    selectedEvent == null
      ? null
      : selectedEvent.playerName
        ? selectedEvent.playerNumber
          ? `#${selectedEvent.playerNumber} ${selectedEvent.playerName}`
          : selectedEvent.playerName
        : selectedEvent.playerNumber
          ? `#${selectedEvent.playerNumber}`
          : "No player";

  const scoreboard = computeRapidScoreboard(events);
  const capability = useMemo(() => deriveRapidReportCapability(events), [events]);

  function deleteSelectedEvent() {
    if (!selectedEventId) return;
    onEventsChange(events.filter((e) => e.id !== selectedEventId));
    setSelectedEventId(null);
    setDeleteConfirmPending(false);
  }

  function openEdit() {
    if (!selectedEvent) return;
    setEditKind(selectedEvent.kind);
    setEditPlayerName(selectedEvent.playerName ?? "");
    setEditPlayerNumber(selectedEvent.playerNumber != null ? String(selectedEvent.playerNumber) : "");
    setEditMode(true);
  }

  function saveEdit() {
    if (!selectedEventId) return;
    const num = parseInt(editPlayerNumber, 10);
    onEventsChange(
      events.map((e) =>
        e.id === selectedEventId
          ? {
              ...e,
              kind: editKind,
              type: editKind,
              playerName: editPlayerName.trim() || undefined,
              playerNumber: Number.isFinite(num) && num > 0 ? num : undefined,
            }
          : e,
      ),
    );
    setEditMode(false);
  }

  function setResult(key: ExportKey, result: ExportResult) {
    setResults((prev) => ({ ...prev, [key]: result }));
  }

  const busy = exporting !== null;

  function handleFullReview() {
    if (busy || !capability.canExportFullReview) return;
    setExporting("full");
    setResult("full", { ok: true, text: "" });
    void exportReviewPdf(rapidSessionToReviewPdfInput(match))
      .then(() => setResult("full", { ok: true, text: "Exported" }))
      .catch(() => setResult("full", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleHtSnapshot() {
    if (busy || !capability.canExportHtSnapshot) return;
    setExporting("ht");
    setResult("ht", { ok: true, text: "" });
    void exportSnapshotPdf(rapidMatchToSnapshotPdfInput(match, "HALF_TIME_SNAPSHOT"))
      .then(() => setResult("ht", { ok: true, text: "Exported" }))
      .catch(() => setResult("ht", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleFtSnapshot() {
    if (busy || !capability.canExportFtSnapshot) return;
    setExporting("ft");
    setResult("ft", { ok: true, text: "" });
    void exportSnapshotPdf(rapidMatchToSnapshotPdfInput(match, "FULL_TIME_SNAPSHOT"))
      .then(() => setResult("ft", { ok: true, text: "Exported" }))
      .catch(() => setResult("ft", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleGeneratePack() {
    if (packGenerating || busy || !capability.canExportIntelligencePack) return;
    setPackGenerating(true);
    const stageLabel = match.matchState === "HALF_TIME" || match.matchState === "FIRST_HALF" ? "Half Time" : "Full Time";
    void buildIntelligencePack(rapidMatchToIntelligencePackInput(match, stageLabel))
      .then((result) => {
        setPack(result);
        setPreviewOpen(true);
      })
      .catch(() => {
        /* canvas unavailable — silently ignore, matches Event Stats behaviour */
      })
      .finally(() => setPackGenerating(false));
  }

  const categoryOptions: { id: RapidReviewCategory; label: string }[] = [
    { id: "ALL", label: "ALL" },
    { id: "SCORES", label: "SCORES" },
    { id: "SHOTS", label: "SHOTS" },
    { id: "WIDES", label: "WIDES" },
    { id: "TURNOVERS", label: "T/O" },
    { id: "KICKOUTS", label: koLabel },
    { id: "FREES", label: "FREES" },
  ];

  const metaParts = [
    SPORT_LABEL[session.sport] ?? session.sport,
    MATCH_TYPE_LABEL[session.matchType] ?? session.matchType,
    ...(session.venue ? [session.venue] : []),
    fmtDate(match.createdAt),
  ];

  const packBusy = packGenerating || busy;

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← {backLabel}</button>
        <span style={S.title}>Review</span>
        <span style={S.headerBadge}>Rapid</span>
      </div>

      <div style={S.body}>
        {/* ── Match card ───────────────────────────────────────────────── */}
        <div style={S.matchCard}>
          <div style={S.teams}>
            <span style={{ ...S.teamName, color: session.forTeamColour }}>{forLabel}</span>
            <span style={S.vs}>v</span>
            <span style={{ ...S.teamName, color: session.oppTeamColour }}>{oppLabel}</span>
          </div>
          <div style={S.scoreline}>
            {formatScoreLine(scoreboard.for)} – {formatScoreLine(scoreboard.opp)}
          </div>
          <div style={S.meta}>
            {metaParts.map((part, i) => (
              <span key={i} style={S.metaItem}>{part}</span>
            ))}
          </div>
          <div style={S.eventCount}>{events.length} event{events.length !== 1 ? "s" : ""}</div>
        </div>

        {/* ── Event Map card ───────────────────────────────────────────── */}
        <button style={S.eventMapCard} onClick={() => setMapOpen(true)}>
          <div style={S.eventMapInfo}>
            <span style={S.eventMapTitle}>Event Map</span>
            <span style={S.eventMapDesc}>
              {events.length} event{events.length !== 1 ? "s" : ""} · tap to open full board
            </span>
          </div>
          <span style={S.eventMapArrow}>→</span>
        </button>

        {/* ── Intelligence Pack ────────────────────────────────────────── */}
        <div style={S.sectionLabel}>Intelligence Pack</div>
        <div style={S.packCard}>
          <div style={S.packInfo}>
            <span style={S.packTitle}>Generate Intelligence Pack</span>
            <span style={S.packDesc}>
              {capability.canExportIntelligencePack
                ? "3 coaching cards · Possession Outcomes · Match Intelligence"
                : capability.reasons.intelligencePack}
            </span>
          </div>
          <button
            style={{ ...S.packBtn, ...(packBusy || !capability.canExportIntelligencePack ? S.packBtnBusy : {}) }}
            onClick={handleGeneratePack}
            disabled={packBusy || !capability.canExportIntelligencePack}
          >
            {packGenerating ? "Generating…" : "Generate"}
          </button>
        </div>

        {/* ── PDF Export ────────────────────────────────────────────────── */}
        <div style={S.sectionLabel}>PDF Export</div>

        <RapidExportRow
          label="Full Review PDF"
          description="Complete match analysis"
          loading={exporting === "full"}
          result={results.full}
          disabled={(busy && exporting !== "full") || !capability.canExportFullReview}
          disabledReason={capability.reasons.fullReview}
          onClick={handleFullReview}
        />

        <RapidExportRow
          label="HT Snapshot PDF"
          description="First-half debrief"
          loading={exporting === "ht"}
          result={results.ht}
          disabled={(busy && exporting !== "ht") || !capability.canExportHtSnapshot}
          disabledReason={capability.reasons.htSnapshot}
          onClick={handleHtSnapshot}
        />

        <RapidExportRow
          label="FT Snapshot PDF"
          description="Full-match summary"
          loading={exporting === "ft"}
          result={results.ft}
          disabled={(busy && exporting !== "ft") || !capability.canExportFtSnapshot}
          disabledReason={capability.reasons.ftSnapshot}
          onClick={handleFtSnapshot}
        />

        <span style={S.footNote}>PDF opens or downloads depending on your browser.</span>
      </div>

      {/* ── Full-screen Event Map board ─────────────────────────────────── */}
      {mapOpen && (
        <div style={B.shell}>
          <div style={B.header}>
            <button style={B.backBtn} onClick={() => setMapOpen(false)}>← Review</button>
            <div style={B.headerCenter}>
              <span style={B.headerTeams}>{forLabel} v {oppLabel}</span>
              <span style={B.headerMeta}>
                {[`${formatScoreLine(scoreboard.for)} – ${formatScoreLine(scoreboard.opp)}`, session.venue, fmtDate(match.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
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
                {t === "FOR" ? forLabel.slice(0, 8) : t === "OPP" ? oppLabel.slice(0, 8) : t}
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
            <RapidPitchCanvas
              events={filteredEvents}
              sport={pitchSport}
              onMarkerTap={(id) => setSelectedEventId(id)}
            />
          </div>
          <div style={B.footer}>
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </div>

          {/* ── Event detail / edit card ──────────────────────────────── */}
          {selectedEvent ? (
            <div style={B.sheet}>
              <div style={B.sheetHandle} />
              <div style={B.sheetInner}>
                <div style={B.sheetHead}>
                  <span style={B.sheetTitle}>{editMode ? "Edit event" : "Event detail"}</span>
                  <button
                    style={B.sheetClose}
                    onClick={() => (editMode ? setEditMode(false) : setSelectedEventId(null))}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                {editMode ? (
                  <div style={B.editForm}>
                    <div style={B.editField}>
                      <label style={B.editLabel}>Type</label>
                      <select
                        style={B.editSelect}
                        value={editKind}
                        onChange={(e) => setEditKind(e.target.value as MatchEventKind)}
                      >
                        {MATCH_EVENT_KINDS.map((k) => (
                          <option key={k} value={k}>{getRapidEventTypeLabel(k, isPuckout)}</option>
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
                        value={editPlayerNumber}
                        onChange={(e) => setEditPlayerNumber(e.target.value)}
                      />
                    </div>
                    <div style={B.editField}>
                      <label style={B.editLabel}>Player name</label>
                      <input
                        style={B.editInput}
                        type="text"
                        placeholder="—"
                        maxLength={40}
                        value={editPlayerName}
                        onChange={(e) => setEditPlayerName(e.target.value)}
                      />
                    </div>
                    <div style={B.editActions}>
                      <button style={B.editCancel} onClick={() => setEditMode(false)}>Cancel</button>
                      <button style={B.editSave} onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Type</span>
                      <span style={B.sheetRowValue}>{getRapidEventTypeLabel(selectedEvent.kind, isPuckout)}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Team</span>
                      <span style={B.sheetRowValue}>{selectedTeamLabel}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Player</span>
                      <span style={B.sheetRowValue}>{selectedPlayerLabel}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Half</span>
                      <span style={B.sheetRowValue}>{selectedEvent.period ?? (selectedEvent.half === 1 ? "1H" : "2H")}</span>
                    </div>
                    <div style={B.sheetRow}>
                      <span style={B.sheetRowLabel}>Time</span>
                      <span style={B.sheetRowValue}>
                        {fmtClock(selectedEvent.matchClockSeconds ?? selectedEvent.timestamp ?? 0)}
                      </span>
                    </div>
                    <div style={B.sheetActions}>
                      <button style={B.sheetBtnEdit} aria-label="Edit event" onClick={openEdit}>
                        Edit
                      </button>
                      <button
                        style={deleteConfirmPending ? B.sheetBtnDeleteConfirm : B.sheetBtnDelete}
                        aria-label={deleteConfirmPending ? "Confirm delete" : "Delete event"}
                        onClick={() => (deleteConfirmPending ? deleteSelectedEvent() : setDeleteConfirmPending(true))}
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

      {/* ── Intelligence Pack Preview (fullscreen overlay) ──────────────── */}
      {previewOpen && pack && (
        <IntelligencePackPreview
          pack={pack}
          homeTeamName={forLabel}
          awayTeamName={oppLabel}
          stageLabel={match.matchState === "HALF_TIME" || match.matchState === "FIRST_HALF" ? "Half Time" : "Full Time"}
          onClose={() => setPreviewOpen(false)}
        />
      )}
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
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
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
  title: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.3px",
    flex: 1,
    textAlign: "center",
  },
  headerBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "14px 14px 32px",
  },
  matchCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 12,
    padding: "16px",
  },
  teams: { display: "flex", alignItems: "center", gap: 10 },
  teamName: { fontSize: 15, fontWeight: 700 },
  vs: { color: "#6e7681", fontSize: 13 },
  scoreline: { fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 4 },
  meta: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 6 },
  metaItem: {
    fontSize: 12,
    color: "#8b949e",
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 6,
    padding: "2px 8px",
  },
  eventCount: { fontSize: 12, color: "#6e7681", marginTop: 6 },
  eventMapCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 12,
    padding: "16px",
    cursor: "pointer",
    color: "#e6edf3",
    textAlign: "left",
  },
  eventMapInfo: { display: "flex", flexDirection: "column", gap: 3 },
  eventMapTitle: { fontSize: 15, fontWeight: 700 },
  eventMapDesc: { fontSize: 12, color: "#8b949e" },
  eventMapArrow: { fontSize: 18, color: "#6e7681" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6e7681",
    marginTop: 8,
  },
  packCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 12,
    padding: "14px 16px",
  },
  packInfo: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  packTitle: { fontSize: 14, fontWeight: 700 },
  packDesc: { fontSize: 12, color: "#8b949e" },
  packBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 16px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
  },
  packBtnBusy: { opacity: 0.5, cursor: "default" },
  exportRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 10,
    padding: "12px 14px",
  },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 700,
    padding: "10px 12px",
    cursor: "pointer",
    outline: "none",
  },
  exportBtnDisabled: { opacity: 0.4, cursor: "default" },
  spinner: { display: "inline-block", animation: "none" },
  exportMeta: { display: "flex", justifyContent: "space-between", gap: 8 },
  exportDesc: { fontSize: 12, color: "#8b949e" },
  exportStatus: { fontSize: 12, fontWeight: 700 },
  footNote: { fontSize: 11, color: "#6e7681", textAlign: "center", marginTop: 4 },
};

// Full-screen board styles, kept separate for clarity (distinct visual layer).
const B: Record<string, CSSProperties> = {
  shell: {
    position: "fixed",
    inset: 0,
    background: "#0d1117",
    display: "flex",
    flexDirection: "column",
    zIndex: 40,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  backBtn: {
    alignSelf: "flex-start",
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
  headerCenter: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  headerTeams: { fontSize: 14, fontWeight: 700, color: "#e6edf3" },
  headerMeta: { fontSize: 11, color: "#8b949e" },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 12px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  // Split border (not shorthand) — chipActive overrides borderColor per-render
  // as filters toggle; mixing shorthand/non-shorthand here trips a React
  // styling warning across rerenders (see RapidPlayerBar.tsx for precedent).
  chip: {
    background: "#21262d",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 9px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap",
  },
  chipActive: { background: "#238636", borderColor: "#2ea043", color: "#ffffff" },
  chipSep: { width: 1, background: "#30363d", margin: "2px 2px" },
  pitchArea: { flex: 1, minHeight: 0, position: "relative" },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: "#8b949e",
    padding: "6px 12px 10px",
    flexShrink: 0,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    background: "#161b22",
    borderTop: "1px solid #30363d",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: "0 -8px 28px rgba(0,0,0,0.55)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: "#30363d",
    margin: "8px auto 0",
  },
  sheetInner: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 16px 18px" },
  sheetHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 14, fontWeight: 700, color: "#e6edf3" },
  sheetClose: {
    background: "transparent",
    border: "none",
    color: "#8b949e",
    fontSize: 20,
    cursor: "pointer",
    outline: "none",
    lineHeight: 1,
  },
  sheetRow: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  sheetRowLabel: { color: "#8b949e" },
  sheetRowValue: { color: "#e6edf3", fontWeight: 600 },
  sheetActions: { display: "flex", gap: 8, marginTop: 6 },
  sheetBtnEdit: {
    flex: 1,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
  },
  sheetBtnDelete: {
    flex: 1,
    background: "transparent",
    border: "1.5px solid #f85149",
    borderRadius: 8,
    color: "#f85149",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
  },
  sheetBtnDeleteConfirm: {
    flex: 1,
    background: "#f85149",
    border: "1.5px solid #f85149",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
  },
  editForm: { display: "flex", flexDirection: "column", gap: 10 },
  editField: { display: "flex", flexDirection: "column", gap: 4 },
  editLabel: { fontSize: 11, color: "#8b949e", fontWeight: 600 },
  editSelect: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    padding: "10px",
    outline: "none",
  },
  editInput: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    padding: "10px",
    outline: "none",
  },
  editActions: { display: "flex", gap: 8, marginTop: 4 },
  editCancel: {
    flex: 1,
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
  },
  editSave: {
    flex: 1,
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px",
    cursor: "pointer",
    outline: "none",
  },
};
