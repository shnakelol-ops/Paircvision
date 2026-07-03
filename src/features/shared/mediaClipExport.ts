// Shared MediaRecorder/export helpers for anything that records or exports a
// canvas-based video clip. Used by useCanvasRecorder.ts (Tactical Slate's live
// "Record" feature) and useCoachingClip.ts (Coaching Clips frame+narration
// export). Codec preference and blob-labelling rules below were worked out
// against real Android/WhatsApp behaviour for the live Record feature and
// apply identically to any MediaRecorder-produced clip in this app.

/**
 * Picks the best MediaRecorder mimeType this browser supports, in preference order.
 *
 * H.264+AAC in MP4 first — this is the only combination WhatsApp reliably
 * preserves audio for. The specific codec strings are tested before the
 * generic "video/mp4" because "video/mp4" alone may be honoured by the
 * browser but produce VP9+Opus internally (observed on Chrome for Android).
 *
 * VP9+Opus in WebM before generic "video/mp4" so that devices without an
 * H.264 hardware encoder land on correctly-labelled WebM rather than
 * VP9+Opus mislabelled as MP4.
 *
 * Generic "video/mp4" is kept as a last resort only.
 */
export function getBestVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // H.264 Baseline + AAC-LC
    "video/mp4;codecs=avc1,mp4a.40.2", // H.264 + AAC shorthand
    "video/webm;codecs=vp9,opus", // VP9+Opus in WebM (correct label)
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4", // last resort — may produce VP9/Opus-in-MP4
  ] as const;
  const support = candidates.map((t) => `${t}:${MediaRecorder.isTypeSupported(t)}`);
  console.debug("[PV REC] isTypeSupported audit:", support.join(" | "));
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

export function canCaptureCanvasStream(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
  const canvas = document.createElement("canvas");
  return typeof (canvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream === "function";
}

type ClipMeta = { mimeType: string; ext: "mp4" | "webm" };

/**
 * Meta to use for local downloads/saves — the actual container format,
 * because local media players (VLC, QuickTime, Android's own player) handle
 * VP9-in-MP4 correctly. No WhatsApp-style correction needed here.
 */
export function resolveSaveMeta(requestedMimeType: string, blobType: string): ClipMeta {
  const raw = blobType || requestedMimeType;
  const base = raw.split(";")[0]!.trim().toLowerCase();
  const ext = base === "video/mp4" ? "mp4" : "webm";
  return { mimeType: base, ext };
}

/**
 * Meta to use when sharing. MediaRecorder on some Chrome for Android versions
 * produces VP9+Opus bytes when given the generic "video/mp4" MIME type. We
 * detect this by checking whether the originally *requested* MIME type
 * contained an explicit H.264 codec identifier. If not, the file is shared as
 * video/webm so WhatsApp routes it to a VP9-capable player rather than a
 * H.264-only path.
 */
export function resolveShareMeta(requestedMimeType: string, blobType: string): ClipMeta {
  const raw = blobType || requestedMimeType;
  const base = raw.split(";")[0]!.trim().toLowerCase();
  if (base === "video/mp4") {
    const hasExplicitH264 =
      requestedMimeType.includes("avc1") || requestedMimeType.toLowerCase().includes("h264");
    if (!hasExplicitH264) {
      // VP9/Opus mislabelled as MP4 — share as WebM so the codec is honest.
      return { mimeType: "video/webm", ext: "webm" };
    }
    return { mimeType: "video/mp4", ext: "mp4" };
  }
  return { mimeType: "video/webm", ext: "webm" };
}

export function downloadClipBlob(blob: Blob, requestedMimeType: string, filenamePrefix: string): void {
  const { mimeType, ext } = resolveSaveMeta(requestedMimeType, blob.type);
  const filename = `${filenamePrefix}-${Date.now()}.${ext}`;
  const file = new File([blob], filename, { type: mimeType });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1200);
}

export async function shareClipBlob(params: {
  blob: Blob;
  requestedMimeType: string;
  filenamePrefix: string;
  title: string;
}): Promise<void> {
  const { blob, requestedMimeType, filenamePrefix, title } = params;
  const { mimeType, ext } = resolveShareMeta(requestedMimeType, blob.type);
  const filename = `${filenamePrefix}-${Date.now()}.${ext}`;
  const file = new File([blob], filename, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch {
      // User cancelled the share sheet, or share failed — fall back to download.
    }
  }
  downloadClipBlob(blob, requestedMimeType, filenamePrefix);
}
