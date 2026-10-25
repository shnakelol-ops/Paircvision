import type { CSSProperties } from "react";
import { useSWUpdate } from "./useSWUpdate";

const BANNER: CSSProperties = {
  position: "fixed",
  bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  gap: "16px",
  background: "#0a1628",
  border: "1px solid #1b3a5c",
  borderRadius: "14px",
  padding: "12px 16px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.55)",
  pointerEvents: "auto",
  minWidth: "260px",
  maxWidth: "calc(100vw - 32px)",
  boxSizing: "border-box",
};

const LABELS: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  flex: 1,
};

const TITLE: CSSProperties = {
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  color: "#F0F5FF",
  lineHeight: 1.3,
};

const SUB: CSSProperties = {
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  fontSize: "11px",
  color: "#8A9CB8",
};

const BTN: CSSProperties = {
  flexShrink: 0,
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  fontSize: "13px",
  fontWeight: 700,
  padding: "8px 16px",
  borderRadius: "10px",
  border: "none",
  background: "rgba(59,130,246,0.14)",
  color: "rgba(99,160,255,0.95)",
  outline: "1px solid rgba(59,130,246,0.25)",
  cursor: "pointer",
  minHeight: "44px",
  whiteSpace: "nowrap",
};

export function PwaUpdateBanner() {
  const { updateReady, apply } = useSWUpdate();
  if (!updateReady) return null;

  return (
    <div style={BANNER} role="status" aria-live="polite">
      <div style={LABELS}>
        <span style={TITLE}>New PáircVision version available</span>
        <span style={SUB}>Update now</span>
      </div>
      <button type="button" style={BTN} onClick={apply}>
        Update
      </button>
    </div>
  );
}
