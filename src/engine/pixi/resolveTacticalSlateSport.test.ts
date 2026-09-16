import { describe, expect, it } from "vitest";

import { resolveTacticalSlateSport } from "./createTacticalPadLiteSurface";

describe("resolveTacticalSlateSport", () => {
  it("defaults to gaelic when no sport is supplied (public Slate behaviour)", () => {
    expect(resolveTacticalSlateSport(undefined)).toBe("gaelic");
  });

  it("passes through an explicit sport unchanged", () => {
    expect(resolveTacticalSlateSport("rugby")).toBe("rugby");
    expect(resolveTacticalSlateSport("gaelic")).toBe("gaelic");
    expect(resolveTacticalSlateSport("soccer")).toBe("soccer");
  });
});
