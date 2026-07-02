// Shared MediaRecorder/export helpers for Coaching Clips V1.
//
// Mirrors the codec-preference and blob-labelling approach already proven in
// useCanvasRecorder.ts (Tactical Slate's live "Record" feature): H.264+AAC in
// MP4 is preferred because it is the only combination WhatsApp/Android reliably
// preserve audio for, with WebM fallbacks for browsers without an H.264 encoder.
export function getBestClipVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ] as const;
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

export function canCaptureCanvasStream(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
  const canvas = document.createElement("canvas");
  return typeof (canvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream === "function";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
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

export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
  title: string,
): Promise<void> {
  const file = new File([blob], filename, { type: mimeType });
  try {
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch {
    // User cancelled the share sheet, or share failed — fall back to download.
  }
  downloadBlob(blob, filename);
}
