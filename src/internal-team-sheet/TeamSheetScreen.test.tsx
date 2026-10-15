// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import TeamSheetScreen from "./TeamSheetScreen";
import { OUTFIELD_JERSEYS } from "./team-sheet-jersey";
import { loadTeamSheet } from "./team-sheet-storage";

const GK_SRC = "/internal/ballylanders-gk-jersey.webp";
const srcOf = (id: string) => OUTFIELD_JERSEYS.find((j) => j.id === id)!.src;

function pitchJerseySrcs(): string[] {
  return screen
    .getAllByAltText(/^#\d+ jersey$/)
    .map((img) => img.getAttribute("src") ?? "");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Team Sheet jersey selector", () => {
  it("offers the three outfield jerseys with yellow selected by default", () => {
    render(<TeamSheetScreen />);
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual(["Yellow", "Green", "White"]);
    expect(screen.getByRole("radio", { name: "Yellow" }).getAttribute("aria-checked")).toBe("true");
  });

  it("switches all 14 outfield players at once and keeps the black GK jersey", () => {
    render(<TeamSheetScreen />);
    for (const id of ["green", "white", "yellow"]) {
      fireEvent.click(screen.getByRole("radio", { name: OUTFIELD_JERSEYS.find((j) => j.id === id)!.label }));
      const srcs = pitchJerseySrcs();
      expect(srcs).toHaveLength(15);
      expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
      expect(srcs.filter((s) => s === srcOf(id))).toHaveLength(14);
    }
  });

  it("applies the selected jersey to outfield substitutes too", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "White" }));
    fireEvent.click(screen.getByText("+ Add Subs"));
    expect(pitchJerseySrcs().filter((s) => s === srcOf("white"))).toHaveLength(15);
  });

  it("hides the selector in Screenshot Mode but keeps the chosen jersey", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Green" }));
    fireEvent.click(screen.getByText("Screenshot Mode"));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(pitchJerseySrcs().filter((s) => s === srcOf("green"))).toHaveLength(14);
  });

  it("persists the selection so reopening the team sheet restores it", () => {
    const first = render(<TeamSheetScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "White" }));
    expect(loadTeamSheet().outfieldJersey).toBe("white");
    first.unmount();

    render(<TeamSheetScreen />);
    expect(screen.getByRole("radio", { name: "White" }).getAttribute("aria-checked")).toBe("true");
    expect(pitchJerseySrcs().filter((s) => s === srcOf("white"))).toHaveLength(14);
  });
});
