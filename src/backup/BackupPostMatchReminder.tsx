const SETTINGS_BACKUP_PATH = "/settings?view=backup";

export function BackupPostMatchReminder() {
  return (
    <p
      style={{
        margin: "10px 0 0",
        fontSize: "12px",
        lineHeight: 1.45,
        color: "var(--pf-text-dim, #65736C)",
        textAlign: "center",
      }}
    >
      Backed up? Your data lives only on this phone.{" "}
      <a
        href={SETTINGS_BACKUP_PATH}
        style={{ color: "var(--pf-primary, #7CFF72)", textDecoration: "underline" }}
      >
        Back up everything
      </a>
    </p>
  );
}

export function BackupPostMatchReminderDark() {
  return (
    <p
      style={{
        margin: "12px 0 0",
        fontSize: "12px",
        lineHeight: 1.45,
        color: "#8b949e",
        textAlign: "center",
        maxWidth: "280px",
      }}
    >
      Backed up? Your data lives only on this phone.{" "}
      <a href={SETTINGS_BACKUP_PATH} style={{ color: "#7ee787", textDecoration: "underline" }}>
        Back up everything
      </a>
    </p>
  );
}
