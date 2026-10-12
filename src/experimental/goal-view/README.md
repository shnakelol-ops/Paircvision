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
| `createGoalViewLens.ts` | Pixi lens: offscreen pass, mesh, upright-player stretch, depth sort, upright goals, diagnostics. |
| `GoalViewPrototypePage.tsx` | Internal page: view switcher, playback, recording (production `useCanvasRecorder`), camera sliders, metrics. |

Production code touched: one additive, read-only getter
(`getExperimentalRenderTargets`) on the shell handle, and the internal route
in `main.tsx`.

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
- Near goal art reads as a "ladder"; far goal is tiny. The flat top-down goal
  markings still render on the turf underneath.
- Far-end players are small on phones (~12–15 px).
- Ball has no height (data has none); passes read as ground passes.
- DOM overlays (text labels, watermark) are not projected; the input layer is
  blocked by a DOM overlay in Goal View (read-only).
