// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameSequencer } from "./frame-sequencer";
import { EXPORT_DIR, EXPORT_RUN_KEY, cleanExportFiles, markRunEnded, markRunStarted, takeInterruptedRun } from "./export-storage";
import { MontageExportError, estimateExportBytes, exportMontage, fnv1a, rangesSeconds } from "./montage-export";

const file = () => new File([new Uint8Array(4)], "final.mp4");
const opts = (over = {}) => ({ ranges: [{ start: 10, end: 16 }], maxSeconds: 360, audioTrackId: null, fileName: "m.mp4", ...over });

function stubStorage(over: { estimate?: () => Promise<StorageEstimate>; files?: string[] } = {}) {
  const files = new Set(over.files ?? []);
  const dir = {
    async *entries() {
      for (const n of [...files]) yield [n, { kind: "file" }] as const;
    },
    removeEntry: vi.fn(async (n: string) => void files.delete(n)),
  };
  const root = { getDirectoryHandle: vi.fn(async (name: string) => (name === EXPORT_DIR ? dir : Promise.reject(new Error("wrong dir")))) };
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root, estimate: over.estimate ?? (async () => ({ quota: 5e9, usage: 0 })) },
  });
  return { files, dir, root };
}
afterEach(() => {
  Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
  window.localStorage.clear();
});

describe("montage export — checks before any work", () => {
  it("estimates 720p / 3 Mbps plus copied audio", () => {
    expect(estimateExportBytes(300)).toBe(119646000);
    expect(rangesSeconds([{ start: 10, end: 16 }, { start: 100, end: 130.5 }, { start: 5, end: 4 }])).toBe(36.5);
  });

  it("refuses an empty montage and one over the length limit", async () => {
    stubStorage();
    await expect(exportMontage(file(), opts({ ranges: [] }))).rejects.toMatchObject({ code: "empty" });
    await expect(exportMontage(file(), opts({ ranges: [{ start: 0, end: 400 }], maxSeconds: 360 }))).rejects.toMatchObject({
      code: "too_long",
      message: "Montages can be up to 6 minutes for now; this one is 6.7.",
    });
  });

  it("refuses when the phone hasn't room for twice the estimate (encoders can overshoot)", async () => {
    stubStorage({ estimate: async () => ({ quota: 400e6, usage: 200e6 }) });
    const err = (await exportMontage(file(), opts({ ranges: [{ start: 0, end: 300 }] })).catch((e: unknown) => e)) as MontageExportError;
    expect(err).toBeInstanceOf(MontageExportError);
    expect(err.code).toBe("storage_full");
    expect(err.message).toBe("Not enough free space for this montage: about 303 MB is needed and 200 MB is available to the browser.");
  });

  it("without OPFS, refuses montages too big to hold in memory", async () => {
    Object.defineProperty(navigator, "storage", { configurable: true, value: { estimate: async () => ({}) } });
    // 400 s ≈ 160 MB: over the 150 MB that may be held in memory.
    await expect(exportMontage(file(), opts({ ranges: [{ start: 0, end: 400 }], maxSeconds: 600 }))).rejects.toMatchObject({ code: "no_storage" });
  });

  it("checksums packets continuously (order and every byte matter)", () => {
    const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([4, 5]);
    const joined = fnv1a(b, fnv1a(a));
    expect(fnv1a(new Uint8Array([1, 2, 3, 4, 5]))).toBe(joined);
    expect(fnv1a(a, fnv1a(b))).not.toBe(joined);
    expect(fnv1a(new Uint8Array([1, 2, 3, 4, 6]))).not.toBe(joined);
  });
});

describe("frame sequencer (from the Montage Lab)", () => {
  it("keeps timestamps strictly increasing and fills each frame to the next one", async () => {
    const out: { timestamp: number; duration: number }[] = [];
    const dropped: number[] = [];
    const seq = new FrameSequencer<{ timestamp: number; duration: number }>((i) => void out.push({ ...i }), (i) => void dropped.push(i.timestamp));
    await seq.push({ timestamp: 0, duration: 0.04 });
    await seq.push({ timestamp: 0, duration: 0.04 }); // clamped to the join: same time → dropped
    await seq.push({ timestamp: 0.033, duration: 0.04 });
    await seq.flush(0.05);
    expect(out).toEqual([{ timestamp: 0, duration: 0.033 }, { timestamp: 0.033, duration: expect.closeTo(0.017, 6) }]);
    expect(dropped).toEqual([0]);
  });
});

describe("export storage", () => {
  it("cleans only its own directory, keeping the named file", async () => {
    const { files, root } = stubStorage({ files: ["montage-1.mp4", "montage-2.mp4"] });
    expect(await cleanExportFiles("montage-2.mp4")).toBe(1);
    expect([...files]).toEqual(["montage-2.mp4"]);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith(EXPORT_DIR, { create: true });
  });

  it("reports a run that never finished, once", () => {
    markRunStarted({ montageId: "m1", montageName: "Kickouts", startedAt: 5 });
    expect(JSON.parse(window.localStorage.getItem(EXPORT_RUN_KEY)!)).toMatchObject({ montageName: "Kickouts" });
    expect(takeInterruptedRun()).toEqual({ montageId: "m1", montageName: "Kickouts", startedAt: 5 });
    expect(takeInterruptedRun()).toBeNull();
    markRunStarted({ montageId: "m1", montageName: "Kickouts", startedAt: 5 });
    markRunEnded();
    expect(takeInterruptedRun()).toBeNull();
  });
});
