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
    probeAccess: vi.fn(async () => OK_PROBES),
    ...over,
  };
}

const OK_PROBES = (["start", "middle", "end"] as const).map((where, i) => ({ where, offset: i, ok: true, ms: 1, error: null }));

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

describe("Montage Lab — source-read diagnostics", () => {
  const FAILURE = { name: "NotReadableError", message: "The requested file could not be read", start: 100663296, end: 100728832, retried: true };
  const forensics = (over: Record<string, unknown> = {}) => ({
    failure: { ...FAILURE, t: 61000 }, msSincePick: 60300, msSinceFirstRead: 60000, msSinceLastGoodRead: 120, lastGoodRead: null,
    readsBefore: 800, bytesBefore: 100e6, slowReadsBefore: 0, maxReadMs: 90, recentReads: [], snapshotChanged: false, jsHeapMB: 80,
    rounds: (["immediately", "after 2 s", "after 10 s"] as const).map((label, i) => ({
      label, atMsAfterFailure: [0, 2000, 10000][i]!, visibility: "visible", sizeNow: 451000000, lastModifiedNow: 1,
      probes: (["start", "middle", "end", "failed range"] as const).map((where) => ({ where, offset: 0, ok: false, ms: 3, error: "NotReadableError: x" })),
    })),
    verdict: "permanent: whole file unreadable" as const,
    ...over,
  });
  const failingMontage = () =>
    vi.fn(async (_f: File, opts: { tracker?: { fail: (f: typeof FAILURE, ms: number) => void } }) => {
      opts.tracker?.fail(FAILURE, 4);
      return okResult({ ok: false, file: null, error: "NotReadableError: … (bytes 100663296–100728832)", errorName: "SourceReadError", verify: null, clipAudio: [] });
    });

  it("after a read failure: re-reads the file, records the evidence, and requires choosing the video again", async () => {
    const runForensics = vi.fn(async () => forensics());
    const d = deps({ runMontage: failingMontage() as unknown as LabDeps["runMontage"], runForensics: runForensics as unknown as LabDeps["runForensics"] });
    await pickAndRun(d);
    expect(await screen.findByTestId("stale-file")).toBeTruthy();
    expect(screen.getByTestId("stale-file").textContent).toMatch(/can no longer read “final.mp4” \(NotReadableError at bytes 100663296–100728832 \(permanent: whole file unreadable\)\)/);
    expect(runForensics).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("read-diag").textContent).toMatch(/Montage: NotReadableError at bytes 100663296–100728832 · 60\.3 s after picking the file.*immediately: start FAIL.*after 10 s: .*verdict: permanent: whole file unreadable · page events: no visibility/);
    expect(screen.getByTestId("lab-report").textContent).toMatch(/read-failure: Montage: NotReadableError/);
    expect((screen.getByRole("button", { name: "Build montage" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Read soak (no encoding)" }) as HTMLButtonElement).disabled).toBe(true);
    // Choosing the video again clears it.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
    });
    await waitFor(() => expect(screen.queryByTestId("stale-file")).toBeNull());
    expect((screen.getByRole("button", { name: "Build montage" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a file that can't be read any more is caught before the next run starts", async () => {
    const runMontage = vi.fn(async () => okResult());
    const probeAccess = vi.fn(async () => OK_PROBES.map((p) => ({ ...p, ok: p.where !== "start", error: p.where === "start" ? "NotReadableError: x" : null })));
    await pickAndRun(deps({ runMontage, probeAccess }));
    expect(await screen.findByTestId("stale-file")).toBeTruthy();
    expect(runMontage).not.toHaveBeenCalled();
    expect(screen.getByTestId("lab-report").textContent).toMatch(/read-preflight: FAILED — Before building: start NotReadableError/);
  });

  it("read soak without encoding: passes and records reads, speed and page events", async () => {
    const soakRead = vi.fn(async () => ({ elapsedMs: 180000, reads: 9000, bytes: 36e9, passes: 157, mbPerSecond: 200, cancelled: false, failure: null, failedAfterMs: null }));
    const benchmarkEncode = vi.fn();
    render(<MontageLabScreen deps={deps({ soakRead, benchmarkEncode })} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Read soak (no encoding)" }));
    });
    expect((await screen.findByTestId("read-diag")).textContent).toMatch(/read soak 3 min \(no encoding\): PASSED · 9000 reads, 36000 MB \(157 full passes, 200 MB\/s\)/);
    expect(soakRead).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ durationMs: 180000 }));
    expect(benchmarkEncode).not.toHaveBeenCalled();
  });

  it("read soak with encoding: runs synthetic 720p encodes alongside, stops them at the end, and a failure needs a fresh pick", async () => {
    let soakSignalled = false;
    const benchmarkEncode = vi.fn(async (_w: number, _h: number, _s: number, _a: HardwareAcceleration, signal?: AbortSignal) => {
      await new Promise((r) => setTimeout(r, 5));
      return { label: "720p", width: 1280, height: 720, acceleration: "no-preference" as const, frames: 900, seconds: 30, elapsedMs: 12000, realtimeFactor: signal?.aborted ? 0 : 2.5, fps: 75, outputBytes: 1, maxQueue: 3, error: null };
    });
    const soakRead = vi.fn(async (_f: File, tracker: { fail: (f: typeof FAILURE, ms: number) => void }) => {
      await new Promise((r) => setTimeout(r, 30));
      tracker.fail(FAILURE, 3);
      soakSignalled = true;
      return { elapsedMs: 61000, reads: 3000, bytes: 12e9, passes: 52, mbPerSecond: 196, cancelled: false, failure: { ...FAILURE, t: 1 }, failedAfterMs: 61000 };
    });
    const runForensics = vi.fn(async () => forensics({ verdict: "permanent: whole file unreadable" }));
    render(<MontageLabScreen deps={deps({ soakRead: soakRead as unknown as LabDeps["soakRead"], benchmarkEncode, runForensics: runForensics as unknown as LabDeps["runForensics"] })} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Match video for montage test"), { target: { files: [matchFile()] } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Read soak + encoding" }));
    });
    await screen.findByTestId("stale-file");
    expect(soakSignalled).toBe(true);
    expect(benchmarkEncode).toHaveBeenCalled();
    const calls = benchmarkEncode.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(benchmarkEncode.mock.calls.length).toBe(calls); // encoding stopped with the soak
    expect(screen.getByTestId("lab-report").textContent).toMatch(/read soak 3 min \+ 720p encoding: FAILED after 1 min 1 s · 3000 reads.*encoding: \d+ × 30 s rounds/);
    expect(screen.getByTestId("lab-report").textContent).toMatch(/read-failure: read soak 3 min \+ 720p encoding: NotReadableError/);
  });
});
