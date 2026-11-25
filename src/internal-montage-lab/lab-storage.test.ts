// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAB_DIR, clearLabFiles, listLabFiles, writeProbe } from "./lab-storage";
import { LAB_STORAGE_KEY, addRecord, endRun, loadRecords, resetPageLoadForTests, startRun, takeInterruptedRun, updateRun } from "./lab-session";

// Minimal in-memory OPFS: directories of files, writable streams with a byte limit.
class FakeFile {
  data: Uint8Array[] = [];
  get size() {
    return this.data.reduce((n, c) => n + c.length, 0);
  }
}
class FakeDir {
  kind = "directory" as const;
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  private quota: { left: number };
  constructor(quota: { left: number }) {
    this.quota = quota;
  }
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!o?.create) throw new DOMException("missing", "NotFoundError");
      this.dirs.set(name, new FakeDir(this.quota));
    }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!o?.create) throw new DOMException("missing", "NotFoundError");
      this.files.set(name, new FakeFile());
    }
    const file = this.files.get(name)!;
    const quota = this.quota;
    return {
      kind: "file" as const,
      async createWritable() {
        const pending: Uint8Array[] = [];
        return {
          async write(chunk: Uint8Array) {
            if (chunk.length > quota.left) throw new DOMException("over quota", "QuotaExceededError");
            quota.left -= chunk.length;
            pending.push(chunk.slice(0, Math.min(chunk.length, 4097)));
            (pending as unknown as { bytes?: number }).bytes = ((pending as unknown as { bytes?: number }).bytes ?? 0) + chunk.length;
          },
          async close() {
            // Keep only a sample of each chunk (enough for the read-back spot check) plus the real length.
            file.data = pending.map((c, i) => {
              const full = new Uint8Array(i === pending.length - 1 ? lastLen(pending) : 8 * 1024 * 1024);
              full.set(c);
              return full;
            });
          },
          async abort() {
            pending.length = 0;
          },
        };
      },
      async getFile() {
        // Node's Blob supports stream(), like browsers (jsdom's does not).
        return new NodeBlob(file.data as unknown as ConstructorParameters<typeof NodeBlob>[0]) as unknown as Blob;
      },
    };
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name) && !this.dirs.delete(name)) throw new DOMException("missing", "NotFoundError");
  }
  async *entries() {
    for (const [n] of this.files) yield [n, await this.getFileHandle(n)] as const;
    for (const [n, d] of this.dirs) yield [n, d] as const;
  }
}
function lastLen(pending: Uint8Array[]) {
  const total = (pending as unknown as { bytes: number }).bytes;
  return total - (pending.length - 1) * 8 * 1024 * 1024;
}

let root: FakeDir;
let quota: { left: number };
beforeEach(() => {
  quota = { left: 200 * 1024 * 1024 };
  root = new FakeDir(quota);
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      getDirectory: async () => root,
      estimate: async () => ({ quota: 1e9, usage: 200 * 1024 * 1024 - quota.left }),
    },
  });
  window.localStorage.clear();
  resetPageLoadForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("writeProbe", () => {
  it("writes, commits, reads back and deletes its test file", async () => {
    const r = await writeProbe(40 * 1024 * 1024);
    expect(r.error).toBeNull();
    expect(r.wroteBytes).toBe(40 * 1024 * 1024);
    expect(r.readBackOk).toBe(true);
    expect(r.writeMBps).toBeGreaterThan(0);
    expect(await listLabFiles()).toEqual([]); // cleaned up
  });

  it("as a headroom probe: stops at the real limit, reports it, and leaves nothing behind", async () => {
    quota.left = 50 * 1024 * 1024;
    const r = await writeProbe(4e9);
    expect(r.error).toBe("QuotaExceededError");
    expect(r.wroteBytes).toBe(48 * 1024 * 1024); // six whole 8 MB chunks fitted
    expect(await listLabFiles()).toEqual([]);
  });

  it("stops when cancelled and deletes the partial file", async () => {
    const ac = new AbortController();
    const r = await writeProbe(100 * 1024 * 1024, { signal: ac.signal, onProgress: (w) => w >= 16 * 1024 * 1024 && ac.abort() });
    expect(r.error).toBe("AbortError");
    expect(await listLabFiles()).toEqual([]);
  });
});

describe("lab file cleanup", () => {
  it("only ever touches the lab directory", async () => {
    const other = await root.getDirectoryHandle("someone-else", { create: true });
    await other.getFileHandle("keep.bin", { create: true });
    const lab = await root.getDirectoryHandle(LAB_DIR, { create: true });
    await lab.getFileHandle("montage-1.mp4", { create: true });
    await lab.getFileHandle("montage-2.mp4", { create: true });
    expect((await listLabFiles()).map((f) => f.name)).toEqual(["montage-1.mp4", "montage-2.mp4"]);
    expect((await clearLabFiles()).map((f) => f.name)).toEqual(["montage-1.mp4", "montage-2.mp4"]);
    expect(await listLabFiles()).toEqual([]);
    expect([...other.files.keys()]).toEqual(["keep.bin"]);
  });
});

describe("run markers", () => {
  it("detects a run that never finished (tab killed / reloaded) and records it once", () => {
    startRun("montage", "20 clips / 300 s");
    updateRun(0.42, "clip 9 of 20");
    const m = takeInterruptedRun();
    expect(m).toMatchObject({ op: "montage", progress: 0.42, detail: "clip 9 of 20" });
    expect(loadRecords()[0]).toMatchObject({ kind: "interrupted" });
    // Same page load (e.g. React StrictMode remount): same answer, recorded only once.
    expect(takeInterruptedRun()).toMatchObject({ op: "montage" });
    expect(loadRecords().filter((r) => r.kind === "interrupted")).toHaveLength(1);
    // Next page load: nothing pending any more.
    resetPageLoadForTests();
    expect(takeInterruptedRun()).toBeNull();
  });

  it("a finished run is not reported as interrupted", () => {
    startRun("write", "500 MB");
    endRun();
    expect(takeInterruptedRun()).toBeNull();
  });

  it("uses only its own storage key", () => {
    window.localStorage.setItem("paircvision_internal_match_clipper_v1", '{"version":1,"lastProjectKey":null,"projects":[]}');
    addRecord("x", "y", {});
    startRun("a", "b");
    endRun();
    expect(window.localStorage.getItem("paircvision_internal_match_clipper_v1")).toBe('{"version":1,"lastProjectKey":null,"projects":[]}');
    expect(Object.keys(window.localStorage)).toEqual(expect.arrayContaining([LAB_STORAGE_KEY]));
  });
});
