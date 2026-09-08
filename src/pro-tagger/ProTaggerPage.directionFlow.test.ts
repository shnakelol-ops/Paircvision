// Mandatory 1H attacking-direction step wiring: Squad Setup's "Go To Game"
// must no longer navigate directly into the live screen — it must pass
// through a dedicated "direction" phase first (ProTaggerDirectionScreen),
// which is the only place (besides resuming an already in-progress match)
// that ever advances the app to "live". This is a MOVE of the existing
// attackDirection choice, not new direction logic — see
// ProTaggerSquadScreen.tsx (control removed) and ProTaggerDirectionScreen.tsx
// (control now lives there), both of which set/read the same
// session.attackDirection field ProTaggerLiveScreen.tsx has always consumed.
//
// ProTaggerPage.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite scans the component's source text directly, the same way
// ProTaggerSquadScreen.nameEditorToggle.test.ts verifies phase-transition
// wiring with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerPage.tsx", import.meta.url)), "utf8");

function extractPhaseBlock(phaseCheck: string): string {
  const pattern = new RegExp(`if \\(${phaseCheck}\\) \\{([\\s\\S]*?)\\n  \\}`);
  const match = source.match(pattern);
  expect(match, `expected to find an "if (${phaseCheck})" block`).not.toBeNull();
  return match![1];
}

describe("ProTaggerPage — mandatory 1H attacking-direction step wiring", () => {
  it("the phase enum includes a 'direction' phase between 'squads' and 'live'", () => {
    expect(source).toMatch(/type AppPhase = "home" \| "setup" \| "squads" \| "direction" \| "live" \|/);
  });

  it("renders ProTaggerDirectionScreen for the 'direction' phase", () => {
    expect(source).toMatch(/import \{ ProTaggerDirectionScreen \} from "\.\/ProTaggerDirectionScreen"/);
    const block = extractPhaseBlock('phase === "direction" && draftSession');
    expect(block).toMatch(/<ProTaggerDirectionScreen/);
  });

  it("pressing Go To Game (the squads screen's onStart) advances to 'direction', not directly to 'live'", () => {
    const block = extractPhaseBlock('phase === "squads" && draftSession');
    expect(block).toMatch(/onStart=\{\(finalSession\) => \{[\s\S]*?setPhase\("direction"\);/);
    expect(block).not.toMatch(/setPhase\("live"\)/);
  });

  it("the squads phase itself never sets attackDirection — that only happens once the user reaches the direction screen", () => {
    const block = extractPhaseBlock('phase === "squads" && draftSession');
    expect(block).not.toMatch(/attackDirection/);
  });

  it("choosing a direction sets session.attackDirection to the chosen value and advances to 'live'", () => {
    const block = extractPhaseBlock('phase === "direction" && draftSession');
    expect(block).toMatch(/onChoose=\{\(direction\) => \{/);
    expect(block).toMatch(/attackDirection:\s*direction/);
    expect(block).toMatch(/setPhase\("live"\)/);
  });

  it("Back from the direction screen returns to 'squads' (not 'setup' or 'home'), preserving the already-merged squad session", () => {
    const block = extractPhaseBlock('phase === "direction" && draftSession');
    expect(block).toMatch(/onBack=\{\(\) => setPhase\("squads"\)\}/);
  });

  it("choosing a direction preserves the rest of draftSession via a spread — home/away squads, colours, and names are untouched", () => {
    const block = extractPhaseBlock('phase === "direction" && draftSession');
    expect(block).toMatch(/\{\s*\.\.\.prev,\s*attackDirection:\s*direction\s*\}/);
  });

  it("exactly two places ever advance the app to 'live': resuming an in-progress match, and the direction screen's onChoose — there is no direct squads -> live jump", () => {
    const liveTransitions = source.match(/setPhase\("live"\)/g) ?? [];
    expect(liveTransitions).toHaveLength(2);
  });

  it("does not add a new persisted flag (e.g. directionConfirmed / hasChosenDirection / setupComplete) to gate the transition", () => {
    expect(source).not.toMatch(/directionConfirmed/);
    expect(source).not.toMatch(/hasChosenDirection/);
    expect(source).not.toMatch(/setupComplete/);
  });
});
