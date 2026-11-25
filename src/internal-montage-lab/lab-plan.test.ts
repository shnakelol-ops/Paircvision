import { describe, expect, it } from "vitest";
import { FrameSequencer, MIN_FRAME, type TimedItem } from "./frame-sequencer";
import { PROFILES, WORKLOADS, estimateOutputBytes, planRanges, rangesFromSavedClips } from "./lab-plan";

describe("planRanges", () => {
  it("plans the mandatory workload: 20 clips totalling 5 minutes, spread across a 77-minute match", () => {
    const r = planRanges(4662, 20, 300);
    expect(r).toHaveLength(20);
    expect(r.reduce((n, [s, e]) => n + (e - s), 0)).toBeCloseTo(300, 6);
    expect(r[0]![0]).toBe(0);
    expect(r.at(-1)![1]).toBeLessThanOrEqual(4662);
    for (let i = 1; i < r.length; i++) expect(r[i]![0]).toBeGreaterThan(r[i - 1]![0]);
  });

  it("keeps every range inside the video, even when the montage is longer than the match", () => {
    for (const w of WORKLOADS) {
      for (const [s, e] of planRanges(600, w.clips, w.seconds)) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(600);
        expect(e).toBeGreaterThan(s);
      }
    }
  });

  it("rejects nonsense input", () => {
    expect(planRanges(0, 20, 300)).toEqual([]);
    expect(planRanges(600, 0, 300)).toEqual([]);
  });

  it("reads saved clips in list order without changing them", () => {
    const saved = Object.freeze([Object.freeze({ start: 10, end: 16 }), Object.freeze({ start: 5, end: 5 }), Object.freeze({ start: 30, end: 36.5 })]);
    expect(rangesFromSavedClips(saved)).toEqual([[10, 16], [30, 36.5]]);
  });
});

describe("estimateOutputBytes", () => {
  it("matches the audit's measured sizes to within a few percent (1080p @ 6 Mbps)", () => {
    const p1080 = PROFILES.find((p) => p.id === "1080p")!;
    // Measured in the audit: 5 min → 230.3 MB, 10 min → 460.1 MB.
    expect(estimateOutputBytes(300, p1080) / 230.3e6).toBeGreaterThan(0.95);
    expect(estimateOutputBytes(300, p1080) / 230.3e6).toBeLessThan(1.1);
    expect(estimateOutputBytes(600, p1080) / 460.1e6).toBeLessThan(1.1);
  });
});

describe("FrameSequencer", () => {
  async function run(frames: TimedItem[], end: number) {
    const out: TimedItem[] = [];
    const dropped: TimedItem[] = [];
    const seq = new FrameSequencer<TimedItem>((f) => void out.push({ ...f }), (f) => void dropped.push(f));
    for (const f of frames) await seq.push({ ...f });
    await seq.flush(end);
    return { out, dropped };
  }

  it("reproduces the audit's join case and removes the duplicate timestamp", async () => {
    // Clip joins at 300.0107 s. The source frame visible there was clamped to the join (full 1/30 s
    // duration); the next real frame starts 1.3 ms later — previously both ended up on one timestamp.
    const join = 300.0107;
    const { out } = await run(
      [
        { timestamp: join, duration: 1 / 30 },
        { timestamp: join + 0.0013, duration: 1 / 30 },
        { timestamp: join + 0.0013 + 1 / 30, duration: 1 / 30 },
      ],
      join + 0.1,
    );
    expect(out.map((f) => f.timestamp)).toEqual([join, join + 0.0013, join + 0.0013 + 1 / 30]);
    expect(out[0]!.duration).toBeCloseTo(0.0013, 9); // trimmed to its successor, no overlap
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.timestamp).toBeGreaterThan(out[i - 1]!.timestamp);
      expect(out[i - 1]!.timestamp + out[i - 1]!.duration).toBeCloseTo(out[i]!.timestamp, 9); // gap-free
    }
    expect(out.at(-1)!.timestamp + out.at(-1)!.duration).toBeCloseTo(join + 0.1, 9);
  });

  it("drops a frame that would not move time forward", async () => {
    const { out, dropped } = await run(
      [
        { timestamp: 10, duration: 0.04 },
        { timestamp: 10 + MIN_FRAME / 2, duration: 0.04 },
        { timestamp: 10.04, duration: 0.04 },
      ],
      10.08,
    );
    expect(out.map((f) => f.timestamp)).toEqual([10, 10.04]);
    expect(dropped).toHaveLength(1);
  });

  it("drops a sliver that ends at the join, and discards held frames on cancel", async () => {
    const { out, dropped } = await run([{ timestamp: 5, duration: 0.04 }], 5 + MIN_FRAME / 4);
    expect(out).toEqual([]);
    expect(dropped).toHaveLength(1);
    const held: TimedItem[] = [];
    const seq = new FrameSequencer<TimedItem>(() => undefined, (f) => void held.push(f));
    await seq.push({ timestamp: 1, duration: 0.04 });
    seq.discard();
    expect(held).toHaveLength(1);
  });
});

import { clipAudioVerdicts } from "./lab-montage";
describe("clipAudioVerdicts", () => {
  it("separates a silent source from sound lost by the montage", () => {
    expect(clipAudioVerdicts([-19, -120, -20, null], [-19, -120, -120, -19]).map((c) => c.verdict)).toEqual([
      "ok", "source-silent", "LOST-IN-MONTAGE", "unmeasured",
    ]);
  });
});
