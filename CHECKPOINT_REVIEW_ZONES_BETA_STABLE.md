# PáircVision Checkpoint: Review Zones Beta Stable

- Checkpoint branch: `checkpoint/review-zones-beta-stable`
- Checkpoint tag: `paircvision-review-zones-beta-stable-v1`
- Stable baseline commit SHA: `69a3a4d17df3bc2fcd6bfdda866d69618fec27ed`
- Checkpoint date (UTC): `2026-05-23 16:45:24 UTC`

## What is stable at this checkpoint

1. Review Zones overlay integration is active in Stats Review.
2. Daylight readability polish is present for zone boundaries, active/hotspot fills, and count badges.
3. Manual Review strip Hide/Reopen UX is present (no auto-collapse behavior).
4. Pixi idle/resume recovery safeguards are preserved (resume/viewport recovery hooks intact).
5. Black/dark pitch-on-return regression protections remain in place.

## Files and systems included in this stable checkpoint

- `src/StatsModeSurface.tsx`
  - Review strip manual Hide/Reopen behavior.
  - Review-mode integration and viewport recovery listeners/hooks.
- `src/core/stats/draw-stats-zone-overlay.ts`
  - Daylight readability visual constants for zone cells and count badges.
- `src/core/pitch/create-pixi-pitch-surface.ts`
  - Current zone overlay drawing integration path (`drawStatsZoneOverlay`).

## Systems intentionally untouched in this checkpoint

- Zone engine/selectors/types/maps logic and data definitions
- Review selector/type contracts and snapshot data model
- Match event model
- Logging/save/load/share/export flows
- Summary card behavior
- Vision Board / Movement Board / Labs surfaces

## Rollback instructions

If rollback is required:

1. Fetch refs:
   - `git fetch origin --tags`
2. Check out the checkpoint tag in detached mode:
   - `git checkout paircvision-review-zones-beta-stable-v1`
3. Or reset a branch to the checkpoint commit:
   - `git checkout main`
   - `git reset --hard paircvision-review-zones-beta-stable-v1`
4. Push rollback branch if needed:
   - `git checkout -b rollback/review-zones-beta-stable`
   - `git push -u origin rollback/review-zones-beta-stable`

## Next phase

Foundation checkpoint complete for:

- **Review Insights Lite**
- **Match Day Pack foundation**
