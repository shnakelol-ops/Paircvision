// Montage MP4 export — Match Montage V2, Stage 3 (internal, lazy-loaded).
//
// One pass over the match video, as proven on Samsung in the Montage Lab
// (PR #384): each clip's range is decoded and re-encoded into ONE H.264 track
// (720p, 3 Mbps, a keyframe at every join), and the commentary's AAC packets
// are copied unchanged — no re-encode, no mixing, no fades — with each clip's
// video shifted by exactly the same amount as its audio, so sound stays in
// sync across every join. The MP4 streams into OPFS as it is built, so the
// finished montage never has to sit in memory.
//
// Verification never treats quiet audio as a fault. It proves the result:
//  - every copied audio packet is in the MP4, byte for byte (checksums taken
//    while copying and again from the finished file), with no gaps;
//  - video timestamps only move forward and the length matches the clips.
// It fails only on a real processing fault or an unusable file.
//
// The source File is read with V1's slice reads (file-source.ts). If the
// phone stops letting the page read it (NotReadableError — seen on Samsung
// when the file changes or is re-served after it was picked), the export
// stops cleanly with "source_unreadable" so the coach can choose it again.

import { loadEngine } from "../internal-match-clipper/clip-export";
import { createFileSource, newReadStats, type ReadFailure, type ReadStats } from "../internal-match-clipper/file-source";
import { FrameSequencer } from "./frame-sequencer";
import { exportDir, hasOpfs, removeExportFile, storageRoom } from "./export-storage";

type Mediabunny = typeof import("mediabunny");
type VideoSample = InstanceType<Mediabunny["VideoSample"]>;
type EncodedPacket = InstanceType<Mediabunny["EncodedPacket"]>;

/** Approved output: 720p, 3 Mbps H.264. Sources at or below 720p keep their size. */
export const EXPORT_MAX_HEIGHT = 720;
export const EXPORT_VIDEO_BITRATE = 3_000_000;
/** Copied AAC commentary is ~128 kb/s or less. */
const AUDIO_BITRATE = 128_000;
const CONTAINER_OVERHEAD = 1.02;
/** Without OPFS the MP4 is held in memory; refuse anything bigger than this. */
export const MEMORY_FALLBACK_MAX_BYTES = 150e6;
/** Room needed beyond the estimate: phones' encoders can overshoot the target bitrate. */
export const STORAGE_SAFETY_FACTOR = 2;
const STORAGE_MARGIN_BYTES = 64e6;

export function estimateExportBytes(seconds: number): number {
  return Math.round(((EXPORT_VIDEO_BITRATE + AUDIO_BITRATE) / 8) * seconds * CONTAINER_OVERHEAD);
}

export type MontageExportErrorCode =
  | "cancelled"
  | "too_long"
  | "empty"
  | "source_unreadable"
  | "format_unreadable"
  | "no_video"
  | "no_audio"
  | "unsupported_audio"
  | "encoder_unsupported"
  | "no_storage"
  | "storage_full"
  | "verification_failed"
  | "failed";

export class MontageExportError extends Error {
  readonly code: MontageExportErrorCode;
  readonly detail: string | null;
  readonly readFailure: ReadFailure | null;
  constructor(code: MontageExportErrorCode, message: string, extra: { detail?: string | null; readFailure?: ReadFailure | null } = {}) {
    super(message);
    this.name = "MontageExportError";
    this.code = code;
    this.detail = extra.detail ?? null;
    this.readFailure = extra.readFailure ?? null;
  }
}

export interface ExportRange {
  start: number;
  end: number;
}

export interface MontageExportOptions {
  ranges: ExportRange[];
  /** Longest montage this export may build (seconds). */
  maxSeconds: number;
  /** Audio track id chosen by V1's probe (the commentary track); null = the primary track. */
  audioTrackId: number | null;
  /** Name for the file in OPFS / for saving. */
  fileName: string;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
}

export interface ExportProgress {
  stage: "checking" | "building" | "verifying";
  /** 0–1 of the whole job. */
  fraction: number;
  clip: number;
  clips: number;
}

export interface ClipVerify {
  clip: number;
  audioPackets: number;
  audioPacketsInMp4: number;
  audioIdentical: boolean;
}

export interface ExportVerify {
  ok: boolean;
  problems: string[];
  /** Advisory only (playback works either way). */
  joinsOnKeyframe: number;
  joins: number;
  durationSeconds: number;
  expectedSeconds: number;
  videoPackets: number;
  audioPackets: number;
  audioGaps: number;
  clips: ClipVerify[];
}

export interface MontageExportResult {
  file: File;
  /** OPFS file name, or null when built in memory. */
  storedName: string | null;
  bytes: number;
  estimateBytes: number;
  seconds: number;
  width: number;
  height: number;
  downscaled: boolean;
  bitrateMode: "constant" | "variable";
  /** Actual average bitrate of the whole file (video + audio), bits/s. */
  actualBitrate: number;
  elapsedMs: number;
  audioCodec: string | null;
  verify: ExportVerify;
}

/** FNV-1a 32-bit, continued across packets: one checksum per clip's audio. */
export function fnv1a(data: Uint8Array, h = 0x811c9dc5): number {
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

interface ClipPlan {
  a0: number;
  span: number;
  audioCount: number;
  videoCount: number;
}

/** Montage length from the ranges (the exact length is set by audio packet boundaries). */
export function rangesSeconds(ranges: ExportRange[]): number {
  return ranges.reduce((n, r) => n + Math.max(0, r.end - r.start), 0);
}

function errName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "Error";
}
function errText(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  return `${errName(err)}: ${msg}`;
}

function classify(err: unknown, stats: ReadStats, cancelled: boolean): MontageExportError {
  if (err instanceof MontageExportError) return err;
  if (cancelled || errName(err) === "AbortError") return new MontageExportError("cancelled", "Export cancelled.");
  if (stats.failure || errName(err) === "SourceReadError" || errName(err) === "NotReadableError") {
    return new MontageExportError(
      "source_unreadable",
      "The phone stopped letting PáircVision read the match video part-way through. Choose the video again and retry.",
      { detail: errText(err), readFailure: stats.failure },
    );
  }
  if (errName(err) === "QuotaExceededError") {
    return new MontageExportError("storage_full", "The phone ran out of space for the montage while building it.", { detail: errText(err) });
  }
  return new MontageExportError("failed", "The montage couldn't be built.", { detail: errText(err) });
}

/**
 * Builds the montage MP4. Throws MontageExportError; on any failure or cancel
 * the partial file is deleted, so nothing broken is ever left behind.
 */
export async function exportMontage(file: File, opts: MontageExportOptions): Promise<MontageExportResult> {
  const t0 = performance.now();
  const ranges = opts.ranges.filter((r) => r.end > r.start);
  if (!ranges.length) throw new MontageExportError("empty", "Add clips to the montage first.");
  const plannedSeconds = rangesSeconds(ranges);
  if (plannedSeconds > opts.maxSeconds + 0.5) {
    throw new MontageExportError("too_long", `Montages can be up to ${Math.round(opts.maxSeconds / 60)} minutes for now; this one is ${(plannedSeconds / 60).toFixed(1)}.`);
  }
  const estimateBytes = estimateExportBytes(plannedSeconds);
  const useOpfs = hasOpfs();
  if (!useOpfs && estimateBytes > MEMORY_FALLBACK_MAX_BYTES) {
    throw new MontageExportError("no_storage", "This browser has no file storage for a montage this long. Try a shorter montage, or Chrome/Brave on Android.");
  }
  const room = await storageRoom();
  const needed = estimateBytes * STORAGE_SAFETY_FACTOR + STORAGE_MARGIN_BYTES;
  if (useOpfs && room.free !== null && room.free < needed) {
    throw new MontageExportError(
      "storage_full",
      `Not enough free space for this montage: about ${Math.round(needed / 1e6)} MB is needed and ${Math.round(room.free / 1e6)} MB is available to the browser.`,
    );
  }

  const cancelled = () => !!opts.signal?.aborted;
  const stats = newReadStats();
  const mb = await loadEngine();
  const input = new mb.Input({ source: createFileSource(mb, file, stats), formats: mb.ALL_FORMATS });
  let output: InstanceType<Mediabunny["Output"]> | null = null;
  let writable: FileSystemWritableFileStream | null = null;
  let storedName: string | null = null;
  let sequencer: FrameSequencer<{ timestamp: number; duration: number; sample: VideoSample; clip: number }> | null = null;
  // Read-ahead inside the engine can reject after the export has already stopped; don't surface those as page errors.
  const quiet = (e: PromiseRejectionEvent) => {
    if (["SourceReadError", "NotReadableError", "AbortError"].includes(errName(e.reason))) e.preventDefault();
  };
  window.addEventListener("unhandledrejection", quiet);
  const progress = (stage: ExportProgress["stage"], fraction: number, clip: number) =>
    opts.onProgress?.({ stage, fraction: Math.min(1, Math.max(0, fraction)), clip, clips: ranges.length });

  try {
    progress("checking", 0, 0);
    let video, audio;
    try {
      video = await input.getPrimaryVideoTrack();
      const audioTracks = await input.getAudioTracks();
      audio = opts.audioTrackId !== null ? (audioTracks.find((t) => t.id === opts.audioTrackId) ?? null) : await input.getPrimaryAudioTrack();
    } catch (err) {
      if (stats.failure) throw err;
      throw new MontageExportError("format_unreadable", "This video's format couldn't be read for a montage.", { detail: errText(err) });
    }
    if (!video) throw new MontageExportError("no_video", "The match video has no video track.");
    if (!audio) throw new MontageExportError("no_audio", "The match video has no audio track, so a montage would be silent. Montages keep the commentary, so this video can't be used.");
    if (audio.codec !== "aac") {
      throw new MontageExportError("unsupported_audio", `Montages copy the commentary exactly, which needs AAC audio; this video's audio is ${audio.codec ?? "unknown"}.`);
    }

    // Plan: per clip, the first audio packet at/after the cut (a0) and the
    // exact audio length copied; packet counts reserve the MP4 index.
    const aSink = new mb.EncodedPacketSink(audio);
    const vMeta = new mb.EncodedPacketSink(video);
    const meta = { metadataOnly: true } as const;
    const plan: ClipPlan[] = [];
    for (const [k, r] of ranges.entries()) {
      if (cancelled()) throw new DOMException("Cancelled", "AbortError");
      let p = await aSink.getPacket(r.start, meta);
      let a0 = -1, span = 0, audioCount = 0;
      while (p && p.timestamp < r.end - 1e-6) {
        if (p.timestamp >= r.start - 1e-6) {
          if (a0 < 0) a0 = p.timestamp;
          span += p.duration;
          audioCount++;
        }
        p = await aSink.getNextPacket(p, meta);
      }
      if (a0 < 0 || span <= 0) throw new MontageExportError("no_audio", `Clip ${k + 1} (${r.start.toFixed(1)}–${r.end.toFixed(1)} s) has no audio in the match video.`);
      const key = await vMeta.getKeyPacket(a0, meta);
      let v = key ?? (await vMeta.getPacket(a0, meta));
      let videoCount = 0;
      while (v && v.timestamp < a0 + span + 0.5) {
        videoCount++;
        v = await vMeta.getNextPacket(v, meta);
      }
      plan.push({ a0, span, audioCount, videoCount });
      progress("checking", (0.05 * (k + 1)) / ranges.length, k + 1);
    }
    const seconds = plan.reduce((n, c) => n + c.span, 0);

    const srcW = video.displayWidth, srcH = video.displayHeight;
    const scale = srcH > EXPORT_MAX_HEIGHT ? EXPORT_MAX_HEIGHT / srcH : 1;
    const downscaled = scale < 1;
    const width = downscaled ? Math.round((srcW * scale) / 2) * 2 : srcW;
    const height = downscaled ? Math.round((srcH * scale) / 2) * 2 : srcH;
    if (!(await mb.canEncodeVideo("avc", { width, height, bitrate: EXPORT_VIDEO_BITRATE }))) {
      throw new MontageExportError("encoder_unsupported", "This phone's browser can't encode H.264 video at this size.");
    }
    // Constant bitrate keeps file sizes predictable on phones whose encoders overshoot in variable mode.
    const bitrateMode: "constant" | "variable" = (await mb.canEncodeVideo("avc", { width, height, bitrate: EXPORT_VIDEO_BITRATE, bitrateMode: "constant" }).catch(() => false))
      ? "constant"
      : "variable";

    let target: InstanceType<Mediabunny["Target"]>;
    let handle: FileSystemFileHandle | null = null;
    if (useOpfs) {
      storedName = opts.fileName;
      handle = await (await exportDir()).getFileHandle(storedName, { create: true });
      writable = await handle.createWritable();
      target = new mb.StreamTarget(writable as unknown as WritableStream<import("mediabunny").StreamTargetChunk>, { chunked: true, chunkSize: 4 * 1024 * 1024 });
    } else {
      target = new mb.BufferTarget();
    }
    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: useOpfs ? "reserve" : "in-memory" }), target });
    const vSrc = new mb.VideoSampleSource({ codec: "avc", bitrate: EXPORT_VIDEO_BITRATE, bitrateMode, sizeChangeBehavior: "passThrough" });
    output.addVideoTrack(vSrc, { rotation: downscaled ? 0 : video.rotation, maximumPacketCount: plan.reduce((n, c) => n + c.videoCount + 2, 0) });
    const aSrc = new mb.EncodedAudioPacketSource("aac");
    output.addAudioTrack(aSrc, { maximumPacketCount: plan.reduce((n, c) => n + c.audioCount + 2, 0) });
    await output.start();
    const decoderConfig = (await audio.getDecoderConfig()) ?? undefined;

    const vSink = downscaled ? null : new mb.VideoSampleSink(video);
    const cSink = downscaled ? new mb.CanvasSink(video, { width, height, fit: "contain", poolSize: 2 }) : null;
    let lastKeyClip = -1;
    sequencer = new FrameSequencer(
      async (item) => {
        item.sample.setTimestamp(item.timestamp);
        item.sample.setDuration(item.duration);
        const key = item.clip !== lastKeyClip;
        lastKeyClip = item.clip;
        try {
          await vSrc.add(item.sample, key ? { keyFrame: true } : undefined);
        } finally {
          item.sample.close();
        }
      },
      (item) => item.sample.close(),
    );

    const checksums: { count: number; hash: number }[] = [];
    let offset = 0, firstAudio = true, lastReport = 0;
    for (let k = 0; k < plan.length; k++) {
      if (cancelled()) throw new DOMException("Cancelled", "AbortError");
      const { a0, span, audioCount } = plan[k]!;
      const shift = offset - a0;
      const place = async (sample: VideoSample) => {
        const ts = Math.max(offset, sample.timestamp + shift);
        if (ts >= offset + span - 1e-6) {
          sample.close();
          return;
        }
        await sequencer!.push({ timestamp: ts, duration: sample.duration, sample, clip: k });
        const now = performance.now();
        if (now - lastReport > 250) {
          lastReport = now;
          progress("building", 0.05 + 0.85 * (ts / seconds), k + 1);
        }
      };
      if (vSink) {
        for await (const s of vSink.samples(a0, a0 + span)) {
          if (cancelled()) {
            s.close();
            throw new DOMException("Cancelled", "AbortError");
          }
          await place(s);
        }
      } else {
        for await (const c of cSink!.canvases(a0, a0 + span)) {
          if (cancelled()) throw new DOMException("Cancelled", "AbortError");
          await place(new mb.VideoSample(c.canvas, { timestamp: c.timestamp, duration: c.duration }));
        }
      }
      await sequencer.flush(offset + span);
      // Commentary: this clip's AAC packets, unchanged, back to back with the previous clip's.
      let p: EncodedPacket | null = await aSink.getPacket(a0);
      let copied = 0, hash = 0x811c9dc5;
      while (p && copied < audioCount) {
        if (p.timestamp >= a0 - 1e-6) {
          hash = fnv1a(p.data, hash);
          await aSrc.add(p.clone({ timestamp: Math.max(0, p.timestamp + shift) }), firstAudio ? { decoderConfig } : undefined);
          firstAudio = false;
          copied++;
        }
        p = await aSink.getNextPacket(p);
      }
      if (copied !== audioCount) {
        throw new MontageExportError("verification_failed", `Clip ${k + 1}: only ${copied} of ${audioCount} audio packets could be copied.`);
      }
      checksums.push({ count: copied, hash });
      offset += span;
    }
    vSrc.close();
    aSrc.close();
    await output.finalize();
    output = null;
    writable = null; // closed by finalize

    let built: File;
    if (handle) {
      built = await handle.getFile();
    } else {
      const buf = (target as InstanceType<Mediabunny["BufferTarget"]>).buffer;
      if (!buf) throw new MontageExportError("failed", "The montage came out empty.");
      built = new File([buf], opts.fileName, { type: "video/mp4" });
    }

    progress("verifying", 0.92, plan.length);
    const verify = await verifyMontage(mb, built, plan.map((c) => c.span), checksums, (f) => progress("verifying", 0.92 + 0.08 * f, plan.length));
    if (!verify.ok) {
      throw new MontageExportError("verification_failed", "The finished montage didn't pass its checks, so it was deleted.", { detail: verify.problems.join("; ") });
    }
    progress("verifying", 1, plan.length);
    return {
      file: built,
      storedName,
      bytes: built.size,
      estimateBytes,
      seconds,
      width,
      height,
      downscaled,
      bitrateMode,
      actualBitrate: Math.round((built.size * 8) / Math.max(0.001, verify.durationSeconds)),
      elapsedMs: Math.round(performance.now() - t0),
      audioCodec: decoderConfig?.codec ?? null,
      verify,
    };
  } catch (err) {
    const e = classify(err, stats, cancelled());
    sequencer?.discard();
    if (output) await output.cancel().catch(() => undefined);
    if (writable) await writable.abort().catch(() => undefined);
    if (storedName) await removeExportFile(storedName);
    throw e;
  } finally {
    input.dispose();
    window.removeEventListener("unhandledrejection", quiet);
  }
}

/**
 * Re-opens the finished MP4 and checks it: every audio packet present and
 * byte-identical to the copy (per clip), no audio gaps, video timestamps
 * increasing, length as planned. Keyframes at joins are reported, not required.
 */
export async function verifyMontage(
  mb: Mediabunny,
  file: Blob,
  spans: number[],
  checksums: { count: number; hash: number }[],
  onProgress?: (fraction: number) => void,
): Promise<ExportVerify> {
  const stats = newReadStats();
  const input = new mb.Input({ source: createFileSource(mb, file, stats), formats: [mb.MP4] });
  const problems: string[] = [];
  const expectedSeconds = spans.reduce((n, s) => n + s, 0);
  const result: ExportVerify = {
    ok: false, problems, joinsOnKeyframe: 0, joins: spans.length, durationSeconds: 0, expectedSeconds,
    videoPackets: 0, audioPackets: 0, audioGaps: 0, clips: [],
  };
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video) problems.push("no video track in the MP4");
    if (!audio) problems.push("no audio track in the MP4");
    if (!video || !audio) return result;
    const meta = { metadataOnly: true } as const;
    const joins: number[] = [];
    spans.reduce((t, s) => (joins.push(t), t + s), 0);

    const keyTimes: number[] = [];
    let last = -Infinity, increasing = true;
    const vs = new mb.EncodedPacketSink(video);
    for (let p = await vs.getFirstPacket(meta); p; p = await vs.getNextPacket(p, meta)) {
      result.videoPackets++;
      if (p.timestamp <= last) increasing = false;
      last = p.timestamp;
      if (p.type === "key") keyTimes.push(p.timestamp);
    }
    if (!result.videoPackets) problems.push("the MP4 has no video frames");
    if (!increasing) problems.push("video timestamps go backwards");
    let ki = 0;
    for (const j of joins) {
      while (ki < keyTimes.length && keyTimes[ki]! < j - 0.002) ki++;
      if (ki < keyTimes.length && Math.abs(keyTimes[ki]! - j) <= 0.002) result.joinsOnKeyframe++;
    }
    onProgress?.(0.3);

    // Audio: walk the packets with their data, clip by clip, and compare checksums.
    const as = new mb.EncodedPacketSink(audio);
    let p = await as.getFirstPacket();
    let prevEnd: number | null = null;
    const total = checksums.reduce((n, c) => n + c.count, 0);
    for (const [k, c] of checksums.entries()) {
      let n = 0, hash = 0x811c9dc5;
      while (p && n < c.count) {
        hash = fnv1a(p.data, hash);
        if (prevEnd !== null && Math.abs(p.timestamp - prevEnd) > 1e-4) result.audioGaps++;
        prevEnd = p.timestamp + p.duration;
        result.audioPackets++;
        n++;
        p = await as.getNextPacket(p);
      }
      const identical = n === c.count && hash === c.hash;
      result.clips.push({ clip: k + 1, audioPackets: c.count, audioPacketsInMp4: n, audioIdentical: identical });
      if (n < c.count) problems.push(`clip ${k + 1}: ${c.count - n} audio packets missing`);
      else if (!identical) problems.push(`clip ${k + 1}: audio differs from the match video`);
      onProgress?.(0.3 + (0.7 * result.audioPackets) / Math.max(1, total));
    }
    while (p) {
      result.audioPackets++;
      p = await as.getNextPacket(p);
    }
    if (result.audioPackets > total) problems.push(`${result.audioPackets - total} unexpected extra audio packets`);
    if (result.audioGaps) problems.push(`${result.audioGaps} gaps in the audio`);

    result.durationSeconds = await input.computeDuration();
    if (Math.abs(result.durationSeconds - expectedSeconds) > 0.25) {
      problems.push(`length ${result.durationSeconds.toFixed(2)} s, expected ${expectedSeconds.toFixed(2)} s`);
    }
    result.ok = problems.length === 0;
    return result;
  } catch (err) {
    problems.push(`the MP4 couldn't be read back (${errText(err)})`);
    return result;
  } finally {
    input.dispose();
  }
}
