// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { createIndexedDbKitImageBackend, loadUserKitImage, loadUserKitRecords, saveUserKit } from "./team-sheet-kit-store";

// Minimal fake IndexedDB: just enough of IDBFactory/IDBDatabase/IDBTransaction
// to drive the backend's lifecycle paths (commit vs abort, versionchange,
// close, blocked opens) deterministically. Writes only land on commit, like
// the real thing, and every callback fires asynchronously.

const tick = () => new Promise((r) => setTimeout(r, 0));

interface FakeEnv {
  data: Map<string, unknown>;
  hasStore: boolean;
  openMode: "ok" | "blocked" | "error";
  /** Blocked opens succeed later once the "other tab" closes. */
  succeedAfterBlocked: boolean;
  abortNextWrite: boolean;
  opens: number;
  dbs: FakeDb[];
}

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
  private env: FakeEnv;
  private mode: IDBTransactionMode;
  constructor(env: FakeEnv, mode: IDBTransactionMode) {
    this.env = env;
    this.mode = mode;
    setTimeout(() => this.finish(), 0);
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
      put: (blob: unknown, id: string) => req(() => (this.pending.push(() => this.env.data.set(id, blob)), id)),
      delete: (id: string) => req(() => (this.pending.push(() => this.env.data.delete(id)), undefined)),
      get: (id: string) => req(() => this.env.data.get(id)),
    };
  }
  private finish() {
    // Runs after the request callbacks queued in the same tick.
    setTimeout(() => {
      if (this.mode === "readwrite" && this.env.abortNextWrite) {
        this.env.abortNextWrite = false;
        this.error = new DOMException("Quota exceeded", "QuotaExceededError");
        this.onabort?.();
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
  private env: FakeEnv;
  objectStoreNames = { contains: () => this.env.hasStore };
  constructor(env: FakeEnv) {
    this.env = env;
  }
  createObjectStore() {
    this.env.hasStore = true;
  }
  transaction(_name: string, mode: IDBTransactionMode) {
    if (this.closed) throw new DOMException("The database connection is closing.", "InvalidStateError");
    return new FakeTx(this.env, mode);
  }
  close() {
    this.closed = true;
  }
}

function createEnv(): FakeEnv {
  return { data: new Map(), hasStore: false, openMode: "ok", succeedAfterBlocked: false, abortNextWrite: false, opens: 0, dbs: [] };
}

function fakeFactory(env: FakeEnv): IDBFactory {
  return {
    open() {
      env.opens++;
      const request = new FakeRequest();
      const succeed = () => {
        const db = new FakeDb(env);
        env.dbs.push(db);
        request.result = db;
        if (!env.hasStore) request.onupgradeneeded?.();
        request.onsuccess?.();
      };
      setTimeout(() => {
        if (env.openMode === "error") {
          request.error = new DOMException("nope", "UnknownError");
          request.onerror?.();
        } else if (env.openMode === "blocked") {
          request.onblocked?.();
          if (env.succeedAfterBlocked) setTimeout(succeed, 0);
        } else {
          succeed();
        }
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
}

const blob = () => new Blob(["img"], { type: "image/png" });
let env: FakeEnv;

beforeEach(() => {
  window.localStorage.clear();
  env = createEnv();
});

describe("IndexedDB kit image backend", () => {
  it("creates the store on first open, round-trips a blob and reuses one connection", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    const image = blob();
    await backend.put("user:a", image);
    expect(await backend.get("user:a")).toBe(image);
    await backend.delete("user:a");
    expect(await backend.get("user:a")).toBeNull();
    expect(env.hasStore).toBe(true);
    expect(env.opens).toBe(1);
  });

  it("rejects a write whose transaction aborts at commit, even though the request succeeded", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    env.abortNextWrite = true;
    await expect(backend.put("user:a", blob())).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(env.data.has("user:a")).toBe(false);
  });

  it("never lists a kit whose image transaction failed", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    env.abortNextWrite = true;
    await expect(saveUserKit({ teamId: "t", name: "Away", role: "outfield", image: blob() }, backend)).rejects.toBeTruthy();
    expect(loadUserKitRecords()).toEqual([]);
    // The next save, with no failure, is listed and readable.
    const record = await saveUserKit({ teamId: "t", name: "Away", role: "outfield", image: blob() }, backend);
    expect(loadUserKitRecords().map((r) => r.id)).toEqual([record.id]);
  });

  it("closes and drops its connection on versionchange, then reopens on next use", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    await backend.put("user:a", blob());
    env.dbs[0].onversionchange?.();
    expect(env.dbs[0].closed).toBe(true);
    expect(await backend.get("user:a")).not.toBeNull();
    expect(env.opens).toBe(2);
  });

  it("drops a connection the browser closed (onclose) and reopens", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    await backend.put("user:a", blob());
    env.dbs[0].closed = true;
    env.dbs[0].onclose?.();
    expect(await backend.get("user:a")).not.toBeNull();
    expect(env.opens).toBe(2);
  });

  it("retries once on a fresh connection when a closed connection throws without an event", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    await backend.put("user:a", blob());
    env.dbs[0].closed = true; // closed silently: no onclose fired
    expect(await backend.get("user:a")).not.toBeNull();
    expect(env.opens).toBe(2);
  });

  it("gives up on a blocked open instead of hanging, closes the late connection, and recovers", async () => {
    const backend = createIndexedDbKitImageBackend(() => fakeFactory(env));
    env.openMode = "blocked";
    env.succeedAfterBlocked = true;
    await expect(backend.get("user:a")).rejects.toThrow(/blocked/);
    expect(await loadUserKitImage("user:a", backend)).toBeNull();
    await tick();
    await tick();
    expect(env.dbs.length).toBeGreaterThan(0);
    expect(env.dbs.every((db) => db.closed)).toBe(true);

    env.openMode = "ok";
    await backend.put("user:a", blob());
    expect(await backend.get("user:a")).not.toBeNull();
  });

  it("does not cache a failed open", async () => {
    let calls = 0;
    const backend = createIndexedDbKitImageBackend(() => {
      calls++;
      if (calls === 1) throw new Error("IndexedDB unavailable");
      return fakeFactory(env);
    });
    await expect(backend.get("user:a")).rejects.toThrow(/unavailable/);
    env.openMode = "error";
    await expect(backend.get("user:a")).rejects.toBeTruthy();
    env.openMode = "ok";
    await backend.put("user:a", blob());
    expect(await backend.get("user:a")).not.toBeNull();
  });
});
