import { describe, expect, it, vi } from "vitest";
import { PRESET_KITS, type TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import { createMemoryKitImageBackend } from "../internal-team-sheet/team-sheet-kit-store";
import { clearDetachedSpecks, loadCoverJersey, resolveCoverJersey, type CoverImage } from "./matchday-cover-assets";
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
    const img = await loadCoverJersey({ kind: "user", kitId: opponentKit.id }, { backend, loadBlob, clean: identity });
    expect(img).toBe(fakeImage);
    expect(loadBlob).toHaveBeenCalledWith(blob);
  });

  it("returns null — never a preset — when a user kit's image is missing", async () => {
    const loadUrl = vi.fn(async () => fakeImage);
    const img = await loadCoverJersey(
      { kind: "user", kitId: "user:evicted" },
      { backend: createMemoryKitImageBackend(), loadUrl, clean: identity },
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

  it("passes every loaded jersey through speck cleaning", async () => {
    const cleaned: CoverImage = { ...fakeImage, width: 301 };
    const clean = vi.fn(() => cleaned);
    const img = await loadCoverJersey({ kind: "preset", kitId: "p", src: "/x.webp" }, { loadUrl: async () => fakeImage, clean });
    expect(clean).toHaveBeenCalledWith(fakeImage);
    expect(img).toBe(cleaned);
  });
});

describe("clearDetachedSpecks", () => {
  function image(width: number, height: number, opaque: (x: number, y: number) => boolean) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = 200;
        data[i + 1] = 150;
        data[i + 2] = 40;
        data[i + 3] = opaque(x, y) ? 255 : 0;
      }
    }
    return data;
  }

  it("clears small detached islands and keeps the jersey untouched", () => {
    // 40×40 "jersey" block + a 2×2 speck in the corner.
    const data = image(60, 60, (x, y) => (x >= 10 && x < 50 && y >= 5 && y < 45) || (x >= 55 && y >= 55 && x < 57 && y < 57));
    const before = data.slice();
    expect(clearDetachedSpecks(data, 60, 60)).toBe(4);
    for (let p = 0; p < 60 * 60; p++) {
      const x = p % 60;
      const y = Math.floor(p / 60);
      const inJersey = x >= 10 && x < 50 && y >= 5 && y < 45;
      expect(data[p * 4 + 3]).toBe(inJersey ? 255 : 0);
      // Colour channels are never changed.
      expect([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]).toEqual([before[p * 4], before[p * 4 + 1], before[p * 4 + 2]]);
    }
  });

  it("keeps detached parts that are a meaningful size", () => {
    // Two equal blocks — e.g. a split image — both survive.
    const data = image(40, 20, (x) => x < 15 || x >= 25);
    expect(clearDetachedSpecks(data, 40, 20)).toBe(0);
  });

  it("is a no-op on a fully transparent image", () => {
    expect(clearDetachedSpecks(new Uint8ClampedArray(16 * 4), 4, 4)).toBe(0);
  });
});
