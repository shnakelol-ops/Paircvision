/**
 * pixiCanvasPngExport.ts
 *
 * Shared "raw Pixi-extracted canvas → branded PNG Blob" helper. Pixi
 * surfaces render with `backgroundAlpha: 0` (see createTacticalPadLiteSurface.ts,
 * createMovementCanvasShell.ts, create-pixi-pitch-surface.ts), so a plain
 * `toBlob()` of the extracted canvas would produce a transparent-background
 * PNG; this composites a solid background first, then an optional
 * corner-anchored watermark, matching the pattern already proven in
 * board-png-export.ts (Tactical Slate) — kept in one place so Tactical Play
 * and the stats pitch/map adapters don't each re-implement it.
 */

export type PixiCanvasPngExportOptions = {
  backgroundColor?: string;
  watermarkText?: string;
};

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

export async function exportPixiCanvasToPngBlob(
  source: HTMLCanvasElement | null,
  options: PixiCanvasPngExportOptions = {},
): Promise<Blob | null> {
  if (!source || source.width <= 0 || source.height <= 0) return null;

  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // alpha: false prevents transparent pixels becoming black after compositing.
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  ctx.fillStyle = options.backgroundColor ?? "#0b1020";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0);

  if (options.watermarkText) {
    const fontSize = Math.max(10, Math.round(height * 0.022));
    ctx.save();
    ctx.font = `600 ${fontSize}px Inter, "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
    const pad = Math.round(height * 0.016);
    ctx.fillText(options.watermarkText, width - pad, height - pad);
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (blob) return blob;

  // Fallback: toDataURL → Blob conversion (Android Chrome resilience, same
  // recipe as board-png-export.ts).
  try {
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || dataUrl === "data:,") return null;
    return dataUrlToBlob(dataUrl);
  } catch {
    return null;
  }
}
