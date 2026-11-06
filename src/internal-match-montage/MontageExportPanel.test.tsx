// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import MontageExportPanel, { EXPORT_LIMIT_SECONDS, exportLimitSeconds, resetExportSessionForTests, type ExportEngine } from "./MontageExportPanel";
import { MontageExportError, type MontageExportOptions, type MontageExportResult } from "./montage-export";
import { addClips, createMontage } from "./montage-ops";
import { EXPORT_RUN_KEY } from "./export-storage";
import type { ClipSelection } from "../internal-match-clipper/clip-types";

const download = vi.hoisted(() => vi.fn());
vi.mock("../features/shared/mediaClipExport", async (orig) => ({ ...(await orig<typeof import("../features/shared/mediaClipExport")>()), downloadClipBlob: download }));

const source = { key: "58695.mp4::229100000", fileName: "58695.mp4", fileSize: 229100000, duration: 307 };
const clip = (id: string, start: number, end: number): ClipSelection => ({ id, name: `Clip ${id}`, category: "score", start, end, origin: "manual", createdAt: 1 });
const montage = (name = "Kickouts", clips = [clip("a", 10, 25), clip("b", 100, 130)]) => addClips(createMontage(name, source, 1), clips, 2).project;
const matchFile = (name = "58695.mp4", size = 229100000) => {
  const f = new File([new Uint8Array(4)], name, { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

function result(over: Partial<MontageExportResult> = {}): MontageExportResult {
  return {
    file: new File([new Uint8Array(8)], "montage-1.mp4", { type: "video/mp4" }), storedName: "montage-1.mp4", bytes: 223.36e6, estimateBytes: 119.6e6,
    seconds: 45, width: 1076, height: 636, downscaled: false, bitrateMode: "constant", actualBitrate: 5.96e6, elapsedMs: 141000, audioCodec: "mp4a.40.2",
    verify: { ok: true, problems: [], joinsOnKeyframe: 2, joins: 2, durationSeconds: 45, expectedSeconds: 45, videoPackets: 1350, audioPackets: 2109, audioGaps: 0,
      clips: [{ clip: 1, audioPackets: 703, audioPacketsInMp4: 703, audioIdentical: true }, { clip: 2, audioPackets: 1406, audioPacketsInMp4: 1406, audioIdentical: true }] },
    ...over,
  };
}

/** An engine whose export the test finishes by hand. */
function controlled() {
  const ctl = {
    opts: null as MontageExportOptions | null,
    resolve: (_r: MontageExportResult) => undefined as void,
    reject: (_e: unknown) => undefined as void,
    engine: null as unknown as ExportEngine & { exportMontage: ReturnType<typeof vi.fn> },
  };
  ctl.engine = {
    exportMontage: vi.fn((_f: File, o: MontageExportOptions) => {
      ctl.opts = o;
      return new Promise<MontageExportResult>((res, rej) => {
        ctl.resolve = res;
        ctl.reject = rej;
        o.signal?.addEventListener("abort", () => rej(new MontageExportError("cancelled", "Export cancelled.")));
      });
    }),
  };
  return ctl;
}

const release = vi.fn(async () => undefined);
beforeEach(() => {
  resetExportSessionForTests();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/internal/match-clipper?mode=montage");
  download.mockReset();
  release.mockClear();
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: vi.fn(async () => ({ release })) } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
});

const create = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create MP4" }));
  });
};

describe("Create MP4", () => {
  it("explains what blocks it: no video, no clips, too long, a clip export running", () => {
    const p = montage();
    const { rerender } = render(<MontageExportPanel project={p} source={null} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} />);
    const blocker = () => screen.getByTestId("export-blocker").textContent;
    expect(blocker()).toBe("Select the match video above to create the MP4.");
    expect((screen.getByRole("button", { name: "Create MP4" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<MontageExportPanel project={{ ...p, items: [] }} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} />);
    expect(blocker()).toBe("Add clips to the montage first.");
    rerender(<MontageExportPanel project={montage("Long", [clip("x", 0, 400)])} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} />);
    expect(blocker()).toMatch(/up to 6 minutes for now; this one is 06:40/);
    rerender(<MontageExportPanel project={p} source={matchFile()} audioTrackId={null} clipExportBusy onPickVideo={vi.fn()} />);
    expect(blocker()).toBe("Wait for the clip export in Match Clipper to finish.");
  });

  it("6-minute limit for now; 10 minutes only behind the test switch", () => {
    expect(exportLimitSeconds("")).toBe(EXPORT_LIMIT_SECONDS);
    expect(exportLimitSeconds("?mode=montage&exportLimit=10")).toBe(600);
  });

  it("exports with the chosen commentary track, shows progress, keeps the screen awake, and offers Save / Share / Delete", async () => {
    const ctl = controlled();
    const p = montage();
    render(<MontageExportPanel project={p} source={matchFile()} audioTrackId={3} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    expect(screen.getByText(/720p · 0:45 · about 18 MB/)).toBeTruthy();
    await create();
    expect(ctl.opts).toMatchObject({ ranges: [{ start: 10, end: 25 }, { start: 100, end: 130 }], audioTrackId: 3, maxSeconds: 360 });
    expect(JSON.parse(window.localStorage.getItem(EXPORT_RUN_KEY)!)).toMatchObject({ montageName: "Kickouts" });
    await act(async () => ctl.opts!.onProgress!({ stage: "building", fraction: 0.46, clip: 2, clips: 2 }));
    expect(screen.getByTestId("export-progress").textContent).toBe("Building clip 2 of 2… 46%");
    await act(async () => ctl.resolve(result()));
    expect(screen.getByTestId("export-done").textContent).toBe("MP4 ready · 223 MB · 0:45 · 1076×636");
    expect(screen.getByText(/all 2 clips' audio is in the MP4, unchanged/)).toBeTruthy();
    expect(screen.getByText(/6\.0 Mbps average \(target 3\.1, constant bitrate\) · estimate was 120 MB/)).toBeTruthy();
    expect(window.localStorage.getItem(EXPORT_RUN_KEY)).toBeNull();
    expect(release).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save MP4" }));
    expect(download).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(/^video\/mp4/), "Kickouts");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete export" }));
    });
    expect(screen.queryByTestId("export-done")).toBeNull();
    expect(screen.getByRole("button", { name: "Create MP4" })).toBeTruthy();
  });

  it("Share: hands the MP4 over; if the browser refuses it, points to Save MP4 without guessing a limit", async () => {
    const ctl = controlled();
    render(<MontageExportPanel project={montage()} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    await create();
    await act(async () => ctl.resolve(result()));
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: "Kickouts.mp4", type: "video/mp4" })] });
    expect(screen.getByTestId("export-handoff").textContent).toMatch(/^Montage handed to the app you chose\. If WhatsApp doesn't send it/);
    share.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(screen.getByTestId("export-handoff").textContent).toBe("This phone's browser refused to share this 223 MB MP4 directly. Tap Save MP4, then attach the saved video in WhatsApp.");
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(screen.getByTestId("export-handoff").textContent).toMatch(/can't share this file directly\. Tap Save MP4/);
  });

  it("Cancel stops the export and keeps nothing", async () => {
    const ctl = controlled();
    render(<MontageExportPanel project={montage()} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    await create();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    });
    expect(ctl.opts!.signal!.aborted).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Export cancelled\. Nothing was kept\./);
    expect((screen.getByRole("button", { name: "Create MP4" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("lost access to the match video: asks for it again (same video only), then allows a new export", async () => {
    const ctl = controlled();
    const first = matchFile();
    const onPickVideo = vi.fn(() => null);
    const p = montage();
    const { rerender } = render(<MontageExportPanel project={p} source={first} audioTrackId={null} clipExportBusy={false} onPickVideo={onPickVideo} engine={ctl.engine} />);
    await create();
    await act(async () => ctl.reject(new MontageExportError("source_unreadable", "The phone stopped letting PáircVision read the match video part-way through. Choose the video again and retry.", { detail: "SourceReadError: NotReadableError (bytes 100663296–100728832)" })));
    expect(screen.getByRole("alert").textContent).toMatch(/stopped letting PáircVision read the match video.*bytes 100663296–100728832/);
    expect(screen.getByTestId("export-blocker").textContent).toBe("Choose the match video again first (below).");
    expect(screen.getByText(/choosing it from “From this device” \(or the Files app\) has worked/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Choose the match video again"), { target: { files: [matchFile("other.mp4", 5)] } });
    expect(screen.getByText(/That's a different video \(other\.mp4\)/)).toBeTruthy();
    const again = matchFile();
    fireEvent.change(screen.getByLabelText("Choose the match video again"), { target: { files: [again] } });
    expect(onPickVideo).toHaveBeenCalledWith(again);
    rerender(<MontageExportPanel project={p} source={again} audioTrackId={null} clipExportBusy={false} onPickVideo={onPickVideo} engine={ctl.engine} />);
    expect((screen.getByRole("button", { name: "Create MP4" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Tip: “58695\.mp4” looks like it came from Gallery\/Photos/)).toBeTruthy();
  });

  it("flags an MP4 made before the montage was changed", async () => {
    const ctl = controlled();
    const p = montage();
    const { rerender } = render(<MontageExportPanel project={p} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    await create();
    await act(async () => ctl.resolve(result()));
    expect(screen.queryByText(/changed the montage since/)).toBeNull();
    rerender(<MontageExportPanel project={{ ...p, items: p.items.slice(0, 1) }} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    expect(screen.getByText(/You've changed the montage since this MP4 was made/)).toBeTruthy();
  });

  it("keeps running across mode switches (unmount/remount), one montage at a time", async () => {
    const ctl = controlled();
    const a = montage("Kickouts"), b = montage("Turnovers");
    const { unmount } = render(<MontageExportPanel project={a} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    await create();
    unmount(); // e.g. switched to Clip mode / another montage
    render(<MontageExportPanel project={b} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    expect(screen.getByTestId("export-blocker").textContent).toBe("“Kickouts” is being exported. One montage at a time.");
    cleanup();
    render(<MontageExportPanel project={a} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} engine={ctl.engine} />);
    expect(screen.getByTestId("export-progress")).toBeTruthy();
    await act(async () => ctl.resolve(result()));
    expect(screen.getByTestId("export-done")).toBeTruthy();
  });

  it("says when the last export never finished (page closed or phone stopped it)", () => {
    window.localStorage.setItem(EXPORT_RUN_KEY, JSON.stringify({ montageId: "m", montageName: "Kickouts", startedAt: 1 }));
    render(<MontageExportPanel project={montage()} source={matchFile()} audioTrackId={null} clipExportBusy={false} onPickVideo={vi.fn()} />);
    expect(screen.getByText(/The last export \(“Kickouts”\) didn't finish/)).toBeTruthy();
    expect(window.localStorage.getItem(EXPORT_RUN_KEY)).toBeNull();
  });
});
