import { useState } from "react";
import type { CSSProperties } from "react";
import { exportReviewPdf, exportSnapshotPdf } from "../stats/reviewPdfExport";
import {
  proTaggerMatchToPdfInput,
  proTaggerMatchToSnapshotInput,
} from "./pro-tagger-review-adapter";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";

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

const EXPORT_FILENAMES: Record<ExportKey, (home: string, away: string) => string> = {
  full: (h, a) => `${safePdfName(h)}_v_${safePdfName(a)}_review.pdf`,
  ht:   (h, a) => `${safePdfName(h)}_v_${safePdfName(a)}_ht_snapshot.pdf`,
  ft:   (h, a) => `${safePdfName(h)}_v_${safePdfName(a)}_ft_snapshot.pdf`,
};

function safePdfName(s: string): string {
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
}

function canShareFiles(file: File): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

interface Props {
  match: ProTaggerSavedMatch;
  onBack: () => void;
}

export function ProTaggerReviewScreen({ match, onBack }: Props) {
  const [exporting, setExporting]     = useState<ExportKey | null>(null);
  const [results, setResults]         = useState<Partial<Record<ExportKey, ExportResult>>>({});
  const [files, setFiles]             = useState<Partial<Record<ExportKey, File>>>({});

  const hasFirstHalfEvents = match.events.some((e) => e.period === "1H");
  const busy = exporting !== null;

  function setResult(key: ExportKey, result: ExportResult) {
    setResults((prev) => ({ ...prev, [key]: result }));
  }

  function storeFile(key: ExportKey, blob: Blob) {
    const name = EXPORT_FILENAMES[key](match.homeTeamName || "Home", match.awayTeamName || "Away");
    setFiles((prev) => ({ ...prev, [key]: new File([blob], name, { type: "application/pdf" }) }));
  }

  function handleFullReview() {
    if (busy) return;
    setExporting("full");
    setResult("full", { ok: true, text: "" });
    void exportReviewPdf(proTaggerMatchToPdfInput(match))
      .then((blob) => { storeFile("full", blob); setResult("full", { ok: true, text: "Exported" }); })
      .catch(() => setResult("full", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleHtSnapshot() {
    if (busy || !hasFirstHalfEvents) return;
    setExporting("ht");
    setResult("ht", { ok: true, text: "" });
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "HALF_TIME_SNAPSHOT"))
      .then((blob) => { storeFile("ht", blob); setResult("ht", { ok: true, text: "Exported" }); })
      .catch(() => setResult("ht", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  function handleFtSnapshot() {
    if (busy) return;
    setExporting("ft");
    setResult("ft", { ok: true, text: "" });
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(match, "FULL_TIME_SNAPSHOT"))
      .then((blob) => { storeFile("ft", blob); setResult("ft", { ok: true, text: "Exported" }); })
      .catch(() => setResult("ft", { ok: false, text: "Export failed" }))
      .finally(() => setExporting(null));
  }

  const metaParts: string[] = [
    SPORT_LABEL[match.sport]            ?? match.sport,
    MATCH_TYPE_LABEL[match.matchType]   ?? match.matchType,
    ...(match.venue ? [match.venue]     : []),
    fmtDate(match.createdAt),
  ];

  return (
    <div style={S.shell}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Back</button>
        <span style={S.title}>Review</span>
        <span style={S.headerBadge}>PDF</span>
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

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div style={S.sectionLabel}>Export</div>

        {/* ── Export buttons ──────────────────────────────────────────── */}
        <ExportRow
          label="Full Review PDF"
          description="37+ pages · complete match analysis"
          loading={exporting === "full"}
          result={results.full}
          file={files.full}
          disabled={busy && exporting !== "full"}
          onClick={handleFullReview}
        />

        <ExportRow
          label="HT Snapshot PDF"
          description="5 pages · first-half debrief"
          loading={exporting === "ht"}
          result={results.ht}
          file={files.ht}
          disabled={(busy && exporting !== "ht") || !hasFirstHalfEvents}
          disabledReason={!hasFirstHalfEvents ? "No first-half events" : undefined}
          onClick={handleHtSnapshot}
        />

        <ExportRow
          label="FT Snapshot PDF"
          description="10 pages · full-match summary"
          loading={exporting === "ft"}
          result={results.ft}
          file={files.ft}
          disabled={busy && exporting !== "ft"}
          onClick={handleFtSnapshot}
        />
      </div>
    </div>
  );
}

// ── Export row sub-component ──────────────────────────────────────────────────

interface ExportRowProps {
  label: string;
  description: string;
  loading: boolean;
  result: ExportResult | undefined;
  file?: File;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}

function ExportRow({
  label, description, loading, result, file, disabled, disabledReason, onClick,
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
  const exported = result?.ok && file != null && !loading;
  const shareSupported = exported && file != null && canShareFiles(file);

  function handleShare() {
    if (!file) return;
    void navigator.share({ files: [file] }).catch(() => {
      // User cancelled or share failed — no action needed.
    });
  }

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
      {exported && (
        shareSupported ? (
          <button style={S.shareBtn} onClick={handleShare}>
            Share PDF
          </button>
        ) : (
          <span style={S.shareNote}>PDF exported. Open Downloads to share.</span>
        )
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
  shareBtn: {
    background: "#1a3d22",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#3fb950",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 14px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
    letterSpacing: "-0.2px",
  },
  shareNote: {
    fontSize: 11,
    color: "#6e7681",
    paddingLeft: 4,
  },
};
