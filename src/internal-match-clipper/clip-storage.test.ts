// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MATCH_CLIPPER_STORAGE_KEY,
  MAX_PROJECTS,
  emptyStore,
  loadClipperStore,
  parseStore,
  removeProject,
  saveClipperStore,
  upsertProject,
} from "./clip-storage";
import { sourceKey, type ClipProject, type ClipSelection } from "./clip-types";

function clip(over: Partial<ClipSelection> = {}): ClipSelection {
  return { id: "clip:1", name: "Score 1", category: "score", start: 1529, end: 1535, origin: "timestamp", createdAt: 1, ...over };
}
function project(over: Partial<ClipProject> = {}): ClipProject {
  const fileName = over.fileName ?? "final.mp4";
  const fileSize = over.fileSize ?? 451_000_000;
  return { key: sourceKey(fileName, fileSize), fileName, fileSize, duration: 4620, clips: [clip()], updatedAt: 10, ...over };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("clip storage", () => {
  it("starts empty", () => {
    expect(loadClipperStore()).toEqual({ status: "empty", store: emptyStore() });
  });

  it("round-trips clips with names, categories, order and ranges", () => {
    const p = project({ clips: [clip({ id: "a", name: "Kickout", category: "kickout" }), clip({ id: "b", start: 10, end: 16.5 })] });
    expect(saveClipperStore(upsertProject(emptyStore(), p))).toEqual({ ok: true });
    const loaded = loadClipperStore();
    expect(loaded.status).toBe("ok");
    expect(loaded.store.lastProjectKey).toBe(p.key);
    expect(loaded.store.projects[0]!.clips).toEqual(p.clips);
  });

  it("uses its own key and leaves other keys alone", () => {
    window.localStorage.setItem("paircvision_pro_tagger_matches_v1", "[1]");
    saveClipperStore(upsertProject(emptyStore(), project()));
    expect(window.localStorage.getItem("paircvision_pro_tagger_matches_v1")).toBe("[1]");
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).not.toBeNull();
  });

  it("never overwrites an unreadable value", () => {
    window.localStorage.setItem(MATCH_CLIPPER_STORAGE_KEY, "{not json");
    expect(loadClipperStore().status).toBe("unreadable");
    expect(saveClipperStore(upsertProject(emptyStore(), project()))).toEqual({ ok: false, reason: "unreadable" });
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe("{not json");
  });

  it("reports a full quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveClipperStore(upsertProject(emptyStore(), project()))).toEqual({ ok: false, reason: "full" });
  });

  it("drops invalid clips but keeps valid ones", () => {
    const store = parseStore({
      version: 1,
      lastProjectKey: "final.mp4::5",
      projects: [{
        fileName: "final.mp4", fileSize: 5, duration: 100, updatedAt: 1,
        clips: [clip({ id: "ok" }), { id: "bad", start: 10, end: 5 }, { id: "nan", start: "x", end: 3 }, clip({ id: "cat", category: "zzz" as never })],
      }],
    });
    expect(store!.projects[0]!.clips.map((c) => [c.id, c.category])).toEqual([["ok", "score"], ["cat", "other"]]);
    expect(store!.lastProjectKey).toBe("final.mp4::5");
  });

  it("keeps the most recently used projects within the cap", () => {
    let store = emptyStore();
    for (let i = 0; i < MAX_PROJECTS + 5; i++) store = upsertProject(store, project({ fileName: `m${i}.mp4`, updatedAt: i }));
    expect(saveClipperStore(store)).toEqual({ ok: true });
    const loaded = loadClipperStore().store;
    expect(loaded.projects).toHaveLength(MAX_PROJECTS);
    expect(loaded.projects[0]!.fileName).toBe(`m${MAX_PROJECTS + 4}.mp4`);
  });

  it("removes a project and clears the last-used pointer", () => {
    const p = project();
    const store = removeProject(upsertProject(emptyStore(), p), p.key);
    expect(store).toEqual(emptyStore());
  });

  it("identifies a match by name and size, not lastModified", () => {
    expect(sourceKey("final.mp4", 451_000_000)).toBe("final.mp4::451000000");
  });
});
