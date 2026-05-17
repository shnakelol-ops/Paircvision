import { Container, FillGradient, Graphics, GraphicsPath, Sprite, Texture, TilingSprite } from "pixi.js";

import { getPitchConfig, type PitchMarking, type PitchSport } from "../../core/pitch/pitch-config";
import { BOARD_PITCH_VIEWBOX } from "../../core/pitch/pitch-space";

export type TacticalPitchVisualMount = {
  root: Container;
  dispose: () => void;
};

export type TacticalPitchTheme = "default" | "whiteboard";

function createStripeTexture(sport: PitchSport): Texture {
  const canvas = document.createElement("canvas");
  const W = 56;
  const H = 128;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;

  const isSoccer = sport === "soccer";
  const band = isSoccer ? 8 : 8.5;
  for (let x = 0; x < W; x += band) {
    const stripe = (x / band) % 2 === 0;
    ctx.fillStyle = stripe
      ? isSoccer
        ? "rgba(255,255,255,0.26)"
        : "rgba(255,255,255,0.28)"
      : isSoccer
        ? "rgba(0,0,0,0.18)"
        : "rgba(0,0,0,0.17)";
    ctx.fillRect(x, 0, band * 0.52, H);
  }
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 0; y < H; y += 17) {
    ctx.fillRect(0, y, W, 2);
  }

  const tex = Texture.from(canvas);
  tex.source.style.scaleMode = "linear";
  return tex;
}

type TurfRecipe = {
  wash: { t: number; c: string }[];
  centreWash: string;
  verticalBands: number;
  grain: number;
};

function turfRecipe(sport: PitchSport): TurfRecipe {
  if (sport === "soccer") {
    return {
      wash: [
        { t: 0, c: "#050d0a" },
        { t: 0.35, c: "#10261c" },
        { t: 0.52, c: "#16382a" },
        { t: 0.68, c: "#122c22" },
        { t: 1, c: "#060f0c" },
      ],
      centreWash: "rgba(198, 228, 208, 0.065)",
      verticalBands: 3.85,
      grain: 0.01,
    };
  }
  return {
    wash: [
      { t: 0, c: "#0c291d" },
      { t: 0.24, c: "#1a6143" },
      { t: 0.46, c: "#2d825b" },
      { t: 0.62, c: "#277351" },
      { t: 0.8, c: "#1f5e42" },
      { t: 1, c: "#103629" },
    ],
    centreWash: "rgba(220, 255, 232, 0.112)",
    verticalBands: 5.2,
    grain: 0.0095,
  };
}

function createUltraSubtleTurfGrainTexture(): Texture {
  const W = 192;
  const H = 120;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;

  const image = ctx.createImageData(W, H);
  const data = image.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const macro = Math.sin((x * 0.21 + y * 0.11) * 1.13) * Math.cos((y * 0.19 - x * 0.08) * 1.07);
      const micro = Math.sin(x * 2.31 + y * 1.73) * 0.5 + Math.cos(x * 1.61 - y * 2.07) * 0.5;
      const n = macro * 0.7 + micro * 0.3;
      const absN = Math.abs(n);
      if (absN < 0.26) continue;
      const a = Math.min(0.045, 0.012 + (absN - 0.26) * 0.03);
      const isBright = n > 0;
      data[i] = isBright ? 238 : 3;
      data[i + 1] = isBright ? 252 : 18;
      data[i + 2] = isBright ? 242 : 12;
      data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(image, 0, 0);

  const tex = Texture.from(canvas);
  tex.source.style.scaleMode = "linear";
  return tex;
}

function bakeTurfWashTexture(sport: PitchSport): Texture {
  const recipe = turfRecipe(sport);
  const W = 640;
  const H = Math.max(64, Math.round(W * (100 / 160)));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return Texture.WHITE;

  const lg = ctx.createLinearGradient(0, 0, W, H);
  for (const stop of recipe.wash) lg.addColorStop(stop.t, stop.c);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.48;
  const cy = H * 0.46;
  const rad = Math.hypot(W, H) * 0.55;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  rg.addColorStop(0, recipe.centreWash);
  rg.addColorStop(0.32, "rgba(255,255,255,0.026)");
  rg.addColorStop(0.64, "rgba(255,255,255,0.008)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const isSoccer = sport === "soccer";
  if (!isSoccer) {
    for (let p = 0; p < 6; p++) {
      const sx = Math.sin((p + 1) * 12.9898) * 43758.5453123;
      const sy = Math.sin((p + 1) * 78.233) * 12345.6789012;
      const rx = sx - Math.floor(sx);
      const ry = sy - Math.floor(sy);
      const px = W * (0.1 + rx * 0.8);
      const py = H * (0.1 + ry * 0.8);
      const rr = H * (0.15 + ((rx + ry) * 0.5) * 0.18);
      const patch = ctx.createRadialGradient(px, py, 0, px, py, rr);
      if (p % 2 === 0) {
        patch.addColorStop(0, "rgba(235,255,242,0.024)");
      } else {
        patch.addColorStop(0, "rgba(0,20,12,0.014)");
      }
      patch.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = patch;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (isSoccer) {
        if (((x * 11 + y * 5) & 511) === 0) {
          const j = (Math.sin(x * 0.05) + Math.cos(y * 0.04)) * recipe.grain * 18;
          d[i] = Math.max(0, Math.min(255, Math.round((d[i] ?? 0) + j)));
          d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] ?? 0) + j * 0.96)));
          d[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] ?? 0) + j * 0.9)));
        }
      } else {
        const mottling = Math.sin(x * 0.014 + y * 0.02) * Math.cos(y * 0.018 - x * 0.011);
        const grain = Math.sin(x * 0.12 + y * 0.07) * Math.cos(x * 0.06 - y * 0.09);
        const weave = Math.sin(x * 0.028 + y * 0.102) * Math.cos(x * 0.019 - y * 0.084);
        const j = (mottling * 8.4 + grain * 3.8 + weave * 2.6) * recipe.grain;
        d[i] = Math.max(0, Math.min(255, Math.round((d[i] ?? 0) + j)));
        d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] ?? 0) + j * 0.98)));
        d[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] ?? 0) + j * 0.9)));
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = Texture.from(canvas);
  tex.source.style.scaleMode = "linear";
  return tex;
}

function parseDashArray(value?: string): number[] | null {
  if (!value || !value.trim()) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return parts.length ? parts : null;
}

function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  dash: number[],
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  const ux = dx / len;
  const uy = dy / len;
  const d = dash.length === 1 ? [dash[0]!, dash[0]!] : dash;
  let t = 0;
  let i = 0;
  while (t < len - 1e-9) {
    const seg = d[i % d.length]!;
    const t1 = Math.min(len, t + Math.max(1e-6, seg));
    if (i % 2 === 0) {
      g.moveTo(x1 + ux * t, y1 + uy * t)
        .lineTo(x1 + ux * t1, y1 + uy * t1)
        .stroke({ color: stroke, width: strokeWidth, cap: "round", join: "round", alignment: 0.5 });
    }
    t = t1;
    i++;
  }
}

function lineStroke(stroke: string, strokeWidth: number) {
  return {
    color: stroke,
    width: strokeWidth,
    cap: "round" as const,
    join: "round" as const,
    alignment: 0.5 as const,
  };
}

function drawMarkings(
  g: Graphics,
  markings: readonly PitchMarking[],
  options?: { skipLineGlowMarked?: boolean },
): void {
  const drawEllipseArc = (mark: Extract<PitchMarking, { kind: "ellipseArc" }>) => {
    const stroke = { ...lineStroke(mark.stroke, mark.strokeWidth), cap: mark.strokeLinecap ?? "round" as const };
    const arcSpan = Math.abs(mark.endAngle - mark.startAngle);
    const maxRadius = Math.max(mark.rx, mark.ry);
    const minStepByLength = Math.ceil((arcSpan * maxRadius) / 0.85);
    const steps = Math.max(48, minStepByLength, Math.ceil(arcSpan / (Math.PI / 120)));
    const angleDelta = mark.endAngle - mark.startAngle;
    const startX = mark.cx + Math.cos(mark.startAngle) * mark.rx;
    const startY = mark.cy + Math.sin(mark.startAngle) * mark.ry;
    g.moveTo(startX, startY);
    for (let i = 0; i < steps; i += 1) {
      const t1 = (i + 1) / steps;
      const a1 = mark.startAngle + angleDelta * t1;
      const x1 = mark.cx + Math.cos(a1) * mark.rx;
      const y1 = mark.cy + Math.sin(a1) * mark.ry;
      g.lineTo(x1, y1);
    }
    g.stroke(stroke);
  };
  for (const m of markings) {
    if (options?.skipLineGlowMarked && "skipLineGlow" in m && m.skipLineGlow) {
      continue;
    }
    switch (m.kind) {
      case "line": {
        const dash = parseDashArray(m.strokeDasharray);
        if (dash) {
          drawDashedLine(g, m.x1, m.y1, m.x2, m.y2, m.stroke, m.strokeWidth, dash);
        } else {
          g.moveTo(m.x1, m.y1)
            .lineTo(m.x2, m.y2)
            .stroke(lineStroke(m.stroke, m.strokeWidth));
        }
        break;
      }
      case "rect": {
        const fill = m.fill && m.fill !== "none" ? { color: m.fill } : undefined;
        const stroke = m.stroke !== "none" && m.strokeWidth > 0
          ? lineStroke(m.stroke, m.strokeWidth)
          : undefined;
        if (fill && stroke) g.rect(m.x, m.y, m.w, m.h).fill(fill).stroke(stroke);
        else if (fill) g.rect(m.x, m.y, m.w, m.h).fill(fill);
        else if (stroke) g.rect(m.x, m.y, m.w, m.h).stroke(stroke);
        break;
      }
      case "circle": {
        const fill = m.fill && m.fill !== "none" ? { color: m.fill } : undefined;
        const stroke = m.stroke && m.stroke !== "none" && (m.strokeWidth ?? 0) > 0
          ? lineStroke(m.stroke, m.strokeWidth ?? 0)
          : undefined;
        if (fill && stroke) g.circle(m.cx, m.cy, m.r).fill(fill).stroke(stroke);
        else if (fill) g.circle(m.cx, m.cy, m.r).fill(fill);
        else if (stroke) g.circle(m.cx, m.cy, m.r).stroke(stroke);
        break;
      }
      case "ellipse": {
        const fill = m.fill && m.fill !== "none" ? { color: m.fill } : undefined;
        const stroke = m.stroke !== "none" && m.strokeWidth > 0
          ? lineStroke(m.stroke, m.strokeWidth)
          : undefined;
        if (fill && stroke) g.ellipse(m.cx, m.cy, m.rx, m.ry).fill(fill).stroke(stroke);
        else if (fill) g.ellipse(m.cx, m.cy, m.rx, m.ry).fill(fill);
        else if (stroke) g.ellipse(m.cx, m.cy, m.rx, m.ry).stroke(stroke);
        break;
      }
      case "path": {
        if (m.stroke === "none" || m.strokeWidth <= 0) break;
        const fill = m.fill && m.fill !== "none" ? { color: m.fill, alpha: m.opacity ?? 1 } : undefined;
        const stroke = lineStroke(m.stroke, m.strokeWidth);
        const path = new GraphicsPath(m.d);
        if (fill) {
          g.path(path).fill(fill).stroke({ ...stroke, cap: m.strokeLinecap ?? "round" });
        } else {
          g.path(path).stroke({ ...stroke, cap: m.strokeLinecap ?? "round" });
        }
        break;
      }
      case "ellipseArc": {
        if (m.stroke === "none" || m.strokeWidth <= 0) break;
        drawEllipseArc(m);
        break;
      }
      default:
        break;
    }
  }
}

export function createTacticalPitchVisualRoot(
  sport: PitchSport = "gaelic",
  options: { theme?: TacticalPitchTheme } = {},
): TacticalPitchVisualMount {
  const root = new Container();
  const disposers: Array<() => void> = [];
  const { w: vbW, h: vbH } = BOARD_PITCH_VIEWBOX;
  const theme = options.theme ?? "default";
  const isWhiteboardTheme = theme === "whiteboard";

  const panel = new Container();
  root.addChild(panel);

  const chassis = new Graphics();
  const pad = 2.95;
  const cornerR = 2.35;
  chassis.roundRect(-pad, -pad, vbW + pad * 2, vbH + pad * 2, cornerR).fill({
    color: isWhiteboardTheme ? 0xd6dbe1 : 0x020706,
    alpha: 1,
  });
  panel.addChild(chassis);

  const face = new Container();
  face.sortableChildren = true;
  panel.addChild(face);

  const isSoccer = sport === "soccer";
  if (isWhiteboardTheme) {
    const whiteboardFace = new Graphics();
    whiteboardFace.zIndex = 0;
    whiteboardFace.rect(0, 0, vbW, vbH).fill({
      color: 0xf8f9fb,
      alpha: 1,
    });
    face.addChild(whiteboardFace);
  } else {
    const washTex = bakeTurfWashTexture(sport);
    disposers.push(() => washTex.destroy());
    const wash = new Sprite(washTex);
    wash.width = vbW;
    wash.height = vbH;
    wash.zIndex = 0;
    face.addChild(wash);

    const stripeTex = createStripeTexture(sport);
    disposers.push(() => stripeTex.destroy());
    const stripes = new TilingSprite({
      texture: stripeTex,
      width: vbW,
      height: vbH,
    });
    const verticalBands = turfRecipe(sport).verticalBands;
    const density = 2.15 / Math.max(2.8, verticalBands);
    stripes.tileScale.set(2.05, density);
    stripes.alpha = sport === "soccer" ? 0.36 : 0.31;
    stripes.blendMode = "multiply";
    stripes.zIndex = 1;
    face.addChild(stripes);

    const grainTex = createUltraSubtleTurfGrainTexture();
    disposers.push(() => grainTex.destroy());
    const grain = new TilingSprite({
      texture: grainTex,
      width: vbW,
      height: vbH,
    });
    grain.tileScale.set(1.08, 1.08);
    grain.alpha = 1;
    grain.blendMode = "normal";
    grain.zIndex = 1.5;
    face.addChild(grain);

    const vignette = new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.48 },
      innerRadius: 0,
      outerRadius: 1,
      outerCenter: { x: 0.5, y: 0.48 },
      textureSpace: "local",
      colorStops: isSoccer
        ? [
            { offset: 0.32, color: "#00000000" },
            { offset: 0.64, color: "rgba(0, 14, 10, 0.035)" },
            { offset: 0.82, color: "rgba(0, 14, 10, 0.1)" },
            { offset: 1, color: "rgba(0, 18, 12, 0.2)" },
          ]
        : [
            { offset: 0.34, color: "#00000000" },
            { offset: 0.62, color: "rgba(0, 12, 9, 0.028)" },
            { offset: 0.82, color: "rgba(0, 12, 9, 0.075)" },
            { offset: 1, color: "rgba(0, 16, 11, 0.14)" },
          ],
    });
    disposers.push(() => vignette.destroy());
    const depth = new Graphics();
    depth.zIndex = 2;
    depth.rect(0, 0, vbW, vbH).fill(vignette);
    depth.blendMode = "multiply";
    depth.alpha = sport === "soccer" ? 0.38 : 0.24;
    face.addChild(depth);

    if (!isSoccer) {
      const centreLift = new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.48 },
        innerRadius: 0,
        outerRadius: 1,
        outerCenter: { x: 0.5, y: 0.48 },
        textureSpace: "local",
        colorStops: [
          { offset: 0, color: "rgba(234, 255, 242, 0.115)" },
          { offset: 0.28, color: "rgba(226, 255, 238, 0.068)" },
          { offset: 0.56, color: "rgba(222, 255, 236, 0.032)" },
          { offset: 0.82, color: "rgba(228, 255, 238, 0.01)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      });
      disposers.push(() => centreLift.destroy());
      const lift = new Graphics();
      lift.zIndex = 3;
      lift.rect(0, 0, vbW, vbH).fill(centreLift);
      lift.blendMode = "screen";
      lift.alpha = 0.14;
      face.addChild(lift);

      const playCorridor = new FillGradient({
        type: "linear",
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        textureSpace: "local",
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 0)" },
          { offset: 0.28, color: "rgba(231, 255, 239, 0.018)" },
          { offset: 0.5, color: "rgba(236, 255, 244, 0.11)" },
          { offset: 0.72, color: "rgba(231, 255, 239, 0.018)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      });
      disposers.push(() => playCorridor.destroy());
      const corridorLift = new Graphics();
      corridorLift.zIndex = 3.2;
      corridorLift.rect(0, 0, vbW, vbH).fill(playCorridor);
      corridorLift.blendMode = "screen";
      corridorLift.alpha = 0.44;
      face.addChild(corridorLift);
    }
  }

  const markingsGraphics = new Graphics();
  markingsGraphics.zIndex = 4;
  const { markings } = getPitchConfig(sport);
  drawMarkings(markingsGraphics, markings);
  if (isWhiteboardTheme) {
    markingsGraphics.tint = 0x0b1219;
    markingsGraphics.alpha = 1;
  } else if (!isSoccer) {
    markingsGraphics.tint = 0xffffff;
  }
  face.addChild(markingsGraphics);

  const markingsClarity = new Graphics();
  markingsClarity.zIndex = 5;
  drawMarkings(markingsClarity, markings, { skipLineGlowMarked: true });
  if (isWhiteboardTheme) {
    markingsClarity.tint = 0x050b12;
    markingsClarity.blendMode = "normal";
    markingsClarity.alpha = 0.26;
  } else {
    if (!isSoccer) markingsClarity.tint = 0xffffff;
    markingsClarity.blendMode = "screen";
    markingsClarity.alpha = isSoccer ? 0.12 : 0.16;
  }
  face.addChild(markingsClarity);

  if (!isWhiteboardTheme) {
    const sheen = new FillGradient({
      type: "linear",
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
      textureSpace: "local",
      colorStops: [
        { offset: 0, color: "rgba(255, 255, 255, 0.055)" },
        { offset: 0.12, color: "rgba(255, 255, 255, 0.018)" },
        { offset: 0.55, color: "#00000000" },
        { offset: 1, color: "rgba(2, 8, 6, 0.07)" },
      ],
    });
    disposers.push(() => sheen.destroy());
    const glass = new Graphics();
    glass.zIndex = 7;
    glass.rect(0, 0, vbW, vbH).fill(sheen);
    glass.blendMode = "screen";
    glass.alpha = isSoccer ? 0.16 : 0.14;
    face.addChild(glass);
  }

  face.sortChildren();

  return {
    root,
    dispose: () => {
      for (const dispose of disposers) dispose();
      root.destroy({ children: true });
    },
  };
}
