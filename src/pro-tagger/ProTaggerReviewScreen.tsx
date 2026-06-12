import { useState } from "react";
import type { CSSProperties } from "react";
import { exportReviewPdf, exportSnapshotPdf } from "../stats/reviewPdfExport";
import {
  proTaggerMatchToPdfInput,
  proTaggerMatchToSnapshotInput,
} from "./pro-tagger-review-adapter";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import { buildIntelligencePack } from "../stats/intelligencePack";
import type { IntelligencePack } from "../stats/intelligencePack";
import { IntelligencePackPreview } from "../stats/IntelligencePackPreview";
import type { LoggedMatchEvent } from "../core/stats/saved-match";

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): { goals: number; points: number; total: number } {
  const scored     = events.filter((e) => e.teamSide === side);
  const goals      = scored.filter((e) => e.kind === "GOAL").length;
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

type ExportKey = "full" | "ht" | "ft";
type ExportResult = { ok: boolean; text: string };

interface Props {
  match: ProTaggerSavedMatch;
  onBack: () => void;
}

export function ProTaggerReviewScreen({ match, onBack }: Props) {
  const [exporting, setExporting]     = useState<ExportKey | null>(null);
  const [results, setResults]         = useState<Partial<Record<ExportKey, ExportResult>>>({});
  const [packGenerating, setPackGenerating] = useState(false);
  const [pack, setPack]               = useState<IntelligencePack | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const metaParts: string[] = [
    SPORT_LABEL[match.sport]            ?? match.sport,
    MATCH_TYPE_LABEL[match.matchType]   ?? match.matchType,
    ...(match.venue ? [match.venue]     : []),
    fmtDate(match.createdAt),
  ];

  const packBusy = packGenerating || busy;
  const stageLabel = deriveStageLabel(match.restoreContext.matchState);

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Back</button>
        <span style={S.title}>Review</span>
        <span style={S.headerBadge}>Pro</span>
      </div>

      <div style={S.body}>
        {/* ── Match card ─────────────────────────────────────────────── */}
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

        {/* ── Intelligence Pack (primary action) ──────────────────────── */}
        <div style={S.sectionLabel}>Intelligence Pack</div>

        <div style={S.packCard}>
          <div style={S.packInfo}>
            <span style={S.packTitle}>Generate Intelligence Pack</span>
            <span style={S.packDesc}>
              3 coaching cards · Possession Outcomes · Match Intelligence
            </span>
          </div>
          <button
            style={{
              ...S.packBtn,
              ...(packBusy ? S.packBtnBusy : {}),
            }}
            onClick={handleGeneratePack}
            disabled={packBusy}
          >
            {packGenerating ? "Generating…" : "Generate"}
          </button>
        </div>

        {/* ── PDF Export (secondary) ──────────────────────────────────── */}
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

      {/* ── Intelligence Pack Preview (fullscreen overlay) ───────────── */}
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
  let statusText = "";
  let statusColor = "#8b949e";
  if (loading) {
    statusText = "Exporting…";
    statusColor = "#8b949e";
  } else if (result) {
    statusText = result.text;
    statusColor = result.ok ? "#3fb950" : "#f85149";
  }

  const isDisabled = disabled || loading;

  return (
    <div style={S.exportRow}>
      <button
        style={{
          ...S.exportBtn,
          ...(isDisabled ? S.exportBtnDisabled : {}),
          ...(loading ? S.exportBtnLoading : {}),
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
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    width: "100%",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 7,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "5px 10px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 15,
    flex: 1,
    letterSpacing: "-0.3px",
  },
  headerBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "16px 16px 48px",
  },
  matchCard: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  teams: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  teamName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.3px",
  },
  vs: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6e7681",
  },
  scoreline: {
    fontSize: 14,
    fontWeight: 700,
    color: "#58a6ff",
    letterSpacing: "0.02em",
  },
  meta: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
    rowGap: 3,
  },
  metaItem: {
    fontSize: 11,
    color: "#8b949e",
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: "1px 6px",
    whiteSpace: "nowrap" as const,
  },
  eventCount: {
    fontSize: 11,
    color: "#6e7681",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#484f58",
    marginTop: 4,
  },
  exportRow: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  exportBtn: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#e6edf3",
    fontSize: 15,
    fontWeight: 600,
    padding: "14px 16px",
    width: "100%",
    cursor: "pointer",
    outline: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    letterSpacing: "-0.2px",
    textAlign: "left" as const,
  },
  exportBtnDisabled: {
    opacity: 0.4,
    cursor: "default",
  },
  exportBtnLoading: {
    borderColor: "#388bfd",
    color: "#58a6ff",
  },
  exportBtnLabel: {
    flex: 1,
  },
  spinner: {
    fontSize: 16,
    display: "inline-block",
    animation: "spin 1s linear infinite",
    flexShrink: 0,
  },
  exportMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 4,
    gap: 8,
  },
  exportDesc: {
    fontSize: 11,
    color: "#6e7681",
  },
  exportStatus: {
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  footNote: {
    fontSize: 11,
    color: "#484f58",
    textAlign: "center" as const,
    marginTop: 8,
  },

  // ── Intelligence Pack card ─────────────────────────────────────────────────
  packCard: {
    background: "rgba(34, 197, 94, 0.06)",
    border: "1px solid rgba(34, 197, 94, 0.22)",
    borderRadius: 12,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  packInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  packTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
  },
  packDesc: {
    fontSize: 11,
    color: "#6e7681",
  },
  packBtn: {
    background: "#22c55e",
    border: "none",
    borderRadius: 9,
    color: "#050d09",
    fontSize: 14,
    fontWeight: 700,
    padding: "10px 18px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
    letterSpacing: "-0.2px",
  },
  packBtnBusy: {
    background: "#166534",
    color: "#4ade80",
    cursor: "default",
  },
};
