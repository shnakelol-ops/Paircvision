import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newReadStats, readFileRange, SourceReadError } from "./file-source";
import { declaredAudioTracks, scanMp4 } from "./mp4-scan";

// Fixtures are 1-second files made with ffmpeg (see PR #383). samr-audio.mp4 is
// aac-faststart.mp4 with its audio sample entry renamed to AMR's 'samr'.
const fixture = (name: string) => new Blob([readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))]);

describe("scanMp4", () => {
  it("lists video and AAC audio tracks with their details (moov first)", async () => {
    const scan = await scanMp4(fixture("aac-faststart.mp4"));
    expect(scan.error).toBeNull();
    expect(scan.topLevel.map((b) => b.type).slice(0, 2)).toEqual(["ftyp", "moov"]);
    expect(scan.brands).toContain("isom");
    expect(scan.tracks.map((t) => [t.handler, t.sampleEntry])).toEqual([["vide", "avc1"], ["soun", "mp4a"]]);
    const audio = scan.tracks[1]!;
    expect(audio).toMatchObject({ objectType: 0x40, channels: 1, sampleRate: 48000, enabled: true });
    expect(audio.sampleCount).toBeGreaterThan(40);
    expect(audio.durationSeconds).toBeCloseTo(1, 1);
    expect(declaredAudioTracks(scan)).toHaveLength(1);
  });

  it("finds the moov at the end of the file, as phones usually write it", async () => {
    const scan = await scanMp4(fixture("aac-moov-at-end.mp4"));
    expect(scan.topLevel.map((b) => b.type).at(-1)).toBe("moov");
    expect(declaredAudioTracks(scan)).toHaveLength(1);
  });

  it("confirms a genuinely silent file has no audio track", async () => {
    const scan = await scanMp4(fixture("no-audio.mp4"));
    expect(scan.tracks.map((t) => t.handler)).toEqual(["vide"]);
    expect(declaredAudioTracks(scan)).toEqual([]);
  });

  it("still sees audio declared in an unusual format (AMR 'samr')", async () => {
    const scan = await scanMp4(fixture("samr-audio.mp4"));
    expect(declaredAudioTracks(scan).map((t) => t.sampleEntry)).toEqual(["samr"]);
  });

  it("counts audio in fragmented MP4s, whose moov holds no samples", async () => {
    const scan = await scanMp4(fixture("fragmented.mp4"));
    expect(scan.fragmented).toBe(true);
    expect(declaredAudioTracks(scan).map((t) => t.sampleEntry)).toEqual(["mp4a"]);
  });

  it("lists ALAC audio", async () => {
    const scan = await scanMp4(fixture("alac.mp4"));
    expect(declaredAudioTracks(scan).map((t) => t.sampleEntry)).toEqual(["alac"]);
  });

  it("reports a non-MP4 file instead of throwing", async () => {
    const scan = await scanMp4(new Blob([new Uint8Array(4096).fill(0xff)]));
    expect(scan.tracks).toEqual([]);
    expect(scan.error).toMatch(/Not an MP4\/MOV box|Invalid box size/);
  });
});

describe("readFileRange", () => {
  it("reads a byte range and counts it", async () => {
    const stats = newReadStats();
    const data = await readFileRange(new Blob([new Uint8Array([1, 2, 3, 4, 5])]), 1, 4, stats);
    expect([...data]).toEqual([2, 3, 4]);
    expect(stats).toMatchObject({ reads: 1, bytes: 3, failure: null });
  });

  it("records the browser's own error after one retry", async () => {
    const stats = newReadStats();
    const broken = {
      size: 100,
      slice: () => ({ arrayBuffer: async () => Promise.reject(new DOMException("could not be read", "NotReadableError")) }),
    } as unknown as Blob;
    const err = await readFileRange(broken, 10, 20, stats).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceReadError);
    expect(stats.failure).toEqual({ name: "NotReadableError", message: "could not be read", start: 10, end: 20, retried: true });
  });
});
