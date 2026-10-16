// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  TEAM_SHEET_KITS_STORAGE_KEY,
  createMemoryKitImageBackend,
  deleteUserKit,
  loadUserKitImage,
  loadUserKitOriginal,
  originalImageKey,
  loadUserKitRecords,
  saveUserKit,
  userKitRecordToKit,
} from "./team-sheet-kit-store";

beforeEach(() => {
  window.localStorage.clear();
});

const image = () => new Blob(["png-bytes"], { type: "image/png" });

describe("User kit store", () => {
  it("is empty by default", () => {
    expect(loadUserKitRecords()).toEqual([]);
  });

  it("saves metadata as a JSON array and the image blob in the image backend", async () => {
    const backend = createMemoryKitImageBackend();
    const blob = image();
    const record = await saveUserKit({ teamId: "ballylanders", name: " Away ", role: "outfield", image: blob }, backend);

    expect(record.id.startsWith("user:")).toBe(true);
    expect(record.name).toBe("Away");
    // Plain JSON array — the shape a backup "json-array" domain can carry.
    const raw = JSON.parse(window.localStorage.getItem(TEAM_SHEET_KITS_STORAGE_KEY)!);
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toEqual([record]);
    // Image bytes never go into localStorage.
    expect(window.localStorage.getItem(TEAM_SHEET_KITS_STORAGE_KEY)).not.toContain("png-bytes");
    expect(await loadUserKitImage(record.id, backend)).toBe(blob);
  });

  it("maps a record to a user-source kit", async () => {
    const backend = createMemoryKitImageBackend();
    const record = await saveUserKit({ teamId: "t", name: "GK Green", role: "gk", image: image() }, backend);
    expect(userKitRecordToKit(record)).toEqual({ id: record.id, teamId: "t", name: "GK Green", role: "gk", source: "user" });
  });

  it("deletes both metadata and image", async () => {
    const backend = createMemoryKitImageBackend();
    const a = await saveUserKit({ teamId: "t", name: "A", role: "outfield", image: image() }, backend);
    const b = await saveUserKit({ teamId: "t", name: "B", role: "outfield", image: image() }, backend);
    await deleteUserKit(a.id, backend);
    expect(loadUserKitRecords().map((r) => r.id)).toEqual([b.id]);
    expect(await loadUserKitImage(a.id, backend)).toBeNull();
  });

  it("drops malformed metadata entries rather than failing", () => {
    window.localStorage.setItem(
      TEAM_SHEET_KITS_STORAGE_KEY,
      JSON.stringify([
        { id: "user:1", teamId: "t", name: "Ok", role: "gk", createdAt: 1 },
        { id: "preset:x", teamId: "t", name: "Not a user kit", role: "gk", createdAt: 1 },
        { id: "user:2", teamId: "t", name: "Bad role", role: "keeper", createdAt: 1 },
        "junk",
      ]),
    );
    expect(loadUserKitRecords().map((r) => r.id)).toEqual(["user:1"]);
    window.localStorage.setItem(TEAM_SHEET_KITS_STORAGE_KEY, "{oops");
    expect(loadUserKitRecords()).toEqual([]);
  });

  it("stores the original photo next to the processed image and deletes both", async () => {
    const backend = createMemoryKitImageBackend();
    const processed = image();
    const original = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const record = await saveUserKit({ teamId: "t", name: "Home", role: "outfield", image: processed, original }, backend);
    expect(record.hasOriginal).toBe(true);
    expect(await loadUserKitImage(record.id, backend)).toBe(processed);
    expect(await loadUserKitOriginal(record.id, backend)).toBe(original);
    await deleteUserKit(record.id, backend);
    expect(await backend.get(record.id)).toBeNull();
    expect(await backend.get(originalImageKey(record.id))).toBeNull();
  });

  it("rolls back the processed image and lists nothing if storing the original fails", async () => {
    const backend = createMemoryKitImageBackend();
    const written: string[] = [];
    const failing = {
      ...backend,
      put: (id: string, blob: Blob) => {
        if (id.endsWith(":original")) return Promise.reject(new DOMException("full", "QuotaExceededError"));
        written.push(id);
        return backend.put(id, blob);
      },
    };
    await expect(
      saveUserKit({ teamId: "t", name: "Home", role: "outfield", image: image(), original: image() }, failing),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(loadUserKitRecords()).toEqual([]);
    // Nothing orphaned: the processed image that did land was rolled back.
    expect(written).toHaveLength(1);
    expect(await backend.get(written[0])).toBeNull();
  });

  it("returns null instead of throwing when the image backend fails", async () => {
    const failing = { ...createMemoryKitImageBackend(), get: () => Promise.reject(new Error("evicted")) };
    expect(await loadUserKitImage("user:x", failing)).toBeNull();
  });
});
