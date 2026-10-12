# Goal View — experimental prototype (Tactical Sequence only)

**Status:** internal proof of concept. Not linked from any production surface.
Do not merge without approval.

Route: `/internal/goal-view` (lazy-loaded chunk; nothing here ships in the
main bundle path).

## What it does

A read-only presentation lens over the existing Tactical Sequence shell
(`movement-board/shell/createMovementCanvasShell.ts`). The shell keeps
simulating and drawing its flat 160×100 board exactly as in production; the
lens re-renders that finished board into an offscreen `RenderTexture` each
frame and shows it on a Pixi `PerspectiveMesh` whose four corners come from a
pinhole camera behind one goal. No movement, playback, pass, shot, route or
storage logic is duplicated or modified.

Views: **Top-Down** (unchanged production path), **Left End**, **Right End**.

## Files

| File | Purpose |
|---|---|
| `goalViewCamera.ts` | Pure camera maths: world↔board frames, world→texture matrix, projection, fit, ground-shadow of 3D points. |
| `goalViewCamera.test.ts` | Unit tests (frames round-trip, token upright invariant, perspective shape, crop, 3D→ground consistency). |
| `goalViewGoalGeometry.ts` | Pure 3D GAA goal geometry (uprights, crossbar, net panels and mesh lines) for near and far goals. |
| `goalViewGoalGeometry.test.ts` | Unit tests (rules dimensions, uprights above crossbar, net behind the line, near/far symmetry, decal ≡ underlay, default camera ≡ DSS proportions). |
| `createGoalViewLens.ts` | Pixi lens: offscreen pass, mesh, upright-player stretch, depth sort, upright goals, diagnostics. |
| `GoalViewPrototypePage.tsx` | Internal page: view switcher, playback, recording (production `useCanvasRecorder`), camera sliders, metrics. |

Production code touched: one additive, read-only getter
(`getExperimentalRenderTargets`) on the shell handle, and the internal route
in `main.tsx`.

## Default camera — configuration C ("DSS-inspired")

Height 112 · Behind 92 · Aim 80 · Near crop 30 (all still slider-adjustable).
Reproduces the DSS Coaching reference's proportions: far endline 52% of the
near endline's width, halfway line 34% down from the far end.

## Upright goals

GAA rules dimensions (6.5 m between uprights, crossbar at 2.5 m, uprights
7 m), converted at 145 m per 156 board units. Each goal is drawn twice from the
same 3D geometry:

- **Decal** — the goal's ground shadow (camera → ground central projection),
  drawn inside the board texture at zIndex 9, so the mesh projects it back to
  an upright goal. Below items, routes, zones, ball and players.
- **Underlay** — the same geometry projected straight to screen, drawn beneath
  the mesh, so the parts that fall outside the pitch quad (posts rising above
  the far end, net behind the near end) are still visible.

Design choice: players always draw over both goals (including a goalkeeper
standing in front of the near goal, who physically would be behind its frame)
so goals never obscure tactical movement.

## Verified experimentally (headless Chromium, SwiftShader)

- Offscreen render works; main pass draws zero board pixels in both hide strategies.
- `wrapper` strategy (reparent world into an offscreen container): no ghost
  hit-testing, no render-group side effect. **Recommended.**
- `alpha` strategy (`world.alpha = 0`): also hides correctly, but Pixi
  permanently promotes the shell's `world` to a render group
  (`renderer.render({ container })` calls `enableRenderGroup()`).
- No render-texture feedback loop (mesh is never inside the rendered subtree).
- Top-Down canvas is pixel-identical before and after visiting Goal View
  (both strategies); production `/vision-tactics/play` is pixel-identical to `main`.
- Playback (runs, passes, shot) and canvas recording work in Goal View; the
  recorded clip shows the perspective.

## Known problems

- Swapping the mesh texture and destroying the old one in the same frame
  crashes Pixi — fixed by resizing the `RenderTexture` in place.
- Depth sort reorders the token layer's children array; the lens restores the
  original order after each pass so Top-Down draw order cannot leak.
- Texture density must scale with device pixel ratio (≈6 px/unit per DPR);
  8 px/unit is slightly soft at the near end on 2× screens.
- Portrait phones leave the top ~40% of the canvas empty: a long pitch seen
  end-on is wide and short. Near crop helps; landscape fills ~93% height.
- The flat top-down goal markings (pitch renderer) still render on the turf
  under the upright goals; they are inside the shell's pitch root, which the
  lens does not modify.
- Far-end players are small on phones (~12–15 px).
- Ball has no height (data has none); passes read as ground passes.
- DOM overlays (text labels, watermark) are not projected; the input layer is
  blocked by a DOM overlay in Goal View (read-only).

## Tactical Sequence integration (experimental, flag-gated)

Goal View is reachable inside the real Tactical Sequence
(`/vision-tactics/play`) under **TOOLS → Goal View (beta)**: Top-Down,
Left End, Right End. It shows the coach's actual board (saved plays, players,
ball, drawings, items, playback) through the same lens and camera C defaults.

**Flag.** Off unless one of these is true:

- built or served with `VITE_EXPERIMENTAL_GOAL_VIEW=true`
  (e.g. a Vercel *Preview* environment variable), or
- a dev build (`npm run dev`) opened with `?goalview` in the URL.

In a normal production build the flag is the literal `false`: the control,
shield and lens import are removed from the bundle (verified by grepping the
built assets).

**Behaviour while a goal view is active**

- Read-only: a DOM shield over the pitch blocks pitch input (taps, drags,
  route/draw gestures); a badge says how to get back to editing. Play, pause,
  reset, record, share and all panels keep working.
- Goal View owns the shell orientation (quarter-turn 3 or 1); Top-Down
  restores the normal portrait/landscape rule.
- DOM text labels are hidden (they are flat-board positioned).
- Share Image and recordings capture the perspective canvas.
- WebGL context-loss remount: the lens is released before the old shell is
  destroyed and re-attached to the new one.
- Nothing is persisted; saved plays are unchanged.

**Changed outside this folder:** `src/features/vision-tactics/TacticalPlaySurface.tsx`
(one import block, three state/ref lines, a flag-gated destroy wrapper, one
guard in the orientation effect, the text-overlay/shield JSX, and the TOOLS row).

### Rollback

1. Instant, no code change: unset `VITE_EXPERIMENTAL_GOAL_VIEW` (or never set
   it) and redeploy — the feature is compiled out.
2. Code: `git revert` the integration commit; or delete the lines in
   `TacticalPlaySurface.tsx` marked "EXPERIMENTAL Goal View" and the
   `sequenceGoalView*` files. No data migration is needed in either case.
