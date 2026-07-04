import { useRef, useState } from "react";
import {
  buildBackupFile,
  estimateBackupBytes,
  formatBackupFilename,
  parseBackupFile,
  shareOrDownloadBackup,
  triggerBackupDownload,
} from "./backup-export";
import { formatBytes, formatCountsSummary } from "./backup-counts";
import { getCurrentDeviceCounts, restoreBackupReplace } from "./backup-import";
import { setLastBackupAt } from "./backup-meta";
import type { BackupFile } from "./backup-types";

type Props = {
  onBack: () => void;
};

type RestoreStep = "idle" | "confirm" | "restoring";

export function BackupRestoreView({ onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null);
  const [restoreStep, setRestoreStep] = useState<RestoreStep>("idle");
  const [confirmText, setConfirmText] = useState("");

  const deviceCounts = getCurrentDeviceCounts();

  async function handleExport() {
    setError(null);
    setStatus(null);
    setExporting(true);
    try {
      const file = buildBackupFile();
      const sizeLabel = formatBytes(estimateBackupBytes(file));
      const summary = formatCountsSummary(file.counts);
      await shareOrDownloadBackup(file);
      setLastBackupAt(Date.now());
      setStatus(`Backup ready — ${summary}. Size: ${sizeLabel}.`);
    } catch {
      setError("Backup failed. Try again or use Download instead.");
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadOnly() {
    setError(null);
    setStatus(null);
    try {
      const file = buildBackupFile();
      triggerBackupDownload(file);
      setLastBackupAt(Date.now());
      setStatus(`Downloaded ${formatBackupFilename()} — ${formatCountsSummary(file.counts)}.`);
    } catch {
      setError("Download failed.");
    }
  }

  function handlePickRestoreFile() {
    setError(null);
    setStatus(null);
    setPendingRestore(null);
    setRestoreStep("idle");
    setConfirmText("");
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseBackupFile(raw);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      setPendingRestore(parsed.file);
      setRestoreStep("confirm");
      setConfirmText("");
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(picked);
  }

  function handleCancelRestore() {
    setPendingRestore(null);
    setRestoreStep("idle");
    setConfirmText("");
  }

  function handleSafetyCopyDownload() {
    if (!pendingRestore) return;
    try {
      const safety = buildBackupFile();
      triggerBackupDownload(safety, `safety-copy-before-restore-${formatBackupFilename()}`);
      setStatus("Safety copy downloaded. You can now restore when ready.");
    } catch {
      setError("Safety copy download failed.");
    }
  }

  function handleConfirmRestore() {
    if (!pendingRestore || confirmText !== "REPLACE") return;
    setRestoreStep("restoring");
    setError(null);

    try {
      const safety = buildBackupFile();
      triggerBackupDownload(safety, `safety-copy-before-restore-${formatBackupFilename()}`);
    } catch {
      setError("Could not create safety copy. Restore cancelled.");
      setRestoreStep("confirm");
      return;
    }

    const result = restoreBackupReplace(pendingRestore);
    if (!result.ok) {
      setError(`Restore failed — nothing was changed. ${result.error}`);
      setRestoreStep("confirm");
      return;
    }

    window.location.reload();
  }

  const backupCreatedLabel = pendingRestore
    ? new Date(pendingRestore.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <>
      <header className="ps-header">
        <button type="button" className="ps-header-back" onClick={onBack} aria-label="Back to settings">
          ←
        </button>
        <h1 className="ps-header-title">Backup &amp; Restore</h1>
      </header>

      <div className="ps-scroll">
        <div className="ps-info-card" style={{ marginBottom: "16px" }}>
          <p className="ps-info-card-label">Your data lives only on this phone. Keep a copy.</p>
          <p className="ps-info-card-body">
            One tap creates a single file containing every match, board, play, squad and note. Save it
            to your own Google Drive, iCloud or Files — PáircVision never sees it. To move to a new
            phone, just restore the file.
          </p>
        </div>

        <p className="ps-section-label">Back up</p>
        <div className="ps-info-card">
          <p className="ps-info-card-body" style={{ marginBottom: "12px" }}>
            This device currently has{" "}
            <strong>{formatCountsSummary(deviceCounts)}</strong>.
          </p>
          <button
            type="button"
            className="ps-primary-btn"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? "Preparing backup…" : "Back Up Everything"}
          </button>
          <button
            type="button"
            className="ps-secondary-btn"
            style={{ marginTop: "10px" }}
            onClick={handleDownloadOnly}
            disabled={exporting}
          >
            Download backup file
          </button>
        </div>

        <p className="ps-section-label" style={{ marginTop: "20px" }}>
          Restore
        </p>
        <div className="ps-info-card">
          <p className="ps-info-card-body" style={{ marginBottom: "12px" }}>
            Restoring replaces everything currently in PáircVision on this phone with the backup&apos;s
            contents. Merge is not available.
          </p>
          <button type="button" className="ps-secondary-btn" onClick={handlePickRestoreFile}>
            Restore from Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pvbackup,application/json"
            style={{ display: "none" }}
            onChange={handleFileSelected}
          />
        </div>

        {restoreStep === "confirm" && pendingRestore ? (
          <div className="ps-note" style={{ marginTop: "16px" }}>
            <p className="ps-note-title">Review before restore</p>
            <p className="ps-note-body">
              Backup from <strong>{backupCreatedLabel}</strong> ({pendingRestore.device}) contains{" "}
              <strong>{formatCountsSummary(pendingRestore.counts)}</strong>.
            </p>
            <p className="ps-note-body" style={{ marginTop: "8px" }}>
              This device currently has <strong>{formatCountsSummary(deviceCounts)}</strong>.
            </p>
            <p className="ps-note-body" style={{ marginTop: "8px" }}>
              Restoring replaces everything currently in PáircVision on this phone.
            </p>
            <button
              type="button"
              className="ps-secondary-btn"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={handleSafetyCopyDownload}
            >
              Download safety copy of this device first
            </button>
            <label className="ps-info-card-body" style={{ display: "block", marginTop: "14px" }}>
              Type <strong>REPLACE</strong> to confirm:
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--ps-border)",
                  background: "rgba(3,16,11,0.6)",
                  color: "var(--ps-text)",
                  fontFamily: "inherit",
                  fontSize: "14px",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button type="button" className="ps-secondary-btn" style={{ flex: 1 }} onClick={handleCancelRestore}>
                Cancel
              </button>
              <button
                type="button"
                className="ps-primary-btn"
                style={{
                  flex: 1,
                  borderColor: "rgba(248,113,113,0.72)",
                  background: confirmText === "REPLACE" ? "rgba(127,29,29,0.55)" : undefined,
                }}
                disabled={confirmText !== "REPLACE" || restoreStep === "restoring"}
                onClick={handleConfirmRestore}
              >
                {restoreStep === "restoring" ? "Restoring…" : "Replace & Restore"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="ps-note" style={{ marginTop: "20px" }}>
          <p className="ps-note-title">What&apos;s not included (Phase 1)</p>
          <ul className="ps-legal-ul" style={{ marginTop: "8px" }}>
            <li className="ps-legal-li">
              <strong>Audio notes</strong> are not included in backups yet (stored separately in
              IndexedDB).
            </li>
            <li className="ps-legal-li">
              <strong>Rapid Capture</strong> is not backed up — sessions are not saved to this phone
              today.
            </li>
          </ul>
          <p className="ps-note-body" style={{ marginTop: "10px" }}>
            Browsers can clear site data without warning. Your backup file is the defence — keep a
            copy somewhere you control.
          </p>
        </div>

        {status ? (
          <p className="ps-info-card-body" style={{ marginTop: "16px", color: "var(--ps-primary)" }}>
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="ps-info-card-body" style={{ marginTop: "16px", color: "#f87171" }}>
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
