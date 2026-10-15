// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Regression: a camera update queued for the next animation frame must never
// land after Reset Camera or a view change. The shared hook is the one both
// Tactical Slate and Tactical Sequence use.

type Hook = typeof import("./sequenceGoalView");

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextId = 1;
const flushFrames = () => {
  const due = frames;
  frames = [];
  for (const f of due) f.cb(performance.now());
};

async function loadHookWithFlagOn(): Promise<Hook> {
  vi.resetModules();
  vi.stubEnv("VITE_EXPERIMENTAL_GOAL_VIEW", "true");
  const mod = await import("./sequenceGoalView");
  expect(mod.GOAL_VIEW_EXPERIMENT_ENABLED).toBe(true);
  return mod;
}

const pointer = (id: number, x: number, y: number) =>
  ({ pointerId: id, clientX: x, clientY: y, currentTarget: { setPointerCapture: () => {} } }) as never;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.push({ id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames = frames.filter((f) => f.id !== id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function dragQueuedButNotFlushed() {
  const { useGoalView } = await loadHookWithFlagOn();
  const view = renderHook(() => useGoalView(null));
  act(() => view.result.current.setMode("left-end"));
  const surface = view.result.current.camera.surfaceProps;
  act(() => {
    surface.onPointerDown(pointer(1, 100, 100));
    surface.onPointerMove(pointer(1, 220, 100)); // 120px → a 60° orbit, queued for the next frame
  });
  expect(frames.length).toBe(1);
  return view;
}

describe("pending orbit update vs Reset Camera / view change (shared hook)", () => {
  it("control: a queued drag update is applied on the next frame", async () => {
    const view = await dragQueuedButNotFlushed();
    act(() => flushFrames());
    expect(view.result.current.camera.orbit.yawDeg).toBe(60);
    expect(view.result.current.camera.moved).toBe(true);
  });

  it("Reset Camera cancels a pending orbit update", async () => {
    const view = await dragQueuedButNotFlushed();
    act(() => view.result.current.camera.reset());
    act(() => flushFrames());
    expect(view.result.current.camera.orbit).toEqual({ yawDeg: 0, elevationDeg: null, zoom: 1 });
    expect(view.result.current.camera.moved).toBe(false);
  });

  it("a view change cancels a pending orbit update and lands on the new end's preset", async () => {
    const view = await dragQueuedButNotFlushed();
    act(() => view.result.current.setMode("right-end"));
    act(() => flushFrames());
    expect(view.result.current.mode).toBe("right-end");
    expect(view.result.current.camera.orbit).toEqual({ yawDeg: 0, elevationDeg: null, zoom: 1 });
    expect(view.result.current.camera.moved).toBe(false);
  });

  it("a new drag after Reset Camera still works", async () => {
    const view = await dragQueuedButNotFlushed();
    act(() => view.result.current.camera.reset());
    const surface = view.result.current.camera.surfaceProps;
    act(() => {
      surface.onPointerUp(pointer(1, 220, 100));
      surface.onPointerDown(pointer(2, 100, 100));
      surface.onPointerMove(pointer(2, 160, 100));
    });
    act(() => flushFrames());
    expect(view.result.current.camera.orbit.yawDeg).toBe(30);
  });
});
