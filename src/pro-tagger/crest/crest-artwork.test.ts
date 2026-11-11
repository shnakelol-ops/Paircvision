// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_CRESTS, crestsKey, loadMatchCrests, type DecodedCrest } from "./crest-artwork";
import type { ClubCrestRecord } from "./crest-store";
import { memoryCrestBackend, type MemoryCrestBackend } from "./crestTestFixtures";
import { SAVED_SQUADS_STORAGE_KEY } from "../../core/stats/saved-match";

function record(teamId: string, w: number, h: number, updatedAt = 1, needsBacking = false): ClubCrestRecord {
  return {
    v: 1, teamId, image: new Blob([`${teamId}:${w}x${h}`], { type: "image/png" }), width: w, height: h,
    backgroundRemoved: false, needsBacking, teamName: teamId, updatedAt,
  };
}

type FakeDecoded = DecodedCrest & { closed: boolean; source: Blob };

function fakeDecoder() {
  const made: FakeDecoded[] = [];
  const decode = vi.fn(async (blob: Blob) => {
    const rec = [...backend.data.values()].find((r) => (r as ClubCrestRecord).image === blob) as ClubCrestRecord;
    const d: FakeDecoded = {
      image: { width: rec.width, height: rec.height } as unknown as CanvasImageSource,
      width: rec.width,
      height: rec.height,
      closed: false,
      source: blob,
      release: () => { d.closed = true; },
    };
    made.push(d);
    return d;
  });
  return { decode, made };
}

let backend: MemoryCrestBackend;
let storageCalls: string[];
beforeEach(() => {
  backend = memoryCrestBackend();
  window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, "[]");
  storageCalls = [];
  for (const m of ["getItem", "setItem", "removeItem"] as const) {
    vi.spyOn(Storage.prototype, m).mockImplementation((...a: unknown[]) => {
      storageCalls.push(`${m}:${String(a[0])}`);
      return null;
    });
  }
});
afterEach(() => {
  // Crest reads never touch Saved Teams (or any localStorage).
  expect(storageCalls).toEqual([]);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadMatchCrests — identity by Saved Team id only", () => {
  it("loads the Home and Away crests for their own ids", async () => {
    backend.data.set("t-bally", record("t-bally", 300, 400, 5));
    backend.data.set("t-galb", record("t-galb", 512, 512, 9, true));
    const { decode } = fakeDecoder();
    const { crests } = await loadMatchCrests({ home: "t-bally", away: "t-galb" }, { backend, decode, storageSupported: true });
    expect(crests.home).toMatchObject({ width: 300, height: 400, needsBacking: false, key: "t-bally:5" });
    expect(crests.away).toMatchObject({ width: 512, height: 512, needsBacking: true, key: "t-galb:9" });
    expect(crestsKey(crests)).toBe("t-bally:5|t-galb:9");
  });

  it("two Saved Teams with the same name (or the same monogram) keep their own crests", async () => {
    // e.g. two clubs both called "St Mary's", or "Na Fianna" vs "Naomh Fionnbarra" (both "NF").
    backend.data.set("id-1", { ...record("id-1", 200, 300), teamName: "St Mary's" });
    backend.data.set("id-2", { ...record("id-2", 400, 200), teamName: "St Mary's" });
    const { decode } = fakeDecoder();
    const { crests } = await loadMatchCrests({ home: "id-1", away: "id-2" }, { backend, decode, storageSupported: true });
    expect(crests.home).toMatchObject({ width: 200, height: 300 });
    expect(crests.away).toMatchObject({ width: 400, height: 200 });
  });

  it("no ids (older matches) or unsupported storage: monograms, and the store is never opened", async () => {
    const get = vi.spyOn(backend, "get");
    expect((await loadMatchCrests({}, { backend, storageSupported: true })).crests).toBe(NO_CRESTS);
    expect((await loadMatchCrests({ home: "", away: undefined }, { backend, storageSupported: true })).crests).toBe(NO_CRESTS);
    backend.data.set("t", record("t", 10, 10));
    expect((await loadMatchCrests({ home: "t" }, { backend, storageSupported: false })).crests).toBe(NO_CRESTS);
    expect(get).not.toHaveBeenCalled();
  });

  it("an unknown id gives the monogram for that side only", async () => {
    backend.data.set("known", record("known", 100, 100));
    const { decode } = fakeDecoder();
    const { crests } = await loadMatchCrests({ home: "known", away: "never-saved" }, { backend, decode, storageSupported: true });
    expect(crests.home).not.toBeNull();
    expect(crests.away).toBeNull();
  });

  it("the same id on both sides is read and decoded once", async () => {
    backend.data.set("t", record("t", 100, 120));
    const { decode } = fakeDecoder();
    const get = vi.spyOn(backend, "get");
    const { crests } = await loadMatchCrests({ home: "t", away: "t" }, { backend, decode, storageSupported: true });
    expect(get).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(crests.home).toBe(crests.away);
  });

  it("a replaced crest gives a new key, so a new preview never reuses the old image", async () => {
    backend.data.set("t", record("t", 100, 100, 1));
    const { decode } = fakeDecoder();
    const first = await loadMatchCrests({ home: "t" }, { backend, decode, storageSupported: true });
    backend.data.set("t", record("t", 300, 100, 2));
    const second = await loadMatchCrests({ home: "t" }, { backend, decode, storageSupported: true });
    expect(first.crests.home?.key).toBe("t:1");
    expect(second.crests.home).toMatchObject({ key: "t:2", width: 300 });
  });
});

describe("loadMatchCrests — failures fall back to the monogram and never throw", () => {
  it("a failed database read", async () => {
    backend.failGet = new Error("IndexedDB broken");
    const { crests } = await loadMatchCrests({ home: "a", away: "b" }, { backend, storageSupported: true });
    expect(crests).toEqual({ home: null, away: null });
  });

  it("a malformed stored record", async () => {
    backend.data.set("a", { v: 1, teamId: "a", image: "not a blob" });
    const { crests } = await loadMatchCrests({ home: "a" }, { backend, storageSupported: true });
    expect(crests.home).toBeNull();
  });

  it("a corrupt image (decode rejects)", async () => {
    backend.data.set("a", record("a", 10, 10));
    const decode = vi.fn(async () => { throw new Error("decode failed"); });
    const { crests } = await loadMatchCrests({ home: "a" }, { backend, decode, storageSupported: true });
    expect(crests.home).toBeNull();
  });

  it("a decode that yields an empty image", async () => {
    backend.data.set("a", record("a", 10, 10));
    const decode = vi.fn(async () => ({ image: {} as CanvasImageSource, width: 0, height: 0, release: () => {} }));
    const { crests } = await loadMatchCrests({ home: "a" }, { backend, decode, storageSupported: true });
    expect(crests.home).toBeNull();
  });

  it("a hanging database read times out", async () => {
    vi.useFakeTimers();
    backend.get = () => new Promise(() => {});
    const p = loadMatchCrests({ home: "a", away: "b" }, { backend, storageSupported: true, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await p).crests).toEqual({ home: null, away: null });
  });

  it("a decode timeout gives the monogram and the late image is released", async () => {
    vi.useFakeTimers();
    backend.data.set("a", record("a", 10, 10));
    let resolveLate!: (d: DecodedCrest) => void;
    const decode = vi.fn(() => new Promise<DecodedCrest>((r) => (resolveLate = r)));
    const p = loadMatchCrests({ home: "a" }, { backend, decode, storageSupported: true, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await p).crests.home).toBeNull();
    const late = { image: {} as CanvasImageSource, width: 5, height: 5, release: vi.fn() };
    resolveLate(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.release).toHaveBeenCalledTimes(1);
  });
});

describe("loadMatchCrests — memory", () => {
  it("release frees every decoded image exactly once", async () => {
    backend.data.set("a", record("a", 10, 10));
    backend.data.set("b", record("b", 20, 20));
    const { decode, made } = fakeDecoder();
    const loaded = await loadMatchCrests({ home: "a", away: "b" }, { backend, decode, storageSupported: true });
    expect(made.map((d) => d.closed)).toEqual([false, false]);
    loaded.release();
    loaded.release();
    expect(made.map((d) => d.closed)).toEqual([true, true]);
  });
});
