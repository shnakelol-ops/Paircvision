import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A scriptable stand-in for Mediabunny's sink/source primitives. Real exports
// are verified end to end in Chromium against the synthetic reference match
// (frame accuracy, A/V sync — see the PR's test report); these tests pin the
// wrapper's timing and safety rules.
type Kind = "video" | "audio";
interface FakeTrackSpec {
  kind: Kind;
  codec: string;
  canDecode?: boolean;
  id?: number;
  /** Decoded sample amplitude for audio tracks (0 = digital silence). */
  amplitude?: number;
}

const state = vi.hoisted(() => ({
  sourceTracks: [] as { kind: "video" | "audio"; codec: string; canDecode?: boolean; id?: number; amplitude?: number }[],
  /** Amplitude of the exported clip's decoded audio. */
  outputAmplitude: 0.1,
  outputTracks: ["video", "audio"] as ("video" | "audio")[],
  outputDuration: 6,
  outputBytes: 1000,
  canEncodeAac: true,
  canEncodeAvc: true,
  videoFrames: [] as { ts: number; dur: number }[],
  audioPackets: [] as number[],
  writtenVideo: [] as { ts: number; dur: number }[],
  writtenAudio: [] as { ts: number; meta: unknown }[],
  onVideoFrame: null as null | ((i: number) => void | Promise<void>),
  videoAddError: null as Error | null,
  disposed: 0,
  canceledOutputs: 0,
  finalized: 0,
  readFailsAt: null as number | null,
  decodeError: null as Error | null,
  parseError: null as Error | null,
}));

vi.mock("mediabunny", () => {
  const makeTrack = (t: FakeTrackSpec, isOutput = false, i = 0) => ({
    id: t.id ?? i + 1,
    isOutput,
    amplitude: t.amplitude ?? 0.1,
    numberOfChannels: 1,
    sampleRate: 48000,
    languageCode: "und",
    name: null,
    kind: t.kind,
    codec: t.codec,
    displayWidth: 854,
    displayHeight: 480,
    rotation: 0,
    isVideoTrack: () => t.kind === "video",
    isAudioTrack: () => t.kind === "audio",
    canDecode: async () => t.canDecode ?? true,
    getDecoderConfig: async () => ({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2 }),
  });
  class BlobSource {
    blob: Blob;
    constructor(blob: Blob) {
      this.blob = blob;
    }
  }
  class StreamSource {
    opts: { read: (s: number, e: number) => Promise<Uint8Array>; getSize: () => number };
    constructor(opts: { read: (s: number, e: number) => Promise<Uint8Array>; getSize: () => number }) {
      this.opts = opts;
    }
  }
  class Input {
    isOutput: boolean;
    source: BlobSource | StreamSource;
    constructor(opts: { source: BlobSource | StreamSource }) {
      // The source match is read through our StreamSource; only the exported clip uses BlobSource.
      this.source = opts.source;
      this.isOutput = opts.source instanceof BlobSource;
    }
    private async touch() {
      if (state.readFailsAt !== null && this.source instanceof StreamSource) {
        await this.source.opts.read(state.readFailsAt, state.readFailsAt + 16);
      }
      if (state.parseError) throw state.parseError;
    }
    private tracks(): FakeTrackSpec[] {
      return this.isOutput ? state.outputTracks.map((k) => ({ kind: k, codec: k === "video" ? "avc" : "aac" })) : state.sourceTracks;
    }
    async getPrimaryVideoTrack() {
      if (!this.isOutput) await this.touch();
      const t = this.tracks().find((x) => x.kind === "video");
      return t ? makeTrack(t) : null;
    }
    async getPrimaryAudioTrack() {
      const all = this.tracks();
      const i = all.findIndex((x) => x.kind === "audio");
      return i >= 0 ? makeTrack(all[i]!, this.isOutput, i) : null;
    }
    async getAudioTracks() {
      return this.tracks()
        .map((t, i) => [t, i] as const)
        .filter(([t]) => t.kind === "audio")
        .map(([t, i]) => makeTrack(t, this.isOutput, i));
    }
    async computeDuration() {
      return this.isOutput ? state.outputDuration : 4620;
    }
    dispose() {
      state.disposed++;
    }
  }
  class BufferTarget {
    buffer: ArrayBuffer | null = null;
  }
  class Output {
    target: BufferTarget;
    constructor(opts: { target: BufferTarget }) {
      this.target = opts.target;
    }
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    async finalize() {
      state.finalized++;
      this.target.buffer = new ArrayBuffer(state.outputBytes);
    }
    async cancel() {
      state.canceledOutputs++;
    }
  }
  class Mp4OutputFormat {}
  class VideoSampleSource {
    async add(sample: { timestamp: number; duration: number }) {
      if (state.videoAddError) throw state.videoAddError;
      state.writtenVideo.push({ ts: sample.timestamp, dur: sample.duration });
    }
    close() {}
  }
  class EncodedAudioPacketSource {
    async add(packet: { timestamp: number }, meta?: unknown) {
      state.writtenAudio.push({ ts: packet.timestamp, meta });
    }
    close() {}
  }
  class AudioSampleSource extends EncodedAudioPacketSource {}
  class VideoSampleSink {
    async *samples(start: number, end: number) {
      const frames = state.videoFrames.filter((f) => f.ts + f.dur > start && f.ts < end);
      for (let i = 0; i < frames.length; i++) {
        if (state.decodeError) throw state.decodeError;
        await state.onVideoFrame?.(i);
        const f = frames[i]!;
        yield {
          timestamp: f.ts,
          duration: f.dur,
          setTimestamp(t: number) {
            this.timestamp = t;
          },
          setDuration(d: number) {
            this.duration = d;
          },
          close() {},
        };
      }
    }
  }
  const packet = (ts: number) => ({ timestamp: ts, clone: (o: { timestamp: number }) => packet(o.timestamp) });
  class EncodedPacketSink {
    async getPacket(t: number) {
      const before = state.audioPackets.filter((p) => p <= t);
      return before.length ? packet(before[before.length - 1]!) : null;
    }
    async getNextPacket(p: { timestamp: number }) {
      const next = state.audioPackets.find((x) => x > p.timestamp);
      return next === undefined ? null : packet(next);
    }
  }
  class AudioSampleSink {
    track: { isOutput: boolean; amplitude: number };
    constructor(track: { isOutput: boolean; amplitude: number }) {
      this.track = track;
    }
    async *samples(start = 0, end = 6) {
      const amp = this.track.isOutput ? state.outputAmplitude : this.track.amplitude;
      for (let t = start; t < end && t < start + 25; t += 0.5) {
        yield {
          timestamp: t,
          duration: 0.5,
          numberOfChannels: 1,
          setTimestamp(v: number) {
            this.timestamp = v;
          },
          allocationSize: () => 400,
          copyTo: (buf: Float32Array) => buf.fill(amp, 0, 100),
          close() {},
        };
      }
    }
  }
  return {
    ALL_FORMATS: [],
    MP4: {},
    QUALITY_HIGH: {},
    BlobSource,
    StreamSource,
    Input,
    Output,
    BufferTarget,
    Mp4OutputFormat,
    VideoSampleSource,
    EncodedAudioPacketSource,
    AudioSampleSource,
    VideoSampleSink,
    EncodedPacketSink,
    AudioSampleSink,
    canEncodeAudio: async () => state.canEncodeAac,
    canEncodeVideo: async () => state.canEncodeAvc,
  };
});

import { readFileSync } from "node:fs";
import { ClipExportError, exportClip, probeSource } from "./clip-export";

const fixture = (name: string) => new Blob([readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))]);
// Real MP4 bytes, so the independent structure scan sees real tracks; Mediabunny itself is scripted above.
const source = fixture("aac-faststart.mp4");
const silentSource = fixture("no-audio.mp4");

/** A File-like Blob whose reads fail from `failFrom` on, like an Android file that stops being readable. */
function failingBlob(inner: Blob, failFrom: number, name = "NotReadableError"): Blob {
  const wrap = (b: Blob, offset: number): Blob =>
    ({
      size: b.size,
      type: b.type,
      slice: (s = 0, e = b.size) => wrap(b.slice(s, e), offset + s),
      arrayBuffer: async () => {
        if (offset >= failFrom) throw new DOMException("The requested file could not be read", name);
        return b.arrayBuffer();
      },
    }) as unknown as Blob;
  return wrap(inner, 0);
}

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ClipExportError);
  expect((err as ClipExportError).code).toBe(code);
}

const FPS = 25;
const AAC_FRAME = 1024 / 48000;

beforeEach(() => {
  Object.assign(state, {
    sourceTracks: [{ kind: "video", codec: "avc" }, { kind: "audio", codec: "aac" }],
    outputAmplitude: 0.1,
    outputTracks: ["video", "audio"],
    outputDuration: 6,
    outputBytes: 1000,
    canEncodeAac: true,
    canEncodeAvc: true,
    // 40 s of 25 fps video and 48 kHz AAC.
    videoFrames: Array.from({ length: 40 * FPS }, (_, i) => ({ ts: i / FPS, dur: 1 / FPS })),
    audioPackets: Array.from({ length: Math.ceil(40 / AAC_FRAME) }, (_, i) => i * AAC_FRAME),
    writtenVideo: [],
    writtenAudio: [],
    onVideoFrame: null,
    videoAddError: null,
    disposed: 0,
    canceledOutputs: 0,
    finalized: 0,
    readFailsAt: null,
    decodeError: null,
    parseError: null,
  });
  vi.stubGlobal("VideoEncoder", function VideoEncoder() {});
  vi.stubGlobal("VideoDecoder", function VideoDecoder() {});
});
afterEach(() => vi.unstubAllGlobals());

describe("exportClip", () => {
  it("shifts every video frame and audio packet by exactly the start time", async () => {
    const progress: number[] = [];
    const out = await exportClip(source, { start: 10, end: 16 }, { onProgress: (p) => progress.push(p) });
    expect(out.blob.type).toBe("video/mp4");
    expect(out.hasAudio).toBe(true);

    expect(state.writtenVideo).toHaveLength(6 * FPS);
    expect(state.writtenVideo[0]!.ts).toBeCloseTo(0, 9);
    expect(state.writtenVideo.at(-1)!.ts).toBeCloseTo(6 - 1 / FPS, 9);

    // Audio: first packet at/after the cut, timing preserved (offset < one AAC frame).
    const firstAudio = state.writtenAudio[0]!;
    expect(firstAudio.ts).toBeGreaterThanOrEqual(0);
    expect(firstAudio.ts).toBeLessThan(AAC_FRAME);
    expect(firstAudio.meta).toMatchObject({ decoderConfig: { codec: "mp4a.40.2" } });
    expect(state.writtenAudio[1]!.meta).toBeUndefined();
    for (const p of state.writtenAudio) {
      const sourceTs = p.ts + 10;
      expect(Math.abs(sourceTs / AAC_FRAME - Math.round(sourceTs / AAC_FRAME))).toBeLessThan(1e-6);
    }
    expect(state.writtenAudio.at(-1)!.ts).toBeLessThan(6);
    expect(progress.at(-1)).toBe(1);
    expect(state.finalized).toBe(1);
    expect(state.disposed).toBe(2); // source + verification inputs released
  });

  it("keeps the frame showing at a mid-frame start, clamped to 0, and trims the last frame to the end", async () => {
    state.outputDuration = 0.48;
    await exportClip(source, { start: 10.02, end: 10.5 });
    expect(state.writtenVideo[0]!.ts).toBe(0);
    const last = state.writtenVideo.at(-1)!;
    expect(last.ts + last.dur).toBeCloseTo(0.48, 6);
  });

  it("refuses a source with no audio track unless the caller explicitly allows it", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }];
    state.outputTracks = ["video"];
    await expectCode(exportClip(source, { start: 0, end: 6 }), "unsupported_audio");
    const out = await exportClip(source, { start: 0, end: 6 }, { allowSilentSource: true });
    expect(out.hasAudio).toBe(false);
    expect(state.writtenAudio).toEqual([]);
  });

  it("refuses non-AAC audio this device can't convert, rather than dropping it", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }, { kind: "audio", codec: "opus" }];
    state.canEncodeAac = false;
    await expectCode(exportClip(source, { start: 0, end: 6 }), "unsupported_audio");
    expect(state.finalized).toBe(0);
  });

  it("fails when the range holds no audio", async () => {
    state.audioPackets = [];
    await expectCode(exportClip(source, { start: 0, end: 6 }), "unsupported_audio");
    expect(state.canceledOutputs).toBe(1);
  });

  it("fails verification if the written file lost its audio", async () => {
    state.outputTracks = ["video"];
    await expectCode(exportClip(source, { start: 0, end: 6 }), "verification_failed");
  });

  it("fails verification if the written clip is the wrong length", async () => {
    state.outputDuration = 9;
    await expectCode(exportClip(source, { start: 0, end: 6 }), "verification_failed");
  });

  it("reports an undecodable video and an unavailable H.264 encoder", async () => {
    state.sourceTracks = [{ kind: "video", codec: "hevc", canDecode: false }, { kind: "audio", codec: "aac" }];
    await expectCode(exportClip(source, { start: 0, end: 6 }), "unsupported_video");
    state.sourceTracks = [{ kind: "video", codec: "avc" }, { kind: "audio", codec: "aac" }];
    state.canEncodeAvc = false;
    await expectCode(exportClip(source, { start: 0, end: 6 }), "unsupported_video");
  });

  it("cancels mid-export, discards the partial output and releases the source", async () => {
    const ac = new AbortController();
    state.onVideoFrame = (i) => {
      if (i === 20) ac.abort();
    };
    await expectCode(exportClip(source, { start: 0, end: 6 }, { signal: ac.signal }), "canceled");
    expect(state.finalized).toBe(0);
    expect(state.canceledOutputs).toBe(1);
    expect(state.disposed).toBe(1);
    expect(state.writtenVideo.length).toBeLessThan(6 * FPS);
  });

  it("does nothing when already cancelled", async () => {
    const ac = new AbortController();
    ac.abort();
    await expectCode(exportClip(source, { start: 0, end: 6 }, { signal: ac.signal }), "canceled");
    expect(state.disposed).toBe(0);
  });

  it("reports encoder errors as encode failures with the raw error, and discards the output", async () => {
    state.videoAddError = new DOMException("Encoding error.", "EncodingError");
    const err = await exportClip(source, { start: 0, end: 6 }).catch((e: ClipExportError) => e);
    expect(err).toMatchObject({ code: "encode_failed", stage: "encode", detail: "EncodingError: Encoding error." });
    expect(state.canceledOutputs).toBe(1);
    expect(state.finalized).toBe(0);
  });

  it("reports decoder errors as decode failures", async () => {
    state.decodeError = new DOMException("Decoding error.", "OperationError");
    const err = await exportClip(source, { start: 0, end: 6 }).catch((e: ClipExportError) => e);
    expect(err).toMatchObject({ code: "decode_failed", stage: "decode", detail: "OperationError: Decoding error." });
  });

  it("reports a file that stops being readable as file_unreadable — not as a format problem", async () => {
    state.readFailsAt = 5000; // e.g. Android revokes access after the file check passed
    const err = (await exportClip(failingBlob(source, 5000), { start: 0, end: 6 }).catch((e: ClipExportError) => e)) as ClipExportError;
    expect(err).toMatchObject({ code: "file_unreadable", stage: "tracks" });
    expect(err.message).toMatch(/NotReadableError/);
    expect(err.message).toMatch(/reselect the video/);
    expect(err.readFailure).toMatchObject({ name: "NotReadableError", start: 5000 });
  });

  it("reports an unparseable container as format_unreadable with the engine's message", async () => {
    state.parseError = new Error("Invalid box size");
    const err = await exportClip(source, { start: 0, end: 6 }).catch((e: ClipExportError) => e);
    expect(err).toMatchObject({ code: "format_unreadable", stage: "tracks", detail: "Error: Invalid box size" });
  });

  it("retries a single transient read failure", async () => {
    let failures = 1;
    const flaky = {
      size: source.size,
      type: "",
      slice: (s?: number, e?: number) => {
        const part = source.slice(s, e);
        return {
          size: part.size,
          arrayBuffer: async () => {
            if (failures-- > 0) throw new DOMException("busy", "NotReadableError");
            return part.arrayBuffer();
          },
        };
      },
    } as unknown as Blob;
    state.readFailsAt = 0;
    await expect(exportClip(flaky, { start: 0, end: 6 })).resolves.toMatchObject({ hasAudio: true });
  });

  it("rejects an empty output and an invalid range", async () => {
    state.outputBytes = 0;
    await expectCode(exportClip(source, { start: 0, end: 6 }), "write_failed");
    await expectCode(exportClip(source, { start: 6, end: 6 }), "invalid_range");
  });

  it("refuses when WebCodecs is missing", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    await expectCode(exportClip(source, { start: 0, end: 6 }), "no_webcodecs");
  });
});

describe("commentary audio (R3)", () => {
  const twoTracks = (first: number, second: number) => [
    { kind: "video" as const, codec: "avc" },
    { kind: "audio" as const, codec: "aac", id: 2, amplitude: first },
    { kind: "audio" as const, codec: "aac", id: 3, amplitude: second },
  ];

  it("chooses the track with commentary when the default audio track is silent", async () => {
    state.sourceTracks = twoTracks(0, 0.1);
    const p = await probeSource(source);
    expect(p.audioTracks.map((t) => [t.index, t.isDefault, Math.round(t.levelDb!)])).toEqual([[1, true, -120], [2, false, -20]]);
    expect(p.audioTrackId).toBe(3);
    expect(p.blocker).toBeNull();
  });

  it("keeps the default track when it has sound", async () => {
    state.sourceTracks = twoTracks(0.05, 0.1);
    expect((await probeSource(source)).audioTrackId).toBe(2);
  });

  it("exports with the requested audio track and reports the clip's level", async () => {
    state.sourceTracks = twoTracks(0, 0.1);
    const out = await exportClip(source, { start: 10, end: 16 }, { audioTrackId: 3 });
    expect(out.audioLevelDb).toBeCloseTo(-20, 0);
  });

  it("fails a clip that came out silent although the match has sound there", async () => {
    state.outputAmplitude = 0;
    const err = (await exportClip(source, { start: 10, end: 16 }).catch((e: unknown) => e)) as ClipExportError;
    expect(err).toMatchObject({ code: "audio_failed", stage: "verify" });
    expect(err.message).toMatch(/came out silent although the match has sound here/);
    expect(state.finalized).toBe(1); // written, then rejected — never handed to the coach
  });

  it("names the other track when the chosen one is silent in this clip", async () => {
    state.sourceTracks = twoTracks(0, 0.1);
    state.outputAmplitude = 0;
    const err = (await exportClip(source, { start: 10, end: 16 }, { audioTrackId: 2 }).catch((e: unknown) => e)) as ClipExportError;
    expect(err.code).toBe("silent_audio_track");
    expect(err.message).toMatch(/Audio track 1 is silent in this clip, but audio track 2 has sound/);
  });

  it("allows a genuinely quiet moment (every track silent there) and reports it", async () => {
    state.sourceTracks = twoTracks(0, 0);
    state.outputAmplitude = 0;
    const out = await exportClip(source, { start: 10, end: 16 }, { audioTrackId: 2 });
    expect(out.audioLevelDb).toBe(-120);
  });

  it("refuses an audio track id the file doesn't have", async () => {
    await expectCode(exportClip(source, { start: 0, end: 6 }, { audioTrackId: 99 }), "unsupported_audio");
  });
});

describe("probeSource", () => {
  it("allows a normal H.264/AAC match", async () => {
    expect(await probeSource(source)).toMatchObject({ duration: 4620, hasAudio: true, videoCodec: "avc", audioCodec: "aac", blocker: null });
  });

  it("blocks export when non-AAC audio can't be converted on this device", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }, { kind: "audio", codec: "opus" }];
    state.canEncodeAac = false;
    expect((await probeSource(source)).blocker?.code).toBe("unsupported_audio");
  });

  it("blocks export for an undecodable video codec", async () => {
    state.sourceTracks = [{ kind: "video", codec: "hevc", canDecode: false }, { kind: "audio", codec: "aac" }];
    expect((await probeSource(source)).blocker?.code).toBe("unsupported_video");
  });

  it("reports no audio only when the file's own structure also lists no audio track", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }];
    const p = await probeSource(silentSource);
    expect(p).toMatchObject({ hasAudio: false, blocker: null });
    expect(p.scan?.tracks.map((t) => t.handler)).toEqual(["vide"]);
  });

  it("never reports 'no audio' when the file declares an audio track the engine didn't expose", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }]; // engine sees no audio…
    const p = await probeSource(source); // …but the file has a soun/mp4a track
    expect(p.hasAudio).toBe(true);
    expect(p.blocker?.code).toBe("unsupported_audio");
    expect(p.blocker?.message).toMatch(/audio track \(mp4a\)/);
  });

  it("refuses when audio can't be confirmed either way", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }];
    const p = await probeSource(new Blob([new Uint8Array(64)]));
    expect(p.blocker?.code).toBe("audio_unverified");
  });

  it("reports a file the phone won't read as a file-access problem, with the browser's own error", async () => {
    const p = await probeSource(failingBlob(source, 0));
    expect(p.blocker?.code).toBe("file_unreadable");
    expect(p.blocker?.detail).toMatch(/^NotReadableError/);
    expect(p.readFailure).toMatchObject({ name: "NotReadableError", start: 0, retried: true });
  });

  it("blocks when WebCodecs is missing", async () => {
    vi.stubGlobal("VideoDecoder", undefined);
    expect((await probeSource(source)).blocker?.code).toBe("no_webcodecs");
  });
});
