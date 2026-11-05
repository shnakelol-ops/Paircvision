import { describe, expect, it, vi } from "vitest";
import { makeClipFile, shareClipFile, shareOutcomeMessage, shareSupport } from "./clip-share";

const mp4 = () => new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: "video/mp4" });

function nav(over: { share?: unknown; canShare?: unknown } = {}) {
  return {
    share: vi.fn(async () => undefined),
    canShare: vi.fn(() => true),
    ...over,
  } as unknown as Navigator & { share: ReturnType<typeof vi.fn>; canShare: ReturnType<typeof vi.fn> };
}

describe("makeClipFile", () => {
  it("wraps the exported MP4 as a named video/mp4 File without changing its bytes", async () => {
    const blob = mp4();
    const file = makeClipFile(blob, "01 Score - 25-29.mp4");
    expect(file.name).toBe("01 Score - 25-29.mp4");
    expect(file.type).toBe("video/mp4");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()));
  });
});

describe("shareClipFile", () => {
  it("opens the share sheet with the MP4 file only — no URL, no text", async () => {
    const n = nav();
    const file = makeClipFile(mp4(), "clip.mp4");
    expect(await shareClipFile(file, n)).toEqual({ status: "shared" });
    expect(n.canShare).toHaveBeenCalledWith({ files: [file] });
    expect(n.share).toHaveBeenCalledTimes(1);
    expect(n.share).toHaveBeenCalledWith({ files: [file] });
    const data = n.share.mock.calls[0]![0] as ShareData;
    expect(data.url).toBeUndefined();
    expect(data.text).toBeUndefined();
  });

  it("calls navigator.share synchronously, so the tap still counts as a user gesture", () => {
    const n = nav();
    void shareClipFile(makeClipFile(mp4(), "clip.mp4"), n);
    expect(n.share).toHaveBeenCalledTimes(1); // before any await resolves
  });

  it("reports a browser without the Web Share API", async () => {
    const n = nav({ share: undefined });
    expect(await shareClipFile(makeClipFile(mp4(), "c.mp4"), n)).toEqual({ status: "unsupported", reason: "no_share_api" });
  });

  it("reports a browser that can share but not files (or not this file)", async () => {
    const n = nav({ canShare: vi.fn(() => false) });
    expect(await shareClipFile(makeClipFile(mp4(), "c.mp4"), n)).toEqual({ status: "unsupported", reason: "files_not_shareable" });
    expect(n.share).not.toHaveBeenCalled();
    const noCanShare = nav({ canShare: undefined });
    expect(shareSupport(makeClipFile(mp4(), "c.mp4"), noCanShare)).toEqual({ ok: false, reason: "files_not_shareable" });
    const throwing = nav({ canShare: vi.fn(() => { throw new TypeError("bad"); }) });
    expect(shareSupport(makeClipFile(mp4(), "c.mp4"), throwing)).toEqual({ ok: false, reason: "files_not_shareable" });
  });

  it("treats closing the share sheet as a cancel, not a failure", async () => {
    const n = nav({ share: vi.fn(async () => Promise.reject(new DOMException("Share canceled", "AbortError"))) });
    expect(await shareClipFile(makeClipFile(mp4(), "c.mp4"), n)).toEqual({ status: "cancelled" });
  });

  it("reports a refused or failed share with the browser's error", async () => {
    const refused = nav({ share: vi.fn(async () => Promise.reject(new DOMException("Must be handling a user gesture", "NotAllowedError"))) });
    expect(await shareClipFile(makeClipFile(mp4(), "c.mp4"), refused)).toEqual({
      status: "failed", name: "NotAllowedError", message: "Must be handling a user gesture",
    });
    const broken = nav({ share: vi.fn(async () => Promise.reject(new DOMException("Permission denied", "DataError"))) });
    expect(await shareClipFile(makeClipFile(mp4(), "c.mp4"), broken)).toMatchObject({ status: "failed", name: "DataError" });
  });

  it("explains each outcome in plain words", () => {
    expect(shareOutcomeMessage({ status: "cancelled" })).toMatch(/still ready/);
    expect(shareOutcomeMessage({ status: "unsupported", reason: "no_share_api" })).toMatch(/Save MP4/);
    expect(shareOutcomeMessage({ status: "failed", name: "NotAllowedError", message: "" })).toMatch(/Tap Share Clip again/);
    expect(shareOutcomeMessage({ status: "failed", name: "DataError", message: "x" })).toMatch(/DataError: x/);
  });
});
