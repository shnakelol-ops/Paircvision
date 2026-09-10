import html2canvas from "html2canvas";

/**
 * team-sheet-export.ts
 *
 * DOM-to-image capture for the internal Team Sheet, built per the approved
 * Phase 1 audit: reuse the existing generic share/save layer
 * (src/features/shared/imageShare.ts, ShareSheet.tsx) unmodified, and
 * capture Team Sheet's own clean Screenshot Mode DOM with html2canvas
 * rather than building a second Canvas2D renderer. Tactical Slate's
 * Snapshot mechanism (Pixi/WebGL canvas extraction, see
 * src/engine/pixi/createTacticalPadLiteSurface.ts /
 * src/features/quickboard/export/board-png-export.ts) is not reusable here
 * — this tool has no Pixi canvas at all — and is not touched by this file.
 *
 * Scope: this module only turns an already-clean DOM subtree into a PNG
 * Blob. It has no opinion on Screenshot Mode state, React, or the share UI
 * — those stay in TeamSheetScreen.tsx and the reused imageShare/ShareSheet
 * modules, matching the "smallest reusable layer" the audit called for.
 */

// Matches the Team Sheet shell's own background (see TeamSheetScreen.tsx's
// `shell` style) so the exported image looks the same as the on-screen
// Screenshot Mode view, not letterboxed against a foreign colour.
const EXPORT_BACKGROUND_COLOR = "#050c14";

// Target output width. Height is never fixed — it follows the captured
// root's natural (unclamped) content height, so a long substitutes list
// grows the image exactly as it grows the on-screen page.
const TARGET_OUTPUT_WIDTH = 1080;

// Mobile canvas-memory safety net only — not a design target. 1080px wide
// content only approaches this if the natural height is enormous (dozens of
// substitute rows well beyond any real GAA panel size). See computeScale().
const MAX_OUTPUT_PIXELS = 20_000_000;

// The class every jersey element carrying the CSS `filter: drop-shadow(...)`
// halo is marked with (TeamSheetJerseyTile.tsx, TeamSheetSubTile.tsx).
// html2canvas has inconsistent `filter` support; rather than touch the real
// jersey artwork or redesign the on-screen look, the onclone hook below
// swaps this to an equivalent `boxShadow` — but only on the throwaway DOM
// clone html2canvas renders from. The live page is never touched, so there
// is nothing to restore afterward.
const JERSEY_SHADOW_CLASS = "ts-jersey-shadow";
const JERSEY_SHADOW_BOX_SHADOW = "0 0 2px rgba(4, 8, 14, 0.55), 0 1px 3px rgba(4, 8, 14, 0.5)";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

/** Waits for every <img> inside root to finish decoding, so html2canvas
 * never rasterizes a still-loading/undecoded jersey image. Images already
 * loaded resolve decode() immediately; a decode() failure on one image
 * (e.g. it never attached) is swallowed rather than aborting the whole
 * capture — a missing single image shouldn't block the export. */
async function waitForImagesDecoded(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve(),
    ),
  );
}

// Only the two measurements computeScale actually reads — kept as a
// structural type (not HTMLElement) so the scaling math is testable without
// a real DOM/jsdom, matching this codebase's no-jsdom test convention (see
// imageShare.test.ts's header comment).
export type CaptureRootSize = { offsetWidth: number; scrollHeight: number };

/** 1080px-wide target, scaled from the root's actual current CSS width —
 * never a hard-coded pixel size. Clamped only so a pathological content
 * height (far beyond any real substitutes list) can't produce a canvas
 * larger than mobile browsers reliably allocate. */
export function computeScale(root: CaptureRootSize): number {
  const width = root.offsetWidth;
  const height = root.scrollHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("Team Sheet has no measurable size to capture");
  }
  const widthScale = TARGET_OUTPUT_WIDTH / width;
  const pixelBudgetScale = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
  return Math.min(widthScale, pixelBudgetScale);
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

// Minimal structural type for the same reason as CaptureRootSize above —
// testable without a real <canvas> element.
export type PngExportableCanvas = {
  toBlob: (callback: (blob: Blob | null) => void, type?: string) => void;
  toDataURL: (type?: string) => string;
};

export async function canvasToPngBlob(canvas: PngExportableCanvas): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (blob) return blob;

  // Fallback: toDataURL → Blob conversion — same Android Chrome resilience
  // recipe already used by board-png-export.ts / pixiCanvasPngExport.ts.
  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl || dataUrl === "data:,") {
    throw new Error("Could not generate the Team Sheet image");
  }
  const fallbackBlob = dataUrlToBlob(dataUrl);
  if (!fallbackBlob) {
    throw new Error("Could not generate the Team Sheet image");
  }
  return fallbackBlob;
}

/**
 * Captures `root` (the Team Sheet's `content` container — never the outer
 * 100dvh `shell`, which would bake in large empty margins around a short
 * team sheet) as a PNG Blob. Caller is responsible for ensuring `root` is
 * already showing the clean Screenshot Mode DOM (no header, no inputs, no
 * Share/Screenshot Mode buttons) before calling this.
 */
export async function captureTeamSheetBlob(root: HTMLElement): Promise<Blob> {
  await nextFrame();
  await waitForImagesDecoded(root);

  const scale = computeScale(root);

  const canvas = await html2canvas(root, {
    backgroundColor: EXPORT_BACKGROUND_COLOR,
    scale,
    width: root.scrollWidth,
    height: root.scrollHeight,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
    useCORS: false,
    logging: false,
    onclone: (clonedDoc) => {
      const shadowEls = clonedDoc.querySelectorAll<HTMLElement>(`.${JERSEY_SHADOW_CLASS}`);
      shadowEls.forEach((el) => {
        el.style.filter = "none";
        el.style.boxShadow = JERSEY_SHADOW_BOX_SHADOW;
      });
    },
  });

  return canvasToPngBlob(canvas);
}
