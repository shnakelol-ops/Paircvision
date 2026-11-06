// Montage Lab (Stage 0 feasibility harness) — workload planning. EXPERIMENTAL:
// nothing here is used by Match Clipper V1, and nothing here is the production
// montage engine.

export interface Workload {
  id: string;
  label: string;
  clips: number;
  seconds: number;
}

export const WORKLOADS: readonly Workload[] = [
  { id: "basic", label: "5 clips · 41 s (correctness)", clips: 5, seconds: 41 },
  { id: "five", label: "20 clips · 5 min (mandatory)", clips: 20, seconds: 300 },
  { id: "ten", label: "30 clips · 10 min (preferred)", clips: 30, seconds: 600 },
  { id: "fifteen", label: "50 clips · 15 min (stretch)", clips: 50, seconds: 900 },
];

export interface OutputProfile {
  id: "1080p" | "720p";
  label: string;
  /** Output is downscaled when the source is taller than this. */
  maxHeight: number;
  videoBitrate: number;
}

export const PROFILES: readonly OutputProfile[] = [
  { id: "1080p", label: "1080p · 6 Mbps", maxHeight: 1080, videoBitrate: 6_000_000 },
  { id: "720p", label: "720p · 3 Mbps", maxHeight: 720, videoBitrate: 3_000_000 },
];

/** Copied AAC commentary is ~128 kb/s or less; budget for 128 plus container overhead. */
const AUDIO_BITRATE = 128_000;
const CONTAINER_OVERHEAD = 1.02;

export function estimateOutputBytes(seconds: number, profile: OutputProfile): number {
  return Math.round(((profile.videoBitrate + AUDIO_BITRATE) / 8) * seconds * CONTAINER_OVERHEAD);
}

/**
 * Spreads `clips` equal-length ranges across the match so a montage exercises
 * real seeking through the whole file, like a coach's selection would. Ranges
 * may overlap only when the montage is longer than the match itself.
 */
export function planRanges(sourceDuration: number, clips: number, totalSeconds: number): [number, number][] {
  if (!(sourceDuration > 1) || clips < 1 || !(totalSeconds > 0)) return [];
  const length = Math.min(totalSeconds / clips, sourceDuration - 0.5);
  const lastStart = Math.max(0, sourceDuration - length - 0.25);
  return Array.from({ length: clips }, (_, i) => {
    const start = clips === 1 ? 0 : (lastStart * i) / (clips - 1);
    // A small, varying fractional offset so starts don't line up with frame or keyframe boundaries.
    const s = Math.min(lastStart, start + ((i * 37) % 100) / 300);
    return [round3(s), round3(s + length)] as [number, number];
  });
}

/** Saved Match Clipper clips (read-only) → ranges, in list order. */
export function rangesFromSavedClips(clips: readonly { start: number; end: number }[]): [number, number][] {
  return clips.filter((c) => c.end > c.start).map((c) => [c.start, c.end] as [number, number]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1e6).toFixed(bytes >= 1e9 ? 0 : 1)} MB`;
}
