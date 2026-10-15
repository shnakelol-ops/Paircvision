// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Safe fallback: if the Goal View renderer cannot load or attach (e.g. a device
// with limited graphics), the board returns to Top-Down instead of being left
// half-attached. Same shared hook for Tactical Slate and Tactical Sequence.

function fakeHost() {
  return {
    setOrientation: vi.fn(),
    getExperimentalRenderTargets: vi.fn(() => ({}) as never),
  };
}

afterEach(() => {
  vi.doUnmock("./createGoalViewLens");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("Goal View safe fallback", () => {
  it("returns to Top-Down and releases the lens when attaching fails", async () => {
    vi.resetModules();
    const destroy = vi.fn();
    vi.doMock("./createGoalViewLens", () => ({
      createGoalViewLens: () => ({
        setEnd: () => {
          throw new Error("WebGL: render target unsupported");
        },
        setOptions: () => {},
        destroy,
      }),
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { useGoalView } = await import("./sequenceGoalView");
    const host = fakeHost();
    const { result } = renderHook(() => useGoalView(host));
    act(() => result.current.setMode("left-end"));
    await waitFor(() => expect(result.current.mode).toBe("top-down"));
    expect(result.current.isGoalView).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.current.camera.moved).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("returns to Top-Down when the Goal View module cannot load", async () => {
    vi.resetModules();
    vi.doMock("./createGoalViewLens", () => {
      throw new Error("chunk failed to load");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { useGoalView } = await import("./sequenceGoalView");
    const { result } = renderHook(() => useGoalView(fakeHost()));
    act(() => result.current.setMode("right-end"));
    await waitFor(() => expect(result.current.mode).toBe("top-down"));
    expect(result.current.isGoalView).toBe(false);
  });

  it("returns to Top-Down when the lens reports a failure after Goal View has started", async () => {
    vi.resetModules();
    const destroy = vi.fn();
    let reportFailure: ((error: unknown) => void) | undefined;
    vi.doMock("./createGoalViewLens", () => ({
      createGoalViewLens: (_targets: unknown, onFailure?: (error: unknown) => void) => {
        reportFailure = onFailure;
        return { setEnd: () => {}, setOptions: () => {}, destroy };
      },
    }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { useGoalView } = await import("./sequenceGoalView");
    const { result } = renderHook(() => useGoalView(fakeHost()));
    act(() => result.current.setMode("left-end"));
    await waitFor(() => expect(reportFailure).toBeTypeOf("function"));
    expect(result.current.mode).toBe("left-end"); // started normally
    act(() => reportFailure!(new Error("GPU failure mid-session")));
    expect(result.current.mode).toBe("top-down");
    expect(result.current.isGoalView).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
