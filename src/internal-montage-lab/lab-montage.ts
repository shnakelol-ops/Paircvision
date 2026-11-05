// Montage Lab — EXPERIMENTAL one-pass montage used only to measure feasibility
// on a phone (Stage 0). This is not the production montage engine.
//
// Pipeline (validated on desktop in the V2 audit): one decoder pass over the
// source per clip range, one H.264 encoder session for the whole montage, AAC
// commentary packets copied back to back (no gaps, no re-encode), each clip's
// video shifted by exactly the same amount as its audio, a keyframe at every
// join. Output streams into an OPFS file (fast-start MP4 with the index space
// reserved up front), so the finished montage never has to sit in memory.

import { loadEngine } from "../internal-match-clipper/clip-export";
import { createFileSource, newReadStats } from "../internal-match-clipper/file-source";
import { isAudible, measureTrackLevel } from "../internal-match-clipper/audio-level";
import { FrameSequencer } from "./frame-sequencer";
import { estimateOutputBytes, type OutputProfile } from "./lab-plan";
import { labDir, removeLabFile, storageEstimate } from "./lab-storage";

type Mediabunny = typeof import("mediabunny");
type VideoSample = InstanceType<Mediabunny["VideoSample"]>;
type EncodedPacket = InstanceType<Mediabunny["EncodedPacket"]>;

export type OutputMode = "opfs" | "memory";

export interface MontageRunOptions {
  ranges: [number, number][];
  profile: OutputProfile;
  output: OutputMode;
  /** Audio track id from V1's probeSource (the commentary track). null = primary. */
  audioTrackId: number | null;
  signal?: AbortSignal;
  onProgress?: (fraction: number, detail: string) => void;
}

export interface MontageVerify {
  durationSeconds: number;
  videoPackets: number;
  videoTimestampsStrictlyIncreasing: boolean;
  joins: number;
  joinsOnKeyframe: number;
  audioPackets: number;
  audioGaps: number;
  /** RMS dBFS over 3 windows of the finished montage; null if not decodable here. */
  audioLevelDb: number | null;
  audible: boolean | null;
}

export interface MontageRunResult {
  ok: boolean;
  cancelled: boolean;
  error: string | null;
  errorName: string | null;
  output: OutputMode;
  outputName: string | null;
  file: File | null;
  bytes: number;
  estimateBytes: number;
  montageSeconds: number;
  elapsedMs: number;
  /** Montage seconds produced per wall-clock second. */
  realtimeFactor: number;
  width: number;
  height: number;
  downscaled: boolean;
  /** Extra decoding from each clip's preceding keyframe, summed (seconds of source). */
  seekWasteSeconds: number;
  droppedFrames: number;
  usageBefore: number | null;
  usageAfter: number | null;
  /** Length of each clip in the montage (seconds), in order; joins are their running sums. */
  spans: number[];
  verify: MontageVerify | null;
}

export async function runMontage(file: File, opts: MontageRunOptions): Promise<MontageRunResult> {
  const t0 = performance.now();
  const mb: Mediabunny = await loadEngine();
  const input = new mb.Input({ source: createFileSource(mb, file, newReadStats()), formats: mb.ALL_FORMATS });
  const est0 = await storageEstimate();
  const result: MontageRunResult = {
    ok: false, cancelled: false, error: null, errorName: null, output: opts.output, outputName: null, file: null, bytes: 0,
    estimateBytes: 0, montageSeconds: 0, elapsedMs: 0, realtimeFactor: 0, width: 0, height: 0, downscaled: false,
    seekWasteSeconds: 0, droppedFrames: 0, usageBefore: est0.usage, usageAfter: null, spans: [], verify: null,
  };
  let output: InstanceType<Mediabunny["Output"]> | null = null;
  let writable: FileSystemWritableFileStream | null = null;
  let sequencer: FrameSequencer<{ timestamp: number; duration: number; sample: VideoSample; clip: number }> | null = null;
  const canceled = () => !!opts.signal?.aborted;
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("The video has no video track.");
    const audioTracks = await input.getAudioTracks();
    const audio = opts.audioTrackId !== null ? (audioTracks.find((t) => t.id === opts.audioTrackId) ?? null) : await input.getPrimaryAudioTrack();
    if (!audio) throw new Error("The video has no usable audio track (commentary is required for this test).");
    if (audio.codec !== "aac") throw new Error(`This test copies AAC commentary; this video's audio is ${audio.codec ?? "unknown"}.`);

    // Plan: per clip, the first audio packet at/after the cut (a0), the exact
    // audio duration copied, and packet counts (needed to reserve the index).
    const pSink = new mb.EncodedPacketSink(audio);
    const vPackets = new mb.EncodedPacketSink(video);
    const meta = { metadataOnly: true } as const;
    const plan: { a0: number; span: number; audioCount: number; videoCount: number }[] = [];
    for (const [start, end] of opts.ranges) {
      let p = await pSink.getPacket(start, meta);
      let a0 = -1, span = 0, audioCount = 0;
      while (p && p.timestamp < end - 1e-6) {
        if (p.timestamp >= start - 1e-6) {
          if (a0 < 0) a0 = p.timestamp;
          span += p.duration;
          audioCount++;
        }
        p = await pSink.getNextPacket(p, meta);
      }
      if (a0 < 0 || span <= 0) throw new Error(`No audio in clip ${plan.length + 1} (${start.toFixed(1)}–${end.toFixed(1)} s).`);
      const key = await vPackets.getKeyPacket(a0, meta);
      if (key) result.seekWasteSeconds += a0 - key.timestamp;
      let v = key ?? (await vPackets.getPacket(a0, meta));
      let videoCount = 0;
      while (v && v.timestamp < a0 + span + 0.5) {
        videoCount++;
        v = await vPackets.getNextPacket(v, meta);
      }
      plan.push({ a0, span, audioCount, videoCount });
    }
    result.spans = plan.map((c) => c.span);
    result.montageSeconds = plan.reduce((n, c) => n + c.span, 0);
    result.estimateBytes = estimateOutputBytes(result.montageSeconds, opts.profile);

    const srcW = video.displayWidth, srcH = video.displayHeight;
    const scale = srcH > opts.profile.maxHeight ? opts.profile.maxHeight / srcH : 1;
    result.width = Math.round((srcW * scale) / 2) * 2;
    result.height = Math.round((srcH * scale) / 2) * 2;
    result.downscaled = scale < 1;

    // Output target.
    let target: InstanceType<Mediabunny["Target"]>;
    let handle: FileSystemFileHandle | null = null;
    if (opts.output === "opfs") {
      result.outputName = `montage-${Date.now()}.mp4`;
      handle = await (await labDir()).getFileHandle(result.outputName, { create: true });
      writable = await handle.createWritable();
      target = new mb.StreamTarget(writable as unknown as WritableStream<import("mediabunny").StreamTargetChunk>, {
        chunked: true, chunkSize: 4 * 1024 * 1024,
      });
    } else {
      target = new mb.BufferTarget();
    }
    const maxVideo = plan.reduce((n, c) => n + c.videoCount + 2, 0);
    const maxAudio = plan.reduce((n, c) => n + c.audioCount + 2, 0);
    output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: opts.output === "opfs" ? "reserve" : "in-memory" }),
      target,
    });
    const vSrc = new mb.VideoSampleSource({ codec: "avc", bitrate: opts.profile.videoBitrate, sizeChangeBehavior: "passThrough" });
    output.addVideoTrack(vSrc, { rotation: result.downscaled ? 0 : video.rotation, maximumPacketCount: maxVideo });
    const aSrc = new mb.EncodedAudioPacketSource("aac");
    output.addAudioTrack(aSrc, { maximumPacketCount: maxAudio });
    await output.start();

    const decoderConfig = (await audio.getDecoderConfig()) ?? undefined;
    const vSink = result.downscaled ? null : new mb.VideoSampleSink(video);
    const cSink = result.downscaled
      ? new mb.CanvasSink(video, { width: result.width, height: result.height, fit: "contain", poolSize: 2 })
      : null;
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
      (item) => {
        result.droppedFrames++;
        item.sample.close();
      },
    );

    let offset = 0, firstAudio = true, lastReport = 0;
    for (let k = 0; k < plan.length; k++) {
      if (canceled()) break;
      const { a0, span } = plan[k]!;
      const shift = offset - a0;
      const place = async (sample: VideoSample) => {
        const ts = Math.max(offset, sample.timestamp + shift);
        if (ts >= offset + span - 1e-6) {
          sample.close();
          return;
        }
        await sequencer!.push({ timestamp: ts, duration: sample.duration, sample, clip: k });
        const now = performance.now();
        if (now - lastReport > 500) {
          lastReport = now;
          opts.onProgress?.((offset + (ts - offset)) / result.montageSeconds, `clip ${k + 1} of ${plan.length}`);
        }
      };
      if (vSink) {
        for await (const s of vSink.samples(a0, a0 + span)) {
          if (canceled()) {
            s.close();
            break;
          }
          await place(s);
        }
      } else {
        for await (const c of cSink!.canvases(a0, a0 + span)) {
          if (canceled()) break;
          await place(new mb.VideoSample(c.canvas, { timestamp: c.timestamp, duration: c.duration }));
        }
      }
      if (canceled()) break;
      await sequencer.flush(offset + span);
      // Commentary: copy this clip's AAC packets, back to back with the previous clip's.
      let p: EncodedPacket | null = await pSink.getPacket(a0);
      let copied = 0;
      while (p && copied < plan[k]!.audioCount) {
        if (p.timestamp >= a0 - 1e-6) {
          await aSrc.add(p.clone({ timestamp: Math.max(0, p.timestamp + shift) }), firstAudio ? { decoderConfig } : undefined);
          firstAudio = false;
          copied++;
        }
        p = await pSink.getNextPacket(p);
      }
      offset += span;
    }
    if (canceled()) throw new DOMException("Cancelled", "AbortError");
    vSrc.close();
    aSrc.close();
    await output.finalize();
    output = null;
    writable = null; // closed by finalize

    if (handle) {
      result.file = await handle.getFile();
    } else {
      const buf = (target as InstanceType<Mediabunny["BufferTarget"]>).buffer;
      if (!buf) throw new Error("Empty output.");
      result.file = new File([buf], `montage-${Date.now()}.mp4`, { type: "video/mp4" });
    }
    result.bytes = result.file.size;
    result.elapsedMs = Math.round(performance.now() - t0);
    result.realtimeFactor = +(result.montageSeconds / (result.elapsedMs / 1000)).toFixed(2);
    opts.onProgress?.(1, "verifying");
    result.verify = await verifyMontage(mb, result.file, plan.map((c) => c.span));
    result.usageAfter = (await storageEstimate()).usage;
    result.ok = true;
    return result;
  } catch (err) {
    result.cancelled = canceled() || (err instanceof DOMException && err.name === "AbortError");
    result.errorName = err instanceof DOMException || err instanceof Error ? err.name : "Error";
    result.error = result.cancelled ? "Cancelled" : err instanceof Error ? err.message : String(err);
    result.elapsedMs = Math.round(performance.now() - t0);
    sequencer?.discard();
    if (output) await output.cancel().catch(() => undefined);
    if (writable) await writable.abort().catch(() => undefined);
    // A failed or cancelled montage leaves nothing behind.
    if (result.outputName) await removeLabFile(result.outputName);
    result.file = null;
    result.usageAfter = (await storageEstimate()).usage;
    return result;
  } finally {
    input.dispose();
  }
}

/** Re-opens the finished file (from disk for OPFS) and checks the montage's structure and sound. */
export async function verifyMontage(mb: Mediabunny, file: Blob, spans: number[]): Promise<MontageVerify> {
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: [mb.MP4] });
  try {
    const video = (await input.getPrimaryVideoTrack())!;
    const audio = await input.getPrimaryAudioTrack();
    const meta = { metadataOnly: true } as const;
    const joins: number[] = [];
    spans.reduce((t, s) => (joins.push(t), t + s), 0);
    const keyTimes: number[] = [];
    let videoPackets = 0, increasing = true, last = -Infinity;
    const vs = new mb.EncodedPacketSink(video);
    for (let p = await vs.getFirstPacket(meta); p; p = await vs.getNextPacket(p, meta)) {
      videoPackets++;
      if (p.timestamp <= last) increasing = false;
      last = p.timestamp;
      if (p.type === "key") keyTimes.push(p.timestamp);
    }
    let ki = 0, joinsOnKeyframe = 0;
    for (const j of joins) {
      while (ki < keyTimes.length && keyTimes[ki]! < j - 0.002) ki++;
      if (ki < keyTimes.length && Math.abs(keyTimes[ki]! - j) <= 0.002) joinsOnKeyframe++;
    }
    let audioPackets = 0, audioGaps = 0;
    let audioLevelDb: number | null = null;
    if (audio) {
      const as = new mb.EncodedPacketSink(audio);
      let prev: { t: number; d: number } | null = null;
      for (let p = await as.getFirstPacket(meta); p; p = await as.getNextPacket(p, meta)) {
        audioPackets++;
        if (prev && Math.abs(p.timestamp - (prev.t + prev.d)) > 1e-4) audioGaps++;
        prev = { t: p.timestamp, d: p.duration };
      }
      try {
        const dur = await input.computeDuration();
        const windows: [number, number][] = [0.1, 0.5, 0.9].map((f) => [dur * f, Math.min(dur, dur * f + 4)]);
        audioLevelDb = (await measureTrackLevel(mb, audio, windows)).db;
      } catch {
        audioLevelDb = null;
      }
    }
    return {
      durationSeconds: await input.computeDuration(),
      videoPackets,
      videoTimestampsStrictlyIncreasing: increasing,
      joins: joins.length,
      joinsOnKeyframe,
      audioPackets,
      audioGaps,
      audioLevelDb,
      audible: audioLevelDb === null ? null : isAudible(audioLevelDb),
    };
  } finally {
    input.dispose();
  }
}
