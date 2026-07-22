import { useRef, useState } from "react";
import { BACKUP_DOMAINS } from "./backup-domains";
import { formatDomainCount } from "./backup-guard";
import { buildBackupFile, formatBackupFilename, triggerBackupDownload, UNSUPPORTED_DOMAINS } from "./backup-build";
import { parseBackupFile } from "./backup-validate";
import { restoreBackupReplace } from "./backup-restore";
import { getLastBackupAt, setLastBackupAt } from "./backup-meta";
import type { BackupFile } from "./backup-types";

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summaryRows(file: BackupFile): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const domain of BACKUP_DOMAINS) {
    const value = file.summary.domains[domain.id];
    if (value === undefined) continue;
    if (typeof value === "number") {
      if (value === 0) continue; // an empty domain isn't worth a summary line
      rows.push({ label: domain.label, value: formatDomainCount(domain, value) });
    } else {
      rows.push({ label: domain.label, value });
    }
  }
  return rows;
}

type BackupState = { status: "idle" } | { status: "building" } | { status: "success"; filename: string } | { status: "error"; message: string };

type RestoreStage =
  | { stage: "idle" }
  | { stage: "invalid"; message: string }
  | { stage: "preview"; file: BackupFile; rawText: string }
  | { stage: "confirming"; file: BackupFile; rawText: string }
  | { stage: "restoring" }
  | { stage: "success" }
  | { stage: "error"; message: string; rolledBack: boolean; rollbackMessage?: string };

export default function BackupRestoreView({ onBack }: { onBack: () => void }) {
  const [backupState, setBackupState] = useState<BackupState>({ status: "idle" });
  const [lastBackupAt, setLastBackupAtState] = useState<number | null>(() => getLastBackupAt());
  const [restore, setRestore] = useState<RestoreStage>({ stage: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInFlightRef = useRef(false);

  // Cheap (a handful of localStorage reads) — recomputed on every render so
  // the summary never goes stale, e.g. after coming back to this screen
  // having saved a match in another tab.
  const previewFile = buildBackupFile();

  function handleCreateBackup() {
    if (backupState.status === "building") return; // prevent duplicate triggers
    setBackupState({ status: "building" });
    try {
      const now = new Date();
      const file = buildBackupFile(localStorage, { now });
      const filename = formatBackupFilename(now);
      triggerBackupDownload(file, filename);
      setLastBackupAt(now.getTime());
      setLastBackupAtState(now.getTime());
      setBackupState({ status: "success", filename });
    } catch (error) {
      setBackupState({
        status: "error",
        message: error instanceof Error ? error.message : "Backup could not be generated.",
      });
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-selecting the same file after a failed/cancelled attempt
    if (!file) return;
    setRestore({ stage: "idle" });
    file
      .text()
      .then((text) => {
        const parsed = parseBackupFile(text);
        if (!parsed.ok) {
          setRestore({ stage: "invalid", message: parsed.error.message });
          return;
        }
        setRestore({ stage: "preview", file: parsed.file, rawText: text });
      })
      .catch(() => setRestore({ stage: "invalid", message: "This file could not be read." }));
  }

  function handleConfirmRestore() {
    if (restore.stage !== "preview") return;
    setRestore({ stage: "confirming", file: restore.file, rawText: restore.rawText });
  }

  function handleCancelRestore() {
    setRestore({ stage: "idle" });
  }

  function handlePerformRestore() {
    if (restore.stage !== "confirming" || restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    setRestore({ stage: "restoring" });
    try {
      const outcome = restoreBackupReplace(restore.file, localStorage);
      // Always offer the safety copy — win or lose, the coach's pre-restore state was captured.
      triggerBackupDownload(outcome.safetyBackup, `paircvision-safety-copy-${formatBackupFilename(new Date()).replace("paircvision-backup-", "")}`);
      if (outcome.ok) {
        setRestore({ stage: "success" });
        window.setTimeout(() => window.location.reload(), 1200);
      } else {
        setRestore({ stage: "error", message: outcome.message, rolledBack: outcome.rolledBack, rollbackMessage: outcome.rollbackMessage });
      }
    } catch (error) {
      setRestore({
        stage: "error",
        message: error instanceof Error ? error.message : "Restore failed unexpectedly.",
        rolledBack: false,
      });
    } finally {
      restoreInFlightRef.current = false;
    }
  }

  return (
    <>
      <SubHeaderLocal title="Backup & Restore" onBack={onBack} />
      <div className="ps-scroll">
        <p className="ps-legal-p" style={{ marginBottom: "16px" }}>
          PáircVision keeps everything on this device — there is no cloud account. A backup file is
          the only way to protect your matches, boards and training records against a lost, reset,
          or replaced device.
        </p>

        {/* ── Backup ─────────────────────────────────────────────────────── */}
        <p className="ps-section-label">Create a backup</p>

        <div className="ps-perm-list" style={{ marginBottom: "14px" }}>
          {summaryRows(previewFile).length === 0 ? (
            <div className="ps-perm-item">
              <span className="ps-perm-dot ps-perm-dot--blue" aria-hidden="true" />
              <span>
                <span className="ps-perm-item-title">Nothing to back up yet</span>
                <span className="ps-perm-item-body">
                  Once you save a match, board, or session, it will appear here.
                </span>
              </span>
            </div>
          ) : (
            summaryRows(previewFile).map((row) => (
              <div className="ps-perm-item" key={row.label}>
                <span className="ps-perm-dot ps-perm-dot--green" aria-hidden="true" />
                <span>
                  <span className="ps-perm-item-title">{row.label}</span>
                  <span className="ps-perm-item-body">{row.value}</span>
                </span>
              </div>
            ))
          )}
          <div className="ps-perm-item">
            <span className="ps-perm-dot ps-perm-dot--amber" aria-hidden="true" />
            <span>
              <span className="ps-perm-item-title">Not included</span>
              <span className="ps-perm-item-body">{UNSUPPORTED_DOMAINS.join(" ")}</span>
            </span>
          </div>
        </div>

        <p className="ps-legal-p" style={{ fontSize: "12px", marginBottom: "10px" }}>
          {lastBackupAt != null
            ? `Last backup created: ${formatTimestamp(lastBackupAt)}`
            : "No backup created yet on this device."}
        </p>

        <div className="ps-btn-row" style={{ marginBottom: "22px" }}>
          <button type="button" className="ps-btn" onClick={handleCreateBackup} disabled={backupState.status === "building"}>
            {backupState.status === "building" ? "Preparing backup…" : "Create Backup"}
          </button>
          {backupState.status === "success" && (
            <p className="ps-backup-status ps-backup-status--success">
              Downloaded {backupState.filename}. This file is now on your device wherever your
              browser saves downloads — PáircVision cannot confirm it stays there, so store or share
              it somewhere safe.
            </p>
          )}
          {backupState.status === "error" && (
            <p className="ps-backup-status ps-backup-status--error">Backup failed: {backupState.message}</p>
          )}
        </div>

        {/* ── Restore ────────────────────────────────────────────────────── */}
        <p className="ps-section-label">Restore from a backup</p>
        <p className="ps-legal-p" style={{ fontSize: "12px", marginBottom: "10px" }}>
          Restoring replaces every supported PáircVision data type on this device with what's in the
          backup file — including resetting anything the backup doesn't contain back to empty. This
          cannot be undone from within the app, though a safety copy of your current data is created
          automatically before anything is replaced.
        </p>

        {restore.stage === "idle" || restore.stage === "invalid" ? (
          <div className="ps-btn-row">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pvbackup,application/json"
              onChange={handleFileSelected}
              style={{ display: "none" }}
            />
            <button type="button" className="ps-btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Choose Backup File
            </button>
            {restore.stage === "invalid" && (
              <p className="ps-backup-status ps-backup-status--error">{restore.message}</p>
            )}
          </div>
        ) : null}

        {restore.stage === "preview" || restore.stage === "confirming" ? (
          <div className="ps-backup-preview">
            <p className="ps-perm-item-title" style={{ marginBottom: "6px" }}>
              Backup from {new Date(restore.file.createdAt).toLocaleString()} (version {restore.file.version})
            </p>
            <div className="ps-perm-list" style={{ marginBottom: "10px" }}>
              {summaryRows(restore.file).length === 0 ? (
                <div className="ps-perm-item">
                  <span className="ps-perm-dot ps-perm-dot--blue" aria-hidden="true" />
                  <span className="ps-perm-item-body">This backup file contains no supported data.</span>
                </div>
              ) : (
                summaryRows(restore.file).map((row) => (
                  <div className="ps-perm-item" key={row.label}>
                    <span className="ps-perm-dot ps-perm-dot--green" aria-hidden="true" />
                    <span>
                      <span className="ps-perm-item-title">{row.label}</span>
                      <span className="ps-perm-item-body">{row.value}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="ps-legal-p" style={{ fontSize: "12px" }}>{UNSUPPORTED_DOMAINS.join(" ")}</p>

            {restore.stage === "preview" ? (
              <div className="ps-btn-row" style={{ marginTop: "10px" }}>
                <button type="button" className="ps-btn" onClick={handleConfirmRestore}>
                  Restore This Backup
                </button>
                <button type="button" className="ps-btn-secondary" onClick={handleCancelRestore}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="ps-backup-warning">
                <p className="ps-perm-item-title" style={{ color: "var(--ps-warning)" }}>
                  This will replace your current PáircVision data
                </p>
                <p className="ps-perm-item-body">
                  Every supported data type on this device will be overwritten with the contents of
                  this backup. A safety copy of what's currently on this device downloads
                  automatically the moment you confirm, before anything is replaced.
                </p>
                <div className="ps-btn-row" style={{ marginTop: "10px" }}>
                  <button type="button" className="ps-btn" onClick={handlePerformRestore}>
                    Yes, Replace My Data
                  </button>
                  <button type="button" className="ps-btn-secondary" onClick={handleCancelRestore}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {restore.stage === "restoring" && (
          <p className="ps-backup-status">Restoring — do not close this page…</p>
        )}
        {restore.stage === "success" && (
          <p className="ps-backup-status ps-backup-status--success">Restore complete. Reloading…</p>
        )}
        {restore.stage === "error" && (
          <div className="ps-backup-status ps-backup-status--error">
            <p style={{ margin: 0 }}>Restore failed: {restore.message}</p>
            <p style={{ margin: "6px 0 0" }}>
              {restore.rolledBack
                ? "Your previous data was restored — nothing was lost."
                : (restore.rollbackMessage ?? "Rollback could not be fully verified — use the safety copy that was just downloaded to recover manually.")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function SubHeaderLocal({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="ps-header">
      <button type="button" className="ps-header-back" onClick={onBack} aria-label="Go back">
        ←
      </button>
      <h1 className="ps-header-title">{title}</h1>
    </div>
  );
}
