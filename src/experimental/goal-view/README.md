# Goal View — experimental prototype (Tactical Sequence and Tactical Slate)

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

**Access.** On automatically in the experimental branch's Vercel preview
(any of its URLs, no query needed), e.g.
`https://paircvision-git-claude-paircvision-g-916a4b-shnakelol-pitchisde.vercel.app/vision-tactics/play`.
Also on with `VITE_EXPERIMENTAL_GOAL_VIEW=true` at build time, or `?goalview`
in a dev build (`npm run dev`).

Gating (`vite.config.ts` + `sequenceGoalView.tsx`):

- Vercel production builds and previews of any other branch compile the
  feature out entirely (`VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`).
- If Vercel's build variables are absent, the runtime still requires the
  experimental preview's exact host (`GOAL_VIEW_PREVIEW_HOST`).
- The experimental preview build uses vite-plugin-pwa `selfDestroying`, so a
  phone that cached an older build unregisters the old service worker, clears
  its cache and reloads onto the current build automatically.

Production-build requirement: Pixi registers its mesh render pipe when the
Mesh module first loads, and only renderers created afterwards get it. The
lens is a lazy chunk, so Tactical Sequence awaits
`preloadGoalViewBeforeShell()` before creating its shell while the experiment
is enabled — otherwise the perspective mesh has no pipe and the Goal View pitch
renders blank. (The dev server pre-bundles all of Pixi, which hid this.)

Controls: the on-pitch **View** button (top-right; one tap cycles Top-Down →
Left End → Right End) and the **TOOLS → Goal View (beta)** row.

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

1. Preview access only: revert the vite.config.ts Goal View block (the
   `define` entries and `selfDestroying`); the feature then compiles out of
   every Vercel build. Nothing persists, so no cleanup is needed.
2. Code: `git revert` the integration commit; or delete the lines in
   `TacticalPlaySurface.tsx` marked "EXPERIMENTAL Goal View" and the
   `sequenceGoalView*` files. No data migration is needed in either case.

## Tactical Slate integration (experimental, flag-gated)

Same flag and access rules as Sequence (`GOAL_VIEW_EXPERIMENT_ENABLED`). Routes:
`/vision-board` (pitch), `/vision-board/training`, `/vision-board/tactical`,
`/vision-board/whiteboard`. Not offered in Whiteboard mode or Stats mode.

**One renderer.** Slate attaches to the same shared lens (`createGoalViewLens`)
through `slateGoalView.ts`. Slate's own engine keeps drawing everything (players,
opposition, ball, equipment, practice areas, zones, drawings, phase playback);
the lens only re-projects that frame. No movement or playback code is copied.

- **Engine hook (additive only):** `createTacticalPadLiteSurface` gains
  `getExperimentalRenderTargets()` (app, world, players/ball/items layers and an
  item-type lookup). Nothing else in Slate's renderer changed.
- **Lens changes (backward-compatible, Sequence unaffected):**
  - optional `goalDecalBefore`: Slate's world is drawn in insertion order, so
    the goal decal is inserted directly beneath the equipment layer instead of
    using zIndex sorting;
  - optional `extraBillboardLayers`: upright equipment (cone, pole, mannequin,
    hurdle, tackle bag) stands up like players do. Disc cones, ladders and the
    mini-goal/GAA-goal items stay flat on the turf (their art is top-down);
    nothing is hidden;
  - optional `goalDecalColor` (dark on-pitch goal lines on the whiteboard theme);
  - the token layer's `sortableChildren` is restored after each pass.
- **Upright goals follow the board:** shown on themes that draw goals, and not
  on the Training (grass) board, which has none.
- **Read-only in Goal View:** the shield blocks input, text labels are hidden,
  and orientation changes wait until Top-Down. Editing happens in Top-Down.
- **Recording and PNG export** capture the Goal View frame. Text labels are left
  out of a Goal View PNG because they are positioned in top-down space.
- **Selector:** a dedicated row directly above the pitch, right-aligned. In
  landscape and desktop layouts, a 48px row is reserved above the
  aspect-locked box. Hidden in Full View; Goal View itself persists there.

**Changed outside this folder:** `src/engine/pixi/createTacticalPadLiteSurface.ts`
(the getter) and `src/pages/TacticalPadLiteClean.tsx` (imports, state lines, a
gated preload before surface creation, a destroy wrapper, an orientation guard,
the shield/selector JSX, the PNG label guard and the layout reserve).

### Slate rollback

`git revert` the Slate commit; or remove the "EXPERIMENTAL Goal View" lines in
`TacticalPadLiteClean.tsx`, the getter in `createTacticalPadLiteSurface.ts` and
`slateGoalView*`. Nothing is persisted, so no data migration is needed.

## Orbit camera — Phase 1 internal prototype (`/internal/goal-view` only)

Not wired into Tactical Slate or Tactical Sequence. Open `/internal/goal-view`
(Sequence engine) or `/internal/goal-view?board=slate` (Slate engine, mounted
read-only through its existing experimental getter, for equipment checks).

- **Controls:**
  - one-finger horizontal drag rotates 360° (the pitch follows the finger);
  - vertical drag tilts (drag down = higher camera), limited to 20°–75°;
  - **Reset Camera** returns to Camera C;
  - angle buttons (0/45/90/135/180/270/360°), a zoom slider (0.6–2×) and a sampling selector (mipmaps off / mipmaps / mipmaps + 8× anisotropic).
  
  Choosing Left End or Right End always resets the camera.
- **Camera:** `goalViewCamera.ts` orbits the point Camera C already aims at
  (the pitch centre) at a constant eye distance, in the selected end's frame.
  Framing (scale and screen anchor) always comes from the base camera, so
  there is no zoom "breathing" while rotating or tilting.
- **Exact preservation:** the identity orbit (yaw 0/360, Camera C tilt, zoom 1)
  takes the original code path. Left End, Right End and Top-Down were
  byte-identical to the previous commit on the prototype, Sequence and Slate
  (browser screenshots).
- **Lens (`createGoalViewLens.ts`, backward-compatible, default off):**
  - `orbit`: projects through the orbit camera; upright nodes turn with the
    camera yaw so numbers stay upright; stretch is applied along the camera's
    own ground axes; depth sorting uses camera distance;
  - `mipmaps` and `anisotropy`: mipmapped offscreen texture, regenerated after
    each pass.
  
  Slate and Sequence keep the defaults (`orbit: null`, `mipmaps: false`).
- **Gesture:** `goalViewOrbitGesture.ts` is pure and unit-tested.
  - 6 px dead zone, so taps never move the camera.
  - It follows only the first finger; a second finger ends the drag, so the camera never jumps.
  - The prototype coalesces updates to one per animation frame.
- **State separation:** camera state lives only in the prototype page and the
  lens. Board data (tokens, Slate board state) was compared before and after
  orbit sessions: unchanged.

### Mipmaps

| Sampling | Far pitch at side views | Cost |
|---|---|---|
| Off (current) | Sharp but aliased; most shimmer while rotating | none |
| Mipmaps | Smooth, but blurs numbers and lines along the viewing direction | +33% texture memory, mip generation every frame |
| Mipmaps + 8× anisotropic | Sharp and smooth (best) | as above, plus anisotropic sampling |

Container numbers come from SwiftShader (a software GPU, ~3 fps even in
Top-Down). They are not evidence of device performance. Real-device
measurements are required before choosing a default.

### Known limitations

- Fixed framing means side views (90°/270°) crop the goals on a portrait
  phone; zoom out (0.6×) to see the whole pitch.
- Upright players are stretched flat sprites, not 3D. Tokens far to the
  side lean with the perspective, exactly as in the fixed end views.
  Upright equipment (cones, hurdles) turns to face the camera, so a hurdle's
  placed orientation is not kept.
- Goals are drawn below players, so they never hide a player, even when the
  near goal stands between the camera and play.
- Sequence-engine equipment stays flat (it never had upright equipment);
  Slate-engine equipment stands up.

### Future: content-centred orbit (not implemented)

For small training areas, orbit around the content instead of the pitch
centre:
1. The aim point and eye distance come from a bounding box: the selected
   practice area, or else all players, items and drawings, with a margin.
2. The camera orbits that point at a distance that fits the box's
   circumscribed circle for the chosen tilt. This is constant across yaw,
   so there is still no breathing.
3. The board texture can be cropped to the box (a sub-rectangle render with
   a higher px/unit), giving sharper drills at the same cost.
4. Goals are drawn only when the box includes an endline.

It needs `createGoalViewProjection` to accept an aim point and distance
instead of Camera C's fixed centre. The rest of the lens is unchanged.
Bounding boxes must be recomputed when content moves; freeze the box during
playback so the camera doesn't drift.

## Orbit camera — Phase 2: Tactical Slate and Tactical Sequence (experimental, flag-gated)

Both boards use the same implementation: the shared `useGoalView` hook,
`GoalViewReadOnlyShield` and `GoalViewQuickToggle` in `sequenceGoalView.tsx`.
Each board passes `camera={goalView.camera}` to those two components; nothing
else on the boards changed.

- **Gestures (on the read-only shield):** one-finger horizontal drag rotates
  360°; vertical drag tilts (20°–75°); a 6 px dead zone means taps do
  nothing; a second finger ends the drag. Updates are coalesced to one per
  animation frame. There is no inertia and no automatic rotation.
- **Controls:** two 44 px buttons beside the View selector, outside the pitch
  (above it, or under the selector in compact landscape Sequence):
  - **Fit pitch:** a single fixed zoom, computed once, at which the whole
    pitch and both goals fit at every yaw. Solves side-view goal cropping on
    portrait phones without any zoom change while rotating. Tap again for
    Camera C framing.
  - **Reset Camera:** back to Camera C for the selected end. Disabled when
    nothing has moved.
  
  Choosing Left End or Right End always starts from that end's preset.
- **Read-only:** editing stays in Top-Down. Sequence's editing status pill
  ("Ball Assigned · Moves 3") is hidden while a goal view shows, because it
  covered the camera controls on 360 px phones.
- **Lens:** a camera update that changes nothing is ignored (no goal
  rebuild); the board texture is never regenerated because of the camera.
- **Sampling** stays experimental and off by default. On the flagged preview
  only, `?goalviewSampling=mip` or `?goalviewSampling=mip-aniso` lets you test
  it on real devices.
- **Internal route:** `/internal/goal-view` is registered only when the
  experiment flag is on (branch preview, or a dev build with `?goalview`).
  Production builds contain no route, chunk, lens or camera controls.

### Content-centred framing for small training areas (follow-up, not built)

Safest approach:
1. Compute an aim box only when entering a goal view or pressing Fit: the
   selected practice area, else the bounding box of players, items and
   drawings, with a margin. Freeze it during playback so the camera never
   drifts.
2. Pass that box to `createGoalViewProjection` as the aim point plus an eye
   distance that fits the box's circumscribed circle at the current tilt.
   That stays constant across yaw, so there is still no breathing.
3. Optionally render only the box into the texture at a higher px/unit, for
   sharper drills at the same cost.
4. Draw goals only when the box includes an endline.

It changes only the camera inputs; the lens, gestures and boards are
unaffected.

## Public release (Phase 3)

Goal View on the boards is now gated separately from the internal testing
tools, in `sequenceGoalView.tsx`:

| Gate | Controls | Production |
|---|---|---|
| `GOAL_VIEW_PUBLIC_ENABLED` | the public release | **on**, unless built with `VITE_GOAL_VIEW_PUBLIC=false` (kill switch) |
| `GOAL_VIEW_INTERNAL_TOOLS_ENABLED` | `/internal/goal-view` prototype route, `?goalviewSampling` override | **off**; a literal `false` in production builds, so both are compiled out |
| `GOAL_VIEW_ENABLED` = public ∥ internal | Goal View on Tactical Slate and Tactical Sequence (selector, Left End / Right End, orbit, Reset Camera, Fit pitch) | on |

Unchanged in this phase:
- Dev-server test hooks (`__goalViewDebug`, `__goalViewSlateTargets`) only
  exist under `import.meta.env.DEV`.
- The self-destroying service worker only applies to the experimental branch's
  Vercel preview (`vite.config.ts`). Production keeps the normal service worker.
- Mipmaps and anisotropic filtering stay off; the override is internal-only.

**Safe fallback (both boards, one hook):**
- *Initialisation:* if the Goal View code cannot load, or the lens cannot
  attach (e.g. limited graphics), the hook releases the lens, which restores
  the board's own scene, and returns to Top-Down. The lens marks itself active
  before touching the scene graph, so a partial attach is always undone.
- *After Goal View has started:* a failing per-frame offscreen pass is caught
  inside the lens. Without that, an exception in Pixi's ticker would stop the
  whole board rendering, Top-Down included, until a reload. The temporary
  per-frame node tweaks are always undone; the lens detaches itself outside
  the ticker and reports the failure; the hook returns to Top-Down.
- *WebGL context loss:* Pixi restores the context and Goal View keeps
  rendering (verified on both boards).

### Rollback procedure

`VITE_GOAL_VIEW_PUBLIC` is read at **build time** (Vite inlines it into the
bundle), so changing it has no effect until a **new production build** is
deployed:

1. Vercel → Project → Settings → Environment Variables → add
   `VITE_GOAL_VIEW_PUBLIC` = `false` for **Production** only.
2. Vercel → Deployments → the current production deployment → **Redeploy**.
   Don't reuse the existing build output; the variable must reach a fresh
   build.
3. Check the new production deployment: both boards show no View selector, and
   Top-Down works as before.
4. Installed PWAs pick up the new build when their service worker updates (the
   next visit or reload; the SW uses `cleanupOutdatedCaches`). Until then a
   phone may still show the previous build.

Alternative (code rollback): revert the release PR on `main`; Vercel builds
and deploys `main` as usual.

To re-enable: remove the variable (or set it to anything other than `false`)
and redeploy.

The kill switch only hides Goal View. Nothing is persisted by Goal View, so
no data migration or clean-up is ever needed.

## Grass surround (Tactical Slate: Gaelic Pitch and Training Grass)

In Goal View, the pitch sits in a larger mown field instead of floating on the
dark panel: the board's own bands continue past every boundary and fade with
distance from the camera ("Grass bands + fade"). Automatic, no new controls.

**Where it applies** (`slateGoalView.ts`, `slateGoalViewSurround`):

| Board / theme | Surround |
|---|---|
| Slate Gaelic Pitch (`gaelicBands`), Training Grass (`grass`) | The board's own flat mown bands (`TRAINING_GRASS_BANDS`, 16 units), continued past the endlines and straight on past the touchlines, over an opaque `#13221d` backdrop (the Slate pitch panel colour) |
| Slate Tactical Board, default turf, Whiteboard | None (lens options unchanged) |
| Tactical Sequence | None. An edge-sampled turf continuation is an internal investigation only (`/internal/goal-view`) |

**How it works** (`goalViewSurround.ts`, pure and unit-tested):
- The surround is one flat-coloured ground rectangle per band per side, out to
  360 units beyond every boundary, starting 2 units inside it (hidden under
  the opaque pitch mesh, so no gap can open) and leaving the rest of the pitch
  interior out (no overdraw). About 160 cells.
- The lens projects each cell through the same Goal View projection as the
  pitch mesh. Ground lines project to lines, so each cell is an exact
  quadrilateral: crisp band edges at any zoom and no texture memory.
- **Fade:** camera-depth (fog-like). Grass is solid up to 8 units beyond the
  farthest pitch corner's camera depth and eases to nothing 120 units further,
  in 20 slabs. Grass near the camera never fades at any angle or tilt, and the
  grass next to the far boundary is always solid (no seam). The 360-unit outer
  edge is never on screen before the fade removes it (tested: every preset,
  Fit, tilt 20–75°, all yaws, phone and desktop canvases).
- **Clipping:** each cell is clipped against the camera near plane (on the
  ground, where depth is affine), cut into the depth slabs it overlaps, and
  clipped to the canvas rectangle. Cells behind the camera, beyond the fade or
  entirely off-canvas are skipped before any slab cut.
- **Layering:** one Graphics layer, `goal-view-grass-underlay`, beneath the
  goal underlay and the pitch mesh. Markings, equipment, players and the goal
  decal are all inside the mesh's texture, so they always draw over the grass
  (`runDiagnostics().surroundBelowPitch`).
- **Cost:** rebuilt only on a camera, screen, end or surround change (orbit
  drag, preset, Fit, Reset, resize), never per frame. No textures.
- **Share Image / recording:** while a surround is shown, the lens pins
  `app.stage.boundsArea` to the canvas, so the stage export (and the PNG built
  from it) is exactly the canvas, even where the pitch mesh hangs off-canvas.
  Restored when the surround goes (Top-Down, Tactical Board…). The opaque
  backdrop makes recordings (which drop alpha) match the screen.

**Rollback:** delete the `surround` entry in `slateGoalViewLensOptions`
(`slateGoalView.ts`); the lens default is `null`, so everything else is inert.
The `VITE_GOAL_VIEW_PUBLIC=false` kill switch still hides Goal View entirely.

**Internal prototype** (`/internal/goal-view`, compiled out of production):
Surround off / Grass bands (hard edge, 140 units) / Grass bands + fade (the
production surround), Wide / Balanced / Near, Tilt.
`?board=slate&theme=gaelicBands|grass|whiteboard|tacticalBoard` picks the Slate
pitch theme; `?capture` hides every control row and the HUD for screenshots.
The Sequence engine shows the edge-sampled turf investigation
(`goalViewSurroundSampling.ts`): a throwaway copy of the same pitch renderer,
stripes hidden, is drawn once offscreen; the colour just inside each boundary
is read back and continued outwards, with the stripes redrawn in phase. The
boundary matches, but the gradient and vignette continue as faint radiating
wedges, so it is not used on the board.
