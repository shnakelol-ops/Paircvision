import { describe, expect, it } from "vitest";
import { SILENT_DB, isAudible, probeWindows, rmsToDb } from "./audio-level";
import { chooseAudioTrack, type AudioTrackInfo } from "./clip-export";

const t = (id: number, levelDb: number | null, isDefault = false): AudioTrackInfo => ({
  id, index: id, codec: "aac", channels: 2, sampleRate: 48000, language: "und", name: null, isDefault, levelDb,
});

describe("audio level", () => {
  it("converts RMS to dBFS", () => {
    expect(rmsToDb(0.01 * 100, 100)).toBeCloseTo(-20, 5); // amplitude 0.1 → −20 dBFS
    expect(rmsToDb(0, 100)).toBe(-120);
    expect(rmsToDb(0, 0)).toBeNull();
  });

  it("treats digital silence and very low hiss as silent, commentary as audible", () => {
    expect(isAudible(-120)).toBe(false);
    expect(isAudible(SILENT_DB)).toBe(false);
    expect(isAudible(-45)).toBe(true);
    expect(isAudible(null)).toBe(false);
  });

  it("samples 20%, 50% and 80% of the match", () => {
    expect(probeWindows(4620)).toEqual([[924, 928], [2310, 2314], [3696, 3700]]);
    expect(probeWindows(2)).toEqual([[0, 2], [0, 2], [0, 2]]);
  });
});

describe("chooseAudioTrack", () => {
  it("keeps the default track when it has sound", () => {
    expect(chooseAudioTrack([t(1, -25, true), t(2, -15)])?.id).toBe(1);
  });
  it("switches to the loudest audible track when the default is silent", () => {
    expect(chooseAudioTrack([t(1, -120, true), t(2, -30), t(3, -18)])?.id).toBe(3);
  });
  it("falls back to the default when nothing is audible or measurable", () => {
    expect(chooseAudioTrack([t(1, -120), t(2, -120, true)])?.id).toBe(2);
    expect(chooseAudioTrack([t(1, null, true), t(2, null)])?.id).toBe(1);
    expect(chooseAudioTrack([])).toBeNull();
  });
});
