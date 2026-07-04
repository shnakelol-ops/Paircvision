import type { BackupCounts } from "./backup-types";

function parseJsonArray(raw: string | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function itemId(item: unknown): string | null {
  if (item != null && typeof item === "object" && "id" in item) {
    const id = (item as { id: unknown }).id;
    if (typeof id === "string" && id.trim().length > 0) return id;
  }
  return null;
}

function countUnionById(keys: string[], data: Record<string, string>): number {
  const ids = new Set<string>();
  for (const key of keys) {
    for (const item of parseJsonArray(data[key])) {
      const id = itemId(item);
      if (id) ids.add(`${key}:${id}`);
      else ids.add(`${key}:${JSON.stringify(item)}`);
    }
  }
  return ids.size;
}

export function computeBackupCounts(data: Record<string, string>): BackupCounts {
  return {
    matches: countUnionById(["pitchflow_matches_v1", "pitchflow_pro_tagger_matches_v1"], data),
    boards: parseJsonArray(data["pitchflow_quickboard_boards_v1"]).length,
    plays: parseJsonArray(data["paircvision-tp-scenarios"]).length,
    squads: countUnionById(
      [
        "pitchflow_saved_squads_v1",
        "paircvision_training_saved_squads_v1",
        "pitchside.player-performance-tracker.squads.v1",
      ],
      data,
    ),
    sessions: parseJsonArray(data["paircvision_training_sessions_v1"]).length,
    notes:
      parseJsonArray(data["pitchflow_coach_notes_v1"]).length +
      parseJsonArray(data["pitchflow_written_notes_v1"]).length,
  };
}

export function formatCountsSummary(counts: BackupCounts): string {
  const parts = [
    `${counts.matches} match${counts.matches === 1 ? "" : "es"}`,
    `${counts.boards} board${counts.boards === 1 ? "" : "s"}`,
    `${counts.plays} play${counts.plays === 1 ? "" : "s"}`,
    `${counts.squads} squad${counts.squads === 1 ? "" : "s"}`,
  ];
  if (counts.sessions > 0) {
    parts.push(`${counts.sessions} session${counts.sessions === 1 ? "" : "s"}`);
  }
  if (counts.notes > 0) {
    parts.push(`${counts.notes} note${counts.notes === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hasMeaningfulBackupData(data: Record<string, string>): boolean {
  const counts = computeBackupCounts(data);
  return counts.matches >= 1 || counts.boards >= 1;
}
