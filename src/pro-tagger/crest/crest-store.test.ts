// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CLUB_CRESTS_DB_NAME,
  CrestStoreError,
  createIndexedDbCrestBackend,
  isClubCrestRecord,
  isCrestStorageSupported,
  loadClubCrest,
  removeClubCrest,
  saveClubCrest,
  type ClubCrestInput,
} from "./crest-store";
import { SAVED_SQUADS_STORAGE_KEY } from "../../core/stats/saved-match";

// ── Minimal fake IndexedDB ───────────────────────────────────────────────
// Writes land only when the transaction commits, like the real thing, and
// every callback fires asynchronously. Failure modes are injected per test.

const tick = () => new Promise((r) => setTimeout(r, 0));

type Env = {
  data: Map<string, unknown>;
  openMode: "ok" | "blocked" | "error" | "hang" | "throw";
  /** Next readwrite transaction: request succeeds, then the transaction aborts at commit. */
  abortNextWrite: DOMException | null;
  /** Next readwrite transaction fails with an error event. */
  errorNextWrite: boolean;
  /** Next db.transaction() call throws (connection silently closed). */
  throwNextTransaction: boolean;
  opens: number;
  dbs: FakeDb[];
};

class FakeRequest {
  result: unknown;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeTx {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private pending: Array<() => void> = [];
  private env: Env;
  private mode: IDBTransactionMode;
  constructor(env: Env, mode: IDBTransactionMode) {
    this.env = env;
    this.mode = mode;
    setTimeout(() => this.finish(), 0);
  }
  abort() {
    this.pending = [];
  }
  objectStore() {
    const req = (fn: () => unknown) => {
      const r = new FakeRequest();
      setTimeout(() => {
        r.result = fn();
        r.onsuccess?.();
      }, 0);
      return r;
    };
    return {
      put: (value: unknown, key: string) => req(() => (this.pending.push(() => this.env.data.set(key, value)), key)),
      delete: (key: string) => req(() => (this.pending.push(() => this.env.data.delete(key)), undefined)),
      get: (key: string) => req(() => this.env.data.get(key)),
    };
  }
  private finish() {
    setTimeout(() => {
      if (this.mode === "readwrite" && this.env.abortNextWrite) {
        this.error = this.env.abortNextWrite;
        this.env.abortNextWrite = null;
        this.pending = [];
        this.onabort?.();
        return;
      }
      if (this.mode === "readwrite" && this.env.errorNextWrite) {
        this.env.errorNextWrite = false;
        this.error = new DOMException("Write failed", "UnknownError");
        this.pending = [];
        this.onerror?.();
        return;
      }
      this.pending.forEach((apply) => apply());
      this.oncomplete?.();
    }, 0);
  }
}

class FakeDb {
  closed = false;
  onversionchange: (() => void) | null = null;
  onclose: (() => void) | null = null;
  stores = new Set<string>();
  objectStoreNames = { contains: (n: string) => this.stores.has(n) };
  private env: Env;
  constructor(env: Env) {
    this.env = env;
  }
  createObjectStore(name: string) {
    this.stores.add(name);
  }
  transaction(_name: string, mode: IDBTransactionMode) {
    if (this.closed || this.env.throwNextTransaction) {
      this.env.throwNextTransaction = false;
      throw new DOMException("The database connection is closing.", "InvalidStateError");
    }
    return new FakeTx(this.env, mode);
  }
  close() {
    this.closed = true;
  }
}

function fakeFactory(env: Env): IDBFactory {
  let upgraded = false;
  return {
    open(name: string) {
      expect(name).toBe(CLUB_CRESTS_DB_NAME);
      if (env.openMode === "throw") throw new DOMException("denied", "SecurityError");
      env.opens++;
      const req = new FakeRequest();
      setTimeout(() => {
        if (env.openMode === "hang") return;
        if (env.openMode === "blocked") return req.onblocked?.();
        if (env.openMode === "error") {
          req.error = new DOMException("nope", "UnknownError");
          return req.onerror?.();
        }
        const db = new FakeDb(env);
        db.stores.add("crests");
        env.dbs.push(db);
        req.result = db;
        if (!upgraded) {
          upgraded = true;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      }, 0);
      return req;
    },
  } as unknown as IDBFactory;
}

function newEnv(): Env {
  return { data: new Map(), openMode: "ok", abortNextWrite: null, errorNextWrite: false, throwNextTransaction: false, opens: 0, dbs: [] };
}

function input(teamId: string, bytes = "crest-a"): ClubCrestInput {
  return {
    teamId,
    image: new Blob([bytes], { type: "image/png" }),
    width: 120,
    height: 160,
    backgroundRemoved: false,
    needsBacking: false,
    teamName: "Galbally",
  };
}

async function blobText(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
}

// Every crest test also proves no localStorage access at all.
let storageCalls: string[] = [];
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, '[{"id":"t1","teamName":"Galbally","players":[]}]');
  storageCalls = [];
  for (const m of ["getItem", "setItem", "removeItem", "clear", "key"] as const) {
    const original = Storage.prototype[m] as (...a: unknown[]) => unknown;
    vi.spyOn(Storage.prototype, m).mockImplementation(function (this: Storage, ...args: unknown[]) {
      storageCalls.push(`${m}:${String(args[0])}`);
      return original.apply(this, args);
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  expect(window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY)).toBe('[{"id":"t1","teamName":"Galbally","players":[]}]');
});

describe("crest store — save, replace, load, remove", () => {
  it("saves a crest keyed by the Saved Team id and reads it back", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    const saved = await saveClubCrest(input("t1"), backend, () => 1234);
    expect(saved).toMatchObject({ v: 1, teamId: "t1", width: 120, height: 160, updatedAt: 1234 });
    expect(saved).not.toHaveProperty("original");
    expect(env.data.has("t1")).toBe(true);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("crest-a");
    expect(storageCalls).toEqual([]);
  });

  it("keeps the original artwork alongside a background-removed crest", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest({ ...input("t1", "removed"), backgroundRemoved: true, original: new Blob(["orig"]) }, backend);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded?.backgroundRemoved).toBe(true);
    expect(loaded?.original && (await blobText(loaded.original))).toBe("orig");
  });

  it("replaces a crest only when the new write commits", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "first"), backend);
    await saveClubCrest(input("t1", "second"), backend);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("second");
    expect(env.data.size).toBe(1);
  });

  it("does not report success before the transaction completes", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    let settled = false;
    const p = saveClubCrest(input("t1"), backend).then(() => (settled = true));
    // Open + request success happen over the first ticks; the commit lands later.
    await tick();
    await tick();
    expect(env.data.has("t1")).toBe(false);
    expect(settled).toBe(false);
    await p;
    expect(settled).toBe(true);
    expect(env.data.has("t1")).toBe(true);
  });

  it("removes a crest only on an explicit remove", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1"), backend);
    await removeClubCrest("t1", backend);
    expect(await loadClubCrest("t1", backend)).toBeNull();
    expect(storageCalls).toEqual([]);
  });
});

describe("crest store — failures keep the previous crest", () => {
  it("a quota abort at commit rejects with 'quota' and keeps the previous crest", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "keep-me"), backend);
    env.abortNextWrite = new DOMException("Quota exceeded", "QuotaExceededError");
    const err = await saveClubCrest(input("t1", "new"), backend).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrestStoreError);
    expect((err as CrestStoreError).reason).toBe("quota");
    expect((err as CrestStoreError).message).toMatch(/previous crest has been kept/);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("keep-me");
  });

  it("an interrupted write (abort after request success) rejects and keeps the previous crest", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "keep-me"), backend);
    env.abortNextWrite = new DOMException("Aborted", "AbortError");
    const err = await saveClubCrest(input("t1", "new"), backend).catch((e: unknown) => e);
    expect((err as CrestStoreError).reason).toBe("unavailable");
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("keep-me");
  });

  it("a transaction error rejects and keeps the previous crest", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "keep-me"), backend);
    env.errorNextWrite = true;
    await expect(saveClubCrest(input("t1", "new"), backend)).rejects.toBeInstanceOf(CrestStoreError);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("keep-me");
  });

  it("a failed remove rejects and the crest is still stored", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "keep-me"), backend);
    env.errorNextWrite = true;
    await expect(removeClubCrest("t1", backend)).rejects.toThrow(/still saved/);
    expect(env.data.has("t1")).toBe(true);
  });

  it("an invalid crest is rejected before anything is written", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await expect(saveClubCrest({ ...input("t1"), image: new Blob([]) }, backend)).rejects.toBeInstanceOf(CrestStoreError);
    await expect(saveClubCrest({ ...input(""), width: 0 }, backend)).rejects.toBeInstanceOf(CrestStoreError);
    expect(env.opens).toBe(0);
  });
});

describe("crest store — database unavailable", () => {
  it("no IndexedDB: reads give null, writes reject, nothing throws synchronously", async () => {
    const backend = createIndexedDbCrestBackend(() => undefined);
    expect(await loadClubCrest("t1", backend)).toBeNull();
    await expect(saveClubCrest(input("t1"), backend)).rejects.toMatchObject({ reason: "unavailable" });
    await expect(removeClubCrest("t1", backend)).rejects.toBeInstanceOf(CrestStoreError);
    expect(isCrestStorageSupported(() => undefined)).toBe(false);
    expect(storageCalls).toEqual([]);
  });

  it("open throwing (e.g. a locked-down private mode) is treated as unavailable", async () => {
    const env = newEnv();
    env.openMode = "throw";
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    expect(await loadClubCrest("t1", backend)).toBeNull();
    await expect(saveClubCrest(input("t1"), backend)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("blocked and failed opens are not cached — the next call reopens", async () => {
    const env = newEnv();
    env.openMode = "blocked";
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    expect(await loadClubCrest("t1", backend)).toBeNull();
    env.openMode = "error";
    expect(await loadClubCrest("t1", backend)).toBeNull();
    env.openMode = "ok";
    await saveClubCrest(input("t1"), backend);
    expect(await loadClubCrest("t1", backend)).not.toBeNull();
    expect(env.opens).toBe(3);
  });

  it("an open that never answers times out instead of hanging", async () => {
    vi.useFakeTimers();
    const env = newEnv();
    env.openMode = "hang";
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    const p = loadClubCrest("t1", backend);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toBeNull();
  });

  it("a silently closed connection is reopened once and the write succeeds", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1", "a"), backend);
    env.throwNextTransaction = true;
    await saveClubCrest(input("t1", "b"), backend);
    expect(env.opens).toBe(2);
    const loaded = await loadClubCrest("t1", backend);
    expect(loaded && (await blobText(loaded.image))).toBe("b");
  });

  it("a closed connection (storage cleared / evicted) is dropped and reopened", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    await saveClubCrest(input("t1"), backend);
    env.dbs[0].onclose?.();
    env.data.clear(); // site data cleared
    expect(await loadClubCrest("t1", backend)).toBeNull();
    expect(env.opens).toBe(2);
  });
});

describe("crest store — reading back", () => {
  it("ignores malformed records and records filed under another team", async () => {
    const env = newEnv();
    const backend = createIndexedDbCrestBackend(() => fakeFactory(env));
    env.data.set("bad", { v: 1, teamId: "bad", image: "not a blob" });
    expect(await loadClubCrest("bad", backend)).toBeNull();
    const other = { ...input("t2"), v: 1, updatedAt: 1 };
    env.data.set("t1", other);
    expect(await loadClubCrest("t1", backend)).toBeNull();
    expect(await loadClubCrest("", backend)).toBeNull();
    expect(isClubCrestRecord({ ...input("t1"), v: 2, updatedAt: 1 })).toBe(false);
  });
});

describe("crest modules never touch localStorage", () => {
  it("no crest source file references localStorage or the Saved Teams key", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of ["crest-store.ts", "crest-image.ts", "CrestSheet.tsx", "CrestThumb.tsx"]) {
      const code = readFileSync(join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, f).not.toMatch(/localStorage|sessionStorage|pitchflow_saved_squads|SAVED_SQUADS_STORAGE_KEY|pro-tagger-team-storage/);
    }
  });
});
