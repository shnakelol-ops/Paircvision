// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { PlayerTokensSelector } from "./TacticalPadLiteClean";

afterEach(cleanup);

function renderSelector(overrides: Partial<Parameters<typeof PlayerTokensSelector>[0]> = {}) {
  const props = {
    style: "bib" as const,
    size: "compact" as const,
    open: true,
    onToggle: vi.fn(),
    onStyleChange: vi.fn(),
    onSizeChange: vi.fn(),
    ...overrides,
  };
  render(<PlayerTokensSelector {...props} />);
  return props;
}

const labels = (group: HTMLElement) =>
  within(group)
    .getAllByRole("button")
    .map((button) => button.textContent?.replace("✓ ", "").trim());

describe("PlayerTokensSelector — the one Player Tokens menu on every surface", () => {
  it("lists Style (five styles) above Size (Normal / Compact / Mini), with no Practice", () => {
    renderSelector();
    const style = screen.getByRole("group", { name: "Player token style" });
    const size = screen.getByRole("group", { name: "Player token size" });
    expect(labels(style)).toEqual(["Vision V3", "Pixi", "Phosphor", "Name Badge", "Bib Token"]);
    expect(labels(size)).toEqual(["Normal", "Compact", "Mini"]);
    expect(style.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Practice/)).toBeNull();
  });

  it("marks the current style and size, and names both on the trigger", () => {
    renderSelector({ style: "pixi", size: "mini" });
    expect(screen.getByRole("button", { name: "✓ Pixi" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "✓ Mini" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Player Tokens/ }).textContent).toContain("Current: Pixi · Mini");
  });

  it("reports style and size picks", () => {
    const props = renderSelector();
    fireEvent.click(screen.getByRole("button", { name: "Name Badge" }));
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));
    expect(props.onStyleChange).toHaveBeenCalledWith("pill-under");
    expect(props.onSizeChange).toHaveBeenCalledWith("normal");
  });

  it("collapsed, shows only the trigger", () => {
    renderSelector({ open: false });
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("button", { name: /Player Tokens/ }).getAttribute("aria-expanded")).toBe("false");
  });
});
