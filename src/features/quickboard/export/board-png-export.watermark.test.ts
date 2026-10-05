import { describe, expect, it } from "vitest";

import { BOARD_PNG_WATERMARK_COLOR, BOARD_PNG_WATERMARK_DARK_COLOR } from "./board-png-export";

describe("PNG export watermark colour", () => {
  it("keeps the standard light watermark as the default for every surface", () => {
    expect(BOARD_PNG_WATERMARK_COLOR).toBe("rgba(255, 255, 255, 0.42)");
  });

  it("the Whiteboard watermark is black at the same opacity", () => {
    expect(BOARD_PNG_WATERMARK_DARK_COLOR).toBe("rgba(0, 0, 0, 0.42)");
  });
});
