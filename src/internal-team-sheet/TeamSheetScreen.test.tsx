// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import TeamSheetScreen from "./TeamSheetScreen";
import { PRESET_KITS } from "./team-sheet-kits";
import { loadTeamSheet } from "./team-sheet-storage";
import { TEAM_SHEET_KITS_STORAGE_KEY } from "./team-sheet-kit-store";

const KEY = "paircvision_internal_team_sheet_v1";
const GK_SRC = "/internal/ballylanders-gk-jersey.webp";
const srcOf = (name: string) => PRESET_KITS.find((k) => k.role === "outfield" && k.name === name)!.src!;

function pitchJerseySrcs(): string[] {
  return screen.getAllByAltText(/^#\d+ jersey$/).map((img) => img.getAttribute("src") ?? "");
}
const outfieldPicker = () => screen.getByRole("radiogroup", { name: "Outfield jersey" });
const gkPicker = () => screen.getByRole("radiogroup", { name: "Goalkeeper jersey" });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Team Sheet kit selection", () => {
  it("renders the team name and the yellow/black defaults", () => {
    render(<TeamSheetScreen />);
    expect(screen.getByText("Ballylanders")).toBeTruthy();
    expect(within(outfieldPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Yellow", "Green", "White"]);
    expect(within(outfieldPicker()).getByRole("radio", { name: "Yellow" }).getAttribute("aria-checked")).toBe("true");
    expect(within(gkPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Black"]);
    expect(within(gkPicker()).getByRole("radio", { name: "Black" }).getAttribute("aria-checked")).toBe("true");
    const srcs = pitchJerseySrcs();
    expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
    expect(srcs.filter((s) => s === srcOf("Yellow"))).toHaveLength(14);
  });

  it("switches all 14 outfield players at once and leaves the GK kit alone", () => {
    render(<TeamSheetScreen />);
    for (const name of ["Green", "White", "Yellow"]) {
      fireEvent.click(within(outfieldPicker()).getByRole("radio", { name }));
      const srcs = pitchJerseySrcs();
      expect(srcs).toHaveLength(15);
      expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
      expect(srcs.filter((s) => s === srcOf(name))).toHaveLength(14);
    }
  });

  it("applies the selected kits to substitutes (#1 sub gets the GK kit)", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "White" }));
    fireEvent.click(screen.getByText("+ Add Subs"));
    expect(pitchJerseySrcs().filter((s) => s === srcOf("White"))).toHaveLength(15);
    fireEvent.change(screen.getByDisplayValue("16"), { target: { value: "1" } });
    expect(pitchJerseySrcs().filter((s) => s === GK_SRC)).toHaveLength(2);
  });

  it("hides both pickers in Screenshot Mode but keeps the chosen kits", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "Green" }));
    fireEvent.click(screen.getByText("Screenshot Mode"));
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Green"))).toHaveLength(14);
    expect(pitchJerseySrcs().filter((s) => s === GK_SRC)).toHaveLength(1);
  });

  it("persists kit ids and team identity so reopening restores them", () => {
    const first = render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "White" }));
    expect(loadTeamSheet().kits).toEqual({ outfieldKitId: "preset:ballylanders-white", gkKitId: "preset:ballylanders-gk-black" });
    expect(loadTeamSheet().team).toEqual({ id: "ballylanders", name: "Ballylanders" });
    first.unmount();

    render(<TeamSheetScreen />);
    expect(within(outfieldPicker()).getByRole("radio", { name: "White" }).getAttribute("aria-checked")).toBe("true");
    expect(pitchJerseySrcs().filter((s) => s === srcOf("White"))).toHaveLength(14);
  });

  it("opens a sheet saved by the previous jersey selector with the same jersey", () => {
    const players = loadTeamSheet().players;
    window.localStorage.setItem(KEY, JSON.stringify({ players, substitutes: [], outfieldJersey: "green" }));
    render(<TeamSheetScreen />);
    expect(within(outfieldPicker()).getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Green"))).toHaveLength(14);
  });

  it("falls back to the default presets when a selected user kit is missing", () => {
    const players = loadTeamSheet().players;
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players, substitutes: [], kits: { outfieldKitId: "user:gone", gkKitId: "user:gone-too" } }),
    );
    render(<TeamSheetScreen />);
    const srcs = pitchJerseySrcs();
    expect(srcs.filter((s) => s === srcOf("Yellow"))).toHaveLength(14);
    expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
  });

  it("lists saved user kit metadata in the right picker for the team", () => {
    window.localStorage.setItem(
      TEAM_SHEET_KITS_STORAGE_KEY,
      JSON.stringify([
        { id: "user:gk2", teamId: "ballylanders", name: "Green GK", role: "gk", createdAt: 1 },
        { id: "user:other", teamId: "another-club", name: "Other", role: "outfield", createdAt: 1 },
      ]),
    );
    render(<TeamSheetScreen />);
    expect(within(gkPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Black", "Green GK"]);
    expect(within(outfieldPicker()).getAllByRole("radio")).toHaveLength(3);
  });
});
