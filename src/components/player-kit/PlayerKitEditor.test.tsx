// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PlayerKitEditor, type PlayerKitEditorValue } from "./PlayerKitEditor";
import { FULL_VISION_PATTERNS, PLAYER_KIT_PATTERN_LABEL, SLATE_V1_PATTERNS } from "./playerKitPatterns";

afterEach(() => {
  cleanup();
});

const COLOR_OPTIONS = [
  { id: "blue", cssColor: "#2563eb" },
  { id: "red", cssColor: "#dc2626" },
  { id: "white", cssColor: "#ffffff" },
];

function baseProps(overrides?: Partial<Parameters<typeof PlayerKitEditor>[0]>) {
  const value: PlayerKitEditorValue<(typeof SLATE_V1_PATTERNS)[number]> = {
    baseColor: "blue",
    pattern: "hoops",
    patternColor: "white",
    labelMode: "number",
    initials: "",
    name: "",
  };
  return {
    editorKey: "player-1",
    position: { left: 10, top: 10 },
    activeTab: "base" as const,
    onTabChange: vi.fn(),
    value,
    colorOptions: COLOR_OPTIONS,
    allowedPatterns: SLATE_V1_PATTERNS,
    patternLabels: PLAYER_KIT_PATTERN_LABEL,
    onBaseColorChange: vi.fn(),
    onPatternChange: vi.fn(),
    onPatternColorChange: vi.fn(),
    onLabelModeChange: vi.fn(),
    onInitialsChange: vi.fn(),
    onNameChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("PlayerKitEditor — callbacks", () => {
  it("clicking a base-colour swatch invokes onBaseColorChange with that colour's id, and nothing else", () => {
    const props = baseProps({ activeTab: "base" });
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByLabelText("Set base colour red"));

    expect(props.onBaseColorChange).toHaveBeenCalledTimes(1);
    expect(props.onBaseColorChange).toHaveBeenCalledWith("red");
    expect(props.onPatternChange).not.toHaveBeenCalled();
    expect(props.onPatternColorChange).not.toHaveBeenCalled();
    expect(props.onLabelModeChange).not.toHaveBeenCalled();
  });

  it("clicking a pattern button invokes onPatternChange with that exact pattern value", () => {
    const props = baseProps({ activeTab: "pattern" });
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByText(PLAYER_KIT_PATTERN_LABEL.slash));

    expect(props.onPatternChange).toHaveBeenCalledTimes(1);
    expect(props.onPatternChange).toHaveBeenCalledWith("slash");
  });

  it("clicking a pattern-colour swatch (pattern tab) invokes onPatternColorChange, not onBaseColorChange", () => {
    const props = baseProps({ activeTab: "pattern" });
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByLabelText("Set pattern colour white"));

    expect(props.onPatternColorChange).toHaveBeenCalledTimes(1);
    expect(props.onPatternColorChange).toHaveBeenCalledWith("white");
    expect(props.onBaseColorChange).not.toHaveBeenCalled();
  });

  it("clicking a label-mode button invokes onLabelModeChange with that mode", () => {
    const props = baseProps({ activeTab: "label" });
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByText("Nickname"));

    expect(props.onLabelModeChange).toHaveBeenCalledTimes(1);
    expect(props.onLabelModeChange).toHaveBeenCalledWith("name");
  });

  it("typing in the nickname field (labelMode=name) invokes onNameChange with the raw typed value", () => {
    const props = baseProps({
      activeTab: "label",
      value: { ...baseProps().value, labelMode: "name", name: "" },
    });
    render(<PlayerKitEditor {...props} />);

    fireEvent.change(screen.getByLabelText("Player nickname or display name"), { target: { value: "Dozer" } });

    expect(props.onNameChange).toHaveBeenCalledTimes(1);
    expect(props.onNameChange).toHaveBeenCalledWith("Dozer");
  });

  it("typing in the initials field (labelMode!=name) invokes onInitialsChange with the raw typed value", () => {
    const props = baseProps({
      activeTab: "label",
      value: { ...baseProps().value, labelMode: "initials", initials: "" },
    });
    render(<PlayerKitEditor {...props} />);

    fireEvent.change(screen.getByLabelText("Player initials"), { target: { value: "JD" } });

    expect(props.onInitialsChange).toHaveBeenCalledTimes(1);
    expect(props.onInitialsChange).toHaveBeenCalledWith("JD");
  });

  it("clicking the close button invokes onClose", () => {
    const props = baseProps();
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByLabelText("Close kit editor"));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking a tab invokes onTabChange with that tab's id (tab selection stays controlled by the parent)", () => {
    const props = baseProps({ activeTab: "base" });
    render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByText("Pattern"));

    expect(props.onTabChange).toHaveBeenCalledTimes(1);
    expect(props.onTabChange).toHaveBeenCalledWith("pattern");
  });
});

describe("PlayerKitEditor — pattern-set configurability (PR2A vs PR2B)", () => {
  it("Standard Slate's configuration renders exactly its existing four patterns, no more", () => {
    const props = baseProps({ activeTab: "pattern", allowedPatterns: SLATE_V1_PATTERNS });
    render(<PlayerKitEditor {...props} />);

    for (const pattern of SLATE_V1_PATTERNS) {
      expect(screen.getByText(PLAYER_KIT_PATTERN_LABEL[pattern])).toBeTruthy();
    }
    expect(screen.queryByText(PLAYER_KIT_PATTERN_LABEL.chestDash)).toBeNull();
    expect(screen.queryByText(PLAYER_KIT_PATTERN_LABEL.gradient)).toBeNull();
  });

  it("a full six-pattern configuration renders and can select every one of the six, with no code change to the component", () => {
    const props = baseProps({
      activeTab: "pattern",
      allowedPatterns: FULL_VISION_PATTERNS,
      value: { ...baseProps().value, pattern: "plain" },
    });
    render(<PlayerKitEditor {...props} />);

    for (const pattern of FULL_VISION_PATTERNS) {
      expect(screen.getByText(PLAYER_KIT_PATTERN_LABEL[pattern])).toBeTruthy();
    }

    fireEvent.click(screen.getByText(PLAYER_KIT_PATTERN_LABEL.chestDash));
    expect(props.onPatternChange).toHaveBeenCalledWith("chestDash");

    fireEvent.click(screen.getByText(PLAYER_KIT_PATTERN_LABEL.gradient));
    expect(props.onPatternChange).toHaveBeenCalledWith("gradient");
  });
});

describe("PlayerKitEditor — reflects current value / owns no state of its own", () => {
  it("marks the swatch matching value.baseColor as active, and only that one", () => {
    const props = baseProps({ activeTab: "base", value: { ...baseProps().value, baseColor: "red" } });
    render(<PlayerKitEditor {...props} />);

    const redSwatch = screen.getByLabelText("Set base colour red");
    const blueSwatch = screen.getByLabelText("Set base colour blue");
    expect(redSwatch.style.boxShadow).toContain("125, 211, 252");
    expect(blueSwatch.style.boxShadow).not.toContain("125, 211, 252");
  });

  it("does not maintain its own selection state — clicking a swatch fires the callback but the DOM still reflects the unchanged `value` prop until the parent re-renders it", () => {
    const props = baseProps({ activeTab: "base", value: { ...baseProps().value, baseColor: "blue" } });
    const { rerender } = render(<PlayerKitEditor {...props} />);

    fireEvent.click(screen.getByLabelText("Set base colour red"));
    expect(props.onBaseColorChange).toHaveBeenCalledWith("red");

    // No internal state changed anything: blue is still shown active because
    // we (the test, standing in for the parent) have not fed a new `value`
    // back in yet. A component that secretly owned selection state would
    // show red as active here instead.
    expect(screen.getByLabelText("Set base colour blue").style.boxShadow).toContain("125, 211, 252");
    expect(screen.getByLabelText("Set base colour red").style.boxShadow).not.toContain("125, 211, 252");

    // Only once the parent actually updates `value` does the active swatch move.
    rerender(<PlayerKitEditor {...props} value={{ ...props.value, baseColor: "red" }} />);
    expect(screen.getByLabelText("Set base colour red").style.boxShadow).toContain("125, 211, 252");
  });

  it("renders whatever `activeTab` it's given without needing its own tab state — the same instance shows a different tab purely from a prop change", () => {
    const props = baseProps({ activeTab: "base" });
    const { rerender } = render(<PlayerKitEditor {...props} />);
    expect(screen.queryByText("Plain")).toBeNull(); // pattern tab content not shown yet

    rerender(<PlayerKitEditor {...props} activeTab="pattern" />);
    expect(screen.getByText(PLAYER_KIT_PATTERN_LABEL.plain)).toBeTruthy();
  });
});

describe("PlayerKitEditor — title prop (PR2B revision 3 nested-panel back affordance)", () => {
  it("omitting `title` renders no back row, exactly as every existing caller (Standard Slate) already gets", () => {
    render(<PlayerKitEditor {...baseProps()} />);
    expect(screen.queryByRole("button", { name: /^Back from/ })).toBeNull();
  });

  it("passing `title` renders a '← <title>' back button that calls onClose, the same handler as the '×' button", () => {
    const props = baseProps({ title: "Our Team Kit" });
    render(<PlayerKitEditor {...props} />);

    const backButton = screen.getByLabelText("Back from Our Team Kit");
    expect(backButton.textContent).toBe("← Our Team Kit");

    fireEvent.click(backButton);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PlayerKitEditor — tabs prop (Game Timing team-kit configurability)", () => {
  it("omitting `tabs` renders all three tabs, exactly as every existing caller (Standard Slate) already gets", () => {
    render(<PlayerKitEditor {...baseProps({ activeTab: "base" })} />);
    expect(screen.getByText("Base")).toBeTruthy();
    expect(screen.getByText("Pattern")).toBeTruthy();
    expect(screen.getByText("Label")).toBeTruthy();
  });

  it("passing tabs=['base','pattern'] hides the Label tab entirely — no tab button, no way to reach its content", () => {
    render(<PlayerKitEditor {...baseProps({ activeTab: "base", tabs: ["base", "pattern"] })} />);
    expect(screen.getByText("Base")).toBeTruthy();
    expect(screen.getByText("Pattern")).toBeTruthy();
    expect(screen.queryByText("Label")).toBeNull();
  });

  it("a narrower tab set does not affect the callbacks the remaining tabs use", () => {
    const props = baseProps({ activeTab: "base", tabs: ["base", "pattern"] });
    render(<PlayerKitEditor {...props} />);
    fireEvent.click(screen.getByLabelText("Set base colour red"));
    expect(props.onBaseColorChange).toHaveBeenCalledWith("red");
  });
});
