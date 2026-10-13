// EXPERIMENTAL — Goal View prototype (internal only, /internal/goal-view).
//
// A read-only presentation "lens" over an existing Tactical Sequence shell.
// The shell keeps simulating and drawing its flat board exactly as it does
// today; the lens re-renders that finished board into an offscreen texture
// each frame and displays it on a PerspectiveMesh. No movement, playback,
// routing or storage logic is duplicated or touched.
//
// Two strategies for keeping the flat board out of the main pass are
// implemented so they can be compared experimentally (see runDiagnostics):
//
//   "wrapper" — the shell's world container is reparented into an offscreen
//               wrapper that is NOT on the stage. The main pass draws only the
//               mesh; the wrapper is rendered to the texture.
//   "alpha"   — world stays on the stage with alpha 0 for the main pass and is
//               rendered directly to the texture with alpha 1 in between.
//
// Top-Down ("detach") restores the exact pre-lens scene graph.

import {
  Container,
  Graphics,
  Matrix,
  PerspectiveMesh,
  RenderTexture,
  UPDATE_PRIORITY,
  type Application,
} from "pixi.js";

import { buildGoalGeometry, type Point3, type Segment3 } from "./goalViewGoalGeometry";
import {
  DEFAULT_GOAL_VIEW_CAMERA,
  GOAL_VIEW_BOARD_LENGTH,
  GOAL_VIEW_BOARD_WIDTH,
  boardToWorld,
  createGoalViewProjection,
  worldToBoard,
  worldToTextureMatrix,
  isIdentityOrbit,
  type GoalViewCameraParams,
  type GoalViewEnd,
  type GoalViewOrbit,
  type GoalViewProjection,
} from "./goalViewCamera";

export type GoalViewLensStrategy = "wrapper" | "alpha";

export type GoalViewLensOptions = {
  strategy: GoalViewLensStrategy;
  /** Texture pixels per world unit (board is 100×160 units). */
  textureScale: number;
  /** Stretch players/ball vertically so they read upright instead of flattened. */
  billboards: boolean;
  /** Draw upright 3D goalposts (near: screen overlay, far: ground-projected decal). */
  uprightGoals: boolean;
  /** Draw nearer players over farther ones while the lens renders. */
  depthSort: boolean;
  camera: GoalViewCameraParams;
  /**
   * Colour for the part of each goal drawn ON the pitch surface (the decal).
   * Omitted: same light colour as the part outside the pitch. Boards with a
   * light surface (Slate's whiteboard theme) pass a dark colour so goals stay
   * visible; the part rising above the pitch keeps the light colour against
   * the dark page.
   */
  goalDecalColor?: number;
  /**
   * Interactive orbit camera (prototype only). null = the fixed end view,
   * rendered by exactly the pre-orbit code path.
   */
  orbit: GoalViewOrbit | null;
  /**
   * Mipmapped offscreen texture (regenerated after every offscreen pass), so
   * the far pitch is minified cleanly instead of shimmering at oblique angles.
   */
  mipmaps: boolean;
  /** Anisotropic filtering level (1 = off). Only effective with mipmaps. */
  anisotropy: number;
};

export const DEFAULT_GOAL_VIEW_LENS_OPTIONS: GoalViewLensOptions = {
  strategy: "wrapper",
  textureScale: 8,
  billboards: true,
  uprightGoals: true,
  depthSort: true,
  camera: DEFAULT_GOAL_VIEW_CAMERA,
  orbit: null,
  mipmaps: false,
  anisotropy: 1,
};

export type GoalViewLensMetrics = {
  end: GoalViewEnd | null;
  strategy: GoalViewLensStrategy;
  textureWidth: number;
  textureHeight: number;
  /** Colour-buffer bytes for the offscreen texture (RGBA8, incl. mip chain). Excludes the MSAA buffer and driver overhead. */
  textureBytes: number;
  /** Rolling mean CPU ms spent submitting the offscreen pass (GPU time is not measurable here). */
  offscreenPassMs: number;
  frames: number;
  /** Rolling mean CPU ms per camera update (projection + goal redraw). Paid on each orbit move. */
  cameraUpdateMs: number;
  /** Camera updates since the lens was created. */
  cameraUpdates: number;
  /** Device pixels per texture pixel at the near/far centre — >1 means the texture is being magnified (soft). */
  nearMagnification: number;
  farMagnification: number;
};

export type GoalViewDiagnostics = {
  strategy: GoalViewLensStrategy;
  /** Non-transparent pixels the MAIN pass produces from the board alone (mesh/overlays hidden). 0 = correctly hidden. */
  mainPassBoardPixels: number;
  /** Non-transparent pixels in the offscreen texture. >0 = offscreen render works. */
  offscreenTexturePixels: number;
  /** Pixi hit-test at a player's flat (top-down) screen position while the lens is active. */
  hitTestAtFlatPlayerPosition: string;
  /** True if the board can still be hit-tested even though it is invisible ("ghost" input). */
  ghostHitTargets: boolean;
  /** True if the mesh is (illegally) inside the subtree rendered into its own texture. */
  feedbackLoop: boolean;
  /** Whether Pixi permanently promoted the shell's world container to a render group. */
  worldBecameRenderGroup: boolean;
  /** Children on the stage during the main pass. */
  stageChildren: string[];
  /** Goal decal draws below players/ball/routes and the underlay draws below the mesh. */
  goalsBelowPlayers: boolean;
};

export type GoalViewLens = {
  setEnd: (end: GoalViewEnd | null) => void;
  setOptions: (patch: Partial<GoalViewLensOptions>) => void;
  getOptions: () => GoalViewLensOptions;
  getMetrics: () => GoalViewLensMetrics;
  getProjection: () => GoalViewProjection | null;
  runDiagnostics: () => GoalViewDiagnostics;
  destroy: () => void;
};

type SavedNodeState = { node: Container; scaleX: number; scaleY: number; zIndex: number; rotation: number };
type SavedFrame = { nodes: SavedNodeState[]; order: Container[]; tokenLayerSortable: boolean };

/**
 * Extra layers whose children may be stood upright like players (e.g. Tactical
 * Slate equipment). Only nodes accepted by `isUpright` are stretched; the rest
 * stay flat on the turf. Never depth-sorted.
 */
export type GoalViewBillboardLayer = { layer: Container; isUpright: (node: Container) => boolean };

export type GoalViewRenderTargets = {
  app: Application;
  world: Container;
  tokenLayer: Container;
  ballLayer: Container;
  /**
   * Where the far goal's ground decal goes inside `world`. Omitted: zIndex 9
   * plus a world sort (Tactical Sequence, whose world is zIndex-sorted). Given:
   * inserted directly before this child, for worlds ordered by insertion
   * (Tactical Slate), so goals stay below equipment, ball and players.
   */
  goalDecalBefore?: Container;
  extraBillboardLayers?: readonly GoalViewBillboardLayer[];
};

export function createGoalViewLens(targets: GoalViewRenderTargets): GoalViewLens {
  const { app, world, tokenLayer, ballLayer } = targets;
  const extraBillboardLayers = targets.extraBillboardLayers ?? [];
  let options: GoalViewLensOptions = { ...DEFAULT_GOAL_VIEW_LENS_OPTIONS };
  let end: GoalViewEnd | null = null;
  let activeStrategy: GoalViewLensStrategy | null = null;
  let projection: GoalViewProjection | null = null;
  let renderTexture: RenderTexture | null = null;
  let mesh: PerspectiveMesh | null = null;
  let worldIndexOnStage = 0;
  let worldAlphaBeforeLens = 1;
  const worldWasRenderGroup = world.isRenderGroup;

  // Offscreen root used by the "wrapper" strategy. Rendering IT (not `world`)
  // keeps Pixi's enableRenderGroup() side effect off the shell's container.
  const wrapper = new Container();
  wrapper.label = "goal-view-offscreen-wrapper";

  // Upright goals are drawn twice from the same 3D geometry so they line up
  // exactly and never cover players:
  //  - goalDecal: the part that lands on the pitch, drawn INSIDE the board
  //    texture as the goal's ground shadow (camera → ground central
  //    projection), so the mesh projects it back to an upright goal. It sits
  //    above drawings (5–6) but below items (11), routes (12), zones (13),
  //    ball (15) and players (20), so tactical movement always reads on top.
  //  - goalUnderlay: the part that projects beyond the pitch quad (posts rising
  //    above the far end, net behind the near end), drawn in screen space
  //    BENEATH the mesh, so wherever the pitch is drawn the decal shows instead.
  const goalDecal = new Graphics();
  goalDecal.label = "goal-view-goal-decal";
  goalDecal.eventMode = "none";
  goalDecal.zIndex = 9;

  const goalUnderlay = new Graphics();
  goalUnderlay.label = "goal-view-goal-underlay";
  goalUnderlay.eventMode = "none";

  const textureTransform = new Matrix();
  const inverseWorld = new Matrix();
  let passMsEma = 0;
  let frames = 0;
  let cameraMsEma = 0;
  let cameraUpdates = 0;

  const textureSize = () => ({
    width: Math.round(GOAL_VIEW_BOARD_WIDTH * options.textureScale),
    height: Math.round(GOAL_VIEW_BOARD_LENGTH * options.textureScale),
  });

  // Sampling settings the current texture was created with (mip levels are
  // fixed at creation, so changing them means a new texture).
  let textureSampling = { mipmaps: false, anisotropy: 1 };
  let samplingStyleApplied = false;

  const ensureTexture = () => {
    const { width, height } = textureSize();
    if (renderTexture && (textureSampling.mipmaps !== options.mipmaps || textureSampling.anisotropy !== options.anisotropy)) {
      // Swap safely: the mesh holding the old texture is rebuilt by the caller
      // (detach/attach), and the old texture is destroyed a few frames later.
      const old = renderTexture;
      renderTexture = null;
      let framesLeft = 3;
      const later = () => {
        framesLeft -= 1;
        if (framesLeft > 0) requestAnimationFrame(later);
        else old.destroy(true);
      };
      requestAnimationFrame(later);
    }
    if (renderTexture) {
      // Resize in place. Swapping mesh.texture and destroying the old texture
      // in the same frame crashes Pixi (the mesh's cached bind group still
      // references the destroyed source — observed: BindGroup.setResource null).
      if (renderTexture.width !== width || renderTexture.height !== height) {
        renderTexture.resize(width, height);
      }
      return;
    }
    renderTexture = options.mipmaps
      ? RenderTexture.create({
          width,
          height,
          resolution: 1,
          antialias: true,
          autoGenerateMipmaps: true,
          scaleMode: "linear",
          mipmapFilter: "linear",
          maxAnisotropy: Math.max(1, options.anisotropy),
        })
      : RenderTexture.create({ width, height, resolution: 1, antialias: true });
    textureSampling = { mipmaps: options.mipmaps, anisotropy: options.anisotropy };
    samplingStyleApplied = false;
  };

  const recomputeProjection = () => {
    if (!end) return;
    const t0 = performance.now();
    projection = createGoalViewProjection(
      options.camera,
      { width: app.screen.width, height: app.screen.height },
      isIdentityOrbit(options.orbit) ? {} : { orbit: options.orbit },
    );
    if (mesh) {
      const [tl, tr, br, bl] = projection.corners;
      mesh.setCorners(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
    }
    drawGoals();
    const dt = performance.now() - t0;
    cameraMsEma = cameraUpdates === 0 ? dt : cameraMsEma * 0.9 + dt * 0.1;
    cameraUpdates += 1;
  };

  const drawGoals = () => {
    goalDecal.clear();
    goalUnderlay.clear();
    if (!end || !projection || !options.uprightGoals) return;
    const proj = projection;
    const currentEnd = end;

    // Screen px per board unit (across) at a 3D point: drives every width so
    // goals thin out with distance exactly like the pitch does.
    const screenScaleAt = (p: Point3) => {
      const q0 = proj.project(p[0], p[1], p[2]);
      const q1 = proj.project(p[0] + 0.5, p[1], p[2]);
      return q0 && q1 ? Math.hypot(q1.x - q0.x, q1.y - q0.y) / 0.5 : 0;
    };
    const shadowWorld = (p: Point3) => boardToWorld(currentEnd, proj.groundShadowOf(p[0], p[1], p[2]));
    const mid = (s: Segment3): Point3 => [
      (s.from[0] + s.to[0]) / 2,
      (s.from[1] + s.to[1]) / 2,
      (s.from[2] + s.to[2]) / 2,
    ];

    type Stroke = { color: number; alpha: number; units: number; minPx: number };
    const stroke = (s: Segment3, style: Stroke) => {
      const m = mid(s);
      const px = Math.max(style.minPx, screenScaleAt(m) * style.units);
      // Underlay: straight screen-space projection.
      const p = proj.project(...s.from);
      const q = proj.project(...s.to);
      if (p && q) {
        goalUnderlay.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: px, color: style.color, alpha: style.alpha, cap: "round" });
      }
      // Decal: ground shadow, width converted back to world units at the shadow.
      const g = proj.groundShadowOf(m[0], m[1], m[2]);
      const groundPx = proj.groundScale(g.a, g.b).across;
      const w0 = shadowWorld(s.from);
      const w1 = shadowWorld(s.to);
      goalDecal
        .moveTo(w0.x, w0.y)
        .lineTo(w1.x, w1.y)
        .stroke({ width: px / Math.max(1e-6, groundPx), color: decalColor(style.color), alpha: style.alpha, cap: "round" });
    };
    // The dark frame outline (0x07170f) is kept; light frame/net colours swap
    // to goalDecalColor on the pitch surface when one is set.
    const decalColor = (color: number) =>
      options.goalDecalColor != null && color !== 0x07170f ? options.goalDecalColor : color;
    const fillPanel = (panel: Point3[], color: number, alpha: number) => {
      const screen = panel.map((p) => proj.project(...p));
      if (screen.every((p) => p)) {
        goalUnderlay.poly(screen.flatMap((p) => [p!.x, p!.y])).fill({ color, alpha });
      }
      goalDecal.poly(panel.flatMap((p) => { const w = shadowWorld(p); return [w.x, w.y]; })).fill({ color: decalColor(color), alpha });
    };

    const NET_LINE: Stroke = { color: 0xe8eef4, alpha: 0.5, units: 0.05, minPx: 0.6 };
    const FRAME_OUTLINE: Stroke = { color: 0x07170f, alpha: 0.45, units: 0.5, minPx: 2.2 };
    const FRAME: Stroke = { color: 0xfbfdff, alpha: 1, units: 0.28, minPx: 1.3 };

    for (const goal of [buildGoalGeometry("far"), buildGoalGeometry("near")]) {
      for (const panel of goal.netPanels) fillPanel(panel, 0xffffff, 0.13);
      for (const line of goal.netLines) stroke(line, NET_LINE);
      const frame = [...goal.uprights, goal.crossbar];
      for (const part of frame) stroke(part, FRAME_OUTLINE);
      for (const part of frame) stroke(part, FRAME);
    }
  };

  /** Presentation-only per-frame tweaks; returns a restore list. Never outlives one offscreen pass. */
  const applyBillboardsAndDepth = (): SavedFrame => {
    const saved: SavedNodeState[] = [];
    // Sorting by zIndex reorders the layer's children array itself, so the
    // original order must be restored too or Top-Down draw order would leak.
    const order = [...tokenLayer.children];
    // Setting zIndex flips the parent's sortableChildren on permanently in
    // Pixi; remember it so a layer that was never sorted is left that way.
    const tokenLayerSortable = tokenLayer.sortableChildren;
    if (!end || !projection || (!options.billboards && !options.depthSort)) return { nodes: saved, order, tokenLayerSortable };
    const proj = projection;
    const m = worldToTextureMatrix(end, 1);
    const textureRotation = Math.atan2(m.b, m.a);
    const layers: Array<{ layer: Container; isUpright: (node: Container) => boolean }> = [
      { layer: tokenLayer, isUpright: () => true },
      { layer: ballLayer, isUpright: () => true },
      ...extraBillboardLayers,
    ];
    for (const { layer, isUpright } of layers) {
      for (const node of layer.children) {
        if (!node.visible || !isUpright(node)) continue;
        saved.push({ node, scaleX: node.scale.x, scaleY: node.scale.y, zIndex: node.zIndex, rotation: node.rotation });
        const board = worldToBoard(end, { x: node.position.x, y: node.position.y });
        if (options.billboards) {
          // Orbit: turn the node with the camera so numbers stay upright on
          // screen, and stretch along the camera's own ground axes. Without an
          // orbit yawRad is 0 and cameraGroundScale is groundScale (old path).
          const s = proj.cameraGroundScale(board.a, board.b);
          const stretch = Math.min(4, Math.max(1, s.across / Math.max(1e-6, s.along)));
          // Stretch whichever of the node's local axes lands on texture-vertical.
          const total = textureRotation + node.rotation;
          const verticalIsLocalX = Math.abs(Math.sin(total)) > 0.5;
          if (proj.yawRad !== 0) node.rotation += proj.yawRad;
          if (verticalIsLocalX) node.scale.x *= stretch;
          else node.scale.y *= stretch;
        }
        if (options.depthSort && layer === tokenLayer) {
          node.zIndex = proj.depthOf(board.a, board.b); // larger = nearer = drawn later
        }
      }
    }
    return { nodes: saved, order, tokenLayerSortable };
  };

  const restoreNodes = (saved: SavedFrame) => {
    for (const s of saved.nodes) {
      s.node.scale.set(s.scaleX, s.scaleY);
      if (s.node.rotation !== s.rotation) s.node.rotation = s.rotation;
      if (s.node.zIndex !== s.zIndex) s.node.zIndex = s.zIndex;
    }
    saved.order.forEach((node, index) => {
      if (node.parent === tokenLayer && tokenLayer.getChildIndex(node) !== index) {
        tokenLayer.setChildIndex(node, index);
      }
    });
    if (tokenLayer.sortableChildren !== saved.tokenLayerSortable) {
      tokenLayer.sortableChildren = saved.tokenLayerSortable;
    }
  };

  // Runs after the shell's own tick (NORMAL) and before Pixi's render (LOW).
  const onTick = () => {
    if (!end || !renderTexture || !activeStrategy) return;
    const t0 = performance.now();
    const m = worldToTextureMatrix(end, options.textureScale);
    const saved = applyBillboardsAndDepth();
    if (activeStrategy === "wrapper") {
      // wrapper·world·local = M  ⇒  wrapper transform = M · world⁻¹.
      world.updateLocalTransform();
      inverseWorld.copyFrom(world.localTransform).invert();
      textureTransform.set(m.a, m.b, m.c, m.d, m.tx, m.ty).append(inverseWorld);
      app.renderer.render({ container: wrapper, target: renderTexture, clear: true, transform: textureTransform });
    } else {
      textureTransform.set(m.a, m.b, m.c, m.d, m.tx, m.ty);
      world.alpha = 1;
      app.renderer.render({ container: world, target: renderTexture, clear: true, transform: textureTransform });
      world.alpha = 0;
    }
    restoreNodes(saved);
    if (textureSampling.mipmaps && renderTexture) {
      if (!samplingStyleApplied) {
        // Pixi skips the trilinear min filter on first upload; re-apply once.
        renderTexture.source.style.update();
        samplingStyleApplied = true;
      }
      renderTexture.source.updateMipmaps();
    }
    const dt = performance.now() - t0;
    passMsEma = frames === 0 ? dt : passMsEma * 0.95 + dt * 0.05;
    frames += 1;
  };

  const onResize = () => recomputeProjection();

  const attach = (strategy: GoalViewLensStrategy) => {
    ensureTexture();
    worldIndexOnStage = Math.max(0, app.stage.getChildIndex(world));
    if (strategy === "wrapper") {
      wrapper.addChild(world);
    } else {
      worldAlphaBeforeLens = world.alpha;
    }
    if (targets.goalDecalBefore && targets.goalDecalBefore.parent === world) {
      // zIndex 0: adding a child with a non-zero zIndex would switch the
      // insertion-ordered world into zIndex sorting (Pixi addChild side effect).
      goalDecal.zIndex = 0;
      world.addChildAt(goalDecal, world.getChildIndex(targets.goalDecalBefore));
    } else {
      goalDecal.zIndex = 9;
      world.addChild(goalDecal);
      world.sortChildren();
    }
    mesh = new PerspectiveMesh({ texture: renderTexture!, verticesX: 32, verticesY: 32 });
    mesh.label = "goal-view-mesh";
    mesh.eventMode = "none";
    app.stage.addChild(mesh);
    app.stage.addChildAt(goalUnderlay, app.stage.getChildIndex(mesh));
    app.ticker.add(onTick, undefined, UPDATE_PRIORITY.LOW + 1);
    app.renderer.on("resize", onResize);
    activeStrategy = strategy;
  };

  const detach = () => {
    if (!activeStrategy) return;
    app.ticker.remove(onTick);
    app.renderer.off("resize", onResize);
    if (mesh) {
      app.stage.removeChild(mesh);
      mesh.destroy();
      mesh = null;
    }
    app.stage.removeChild(goalUnderlay);
    world.removeChild(goalDecal);
    if (activeStrategy === "wrapper") {
      wrapper.removeChild(world);
      app.stage.addChildAt(world, Math.min(worldIndexOnStage, app.stage.children.length));
    } else {
      world.alpha = worldAlphaBeforeLens;
    }
    activeStrategy = null;
    projection = null;
  };

  const countOpaque = (pixels: Uint8ClampedArray | Uint8Array) => {
    let n = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) n += 1;
    return n;
  };

  const describe = (node: Container | null | undefined): string => {
    if (!node) return "nothing";
    const chain: string[] = [];
    let cur: Container | null = node;
    while (cur && chain.length < 6) {
      chain.push(cur === app.stage ? "stage" : cur.label || cur.constructor.name);
      cur = cur.parent;
    }
    return chain.join(" ← ");
  };

  return {
    setEnd: (next) => {
      if (next === end) return;
      end = next;
      if (!end) {
        detach();
        return;
      }
      if (!activeStrategy) attach(options.strategy);
      recomputeProjection();
    },
    setOptions: (patch) => {
      const strategyChanged = patch.strategy && patch.strategy !== options.strategy;
      options = { ...options, ...patch, camera: { ...options.camera, ...(patch.camera ?? {}) } };
      if (!end) return;
      const samplingChanged =
        textureSampling.mipmaps !== options.mipmaps || textureSampling.anisotropy !== options.anisotropy;
      if (strategyChanged || samplingChanged) {
        detach();
        attach(options.strategy);
      }
      ensureTexture();
      recomputeProjection();
    },
    getOptions: () => options,
    getProjection: () => projection,
    getMetrics: () => {
      const { width, height } = textureSize();
      const dpr = app.renderer.resolution;
      let near = 0;
      let far = 0;
      if (projection) {
        const n = projection.groundScale(GOAL_VIEW_BOARD_WIDTH / 2, GOAL_VIEW_BOARD_LENGTH - 5);
        const f = projection.groundScale(GOAL_VIEW_BOARD_WIDTH / 2, 5);
        near = (Math.max(n.across, n.along) * dpr) / options.textureScale;
        far = (Math.max(f.across, f.along) * dpr) / options.textureScale;
      }
      return {
        end,
        strategy: options.strategy,
        textureWidth: width,
        textureHeight: height,
        // A full mip chain adds about one third.
        textureBytes: Math.round(width * height * 4 * (textureSampling.mipmaps ? 4 / 3 : 1)),
        offscreenPassMs: passMsEma,
        frames,
        cameraUpdateMs: cameraMsEma,
        cameraUpdates,
        nearMagnification: near,
        farMagnification: far,
      };
    },
    runDiagnostics: () => {
      const strategy = activeStrategy ?? options.strategy;
      // 1. Main pass with only the board: hide lens-owned display objects.
      const meshVisible = mesh?.visible ?? false;
      if (mesh) mesh.visible = false;
      goalUnderlay.visible = false;
      const mainPixels = app.renderer.extract.pixels({ target: app.stage }).pixels;
      if (mesh) mesh.visible = meshVisible;
      goalUnderlay.visible = true;
      // 2. Offscreen texture content.
      const texPixels = renderTexture ? app.renderer.extract.pixels({ target: renderTexture }).pixels : new Uint8ClampedArray();
      // 3. Hit test where a player sits on the FLAT board (what top-down input would target).
      const firstToken = tokenLayer.children.find((c) => c.visible) ?? null;
      let hitDescription = "no players";
      let ghost = false;
      if (firstToken) {
        world.updateLocalTransform();
        const flat = world.localTransform.apply(firstToken.position);
        const boundary = app.renderer.events.rootBoundary;
        boundary.rootTarget = app.stage;
        const hit = boundary.hitTest(flat.x, flat.y);
        hitDescription = `${describe(hit)} @ (${flat.x.toFixed(0)},${flat.y.toFixed(0)})`;
        let cur: Container | null = hit;
        while (cur) {
          if (cur === world) ghost = true;
          cur = cur.parent;
        }
      }
      let feedback = false;
      let cur: Container | null = mesh;
      while (cur) {
        if (cur === wrapper || (strategy === "alpha" && cur === world)) feedback = true;
        cur = cur.parent;
      }
      return {
        strategy,
        mainPassBoardPixels: countOpaque(mainPixels),
        offscreenTexturePixels: countOpaque(texPixels),
        hitTestAtFlatPlayerPosition: hitDescription,
        ghostHitTargets: ghost,
        feedbackLoop: feedback,
        worldBecameRenderGroup: !worldWasRenderGroup && world.isRenderGroup,
        stageChildren: app.stage.children.map((c) => c.label || c.constructor.name),
        goalsBelowPlayers: (() => {
          if (goalDecal.parent !== world) return false;
          // Compare real draw order inside the world (sorted or not).
          if (world.sortableChildren) world.sortChildren();
          const indexInWorld = (node: Container) => {
            let cur: Container | null = node;
            while (cur && cur.parent !== world) cur = cur.parent;
            return cur ? world.getChildIndex(cur) : -1;
          };
          const decalIndex = world.getChildIndex(goalDecal);
          return (
            decalIndex < indexInWorld(tokenLayer) &&
            decalIndex < indexInWorld(ballLayer) &&
            (!mesh || app.stage.getChildIndex(goalUnderlay) < app.stage.getChildIndex(mesh))
          );
        })(),
      };
    },
    destroy: () => {
      detach();
      renderTexture?.destroy(true);
      renderTexture = null;
      goalDecal.destroy();
      goalUnderlay.destroy();
      wrapper.destroy();
    },
  };
}
