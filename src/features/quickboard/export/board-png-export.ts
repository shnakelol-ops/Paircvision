import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";

type BoardPngExportOptions = {
  /** CSS colour string for the canvas background behind the pitch. Defaults to the tactical board dark colour. */
  boardBackground?: string;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
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

  const source = surface.exportImageCanvas();
  if (!source || source.width <= 0 || source.height <= 0) return null;

  const { width, height } = source;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // alpha: false prevents transparent pixels becoming black after compositing.
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  // Fill solid background first — the PixiJS canvas uses backgroundAlpha: 0,
  // so any region not painted by Pixi would otherwise be transparent.
  ctx.fillStyle = options.boardBackground ?? "#13221d";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(source, 0, 0);

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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return null;

  return new File([blob], "paircvision-board.png", { type: "image/png" });
}
