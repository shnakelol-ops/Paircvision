// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import SlateFullViewController, { type SlateFullViewControllerProps } from "./SlateFullViewController";

afterEach(() => {
  cleanup();
});

function setup(overrides: Partial<SlateFullViewControllerProps> = {}) {
  const surface = { goToPhase: vi.fn(), reset: vi.fn() };
  const props: SlateFullViewControllerProps = {
    getSurface: () => surface,
    phaseCursor: -1,
    phaseCount: 4,
    isPlaying: false,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  const view = render(<SlateFullViewController {...props} />);
  return { surface, props, view };
}

describe("SlateFullViewController", () => {
  it("renders the phase label from the engine cursor", () => {
    setup({ phaseCursor: 1 });
    expect(screen.getByText("Phase 2/4")).toBeTruthy();
  });

  it("› calls surface.goToPhase(next)", () => {
    const { surface } = setup({ phaseCursor: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(surface.goToPhase).toHaveBeenCalledWith(2);
    expect(surface.reset).not.toHaveBeenCalled();
  });

  it("‹ calls surface.goToPhase(previous)", () => {
    const { surface } = setup({ phaseCursor: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Previous phase" }));
    expect(surface.goToPhase).toHaveBeenCalledWith(1);
  });

  it("‹ from Phase 1 goes to Start via surface.reset()", () => {
    const { surface } = setup({ phaseCursor: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Previous phase" }));
    expect(surface.reset).toHaveBeenCalledTimes(1);
    expect(surface.goToPhase).not.toHaveBeenCalled();
  });

  it("disables ‹ at Start and › at the last phase", () => {
    setup({ phaseCursor: -1, phaseCount: 1 });
    expect((screen.getByRole("button", { name: "Previous phase" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next phase" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    setup({ phaseCursor: 0, phaseCount: 1 });
    expect((screen.getByRole("button", { name: "Next phase" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("▶ calls onPlay; ⏸ calls onPause", () => {
    const { props } = setup({ isPlaying: false });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(props.onPlay).toHaveBeenCalledTimes(1);
    cleanup();
    const second = setup({ isPlaying: true });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(second.props.onPause).toHaveBeenCalledTimes(1);
  });

  it("✕ calls onExit", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("owns no phase state: navigating does not change the label until the engine reports a new cursor", () => {
    const { surface, props, view } = setup({ phaseCursor: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(surface.goToPhase).toHaveBeenCalledWith(1);
    // Still the engine's last-reported position.
    expect(screen.getByText("Phase 1/4")).toBeTruthy();
    view.rerender(<SlateFullViewController {...props} phaseCursor={1} />);
    expect(screen.getByText("Phase 2/4")).toBeTruthy();
  });
});
