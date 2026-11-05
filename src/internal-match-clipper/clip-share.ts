// Native file sharing for exported clips (Android share sheet → WhatsApp etc.).
//
// Reuses the Android/WhatsApp-tested labelling rules in
// features/shared/mediaClipExport.ts (resolveShareMeta) but not its
// shareClipBlob(): that helper silently falls back to a download on *any*
// failure — including the coach simply cancelling the share sheet — and
// reports nothing back. Here every outcome is returned so the screen can say
// what happened, a cancel is just a cancel, and a download only ever happens
// when the coach taps Save MP4.
//
// Only the MP4 File itself is shared: never a URL, never text in its place.

import { resolveShareMeta } from "../features/shared/mediaClipExport";

/** What the Match Clipper exports: H.264 + AAC in MP4. */
export const CLIP_MP4_MIME = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";

export type ShareSupport =
  | { ok: true }
  | { ok: false; reason: "no_share_api" | "files_not_shareable" };

export type ShareOutcome =
  | { status: "shared" }
  | { status: "cancelled" }
  | { status: "unsupported"; reason: "no_share_api" | "files_not_shareable" }
  /** e.g. NotAllowedError (the tap's permission expired) or the target app refused the file. */
  | { status: "failed"; name: string; message: string };

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

/** Wraps an exported MP4 blob as a named File for sharing; made once per export and reused. */
export function makeClipFile(blob: Blob, filename: string): File {
  const { mimeType, ext } = resolveShareMeta(CLIP_MP4_MIME, blob.type);
  const base = filename.replace(/\.(mp4|webm)$/i, "");
  return new File([blob], `${base}.${ext}`, { type: mimeType, lastModified: Date.now() });
}

export function shareSupport(file: File, nav: ShareNavigator = navigator): ShareSupport {
  if (typeof nav.share !== "function") return { ok: false, reason: "no_share_api" };
  try {
    if (typeof nav.canShare !== "function" || !nav.canShare({ files: [file] })) {
      return { ok: false, reason: "files_not_shareable" };
    }
  } catch {
    return { ok: false, reason: "files_not_shareable" };
  }
  return { ok: true };
}

/**
 * Opens the native share sheet with the MP4 attached. Must be called straight
 * from the tap handler, with nothing awaited before it, so the browser still
 * counts it as a user gesture.
 */
export async function shareClipFile(file: File, nav: ShareNavigator = navigator): Promise<ShareOutcome> {
  const support = shareSupport(file, nav);
  if ("reason" in support) return { status: "unsupported", reason: support.reason };
  try {
    await nav.share!({ files: [file] });
    return { status: "shared" };
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "Error";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "AbortError") return { status: "cancelled" };
    return { status: "failed", name, message };
  }
}

export function shareOutcomeMessage(outcome: ShareOutcome): string {
  switch (outcome.status) {
    case "shared":
      return "Clip handed to the app you chose.";
    case "cancelled":
      return "Share cancelled. The clip is still ready — share it or save it.";
    case "unsupported":
      return outcome.reason === "no_share_api"
        ? "This browser can't share files directly. Tap Save MP4, then share it from your Files or Gallery app."
        : "This browser can't share this video file directly. Tap Save MP4, then share it from your Files or Gallery app.";
    case "failed":
      return outcome.name === "NotAllowedError"
        ? "Android didn't allow the share (NotAllowedError). Tap Share Clip again, or Save MP4 instead."
        : `Sharing failed (${outcome.name}: ${outcome.message}). Tap Save MP4 to keep the clip instead.`;
  }
}
