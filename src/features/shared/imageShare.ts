/**
 * imageShare.ts
 *
 * One centralised set of primitives for turning a PNG image into a shared,
 * copied, or saved file. Every surface that wants to offer the unified Share
 * sheet (Tactical Slate, Tactical Play, stats pitch/map review, Intelligence
 * Pack cards, existing report cards) supplies only a small `capture`
 * function that resolves a clean PNG Blob — everything below is shared, so
 * no surface re-implements Web Share / Clipboard / download feature
 * detection on its own.
 *
 * Nothing here talks to React — see ShareSheet.tsx for the UI that wraps
 * these functions with loading state, blob caching, and rendering.
 */

export type ShareImageInput = {
  /** Lazily produces the PNG image to act on. Called at most once per open
   * share session (the caller — ShareSheet — caches the result). */
  getBlob: () => Promise<Blob>;
  /** Filename used when `getBlob()` resolves a plain Blob. If it resolves an
   * already-named File (as most existing exporters do), that File's own
   * name and branding are kept as-is instead. */
  filename: string;
  title?: string;
  text?: string;
};

export type BlobResult = { ok: true; blob: Blob } | { ok: false; message: string };

/** Blob validation: must be a real, non-empty Blob. Anything else is a
 * capture failure, not something to hand to the browser. */
export async function resolveImageBlob(getBlob: () => Promise<Blob>): Promise<BlobResult> {
  let blob: Blob;
  try {
    blob = await getBlob();
  } catch {
    return { ok: false, message: "Couldn't create the image to share." };
  }
  if (!(blob instanceof Blob) || blob.size <= 0) {
    return { ok: false, message: "Couldn't create the image to share." };
  }
  return { ok: true, blob };
}

function ensurePngFilename(filename: string): string {
  const trimmed = filename.trim() || "paircvision-image";
  return /\.png$/i.test(trimmed) ? trimmed : `${trimmed}.png`;
}

/** PNG File creation. If the capture already returned a named File (most of
 * the app's existing card/board exporters do), its name and branding are
 * preserved rather than recomputed here. */
export function toPngFile(blob: Blob, filename: string): File {
  if (blob instanceof File && blob.name.trim().length > 0) {
    return blob;
  }
  return new File([blob], ensurePngFilename(filename), { type: "image/png" });
}

export type CachedFileResult = { file: File; message: null } | { file: null; message: string };

/**
 * Caches one captured PNG File across repeated Share / Copy / Save taps
 * within a single open share session, so the underlying surface is captured
 * at most once no matter how many of the three actions the user tries.
 * Concurrent calls while a capture is already in flight share the same
 * in-flight promise rather than triggering a second capture. `reset()`
 * invalidates the cache — call it whenever the sheet closes or reopens, so
 * a later session captures the surface fresh rather than reusing a stale
 * image.
 */
export function createCachedBlobFileResolver(input: Pick<ShareImageInput, "getBlob" | "filename">) {
  let cachedFile: File | null = null;
  let inFlight: Promise<CachedFileResult> | null = null;

  async function resolve(): Promise<CachedFileResult> {
    if (cachedFile) return { file: cachedFile, message: null };
    if (inFlight) return inFlight;
    const promise = (async (): Promise<CachedFileResult> => {
      const result = await resolveImageBlob(input.getBlob);
      if (!result.ok) {
        return { file: null, message: result.message };
      }
      const file = toPngFile(result.blob, input.filename);
      cachedFile = file;
      return { file, message: null };
    })();
    inFlight = promise;
    const outcome = await promise;
    inFlight = null;
    return outcome;
  }

  function reset(): void {
    cachedFile = null;
    inFlight = null;
  }

  return { resolve, reset };
}

function getNavigatorShare(): ((data: ShareData) => Promise<void>) | null {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
    ? navigator.share.bind(navigator)
    : null;
}

function getNavigatorCanShare(): ((data: ShareData) => boolean) | null {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function"
    ? navigator.canShare.bind(navigator)
    : null;
}

/** navigator.canShare({ files }) — never assumed, always feature-detected. */
export function canShareFiles(file: File): boolean {
  const canShare = getNavigatorCanShare();
  if (!canShare) return false;
  try {
    return canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

export type ShareImageOutcome =
  | { status: "shared" }
  | { status: "cancelled" }
  | { status: "unsupported"; message: string }
  | { status: "failed"; message: string };

/**
 * navigator.share(...). Requires `canShare({ files })` to be true first —
 * never invoked speculatively. User cancellation (AbortError) is reported
 * distinctly from failure so callers never show an error for it.
 */
export async function shareImageFile(
  file: File,
  meta: { title?: string; text?: string },
): Promise<ShareImageOutcome> {
  const share = getNavigatorShare();
  if (!share || !canShareFiles(file)) {
    return {
      status: "unsupported",
      message: "This browser can't share image files directly — use Save Image instead.",
    };
  }
  try {
    await share({ files: [file], title: meta.title, text: meta.text });
    return { status: "shared" };
  } catch (err) {
    if (isAbortError(err)) {
      return { status: "cancelled" };
    }
    return { status: "failed", message: "Couldn't open the share sheet — use Save Image instead." };
  }
}

export type CopyImageOutcome =
  | { status: "copied" }
  | { status: "unsupported"; message: string }
  | { status: "denied"; message: string }
  | { status: "failed"; message: string };

function getClipboardItemCtor(): typeof ClipboardItem | null {
  return typeof window !== "undefined" && typeof window.ClipboardItem === "function"
    ? window.ClipboardItem
    : null;
}

/** Feature detection for the Async Clipboard API's image support — never
 * assumed present, checked fresh every time the sheet opens. */
export function canWriteImageToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    getClipboardItemCtor() !== null
  );
}

function isNotAllowedError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "NotAllowedError";
}

/** Copies image bytes (never a URL or text) to the clipboard via a PNG
 * ClipboardItem. */
export async function copyImageFile(file: File): Promise<CopyImageOutcome> {
  const ClipboardItemCtor = getClipboardItemCtor();
  if (!ClipboardItemCtor || typeof navigator === "undefined" || !navigator.clipboard?.write) {
    return {
      status: "unsupported",
      message: "Copying images isn't supported in this browser — use Save Image instead.",
    };
  }
  try {
    const item = new ClipboardItemCtor({ [file.type || "image/png"]: file });
    await navigator.clipboard.write([item]);
    return { status: "copied" };
  } catch (err) {
    if (isNotAllowedError(err)) {
      return { status: "denied", message: "Clipboard permission was denied — use Save Image instead." };
    }
    return { status: "failed", message: "Couldn't copy the image — use Save Image instead." };
  }
}

export type SaveImageOutcome = { status: "saved" } | { status: "failed"; message: string };

/** Guaranteed-to-work fallback: download via a synthetic anchor click,
 * revoking the object URL once the browser has had time to start the
 * download (same 1.2s convention already used for video clip downloads). */
export async function saveImageFile(file: File): Promise<SaveImageOutcome> {
  try {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    return { status: "saved" };
  } catch {
    return { status: "failed", message: "Couldn't save the image." };
  }
}
