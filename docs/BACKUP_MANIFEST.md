# PáircVision Backup Manifest

This document records every browser storage key included in whole-app `.pvbackup` files.
The backup layer enumerates keys by prefix at export/restore time so new features are
captured automatically. This manifest is the human-readable contract and regression guard.

## Philosophy

- **Local-first:** backup files never leave the coach's control unless they choose to save/share them.
- **Byte-for-byte:** `data` stores raw `localStorage` string values verbatim — no parse/re-serialize.
- **Additive only:** backup metadata uses a new key (`paircvision_backup_meta_v1`). Existing keys are never renamed or restructured.

## Prefix capture rules

Include any `localStorage` key whose name starts with:

| Prefix | Examples |
|--------|----------|
| `paircvision` | `paircvision_training_sessions_v1`, `paircvision-tp-scenarios`, `paircvision.reviewSession.v1.last` |
| `pitchflow_` | `pitchflow_matches_v1`, `pitchflow_quickboard_boards_v1` |
| `pitchside` | `pitchsideclub.squads`, `pitchside.player-performance-tracker.v1` |
| `flowlabs_` | `flowlabs_quick_share_onboarding_seen` |

**Exclusion list (Phase 1):** empty — tour/onboarding flags are tiny and harmless to include.

## Known keys (audit 2026-07-04)

### Coaching data

| Key | Feature | Notes |
|-----|---------|-------|
| `pitchflow_matches_v1` | Match Stats saved matches | Shared with Pro Tagger cross-save |
| `pitchflow_pro_tagger_matches_v1` | Event Stats (Pro Tagger) full records | Includes restore context |
| `pitchflow_saved_squads_v1` | Saved squad templates | Match Stats + Pro Tagger |
| `pitchsideclub.squads` | Match Stats live session roster | In-session state |
| `pitchflow_quickboard_boards_v1` | Vision Board saved boards | May include base64 photo backgrounds |
| `paircvision_board_active_draft_v1` | Vision Board autosave draft | In-progress work |
| `paircvision-tp-scenarios` | Vision Tactics saved plays | Timing values preserved verbatim |
| `paircvision_training_sessions_v1` | Vision Training sessions | |
| `paircvision_training_saved_squads_v1` | Vision Training squads | |
| `paircvision_training_active_session_v1` | Active training session pointer | |
| `pitchside.player-performance-tracker.v1` | Performance Tracker active session | |
| `pitchside.player-performance-tracker.season.v1` | Performance Tracker season table | |
| `pitchside.player-performance-tracker.squads.v1` | Performance Tracker squads | |
| `pitchflow_coach_notes_v1` | Coach notes metadata | Text included; audio refs only |
| `pitchflow_written_notes_v1` | Written notes (Coach Shell) | |
| `paircvision_stats_active_draft_v1` | Match Stats crash-recovery draft | |

### UI / recovery / cache

| Key | Feature | Notes |
|-----|---------|-------|
| `paircvision.reviewSession.v1.last` | Last exported review JSON | Write-only cache; included for completeness |
| `paircvision_guided_tour_v1` | Guided tour dismissed | |
| `flowlabs_quick_share_onboarding_seen` | Quick Share onboarding | |

### Backup metadata (new, additive)

| Key | Feature | Notes |
|-----|---------|-------|
| `paircvision_backup_meta_v1` | `lastBackupAt` timestamp | Written by backup feature only |

## Explicitly NOT included (Phase 1)

| Storage | Reason |
|---------|--------|
| **IndexedDB** `audio-storage` / `voice-blobs` | Audio blobs live outside localStorage. UI warns: *"Audio notes are not included in backups yet."* |
| **Rapid Capture** | Sessions are in-memory only today — nothing persisted to back up. |
| **sessionStorage** | Not used by PáircVision. |

## Count derivation (display only — never used for restore)

| Count | Source keys |
|-------|-------------|
| `matches` | Union of `id` fields in `pitchflow_matches_v1` + `pitchflow_pro_tagger_matches_v1` |
| `boards` | `pitchflow_quickboard_boards_v1` array length |
| `plays` | `paircvision-tp-scenarios` array length |
| `squads` | Union across `pitchflow_saved_squads_v1`, `paircvision_training_saved_squads_v1`, `pitchside.player-performance-tracker.squads.v1` |
| `sessions` | `paircvision_training_sessions_v1` array length |
| `notes` | `pitchflow_coach_notes_v1` + `pitchflow_written_notes_v1` array lengths |

## File format

See product spec: `.pvbackup` JSON with `format: "paircvision-backup"`, `formatVersion: 1`, `encrypted: false` (Phase 1).

## Future (out of scope for Phase 1)

- Merge restore mode
- Encryption (`encrypted: true`, AES-GCM blob)
- IndexedDB audio export (`formatVersion` bump + `blobs` section)
- Rapid Capture persistence
