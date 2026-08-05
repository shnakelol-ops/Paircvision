/**
 * ShareSheet.tsx
 *
 * The one reusable Share UI for PáircVision. Every surface (Tactical Slate,
 * Tactical Play, stats pitch/map review, Intelligence Pack cards, existing
 * report cards) opens this with only a small `ShareImageInput` — no surface
 * re-implements capture/share/copy/save logic; that all lives in
 * imageShare.ts and is called from here.
 *
 * Deliberately does not offer named Instagram/TikTok/WhatsApp/X/Facebook
 * buttons: a web PWA cannot guarantee any of those destinations receives the
 * file (navigator.share opens the OS's own share sheet, whose contents the
 * page does not control), so a named button would imply an integration that
 * doesn't exist. See docs/unified-share-audit.md §3 and §7.
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  canWriteImageToClipboard,
  copyImageFile,
  createCachedBlobFileResolver,
  saveImageFile,
  shareImageFile,
  type ShareImageInput,
} from "./imageShare";

export type ShareSheetProps = {
  open: boolean;
  onClose: () => void;
  input: ShareImageInput;
  /** Optional heading shown at the top of the sheet, e.g. the surface name. */
  heading?: string;
};

type RowStatus =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

const IDLE: RowStatus = { phase: "idle" };

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SaveGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareSheet({ open, onClose, input, heading }: ShareSheetProps) {
  // Kept fresh every render so the resolver always calls the latest capture
  // function, without needing to recreate the resolver (and lose its cache)
  // on every incidental re-render.
  const inputRef = useRef(input);
  inputRef.current = input;

  const resolverRef = useRef(
    createCachedBlobFileResolver({
      getBlob: () => inputRef.current.getBlob(),
      filename: input.filename,
    }),
  );
  const prevOpenRef = useRef(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<RowStatus>(IDLE);
  const [copyStatus, setCopyStatus] = useState<RowStatus>(IDLE);
  const [saveStatus, setSaveStatus] = useState<RowStatus>(IDLE);

  // Cache the captured Blob for the lifetime of one open share session so
  // tapping Share, Copy, then Save doesn't recapture the surface three
  // times. A fresh resolver (and therefore a fresh capture) is created every
  // time the sheet transitions from closed to open, so closing the sheet —
  // or the underlying surface changing before the next open — never reuses
  // a stale image.
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      resolverRef.current = createCachedBlobFileResolver({
        getBlob: () => inputRef.current.getBlob(),
        filename: inputRef.current.filename,
      });
      setCaptureError(null);
      setShareStatus(IDLE);
      setCopyStatus(IDLE);
      setSaveStatus(IDLE);
    } else if (!open) {
      resolverRef.current.reset();
    }
    prevOpenRef.current = open;
  }, [open]);

  async function ensureFile(): Promise<File | null> {
    const { file, message } = await resolverRef.current.resolve();
    setCaptureError(message);
    return file;
  }

  async function handleShareImage() {
    setShareStatus({ phase: "working" });
    const file = await ensureFile();
    if (!file) {
      setShareStatus(IDLE);
      return;
    }
    const outcome = await shareImageFile(file, { title: input.title, text: input.text });
    if (outcome.status === "shared") {
      setShareStatus({ phase: "done", message: "Shared" });
      onClose();
      return;
    }
    if (outcome.status === "cancelled") {
      // Cancellation is not a failure — return to idle silently.
      setShareStatus(IDLE);
      return;
    }
    setShareStatus({ phase: "error", message: outcome.message });
  }

  async function handleCopyImage() {
    setCopyStatus({ phase: "working" });
    const file = await ensureFile();
    if (!file) {
      setCopyStatus(IDLE);
      return;
    }
    const outcome = await copyImageFile(file);
    if (outcome.status === "copied") {
      setCopyStatus({ phase: "done", message: "Copied" });
      return;
    }
    setCopyStatus({ phase: "error", message: outcome.message });
  }

  async function handleSaveImage() {
    setSaveStatus({ phase: "working" });
    const file = await ensureFile();
    if (!file) {
      setSaveStatus(IDLE);
      return;
    }
    const outcome = await saveImageFile(file);
    if (outcome.status === "saved") {
      setSaveStatus({ phase: "done", message: "Saved" });
      return;
    }
    setSaveStatus({ phase: "error", message: outcome.message });
  }

  if (!open) return null;

  const clipboardUnsupported = !canWriteImageToClipboard();

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Share">
      <div style={S.sheet}>
        <div style={S.header}>
          <span style={S.title}>{heading ?? "Share"}</span>
          <button type="button" style={S.closeBtn} onClick={onClose} aria-label="Close share menu">
            ✕
          </button>
        </div>

        {captureError ? <p style={S.captureError}>{captureError}</p> : null}

        <ShareRow
          icon={<ShareGlyph />}
          label="Share Image…"
          subtext="Share through Instagram, TikTok, WhatsApp, X, Facebook and other installed apps."
          status={shareStatus}
          onClick={() => void handleShareImage()}
        />
        <ShareRow
          icon={<CopyGlyph />}
          label="Copy Image"
          status={copyStatus}
          disabledHint={clipboardUnsupported ? "Copying images isn't supported in this browser." : undefined}
          onClick={() => void handleCopyImage()}
        />
        <ShareRow
          icon={<SaveGlyph />}
          label="Save Image"
          status={saveStatus}
          onClick={() => void handleSaveImage()}
        />
      </div>
    </div>
  );
}

function ShareRow({
  icon,
  label,
  subtext,
  status,
  disabledHint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  subtext?: string;
  status: RowStatus;
  disabledHint?: string;
  onClick: () => void;
}) {
  const working = status.phase === "working";
  let statusText: string | null = null;
  let statusColor = "#8b949e";
  if (working) {
    statusText = "Working…";
  } else if (status.phase === "done") {
    statusText = status.message;
    statusColor = "#3fb950";
  } else if (status.phase === "error") {
    statusText = status.message;
    statusColor = "#f85149";
  } else if (disabledHint) {
    statusText = disabledHint;
  }

  return (
    <button type="button" style={S.row} onClick={onClick} disabled={working}>
      <span style={S.rowIcon}>{icon}</span>
      <span style={S.rowBody}>
        <span style={S.rowLabel}>{label}</span>
        {subtext ? <span style={S.rowSubtext}>{subtext}</span> : null}
        {statusText ? <span style={{ ...S.rowStatus, color: statusColor }}>{statusText}</span> : null}
      </span>
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.55)",
    zIndex: 1200,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
  },
  sheet: {
    width: "100%",
    maxWidth: "480px",
    background: "#0d1117",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
    padding: "14px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 -12px 48px rgba(0, 0, 0, 0.55)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderBottom: "none",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  title: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#e6edf3",
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    color: "#9ca3af",
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  captureError: {
    fontSize: "12px",
    color: "#f85149",
    margin: "0 0 8px",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "12px 8px",
    background: "transparent",
    border: "none",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    color: "#e6edf3",
    textAlign: "left",
    cursor: "pointer",
  },
  rowIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    color: "#e6edf3",
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  rowLabel: {
    fontSize: "15px",
    fontWeight: 600,
  },
  rowSubtext: {
    fontSize: "11px",
    color: "#8b949e",
    lineHeight: 1.4,
  },
  rowStatus: {
    fontSize: "11px",
    fontWeight: 600,
  },
};
