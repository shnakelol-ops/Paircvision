/**
 * imageShare.test.ts
 *
 * Covers the unified Share sheet's core primitives. vitest runs in plain
 * Node (no jsdom — see snapshotExport.test.ts), so browser globals
 * (navigator, window, document, URL) are stubbed per-test rather than
 * relying on a DOM environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canShareFiles,
  canWriteImageToClipboard,
  copyImageFile,
  createCachedBlobFileResolver,
  resolveImageBlob,
  saveImageFile,
  shareImageFile,
  toPngFile,
} from "./imageShare";

function makePngBlob(bytes = "pixels"): Blob {
  return new Blob([bytes], { type: "image/png" });
}

function makePngFile(name = "card.png"): File {
  return new File([makePngBlob()], name, { type: "image/png" });
}

describe("resolveImageBlob", () => {
  it("resolves ok for a real, non-empty Blob", async () => {
    const result = await resolveImageBlob(async () => makePngBlob());
    expect(result.ok).toBe(true);
  });

  it("fails when getBlob() throws (capture/Blob-generation failure)", async () => {
    const result = await resolveImageBlob(async () => {
      throw new Error("capture surface not ready");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/couldn't create/i);
  });

  it("fails when getBlob() resolves an empty Blob", async () => {
    const result = await resolveImageBlob(async () => new Blob([], { type: "image/png" }));
    expect(result.ok).toBe(false);
  });

  it("fails when getBlob() resolves something that isn't a Blob", async () => {
    const result = await resolveImageBlob(async () => null as unknown as Blob);
    expect(result.ok).toBe(false);
  });
});

describe("toPngFile", () => {
  it("wraps a plain Blob using the provided filename", () => {
    const file = toPngFile(makePngBlob(), "board");
    expect(file.name).toBe("board.png");
    expect(file.type).toBe("image/png");
  });

  it("does not double up a .png extension already present", () => {
    const file = toPngFile(makePngBlob(), "board.png");
    expect(file.name).toBe("board.png");
  });

  it("preserves an already-named File's own name instead of renaming it", () => {
    const named = makePngFile("ballyboden-nafianna-half-time-summary.png");
    const file = toPngFile(named, "fallback.png");
    expect(file).toBe(named);
    expect(file.name).toBe("ballyboden-nafianna-half-time-summary.png");
  });
});

describe("createCachedBlobFileResolver — repeated action reuses the same Blob", () => {
  it("only calls getBlob once across multiple resolve() calls", async () => {
    const getBlob = vi.fn(async () => makePngBlob());
    const resolver = createCachedBlobFileResolver({ getBlob, filename: "board.png" });

    const first = await resolver.resolve();
    const second = await resolver.resolve();
    const third = await resolver.resolve();

    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(first.file).toBe(second.file);
    expect(second.file).toBe(third.file);
  });

  it("dedupes concurrent in-flight resolve() calls into a single capture", async () => {
    let resolveBlob!: (b: Blob) => void;
    const getBlob = vi.fn(
      () => new Promise<Blob>((resolve) => { resolveBlob = resolve; }),
    );
    const resolver = createCachedBlobFileResolver({ getBlob, filename: "board.png" });

    const p1 = resolver.resolve();
    const p2 = resolver.resolve();
    resolveBlob(makePngBlob());
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(r1.file).toBe(r2.file);
  });

  it("reset() invalidates the cache so the next resolve() captures again", async () => {
    const getBlob = vi.fn(async () => makePngBlob());
    const resolver = createCachedBlobFileResolver({ getBlob, filename: "board.png" });

    await resolver.resolve();
    resolver.reset();
    await resolver.resolve();

    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed capture — a later resolve() retries", async () => {
    let attempt = 0;
    const getBlob = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("not ready yet");
      return makePngBlob();
    });
    const resolver = createCachedBlobFileResolver({ getBlob, filename: "board.png" });

    const first = await resolver.resolve();
    expect(first.file).toBeNull();

    const second = await resolver.resolve();
    expect(second.file).not.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(2);
  });
});

// ─── navigator.share / canShare ─────────────────────────────────────────────

describe("shareImageFile", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  });

  it("shares via navigator.share when canShare({files}) is true (supported native file sharing)", async () => {
    const share = vi.fn(async () => undefined);
    const canShare = vi.fn(() => true);
    Object.defineProperty(globalThis, "navigator", { value: { share, canShare }, configurable: true });

    const outcome = await shareImageFile(makePngFile(), { title: "Match", text: "Summary" });

    expect(outcome.status).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Match", text: "Summary" }));
  });

  it("reports unsupported when navigator.share exists but canShare({files}) is false", async () => {
    const share = vi.fn(async () => undefined);
    const canShare = vi.fn(() => false);
    Object.defineProperty(globalThis, "navigator", { value: { share, canShare }, configurable: true });

    const outcome = await shareImageFile(makePngFile(), {});

    expect(outcome.status).toBe("unsupported");
    expect(share).not.toHaveBeenCalled();
  });

  it("reports unsupported when navigator.share does not exist at all", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });

    const outcome = await shareImageFile(makePngFile(), {});

    expect(outcome.status).toBe("unsupported");
  });

  it("treats AbortError (user cancellation) as cancelled, not a failure", async () => {
    const share = vi.fn(async () => {
      const err = new Error("cancelled");
      err.name = "AbortError";
      throw err;
    });
    const canShare = vi.fn(() => true);
    Object.defineProperty(globalThis, "navigator", { value: { share, canShare }, configurable: true });

    const outcome = await shareImageFile(makePngFile(), {});

    expect(outcome.status).toBe("cancelled");
  });

  it("reports failed for a genuine share rejection", async () => {
    const share = vi.fn(async () => {
      throw new Error("boom");
    });
    const canShare = vi.fn(() => true);
    Object.defineProperty(globalThis, "navigator", { value: { share, canShare }, configurable: true });

    const outcome = await shareImageFile(makePngFile(), {});

    expect(outcome.status).toBe("failed");
  });
});

describe("canShareFiles", () => {
  const originalNavigator = globalThis.navigator;
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  });

  it("never assumes support — returns false when canShare is missing", () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    expect(canShareFiles(makePngFile())).toBe(false);
  });

  it("returns false rather than throwing if canShare itself throws", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { canShare: () => { throw new Error("nope"); } },
      configurable: true,
    });
    expect(canShareFiles(makePngFile())).toBe(false);
  });
});

// ─── Clipboard ──────────────────────────────────────────────────────────────

describe("copyImageFile / canWriteImageToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = globalThis;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("copies successfully when the Async Clipboard API supports images", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "navigator", { value: { clipboard: { write } }, configurable: true });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) { this.items = items; }
    };

    expect(canWriteImageToClipboard()).toBe(true);
    const outcome = await copyImageFile(makePngFile());
    expect(outcome.status).toBe("copied");
    expect(write).toHaveBeenCalledTimes(1);

    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  });

  it("reports unsupported when ClipboardItem/clipboard.write is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

    expect(canWriteImageToClipboard()).toBe(false);
    const outcome = await copyImageFile(makePngFile());
    expect(outcome.status).toBe("unsupported");
  });

  it("reports denied when the browser rejects with NotAllowedError (permission rejection)", async () => {
    const write = vi.fn(async () => {
      const err = new Error("denied");
      err.name = "NotAllowedError";
      throw err;
    });
    Object.defineProperty(globalThis, "navigator", { value: { clipboard: { write } }, configurable: true });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) { this.items = items; }
    };

    const outcome = await copyImageFile(makePngFile());
    expect(outcome.status).toBe("denied");

    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  });

  it("reports failed for any other clipboard write rejection", async () => {
    const write = vi.fn(async () => { throw new Error("weird failure"); });
    Object.defineProperty(globalThis, "navigator", { value: { clipboard: { write } }, configurable: true });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) { this.items = items; }
    };

    const outcome = await copyImageFile(makePngFile());
    expect(outcome.status).toBe("failed");

    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  });
});

// ─── Save / download fallback ───────────────────────────────────────────────

describe("saveImageFile", () => {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalURL = globalThis.URL;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = globalThis;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
    globalThis.URL = originalURL;
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("creates and clicks a download anchor, then revokes the object URL", async () => {
    const clicked = vi.fn();
    const removed = vi.fn();
    const appended = vi.fn();
    const anchor = { href: "", download: "", click: clicked, remove: removed };

    (globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: appended },
    };
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    globalThis.URL = { ...originalURL, createObjectURL, revokeObjectURL } as unknown as typeof URL;

    vi.useFakeTimers();
    const outcome = await saveImageFile(makePngFile("board.png"));
    expect(outcome.status).toBe("saved");
    expect(anchor.download).toBe("board.png");
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(appended).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    vi.useRealTimers();
  });

  it("reports failed rather than throwing if DOM manipulation errors", async () => {
    (globalThis as { document?: unknown }).document = {
      createElement: () => { throw new Error("no DOM"); },
    };

    const outcome = await saveImageFile(makePngFile());
    expect(outcome.status).toBe("failed");
  });
});
