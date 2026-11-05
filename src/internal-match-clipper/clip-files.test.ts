import { describe, expect, it } from "vitest";
import { clipFilename, safeFilename } from "./clip-files";
import type { ClipSelection } from "./clip-types";

describe("clip file names", () => {
  it("keeps names readable but ASCII-safe", () => {
    expect(safeFilename("Score · 25:29")).toBe("Score - 25-29");
    expect(safeFilename("Seán Ó Briain — point")).toBe("Sean O Briain - point");
    expect(safeFilename("  ../../etc  ")).toBe("etc");
    expect(safeFilename("··")).toBe("");
  });
  it("numbers clips by their position", () => {
    const clip = { name: "Score · 25:29" } as ClipSelection;
    expect(clipFilename(0, clip)).toBe("01 Score - 25-29.mp4");
    expect(clipFilename(11, { name: "·" } as ClipSelection)).toBe("12 Clip.mp4");
  });
});
