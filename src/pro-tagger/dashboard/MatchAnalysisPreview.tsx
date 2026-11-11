/**
 * MatchAnalysisPreview.tsx
 *
 * The one Match Analysis screen: Dashboard / Scoring / Turnovers tabs, an
 * HT / FT selector (only what the match state allows), and — on the two map
 * pages — a selector showing the actual Home and Away team names. The
 * selected team is shared by Scoring and Turnovers, so switching page keeps
 * it. Every page is a 1080 × 1350 PNG rendered on demand (never during live
 * capture), previewed, and handed as the already-built File to the shared
 * ShareSheet (Share Image… / Copy / Save Image) — so navigator.share runs
 * inside the tap's user activation, exactly as the HT / FT dashboard does.
 *
 * Read-only: builds views from the source it is given and never writes to
 * storage or changes the match.
 *
 * Club crests (Club Crest V1): when the screen opens, the Home and Away
 * crests are looked up by Saved Team id and decoded ONCE (bounded by a
 * timeout) before the first page is drawn. That snapshot is used for every
 * page, team and HT / FT choice until the screen closes, so a preview and its
 * shared PNG always show the same crest; a missing or failed crest is simply
 * the monogram. Decoded images are released when the screen closes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ShareSheet } from "../../features/shared/ShareSheet";
import { NO_CRESTS, crestsKey, loadMatchCrests, type LoadedMatchCrests, type MatchCrests } from "../crest/crest-artwork";
import { renderHtFtDashboardPng } from "./htFtDashboardRenderer";
import { buildHtFtDashboardView, dashboardAvailability, dashboardFilename, type DashboardPeriod } from "./htFtDashboardView";
import type { MapTeamSide, MatchMapSource } from "./matchMapPerspective";
import { mapFilename, renderScoringMapPng, renderTurnoverMapPng, type AnalysisPage } from "./matchMapRenderer";
import { buildScoringMapView } from "./scoringMapView";
import { buildTurnoverMapView } from "./turnoverMapView";

export type MatchAnalysisRenderers = {
  dashboard: typeof renderHtFtDashboardPng;
  scoring: typeof renderScoringMapPng;
  turnovers: typeof renderTurnoverMapPng;
};

const DEFAULT_RENDERERS: MatchAnalysisRenderers = {
  dashboard: renderHtFtDashboardPng,
  scoring: renderScoringMapPng,
  turnovers: renderTurnoverMapPng,
};

export type MatchAnalysisPreviewProps = {
  source: MatchMapSource;
  onClose: () => void;
  /** Injectable for tests; defaults to the real canvas renderers. */
  renderers?: Partial<MatchAnalysisRenderers>;
  /** Test seam; the app loads crests from the crest store. */
  loadCrests?: (ids: { home?: string; away?: string }) => Promise<LoadedMatchCrests>;
};

/** Upper bound on waiting for crests before drawing with monograms (the loader has its own, shorter, timeouts). */
export const CREST_SNAPSHOT_TIMEOUT_MS = 5000;

const PAGES: readonly { id: AnalysisPage; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "scoring", label: "Scoring" },
  { id: "turnovers", label: "Turnovers" },
];

const PAGE_TITLES: Record<AnalysisPage, string> = {
  dashboard: "Dashboard",
  scoring: "Scoring Map",
  turnovers: "Turnover Map",
};

type Rendered = { file: File; url: string };
type PreviewState =
  | { phase: "rendering" }
  | { phase: "ready"; file: File; url: string }
  | { phase: "error"; message: string };

/** What the selected page / scope / team renders, plus its file name. Pure. */
export function analysisPageJob(
  source: MatchMapSource,
  page: AnalysisPage,
  scope: DashboardPeriod,
  side: MapTeamSide,
  renderers: MatchAnalysisRenderers,
  crests: MatchCrests = NO_CRESTS,
): { key: string; filename: string; render: () => Promise<File> } {
  const crestKey = crestsKey(crests);
  if (page === "dashboard") {
    const view = buildHtFtDashboardView(source, scope);
    return {
      key: `dashboard:${scope}:${crestKey}`,
      filename: dashboardFilename(view),
      render: () => renderers.dashboard(view, undefined, crests),
    };
  }
  if (page === "scoring") {
    const view = buildScoringMapView(source, side, scope);
    const crest = view.team.role === "HOME" ? crests.home : crests.away;
    return {
      key: `scoring:${scope}:${side}:${crestKey}`,
      filename: mapFilename(view, "scoring"),
      render: () => renderers.scoring(view, undefined, crest),
    };
  }
  const view = buildTurnoverMapView(source, side, scope);
  const crest = view.team.role === "HOME" ? crests.home : crests.away;
  return {
    key: `turnovers:${scope}:${side}:${crestKey}`,
    filename: mapFilename(view, "turnovers"),
    render: () => renderers.turnovers(view, undefined, crest),
  };
}

/**
 * One crest snapshot per screen: null while loading, then fixed. Resolves to
 * monograms if the loader fails or exceeds CREST_SNAPSHOT_TIMEOUT_MS; a late
 * result is released, never applied.
 */
function useCrestSnapshot(
  homeId: string | undefined,
  awayId: string | undefined,
  load: (ids: { home?: string; away?: string }) => Promise<LoadedMatchCrests>,
): MatchCrests | null {
  const [crests, setCrests] = useState<MatchCrests | null>(homeId || awayId ? null : NO_CRESTS);
  useEffect(() => {
    if (!homeId && !awayId) {
      setCrests(NO_CRESTS);
      return;
    }
    let active = true;
    let settled = false;
    let loaded: LoadedMatchCrests | null = null;
    setCrests(null);
    const timer = setTimeout(() => {
      if (settled || !active) return;
      settled = true;
      setCrests(NO_CRESTS);
    }, CREST_SNAPSHOT_TIMEOUT_MS);
    let pending: Promise<LoadedMatchCrests>;
    try {
      pending = load({ home: homeId, away: awayId });
    } catch {
      pending = Promise.reject(new Error("crest loader threw"));
    }
    pending.then(
      (result) => {
        if (!active || settled) {
          result.release();
          return;
        }
        settled = true;
        clearTimeout(timer);
        loaded = result;
        setCrests(result.crests);
      },
      () => {
        if (!active || settled) return;
        settled = true;
        clearTimeout(timer);
        setCrests(NO_CRESTS);
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
      loaded?.release();
    };
  }, [homeId, awayId, load]);
  return crests;
}

export function MatchAnalysisPreview({ source, onClose, renderers, loadCrests = loadMatchCrests }: MatchAnalysisPreviewProps) {
  const r = useMemo(() => ({ ...DEFAULT_RENDERERS, ...renderers }), [renderers]);
  const crests = useCrestSnapshot(source.homeSavedTeamId, source.awaySavedTeamId, loadCrests);
  const available = dashboardAvailability(source.matchState);
  const [page, setPage] = useState<AnalysisPage>("dashboard");
  const [scope, setScope] = useState<DashboardPeriod>(available.ft ? "FT" : "HT");
  // Shared by Scoring and Turnovers: changing page never resets the team.
  const [side, setSide] = useState<MapTeamSide>("FOR");
  const [state, setState] = useState<PreviewState>({ phase: "rendering" });
  const [shareOpen, setShareOpen] = useState(false);

  // Rendered pages are kept for this viewing session, so flicking between
  // tabs / teams doesn't redraw; their object URLs are released on close.
  const cache = useRef(new Map<string, Rendered>());
  useEffect(() => {
    const files = cache.current;
    return () => {
      for (const { url } of files.values()) URL.revokeObjectURL(url);
      files.clear();
    };
  }, []);

  const job = useMemo(
    () => (crests ? analysisPageJob(source, page, scope, side, r, crests) : null),
    [source, page, scope, side, r, crests],
  );

  const canRender = available.ht;
  useEffect(() => {
    let cancelled = false;
    setShareOpen(false);
    if (!canRender) return;
    if (!job) {
      setState({ phase: "rendering" }); // crests still loading (bounded by a timeout)
      return;
    }
    const hit = cache.current.get(job.key);
    if (hit) {
      setState({ phase: "ready", ...hit });
      return;
    }
    setState({ phase: "rendering" });
    job
      .render()
      .then((file) => {
        if (cancelled) return;
        const entry = { file, url: URL.createObjectURL(file) };
        cache.current.set(job.key, entry);
        setState({ phase: "ready", ...entry });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ phase: "error", message: err instanceof Error && err.message ? err.message : "Couldn't create the image." });
      });
    return () => {
      cancelled = true;
    };
  }, [job, canRender]);

  const teamName = side === "FOR" ? source.homeTeamName : source.awayTeamName;
  const scopeWord = scope === "HT" ? "Half-Time" : "Full-Time";
  const pageTitle = PAGE_TITLES[page];
  const shareTitle = `${source.homeTeamName} v ${source.awayTeamName} · ${scopeWord} · ${pageTitle}${page === "dashboard" ? "" : ` · ${teamName}`}`;
  const altText = page === "dashboard" ? `${scope} Dashboard: ${shareTitle}` : `${pageTitle}, ${teamName}, ${scopeWord}`;

  if (!available.ht) {
    return (
      <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Match Analysis">
        <div style={S.header}>
          <button style={S.closeBtn} onClick={onClose}>← Back</button>
          <span style={S.title}>Match Analysis</span>
          <span style={S.headerSpacer} />
        </div>
        <div style={S.body}>
          <span style={S.status}>Match Analysis is available once the first half is complete.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Match Analysis">
      <div style={S.header}>
        <button style={S.closeBtn} onClick={onClose}>← Back</button>
        <span style={S.title}>Match Analysis</span>
        <span style={S.headerSpacer} />
      </div>

      <div style={S.controls}>
        <div style={S.segment} role="tablist" aria-label="Page">
          {PAGES.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={page === p.id}
              style={{ ...S.segBtn, ...(page === p.id ? S.segBtnOn : {}) }}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={S.row}>
          <div style={S.segmentSmall} role="group" aria-label="Half">
            {(["HT", "FT"] as const).map((s) => {
              const enabled = s === "HT" ? available.ht : available.ft;
              return (
                <button
                  key={s}
                  aria-pressed={scope === s}
                  disabled={!enabled}
                  title={enabled ? undefined : "Available once the match is marked Full Time"}
                  style={{ ...S.segBtn, ...(scope === s ? S.segBtnOn : {}), ...(enabled ? {} : S.segBtnOff) }}
                  onClick={() => enabled && setScope(s)}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {page !== "dashboard" && (
            <div style={S.segmentTeams} role="group" aria-label="Team">
              {(["FOR", "OPP"] as const).map((t) => {
                const name = t === "FOR" ? source.homeTeamName : source.awayTeamName;
                return (
                  <button
                    key={t}
                    aria-pressed={side === t}
                    style={{ ...S.segBtn, ...S.teamBtn, ...(side === t ? S.segBtnOn : {}) }}
                    onClick={() => setSide(t)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={S.body}>
        {state.phase === "rendering" && <span style={S.status}>Creating {pageTitle.toLowerCase()}…</span>}
        {state.phase === "error" && <span style={{ ...S.status, color: "#f85149" }}>{state.message}</span>}
        {state.phase === "ready" && <img src={state.url} alt={altText} style={S.image} />}
      </div>

      <div style={S.actions}>
        <button
          style={{ ...S.primaryBtn, ...(state.phase !== "ready" ? S.btnDisabled : {}) }}
          disabled={state.phase !== "ready"}
          onClick={() => setShareOpen(true)}
        >
          Share or Save Image
        </button>
      </div>

      {state.phase === "ready" && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          heading={`Share ${pageTitle}`}
          input={{ getBlob: async () => state.file, filename: state.file.name, title: shareTitle }}
        />
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: { position: "fixed", inset: 0, zIndex: 1000, background: "#060b16", display: "flex", flexDirection: "column" },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px", borderBottom: "1px solid #17324a", flexShrink: 0,
  },
  closeBtn: {
    background: "transparent", border: "1px solid #1c3a52", borderRadius: 8, color: "#dce8f4",
    fontSize: 14, fontWeight: 600, padding: "8px 12px", minHeight: 40, cursor: "pointer",
  },
  title: { color: "#dce8f4", fontSize: 16, fontWeight: 700 },
  headerSpacer: { width: 72 },
  controls: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px 4px", flexShrink: 0 },
  row: { display: "flex", gap: 8, alignItems: "stretch" },
  segment: { display: "flex", background: "#0d1a2b", border: "1px solid #17324a", borderRadius: 12, padding: 3, gap: 3 },
  segmentSmall: { display: "flex", background: "#0d1a2b", border: "1px solid #17324a", borderRadius: 12, padding: 3, gap: 3, flexShrink: 0 },
  segmentTeams: { display: "flex", flex: 1, minWidth: 0, background: "#0d1a2b", border: "1px solid #17324a", borderRadius: 12, padding: 3, gap: 3 },
  segBtn: {
    flex: 1, minHeight: 40, minWidth: 44, border: "none", borderRadius: 9, background: "transparent",
    color: "#9fb3c8", fontSize: 14, fontWeight: 700, padding: "6px 10px", cursor: "pointer",
  },
  segBtnOn: { background: "#1f6f3f", color: "#ffffff" },
  segBtnOff: { opacity: 0.35, cursor: "default" },
  teamBtn: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  body: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 },
  image: {
    maxWidth: "100%", maxHeight: "100%", aspectRatio: "1080 / 1350", objectFit: "contain",
    borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  },
  status: { color: "#7a95ad", fontSize: 15, fontWeight: 600, textAlign: "center", padding: "0 24px" },
  actions: { padding: "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid #17324a", flexShrink: 0 },
  primaryBtn: {
    width: "100%", minHeight: 52, borderRadius: 12, border: "none", background: "#2ea043",
    color: "#ffffff", fontSize: 16, fontWeight: 700, cursor: "pointer",
  },
  btnDisabled: { opacity: 0.45, cursor: "default" },
};
