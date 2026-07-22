/**
 * The single source of truth for what a whole-app PáircVision backup
 * protects. Every domain here is a named, durable, user-created data set —
 * not a blind sweep of every localStorage key sharing a prefix.
 *
 * Storage keys are copied verbatim from each domain's own module (cited in
 * each entry's comment below) rather than importing them, so this file has
 * no dependency on any feature module and adding a domain here can never
 * accidentally change that feature's own behaviour. backup-domains.test.ts
 * proves each key actually matches its real owning module by round-tripping
 * through the real save/read functions, not just comparing string literals.
 *
 * Deliberately excluded (see docs/BACKUP_MANIFEST.md for the full audit):
 *  - in-progress/active session drafts (crash-recovery state for the
 *    CURRENT session on THIS device, not durable content to carry to
 *    another device or time)
 *  - `paircvision.reviewSession.v1.last` (write-only cache, never read back)
 *  - `pitchflow_pro_tagger_matches_backup_v1` (internal safety copy for the
 *    one-time coordinate-repair tool, not user-facing content)
 *  - IndexedDB voice-note audio blobs (declared unsupported in the backup
 *    summary instead; see backup-build.ts)
 */

export type BackupDomainKind = "json-array" | "raw-string";

export type BackupDomainDescriptor = {
  /** Stable identifier used as the key inside a backup file's `data` object — independent of the underlying storageKey so an internal key rename never breaks old backups. */
  id: string;
  /** Shown in backup/restore summaries. */
  label: string;
  storageKey: string;
  kind: BackupDomainKind;
  /** Singular/plural noun used to render a count, e.g. "match"/"matches". Only meaningful for "json-array" domains. */
  noun?: [singular: string, plural: string];
};

export const BACKUP_DOMAINS: readonly BackupDomainDescriptor[] = [
  // core/stats/saved-match.ts — SAVED_MATCHES_STORAGE_KEY
  {
    id: "matchStatsSavedMatches",
    label: "Match Stats saved matches",
    storageKey: "pitchflow_matches_v1",
    kind: "json-array",
    noun: ["match", "matches"],
  },
  // StatsModeSurface.tsx — SQUADS_STORAGE_KEY (current/default squad roster setup)
  {
    id: "matchStatsCurrentSquad",
    label: "Match Stats current squad setup",
    storageKey: "pitchsideclub.squads",
    kind: "json-array",
    noun: ["squad", "squads"],
  },
  // core/stats/saved-match.ts — SAVED_SQUADS_STORAGE_KEY (shared: Match Stats + Pro Tagger)
  {
    id: "savedSquadTemplates",
    label: "Saved squad templates",
    storageKey: "pitchflow_saved_squads_v1",
    kind: "json-array",
    noun: ["squad template", "squad templates"],
  },
  // pro-tagger/pro-tagger-storage.ts — PRO_TAGGER_MATCHES_STORAGE_KEY
  {
    id: "proTaggerMatches",
    label: "Event Stats (Pro Tagger) matches",
    storageKey: "pitchflow_pro_tagger_matches_v1",
    kind: "json-array",
    noun: ["match", "matches"],
  },
  // rapid-capture/rapid-capture-storage.ts — RAPID_CAPTURE_MATCHES_STORAGE_KEY
  {
    id: "rapidCaptureMatches",
    label: "Rapid Capture matches",
    storageKey: "paircvision_rapid_capture_matches_v1",
    kind: "json-array",
    noun: ["match", "matches"],
  },
  // features/quickboard/storage/quickboard-types.ts — QUICKBOARD_STORAGE_KEY
  {
    id: "quickboardBoards",
    label: "Tactical Slate boards",
    storageKey: "pitchflow_quickboard_boards_v1",
    kind: "json-array",
    noun: ["board", "boards"],
  },
  // features/vision-tactics/tacticalPlayStorage.ts — STORAGE_KEY
  {
    id: "tacticalPlayScenarios",
    label: "Tactical Play scenarios",
    storageKey: "paircvision-tp-scenarios",
    kind: "json-array",
    noun: ["scenario", "scenarios"],
  },
  // vision-training/trainingStorage.ts — SESSIONS_KEY
  {
    id: "trainingSessions",
    label: "Training Tracker sessions",
    storageKey: "paircvision_training_sessions_v1",
    kind: "json-array",
    noun: ["session", "sessions"],
  },
  // vision-training/trainingStorage.ts — TRAINING_HUB_SQUADS_KEY
  {
    id: "trainingSavedSquads",
    label: "Training Tracker squads",
    storageKey: "paircvision_training_saved_squads_v1",
    kind: "json-array",
    noun: ["squad", "squads"],
  },
  // features/player-performance-tracker/storage/trainingSessionStorage.ts — SEASON_TABLE_KEY
  {
    id: "playerPerformanceSeason",
    label: "Player Performance season table",
    storageKey: "pitchside.player-performance-tracker.season.v1",
    kind: "json-array",
    noun: ["player record", "player records"],
  },
  // features/player-performance-tracker/storage/trainingSessionStorage.ts — SQUADS_KEY
  {
    id: "playerPerformanceSquads",
    label: "Player Performance squads",
    storageKey: "pitchside.player-performance-tracker.squads.v1",
    kind: "json-array",
    noun: ["squad", "squads"],
  },
  // features/notes/notes-storage.ts — NOTES_STORAGE_KEY (text preserved; voice-note audio is unsupported, see backup-build.ts)
  {
    id: "coachNotes",
    label: "Coach Notes",
    storageKey: "pitchflow_coach_notes_v1",
    kind: "json-array",
    noun: ["note", "notes"],
  },
  // pages/PitchFlowCoachShell.tsx — WRITTEN_NOTES_STORAGE_KEY
  {
    id: "writtenNotes",
    label: "Written notes",
    storageKey: "pitchflow_written_notes_v1",
    kind: "json-array",
    noun: ["note", "notes"],
  },
  // components/GuidedTour.tsx — TOUR_KEY (raw flag string, not JSON)
  {
    id: "guidedTourSeen",
    label: "Guided tour dismissed",
    storageKey: "paircvision_guided_tour_v1",
    kind: "raw-string",
  },
  // pages/TacticalPadLiteClean.tsx — QUICK_SHARE_ONBOARDING_STORAGE_KEY (raw flag string, not JSON)
  {
    id: "quickShareOnboardingSeen",
    label: "Quick Share onboarding dismissed",
    storageKey: "flowlabs_quick_share_onboarding_seen",
    kind: "raw-string",
  },
];

export function findBackupDomain(id: string): BackupDomainDescriptor | undefined {
  return BACKUP_DOMAINS.find((domain) => domain.id === id);
}
