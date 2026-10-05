/**
 * Clip recording captures only the board canvas, but the PáircVision
 * watermark is a DOM overlay (components/PitchWatermark.tsx) on top of it.
 * While a clip records, the Slate moves that same watermark into the canvas:
 * it measures the live overlay element and the engine draws matching text on
 * top of the board (see setRecordingWatermark in createTacticalPadLiteSurface).
 *
 * This module is the pure measurement step: overlay box + computed style ->
 * the spec the engine draws. Everything comes from the overlay itself, so each
 * surface's own watermark (including the Whiteboard's black one) carries over
 * without a second copy of the watermark styling.
 */

export type RecordingWatermarkSpec = {
  text: string;
  /** Right edge of the text, in canvas CSS pixels from the canvas's left edge. */
  right: number;
  /** Bottom edge of the text, in canvas CSS pixels from the canvas's top edge. */
  bottom: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  letterSpacing: number;
  /** Fill colour as 0xRRGGBB. */
  color: number;
  /** Fill opacity, 0–1. */
  alpha: number;
  /** The overlay has a text-shadow (standard watermark); false for the Whiteboard's clean black type. */
  shadow: boolean;
};

/** Parses a computed CSS colour (`rgb(...)` / `rgba(...)`) into a 0xRRGGBB colour and an alpha. */
export function parseCssColor(value: string): { color: number; alpha: number } | null {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(value.trim());
  if (!match) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  const alpha = match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4])));
  if ([r, g, b, alpha].some((n) => !Number.isFinite(n))) return null;
  return { color: (r! << 16) | (g! << 8) | b!, alpha };
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildRecordingWatermarkSpec(input: {
  text: string;
  elementRect: { right: number; bottom: number };
  canvasRect: { left: number; top: number };
  style: { color: string; fontSize: string; fontFamily: string; fontWeight: string; letterSpacing: string; textShadow: string };
}): RecordingWatermarkSpec | null {
  const colour = parseCssColor(input.style.color);
  const fontSize = px(input.style.fontSize);
  if (!colour || fontSize <= 0 || input.text.length === 0) return null;
  return {
    text: input.text,
    right: input.elementRect.right - input.canvasRect.left,
    bottom: input.elementRect.bottom - input.canvasRect.top,
    fontSize,
    fontFamily: input.style.fontFamily,
    fontWeight: input.style.fontWeight,
    letterSpacing: input.style.letterSpacing === "normal" ? 0 : px(input.style.letterSpacing),
    color: colour.color,
    alpha: colour.alpha,
    shadow: input.style.textShadow.trim() !== "" && input.style.textShadow.trim() !== "none",
  };
}
