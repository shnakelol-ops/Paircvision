import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";

type ThumbnailOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export async function generateQuickBoardThumbnail(
  surface: TacticalPadLiteSurface,
  options: ThumbnailOptions = {},
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const width = Math.max(96, Math.min(360, Math.floor(options.width ?? 220)));
  const height = Math.max(54, Math.min(220, Math.floor(options.height ?? 126)));
  const quality = typeof options.quality === "number" ? Math.max(0.3, Math.min(0.92, options.quality)) : 0.62;

  await nextFrame();
  const source = surface.exportImageCanvas();
  if (!source) return null;

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = width;
  thumbnailCanvas.height = height;
  const ctx = thumbnailCanvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(source, 0, 0, width, height);

  try {
    return thumbnailCanvas.toDataURL("image/webp", quality);
  } catch {
    try {
      return thumbnailCanvas.toDataURL("image/jpeg", quality);
    } catch {
      return null;
    }
  }
}
