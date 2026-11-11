// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CrestSheet } from "./CrestSheet";
import { CREST_MESSAGES, checkCrestFile, crestVisibleBounds, type CrestCodec, type PixelImage } from "./crest-image";
import type { ClubCrestRecord } from "./crest-store";
import {
  blobText,
  memoryCrestBackend,
  plainBackgroundCrest,
  pngFile,
  quotaError,
  textFile,
  transparentCrest,
  type MemoryCrestBackend,
} from "./crestTestFixtures";

type Deferred = { promise: Promise<PixelImage>; resolve: (img: PixelImage) => void };

/** Real file checks; decode/encode replaced (no canvas in jsdom). */
function fakeCodec(images: Record<string, PixelImage | (() => Promise<PixelImage>)>): CrestCodec & { decodes: string[] } {
  const codec = {
    decodes: [] as string[],
    check: (file: File) => checkCrestFile(file),
    async decode(file: File) {
      codec.decodes.push(file.name);
      const entry = images[file.name];
      if (!entry) throw new Error(CREST_MESSAGES.decodeFailed);
      return typeof entry === "function" ? entry() : entry;
    },
    paint: () => {},
    async encode(img: PixelImage, alpha: Uint8ClampedArray) {
      const b = crestVisibleBounds(img, alpha);
      if (!b) throw new Error(CREST_MESSAGES.nothingVisible);
      let sum = 0;
      for (const a of alpha) sum += a;
      return { blob: new Blob([`png:${b.width}x${b.height}:${sum}`], { type: "image/png" }), width: b.width, height: b.height };
    },
  };
  return codec;
}

const TEAM = { id: "team-galbally", teamName: "Galbally" };
let backend: MemoryCrestBackend;
let storageWrites: string[];

beforeEach(() => {
  backend = memoryCrestBackend();
  storageWrites = [];
  for (const m of ["setItem", "removeItem", "clear"] as const) {
    vi.spyOn(Storage.prototype, m).mockImplementation((...args: unknown[]) => {
      storageWrites.push(`${m}:${String(args[0])}`);
    });
  }
});
afterEach(() => {
  cleanup();
  // No crest action ever writes to localStorage.
  expect(storageWrites).toEqual([]);
  vi.restoreAllMocks();
});

function open(codec: CrestCodec, extra: Partial<Parameters<typeof CrestSheet>[0]> = {}) {
  const onChanged = vi.fn();
  render(<CrestSheet team={TEAM} onClose={() => {}} onChanged={onChanged} codec={codec} backend={backend} storageSupported {...extra} />);
  return onChanged;
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Choose crest image"), { target: { files: [file] } });
}

const stored = () => backend.data.get(TEAM.id) as ClubCrestRecord | undefined;

describe("CrestSheet — upload, preview and save", () => {
  it("uploads, previews and saves the original artwork with background removal off by default", async () => {
    const onChanged = open(fakeCodec({ "crest.png": plainBackgroundCrest() }));
    expect(await screen.findByText("No crest yet")).toBeTruthy();
    choose(pngFile(60, 60));
    const toggle = (await screen.findByLabelText("Remove plain background")) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByLabelText("Original crest preview")).toBeTruthy();
    expect(screen.getByLabelText("Background removed crest preview")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    expect(await screen.findByText("Crest saved.")).toBeTruthy();
    const record = stored();
    expect(record).toMatchObject({ teamId: TEAM.id, teamName: "Galbally", backgroundRemoved: false, width: 60, height: 60 });
    expect(record).not.toHaveProperty("original");
    expect(onChanged).toHaveBeenCalledWith(TEAM.id);
  });

  it("accepting background removal stores the removed crest and keeps the original artwork", async () => {
    open(fakeCodec({ "crest.png": plainBackgroundCrest() }));
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByLabelText("Remove plain background"));
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    const record = stored()!;
    expect(record.backgroundRemoved).toBe(true);
    expect({ width: record.width, height: record.height }).toEqual({ width: 30, height: 42 }); // natural shape, not squared
    expect(record.original).toBeInstanceOf(Blob);
    expect(await blobText(record.original!)).toMatch(/^png:60x60:/);
  });

  it("a transparent crest keeps its transparency and is not offered removal", async () => {
    open(fakeCodec({ "crest.png": transparentCrest() }));
    choose(pngFile(60, 60));
    expect(await screen.findByText("Transparent background kept.")).toBeTruthy();
    expect(screen.queryByLabelText("Remove plain background")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect(stored()).toMatchObject({ width: 30, height: 30, backgroundRemoved: false });
  });

  it("a slower earlier pick never replaces a later one", async () => {
    let first!: Deferred;
    const codec = fakeCodec({
      "slow.png": () => {
        let resolve!: (i: PixelImage) => void;
        const promise = new Promise<PixelImage>((r) => (resolve = r));
        first = { promise, resolve };
        return promise;
      },
      "crest.png": transparentCrest(),
    });
    open(codec);
    choose(pngFile(60, 60, "slow.png"));
    await waitFor(() => expect(codec.decodes).toEqual(["slow.png"]));
    choose(pngFile(60, 60));
    await screen.findByText("Transparent background kept.");
    first.resolve(plainBackgroundCrest()); // late result for the stale pick
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText("Remove plain background")).toBeNull();
  });
});

describe("CrestSheet — rejected files", () => {
  it.each([
    ["an SVG (even named .png)", textFile("<svg><script>x()</script></svg>", "crest.png", "image/png"), CREST_MESSAGES.svg],
    ["a GIF", textFile("GIF89a......", "c.gif", "image/gif"), CREST_MESSAGES.gif],
    ["a corrupt file", textFile("\u0000\u0001garbage", "c.jpg", "image/jpeg"), CREST_MESSAGES.unsupported],
    ["a header declaring a huge image", pngFile(30000, 30000), CREST_MESSAGES.tooManyPixels],
  ])("%s is rejected before decoding and nothing is stored", async (_label, file, message) => {
    const codec = fakeCodec({});
    open(codec);
    choose(file);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(codec.decodes).toEqual([]);
    expect(backend.data.size).toBe(0);
    expect(screen.queryByRole("button", { name: "Save crest" })).toBeNull();
  });

  it("a decoding failure shows a message and stores nothing", async () => {
    open(fakeCodec({}));
    choose(pngFile(60, 60, "broken.png"));
    expect(await screen.findByText(CREST_MESSAGES.decodeFailed)).toBeTruthy();
    expect(backend.data.size).toBe(0);
  });
});

describe("CrestSheet — replace and remove", () => {
  async function seed() {
    const existing: ClubCrestRecord = {
      v: 1, teamId: TEAM.id, image: new Blob(["old"], { type: "image/png" }), width: 40, height: 50,
      backgroundRemoved: false, needsBacking: false, teamName: "Galbally", updatedAt: 1,
    };
    backend.data.set(TEAM.id, existing);
    return existing;
  }

  it("a successful replacement swaps the crest", async () => {
    await seed();
    open(fakeCodec({ "crest.png": transparentCrest() }));
    expect(await screen.findByText("Current crest")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace crest" })).toBeTruthy();
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect(await blobText(stored()!.image)).toMatch(/^png:30x30/);
  });

  it("a failed replacement (storage full) keeps the previous crest", async () => {
    const existing = await seed();
    const onChanged = open(fakeCodec({ "crest.png": transparentCrest() }));
    await screen.findByText("Current crest");
    backend.failPut = quotaError();
    choose(pngFile(60, 60));
    fireEvent.click(await screen.findByRole("button", { name: "Save crest" }));
    expect(await screen.findByText(/out of storage space\. The previous crest has been kept\./)).toBeTruthy();
    expect(stored()).toBe(existing);
    expect(onChanged).not.toHaveBeenCalled();
    // The coach can retry once space is freed.
    backend.failPut = null;
    fireEvent.click(screen.getByRole("button", { name: "Save crest" }));
    await screen.findByText("Crest saved.");
    expect(stored()).not.toBe(existing);
  });

  it("remove needs a second tap and warns that past matches lose the crest", async () => {
    await seed();
    const onChanged = open(fakeCodec({}));
    fireEvent.click(await screen.findByRole("button", { name: "Remove crest" }));
    expect(screen.getByText(/also removes the crest from past matches/)).toBeTruthy();
    expect(backend.data.has(TEAM.id)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    expect(await screen.findByText("Crest removed.")).toBeTruthy();
    expect(backend.data.has(TEAM.id)).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(TEAM.id);
  });

  it("a failed remove keeps the crest", async () => {
    const existing = await seed();
    open(fakeCodec({}));
    backend.failDelete = new Error("tx failed");
    fireEvent.click(await screen.findByRole("button", { name: "Remove crest" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove crest" }));
    expect(await screen.findByText(/It is still saved/)).toBeTruthy();
    expect(stored()).toBe(existing);
  });
});

describe("CrestSheet — storage unavailable", () => {
  it("explains crests are unavailable and offers no upload", () => {
    open(fakeCodec({}), { storageSupported: false, backend: undefined });
    expect(screen.getByText(/aren't available in this browser mode/)).toBeTruthy();
    expect(screen.queryByLabelText("Choose crest image")).toBeNull();
  });

  it("an unreadable store shows no crest rather than failing", async () => {
    backend.failGet = new Error("broken");
    open(fakeCodec({}));
    expect(await screen.findByText("No crest yet")).toBeTruthy();
  });
});
