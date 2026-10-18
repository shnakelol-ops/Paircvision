import { describe, expect, it, vi } from "vitest";
import { PRESET_KITS, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import { createMemoryKitImageBackend } from "../internal-team-sheet/team-sheet-kit-store";
import {
  clearPresetSpecks,
  loadCoverJersey,
  resolveCoverJersey,
  visibleBounds,
  type CoverImage,
  type JerseyKind,
} from "./matchday-cover-assets";
import type { MatchdaySide } from "./matchday-pack-types";

const ballylanders: MatchdaySide = {
  teamId: "ballylanders",
  name: "Ballylanders",
  colours: { primary: "#f2c12e", secondary: "#138a3a" },
  outfieldKitId: "preset:ballylanders-yellow",
};
const opponent: MatchdaySide = {
  teamId: "team:galtee",
  name: "Galtee Rovers",
  colours: { primary: "#1f8a46", secondary: "#f2c12e" },
  outfieldKitId: null,
};
const opponentKit: TeamSheetKit = { id: "user:galtee-home", teamId: "team:galtee", name: "Home", role: "outfield", source: "user" };
const ballylandersUserKit: TeamSheetKit = { id: "user:bl-green", teamId: "ballylanders", name: "Green", role: "outfield", source: "user" };
const KITS: TeamSheetKit[] = [...PRESET_KITS, opponentKit, ballylandersUserKit];

describe("resolveCoverJersey — never another club's kit", () => {
  it("resolves the home side's own preset", () => {
    expect(resolveCoverJersey(ballylanders, KITS)).toEqual({
      kind: "preset",
      kitId: "preset:ballylanders-yellow",
      src: "/internal/ballylanders-outfield-jersey.webp",
    });
  });

  it("resolves an opponent's own uploaded kit", () => {
    expect(resolveCoverJersey({ ...opponent, outfieldKitId: opponentKit.id }, KITS)).toEqual({ kind: "user", kitId: opponentKit.id });
  });

  it("gives an opponent with no kit the neutral jersey — not the Ballylanders default", () => {
    expect(resolveCoverJersey(opponent, KITS)).toEqual({ kind: "none" });
  });

  it("refuses a kit that belongs to a different team", () => {
    expect(resolveCoverJersey({ ...opponent, outfieldKitId: "preset:ballylanders-green" }, KITS)).toEqual({ kind: "none" });
    expect(resolveCoverJersey({ ...opponent, outfieldKitId: ballylandersUserKit.id }, KITS)).toEqual({ kind: "none" });
  });

  it("refuses a deleted kit and a goalkeeper kit", () => {
    expect(resolveCoverJersey({ ...opponent, outfieldKitId: "user:deleted" }, KITS)).toEqual({ kind: "none" });
    expect(resolveCoverJersey({ ...ballylanders, outfieldKitId: "preset:ballylanders-gk-black" }, KITS)).toEqual({ kind: "none" });
  });
});

describe("loadCoverJersey", () => {
  const fakeImage: CoverImage = { source: {} as CanvasImageSource, width: 300, height: 369 };
  const identity = (img: CoverImage) => img;

  it("loads a stored kit blob from the existing kit image store", async () => {
    const backend = createMemoryKitImageBackend();
    const blob = new Blob(["png"], { type: "image/png" });
    await backend.put(opponentKit.id, blob);
    const loadBlob = vi.fn(async () => fakeImage);
    const img = await loadCoverJersey({ kind: "user", kitId: opponentKit.id }, { backend, loadBlob, prepare: identity });
    expect(img).toBe(fakeImage);
    expect(loadBlob).toHaveBeenCalledWith(blob);
  });

  it("returns null — never a preset — when a user kit's image is missing", async () => {
    const loadUrl = vi.fn(async () => fakeImage);
    const img = await loadCoverJersey(
      { kind: "user", kitId: "user:evicted" },
      { backend: createMemoryKitImageBackend(), loadUrl, prepare: identity },
    );
    expect(img).toBeNull();
    expect(loadUrl).not.toHaveBeenCalled();
  });

  it("returns null when decoding fails or throws", async () => {
    expect(await loadCoverJersey({ kind: "preset", kitId: "p", src: "/x.webp" }, { loadUrl: async () => null })).toBeNull();
    expect(
      await loadCoverJersey(
        { kind: "preset", kitId: "p", src: "/x.webp" },
        {
          loadUrl: async () => {
            throw new Error("decode");
          },
        },
      ),
    ).toBeNull();
    expect(await loadCoverJersey({ kind: "none" })).toBeNull();
  });

  it("prepares presets as presets and uploaded kits as uploads — never the other way round", async () => {
    const prepare = vi.fn((img: CoverImage, _kind: JerseyKind) => img);
    await loadCoverJersey({ kind: "preset", kitId: "p", src: "/x.webp" }, { loadUrl: async () => fakeImage, prepare });
    const backend = createMemoryKitImageBackend();
    await backend.put(opponentKit.id, new Blob(["png"]));
    await loadCoverJersey({ kind: "user", kitId: opponentKit.id }, { backend, loadBlob: async () => fakeImage, prepare });
    expect(prepare.mock.calls.map((c) => c[1])).toEqual(["preset", "user"]);
  });

  it("treats a jersey with no visible pixels as missing", async () => {
    const img = await loadCoverJersey({ kind: "preset", kitId: "p", src: "/x.webp" }, { loadUrl: async () => fakeImage, prepare: () => null });
    expect(img).toBeNull();
  });
});

function rgba(width: number, height: number, alphaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set([200, 150, 40, alphaAt(x, y)], i);
    }
  }
  return data;
}

describe("clearPresetSpecks (presets only — reuses the Kit Builder's keepLargestComponent)", () => {
  it("clears a detached speck and keeps the jersey and every colour byte", () => {
    const inJersey = (x: number, y: number) => x >= 10 && x < 50 && y >= 5 && y < 45;
    const data = rgba(60, 60, (x, y) => (inJersey(x, y) || (x >= 55 && x < 57 && y >= 55 && y < 57) ? 255 : 0));
    const before = data.slice();
    expect(clearPresetSpecks(data, 60, 60)).toBe(4);
    for (let p = 0; p < 3600; p++) {
      const x = p % 60;
      const y = Math.floor(p / 60);
      expect(data[p * 4 + 3]).toBe(inJersey(x, y) ? 255 : 0);
      expect([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]).toEqual([before[p * 4], before[p * 4 + 1], before[p * 4 + 2]]);
    }
  });

  it("is a no-op on a clean or empty image", () => {
    expect(clearPresetSpecks(rgba(20, 20, (x) => (x < 10 ? 255 : 0)), 20, 20)).toBe(0);
    expect(clearPresetSpecks(new Uint8ClampedArray(16 * 4), 4, 4)).toBe(0);
  });
});

describe("visibleBounds — trims margin only", () => {
  it("finds the jersey inside a padded Kit Builder frame", () => {
    // 60×74 frame (the 600×738 kit frame at 1/10) with the jersey centred.
    const data = rgba(60, 74, (x, y) => (x >= 15 && x < 45 && y >= 18 && y < 55 ? 255 : 0));
    expect(visibleBounds(data, 60, 74)).toEqual({ x: 15, y: 18, width: 30, height: 37 });
  });

  it("keeps even the faintest visible edge pixel (alpha 1)", () => {
    const data = rgba(20, 20, (x, y) => (x === 2 && y === 3 ? 1 : x >= 8 && x < 12 && y >= 8 && y < 12 ? 255 : 0));
    expect(visibleBounds(data, 20, 20)).toEqual({ x: 2, y: 3, width: 10, height: 9 });
  });

  it("keeps detached manual Restore strokes inside the bounds (uploads are never cleaned)", () => {
    // A detached 2×2 island far from the jersey — on an upload it stays visible and in frame.
    const data = rgba(40, 40, (x, y) => ((x >= 10 && x < 30 && y >= 10 && y < 30) || (x >= 36 && x < 38 && y >= 36 && y < 38) ? 255 : 0));
    const before = data.slice();
    expect(visibleBounds(data, 40, 40)).toEqual({ x: 10, y: 10, width: 28, height: 28 });
    expect(data).toEqual(before);
  });

  it("returns null when nothing is visible", () => {
    expect(visibleBounds(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toBeNull();
  });
});
