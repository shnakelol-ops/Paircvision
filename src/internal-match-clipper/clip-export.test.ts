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
}

const state = vi.hoisted(() => ({
  sourceTracks: [] as { kind: "video" | "audio"; codec: string; canDecode?: boolean }[],
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
}));

vi.mock("mediabunny", () => {
  const makeTrack = (t: FakeTrackSpec) => ({
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
  class Input {
    isOutput: boolean;
    constructor(opts: { source: BlobSource }) {
      this.isOutput = opts.source.blob.type === "video/mp4";
    }
    private tracks(): FakeTrackSpec[] {
      return this.isOutput ? state.outputTracks.map((k) => ({ kind: k, codec: k === "video" ? "avc" : "aac" })) : state.sourceTracks;
    }
    async getPrimaryVideoTrack() {
      const t = this.tracks().find((x) => x.kind === "video");
      return t ? makeTrack(t) : null;
    }
    async getPrimaryAudioTrack() {
      const t = this.tracks().find((x) => x.kind === "audio");
      return t ? makeTrack(t) : null;
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
    async *samples() {}
  }
  return {
    ALL_FORMATS: [],
    MP4: {},
    QUALITY_HIGH: {},
    BlobSource,
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

import { ClipExportError, exportClip, probeSource } from "./clip-export";

const source = new Blob([new Uint8Array(10)], { type: "" });

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

  it("wraps encoder errors as failed exports and discards the output", async () => {
    state.videoAddError = new Error("encoder crashed");
    await expectCode(exportClip(source, { start: 0, end: 6 }), "failed");
    expect(state.canceledOutputs).toBe(1);
    expect(state.finalized).toBe(0);
  });

  it("rejects an empty output and an invalid range", async () => {
    state.outputBytes = 0;
    await expectCode(exportClip(source, { start: 0, end: 6 }), "failed");
    await expectCode(exportClip(source, { start: 6, end: 6 }), "invalid_range");
  });

  it("refuses when WebCodecs is missing", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    await expectCode(exportClip(source, { start: 0, end: 6 }), "no_webcodecs");
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

  it("flags a source with no audio track", async () => {
    state.sourceTracks = [{ kind: "video", codec: "avc" }];
    expect(await probeSource(source)).toMatchObject({ hasAudio: false, blocker: null });
  });

  it("blocks when WebCodecs is missing", async () => {
    vi.stubGlobal("VideoDecoder", undefined);
    expect((await probeSource(source)).blocker?.code).toBe("no_webcodecs");
  });
});
