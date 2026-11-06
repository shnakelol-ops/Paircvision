// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import MontageWorkspaceScreen from "./MontageWorkspaceScreen";
import { addClips, createMontage, upsertMontage } from "./montage-ops";
import { MONTAGE_STORAGE_KEY, emptyMontageStore, loadMontages, saveMontages } from "./montage-storage";
import type { ClipSelection } from "../internal-match-clipper/clip-types";

const V1_KEY = "paircvision_internal_match_clipper_v1";
const V1_VALUE = '{"version":1,"lastProjectKey":"final.mp4::451000000","projects":[]}';
const source = { key: "final.mp4::451000000", fileName: "final.mp4", fileSize: 451000000, duration: 4662 };
const clip = (id: string, start: number, end: number, name = `Clip ${id}`): ClipSelection => ({ id, name, category: "score", start, end, origin: "manual", createdAt: 1 });

let mediaTime = 0;
let paused = true;
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(V1_KEY, V1_VALUE);
  window.history.replaceState(null, "", "/internal/match-clipper/montages");
  mediaTime = 0;
  paused = true;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:match"), revokeObjectURL: vi.fn() }));
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

describe("My Montages", () => {
  it("shows an empty state with how to add clips", () => {
    render(<MontageWorkspaceScreen />);
    expect(screen.getByText("No montages yet")).toBeTruthy();
    expect(screen.getByText(/tap “＋ Montage” on a clip/)).toBeTruthy();
  });

  it("lists montages with clip count and total length, and opens one", () => {
    seed();
    render(<MontageWorkspaceScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Open Defensive shape" }));
    expect(window.location.search).toMatch(/^\?id=montage%3A/);
    expect(screen.getByTestId("montage-totals").textContent).toBe("3 clips · 0:39 total");
    expect(screen.getByText("1. Turnover")).toBeTruthy();
  });

  it("reorders, removes, trims and renames — all persisted, V1 data untouched", () => {
    seed();
    render(<MontageWorkspaceScreen />);
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

  it("recovers after reopening: the open montage and its edits come back from storage", () => {
    const m = seed();
    window.history.replaceState(null, "", `/internal/match-clipper/montages?id=${encodeURIComponent(m.id)}`);
    render(<MontageWorkspaceScreen />);
    expect(screen.getByTestId("montage-totals").textContent).toBe("3 clips · 0:39 total");
    expect(screen.getByText(/Select the match video to preview/)).toBeTruthy();
    expect(screen.getByText(/choose “final.mp4” again each time you reopen/)).toBeTruthy();
  });

  it("refuses a different video, accepts the right one", async () => {
    const m = seed();
    window.history.replaceState(null, "", `/internal/match-clipper/montages?id=${encodeURIComponent(m.id)}`);
    render(<MontageWorkspaceScreen />);
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile("league.mp4", 300e6)] } });
    expect(screen.getByRole("alert").textContent).toMatch(/That's a different video \(league.mp4, 300 MB\)/);
    expect(document.querySelector("video")).toBeNull();
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile()] } });
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("previews in order: current clip indicator, play/pause, next/previous, seek within the clip", async () => {
    const m = seed();
    window.history.replaceState(null, "", `/internal/match-clipper/montages?id=${encodeURIComponent(m.id)}`);
    render(<MontageWorkspaceScreen />);
    fireEvent.change(screen.getByLabelText("Select match video"), { target: { files: [matchFile()] } });
    await act(async () => {
      fireEvent.loadedMetadata(document.querySelector("video")!);
    });
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

  it("deleting a montage needs a second tap and never touches V1 clips", () => {
    seed();
    render(<MontageWorkspaceScreen />);
    const list = screen.getByRole("list");
    fireEvent.click(within(list).getByRole("button", { name: "Delete Defensive shape" }));
    fireEvent.click(within(list).getByRole("button", { name: "Confirm delete Defensive shape" }));
    expect(loadMontages().store.projects).toEqual([]);
    expect(window.localStorage.getItem(V1_KEY)).toBe(V1_VALUE);
  });

  it("leaves an unreadable montage store untouched and says so", () => {
    window.localStorage.setItem(MONTAGE_STORAGE_KEY, "{broken");
    render(<MontageWorkspaceScreen />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't be read/);
    expect(window.localStorage.getItem(MONTAGE_STORAGE_KEY)).toBe("{broken");
  });
});
