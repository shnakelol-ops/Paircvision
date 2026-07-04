import { useState } from "react";
import { getNudgeMessage, markNudgeShownThisSession, shouldShowBackupNudge } from "./backup-nudge";

export function BackupNudgeBanner() {
  const [visible, setVisible] = useState(() => shouldShowBackupNudge());
  const [message] = useState(() => getNudgeMessage());

  if (!visible) return null;

  function dismiss() {
    markNudgeShownThisSession();
    setVisible(false);
  }

  return (
    <div
      className="pf-card pf-card-soft"
      style={{
        marginBottom: "14px",
        borderColor: "rgba(245,166,35,0.45)",
        background: "linear-gradient(180deg, rgba(56,40,12,0.5) 0%, rgba(16,41,27,0.92) 100%)",
      }}
      role="status"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ flex: 1 }}>
          <p className="pf-card-title" style={{ fontSize: "13px", marginBottom: "4px" }}>
            Keep a backup
          </p>
          <p className="pf-card-text" style={{ margin: 0, fontSize: "12px", lineHeight: 1.45 }}>
            {message} Browsers can clear site data —{" "}
            <a href="/settings?view=backup" style={{ color: "var(--pf-primary)", textDecoration: "underline" }}>
              back up everything
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss backup reminder"
          style={{
            flexShrink: 0,
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            border: "1px solid var(--pf-border)",
            background: "rgba(16,41,27,0.7)",
            color: "var(--pf-text-muted)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "14px",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
