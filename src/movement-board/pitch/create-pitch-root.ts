import { Container, FillGradient, Graphics, GraphicsPath, Sprite, Texture, TilingSprite } from "pixi.js";

import { getPitchConfig, type PitchMarking, type PitchSport } from "./pitch-config";
import { BOARD_PITCH_VIEWBOX } from "./pitch-space";

export type PitchRootMount = {
  root: Container;
  dispose: () => void;
};

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
  // Shared GAA base (football, ladies football, hurling, camogie).
  return {
    wash: [
      { t: 0, c: "#0c291d" },
      { t: 0.24, c: "#1a6143" },
      { t: 0.46, c: "#2d825b" },
      { t: 0.62, c: "#277351" },
      { t: 0.8, c: "#1f5e42" },
      { t: 1, c: "#103629" },
    ],
    centreWash: "rgba(220, 255, 232, 0.135)",
    verticalBands: 5.2,
    grain: 0.012,
  };
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
  rg.addColorStop(0.45, "rgba(255,255,255,0.02)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const isSoccer = sport === "soccer";
  if (!isSoccer) {
    // Subtle deterministic tonal patches to avoid a flat digital fill.
    for (let p = 0; p < 8; p++) {
      const sx = Math.sin((p + 1) * 12.9898) * 43758.5453123;
      const sy = Math.sin((p + 1) * 78.233) * 12345.6789012;
      const rx = sx - Math.floor(sx);
      const ry = sy - Math.floor(sy);
      const px = W * (0.1 + rx * 0.8);
      const py = H * (0.1 + ry * 0.8);
      const rr = H * (0.15 + ((rx + ry) * 0.5) * 0.18);
      const patch = ctx.createRadialGradient(px, py, 0, px, py, rr);
      if (p % 2 === 0) {
        patch.addColorStop(0, "rgba(235,255,242,0.032)");
      } else {
        patch.addColorStop(0, "rgba(0,20,12,0.02)");
      }
      patch.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = patch;
      ctx.fillRect(0, 0, W, H);
    }

    // Fine low-opacity flecks for grass depth (deterministic noise).
    for (let f = 0; f < 920; f++) {
      const nx = Math.sin((f + 1) * 91.17) * 43758.5453123;
      const ny = Math.sin((f + 1) * 17.31) * 24634.6345124;
      const rx = nx - Math.floor(nx);
      const ry = ny - Math.floor(ny);
      const x = Math.floor(rx * W);
      const y = Math.floor(ry * H);
      const bright = (f & 3) === 0;
      ctx.fillStyle = bright ? "rgba(238,255,244,0.02)" : "rgba(0,14,8,0.014)";
      ctx.fillRect(x, y, 1, (f & 1) + 1);
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
        const blade = Math.sin(x * 0.03 + y * 0.11) * 0.6 + Math.cos(x * 0.017 - y * 0.095) * 0.4;
        const fleck = ((x * 29 + y * 31) & 255) === 0 ? 0.9 : 0;
        const j = (mottling * 13 + grain * 5 + blade * 4 + fleck * 6) * recipe.grain;
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

export function createPitchRoot(sport: PitchSport): PitchRootMount {
  const root = new Container();
  const disposers: Array<() => void> = [];
  const { w: vbW, h: vbH } = BOARD_PITCH_VIEWBOX;

  const panel = new Container();
  root.addChild(panel);

  const chassis = new Graphics();
  const pad = 0;
  const cornerR = 0;
  chassis.roundRect(-pad, -pad, vbW + pad * 2, vbH + pad * 2, cornerR).fill({
    color: sport === "soccer" ? 0x10261c : 0x103629,
    alpha: 1,
  });
  panel.addChild(chassis);

  const face = new Container();
  face.sortableChildren = true;
  panel.addChild(face);

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

  const isSoccer = sport === "soccer";
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
          { offset: 0.78, color: "rgba(0, 14, 10, 0.1)" },
          { offset: 1, color: "rgba(0, 18, 12, 0.2)" },
        ]
      : [
          { offset: 0.34, color: "#00000000" },
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
        { offset: 0, color: "rgba(234, 255, 242, 0.13)" },
        { offset: 0.42, color: "rgba(222, 255, 236, 0.05)" },
        { offset: 1, color: "rgba(255, 255, 255, 0)" },
      ],
    });
    disposers.push(() => centreLift.destroy());
    const lift = new Graphics();
    lift.zIndex = 3;
    lift.rect(0, 0, vbW, vbH).fill(centreLift);
    lift.blendMode = "screen";
    lift.alpha = 0.16;
    face.addChild(lift);
  }

  const markingsGraphics = new Graphics();
  markingsGraphics.zIndex = 4;
  const { markings } = getPitchConfig(sport);
  drawMarkings(markingsGraphics, markings);
  if (!isSoccer) markingsGraphics.tint = 0xffffff;
  face.addChild(markingsGraphics);
  const markingsClarity = new Graphics();
  markingsClarity.zIndex = 5;
  drawMarkings(markingsClarity, markings, { skipLineGlowMarked: true });
  if (!isSoccer) markingsClarity.tint = 0xffffff;
  markingsClarity.blendMode = "screen";
  markingsClarity.alpha = isSoccer ? 0.12 : 0.16;
  face.addChild(markingsClarity);

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

  face.sortChildren();

  return {
    root,
    dispose: () => {
      for (const d of disposers) d();
      root.destroy({ children: true });
    },
  };
}

