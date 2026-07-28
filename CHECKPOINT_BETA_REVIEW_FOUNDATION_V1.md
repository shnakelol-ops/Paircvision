# PáircVision Beta Checkpoint — Review Foundation v1

## Checkpoint report

- **Branch name:** `checkpoint/paircvision-beta-review-foundation-v1`
- **Tag name:** `paircvision-beta-review-foundation-v1`
- **Current deployed Vercel URL:** `https://paircvision.vercel.app`
- **Latest stable app commit hash (pre-checkpoint-doc):** `4b4cfdc3955a68fa45e978b7a1656f16d1b35905`
- **Checkpoint intent:** freeze current stable PáircVision Beta before Canonical Review Selector architecture work.

## What PáircVision Beta currently is

PáircVision Beta is a vision-first coaching app with a live match logging path (`/flowstats`), review workflows, and board/shell experiences for coaches using Football, Ladies Football, Hurling, and Camogie modes.

Frozen beta scope in this checkpoint:

- stable Stats Lite match logging
- Review mode foundation
- Review filters
- FOR/OPP visual review
- segment review
- event-category review
- current PNG summary sharing
- current Review Pitch sharing foundation
- Vision-first Stats direction

## Architecture status

- Live app shell and route entrypoint are stable in `src/main.tsx` and `src/pages/PitchFlowCoachShell.tsx`.
- Stats Lite + review runtime remains in `src/StatsModeSurface.tsx`.
- Review snapshot/filter primitives remain in `src/stats/statsReviewSnapshot.ts`.
- PNG summary generation remains in `src/stats/statsShareCard.ts`.
- Vercel rewrite/redirect behavior is unchanged in `vercel.json`.

## Current Review capabilities

Review mode currently supports:

- Half filter: `FULL`, `H1`, `H2`
- Segment filter: `ALL`, `S1`..`S6`
- Team context filter: `ALL`, `FOR`, `OPP`
- Event-category filter: `ALL`, `SCORES`, `SHOTS`, `WIDES`, `TURNOVERS`, `KICKOUTS`, `FREES`, `PLAYERS`
- Zone filter: `FULL`, `OWN_HALF`, `OPPOSITION_HALF`
- Active-player-only filter
- Review strip/event detail UI for inspecting selected events

## Current sharing capabilities

- Match summary sharing via generated PNG card file (`Share Summary PNG`), using Web Share API when available with download fallback.
- Review Pitch sharing foundation is currently the existing board snapshot/screenshot-led sharing path (no new sharing architecture added in this checkpoint).

## Current movement board status

Movement Board remains an existing labs shell route (`/movement-board-labs`) with current move/route/ball/play controls and playback flow. No movement-board behavior changes are introduced in this checkpoint.

## Known non-blocking issues

- Production build emits a Vite chunk-size warning for a large JS bundle (>500 kB minified); build still completes successfully.
- Native file share support depends on platform/browser support; unsupported environments use the download fallback path.

## Untouched systems (explicit freeze boundaries)

This checkpoint does **not** change:

- Vision Board internals
- Movement Board internals
- gameplay/review logic behavior
- summary card generation logic
- UI layout/styling behavior

## Known next architecture phase

### Canonical Review Selector

Next phase should unify review filter state and selector behavior into a canonical source of truth across review strip/panel usage, while preserving this checkpoint as a rollback-safe baseline.

## Recommended rollback command

```bash
git fetch --tags origin
git checkout checkpoint/paircvision-beta-review-foundation-v1
git reset --hard paircvision-beta-review-foundation-v1
```

## Recommended restore workflow

1. `git fetch --tags origin`
2. `git checkout checkpoint/paircvision-beta-review-foundation-v1`
3. `git reset --hard paircvision-beta-review-foundation-v1`
4. `npm ci`
5. `npm run build`
6. Redeploy from this exact ref (branch or tag) to restore frozen beta behavior.
