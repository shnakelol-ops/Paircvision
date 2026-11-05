// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MatchClipperScreen, { type ClipperEngine } from "./MatchClipperScreen";
import { ClipExportError, type SourceProbe } from "./clip-export";
import { MATCH_CLIPPER_STORAGE_KEY, loadClipperStore } from "./clip-storage";

const OK_PROBE: SourceProbe = {
  duration: 4620, width: 854, height: 480, videoCodec: "avc", audioCodec: "aac", hasAudio: true, blocker: null,
};

let mediaTime = 0;
beforeEach(() => {
  window.localStorage.clear();
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
  it("exports one clip and offers Share / Save", async () => {
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
    expect(await screen.findByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save to device" })).toBeTruthy();
  });

  it("batch export continues past a failed clip and reports it, then offers the ZIP of finished clips", async () => {
    const eng = engine({
      exportClip: vi.fn(async (_f, range) => {
        if (range.start === 119) throw new ClipExportError("failed", "Export failed: decoder crashed");
        return { blob: new Blob([new Uint8Array(10)], { type: "video/mp4" }), duration: 6, hasAudio: true, elapsedMs: 1 };
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
    await waitFor(() => expect(screen.getByText(/Clips would be silent, so export is turned off/)).toBeTruthy());
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
