// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipSelection } from "../internal-match-clipper/clip-types";
import { addClips, createMontage, deleteMontage, montagesForSource, moveItem, removeItem, renameMontage, totals, trimItem, upsertMontage } from "./montage-ops";
import { MONTAGE_STORAGE_KEY, emptyMontageStore, loadMontages, parseMontageStore, saveMontages } from "./montage-storage";
import { MAX_MONTAGE_ITEMS } from "./montage-types";

const source = { key: "final.mp4::451000000", fileName: "final.mp4", fileSize: 451000000, duration: 4662 };
function clip(id: string, start: number, end: number, over: Partial<ClipSelection> = {}): ClipSelection {
  return { id, name: `Clip ${id}`, category: "score", start, end, origin: "manual", createdAt: 1, ...over };
}
const deepFreeze = <T,>(o: T): T => {
  Object.freeze(o);
  for (const v of Object.values(o as object)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  return o;
};

beforeEach(() => window.localStorage.clear());

describe("montage editing", () => {
  it("adds copies of clips in order, and never changes the V1 clips", () => {
    const clips = deepFreeze([clip("a", 10, 16), clip("b", 100, 130, { category: "kickout", name: "Kickout setup" })]);
    const m = createMontage("Defensive shape", source, 1000);
    const { project, added } = addClips(m, clips, 2000);
    expect(added).toBe(2);
    expect(project.items.map((i) => [i.clipId, i.name, i.category, i.start, i.end])).toEqual([
      ["a", "Clip a", "score", 10, 16],
      ["b", "Kickout setup", "kickout", 100, 130],
    ]);
    // Trim the copy: the frozen V1 clip would throw if anything tried to change it.
    const t = trimItem(project, project.items[1]!.id, { start: 102, end: 128 });
    expect(t.ok).toBe(true);
    expect(clips[1]).toMatchObject({ start: 100, end: 130 });
  });

  it("skips clips already in the montage and stops at the item limit", () => {
    const m = addClips(createMontage("x", source), [clip("a", 0, 6)]).project;
    const r = addClips(m, [clip("a", 0, 6), clip("b", 10, 16)]);
    expect(r).toMatchObject({ added: 1, skippedDuplicates: 1, skippedFull: 0 });
    const many = Array.from({ length: MAX_MONTAGE_ITEMS + 3 }, (_, i) => clip(`c${i}`, i, i + 1));
    const full = addClips(createMontage("y", source), many);
    expect(full).toMatchObject({ added: MAX_MONTAGE_ITEMS, skippedFull: 3 });
  });

  it("reorders and removes items", () => {
    let m = addClips(createMontage("x", source), [clip("a", 0, 6), clip("b", 10, 16), clip("c", 20, 26)]).project;
    const ids = m.items.map((i) => i.id);
    m = moveItem(m, ids[2]!, -2);
    expect(m.items.map((i) => i.clipId)).toEqual(["c", "a", "b"]);
    expect(moveItem(m, ids[2]!, -1)).toBe(m); // already first: unchanged
    m = removeItem(m, ids[0]!);
    expect(m.items.map((i) => i.clipId)).toEqual(["c", "b"]);
  });

  it("validates trims: inside the video, 0.5 s to 10 min, rounded to tenths", () => {
    const m = addClips(createMontage("x", source), [clip("a", 10, 16)]).project;
    const id = m.items[0]!.id;
    expect(trimItem(m, id, { start: 9.04, end: 75.06 })).toMatchObject({ ok: true, project: { items: [{ start: 9, end: 75.1 }] } });
    expect(trimItem(m, id, { start: 10, end: 10.2 })).toMatchObject({ ok: false });
    expect(trimItem(m, id, { start: 0, end: 601 })).toMatchObject({ ok: false });
    expect(trimItem(m, id, { start: 4660, end: 4670 })).toMatchObject({ ok: false, reason: "The end is after the end of the video." });
    expect(trimItem(m, "missing", { start: 1, end: 5 })).toMatchObject({ ok: false });
  });

  it("supports long analysis clips (e.g. a 90 s kickout setup)", () => {
    const m = addClips(createMontage("x", source), [clip("k", 600, 690, { category: "kickout" })]).project;
    expect(totals(m)).toEqual({ count: 1, seconds: 90 });
  });

  it("totals, rename, per-source listing and delete", () => {
    let store = emptyMontageStore();
    const a = addClips(createMontage("A", source, 1), [clip("a", 0, 6), clip("b", 10, 25)], 5).project;
    const b = createMontage("B", { ...source, key: "other.mp4::1", fileName: "other.mp4" }, 2);
    store = upsertMontage(upsertMontage(store, a), b);
    expect(totals(a)).toEqual({ count: 2, seconds: 21 });
    expect(montagesForSource(store, source.key).map((p) => p.name)).toEqual(["A"]);
    expect(renameMontage(a, "  Kickouts   2nd half ").name).toBe("Kickouts 2nd half");
    expect(renameMontage(a, "   ")).toBe(a);
    expect(deleteMontage(store, a.id).projects.map((p) => p.name)).toEqual(["B"]);
  });
});

describe("montage storage", () => {
  it("round-trips montages under its own key and leaves V1 data alone", () => {
    const v1 = '{"version":1,"lastProjectKey":null,"projects":[]}';
    window.localStorage.setItem("paircvision_internal_match_clipper_v1", v1);
    const m = addClips(createMontage("Defensive shape", source), [clip("a", 10, 16)]).project;
    expect(saveMontages(upsertMontage(emptyMontageStore(), m))).toEqual({ ok: true });
    const loaded = loadMontages();
    expect(loaded.status).toBe("ok");
    expect(loaded.store.projects[0]).toEqual(m);
    expect(window.localStorage.getItem("paircvision_internal_match_clipper_v1")).toBe(v1);
    expect(window.localStorage.getItem(MONTAGE_STORAGE_KEY)).not.toBeNull();
  });

  it("never overwrites an unreadable saved value", () => {
    window.localStorage.setItem(MONTAGE_STORAGE_KEY, "{broken");
    expect(loadMontages().status).toBe("unreadable");
    expect(saveMontages(upsertMontage(emptyMontageStore(), createMontage("x", source)))).toEqual({ ok: false, reason: "unreadable" });
    expect(window.localStorage.getItem(MONTAGE_STORAGE_KEY)).toBe("{broken");
  });

  it("reports a full device instead of losing data silently", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveMontages(upsertMontage(emptyMontageStore(), createMontage("x", source)))).toEqual({ ok: false, reason: "full" });
    vi.restoreAllMocks();
  });

  it("drops invalid items and projects but keeps valid ones", () => {
    const store = parseMontageStore({
      version: 1,
      projects: [
        { id: "m1", name: "Ok", sourceKey: "k", sourceName: "f.mp4", sourceSize: 1, sourceDuration: 100, createdAt: 1, updatedAt: 1,
          items: [{ id: "i1", clipId: "a", name: "A", category: "zzz", start: 1, end: 5, addedAt: 1 }, { id: "i2", start: 5, end: 4 }] },
        { id: "m2", name: "No source" },
      ],
    })!;
    expect(store.projects).toHaveLength(1);
    expect(store.projects[0]!.items).toEqual([{ id: "i1", clipId: "a", name: "A", category: "other", start: 1, end: 5, addedAt: 1 }]);
  });
});
