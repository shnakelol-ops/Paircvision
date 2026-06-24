import { useState, useRef } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import { ProTaggerSetupScreen } from "./ProTaggerSetupScreen";
import { ProTaggerSquadScreen } from "./ProTaggerSquadScreen";
import { ProTaggerLiveScreen } from "./ProTaggerLiveScreen";
import type { RestoreState } from "./ProTaggerLiveScreen";
import { ProTaggerSavedMatchesScreen } from "./ProTaggerSavedMatchesScreen";
import { ProTaggerReviewScreen } from "./ProTaggerReviewScreen";
import type { ProTaggerSavedMatch } from "./pro-tagger-storage";
import { readProTaggerMatches, saveProTaggerMatchFull } from "./pro-tagger-storage";
import { exportSnapshotPdf } from "../stats/reviewPdfExport";
import { proTaggerMatchToSnapshotInput } from "./pro-tagger-review-adapter";

type AppPhase = "home" | "setup" | "squads" | "live" | "saved-matches" | "review";

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

function savedMatchToSession(m: ProTaggerSavedMatch): ProTaggerSession {
  return {
    id:                  m.id,
    sport:               m.sport,
    homeTeamName:        m.homeTeamName,
    awayTeamName:        m.awayTeamName,
    venue:               m.venue,
    matchType:           m.matchType,
    attackDirection:     m.restoreContext.firstHalfAttackingDirection,
    halfDurationMinutes: m.halfDurationMinutes,
    createdAt:           m.createdAt,
    homeSquad:           m.homeSquad,
    awaySquad:           m.awaySquad,
  };
}

function savedMatchToRestoreState(m: ProTaggerSavedMatch): RestoreState {
  return {
    events:              m.events,
    homeSquadLiveState:  m.homeSquadLiveState,
    awaySquadLiveState:  m.awaySquadLiveState,
    matchState:          m.restoreContext.matchState,
    half:                m.restoreContext.currentHalf,
    clockSeconds:        m.restoreContext.matchTimeSeconds,
  };
}

export default function ProTaggerPage() {
  const [phase, setPhase]               = useState<AppPhase>("home");
  const [draftSession, setDraftSession] = useState<ProTaggerSession | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState | undefined>(undefined);
  const [savedCount, setSavedCount]     = useState(() => readProTaggerMatches().length);
  const [reviewMatch, setReviewMatch]   = useState<ProTaggerSavedMatch | null>(null);

  // ── Actions menu ────────────────────────────────────────────────────────────
  const [actionsOpen, setActionsOpen]         = useState(false);
  const [actionsLatest, setActionsLatest]     = useState<ProTaggerSavedMatch | null>(null);
  const [actionsImport, setActionsImport]     = useState<{ ok: boolean; text: string } | null>(null);
  const [snapshotBusy, setSnapshotBusy]       = useState<"ht" | "ft" | null>(null);
  const importFileRef                         = useRef<HTMLInputElement>(null);

  function openActions() {
    setActionsLatest(readProTaggerMatches()[0] ?? null);
    setActionsImport(null);
    setSnapshotBusy(null);
    setActionsOpen(true);
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result;
        if (typeof raw !== "string") throw new Error("Could not read file");
        const parsed: unknown = JSON.parse(raw);
        if (!isValidProMatch(parsed)) throw new Error("Not a valid Pro match file");
        saveProTaggerMatchFull(parsed);
        setActionsLatest(parsed);
        setSavedCount(readProTaggerMatches().length);
        setActionsImport({ ok: true, text: "Imported successfully" });
      } catch (err) {
        setActionsImport({
          ok:   false,
          text: err instanceof Error ? err.message : "Import failed",
        });
      }
      if (importFileRef.current) importFileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function handleHtSnapshot() {
    if (snapshotBusy || !actionsLatest) return;
    setSnapshotBusy("ht");
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(actionsLatest, "HALF_TIME_SNAPSHOT"))
      .finally(() => setSnapshotBusy(null));
  }

  function handleFtSnapshot() {
    if (snapshotBusy || !actionsLatest) return;
    setSnapshotBusy("ft");
    void exportSnapshotPdf(proTaggerMatchToSnapshotInput(actionsLatest, "FULL_TIME_SNAPSHOT"))
      .finally(() => setSnapshotBusy(null));
  }

  const hasFirstHalfEvents = (actionsLatest?.events ?? []).some((e) => e.half === 1);

  // ── Home landing ────────────────────────────────────────────────────────────

  if (phase === "home") {
    return (
      <div style={H.shell}>
        <div style={H.header}>
          <span style={H.title}>Stats Pro</span>
          <button style={H.actionsBtn} onClick={openActions}>Actions</button>
        </div>

        <div style={H.body}>
          <div style={H.logoWrap}>
            <img src="/pv-logo-icon.svg" alt="PáircVision" style={H.logo} />
          </div>
          <button
            style={H.primaryBtn}
            onClick={() => setPhase("setup")}
          >
            New Match
          </button>
          <button
            style={H.secondaryBtn}
            onClick={() => {
              setSavedCount(readProTaggerMatches().length);
              setPhase("saved-matches");
            }}
          >
            Saved Matches
            {savedCount > 0 && (
              <span style={H.badge}>{savedCount}</span>
            )}
          </button>
        </div>

        {/* ── Actions modal ────────────────────────────────────────────── */}
        {actionsOpen && (
          <div style={H.overlay} onClick={() => setActionsOpen(false)}>
            <div style={H.sheet} onClick={(e) => e.stopPropagation()}>
              <div style={H.sheetHandle} />

              {/* ── Matches ───────────────────────────────────── */}
              <div style={H.sheetSection}>Matches</div>

              <button
                style={H.sheetItem}
                onClick={() => {
                  setActionsOpen(false);
                  setSavedCount(readProTaggerMatches().length);
                  setPhase("saved-matches");
                }}
              >
                Saved Matches
                {savedCount > 0 && <span style={H.sheetBadge}>{savedCount}</span>}
              </button>

              <button
                style={H.sheetItem}
                onClick={() => importFileRef.current?.click()}
              >
                Import Match JSON
              </button>

              {actionsImport && (
                <div style={{ ...H.sheetFeedback, color: actionsImport.ok ? "#4ade80" : "#f87171" }}>
                  {actionsImport.text}
                </div>
              )}

              {/* ── Recent match ──────────────────────────────── */}
              {actionsLatest && (
                <>
                  <div style={H.sheetSection}>Recent Match</div>

                  <div style={H.sheetMatchCard}>
                    <span style={H.sheetMatchName}>
                      {actionsLatest.homeTeamName} v {actionsLatest.awayTeamName}
                    </span>
                    <span style={H.sheetMatchMeta}>
                      {actionsLatest.scorelineSnapshot}
                      {" · "}
                      {new Date(actionsLatest.createdAt).toLocaleDateString(undefined, {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  </div>

                  <button
                    style={{
                      ...H.sheetItem,
                      ...((!hasFirstHalfEvents || snapshotBusy !== null) ? H.sheetItemDisabled : {}),
                    }}
                    disabled={!hasFirstHalfEvents || snapshotBusy !== null}
                    onClick={handleHtSnapshot}
                  >
                    {snapshotBusy === "ht" ? "Exporting…" : "HT Snapshot PDF"}
                  </button>

                  <button
                    style={{
                      ...H.sheetItem,
                      ...(snapshotBusy !== null ? H.sheetItemDisabled : {}),
                    }}
                    disabled={snapshotBusy !== null}
                    onClick={handleFtSnapshot}
                  >
                    {snapshotBusy === "ft" ? "Exporting…" : "FT Snapshot PDF"}
                  </button>
                </>
              )}

              <button style={H.sheetClose} onClick={() => setActionsOpen(false)}>
                Close
              </button>

              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Saved matches list ──────────────────────────────────────────────────────

  if (phase === "saved-matches") {
    return (
      <ProTaggerSavedMatchesScreen
        onBack={() => {
          setSavedCount(readProTaggerMatches().length);
          setPhase("home");
        }}
        onOpen={(match: ProTaggerSavedMatch) => {
          const session      = savedMatchToSession(match);
          const restore      = savedMatchToRestoreState(match);
          setDraftSession(session);
          setRestoreState(restore);
          setPhase("live");
        }}
        onReview={(match: ProTaggerSavedMatch) => {
          setReviewMatch(match);
          setPhase("review");
        }}
      />
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────────

  if (phase === "review" && reviewMatch) {
    return (
      <ProTaggerReviewScreen
        match={reviewMatch}
        onBack={() => setPhase("saved-matches")}
      />
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <ProTaggerSetupScreen
        onContinue={(draft) => {
          setRestoreState(undefined);
          setDraftSession(draft);
          setPhase("squads");
        }}
      />
    );
  }

  // ── Squads ──────────────────────────────────────────────────────────────────

  if (phase === "squads" && draftSession) {
    return (
      <ProTaggerSquadScreen
        session={draftSession}
        onBack={() => setPhase("setup")}
        onStart={(finalSession) => {
          setDraftSession(finalSession);
          setPhase("live");
        }}
      />
    );
  }

  // ── Live ────────────────────────────────────────────────────────────────────

  if (phase === "live" && draftSession) {
    return (
      <ProTaggerLiveScreen
        session={draftSession}
        restoreState={restoreState}
        onEnd={() => {
          setDraftSession(null);
          setRestoreState(undefined);
          setSavedCount(readProTaggerMatches().length);
          setPhase("home");
        }}
      />
    );
  }

  return null;
}

// ── Home screen styles ────────────────────────────────────────────────────────

const H: Record<string, CSSProperties> = {
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
    padding: "12px 16px 10px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "-0.4px",
    flex: 1,
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "0 32px 48px",
  },
  logoWrap: {
    marginBottom: 16,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 20,
    display: "block",
    filter: "drop-shadow(0 0 14px rgba(122,255,178,0.18))",
  },
  primaryBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 12,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: 700,
    padding: "18px 0",
    width: "100%",
    maxWidth: 360,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtn: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    color: "#e6edf3",
    fontSize: 17,
    fontWeight: 600,
    padding: "18px 0",
    width: "100%",
    maxWidth: 360,
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  badge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "1px 7px",
    lineHeight: "1.4",
    flexShrink: 0,
  },
  actionsBtn: {
    background: "rgba(56,139,253,0.08)",
    border: "1px solid rgba(56,139,253,0.40)",
    borderRadius: 8,
    color: "#58a6ff",
    fontSize: 13,
    fontWeight: 600,
    padding: "5px 12px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    boxShadow: "0 0 8px rgba(56,139,253,0.10)",
  },
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "flex-end",
    zIndex: 200,
  },
  sheet: {
    background: "#161b22",
    borderTop: "1px solid #30363d",
    borderRadius: "16px 16px 0 0",
    width: "100%",
    padding: "8px 0 32px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    background: "#30363d",
    borderRadius: 2,
    margin: "0 auto 12px",
  },
  sheetHeader: {
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    padding: "0 20px 8px",
  },
  sheetItem: {
    background: "transparent",
    border: "none",
    color: "#e6edf3",
    fontSize: 16,
    fontWeight: 500,
    padding: "14px 20px",
    textAlign: "left" as const,
    cursor: "pointer",
    outline: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  sheetItemDisabled: {
    color: "#484f58",
    cursor: "not-allowed" as const,
  },
  sheetBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 700,
    padding: "1px 7px",
    lineHeight: "1.4",
  },
  sheetSection: {
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    padding: "14px 20px 4px",
  },
  sheetMatchCard: {
    margin: "4px 16px 2px",
    padding: "10px 14px",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  sheetMatchName: {
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "-0.2px",
  },
  sheetMatchMeta: {
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 400,
  },
  sheetFeedback: {
    fontSize: 13,
    fontWeight: 500,
    padding: "6px 20px",
  },
  sheetClose: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 10,
    color: "#8b949e",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 20px",
    margin: "12px 16px 0",
    cursor: "pointer",
    outline: "none",
    textAlign: "center" as const,
  },
};
