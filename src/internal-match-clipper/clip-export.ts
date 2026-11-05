// Local MP4 clip export using Mediabunny (WebCodecs). The source File is read
// in slices through BlobSource — it is never loaded into memory whole, never
// uploaded and never modified. Each clip is re-encoded for video (H.264) so the
// first frame is exactly the requested start, not the previous keyframe; AAC
// audio is copied packet-for-packet when the source is AAC (otherwise it is
// re-encoded to AAC). An export that would lose the audio track fails loudly
// instead of producing a silent file.

export type ClipExportErrorCode =
  | "canceled"
  | "no_webcodecs"
  | "unreadable_source"
  | "no_video"
  | "unsupported_video"
  | "unsupported_audio"
  | "invalid_range"
  | "verification_failed"
  | "failed";

export class ClipExportError extends Error {
  readonly code: ClipExportErrorCode;
  constructor(code: ClipExportErrorCode, message: string) {
    super(message);
    this.name = "ClipExportError";
    this.code = code;
  }
}

export interface SourceProbe {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  /** null when export is possible; otherwise a coach-readable reason. */
  blocker: { code: ClipExportErrorCode; message: string } | null;
}

export interface ExportedClip {
  blob: Blob;
  duration: number;
  hasAudio: boolean;
  elapsedMs: number;
}

type Mediabunny = typeof import("mediabunny");

let engine: Promise<Mediabunny> | null = null;
/** Lazy: the ~480 KB engine loads only when the clipper actually probes or exports. */
export function loadEngine(): Promise<Mediabunny> {
  if (!engine) {
    engine = import("mediabunny").catch((err) => {
      engine = null;
      throw err;
    });
  }
  return engine;
}

export function hasWebCodecs(): boolean {
  return typeof globalThis.VideoEncoder === "function" && typeof globalThis.VideoDecoder === "function";
}

function openInput(mb: Mediabunny, file: Blob) {
  return new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
}

/** Reads the container's tracks and decides up front whether export can work on this device. */
export async function probeSource(file: Blob): Promise<SourceProbe> {
  if (!hasWebCodecs()) {
    return {
      duration: 0, width: 0, height: 0, videoCodec: null, audioCodec: null, hasAudio: false,
      blocker: { code: "no_webcodecs", message: "This browser can't export clips. Use an up-to-date Chrome on Android." },
    };
  }
  const mb = await loadEngine();
  const input = openInput(mb, file);
  try {
    let video, audio, duration;
    try {
      [video, audio, duration] = await Promise.all([
        input.getPrimaryVideoTrack(),
        input.getPrimaryAudioTrack(),
        input.computeDuration(),
      ]);
    } catch {
      return {
        duration: 0, width: 0, height: 0, videoCodec: null, audioCodec: null, hasAudio: false,
        blocker: { code: "unreadable_source", message: "This file couldn't be read as a video. Choose an MP4 match video." },
      };
    }
    const base = {
      duration,
      width: video?.displayWidth ?? 0,
      height: video?.displayHeight ?? 0,
      videoCodec: video?.codec ?? null,
      audioCodec: audio?.codec ?? null,
      hasAudio: audio !== null,
    };
    if (!video) {
      return { ...base, blocker: { code: "no_video", message: "This file has no video track." } };
    }
    if (!(await video.canDecode()) || !(await mb.canEncodeVideo("avc", { width: base.width, height: base.height }))) {
      return {
        ...base,
        blocker: {
          code: "unsupported_video",
          message: `This phone can't convert this video format (${video.codec ?? "unknown"}). It may still play here.`,
        },
      };
    }
    if (audio && audio.codec !== "aac") {
      const canTranscode = (await audio.canDecode()) && (await mb.canEncodeAudio("aac"));
      if (!canTranscode) {
        return {
          ...base,
          blocker: {
            code: "unsupported_audio",
            message: `This phone can't convert this video's audio (${audio.codec ?? "unknown"}). Clips would be silent, so export is turned off.`,
          },
        };
      }
    }
    return { ...base, blocker: null };
  } finally {
    input.dispose();
  }
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Must be true to export from a source with no audio track. The UI sets it only after telling the coach. */
  allowSilentSource?: boolean;
}

/**
 * Exports [start, end) of `file` as an H.264/AAC MP4 held in memory.
 *
 * Built on Mediabunny's sink/source primitives rather than its high-level
 * Conversion: Conversion re-encodes audio whenever trimming starts after the
 * first sample, which needs a WebCodecs AAC encoder that many devices lack.
 * Here AAC packets are copied untouched (no generation loss, no encoder
 * needed) with their timestamps shifted by exactly `start`, so A/V sync is
 * preserved to the sample. Video is decoded from the keyframe before `start`
 * and re-encoded, so the first frame is the frame showing at `start`.
 */
export async function exportClip(
  file: Blob,
  range: { start: number; end: number },
  options: ExportOptions = {},
): Promise<ExportedClip> {
  const { signal, onProgress, allowSilentSource = false } = options;
  const { start, end } = range;
  if (!(end > start) || start < 0 || !Number.isFinite(end)) {
    throw new ClipExportError("invalid_range", "The clip's end must be after its start.");
  }
  if (signal?.aborted) throw new ClipExportError("canceled", "Export cancelled.");
  if (!hasWebCodecs()) throw new ClipExportError("no_webcodecs", "This browser can't export clips.");

  const t0 = performance.now();
  const mb = await loadEngine();
  const input = openInput(mb, file);
  /** Stops the track loops — on user cancel or when the other track fails. */
  let canceled = false;
  let userCanceled = false;
  let output: InstanceType<Mediabunny["Output"]> | null = null;
  const onAbort = () => {
    userCanceled = true;
    canceled = true;
  };
  signal?.addEventListener("abort", onAbort);
  const throwIfCanceled = () => {
    if (userCanceled || signal?.aborted) throw new ClipExportError("canceled", "Export cancelled.");
  };

  try {
    let video, audio;
    try {
      [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    } catch {
      throw new ClipExportError("unreadable_source", "The match video couldn't be read. Reselect it and try again.");
    }
    if (!video) throw new ClipExportError("no_video", "The match video has no video track.");
    if (!audio && !allowSilentSource) {
      throw new ClipExportError("unsupported_audio", "The match video has no audio track.");
    }
    if (
      !(await video.canDecode()) ||
      !(await mb.canEncodeVideo("avc", { width: video.displayWidth, height: video.displayHeight }))
    ) {
      throw new ClipExportError("unsupported_video", `This phone can't convert this video (${video.codec ?? "unknown"}).`);
    }
    const copyAudio = audio?.codec === "aac";
    if (audio && !copyAudio && !((await audio.canDecode()) && (await mb.canEncodeAudio("aac")))) {
      throw new ClipExportError("unsupported_audio", `The audio (${audio.codec ?? "unknown"}) couldn't be exported on this phone.`);
    }
    throwIfCanceled();

    const target = new mb.BufferTarget();
    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const videoSource = new mb.VideoSampleSource({ codec: "avc", bitrate: mb.QUALITY_HIGH, sizeChangeBehavior: "passThrough" });
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    const audioPackets = audio && copyAudio ? new mb.EncodedAudioPacketSource("aac") : null;
    const audioSamples = audio && !copyAudio ? new mb.AudioSampleSource({ codec: "aac", bitrate: mb.QUALITY_HIGH }) : null;
    if (audioPackets) output.addAudioTrack(audioPackets);
    if (audioSamples) output.addAudioTrack(audioSamples);
    await output.start();

    const span = end - start;
    const videoTask = async () => {
      const sink = new mb.VideoSampleSink(video);
      let frames = 0;
      for await (const sample of sink.samples(start, end)) {
        if (canceled) {
          sample.close();
          break;
        }
        const ts = Math.max(0, sample.timestamp - start);
        sample.setTimestamp(ts);
        if (ts + sample.duration > span) sample.setDuration(Math.max(0.001, span - ts));
        try {
          await videoSource.add(sample);
        } finally {
          sample.close();
        }
        frames++;
        onProgress?.(Math.min(0.99, (ts + 0.001) / span));
      }
      videoSource.close();
      if (!frames && !canceled) throw new ClipExportError("failed", "No video frames were found in this range.");
    };

    const audioTask = async () => {
      if (audioPackets && audio) {
        const sink = new mb.EncodedPacketSink(audio);
        const decoderConfig = (await audio.getDecoderConfig()) ?? undefined;
        let packet = await sink.getPacket(start);
        let written = 0;
        while (packet && packet.timestamp < end - 1e-6) {
          if (canceled) break;
          // Only packets that begin at/after the cut: a packet starting before it
          // would need a negative timestamp. Timing is kept exact, so the first
          // audio may start up to one AAC frame (~21 ms) after the first frame.
          if (packet.timestamp >= start - 1e-6) {
            const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - start) });
            await audioPackets.add(shifted, written === 0 ? { decoderConfig } : undefined);
            written++;
          }
          packet = await sink.getNextPacket(packet);
        }
        audioPackets.close();
        if (!written && !canceled) throw new ClipExportError("unsupported_audio", "No audio was found in this range.");
      } else if (audioSamples && audio) {
        const sink = new mb.AudioSampleSink(audio);
        let written = 0;
        for await (const sample of sink.samples(start, end)) {
          if (canceled || sample.timestamp < start - 1e-6) {
            sample.close();
            if (canceled) break;
            continue;
          }
          sample.setTimestamp(sample.timestamp - start);
          try {
            await audioSamples.add(sample);
          } finally {
            sample.close();
          }
          written++;
        }
        audioSamples.close();
        if (!written && !canceled) throw new ClipExportError("unsupported_audio", "No audio was found in this range.");
      }
    };

    const results = await Promise.allSettled([videoTask(), audioTask()]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) {
      canceled = true;
      throw failure.reason;
    }
    throwIfCanceled();
    await output.finalize();
    output = null;

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) throw new ClipExportError("failed", "The clip came out empty.");
    const blob = new Blob([buffer], { type: "video/mp4" });
    const check = await verifyExport(mb, blob, span, audio !== null);
    onProgress?.(1);
    return { blob, duration: check.duration, hasAudio: audio !== null, elapsedMs: performance.now() - t0 };
  } catch (err) {
    if (userCanceled || signal?.aborted) throw new ClipExportError("canceled", "Export cancelled.");
    if (err instanceof ClipExportError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new ClipExportError("failed", `Export failed: ${detail}`);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (output) await output.cancel().catch(() => undefined);
    input.dispose();
  }
}

/**
 * Re-opens the exported MP4 and checks it really has video, audio (when
 * expected) and roughly the requested length. Catches a broken or silent file
 * before the coach shares it.
 */
async function verifyExport(mb: Mediabunny, blob: Blob, expected: number, expectAudio: boolean) {
  const out = new mb.Input({ source: new mb.BlobSource(blob), formats: [mb.MP4] });
  try {
    const [video, audio, duration] = await Promise.all([
      out.getPrimaryVideoTrack(),
      out.getPrimaryAudioTrack(),
      out.computeDuration(),
    ]);
    if (!video) throw new ClipExportError("verification_failed", "The exported clip has no video.");
    if (expectAudio && !audio) throw new ClipExportError("verification_failed", "The exported clip lost its audio.");
    if (Math.abs(duration - expected) > Math.max(0.25, expected * 0.05)) {
      throw new ClipExportError(
        "verification_failed",
        `The exported clip is ${duration.toFixed(2)}s long, expected ${expected.toFixed(2)}s.`,
      );
    }
    return { duration };
  } catch (err) {
    if (err instanceof ClipExportError) throw err;
    throw new ClipExportError("verification_failed", "The exported clip couldn't be read back.");
  } finally {
    out.dispose();
  }
}
