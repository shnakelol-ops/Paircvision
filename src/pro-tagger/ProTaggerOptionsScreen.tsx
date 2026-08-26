import { useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import {
  readProTaggerMatches,
  resolveImportIdCollision,
  saveProTaggerMatchFull,
} from "./pro-tagger-storage";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";

// Moved from ProTaggerReviewScreen.tsx as-is — validation logic unchanged.
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

type OptionsView = "menu" | "import" | "about";

interface Props {
  onBack: () => void;
  /** Called with the newly persisted match immediately after a successful import,
   * so the caller can transition straight into that match's Review screen. */
  onImported: (match: ProTaggerSavedMatch) => void;
}

export function ProTaggerOptionsScreen({ onBack, onImported }: Props) {
  const [view, setView] = useState<OptionsView>("menu");
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

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

        // Guard against a coincidental id collision with an unrelated saved
        // match (e.g. re-importing a file that was originally tagged on a
        // different deployment/origin) silently clobbering it.
        const { match: toSave } = resolveImportIdCollision(parsed, readProTaggerMatches());

        saveProTaggerMatchFull(toSave);
        // Land straight on the imported match's Review screen instead of a
        // status message — the caller owns navigation via onImported.
        onImported(toSave);
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

  if (view === "import") {
    return (
      <div style={S.shell}>
        <VisionStadiumBackground variant="training" />
        <div style={S.contentWrap}>
          <div style={S.header}>
            <button style={S.backBtn} onClick={() => setView("menu")}>← Options</button>
            <span style={S.title}>Import Match JSON</span>
          </div>

          <div style={S.body}>
            <div style={S.row}>
              <button style={S.rowBtn} onClick={() => importFileRef.current?.click()}>
                <span style={S.rowBtnLabel}>Choose file…</span>
              </button>
              <div style={S.rowMeta}>
                <span style={S.rowDesc}>Restore a previously exported Event Stats match</span>
                {importResult && (
                  <span style={{ ...S.rowStatus, color: importResult.ok ? "#3fb950" : "#f85149" }}>
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
          </div>
        </div>
      </div>
    );
  }

  if (view === "about") {
    return (
      <div style={S.shell}>
        <VisionStadiumBackground variant="training" />
        <div style={S.contentWrap}>
          <div style={S.header}>
            <button style={S.backBtn} onClick={() => setView("menu")}>← Options</button>
            <span style={S.title}>About Event Stats</span>
          </div>

          <div style={S.body}>
            <div style={S.aboutCard}>
              <span style={S.aboutStep}>Capture</span>
              <span style={S.aboutText}>
                Event Stats captures key match events as they happen — scores, kickouts,
                turnovers, restarts and more, each tagged to a pitch location.
              </span>
            </div>
            <div style={S.aboutCard}>
              <span style={S.aboutStep}>Review</span>
              <span style={S.aboutText}>
                Review those events' locations, filter by team, half or category, and see
                them through Zones.
              </span>
            </div>
            <div style={S.aboutCard}>
              <span style={S.aboutStep}>Understand</span>
              <span style={S.aboutText}>
                Turn events into coaching information through Quick Review, HT/FT snapshots
                and the Intelligence Pack.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.shell}>
      <VisionStadiumBackground variant="training" />
      <div style={S.contentWrap}>
        <div style={S.header}>
          <button style={S.backBtn} onClick={onBack}>← Event Stats</button>
          <span style={S.title}>Options</span>
        </div>

        <div style={S.body}>
          <button style={S.menuBtn} onClick={() => { setImportResult(null); setView("import"); }}>
            Import Match JSON
          </button>
          <button style={S.menuBtn} onClick={() => setView("about")}>
            About Event Stats
          </button>
        </div>
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
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    position: "relative",
  },
  contentWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px 10px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 7,
    color: "#7a95ad",
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
  body: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "16px 14px 24px",
  },
  menuBtn: {
    background: "#0a2134",
    border: "1px solid #1c3a52",
    borderRadius: 12,
    color: "#dce8f4",
    fontSize: 15,
    fontWeight: 600,
    padding: "16px 14px",
    textAlign: "left" as const,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.2px",
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#0a2134",
    border: "1px solid #1c3a52",
    borderRadius: 12,
    padding: "12px 14px",
  },
  rowBtn: {
    background: "#17324a",
    border: "1px solid #22475f",
    borderRadius: 8,
    color: "#dce8f4",
    fontSize: 14,
    fontWeight: 700,
    padding: "10px 0",
    cursor: "pointer",
    outline: "none",
  },
  rowBtnLabel: {
    letterSpacing: "-0.1px",
  },
  rowMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  rowDesc: {
    fontSize: 12,
    color: "#7a95ad",
  },
  rowStatus: {
    fontSize: 11,
    fontWeight: 600,
  },
  aboutCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "#0a2134",
    border: "1px solid #1c3a52",
    borderRadius: 12,
    padding: "14px",
  },
  aboutStep: {
    fontSize: 13,
    fontWeight: 700,
    color: "#22d3ee",
    letterSpacing: "-0.1px",
  },
  aboutText: {
    fontSize: 13,
    lineHeight: "1.5",
    color: "#a9c1d3",
  },
};
