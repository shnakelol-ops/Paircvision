# PáircVision Backup Manifest

Human-readable contract for what a whole-app `.pvbackup` file protects. The
code's single source of truth is `src/backup/backup-domains.ts` —
`backup-domains.test.ts` proves every key below actually matches its real
owning module by writing through that module's own real save function, not
by comparing this document to itself.

Audited against commit `5dd59ed2b88e7c0396262d97c25ee53b933723e2` (`main`
after PR #251). An earlier draft implementation (PR #235, `docs/BACKUP_MANIFEST.md`
on that branch) audited an older commit that predates the current Rapid
Capture persistence, the current Pro Tagger cross-save key, and several
other changes; its key list is stale and was not reused verbatim — every
row below was re-verified against this commit directly.

## Approach: named domains, not a prefix sweep

The draft PR enumerated every `localStorage` key matching `paircvision*`,
`pitchflow_*`, `pitchside*`, or `flowlabs_*` and backed up whatever it
found. This backup instead lists each domain by name explicitly. A blind
prefix sweep would silently capture in-progress crash-recovery drafts and a
write-only cache alongside real user data, and would silently miss a future
domain that happens not to match one of the four prefixes. A named list is
verified once here and is either included or explicitly declared
unsupported — never a surprise either way.

## Must back up — durable, user-created data

| Domain id | Storage key | Type | Owning module |
|---|---|---|---|
| `matchStatsSavedMatches` | `pitchflow_matches_v1` | JSON array | `core/stats/saved-match.ts` |
| `matchStatsCurrentSquad` | `pitchsideclub.squads` | JSON array | `StatsModeSurface.tsx` / `App.tsx` |
| `savedSquadTemplates` | `pitchflow_saved_squads_v1` | JSON array | `core/stats/saved-match.ts` (shared: Match Stats + Pro Tagger) |
| `proTaggerMatches` | `pitchflow_pro_tagger_matches_v1` | JSON array | `pro-tagger/pro-tagger-storage.ts` |
| `rapidCaptureMatches` | `paircvision_rapid_capture_matches_v1` | JSON array | `rapid-capture/rapid-capture-storage.ts` |
| `quickboardBoards` | `pitchflow_quickboard_boards_v1` | JSON array | `features/quickboard/storage/quickboard-types.ts` |
| `tacticalPlayScenarios` | `paircvision-tp-scenarios` | JSON array | `features/vision-tactics/tacticalPlayStorage.ts` |
| `trainingSessions` | `paircvision_training_sessions_v1` | JSON array | `vision-training/trainingStorage.ts` |
| `trainingSavedSquads` | `paircvision_training_saved_squads_v1` | JSON array | `vision-training/trainingStorage.ts` |
| `playerPerformanceSeason` | `pitchside.player-performance-tracker.season.v1` | JSON array | `features/player-performance-tracker/storage/trainingSessionStorage.ts` |
| `playerPerformanceSquads` | `pitchside.player-performance-tracker.squads.v1` | JSON array | `features/player-performance-tracker/storage/trainingSessionStorage.ts` |
| `coachNotes` | `pitchflow_coach_notes_v1` | JSON array | `features/notes/notes-storage.ts` (text + voice-note metadata; audio itself is unsupported, see below) |
| `writtenNotes` | `pitchflow_written_notes_v1` | JSON array | `pages/PitchFlowCoachShell.tsx` |

## May back up — safe preferences

| Domain id | Storage key | Type | Owning module |
|---|---|---|---|
| `guidedTourSeen` | `paircvision_guided_tour_v1` | raw flag string | `components/GuidedTour.tsx` |
| `quickShareOnboardingSeen` | `flowlabs_quick_share_onboarding_seen` | raw flag string | `pages/TacticalPadLiteClean.tsx` |

## Must not back up

| Storage key | Reason |
|---|---|
| `paircvision_stats_active_draft_v1` | Match Stats in-progress crash-recovery draft — transient session state for the current session on this device |
| `paircvision_rapid_capture_active_v1` | Rapid Capture in-progress session — same reasoning |
| `paircvision_board_active_draft_v1` | QuickBoard in-progress autosave draft — same reasoning |
| `paircvision_training_active_session_v1` | Training Tracker in-progress session pointer — same reasoning |
| `pitchside.player-performance-tracker.v1` | Player Performance's *current in-progress* tracking session (`hasStarted`/`isRunning`/`logs`) — same reasoning; distinct from the durable season table and squads keys above |
| `paircvision.reviewSession.v1.last` | Write-only cache (`StatsModeSurface.tsx`) — written once on export, never read back anywhere in the app; functionally inert |
| `pitchflow_pro_tagger_matches_backup_v1` | Internal safety copy for the one-time coordinate-mirror-repair tool (`pro-tagger-coordinate-repair.ts`) — a recovery artifact for a specific past bugfix, not user-facing content |
| IndexedDB `audio-storage` / `voice-blobs` | Voice-note audio blobs — see "Audio and media policy" below |
| Service-worker precache (Cache Storage API) | Build/deployment artifact, not user data |
| `sessionStorage` | Not used anywhere in this codebase (confirmed by search) |

## Audio and media policy

Voice-note recordings are stored as `Blob`s in IndexedDB (`audio-storage` DB,
`voice-blobs` store), addressed by an `audioBlobId` on each `CoachNote`
record. Embedding IndexedDB blobs in a JSON backup would require base64
encoding (~33% size inflation) and a second storage API's worth of
read/write/validate logic — enough scope on its own to justify not doing it
in this PR.

Audio is declared unsupported explicitly in every backup and restore
summary (`UNSUPPORTED_DOMAINS` in `backup-build.ts`). The note's *text*,
timestamp, half, match-clock position, and duration are preserved as part
of `coachNotes` — a coach still gets "you recorded a 12s note at 34:10 in
the second half of this match," even though the recording itself does not
survive a restore. The existing Notes UI (`NotesQuickPanel.tsx`) already
handles a missing/absent audio blob gracefully today ("Audio file not
found."), so a restored voice-note record with no matching blob fails the
same honest way a corrupted local blob already would — no new broken
state is introduced.

## Restore policy: missing domain -> empty

Restore is replace-only (no merge). For every registered domain: the
device's value becomes the backup's value if present, or that domain's
empty state if the backup does not include it — `"[]"` for record-list
domains, unset for flag-style domains. This is one consistent rule applied
uniformly, not mixed per-domain behaviour: restoring an old backup made
before a domain existed resets that domain to empty on this device, exactly
as if the coach had never used that feature. See `backup-restore.ts`.
