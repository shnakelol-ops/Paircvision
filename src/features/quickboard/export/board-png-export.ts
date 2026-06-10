import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import { type SlateTextAnnotation, FONT_SIZE_PX } from "../annotations/slateTextAnnotation";
import { type SlateCoachingCard, CARD_TYPE_CONFIG } from "../coaching-cards/slateCoachingCard";

type BoardPngExportOptions = {
  /** CSS colour string for the canvas background behind the pitch. Defaults to the tactical board dark colour. */
  boardBackground?: string;
  /** Text annotations to composite onto the exported image. */
  textAnnotations?: SlateTextAnnotation[];
  /** Review cards to composite onto the exported image (compact form: icon + title only). */
  coachingCards?: SlateCoachingCard[];
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, body] = dataUrl.split(",");
    if (!header || !body) return null;
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Exports the current static board setup as a PNG File.
 *
 * Follows the same frame-wait + extract pattern as generateQuickBoardThumbnail,
 * but targets full canvas resolution and adds a watermark via Canvas 2D.
 */
export async function exportBoardSetupAsPng(
  surface: TacticalPadLiteSurface,
  options: BoardPngExportOptions = {},
): Promise<File | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;

  // Wait one frame so PixiJS has rendered the latest state before extracting.
  await nextFrame();

  console.debug("[PV PNG] exportBoardSetupAsPng: calling exportImageCanvas");
  const source = surface.exportImageCanvas();
  console.debug("[PV PNG] exportImageCanvas result:", source ? `${source.width}x${source.height}` : "null");

  if (!source || source.width <= 0 || source.height <= 0) return null;

  const { width, height } = source;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // alpha: false prevents transparent pixels becoming black after compositing.
  const ctx = canvas.getContext("2d", { alpha: false });
  console.debug("[PV PNG] 2d context:", ctx ? "ok" : "null");
  if (!ctx) return null;

  // Fill solid background first — the PixiJS canvas uses backgroundAlpha: 0,
  // so any region not painted by Pixi would otherwise be transparent.
  ctx.fillStyle = options.boardBackground ?? "#13221d";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(source, 0, 0);

  // Composite text annotations before the watermark so watermark sits on top.
  const anns = options.textAnnotations;
  if (anns && anns.length > 0) {
    for (const ann of anns) {
      if (!ann.text.trim()) continue;
      const px = (ann.x / 100) * width;
      const py = (ann.y / 100) * height;
      const pxSize = Math.round(FONT_SIZE_PX[ann.fontSize ?? "md"] * (height / 500));
      ctx.save();
      ctx.font = `bold ${pxSize}px Inter, system-ui, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = ann.color ?? "#ffffff";
      // Render each line of multi-line text
      const lines = ann.text.split("\n");
      const lineH = pxSize * 1.3;
      const totalH = lines.length * lineH;
      lines.forEach((line, i) => {
        ctx.fillText(line, px, py - totalH / 2 + lineH * i + lineH / 2);
      });
      ctx.restore();
    }
  }

  // Composite review cards in compact form (icon + title) before watermark.
  const cards = options.coachingCards;
  if (cards && cards.length > 0) {
    const cardFontSize = Math.max(9, Math.round(height * 0.024));
    const cardH = Math.round(cardFontSize * 2.2);
    const cardPadX = Math.round(cardFontSize * 0.55);
    const cardPadY = Math.round(cardFontSize * 0.45);
    const accentW = Math.round(cardFontSize * 0.18);
    const radius = Math.round(cardFontSize * 0.5);

    for (const card of cards) {
      if (!card.title.trim()) continue;
      const cfg = CARD_TYPE_CONFIG[card.cardType];
      const cx = (card.x / 100) * width;
      const cy = (card.y / 100) * height;

      ctx.save();
      ctx.font = `600 ${cardFontSize}px Inter, system-ui, Arial, sans-serif`;
      const labelText = `${cfg.icon} ${card.title}`;
      const textW = ctx.measureText(labelText).width;
      const cardW = textW + cardPadX * 2 + accentW;
      const left = cx - cardW / 2;
      const top = cy - cardH / 2;

      // Background pill
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "rgba(8,18,24,0.85)";
      if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: (...args: unknown[]) => void }).roundRect === "function") {
        (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(left, top, cardW, cardH, radius);
        ctx.fill();
      } else {
        ctx.fillRect(left, top, cardW, cardH);
      }

      // Type accent bar (left edge)
      ctx.globalAlpha = 1;
      ctx.fillStyle = cfg.color;
      ctx.fillRect(left, top + radius, accentW, cardH - radius * 2);
      ctx.fillRect(left, top, accentW, radius);
      ctx.fillRect(left, top + cardH - radius, accentW, radius);

      // Label
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d8eaf6";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 3;
      ctx.fillText(labelText, left + accentW + cardPadX, cy);
      ctx.restore();
    }
  }

  // PáircVision watermark — small, corner-anchored, low opacity.
  const fontSize = Math.max(10, Math.round(height * 0.022));
  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
  const pad = Math.round(height * 0.016);
  ctx.fillText("PáircVision", width - pad, height - pad);
  ctx.restore();

  // Primary path: toBlob
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      (b) => {
        console.debug("[PV PNG] toBlob result:", b ? `${b.size} bytes` : "null");
        resolve(b);
      },
      "image/png",
    ),
  );
  if (blob) {
    return new File([blob], "paircvision-board.png", { type: "image/png" });
  }

  // Fallback: toDataURL → Blob conversion (Android Chrome resilience)
  console.debug("[PV PNG] toBlob returned null — trying toDataURL fallback");
  try {
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || dataUrl === "data:,") {
      console.debug("[PV PNG] toDataURL also failed");
      return null;
    }
    const fallbackBlob = dataUrlToBlob(dataUrl);
    console.debug("[PV PNG] dataUrl fallback blob:", fallbackBlob ? `${fallbackBlob.size} bytes` : "null");
    if (!fallbackBlob) return null;
    return new File([fallbackBlob], "paircvision-board.png", { type: "image/png" });
  } catch (err) {
    console.error("[PV PNG] toDataURL fallback threw:", err);
    return null;
  }
}
