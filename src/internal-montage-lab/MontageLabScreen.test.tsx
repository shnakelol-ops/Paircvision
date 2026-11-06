// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MontageLabScreen, { type LabDeps } from "./MontageLabScreen";
import type { MontageRunResult } from "./lab-montage";
import { StrictMode } from "react";
import { LAB_STORAGE_KEY, resetPageLoadForTests, startRun } from "./lab-session";
import type { SourceProbe } from "../internal-match-clipper/clip-export";

const V1_KEY = "paircvision_internal_match_clipper_v1";
const V1_STORE = JSON.stringify({
  version: 1,
  lastProjectKey: "final.mp4::451000000",
  projects: [{
    key: "final.mp4::451000000", fileName: "final.mp4", fileSize: 451000000, duration: 4662, updatedAt: 1,
    clips: [
      { id: "a", name: "Point", category: "score", start: 100, end: 106, origin: "manual", createdAt: 1 },
      { id: "b", name: "Kickout", category: "kickout", start: 200, end: 208, origin: "manual", createdAt: 2 },
    ],
  }],
});

const PROBE: SourceProbe = {
  duration: 4662, width: 1920, height: 1080, videoCodec: "avc", audioCodec: "aac", hasAudio: true, blocker: null,
  scan: null, readFailure: null, audioTracks: [], audioTrackId: 2,
};

function okResult(over: Partial<MontageRunResult> = {}): MontageRunResult {
  return {
    ok: true, cancelled: false, error: null, errorName: null, output: "opfs", outputName: "montage-1.mp4",
    file: new File([new Uint8Array(16)], "montage-1.mp4"), bytes: 230e6, estimateBytes: 234e6, montageSeconds: 300,
    elapsedMs: 120000, realtimeFactor: 2.5, width: 1920, height: 1080, downscaled: false, seekWasteSeconds: 8,
    droppedFrames: 0, usageBefore: 0, usageAfter: 230e6, spans: Array(20).fill(15),
    verify: { durationSeconds: 300, videoPackets: 9000, videoTimestampsStrictlyIncreasing: true, joins: 20, joinsOnKeyframe: 20, audioPackets: 14063, audioGaps: 0, audioLevelDb: -19, audible: true, clipOutputDb: Array(20).fill(-19) },
    audioTrack: { trackId: 2, codec: "aac", codecString: "mp4a.40.2", sampleRate: 48000, channels: 2, descriptionBytes: 2 },
    clipSourceDb: Array(20).fill(-19),
    clipAudio: Array.from({ length: 20 }, (_, i) => ({ clip: i + 1, sourceDb: -19, outputDb: -19, verdict: "ok" as const })),
    ...over,
  };
}

function deps(over: Partial<LabDeps> = {}): Partial<LabDeps> {
  return {
    detectEnvironment: vi.fn(async () => ({
      userAgent: "test", browser: "Brave (Chromium 140)", isBrave: true, android: "15", chromeVersion: "140", cores: 8, deviceMemoryGB: 8,
      crossOriginIsolated: false, apis: { "OPFS (navigator.storage.getDirectory)": true, "showSaveFilePicker (save-as dialog)": false },
      quota: 5e9, usage: 0, persisted: false,
    })),
    probeSource: vi.fn(async () => PROBE),
    runMontage: vi.fn(async () => okResult()),
    listLabFiles: vi.fn(async () => []),
    clearLabFiles: vi.fn(async () => []),
    removeLabFile: vi.fn(async () => undefined),
    runReadChecks: vi.fn(async () => []),
    ...over,
  };
}

function matchFile() {
  const f = new File([new Uint8Array(4)], "final.mp4", { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: 451000000 });
  return f;
}

beforeEach(() => {
  resetPageLoadForTests();
  window.localStorage.clear();
  window.localStorage.setItem(V1_KEY, V1_STORE);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function pickAndRun(d: Partial<LabDeps>) {
  render(<MontageLabScreen deps={d} />);
  await screen.findByText(/Brave \(Chromium 140\) · Android 15/);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
  });
  await screen.findByText(/final\.mp4 · 77\.7 min · 1920×1080/);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Build montage" }));
  });
}

describe("Montage Lab — R1 audio and share investigation", () => {
  it("shows a silent source audio track before any montage is built, and records the read checks", async () => {
    const d = deps({
      probeSource: vi.fn(async () => ({ ...PROBE, audioTracks: [{ id: 2, index: 1, codec: "aac", channels: 2, sampleRate: 48000, language: "und", name: null, isDefault: true, levelDb: -120 }] })),
      runReadChecks: vi.fn(async () => [
        { method: "slice" as const, where: "start" as const, offset: 0, ok: true, bytes: 65536, ms: 2, error: null },
        { method: "stream" as const, where: "end" as const, offset: 9, ok: false, bytes: 0, ms: 1, error: "NotReadableError: could not be read" },
      ]),
    });
    render(<MontageLabScreen deps={d} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
    });
    expect(await screen.findByText(/Audio track 1: aac 2ch 48000 Hz — SILENT \(-120 dB at 20\/50\/80% of the video\)/)).toBeTruthy();
    expect(screen.getByText(/File read problems: stream at end: NotReadableError/)).toBeTruthy();
    expect(screen.getByTestId("lab-report").textContent).toMatch(/audio tracks: #1 aac 2ch -120 dB \(used\) · read checks 1\/2 ok — FAILED: stream@end NotReadableError/);
  });

  it("names clips whose sound was lost in the montage, separately from clips silent in the source", async () => {
    const clipAudio = [
      { clip: 1, sourceDb: -19, outputDb: -19, verdict: "ok" as const },
      { clip: 2, sourceDb: -120, outputDb: -120, verdict: "source-silent" as const },
      { clip: 3, sourceDb: -20, outputDb: -120, verdict: "LOST-IN-MONTAGE" as const },
    ];
    await pickAndRun(deps({ runMontage: vi.fn(async () => okResult({ clipAudio })) }));
    expect((await screen.findByTestId("clip-audio")).textContent).toMatch(/1 ok, 1 silent in the source, 1 LOST in montage \(clips 3\), 0 unmeasured/);
  });

  it("share-size ladder: shares montage slices within the tap and records allowed vs refused", async () => {
    // Fake browser with Chromium Android's documented rule: refuse any file over 50 MiB. (jsdom builds the File from
    // the slice's real bytes, so the requested size is read from the name the ladder gives each test file.)
    const requestedMB = (f: File) => Number(/share-test-(\d+)MB/.exec(f.name)?.[1] ?? 0);
    const share = vi.fn(async (data: ShareData) => {
      if ((data.files ?? []).some((f) => requestedMB(f) * 1e6 > 50 * 1024 * 1024)) throw new DOMException("Permission denied", "NotAllowedError");
      throw new DOMException("Share canceled", "AbortError");
    });
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: () => true });
    const big = new Blob([new Uint8Array(1)]);
    const file = Object.assign(big, { name: "m.mp4", lastModified: 0 }) as File;
    Object.defineProperty(file, "size", { value: 112.9e6 });
    (file as unknown as { slice: (a: number, b: number) => Blob }).slice = (a: number, b: number) => {
      const part = new Blob([new Uint8Array(1)]);
      Object.defineProperty(part, "size", { value: b - a });
      return part;
    };
    await pickAndRun(deps({ runMontage: vi.fn(async () => okResult({ file, bytes: 112.9e6 })) }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Share 45 MB" }));
    });
    const status = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");
    await waitFor(() => expect(status()).toMatch(/45 MB: ALLOWED — the share sheet opened/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share 55 MB" }));
    });
    await waitFor(() => expect(status()).toMatch(/55 MB: REFUSED — NotAllowedError: Permission denied/));
    expect(share).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Share 100 MB" })).toBeTruthy();
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: undefined });
  });
});

describe("Montage Lab screen", () => {
  it("shows browser capabilities, including Brave detection", async () => {
    render(<MontageLabScreen deps={deps()} />);
    expect(await screen.findByText(/Brave \(Chromium 140\) · Android 15/)).toBeTruthy();
    expect(screen.getByText(/✗ showSaveFilePicker/)).toBeTruthy();
  });

  it("plans the mandatory 5-minute workload from the coach's real match and runs it to phone storage at 1080p", async () => {
    const d = deps();
    await pickAndRun(d);
    const call = (d.runMontage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const opts = call[1] as Parameters<LabDeps["runMontage"]>[1];
    expect(opts.ranges).toHaveLength(20);
    expect(opts.ranges.reduce((n, [s, e]) => n + (e - s), 0)).toBeCloseTo(300, 6);
    expect(opts).toMatchObject({ output: "opfs", audioTrackId: 2, profile: { id: "1080p" } });
    expect(await screen.findByText(/Built 5\.0 min in 2 min 0 s — 2\.5× real time/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share to WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save MP4 to Downloads" })).toBeTruthy();
    expect(screen.getByTestId("lab-report").textContent).toMatch(/montage 20 clips \/ 300 s \/ 1080p \/ opfs: built in 2 min 0 s/);
  });

  it("can use the coach's saved Match Clipper clips read-only", async () => {
    const d = deps();
    render(<MontageLabScreen deps={d} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
    });
    fireEvent.click(await screen.findByLabelText(/Use my 2 saved Match Clipper clips/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Build montage" }));
    });
    const opts = (d.runMontage as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Parameters<LabDeps["runMontage"]>[1];
    expect(opts.ranges).toEqual([[100, 106], [200, 208]]);
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_STORE);
  });

  it("a failed montage (storage full) is reported and leaves V1's saved clips untouched", async () => {
    const d = deps({
      runMontage: vi.fn(async () => okResult({ ok: false, error: "The operation failed because it would cause the application to exceed its storage quota.", errorName: "QuotaExceededError", file: null, verify: null })),
    });
    await pickAndRun(d);
    expect(await screen.findByText(/Failed: QuotaExceededError/)).toBeTruthy();
    expect(screen.getByText(/Temporary file removed/)).toBeTruthy();
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_STORE);
  });

  it("cancel aborts the run's signal", async () => {
    let seen: AbortSignal | undefined;
    const d = deps({
      runMontage: vi.fn(
        (_f: File, o: Parameters<LabDeps["runMontage"]>[1]) =>
          new Promise<MontageRunResult>((resolve) => {
            seen = o.signal;
            o.signal!.addEventListener("abort", () => resolve(okResult({ ok: false, cancelled: true, error: "Cancelled", errorName: "AbortError", file: null, verify: null })));
          }),
      ),
    });
    await pickAndRun(d);
    const region = await screen.findByRole("region", { name: "Running test" });
    await act(async () => {
      fireEvent.click(within(region).getByRole("button", { name: "Cancel" }));
    });
    expect(seen?.aborted).toBe(true);
    expect(await screen.findByText(/Cancelled after/)).toBeTruthy();
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_STORE);
  });

  it("reports an interrupted previous run and offers cleanup of leftover files", async () => {
    startRun("montage", "30 clips / 600 s / 1080p / opfs");
    const d = deps({ listLabFiles: vi.fn(async () => [{ name: "montage-9.mp4", bytes: 120e6, lastModified: 1 }]), clearLabFiles: vi.fn(async () => [{ name: "montage-9.mp4", bytes: 120e6, lastModified: 1 }]) });
    // StrictMode mounts effects twice (as the dev build does): the banner must survive that.
    render(<StrictMode><MontageLabScreen deps={d} /></StrictMode>);
    expect(await screen.findByText(/The last test did not finish: montage stopped at 0%/)).toBeTruthy();
    expect(await screen.findByText(/montage-9\.mp4 — 120\.0 MB/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clean up lab files" }));
    });
    expect(d.clearLabFiles).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("lab-report").textContent).toMatch(/cleanup: removed 1 lab file\(s\), 120\.0 MB/));
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_STORE);
    expect(window.localStorage.getItem(LAB_STORAGE_KEY)).toContain("interrupted");
  });
});
