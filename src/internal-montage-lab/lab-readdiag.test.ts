import { describe, expect, it, vi } from "vitest";
import { newReadStats } from "../internal-match-clipper/file-source";
import { ReadTracker, classify, forensicsSummary, probeAccess, runForensics, snapshotFile, soakRead, trackedRead, type ForensicRound } from "./lab-readdiag";

const NOT_READABLE = () => new DOMException("The requested file could not be read", "NotReadableError");

/** A File stand-in whose reads fail when `fails(offset, readIndex)` says so. */
function fakeFile(size: number, fails: (offset: number, i: number) => boolean, name = "58695.mp4") {
  let i = 0;
  const f = {
    name, size, type: "video/mp4", lastModified: 1700000000000,
    slice: (a: number, b: number) => ({
      arrayBuffer: async () => {
        if (fails(a, i++)) throw NOT_READABLE();
        return new ArrayBuffer(Math.max(0, Math.min(size, b) - a));
      },
    }),
  };
  return f as unknown as File;
}

describe("source-read diagnostics", () => {
  it("recognises Android Photo Picker style names", () => {
    expect(snapshotFile(fakeFile(1, () => false, "58695.mp4"), 5)).toMatchObject({ looksLikeAndroidMediaId: true, size: 1, pickedAt: 5 });
    expect(snapshotFile(fakeFile(1, () => false, "Ballyboden v Na Fianna.mp4")).looksLikeAndroidMediaId).toBe(false);
  });

  it("tracks reads through V1's reader and reports only the first failure", async () => {
    let t = 1000;
    const tracker = new ReadTracker(() => t);
    const onFail = vi.fn();
    tracker.onFirstFailure = onFail;
    const file = fakeFile(10e6, (offset) => offset >= 4e6);
    const stats = newReadStats();
    await trackedRead(file, 0, 1e6, stats, tracker);
    t = 61300;
    await trackedRead(file, 1e6, 2e6, stats, tracker);
    t = 62000;
    await expect(trackedRead(file, 4e6, 5e6, stats, tracker)).rejects.toMatchObject({ name: "SourceReadError" });
    await expect(trackedRead(file, 6e6, 7e6, stats, tracker)).rejects.toBeTruthy();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(tracker).toMatchObject({ reads: 2, bytes: 2e6 });
    expect(tracker.failure).toMatchObject({ name: "NotReadableError", start: 4e6, end: 5e6, retried: true, t: 62000 });
    expect(tracker.lastOk).toMatchObject({ start: 1e6, end: 2e6, t: 61300 });
  });

  it("probes start, middle, end and the failed range without retries", async () => {
    const probes = await probeAccess(fakeFile(100e6, (offset) => offset > 40e6 && offset < 60e6), { start: 32e6, end: 36e6 });
    expect(probes.map((p) => [p.where, p.ok])).toEqual([["start", true], ["middle", false], ["end", true], ["failed range", true]]);
    expect(probes[1]!.error).toMatch(/^NotReadableError/);
  });

  const round = (ok: boolean[]): ForensicRound => ({
    label: "immediately", atMsAfterFailure: 0, visibility: "visible", sizeNow: 1, lastModifiedNow: 1,
    probes: ok.map((o, i) => ({ where: "start" as const, offset: i, ok: o, ms: 1, error: o ? null : "NotReadableError" })),
  });
  it("classifies: whole file lost, some regions lost, recovered, one-off", () => {
    expect(classify([round([false, false, false]), round([false, false, false]), round([false, false, false])])).toBe("permanent: whole file unreadable");
    expect(classify([round([true, false, true]), round([true, false, true]), round([true, false, true])])).toBe("permanent: only some regions unreadable");
    expect(classify([round([false, false, false]), round([false, false, false]), round([true, true, true])])).toBe("recovered: readable again after a pause");
    expect(classify([round([true, true, true]), round([true, true, true]), round([true, true, true])])).toBe("never failed again (one-off read error)");
  });

  it("re-reads immediately, after 2 s and after 10 s, and reports what was lost and when", async () => {
    let t = 0;
    const tracker = new ReadTracker(() => t);
    const file = fakeFile(229.1e6, () => t >= 60300); // every read fails from 60.3 s on
    const stats = newReadStats();
    t = 1000;
    await trackedRead(file, 0, 4e6, stats, tracker);
    t = 60000;
    await trackedRead(file, 96e6, 100e6, stats, tracker);
    t = 60300;
    await trackedRead(file, 100663296, 100728832, stats, tracker).catch(() => undefined);
    const waits: number[] = [];
    const f = await runForensics(file, { ...snapshotFile(file, 500) }, tracker, async (ms) => {
      waits.push(ms);
      t += ms;
    }, () => t);
    expect(waits).toEqual([2000, 8000]);
    expect(f.rounds.map((r) => [r.label, r.atMsAfterFailure, r.probes.length])).toEqual([["immediately", 0, 4], ["after 2 s", 2000, 4], ["after 10 s", 10000, 4]]);
    expect(f).toMatchObject({ verdict: "permanent: whole file unreadable", msSincePick: 59800, msSinceLastGoodRead: 300, readsBefore: 2, snapshotChanged: false });
    expect(forensicsSummary(f)).toMatch(/NotReadableError at bytes 100663296–100728832 · 59\.8 s after picking the file.*verdict: permanent: whole file unreadable/);
  });

  it("soak: reads the file over and over, with some random seeks, until time is up", async () => {
    const tracker = new ReadTracker();
    const r = await soakRead(fakeFile(10e6, () => false), tracker, { durationMs: 30, chunkBytes: 1e6 });
    expect(r.failure).toBeNull();
    expect(r.reads).toBeGreaterThan(10);
    expect(r.passes).toBeGreaterThanOrEqual(1);
    expect(tracker.recent.every((e) => e.start >= 0 && e.end <= 10e6)).toBe(true);
  });

  it("soak: stops at the first unreadable read and says when", async () => {
    const tracker = new ReadTracker();
    const r = await soakRead(fakeFile(10e6, (_o, i) => i >= 25), tracker, { durationMs: 60000, chunkBytes: 1e6 });
    expect(r.failure).toMatchObject({ name: "NotReadableError" });
    expect(r.reads).toBe(25);
    expect(r.failedAfterMs).not.toBeNull();
  });

  it("soak: can be cancelled", async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await soakRead(fakeFile(10e6, () => false), new ReadTracker(), { durationMs: 60000, signal: ac.signal })).toMatchObject({ cancelled: true, reads: 0 });
  });
});
