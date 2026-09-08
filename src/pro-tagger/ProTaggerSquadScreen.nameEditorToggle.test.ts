// Event Stats visual lineup (Squad Setup Option A): the existing player-name
// editor must stay collapsed by default behind an "Edit Player Names"
// toggle, and expanding it must reveal the SAME editor — not a second one.
//
// ProTaggerSquadScreen.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite scans the component's source text directly, the same way
// QuickReviewPage1.wording.test.ts verifies presentational text changes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerSquadScreen.tsx", import.meta.url)), "utf8");

describe("ProTaggerSquadScreen — Edit Player Names toggle (visual lineup Option A)", () => {
  it("the toggle defaults to collapsed", () => {
    expect(source).toMatch(/showNameEditor,\s*setShowNameEditor\]\s*=\s*useState\(false\)/);
  });

  it("has exactly one 'Edit Player Names' toggle control (JSX, not counting comments)", () => {
    const matches = source.match(/<span>Edit Player Names<\/span>/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("there is exactly one name-editing input (setName wired to onChange) — no second editor was created", () => {
    const matches = source.match(/setName\(activeTab, i, e\.target\.value\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("there is exactly one Add Player control", () => {
    const matches = source.match(/\+ Add Player/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("the name-editing list and Add Player control are both gated by the same showNameEditor toggle", () => {
    const gated = source.match(/\{showNameEditor && \(/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(1);
    // The existing row-mapping and Add Player control must appear after the
    // gate opens and before it's closed — a crude but effective ordering
    // check given there's no rendering harness to assert the real DOM tree.
    const gateIndex = source.indexOf("{showNameEditor && (");
    const rowsIndex = source.indexOf("{/* Player rows */}");
    const addPlayerIndex = source.indexOf("+ Add Player");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(rowsIndex).toBeGreaterThan(gateIndex);
    expect(addPlayerIndex).toBeGreaterThan(rowsIndex);
  });

  it("mounts the read-only ProTaggerLineupFormation summary, unconditionally (not behind the toggle)", () => {
    const formationIndex = source.indexOf("<ProTaggerLineupFormation");
    const gateIndex = source.indexOf("{showNameEditor && (");
    expect(formationIndex).toBeGreaterThan(-1);
    expect(formationIndex).toBeLessThan(gateIndex);
  });
});
