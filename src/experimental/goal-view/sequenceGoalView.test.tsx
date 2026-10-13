// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";

import type { MovementCanvasShellHandle } from "../../movement-board/shell/types";
import {
  GOAL_VIEW_PREVIEW_HOST,
  computeGoalViewExperimentEnabled,
  GOAL_VIEW_EXPERIMENT_ENABLED,
  GOAL_VIEW_MODE_OPTIONS,
  GoalViewModeRow,
  GoalViewQuickToggle,
  GoalViewReadOnlyShield,
  useSequenceGoalView,
  type GoalViewCamera,
} from "./sequenceGoalView";
import { DEFAULT_GOAL_VIEW_ORBIT } from "./goalViewCamera";

afterEach(() => cleanup());

function fakeShell() {
  return {
    setOrientation: vi.fn(),
    getExperimentalRenderTargets: vi.fn(),
  } as unknown as MovementCanvasShellHandle & {
    setOrientation: ReturnType<typeof vi.fn>;
    getExperimentalRenderTargets: ReturnType<typeof vi.fn>;
  };
}

describe("Goal View experiment flag", () => {
  it("is off without VITE_EXPERIMENTAL_GOAL_VIEW or a ?goalview dev query", () => {
    expect(import.meta.env.VITE_EXPERIMENTAL_GOAL_VIEW).toBeUndefined();
    expect(GOAL_VIEW_EXPERIMENT_ENABLED).toBe(false);
  });

  it("with the flag off the hook is inert: never a goal view, never touches the shell", () => {
    const shell = fakeShell();
    const { result } = renderHook(() => useSequenceGoalView(shell));
    act(() => result.current.setMode("right-end"));
    expect(result.current.mode).toBe("top-down");
    expect(result.current.isGoalView).toBe(false);
    expect(shell.setOrientation).not.toHaveBeenCalled();
    expect(shell.getExperimentalRenderTargets).not.toHaveBeenCalled();
    expect(() => result.current.releaseBeforeShellDestroy()).not.toThrow();
  });

  it("with the flag off the camera is inert: Camera C preset, nothing moved", () => {
    const { result } = renderHook(() => useSequenceGoalView(null));
    expect(result.current.camera.orbit).toEqual(DEFAULT_GOAL_VIEW_ORBIT);
    expect(result.current.camera.moved).toBe(false);
    act(() => result.current.camera.reset());
    act(() => result.current.camera.toggleFit());
    expect(result.current.camera.orbit).toEqual(DEFAULT_GOAL_VIEW_ORBIT);
  });

  it("release handle is stable across renders (safe to capture in mount effects)", () => {
    const { result, rerender } = renderHook(() => useSequenceGoalView(null));
    const first = result.current.releaseBeforeShellDestroy;
    rerender();
    expect(result.current.releaseBeforeShellDestroy).toBe(first);
  });
});

describe("Goal View access gate", () => {
  const base = { envFlag: undefined, isDevBuild: false, branchPreviewBuild: false, previewEligibleBuild: true, hostname: GOAL_VIEW_PREVIEW_HOST, search: "" };

  it("is always on in the experimental branch's preview build, on any of its URLs, no query needed", () => {
    for (const hostname of [GOAL_VIEW_PREVIEW_HOST, "paircvision-3izvi8n2q-shnakelol-pitchisde.vercel.app"]) {
      expect(computeGoalViewExperimentEnabled({ ...base, branchPreviewBuild: true, hostname })).toBe(true);
    }
  });

  it("falls back to the exact preview host when Vercel's build variables are unavailable", () => {
    expect(computeGoalViewExperimentEnabled(base)).toBe(true);
    expect(computeGoalViewExperimentEnabled({ ...base, search: "?goalview" })).toBe(true);
  });

  it("stays off on production and on other hosts", () => {
    for (const hostname of [
      "paircvision.vercel.app",
      "www.paircvision.ie",
      "paircvision-git-main-shnakelol-pitchisde.vercel.app",
      "paircvision-abc123def-shnakelol-pitchisde.vercel.app",
      "paircvision-git-some-other-branch-shnakelol-pitchisde.vercel.app",
      `evil.${GOAL_VIEW_PREVIEW_HOST}`,
    ]) {
      expect(computeGoalViewExperimentEnabled({ ...base, hostname, search: "?goalview" })).toBe(false);
    }
  });

  it("stays off when the build is not eligible (Vercel production or another branch)", () => {
    expect(computeGoalViewExperimentEnabled({ ...base, previewEligibleBuild: false, search: "?goalview" })).toBe(false);
  });

  it("dev builds accept ?goalview anywhere; the env flag always wins", () => {
    expect(computeGoalViewExperimentEnabled({ ...base, isDevBuild: true, hostname: "localhost", previewEligibleBuild: false, search: "?goalview" })).toBe(true);
    expect(computeGoalViewExperimentEnabled({ ...base, isDevBuild: true, hostname: "localhost", previewEligibleBuild: false })).toBe(false);
    expect(computeGoalViewExperimentEnabled({ ...base, envFlag: "true", hostname: "x", previewEligibleBuild: false })).toBe(true);
  });
});

describe("Goal View controls", () => {
  it("offers Top-Down, Left End and Right End and reports the choice", () => {
    expect(GOAL_VIEW_MODE_OPTIONS.map((o) => o.label)).toEqual(["Top-Down", "Left End", "Right End"]);
    const onChange = vi.fn();
    render(
      <GoalViewModeRow mode="top-down" onChange={onChange} rowStyle={{}} labelStyle={{}} buttonStyle={{}} activeButtonStyle={{}} />,
    );
    expect(screen.getByRole("button", { name: "Top-Down" }).getAttribute("aria-pressed")).toBe("true");
    screen.getByRole("button", { name: "Left End" }).click();
    expect(onChange).toHaveBeenCalledWith("left-end");
  });

  it("on-pitch quick toggle cycles Top-Down → Left End → Right End → Top-Down", () => {
    const onChange = vi.fn();
    const { rerender } = render(<GoalViewQuickToggle mode="top-down" onChange={onChange} />);
    screen.getByRole("button").click();
    expect(onChange).toHaveBeenLastCalledWith("left-end");
    rerender(<GoalViewQuickToggle mode="left-end" onChange={onChange} />);
    screen.getByRole("button").click();
    expect(onChange).toHaveBeenLastCalledWith("right-end");
    rerender(<GoalViewQuickToggle mode="right-end" onChange={onChange} />);
    screen.getByRole("button").click();
    expect(onChange).toHaveBeenLastCalledWith("top-down");
  });

  it("quick toggle sits outside the pitch box: above it by default, beside it on short landscape", () => {
    const { rerender } = render(<GoalViewQuickToggle mode="top-down" onChange={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-placement")).toBe("above");
    expect(button.style.bottom).toBe("calc(100% + 2px)");
    expect(button.style.right).toBe("0px");
    expect(button.style.top).toBe("");
    // Comfortable, stable touch target: same size for every label.
    expect(button.style.height).toBe("44px");
    expect(button.style.width).toBe("136px");
    rerender(<GoalViewQuickToggle mode="right-end" onChange={vi.fn()} placement="side" />);
    expect(screen.getByRole("button").getAttribute("data-placement")).toBe("side");
    expect(screen.getByRole("button").style.left).toBe("calc(100% + 6px)");
    expect(screen.getByRole("button").style.width).toBe("136px");
  });

  it("read-only shield names the active view", () => {
    render(<GoalViewReadOnlyShield mode="right-end" />);
    expect(screen.getByText(/Right End · view only/)).toBeTruthy();
  });

  const fakeCamera = (patch: Partial<GoalViewCamera> = {}): GoalViewCamera => ({
    orbit: DEFAULT_GOAL_VIEW_ORBIT,
    moved: false,
    fitted: false,
    reset: vi.fn(),
    toggleFit: vi.fn(),
    surfaceProps: { onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn() },
    ...patch,
  });

  it("camera controls appear beside the selector only in a goal view", () => {
    const camera = fakeCamera();
    const { rerender } = render(<GoalViewQuickToggle mode="top-down" onChange={vi.fn()} camera={camera} />);
    expect(screen.queryByRole("button", { name: "Reset Camera" })).toBeNull();
    rerender(<GoalViewQuickToggle mode="left-end" onChange={vi.fn()} camera={camera} />);
    const reset = screen.getByRole("button", { name: "Reset Camera" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true); // nothing to reset at the preset
    expect(reset.style.height).toBe("44px");
    screen.getByRole("button", { name: /Fit pitch/ }).click();
    expect(camera.toggleFit).toHaveBeenCalledTimes(1);
  });

  it("Reset Camera is enabled once the camera has moved", () => {
    const camera = fakeCamera({ moved: true });
    render(<GoalViewQuickToggle mode="right-end" onChange={vi.fn()} camera={camera} placement="side" />);
    const reset = screen.getByRole("button", { name: "Reset Camera" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    reset.click();
    expect(camera.reset).toHaveBeenCalledTimes(1);
  });

  it("with a camera, the shield is the orbit surface and says how to use it", () => {
    const camera = fakeCamera();
    const { container } = render(<GoalViewReadOnlyShield mode="left-end" camera={camera} />);
    expect(screen.getByText(/Left End · drag to rotate · Top-Down to edit/)).toBeTruthy();
    const shield = container.querySelector('[data-experimental="goal-view-shield"]') as HTMLElement;
    expect(shield.style.touchAction).toBe("none");
    shield.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(camera.surfaceProps.onPointerDown).toHaveBeenCalled();
  });
});
