// Local MP4 clip export using Mediabunny (WebCodecs). The source File is read
// with short slice reads (see file-source.ts) — it is never loaded into memory
// whole, never uploaded and never modified. Each clip is re-encoded for video
// (H.264) so the first frame is exactly the requested start, not the previous
// keyframe; AAC audio is copied packet-for-packet (otherwise re-encoded to
// AAC). An export that would lose the audio track fails loudly instead of
// producing a silent file.
//
// Every failure is tagged with the stage it happened in and keeps the raw
// browser/engine error, so "the phone can't read the file" is never confused
// with "the format isn't supported" or "the encoder failed".

import { createFileSource, newReadStats, SourceReadError, type ReadFailure, type ReadStats } from "./file-source";
import { declaredAudioTracks, scanMp4, type Mp4Scan } from "./mp4-scan";
import { isAudible, measureTrackLevel, probeWindows } from "./audio-level";

export type ClipExportErrorCode =
  | "canceled"
  | "no_webcodecs"
  /** The browser refused to read the selected file (e.g. NotReadableError). */
  | "file_unreadable"
  /** The bytes were read but the container couldn't be parsed. */
  | "format_unreadable"
  | "no_video"
  | "unsupported_video"
  | "unsupported_audio"
  /** Audio couldn't be confirmed present or absent — export is refused rather than risk a silent clip. */
  | "audio_unverified"
  | "invalid_range"
  | "decode_failed"
  | "encode_failed"
  | "audio_failed"
  /** The chosen audio track is silent in this clip while another track has sound. */
  | "silent_audio_track"
  | "write_failed"
  | "verification_failed"
  | "failed";

export type ExportStage = "open" | "tracks" | "checks" | "setup" | "decode" | "encode" | "audio" | "write" | "verify";

export class ClipExportError extends Error {
  readonly code: ClipExportErrorCode;
  readonly stage: ExportStage | null;
  /** Raw error from the browser or engine ("Name: message"), for diagnostics. */
  readonly detail: string | null;
  readonly readFailure: ReadFailure | null;
  constructor(
    code: ClipExportErrorCode,
    message: string,
    extra: { stage?: ExportStage; detail?: string | null; readFailure?: ReadFailure | null } = {},
  ) {
    super(message);
    this.name = "ClipExportError";
    this.code = code;
    this.stage = extra.stage ?? null;
    this.detail = extra.detail ?? null;
    this.readFailure = extra.readFailure ?? null;
  }
}

export interface SourceProbe {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  /** True when exported clips will carry audio. */
  hasAudio: boolean;
  /** null when export is possible; otherwise a coach-readable reason. */
  blocker: { code: ClipExportErrorCode; message: string; detail?: string | null } | null;
  /** Independent box-level scan of the file (null if it couldn't start). */
  scan: Mp4Scan | null;
  readFailure: ReadFailure | null;
  /** Every audio track the engine can see, with its measured level. */
  audioTracks: AudioTrackInfo[];
  /** The track exports will use (see chooseAudioTrack), or null. */
  audioTrackId: number | null;
}

export interface AudioTrackInfo {
  /** Container track id — stable for the file; passed back as ExportOptions.audioTrackId. */
  id: number;
  /** 1-based position among the file's audio tracks, for display. */
  index: number;
  codec: string | null;
  channels: number;
  sampleRate: number;
  language: string;
  name: string | null;
  isDefault: boolean;
  /** RMS dBFS over three 4 s windows across the match; null if it couldn't be decoded. */
  levelDb: number | null;
}

export interface ExportedClip {
  blob: Blob;
  duration: number;
  hasAudio: boolean;
  /** Measured RMS level of the exported clip's audio (dBFS); null if not measurable here. */
  audioLevelDb: number | null;
  elapsedMs: number;
}

/**
 * Picks the track exports use: the default track if it has sound; otherwise
 * the loudest track that has sound; otherwise the default/first. A file whose
 * first or default audio track is silent (e.g. a clean feed next to the
 * commentary) therefore still exports with commentary.
 */
export function chooseAudioTrack(tracks: AudioTrackInfo[]): AudioTrackInfo | null {
  if (!tracks.length) return null;
  const fallback = tracks.find((t) => t.isDefault) ?? tracks[0]!;
  if (isAudible(fallback.levelDb)) return fallback;
  const audible = tracks.filter((t) => isAudible(t.levelDb)).sort((a, b) => b.levelDb! - a.levelDb!);
  return audible[0] ?? fallback;
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

function openInput(mb: Mediabunny, file: Blob, stats: ReadStats) {
  return new mb.Input({ source: createFileSource(mb, file, stats), formats: mb.ALL_FORMATS });
}

export function rawError(err: unknown): string {
  if (err instanceof ClipExportError) return err.detail ?? err.message;
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { name?: unknown; message?: unknown };
    return `${String(e.name ?? "Error")}: ${String(e.message ?? "")}`;
  }
  return String(err);
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export function fileUnreadableError(failure: ReadFailure, stage: ExportStage): ClipExportError {
  return new ClipExportError(
    "file_unreadable",
    `The phone stopped letting PáircVision read the match video (${failure.name} at ${formatBytes(failure.start)}). Your clips are safe — reselect the video and export again.`,
    { stage, detail: `${failure.name}: ${failure.message} [bytes ${failure.start}-${failure.end}, retried]`, readFailure: failure },
  );
}

/** Turns any error from a stage into an actionable ClipExportError. */
export function classifyError(err: unknown, stage: ExportStage, stats: ReadStats): ClipExportError {
  if (err instanceof ClipExportError) return err;
  const failure = stats.failure ?? (err instanceof SourceReadError ? err.failure : null);
  if (failure) return fileUnreadableError(failure, stage);
  const detail = rawError(err);
  const extra = { stage, detail };
  switch (stage) {
    case "open":
    case "tracks":
      return new ClipExportError("format_unreadable", `PáircVision couldn't read this video's structure (${detail}).`, extra);
    case "decode":
      return new ClipExportError("decode_failed", `This phone couldn't decode the match video for this clip (${detail}).`, extra);
    case "encode":
      return new ClipExportError("encode_failed", `This phone's video encoder failed on this clip (${detail}).`, extra);
    case "audio":
      return new ClipExportError("audio_failed", `The audio couldn't be copied for this clip (${detail}).`, extra);
    case "write":
      return new ClipExportError("write_failed", `The clip couldn't be written (${detail}).`, extra);
    case "verify":
      return new ClipExportError("verification_failed", `The exported clip couldn't be checked (${detail}).`, extra);
    default:
      return new ClipExportError("failed", `Export failed during ${stage} (${detail}).`, extra);
  }
}

const EMPTY_PROBE = {
  duration: 0, width: 0, height: 0, videoCodec: null, audioCodec: null, hasAudio: false,
  audioTracks: [] as AudioTrackInfo[], audioTrackId: null,
};

/**
 * Reads the container's tracks and decides up front whether export can work
 * on this device. Two independent views are combined: Mediabunny's demuxer and
 * a box-level scan (mp4-scan.ts). "No audio" is only reported when both agree.
 */
export async function probeSource(file: Blob): Promise<SourceProbe> {
  const stats = newReadStats();
  const scan = await scanMp4(file, stats);
  if (stats.failure) {
    const e = fileUnreadableError(stats.failure, "open");
    return { ...EMPTY_PROBE, scan, readFailure: stats.failure, blocker: { code: e.code, message: e.message, detail: e.detail } };
  }
  if (!hasWebCodecs()) {
    return {
      ...EMPTY_PROBE, scan, readFailure: null,
      blocker: { code: "no_webcodecs", message: "This browser can't export clips. Use an up-to-date Chrome on Android." },
    };
  }
  const mb = await loadEngine();
  const input = openInput(mb, file, stats);
  const fail = (err: unknown, stage: ExportStage): SourceProbe => {
    const e = classifyError(err, stage, stats);
    return { ...EMPTY_PROBE, scan, readFailure: stats.failure, blocker: { code: e.code, message: e.message, detail: e.detail } };
  };
  try {
    let video, allAudio, primaryAudio, duration;
    try {
      [video, allAudio, primaryAudio, duration] = await Promise.all([
        input.getPrimaryVideoTrack(),
        input.getAudioTracks(),
        input.getPrimaryAudioTrack(),
        input.computeDuration(),
      ]);
    } catch (err) {
      return fail(err, "tracks");
    }
    // Measure every audio track so a silent default track can't hide the commentary.
    const audioTracks: AudioTrackInfo[] = [];
    for (const [i, t] of allAudio.entries()) {
      let levelDb: number | null = null;
      try {
        levelDb = (await measureTrackLevel(mb, t, probeWindows(duration))).db;
      } catch {
        levelDb = null;
      }
      audioTracks.push({
        id: t.id,
        index: i + 1,
        codec: t.codec,
        channels: t.numberOfChannels,
        sampleRate: t.sampleRate,
        language: t.languageCode,
        name: t.name,
        isDefault: primaryAudio ? t.id === primaryAudio.id : i === 0,
        levelDb,
      });
    }
    const chosen = chooseAudioTrack(audioTracks);
    const audio = chosen ? (allAudio.find((t) => t.id === chosen.id) ?? null) : null;
    const declaredAudio = declaredAudioTracks(scan);
    const base = {
      duration,
      width: video?.displayWidth ?? 0,
      height: video?.displayHeight ?? 0,
      videoCodec: video?.codec ?? null,
      audioCodec: audio?.codec ?? (declaredAudio[0]?.sampleEntry ?? null),
      hasAudio: audio !== null || declaredAudio.length > 0,
      scan,
      readFailure: null,
      audioTracks,
      audioTrackId: chosen?.id ?? null,
    };
    if (!video) {
      return { ...base, blocker: { code: "no_video", message: "This file has no video track." } };
    }
    try {
      if (!(await video.canDecode()) || !(await mb.canEncodeVideo("avc", { width: base.width, height: base.height }))) {
        return {
          ...base,
          blocker: {
            code: "unsupported_video",
            message: `This phone can't convert this video format (${video.codec ?? "unknown"}). It may still play here.`,
          },
        };
      }
    } catch (err) {
      return fail(err, "checks");
    }
    if (!audio && declaredAudio.length > 0) {
      const entry = declaredAudio[0]!.sampleEntry ?? "unknown";
      return {
        ...base,
        blocker: {
          code: "unsupported_audio",
          message: `This video has an audio track (${entry}) that PáircVision can't read yet, so export is turned off rather than making silent clips.`,
        },
      };
    }
    if (!audio && scan.tracks.length === 0) {
      return {
        ...base,
        blocker: {
          code: "audio_unverified",
          message: "PáircVision couldn't confirm whether this video has audio, so export is turned off rather than risk silent clips. Copy the diagnostics below and send them to the team.",
          detail: scan.error,
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
  /** Which audio track to use (AudioTrackInfo.id). Defaults to the file's primary audio track. */
  audioTrackId?: number | null;
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
  const { signal, onProgress, allowSilentSource = false, audioTrackId = null } = options;
  const { start, end } = range;
  if (!(end > start) || start < 0 || !Number.isFinite(end)) {
    throw new ClipExportError("invalid_range", "The clip's end must be after its start.");
  }
  if (signal?.aborted) throw new ClipExportError("canceled", "Export cancelled.");
  if (!hasWebCodecs()) throw new ClipExportError("no_webcodecs", "This browser can't export clips.");

  const t0 = performance.now();
  const mb = await loadEngine();
  const stats = newReadStats();
  const input = openInput(mb, file, stats);
  /** Where the export is; a failure is reported against it. */
  let stage: ExportStage = "open";
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
    stage = "tracks";
    const [video, allAudio, primaryAudio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getAudioTracks(),
      input.getPrimaryAudioTrack(),
    ]);
    stage = "checks";
    let audio = primaryAudio;
    if (audioTrackId !== null) {
      audio = allAudio.find((t) => t.id === audioTrackId) ?? null;
      if (!audio) {
        throw new ClipExportError("unsupported_audio", "The chosen audio track isn't in this video any more. Reselect the video.", { stage });
      }
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

    stage = "setup";
    const target = new mb.BufferTarget();
    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const videoSource = new mb.VideoSampleSource({ codec: "avc", bitrate: mb.QUALITY_HIGH, sizeChangeBehavior: "passThrough" });
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    const audioPackets = audio && copyAudio ? new mb.EncodedAudioPacketSource("aac") : null;
    const audioSamples = audio && !copyAudio ? new mb.AudioSampleSource({ codec: "aac", bitrate: mb.QUALITY_HIGH }) : null;
    if (audioPackets) output.addAudioTrack(audioPackets);
    if (audioSamples) output.addAudioTrack(audioSamples);
    await output.start();
    stage = "decode";

    const span = end - start;
    const videoTask = async () => {
      const sink = new mb.VideoSampleSink(video);
      let frames = 0;
      const samples = sink.samples(start, end);
      for (;;) {
        let next: IteratorResult<InstanceType<Mediabunny["VideoSample"]>>;
        try {
          next = await samples.next();
        } catch (err) {
          throw classifyError(err, "decode", stats);
        }
        if (next.done) break;
        const sample = next.value;
        if (canceled) {
          sample.close();
          break;
        }
        const ts = Math.max(0, sample.timestamp - start);
        sample.setTimestamp(ts);
        if (ts + sample.duration > span) sample.setDuration(Math.max(0.001, span - ts));
        try {
          await videoSource.add(sample);
        } catch (err) {
          throw classifyError(err, "encode", stats);
        } finally {
          sample.close();
        }
        frames++;
        onProgress?.(Math.min(0.99, (ts + 0.001) / span));
      }
      videoSource.close();
      if (!frames && !canceled) {
        throw new ClipExportError("decode_failed", "No video frames were found in this range.", { stage: "decode" });
      }
    };

    const audioTask = async () => {
      try {
        await runAudio();
      } catch (err) {
        throw classifyError(err, "audio", stats);
      }
    };
    const runAudio = async () => {
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
    stage = "write";
    await output.finalize();
    output = null;

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new ClipExportError("write_failed", "The clip came out empty.", { stage: "write" });
    }
    const blob = new Blob([buffer], { type: "video/mp4" });
    stage = "verify";
    const check = await verifyExport(mb, blob, span, audio !== null);
    let audioLevelDb: number | null = null;
    if (audio) {
      audioLevelDb = check.audioLevelDb;
      if (audioLevelDb !== null && !isAudible(audioLevelDb)) {
        // The clip's audio is silent. Fine for a genuinely quiet moment — not when the match has sound here.
        const sourceDb = (await measureTrackLevel(mb, audio, [[start, end]])).db;
        if (isAudible(sourceDb)) {
          throw new ClipExportError(
            "audio_failed",
            `The clip came out silent although the match has sound here (${sourceDb!.toFixed(0)} dB in the match, ${audioLevelDb.toFixed(0)} dB in the clip).`,
            { stage },
          );
        }
        const index = allAudio.findIndex((t) => t.id === audio!.id) + 1;
        for (const [i, other] of allAudio.entries()) {
          if (other.id === audio.id) continue;
          const otherDb = (await measureTrackLevel(mb, other, [[start, end]])).db;
          if (isAudible(otherDb)) {
            throw new ClipExportError(
              "silent_audio_track",
              `Audio track ${index} is silent in this clip, but audio track ${i + 1} has sound (${otherDb!.toFixed(0)} dB). Choose track ${i + 1} under "Clip audio" and export again.`,
              { stage },
            );
          }
        }
      }
    }
    onProgress?.(1);
    return { blob, duration: check.duration, hasAudio: audio !== null, audioLevelDb, elapsedMs: performance.now() - t0 };
  } catch (err) {
    if (userCanceled || signal?.aborted) throw new ClipExportError("canceled", "Export cancelled.");
    throw classifyError(err, stage, stats);
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
    // How loud is the clip's audio? null when this device can't decode it to check.
    let audioLevelDb: number | null = null;
    if (expectAudio && audio) {
      try {
        audioLevelDb = (await measureTrackLevel(mb, audio, [[0, duration]])).db;
      } catch {
        audioLevelDb = null;
      }
    }
    return { duration, audioLevelDb };
  } catch (err) {
    if (err instanceof ClipExportError) throw err;
    throw new ClipExportError("verification_failed", "The exported clip couldn't be read back.");
  } finally {
    out.dispose();
  }
}
