# P0 regression fixes on `feature/heroicons-token-evaluation`

Two regressions reported against this branch, audited and fixed without
touching the Heroicon token work (`docs/heroicon-token-evaluation.md`).

## Audit method

`git merge-base feature/heroicons-token-evaluation origin/main` equals
`origin/main`'s HEAD exactly — this branch is `main` plus the isolated
Heroicon commit only, confirmed with `git diff origin/main..feature/heroicons-token-evaluation --stat`
(token-renderer files and docs only). Neither regression was introduced by
that commit; both are pre-existing gaps in `main` between two duplicate
formation tables. The fixes below restore values that already exist,
correct and verified, in a sibling file — nothing was invented.

## 1. Away/home formation mirrored on wrong side (Tactical Play)

**Root cause:** `src/features/vision-tactics/TacticalPlaySurface.tsx` keeps
its own inline copy of the Gaelic 15 formation (`GAELIC_FORMATION_BASE`),
separate from the two other copies:

- `src/movement-board/tokens/default-tokens.ts` (`GAELIC_HOME_POSITIONS`)
- `src/engine/pixi/tacticalSlateDefaultPlayers.ts` (`TACTICAL_SLATE_GAELIC_FORMATION_BASE`, used by Tactical Slate)

Two prior commits fixed the mirrored-position bug — `f4e109c` (players
2/4/10/12/13/15) and `c25d6d9` (players 5/7) — but **both only edited
`default-tokens.ts`**. `default-tokens.ts`'s own comment even flags this:
*"Matches GAELIC_FORMATION_BASE in TacticalPlaySurface.tsx — keep both in
sync if positions are ever adjusted."* That sync never happened, so
`TacticalPlaySurface.tsx` has carried the original, unfixed y-coordinates
for 2/4/5/7/10/12/13/15 the whole time — exactly the pairs reported.

**Live confirmation:** Tactical Play's initial board load renders correctly
(it's seeded from the already-fixed `default-tokens.ts`), but Setup → Players
→ Clear → **Fill Our Team** rebuilds from `GAELIC_FORMATION_BASE` directly and
visibly mirrors 2/4, 5/7, 10/12, 13/15 to the wrong side — reproduced and
screenshotted before and after the fix.

**Fix:** `GAELIC_FORMATION_BASE` now has the identical y-values already
proven correct in the other two files (a straight copy, not a new
calculation), plus a comment pointing at both siblings so this can't
silently re-diverge a third time. `getFormationPos`'s existing mirroring
(`{ x: 100 - base.x, y: base.y }` for `"away"`) is untouched — the bug was
in the shared base table both home and away read from, not in the
mirroring logic itself, so fixing the table corrects both sides
consistently. Tactical Slate was not touched; its own table was already
correct.

## 2. Timeout / black-screen crash

Two things were checked here, since "previously fixed on main" black-screen
issue could plausibly mean either:

- **The known WebGL-context-loss recovery fix (`c4862d9`).** iOS/Android can
  permanently kill the canvas's WebGL context after 5+ minutes backgrounded
  without firing `webglcontextrestored`, leaving a blank canvas.
  `TacticalPlaySurface.tsx`'s `onVisibilityChange` handler detects
  `isContextLost()` on return to foreground and remounts the shell instead of
  syncing a dead renderer. **Verified present and byte-for-byte unchanged**
  in the current file (`git show c4862d9` vs. current source), and re-tested
  live by dispatching a `visibilitychange` hide/show cycle against both
  Tactical Slate and Tactical Play with Heroicon selected — board persists
  correctly on both, no blank canvas.
- **A crash introduced by the Heroicon prototype itself.** During that
  work, Pixi's `Graphics.svg()` threw on a bare `<path>` fragment
  (`Cannot read properties of null (reading 'querySelectorAll')`),
  crashing the whole board to black the moment the style was selected.
  This was found and fixed *within the same commit*, before the branch was
  first pushed — the fix (wrapping the path in a full `<svg>` element) is
  already in `createHeroiconUserCircleToken.ts` and documented in
  `docs/heroicon-token-evaluation.md`. Re-verified live again here with no
  regression.

No code change was needed for this item beyond what already shipped — both
the pre-existing recovery path and the Heroicon-specific fix were confirmed
intact and working together.

## Validation after both fixes

- `npm run typecheck` — clean.
- `vite build` — clean.
- `vitest run` — 756/756 passing, 51/51 files.
- Live (headless Chromium): Tactical Play "Fill Our Team" now matches the
  corrected formation; Tactical Slate unchanged and still correct; Heroicon
  token still renders correctly on Tactical Slate; visibility-change cycling
  on both surfaces produces no blank canvas.
