// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DrawToolPanel, type DrawToolPanelStyles } from "./DrawToolPanel";

afterEach(() => {
  cleanup();
});

const STYLES: DrawToolPanelStyles = {
  section: {},
  sectionTitle: {},
  toolGrid: {},
  toolButton: { color: "grey" },
  toolButtonActive: { color: "green" },
  colorGrid: {},
  colorButton: { opacity: 1 },
  colorButtonActive: { opacity: 1, boxShadow: "0 0 0 2px cyan" },
  colorSwatch: {},
};

function baseProps(overrides?: Partial<Parameters<typeof DrawToolPanel>[0]>) {
  return {
    title: "Draw",
    tools: [
      { id: "move", label: "Move", active: true, onSelect: vi.fn() },
      { id: "line", label: "Plain", active: false, onSelect: vi.fn() },
      { id: "eraser", label: "Eraser", active: false, onSelect: vi.fn() },
    ],
    colors: [
      { label: "Black", value: 0x111111, css: "#111111", active: true, ariaLabel: "Set tactical drawing colour Black", onSelect: vi.fn() },
      { label: "White", value: 0xffffff, css: "#ffffff", active: false, ariaLabel: "Set tactical drawing colour White", onSelect: vi.fn() },
    ],
    styles: STYLES,
    ...overrides,
  };
}

describe("DrawToolPanel — renders exactly what it's given", () => {
  it("renders every tool option's label as a button", () => {
    render(<DrawToolPanel {...baseProps()} />);
    expect(screen.getByText("Move")).toBeTruthy();
    expect(screen.getByText("Plain")).toBeTruthy();
    expect(screen.getByText("Eraser")).toBeTruthy();
  });

  it("renders no tool it wasn't given (Label omitted -> Label doesn't appear)", () => {
    render(<DrawToolPanel {...baseProps()} />);
    expect(screen.queryByText("Label")).toBeNull();
  });

  it("renders every colour option as a swatch button, addressable by its own aria-label", () => {
    render(<DrawToolPanel {...baseProps()} />);
    expect(screen.getByLabelText("Set tactical drawing colour Black")).toBeTruthy();
    expect(screen.getByLabelText("Set tactical drawing colour White")).toBeTruthy();
  });

  it("renders the section title", () => {
    render(<DrawToolPanel {...baseProps()} />);
    expect(screen.getByText("Draw")).toBeTruthy();
  });
});

describe("DrawToolPanel — callbacks, one per option, no cross-talk", () => {
  it("clicking a tool button calls only that tool's own onSelect", () => {
    const props = baseProps();
    render(<DrawToolPanel {...props} />);
    fireEvent.click(screen.getByText("Eraser"));
    expect(props.tools[2].onSelect).toHaveBeenCalledTimes(1);
    expect(props.tools[0].onSelect).not.toHaveBeenCalled();
    expect(props.tools[1].onSelect).not.toHaveBeenCalled();
  });

  it("clicking a colour swatch calls only that colour's own onSelect", () => {
    const props = baseProps();
    render(<DrawToolPanel {...props} />);
    fireEvent.click(screen.getByLabelText("Set tactical drawing colour White"));
    expect(props.colors[1].onSelect).toHaveBeenCalledTimes(1);
    expect(props.colors[0].onSelect).not.toHaveBeenCalled();
  });
});

describe("DrawToolPanel — style is entirely caller-supplied (no embedded layout/mode knowledge)", () => {
  it("an active tool gets styles.toolButtonActive, an inactive one gets styles.toolButton", () => {
    render(<DrawToolPanel {...baseProps()} />);
    const active = screen.getByText("Move") as HTMLButtonElement;
    const inactive = screen.getByText("Plain") as HTMLButtonElement;
    expect(active.style.color).toBe("green");
    expect(inactive.style.color).toBe("grey");
  });

  it("an active colour gets styles.colorButtonActive, an inactive one gets styles.colorButton", () => {
    render(<DrawToolPanel {...baseProps()} />);
    const active = screen.getByLabelText("Set tactical drawing colour Black") as HTMLButtonElement;
    const inactive = screen.getByLabelText("Set tactical drawing colour White") as HTMLButtonElement;
    expect(active.style.boxShadow).toContain("cyan");
    expect(inactive.style.boxShadow).toBe("");
  });

  it("does not maintain its own active-tool state — re-rendering with a different `active` flag is the only thing that moves the active style, exactly like the shared PlayerKitEditor", () => {
    const props = baseProps();
    const { rerender } = render(<DrawToolPanel {...props} />);
    expect((screen.getByText("Move") as HTMLButtonElement).style.color).toBe("green");

    fireEvent.click(screen.getByText("Plain"));
    // Clicking fired the callback, but nothing in the component itself
    // changed `active` — still reflects the unchanged prop.
    expect((screen.getByText("Move") as HTMLButtonElement).style.color).toBe("green");
    expect((screen.getByText("Plain") as HTMLButtonElement).style.color).toBe("grey");

    const nextTools = [
      { ...props.tools[0], active: false },
      { ...props.tools[1], active: true },
      props.tools[2],
    ];
    rerender(<DrawToolPanel {...props} tools={nextTools} />);
    expect((screen.getByText("Move") as HTMLButtonElement).style.color).toBe("grey");
    expect((screen.getByText("Plain") as HTMLButtonElement).style.color).toBe("green");
  });
});

describe("DrawToolPanel — colour section title (Standard Slate's compact-landscape-only heading)", () => {
  it("omits the second section-title paragraph by default", () => {
    render(<DrawToolPanel {...baseProps()} />);
    expect(screen.getAllByText("Draw")).toHaveLength(1);
    expect(screen.queryByText("Colour")).toBeNull();
  });

  it("shows a 'Colour' heading when showColorSectionTitle is true", () => {
    render(<DrawToolPanel {...baseProps({ showColorSectionTitle: true })} />);
    expect(screen.getByText("Colour")).toBeTruthy();
  });

  it("uses a custom colorSectionTitle when supplied", () => {
    render(<DrawToolPanel {...baseProps({ showColorSectionTitle: true, colorSectionTitle: "Pen Colour" })} />);
    expect(screen.getByText("Pen Colour")).toBeTruthy();
    expect(screen.queryByText("Colour")).toBeNull();
  });
});

describe("DrawToolPanel — no drawing-domain knowledge duplicated", () => {
  it("accepts arbitrary string tool ids — proves it does not hardcode Standard Slate's WhiteboardToolControl union", () => {
    const props = baseProps({
      tools: [{ id: "future-game-timing-tool", label: "Whatever PR4 Wants", active: false, onSelect: vi.fn() }],
    });
    expect(() => render(<DrawToolPanel {...props} />)).not.toThrow();
    expect(screen.getByText("Whatever PR4 Wants")).toBeTruthy();
  });
});
