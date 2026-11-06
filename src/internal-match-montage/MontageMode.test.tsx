// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import MontageMode, { type LoadedVideo, type MontageModeProps } from "./MontageMode";
import { addClips, createMontage, upsertMontage } from "./montage-ops";
import { MONTAGE_STORAGE_KEY, emptyMontageStore, loadMontages, saveMontages } from "./montage-storage";
import type { ClipSelection } from "../internal-match-clipper/clip-types";

const V1_KEY = "paircvision_internal_match_clipper_v1";
const V1_VALUE = '{"version":1,"lastProjectKey":"final.mp4::451000000","projects":[]}';
const source = { key: "final.mp4::451000000", fileName: "final.mp4", fileSize: 451000000, duration: 4662 };
const loadedVideo: LoadedVideo = { ...source, url: "blob:match" };
const clip = (id: string, start: number, end: number, name = `Clip ${id}`): ClipSelection => ({ id, name, category: "score", start, end, origin: "manual", createdAt: 1 });

let mediaTime = 0;
let paused = true;
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(V1_KEY, V1_VALUE);
  mediaTime = 0;
  paused = true;
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { configurable: true, get: () => mediaTime, set: (v: number) => { mediaTime = v; } });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 4662 });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => paused });
  Object.defineProperty(HTMLMediaElement.prototype, "seeking", { configurable: true, get: () => false });
  HTMLMediaElement.prototype.play = vi.fn(async () => { paused = false; });
  HTMLMediaElement.prototype.pause = vi.fn(() => { paused = true; });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Stands in for Match Clipper: owns which montage is open. */
function Harness({ initialOpen = null, ...p }: Partial<MontageModeProps> & { initialOpen?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  return (
    <MontageMode
      active={p.active ?? true}
      openId={openId}
      onOpen={setOpenId}
      loaded={p.loaded ?? null}
      current={p.current ?? null}
      savedClips={p.savedClips ?? (() => [])}
      onPickVideo={p.onPickVideo ?? vi.fn(() => null)}
    />
  );
}

function seed() {
  const m = addClips(createMontage("Defensive shape", source, 1), [clip("a", 10, 16, "Turnover"), clip("b", 100, 130, "Kickout setup"), clip("c", 50, 53)], 2).project;
  saveMontages(upsertMontage(emptyMontageStore(), m));
  return m;
}
function matchFile(name = "final.mp4", size = 451000000) {
  const f = new File([new Uint8Array(4)], name, { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}
const stored = () => loadMontages().store.projects[0]!;
async function loadPlayer() {
  await act(async () => {
    fireEvent.loadedMetadata(document.querySelector("video")!);
  });
}

describe("Montage mode — My Montages", () => {
  it("shows an empty state that points to New Montage and ＋ Montage", () => {
    render(<Harness />);
    expect(screen.getByText("No montages yet")).toBeTruthy();
    expect(screen.getByText(/Tap “New Montage”, or in Match Clipper tap “＋ Montage”/)).toBeTruthy();
  });

  it("New Montage with no match open asks for the video and opens it in Match Clipper", () => {
    const onPickVideo = vi.fn(() => null);
    render(<Harness onPickVideo={onPickVideo} />);
    fireEvent.click(screen.getByRole("button", { name: "New Montage" }));
    expect(screen.getByText("Open the match video first")).toBeTruthy();
    const f = matchFile();
    fireEvent.change(screen.getByLabelText("Open match video for a new montage"), { target: { files: [f] } });
    expect(onPickVideo).toHaveBeenCalledWith(f);
  });

  it("New Montage creates a named, empty montage for the current match and adds its saved clips", () => {
    const saved = [clip("a", 10, 16, "Turnover"), clip("b", 100, 130, "Kickout setup"), clip("c", 50, 53)];
    render(<Harness current={source} loaded={loadedVideo} savedClips={(k) => (k === source.key ? saved : [])} />);
    fireEvent.click(screen.getByRole("button", { name: "New Montage" }));
    fireEvent.change(screen.getByLabelText("New montage name"), { target: { value: "Kickouts" } });
    fireEvent.click(screen.getByRole("button", { name: "Create montage" }));
    expect(stored()).toMatchObject({ name: "Kickouts", sourceKey: source.key, items: [] });
    expect(screen.getByTestId("montage-totals").textContent).toBe("0 clips · 0:00 total");
    fireEvent.click(screen.getByRole("button", { name: "＋ Add clips" }));
    fireEvent.click(screen.getByLabelText("Choose Kickout setup"));
    fireEvent.click(screen.getByLabelText("Choose Turnover"));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 clips" }));
    // Added in the match's saved order, as copies; already-added ones aren't offered again.
    expect(stored().items.map((i) => [i.clipId, i.start, i.end])).toEqual([["a", 10, 16], ["b", 100, 130]]);
    expect(screen.queryByLabelText("Choose Turnover")).toBeNull();
    expect(screen.getByLabelText("Choose Clip c")).toBeTruthy();
    expect(screen.getByTestId("montage-totals").textContent).toBe("2 clips · 0:36 total");
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_VALUE);
  });

  it("lists montages with clip count and total length, and opens one", () => {
    seed();
    render(<Harness />);
    expect(within(screen.getByRole("list", { name: "My montages" })).getByText(/3 clips · 0:39 · final.mp4/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Defensive shape" }));
    expect(screen.getByTestId("montage-totals").textContent).toBe("3 clips · 0:39 total");
    expect(screen.getByText("1. Turnover")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← My Montages" }));
    expect(screen.getByRole("heading", { name: "My Montages" })).toBeTruthy();
  });

  it("reorders, removes, trims and renames — all persisted, V1 data untouched", () => {
    seed();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open Defensive shape" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Kickout setup up" }));
    expect(stored().items.map((i) => i.name)).toEqual(["Kickout setup", "Turnover", "Clip c"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Clip c" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove Clip c" }));
    expect(stored().items).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Trim Kickout setup" }));
    fireEvent.change(screen.getByLabelText("Montage clip start"), { target: { value: "01:45.5" } });
    fireEvent.blur(screen.getByLabelText("Montage clip start"));
    expect(stored().items[0]).toMatchObject({ start: 105.5, end: 130 });
    fireEvent.click(screen.getByRole("button", { name: "end forward half a second" }));
    expect(stored().items[0]).toMatchObject({ end: 130.5 });
    fireEvent.change(screen.getByLabelText("Montage clip start"), { target: { value: "02:10.4" } });
    fireEvent.blur(screen.getByLabelText("Montage clip start"));
    expect(screen.getByText(/at least 0.5 s long/)).toBeTruthy(); // invalid trim refused
    expect(stored().items[0]).toMatchObject({ start: 105.5 });
    fireEvent.change(screen.getByLabelText("Montage name"), { target: { value: "Kickouts — 2nd half" } });
    fireEvent.blur(screen.getByLabelText("Montage name"));
    expect(stored().name).toBe("Kickouts — 2nd half");
    expect(screen.getByTestId("montage-totals").textContent).toBe("2 clips · 0:31 total");
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_VALUE);
  });

  it("deleting a montage needs a second tap and never touches V1 clips", () => {
    seed();
    render(<Harness />);
    const list = screen.getByRole("list", { name: "My montages" });
    fireEvent.click(within(list).getByRole("button", { name: "Delete Defensive shape" }));
    fireEvent.click(within(list).getByRole("button", { name: "Confirm delete Defensive shape" }));
    expect(loadMontages().store.projects).toEqual([]);
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_VALUE);
  });

  it("leaves an unreadable montage store untouched and says so", () => {
    window.localStorage.setItem(MONTAGE_STORAGE_KEY, "{broken");
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't be read/);
    expect((screen.getByRole("button", { name: "New Montage" }) as HTMLButtonElement).disabled).toBe(true);
    expect(window.localStorage.getItem(MONTAGE_STORAGE_KEY)).toBe("{broken");
  });

  it("picks up montages added from Clip mode when it becomes active again", () => {
    const { rerender } = render(<Harness active />);
    expect(screen.getByText("No montages yet")).toBeTruthy();
    rerender(<Harness active={false} />);
    seed(); // e.g. “＋ Montage” in Clip mode while this was hidden
    rerender(<Harness active />);
    expect(screen.getByRole("button", { name: "Open Defensive shape" })).toBeTruthy();
  });
});

describe("Montage mode — source video", () => {
  it("previews straight from the video already open in Match Clipper (no reselecting)", async () => {
    const m = seed();
    const onPickVideo = vi.fn(() => null);
    render(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} onPickVideo={onPickVideo} />);
    expect(screen.queryByLabelText("Select match video")).toBeNull();
    expect(document.querySelector("video")!.getAttribute("src")).toBe("blob:match");
    await loadPlayer();
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 1 of 3 · Turnover");
    expect(onPickVideo).not.toHaveBeenCalled();
  });

  it("after reopening with no video open, asks for it; refuses a different video, hands the right one to Match Clipper", () => {
    const m = seed();
    const onPickVideo = vi.fn(() => null);
    render(<Harness initialOpen={m.id} onPickVideo={onPickVideo} />);
    expect(screen.getByTestId("montage-totals").textContent).toBe("3 clips · 0:39 total");
    expect(screen.getByText(/choose “final.mp4” again after reopening/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile("league.mp4", 300e6)] } });
    expect(screen.getByRole("alert").textContent).toMatch(/That's a different video \(league.mp4, 300 MB\)/);
    expect(onPickVideo).not.toHaveBeenCalled();
    const right = matchFile();
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [right] } });
    expect(onPickVideo).toHaveBeenCalledWith(right);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains when Match Clipper has a different match open, and shows a refusal from Match Clipper", () => {
    const m = seed();
    const other = { key: "league.mp4::300000000", fileName: "league.mp4", fileSize: 300e6, duration: 3000, url: "blob:other" };
    render(<Harness initialOpen={m.id} loaded={other} current={other} onPickVideo={() => "Wait for the clip export in Match Clipper to finish before changing the video."} />);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText(/Match Clipper has “league.mp4” open, but this montage was made from “final.mp4”/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile()] } });
    expect(screen.getByRole("alert").textContent).toMatch(/Wait for the clip export/);
  });
});

describe("Montage mode — sequential preview", () => {
  it("plays in order: current clip indicator, play/pause, next/previous, seek within the clip", async () => {
    const m = seed();
    render(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} />);
    await loadPlayer();
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 1 of 3 · Turnover");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
    });
    expect(mediaTime).toBe(10);
    expect(paused).toBe(false);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next clip" }));
    });
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 2 of 3 · Kickout setup");
    expect(mediaTime).toBe(100);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Position in current clip"), { target: { value: "12" } });
    });
    expect(mediaTime).toBe(112);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Previous clip" })); // 12 s in → restart this clip
    });
    expect(mediaTime).toBe(100);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Previous clip" })); // at start → previous clip
    });
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 1 of 3 · Turnover");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Preview from Clip c" }));
    });
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 3 of 3 · Clip c");
    expect((screen.getByRole("button", { name: "Next clip" }) as HTMLButtonElement).disabled).toBe(true);
    // Learned the source duration for trim validation, without touching V1 data.
    expect(stored().sourceDuration).toBe(4662);
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_VALUE);
  });

  it("editing while previewing keeps the preview in step and the edits saved", async () => {
    const m = seed();
    render(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} />);
    await loadPlayer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move Kickout setup up" }));
    });
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 1 of 3 · Kickout setup");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
    });
    expect(mediaTime).toBe(100);
    expect(stored().items.map((i) => i.name)).toEqual(["Kickout setup", "Turnover", "Clip c"]);
  });

  it("leaving Montage mode stops the preview; coming back returns to the same clip, paused", async () => {
    const m = seed();
    const { rerender } = render(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} active />);
    await loadPlayer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Preview from Kickout setup" }));
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
    });
    expect(paused).toBe(false);
    rerender(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} active={false} />);
    expect(paused).toBe(true);
    expect(document.querySelector("video")).toBeNull();
    rerender(<Harness initialOpen={m.id} loaded={loadedVideo} current={source} active />);
    await loadPlayer();
    expect(screen.getByTestId("preview-now").textContent).toBe("Clip 2 of 3 · Kickout setup");
    expect(mediaTime).toBe(100);
    expect(paused).toBe(true);
  });
});
