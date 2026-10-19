// @vitest-environment jsdom
// Turnover card renders OUR TURNOVERS WON / OUR TURNOVERS LOST with the
// approved options, and every option taps with the existing stored tile
// value. Other families (Kickout included) render exactly as before.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProTaggerFamilyGrid } from "./ProTaggerFamilyGrid";

afterEach(() => {
  cleanup();
});

function renderGrid() {
  const onTileTap = vi.fn();
  render(<ProTaggerFamilyGrid sport="gaelic" awayTeamName="Na Fianna" onTileTap={onTileTap} />);
  return onTileTap;
}

describe("Turnover card — two clearly labelled sections", () => {
  it("shows OUR TURNOVERS WON and OUR TURNOVERS LOST, with the approved options", () => {
    renderGrid();
    const won = screen.getByText("OUR TURNOVERS WON").parentElement!;
    const lost = screen.getByText("OUR TURNOVERS LOST").parentElement!;
    expect(within(won).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Tackle", "Interception", "Opposition HP Error", "Opposition KP Error", "Opposition Overcarried",
    ]);
    expect(within(lost).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Dispossessed", "Intercepted", "HP Error", "KP Error", "Overcarried",
    ]);
  });

  it("no longer prefixes the error tiles with a team name", () => {
    renderGrid();
    expect(screen.queryByText(/^Home HP Error$/)).toBeNull();
    expect(screen.queryByText(/Na Fianna HP Error/)).toBeNull();
  });

  const TAPS: Array<[string, string, "FOR" | "OPP"]> = [
    ["OUR TURNOVERS WON: Tackle", "Tackle", "FOR"],
    ["OUR TURNOVERS WON: Interception", "Interception", "FOR"],
    ["OUR TURNOVERS WON: Opposition HP Error", "HP Error", "FOR"],
    ["OUR TURNOVERS WON: Opposition KP Error", "KP Error", "FOR"],
    ["OUR TURNOVERS WON: Opposition Overcarried", "Overcarried", "FOR"],
    ["OUR TURNOVERS LOST: Dispossessed", "Tackle", "OPP"],
    ["OUR TURNOVERS LOST: Intercepted", "Interception", "OPP"],
    ["OUR TURNOVERS LOST: HP Error", "HP Error", "OPP"],
    ["OUR TURNOVERS LOST: KP Error", "KP Error", "OPP"],
    ["OUR TURNOVERS LOST: Overcarried", "Overcarried", "OPP"],
  ];

  it.each(TAPS)("%s taps TURNOVER with stored value %s on the %s row", (name, stored, row) => {
    const onTileTap = renderGrid();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(onTileTap).toHaveBeenCalledTimes(1);
    expect(onTileTap).toHaveBeenCalledWith("TURNOVER", stored, row, undefined);
  });
});

describe("Other families are unchanged", () => {
  it("Kickout keeps its owner toggle, its opposition-name row label and its plain tiles", () => {
    const onTileTap = renderGrid();
    expect(screen.getByRole("button", { name: "OUR K/O" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "THEIR K/O" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Opposition Kickout Break" }));
    expect(onTileTap).toHaveBeenCalledWith("RESTART", "Break", "OPP", "FOR");
    // The opposition-name label still heads every non-Turnover OPP row.
    expect(screen.getAllByText("Na Fianna").length).toBeGreaterThan(1);
  });

  it("score families keep their opposition-row labels", () => {
    const onTileTap = renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Opposition Point Free" }));
    expect(onTileTap).toHaveBeenCalledWith("POINT", "Free", "OPP", undefined);
  });
});
