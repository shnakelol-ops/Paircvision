// Measures how loud an audio track actually is, by decoding short stretches
// and computing RMS level in dBFS. Used to (a) pick the audio track that holds
// the commentary when a match file has several, and (b) prove an exported clip
// really has sound — a clip with a present-but-silent audio track would
// otherwise pass every structural check.

type Mediabunny = typeof import("mediabunny");
type InputAudioTrack = InstanceType<Mediabunny["InputAudioTrack"]>;

/** Below this RMS level a stretch of audio counts as silent (digital silence is ≈ −90 dBFS). */
export const SILENT_DB = -60;

export interface LevelResult {
  /** RMS level in dBFS over everything decoded; null when nothing could be decoded. */
  db: number | null;
  decodedSeconds: number;
}

export function rmsToDb(sumSquares: number, count: number): number | null {
  if (count <= 0) return null;
  const meanSquare = sumSquares / count;
  return meanSquare > 0 ? Math.max(-120, 10 * Math.log10(meanSquare)) : -120;
}

export function isAudible(db: number | null): boolean {
  return db !== null && db > SILENT_DB;
}

/** Decodes [start, end) windows of `track` and returns their combined RMS level. */
export async function measureTrackLevel(
  mb: Mediabunny,
  track: InputAudioTrack,
  windows: [number, number][],
  isCanceled: () => boolean = () => false,
): Promise<LevelResult> {
  if (!(await track.canDecode())) return { db: null, decodedSeconds: 0 };
  const sink = new mb.AudioSampleSink(track);
  let sum = 0;
  let count = 0;
  let decodedSeconds = 0;
  let buffer = new Float32Array(0);
  for (const [start, end] of windows) {
    if (!(end > start)) continue;
    for await (const sample of sink.samples(start, end)) {
      try {
        if (isCanceled()) return { db: rmsToDb(sum, count), decodedSeconds };
        decodedSeconds += sample.duration;
        for (let ch = 0; ch < sample.numberOfChannels; ch++) {
          const opts = { planeIndex: ch, format: "f32-planar" as const };
          const bytes = sample.allocationSize(opts);
          if (buffer.byteLength < bytes) buffer = new Float32Array(bytes / 4);
          sample.copyTo(buffer, opts);
          const n = bytes / 4;
          for (let i = 0; i < n; i++) sum += buffer[i]! * buffer[i]!;
          count += n;
        }
      } finally {
        sample.close();
      }
    }
  }
  return { db: rmsToDb(sum, count), decodedSeconds };
}

/** Three 4-second windows spread across the match (20%, 50%, 80%). */
export function probeWindows(duration: number): [number, number][] {
  if (!(duration > 0)) return [[0, 4]];
  return [0.2, 0.5, 0.8].map((f) => {
    const s = Math.max(0, Math.min(duration - 4, duration * f));
    return [s, Math.min(duration, s + 4)] as [number, number];
  });
}
