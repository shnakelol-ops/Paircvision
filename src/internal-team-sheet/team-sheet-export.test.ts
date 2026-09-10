/**
 * team-sheet-export.test.ts
 *
 * Covers the internal Team Sheet's html2canvas-based capture. vitest runs
 * in plain Node (no jsdom — see imageShare.test.ts's header comment), so
 * html2canvas is mocked entirely (it needs a real browser DOM to do
 * anything meaningful anyway) and the pure scaling/Blob-fallback logic is
 * tested directly against minimal structural stand-ins rather than real
 * DOM/canvas elements.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { canvasToPngBlob, captureTeamSheetBlob, computeScale } from "./team-sheet-export";
import type { PngExportableCanvas } from "./team-sheet-export";

// ─── computeScale: 1080-width scaling + variable-height behaviour ─────────

describe("computeScale", () => {
  it("scales to exactly 1080 / offsetWidth for a typical phone-width root", () => {
    expect(computeScale({ offsetWidth: 380, scrollHeight: 700 })).toBeCloseTo(1080 / 380, 10);
    expect(computeScale({ offsetWidth: 412, scrollHeight: 900 })).toBeCloseTo(1080 / 412, 10);
  });

  it("is independent of height for any realistic substitutes-list height (no forced aspect ratio)", () => {
    const short = computeScale({ offsetWidth: 380, scrollHeight: 700 });
    const tall = computeScale({ offsetWidth: 380, scrollHeight: 2200 }); // ~10 extra sub rows
    expect(short).toBeCloseTo(tall, 10);
  });

  it("clamps scale downward only once the pixel budget is actually at risk (mobile memory safety net)", () => {
    const normalScale = computeScale({ offsetWidth: 380, scrollHeight: 900 });
    const pathologicalScale = computeScale({ offsetWidth: 380, scrollHeight: 500_000 });
    expect(pathologicalScale).toBeLessThan(normalScale);
    // Never exceeds the 20MP output budget even after clamping.
    const clampedHeight = 500_000 * pathologicalScale;
    const clampedWidth = 380 * pathologicalScale;
    expect(clampedWidth * clampedHeight).toBeLessThanOrEqual(20_000_000 + 1);
  });

  it("throws rather than producing a zero/negative-size capture", () => {
    expect(() => computeScale({ offsetWidth: 0, scrollHeight: 700 })).toThrow();
    expect(() => computeScale({ offsetWidth: 380, scrollHeight: 0 })).toThrow();
  });
});

// ─── canvasToPngBlob: primary toBlob path + toDataURL fallback + failure ──

function makeCanvas(overrides: Partial<PngExportableCanvas>): PngExportableCanvas {
  return {
    toBlob: (cb) => cb(new Blob(["pixels"], { type: "image/png" })),
    toDataURL: () => "data:image/png;base64,AAAA",
    ...overrides,
  };
}

describe("canvasToPngBlob", () => {
  it("resolves the Blob from the primary toBlob() path", async () => {
    const canvas = makeCanvas({});
    const blob = await canvasToPngBlob(canvas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("falls back to toDataURL() when toBlob() resolves null (documented Android Chrome resilience path)", async () => {
    const canvas = makeCanvas({
      toBlob: (cb) => cb(null),
      toDataURL: () => "data:image/png;base64,aGVsbG8=", // "hello"
    });
    const blob = await canvasToPngBlob(canvas);
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    expect(text).toBe("hello");
  });

  it("rejects with a clear error when both toBlob() and toDataURL() fail — this is the Blob failure-handling path", async () => {
    const canvas = makeCanvas({
      toBlob: (cb) => cb(null),
      toDataURL: () => "data:,", // browser's empty-canvas sentinel
    });
    await expect(canvasToPngBlob(canvas)).rejects.toThrow("Could not generate the Team Sheet image");
  });
});

// ─── captureTeamSheetBlob: capture root + html2canvas option correctness ──

function makeFakeRoot(overrides: Partial<{ offsetWidth: number; scrollWidth: number; scrollHeight: number; images: HTMLImageElement[] }> = {}) {
  const images = overrides.images ?? [];
  return {
    offsetWidth: overrides.offsetWidth ?? 380,
    scrollWidth: overrides.scrollWidth ?? 380,
    scrollHeight: overrides.scrollHeight ?? 900,
    querySelectorAll: (selector: string) => (selector === "img" ? images : []),
  } as unknown as HTMLElement;
}

describe("captureTeamSheetBlob", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    };
    html2canvasMock.mockReset();
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("captures the given root (not some other element) with the 1080-width scale and background matching the Team Sheet shell", async () => {
    const root = makeFakeRoot({ offsetWidth: 380, scrollWidth: 380, scrollHeight: 900 });
    html2canvasMock.mockResolvedValue(makeCanvas({}));

    await captureTeamSheetBlob(root);

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    const [capturedRoot, options] = html2canvasMock.mock.calls[0];
    expect(capturedRoot).toBe(root);
    expect(options.backgroundColor).toBe("#050c14");
    expect(options.scale).toBeCloseTo(1080 / 380, 10);
    expect(options.width).toBe(380);
    expect(options.height).toBe(900);
    expect(options.windowWidth).toBe(380);
    expect(options.windowHeight).toBe(900);
    expect(typeof options.onclone).toBe("function");
  });

  it("captures the full natural content height, not a fixed/forced size — height grows with substitutes", async () => {
    html2canvasMock.mockResolvedValue(makeCanvas({}));

    await captureTeamSheetBlob(makeFakeRoot({ scrollHeight: 700 })); // no subs
    const noSubsOptions = html2canvasMock.mock.calls[0][1];

    html2canvasMock.mockClear();
    await captureTeamSheetBlob(makeFakeRoot({ scrollHeight: 2200 })); // populated subs
    const populatedSubsOptions = html2canvasMock.mock.calls[0][1];

    expect(populatedSubsOptions.height).toBeGreaterThan(noSubsOptions.height);
    expect(populatedSubsOptions.height).toBe(2200);
    expect(noSubsOptions.height).toBe(700);
  });

  it("the onclone hook swaps the jersey drop-shadow filter for an equivalent boxShadow on the clone only, without touching the live DOM", async () => {
    html2canvasMock.mockResolvedValue(makeCanvas({}));
    await captureTeamSheetBlob(makeFakeRoot({}));

    const options = html2canvasMock.mock.calls[0][1];
    const fakeShadowEl = { style: { filter: "drop-shadow(0 0 2px black)", boxShadow: "" } };
    const fakeClonedDoc = {
      querySelectorAll: (selector: string) =>
        selector === ".ts-jersey-shadow" ? [fakeShadowEl] : [],
    };

    options.onclone(fakeClonedDoc);

    expect(fakeShadowEl.style.filter).toBe("none");
    expect(fakeShadowEl.style.boxShadow).toContain("rgba(4, 8, 14");
  });

  it("propagates a clear failure when html2canvas itself rejects (e.g. rendering error)", async () => {
    html2canvasMock.mockRejectedValue(new Error("html2canvas: rendering failed"));
    await expect(captureTeamSheetBlob(makeFakeRoot({}))).rejects.toThrow();
  });

  it("propagates the Blob-failure error when the resolved canvas can't produce image bytes", async () => {
    html2canvasMock.mockResolvedValue(
      makeCanvas({ toBlob: (cb) => cb(null), toDataURL: () => "data:," }),
    );
    await expect(captureTeamSheetBlob(makeFakeRoot({}))).rejects.toThrow(
      "Could not generate the Team Sheet image",
    );
  });
});
