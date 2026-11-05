import type { ClipSelection } from "./clip-types";

/**
 * ASCII-only file names: Chrome falls back to "download" for some characters
 * (e.g. "·"), and WhatsApp/Windows handle plain names best. Accents are
 * stripped rather than dropped ("Seán" → "Sean").
 */
export function safeFilename(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
}

export function clipFilename(index: number, clip: ClipSelection): string {
  return `${String(index + 1).padStart(2, "0")} ${safeFilename(clip.name) || "Clip"}.mp4`;
}
