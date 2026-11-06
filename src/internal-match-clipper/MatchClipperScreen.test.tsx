// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MatchClipperScreen, { type ClipperEngine } from "./MatchClipperScreen";
import { ClipExportError, type SourceProbe } from "./clip-export";
import { MATCH_CLIPPER_STORAGE_KEY, loadClipperStore } from "./clip-storage";
import { resetExportSessionForTests } from "../internal-match-montage/MontageExportPanel";

// Montage MP4 export (Stage 3): a stand-in engine that runs until cancelled.
const montageExport = vi.hoisted(() => ({ calls: [] as { file: File; opts: { audioTrackId: number | null; signal?: AbortSignal } }[] }));
vi.mock("../internal-match-montage/montage-export", async (orig) => ({
  ...(await orig<typeof import("../internal-match-montage/montage-export")>()),
  exportMontage: vi.fn((file: File, opts: { audioTrackId: number | null; signal?: AbortSignal }) => {
    montageExport.calls.push({ file, opts });
    return new Promise((_res, rej) => opts.signal?.addEventListener("abort", () => rej(Object.assign(new Error("Export cancelled."), { code: "cancelled" }))));
  }),
}));

const OK_PROBE: SourceProbe = {
  duration: 4620, width: 854, height: 480, videoCodec: "avc", audioCodec: "aac", hasAudio: true, blocker: null,
  scan: null, readFailure: null,
  audioTracks: [], audioTrackId: null,
};

let mediaTime = 0;
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/internal/match-clipper");
  mediaTime = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:match"), revokeObjectURL: vi.fn() }));
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => mediaTime,
    set: (v: number) => {
      mediaTime = v;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 4620 });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => true });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function matchFile(name = "final.mp4", size = 451_000_000) {
  const f = new File([new Uint8Array(4)], name, { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function engine(over: Partial<ClipperEngine> = {}): ClipperEngine {
  return {
    probe: vi.fn(async () => OK_PROBE),
    exportClip: vi.fn(async (_f, range) => ({
      blob: new Blob([new Uint8Array(10)], { type: "video/mp4" }),
      duration: range.end - range.start,
      hasAudio: true,
      audioLevelDb: -20,
      audioNote: null,
      elapsedMs: 5,
    })),
    ...over,
  };
}

async function openMatch(file = matchFile()) {
  fireEvent.change(screen.getByLabelText("Match video file"), { target: { files: [file] } });
  const video = document.querySelector("video")!;
  await act(async () => {
    fireEvent.loadedMetadata(video);
  });
  return video;
}

function at(t: number, video: HTMLVideoElement) {
  mediaTime = t;
  fireEvent.timeUpdate(video);
}

function storedClips() {
  return loadClipperStore().store.projects[0]?.clips ?? [];
}

describe("Match Clipper — manual workflow", () => {
  it("marks, saves and persists a clip immediately", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    const video = await openMatch();
    at(1529, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    at(1535.04, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark End" }));
    fireEvent.click(screen.getByRole("radio", { name: "Score" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Clip" }));

    expect(screen.getByText("1. Score · 25:29")).toBeTruthy();
    expect(storedClips()).toMatchObject([{ start: 1529, end: 1535, category: "score", origin: "manual" }]);
  });

  it("rewinds 10 seconds and refuses an end before the start", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    const video = await openMatch();
    at(100, video);
    fireEvent.click(screen.getByRole("button", { name: "Rewind 10 seconds" }));
    expect(mediaTime).toBe(90);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    at(80, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark End" }));
    expect(screen.getByRole("alert").textContent).toMatch(/End must be after the start/);
    fireEvent.click(screen.getByRole("button", { name: "Save Clip" }));
    expect(storedClips()).toEqual([]);
  });

  it("nudges a marked start before saving", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    const video = await openMatch();
    at(60, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Start back half a second" }));
    at(66, video);
    fireEvent.click(screen.getByRole("button", { name: "Save Clip" }));
    expect(storedClips()).toMatchObject([{ start: 59.5, end: 66 }]);
  });
});

describe("Match Clipper — timestamp workflow", () => {
  it("adds a pasted list using the defaults and reports bad lines", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), {
      target: { value: "25:30 score Conor point\nhalf time\n1:02:03 kickout" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    expect(storedClips()).toMatchObject([
      { name: "Conor point", category: "score", start: 1529, end: 1535, origin: "timestamp" },
      { name: "Kickout · 1:02:03", category: "kickout", start: 3722, end: 3728 },
    ]);
    expect(screen.getByText(/Line 2 “half time”/)).toBeTruthy();
    expect((screen.getByLabelText(/Timestamps — one per line/) as HTMLTextAreaElement).value).toBe("half time");
  });

  it("feeds the same collection as manual clips, with custom pre-roll and length", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    const video = await openMatch();
    at(10, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    at(14, video);
    fireEvent.click(screen.getByRole("button", { name: "Save Clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText("Seconds before timestamp"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Clip length in seconds"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    expect(storedClips().map((c) => [c.origin, c.start, c.end])).toEqual([
      ["manual", 10, 14],
      ["timestamp", 597, 607],
    ]);
  });
});

describe("Match Clipper — collection", () => {
  async function withThreeClips() {
    render(<MatchClipperScreen engine={engine()} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B\n03:00 C" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
  }

  it("renames, re-categorises, adjusts, reorders and removes clips — all persisted", async () => {
    await withThreeClips();
    fireEvent.click(screen.getByRole("button", { name: /^2\. B/ }));
    fireEvent.change(screen.getByLabelText("Clip name"), { target: { value: "Big hit on 40" } });
    fireEvent.blur(screen.getByLabelText("Clip name"));
    fireEvent.change(screen.getByLabelText("Clip category"), { target: { value: "hit" } });
    fireEvent.click(screen.getByRole("button", { name: "Clip end forward half a second" }));
    fireEvent.change(screen.getByLabelText("Clip start"), { target: { value: "01:58.5" } });
    fireEvent.blur(screen.getByLabelText("Clip start"));
    expect(storedClips()[1]).toMatchObject({ name: "Big hit on 40", category: "hit", start: 118.5, end: 125.5 });

    fireEvent.click(screen.getByRole("button", { name: "Move Big hit on 40 up" }));
    expect(storedClips().map((c) => c.name)).toEqual(["Big hit on 40", "A", "C"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Tap again to remove" }));
    expect(storedClips().map((c) => c.name)).toEqual(["A", "C"]);
  });

  it("restores the list after reopening once the same video is reselected", async () => {
    await withThreeClips();
    cleanup();
    render(<MatchClipperScreen engine={engine()} />);
    expect(screen.getByText("Reselect “final.mp4” to continue")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export A/ }).hasAttribute("disabled")).toBe(true);
    await openMatch();
    expect(screen.getByText(/Restored 3 saved clips/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export A/ }).hasAttribute("disabled")).toBe(false);
  });

  it("starts a separate list for a different video and keeps the old one", async () => {
    await withThreeClips();
    await openMatch(matchFile("league.mp4", 300_000_000));
    expect(screen.getByText("Clips (0)")).toBeTruthy();
    expect(loadClipperStore().store.projects.find((p) => p.fileName === "final.mp4")?.clips).toHaveLength(3);
  });
});

describe("Match Clipper — export", () => {
  it("exports one clip and offers Share Clip / Save MP4", async () => {
    const eng = engine();
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "25:30 Goal" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export Goal" }));
    });
    expect(eng.exportClip).toHaveBeenCalledWith(expect.any(File), { start: 1529, end: 1535 }, expect.objectContaining({ allowSilentSource: false }));
    expect(await screen.findByRole("button", { name: "Share Clip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save MP4" })).toBeTruthy();
  });

  it("batch export continues past a failed clip and reports it, then offers the ZIP of finished clips", async () => {
    const eng = engine({
      exportClip: vi.fn(async (_f, range) => {
        if (range.start === 119) throw new ClipExportError("failed", "Export failed: decoder crashed");
        return { blob: new Blob([new Uint8Array(10)], { type: "video/mp4" }), duration: 6, hasAudio: true, audioLevelDb: -20, audioNote: null, elapsedMs: 1 };
      }),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B\n03:00 C" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export 3 selected as ZIP" }));
    });
    const region = await screen.findByRole("region", { name: "Export" });
    await waitFor(() => expect(within(region).getByText("2 of 3 clips ready")).toBeTruthy());
    expect(within(region).getByText(/B — failed: Export failed: decoder crashed/)).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Save ZIP (2 clips)" })).toBeTruthy();
  });

  it("cancelling a batch stops further clips and says so", async () => {
    const eng = engine({
      exportClip: vi.fn(
        (_f: Blob, _range: { start: number; end: number }, opts?: { signal?: AbortSignal }) =>
          new Promise<never>((_, reject) => {
            opts?.signal?.addEventListener("abort", () => reject(new ClipExportError("canceled", "Export cancelled.")));
          }),
      ),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export 2 selected as ZIP" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    });
    expect(await screen.findByText(/Export cancelled\. 0 of 2 clips ready/)).toBeTruthy();
    expect(eng.exportClip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Save ZIP/ })).toBeNull();
  });

  it("disables export and explains why for an unsupported video", async () => {
    const eng = engine({
      probe: vi.fn(async () => ({ ...OK_PROBE, blocker: { code: "unsupported_audio" as const, message: "This phone can't convert this video's audio (opus). Clips would be silent, so export is turned off." } })),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    await waitFor(() =>
      expect(screen.getAllByRole("alert").some((a) => /Clips would be silent, so export is turned off/.test(a.textContent ?? ""))).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    expect(screen.getByRole("button", { name: "Export A" }).hasAttribute("disabled")).toBe(true);
  });

  it("warns up front when the source has no audio and passes that explicitly to the exporter", async () => {
    const eng = engine({ probe: vi.fn(async () => ({ ...OK_PROBE, hasAudio: false, audioCodec: null })) });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    await waitFor(() => expect(screen.getByText(/has no audio track, so exported clips will have no sound/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export A" }));
    });
    expect(eng.exportClip).toHaveBeenCalledWith(expect.any(File), expect.anything(), expect.objectContaining({ allowSilentSource: true }));
  });
});

describe("Match Clipper — Android field test R1 regressions", () => {
  async function withClips(eng: ClipperEngine, list = "01:00 A\n02:00 B\n03:00 C") {
    render(<MatchClipperScreen engine={eng} />);
    const video = await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: list } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    return video;
  }

  it("+10s moves forward, works while playing, and clamps to the end of the video", async () => {
    render(<MatchClipperScreen engine={engine()} />);
    const video = await openMatch();
    at(100, video);
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(mediaTime).toBe(110);
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(mediaTime).toBe(120);
    at(4615, video);
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(mediaTime).toBe(4620);
    fireEvent.click(screen.getByRole("button", { name: "Rewind 10 seconds" }));
    expect(mediaTime).toBe(4610);
  });

  it("when the phone stops reading the video mid-batch: names the cause, stops the batch, offers Reselect, and leaves saved clips untouched", async () => {
    const readError = new ClipExportError(
      "file_unreadable",
      "The phone stopped letting PáircVision read the match video (NotReadableError at 0 KB). Your clips are safe — reselect the video and export again.",
      { stage: "tracks", detail: "NotReadableError: The requested file could not be read [bytes 0-16, retried]" },
    );
    const eng = engine({ exportClip: vi.fn(async () => Promise.reject(readError)) });
    await withClips(eng);
    const before = window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export 3 selected as ZIP" }));
    });
    const region = await screen.findByRole("region", { name: "Export" });
    await waitFor(() => expect(within(region).getByText("0 of 3 clips ready")).toBeTruthy());
    expect(eng.exportClip).toHaveBeenCalledTimes(1); // B and C aren't attempted against an unreadable file
    expect(within(region).getByText(/A — failed: The phone stopped letting PáircVision read the match video \(NotReadableError/)).toBeTruthy();
    expect(within(region).getByText(/file_unreadable at tracks · NotReadableError/)).toBeTruthy();
    expect(within(region).getAllByText(/not exported — reselect the video first/)).toHaveLength(2);
    expect(within(region).getByRole("button", { name: "Reselect video" })).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Copy diagnostics" })).toBeTruthy();
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe(before);
    expect(screen.getByTestId("diagnostics-report").textContent).toMatch(/file_unreadable at tracks[\s\S]*raw: NotReadableError/);
  });

  it("reselecting the same video keeps the clips, selection and playback position", async () => {
    const video = await withClips(engine());
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    at(1529, video);
    await openMatch();
    expect(screen.getByText(/Video reselected — your clips and position are kept/)).toBeTruthy();
    expect(mediaTime).toBe(1529);
    expect(screen.getByText("Clips (3)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export 3 selected as ZIP" })).toBeTruthy();
  });

  it("turns export off if playback decodes audio that the export check said wasn't there", async () => {
    const eng = engine({ probe: vi.fn(async () => ({ ...OK_PROBE, hasAudio: false, audioCodec: null })) });
    const video = await withClips(eng, "01:00 A");
    await waitFor(() => expect(screen.getByRole("button", { name: "Export A" }).hasAttribute("disabled")).toBe(false));
    Object.defineProperty(video, "webkitAudioDecodedByteCount", { configurable: true, get: () => 4096 });
    at(5, video);
    expect(screen.getByRole("button", { name: "Export A" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("diagnostics-report").textContent).toMatch(/audioDecodedBytes=4096/);
  });

  it("copies a diagnostics report with the file check and structure scan", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const eng = engine({
      probe: vi.fn(async () => ({
        ...OK_PROBE,
        scan: {
          brands: ["isom"], topLevel: [{ type: "moov", offset: 0, size: 10 }], moov: { offset: 0, size: 10 }, fragmented: false, error: null,
          tracks: [{ id: 1, handler: "vide", sampleEntry: "avc1", objectType: null, channels: null, sampleRate: null, sampleCount: 10, timescale: 1, durationSeconds: 10, enabled: true }],
        },
      })),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    await waitFor(() => expect(screen.getByTestId("diagnostics-report").textContent).toMatch(/track 1: vide avc1/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("final.mp4 — 451000000 bytes"));
    expect(screen.getByText(/Diagnostics copied/)).toBeTruthy();
  });
});

describe("Match Clipper — R2 direct sharing", () => {
  const exportedBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  let share: ReturnType<typeof vi.fn>;
  let canShare: ReturnType<typeof vi.fn>;
  let anchorClicks: string[];

  function setShareApi(api: { share?: unknown; canShare?: unknown } | null) {
    for (const key of ["share", "canShare"] as const) {
      Object.defineProperty(navigator, key, { configurable: true, writable: true, value: api ? api[key] : undefined });
    }
  }

  beforeEach(() => {
    share = vi.fn(async () => undefined);
    canShare = vi.fn((data?: ShareData) => !!data?.files?.length);
    setShareApi({ share, canShare });
    anchorClicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchorClicks.push(this.download);
    });
  });
  afterEach(() => {
    setShareApi(null);
    vi.restoreAllMocks();
  });

  async function exportOne(eng = engine({
    exportClip: vi.fn(async () => ({ blob: new Blob([exportedBytes], { type: "video/mp4" }), duration: 6, hasAudio: true, audioLevelDb: -20, audioNote: null, elapsedMs: 5 })),
  })) {
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "25:30 score Conor point" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export Conor point" }));
    });
    await screen.findByRole("button", { name: "Share Clip" });
    return eng;
  }

  it("Share Clip hands the actual exported MP4 to the share sheet — file only, no URL or text", async () => {
    await exportOne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
    });
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]![0] as ShareData;
    expect(Object.keys(data)).toEqual(["files"]);
    const file = data.files![0]!;
    expect(file.name).toBe("01 Conor point.mp4");
    expect(file.type).toBe("video/mp4");
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(file);
    });
    expect(new Uint8Array(bytes)).toEqual(exportedBytes);
    expect(screen.getByText("Clip handed to the app you chose.")).toBeTruthy();
    expect(anchorClicks).toEqual([]); // sharing never downloads
  });

  it("sharing again reuses the same MP4 — no re-export", async () => {
    const eng = await exportOne();
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
      });
    }
    expect(eng.exportClip).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(3);
    const files = share.mock.calls.map((c) => (c[0] as ShareData).files![0]);
    expect(files[1]).toBe(files[0]);
    expect(files[2]).toBe(files[0]);
  });

  it("closing the share sheet is a cancel: no download, clip still ready", async () => {
    share.mockRejectedValueOnce(new DOMException("Share canceled", "AbortError"));
    await exportOne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
    });
    expect(screen.getByText(/Share cancelled\. The clip is still ready/)).toBeTruthy();
    expect(anchorClicks).toEqual([]);
    expect(screen.getByRole("button", { name: "Share Clip" }).hasAttribute("disabled")).toBe(false);
  });

  it("a refused share says why and offers Save MP4, without downloading by itself", async () => {
    share.mockRejectedValueOnce(new DOMException("Must be handling a user gesture to show a permission request.", "NotAllowedError"));
    await exportOne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
    });
    expect(screen.getByText(/Android didn't allow the share \(NotAllowedError\)/)).toBeTruthy();
    expect(anchorClicks).toEqual([]);
  });

  it("ignores a second tap while the share sheet is still open", async () => {
    let resolve: () => void = () => undefined;
    share.mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
    await exportOne();
    fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Share Clip" }));
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });

  it("without file sharing, Share Clip is off with a clear fallback, and Save MP4 still works", async () => {
    setShareApi({ share: undefined, canShare: undefined });
    await exportOne();
    expect(screen.getByRole("button", { name: "Share Clip" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/can't share files directly\. Tap Save MP4/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save MP4" }));
    expect(anchorClicks).toHaveLength(1);
    expect(anchorClicks[0]).toMatch(/^01 Conor point-\d+\.mp4$/);
    expect(screen.getByText(/MP4 saved/)).toBeTruthy();
  });

  it("a browser that shares links but not files gets the same fallback", async () => {
    canShare.mockImplementation((data?: ShareData) => !data?.files);
    await exportOne();
    expect(screen.getByRole("button", { name: "Share Clip" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/can't share this video file directly/)).toBeTruthy();
  });

  it("closing the panel releases the exported clip", async () => {
    await exportOne();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("button", { name: "Share Clip" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Export" })).toBeNull();
  });
});

describe("Match Clipper — R3 commentary audio", () => {
  const track = (id: number, index: number, levelDb: number, isDefault: boolean) => ({
    id, index, codec: "aac", channels: 2, sampleRate: 48000, language: "und", name: null, isDefault, levelDb,
  });

  it("with several audio tracks: shows the levels, preselects the one with sound, and exports with the chosen track", async () => {
    const eng = engine({
      probe: vi.fn(async () => ({ ...OK_PROBE, audioTracks: [track(2, 1, -120, true), track(3, 2, -19, false)], audioTrackId: 3 })),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    const group = await screen.findByRole("radiogroup", { name: "Clip audio" });
    const silent = within(group).getByRole("radio", { name: /Track 1 · stereo · silent/ });
    const commentary = within(group).getByRole("radio", { name: /Track 2 · stereo · sound -19 dB/ });
    expect(commentary.getAttribute("aria-checked")).toBe("true");
    expect(silent.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export A" }));
    });
    expect(eng.exportClip).toHaveBeenLastCalledWith(expect.any(File), expect.anything(), expect.objectContaining({ audioTrackId: 3 }));
    expect(await screen.findByText(/A — .*sound -20 dB/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(silent);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export A" }));
    });
    expect(eng.exportClip).toHaveBeenLastCalledWith(expect.any(File), expect.anything(), expect.objectContaining({ audioTrackId: 2 }));
    expect(screen.getByTestId("diagnostics-report").textContent).toMatch(/audio track 2 \(id 3\): aac 2ch 48000Hz .*level=-19\.0 dB/);
  });

  it("a natural pause exports successfully and shows the note instead of failing", async () => {
    const note = "Audio track 1 is quiet in this clip; audio track 2 has sound here (-40 dB). Choose it under \"Clip audio\" if you want that sound.";
    const eng = engine({
      exportClip: vi.fn(async () => ({ blob: new Blob([new Uint8Array(10)], { type: "video/mp4" }), duration: 3, hasAudio: true, audioLevelDb: -120, audioNote: note, elapsedMs: 1 })),
    });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "00:09 Pause" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export Pause" }));
    });
    const region = await screen.findByRole("region", { name: "Export" });
    expect(within(region).getByText("1 of 1 clip ready")).toBeTruthy();
    expect(within(region).getByText(/quiet moment/)).toBeTruthy();
    expect(within(region).getByText(/audio track 2 has sound here/)).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Share Clip" })).toBeTruthy();
  });

  it("a single audio track shows no chooser; a match silent at every check point gets a warning", async () => {
    const eng = engine({ probe: vi.fn(async () => ({ ...OK_PROBE, audioTracks: [track(2, 1, -120, true)], audioTrackId: 2 })) });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /silent at all three points checked/.test(a.textContent ?? ""))).toBe(true));
    expect(screen.queryByRole("radiogroup", { name: "Clip audio" })).toBeNull();
  });
});

describe("Match Clipper — final review regressions", () => {
  it("a slow file check for a previously picked video never overrides the current video's check", async () => {
    let resolveA: (p: SourceProbe) => void = () => undefined;
    const probe = vi.fn((f: Blob) =>
      (f as File).name === "first.mp4"
        ? new Promise<SourceProbe>((r) => (resolveA = r))
        : Promise.resolve({ ...OK_PROBE, audioTracks: [], audioTrackId: 7 }),
    );
    const eng = engine({ probe });
    render(<MatchClipperScreen engine={eng} />);
    fireEvent.change(screen.getByLabelText("Match video file"), { target: { files: [matchFile("first.mp4", 100)] } });
    const video = await openMatch(matchFile("second.mp4", 200));
    await act(async () =>
      resolveA({ ...OK_PROBE, audioTrackId: 3, blocker: { code: "unsupported_video", message: "BLOCKER FROM FIRST VIDEO" } }),
    );
    expect(screen.queryByText("BLOCKER FROM FIRST VIDEO")).toBeNull();
    at(1, video);
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "00:10 A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export A" }));
    });
    // Exported with the second video's own audio-track choice, not the first video's.
    expect(eng.exportClip).toHaveBeenCalledWith(expect.any(File), expect.anything(), expect.objectContaining({ audioTrackId: 7 }));
  });
});

describe("Match Clipper — Add to Montage (Montage V2)", () => {
  const MONTAGE_KEY = "paircvision_internal_match_montage_v1";
  async function withThree() {
    render(<MatchClipperScreen engine={engine()} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B\n03:00 C" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
  }
  const montages = () => JSON.parse(window.localStorage.getItem(MONTAGE_KEY) ?? '{"projects":[]}').projects as {
    name: string; sourceKey: string; items: { clipId: string; name: string; start: number; end: number }[];
  }[];

  it("adds one saved clip to a new named montage as a copy; V1 data is not written", async () => {
    await withThree();
    const v1Before = window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Add B to montage" }));
    const sheet = screen.getByRole("dialog", { name: "Add to montage" });
    fireEvent.change(within(sheet).getByLabelText("New montage name"), { target: { value: "Defensive shape" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Create montage and add" }));
    expect(montages()).toMatchObject([{ name: "Defensive shape", sourceKey: "final.mp4::451000000", items: [{ name: "B", start: 119, end: 125 }] }]);
    expect(screen.getByText("Added 1 clip to “Defensive shape”.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open in Montage" })).toBeTruthy();
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe(v1Before);
  });

  it("adds the selected clips to an existing montage for the same video, skipping ones already in it", async () => {
    await withThree();
    fireEvent.click(screen.getByRole("button", { name: "Add A to montage" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add to montage" })).getByRole("button", { name: "Create montage and add" }));
    const v1Before = window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 selected to montage" }));
    const sheet = screen.getByRole("dialog", { name: "Add to montage" });
    expect(within(sheet).getByText(/1 clip · 6s/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Add to Montage / }));
    expect(montages()).toHaveLength(1);
    expect(montages()[0]!.items.map((i) => i.name)).toEqual(["A", "B", "C"]);
    expect(screen.getByText(/Added 2 clips to .* \(1 already in it\)/)).toBeTruthy();
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe(v1Before);
  });

  it("only offers montages made from the same match video", async () => {
    window.localStorage.setItem(MONTAGE_KEY, JSON.stringify({ version: 1, projects: [
      { id: "m-other", name: "Other match", sourceKey: "league.mp4::1", sourceName: "league.mp4", sourceSize: 1, sourceDuration: null, items: [], createdAt: 1, updatedAt: 1 },
    ] }));
    await withThree();
    fireEvent.click(screen.getByRole("button", { name: "Add A to montage" }));
    const sheet = screen.getByRole("dialog", { name: "Add to montage" });
    expect(within(sheet).queryByRole("button", { name: "Add to Other match" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Add to montage" })).toBeNull();
  });
});

describe("Match Clipper | Montage modes (Montage V2)", () => {
  const MONTAGE_KEY = "paircvision_internal_match_montage_v1";
  async function withThree() {
    const eng = engine();
    render(<MatchClipperScreen engine={eng} />);
    const video = await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B\n03:00 C" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    return { eng, video };
  }
  const tab = (name: string) => screen.getByRole("tab", { name });

  it("starts in Clip mode with a two-mode switch; Montage loads only when chosen", () => {
    render(<MatchClipperScreen engine={engine()} />);
    expect(tab("Match Clipper").getAttribute("aria-selected")).toBe("true");
    expect(tab("Montage").getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByText("My Montages")).toBeNull();
    expect(screen.queryByRole("button", { name: "My Montages" })).toBeNull(); // no separate tool or page
  });

  it("switches modes without reopening the video; Clip mode keeps its clips, marks and position", async () => {
    const { video } = await withThree();
    at(42, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    const createUrl = vi.mocked(URL.createObjectURL);
    const urlsBefore = createUrl.mock.calls.length;
    fireEvent.click(tab("Montage"));
    expect(window.location.search).toBe("?mode=montage");
    expect(video.pause).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "My Montages" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save Clip" })).toBeNull(); // Clip mode hidden, not removed
    fireEvent.click(tab("Match Clipper"));
    expect(window.location.search).toBe("");
    expect(document.querySelector("video")).toBe(video); // same element, same source
    expect(screen.getByRole("button", { name: "Save Clip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start 00:42/ })).toBeTruthy();
    expect(createUrl.mock.calls.length).toBe(urlsBefore); // the match video was never reloaded
  });

  it("Save Clip → Add to Montage → Open in Montage previews from the same open video", async () => {
    await withThree();
    fireEvent.click(screen.getByRole("button", { name: "Add B to montage" }));
    const sheet = screen.getByRole("dialog", { name: "Add to montage" });
    fireEvent.change(within(sheet).getByLabelText("New montage name"), { target: { value: "Kickouts" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Create montage and add" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in Montage" }));
    expect(window.location.search).toMatch(/^\?mode=montage&montage=montage/);
    expect((await screen.findByTestId("montage-totals")).textContent).toBe("1 clip · 0:06 total");
    expect(screen.queryByLabelText("Select match video")).toBeNull(); // no reselecting
    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    expect(videos[1]!.getAttribute("src")).toBe("blob:match");
  });

  it("New Montage in Montage mode uses the open match and its saved clips; V1 clips unchanged", async () => {
    await withThree();
    const v1Before = window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY);
    fireEvent.click(tab("Montage"));
    fireEvent.click(await screen.findByRole("button", { name: "New Montage" }));
    fireEvent.change(screen.getByLabelText("New montage name"), { target: { value: "Attack" } });
    fireEvent.click(screen.getByRole("button", { name: "Create montage" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ Add clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose all" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Move C up" }));
    const stored = JSON.parse(window.localStorage.getItem(MONTAGE_KEY)!).projects;
    expect(stored).toMatchObject([{ name: "Attack", sourceKey: "final.mp4::451000000" }]);
    expect(stored[0].items.map((i: { name: string }) => i.name)).toEqual(["A", "C", "B"]);
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe(v1Before);
    fireEvent.click(tab("Match Clipper"));
    expect(screen.getAllByRole("button", { name: /^Export [ABC]$/ }).map((b) => b.textContent)).toHaveLength(3);
  });

  it("a confirmed montage trim survives Montage → Match Clipper → Montage and a reload; the V1 clip keeps its times", async () => {
    await withThree();
    const v1Clips = () => JSON.stringify(loadClipperStore().store.projects[0]!.clips.map((c) => [c.name, c.start, c.end]));
    const v1Before = v1Clips();
    fireEvent.click(screen.getByRole("button", { name: "Add B to montage" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add to montage" })).getByRole("button", { name: "Create montage and add" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in Montage" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trim B" }));
    fireEvent.change(screen.getByLabelText("Montage clip end"), { target: { value: "02:15.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Trim" }));
    const item = () => JSON.parse(window.localStorage.getItem(MONTAGE_KEY)!).projects[0].items[0];
    expect(item()).toMatchObject({ start: 119, end: 135 });
    fireEvent.click(tab("Match Clipper"));
    fireEvent.click(tab("Montage"));
    expect(screen.getByText(/01:59.0–02:15.0 \(16.0s\)/)).toBeTruthy();
    expect(screen.getByTestId("montage-totals").textContent).toBe("1 clip · 0:16 total");
    expect(v1Clips()).toBe(v1Before); // B is still 01:59–02:05 in Match Clipper
    const url = window.location.pathname + window.location.search;
    cleanup(); // reload
    window.history.replaceState(null, "", url);
    render(<MatchClipperScreen engine={engine()} />);
    expect(await screen.findByText(/01:59.0–02:15.0 \(16.0s\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile()] } });
    expect(screen.getByText(/01:59.0–02:15.0 \(16.0s\)/)).toBeTruthy();
    expect(item()).toMatchObject({ start: 119, end: 135 });
    expect(v1Clips()).toBe(v1Before);
  });

  it("Back and reload restore the mode and open montage from the URL", async () => {
    window.localStorage.setItem(MONTAGE_KEY, JSON.stringify({ version: 1, projects: [
      { id: "m1", name: "Defence", sourceKey: "final.mp4::451000000", sourceName: "final.mp4", sourceSize: 451000000, sourceDuration: null,
        items: [{ id: "i1", clipId: "x", name: "Turnover", category: "score", start: 10, end: 16, addedAt: 1 }], createdAt: 1, updatedAt: 1 },
    ] }));
    window.history.replaceState(null, "", "/internal/match-clipper?mode=montage&montage=m1");
    render(<MatchClipperScreen engine={engine()} />);
    expect(tab("Montage").getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByTestId("montage-totals")).textContent).toBe("1 clip · 0:06 total");
    // No video open after a reload: choose it once, here, and Match Clipper gets it too.
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile()] } });
    expect(document.querySelectorAll("video")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "← My Montages" }));
    expect(window.location.search).toBe("?mode=montage");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(await screen.findByTestId("montage-totals")).toBeTruthy();
    fireEvent.click(tab("Match Clipper"));
    expect(screen.getByRole("button", { name: "Save Clip" })).toBeTruthy(); // the video chosen in Montage is open here
  });
});

describe("Match Clipper | Montage — Create MP4 (Montage V2 Stage 3)", () => {
  beforeEach(() => {
    resetExportSessionForTests();
    montageExport.calls.length = 0;
  });

  it("creates the MP4 from the video already open, with the commentary track chosen in Clip mode; clip exports wait meanwhile", async () => {
    const eng = engine({ probe: vi.fn(async () => ({ ...OK_PROBE, audioTrackId: 7 })) });
    render(<MatchClipperScreen engine={eng} />);
    await openMatch();
    fireEvent.click(screen.getByRole("button", { name: "Add timestamps" }));
    fireEvent.change(screen.getByLabelText(/Timestamps — one per line/), { target: { value: "01:00 A\n02:00 B" } });
    fireEvent.click(screen.getByRole("button", { name: "Add clips" }));
    fireEvent.click(screen.getByRole("button", { name: "Add A to montage" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add to montage" })).getByRole("button", { name: "Create montage and add" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in Montage" }));
    const create = await screen.findByRole("button", { name: "Create MP4" });
    await act(async () => {
      fireEvent.click(create);
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(montageExport.calls).toHaveLength(1));
    expect(montageExport.calls[0]!.file.name).toBe("final.mp4");
    expect(montageExport.calls[0]!.opts.audioTrackId).toBe(7);
    expect(await screen.findByTestId("export-progress")).toBeTruthy();
    // One encoder at a time: Clip mode says so and its exports are disabled.
    fireEvent.click(screen.getByRole("tab", { name: "Match Clipper" }));
    expect(screen.getByText(/A montage MP4 is being created in Montage mode/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export A" }).hasAttribute("disabled")).toBe(true);
    // Switching back: still running; cancel releases Clip mode.
    fireEvent.click(screen.getByRole("tab", { name: "Montage" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    });
    expect(await screen.findByText(/Export cancelled\. Nothing was kept\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Match Clipper" }));
    expect(screen.getByRole("button", { name: "Export A" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(/A montage MP4 is being created/)).toBeNull();
  });
});

describe("Match Clipper — storage safety", () => {
  it("leaves an unreadable saved list untouched and says so", async () => {
    window.localStorage.setItem(MATCH_CLIPPER_STORAGE_KEY, "{broken");
    render(<MatchClipperScreen engine={engine()} />);
    expect(screen.getByText(/couldn't be read/)).toBeTruthy();
    const video = await openMatch();
    at(5, video);
    fireEvent.click(screen.getByRole("button", { name: "Mark Start" }));
    at(10, video);
    fireEvent.click(screen.getByRole("button", { name: "Save Clip" }));
    expect(window.localStorage.getItem(MATCH_CLIPPER_STORAGE_KEY)).toBe("{broken");
  });
});
