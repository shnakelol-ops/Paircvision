/**
 * HtFtDashboardPreview.tsx
 *
 * Fullscreen preview for the portrait HT / FT dashboard PNG. Renders the
 * image once when opened (on demand — never during live capture), shows it,
 * and hands the already-built File to the shared ShareSheet (Share Image…,
 * Copy, Save Image). Because the image already exists when the coach taps
 * Share, navigator.share runs inside that tap's user activation.
 */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ShareSheet } from "../../features/shared/ShareSheet";
import { renderHtFtDashboardPng } from "./htFtDashboardRenderer";
import type { HtFtDashboardView } from "./htFtDashboardView";

export type HtFtDashboardPreviewProps = {
  view: HtFtDashboardView;
  onClose: () => void;
  /** Injectable for tests; defaults to the real canvas renderer. */
  render?: (view: HtFtDashboardView) => Promise<File>;
};

type PreviewState =
  | { phase: "rendering" }
  | { phase: "ready"; file: File; url: string }
  | { phase: "error"; message: string };

export function HtFtDashboardPreview({ view, onClose, render = renderHtFtDashboardPng }: HtFtDashboardPreviewProps) {
  const [state, setState] = useState<PreviewState>({ phase: "rendering" });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ phase: "rendering" });
    render(view)
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setState({ phase: "ready", file, url });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message: err instanceof Error && err.message ? err.message : "Couldn't create the dashboard image.",
        });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [view, render]);

  const title = `${view.home.name} v ${view.away.name} · ${view.period === "HT" ? "Half-Time" : "Full-Time"}`;
  const heading = view.period === "HT" ? "HT Dashboard" : "FT Dashboard";

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label={heading}>
      <div style={S.header}>
        <button style={S.closeBtn} onClick={onClose}>← Back</button>
        <span style={S.title}>{heading}</span>
        <span style={S.headerSpacer} />
      </div>

      <div style={S.body}>
        {state.phase === "rendering" && <span style={S.status}>Creating dashboard…</span>}
        {state.phase === "error" && <span style={{ ...S.status, color: "#f85149" }}>{state.message}</span>}
        {state.phase === "ready" && (
          <img src={state.url} alt={`${heading}: ${title}`} style={S.image} />
        )}
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
          heading={heading}
          input={{
            getBlob: async () => state.file,
            filename: state.file.name,
            title,
          }}
        />
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "#060b16",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#dce8f4",
    fontSize: 14,
    fontWeight: 600,
    padding: "8px 12px",
    minHeight: 40,
    cursor: "pointer",
  },
  title: {
    color: "#dce8f4",
    fontSize: 16,
    fontWeight: 700,
  },
  headerSpacer: { width: 72 },
  body: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  image: {
    maxWidth: "100%",
    maxHeight: "100%",
    aspectRatio: "1080 / 1350",
    objectFit: "contain",
    borderRadius: 12,
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  },
  status: {
    color: "#7a95ad",
    fontSize: 15,
    fontWeight: 600,
  },
  actions: {
    padding: "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))",
    borderTop: "1px solid #17324a",
    flexShrink: 0,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 12,
    border: "none",
    background: "#2ea043",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "default",
  },
};
