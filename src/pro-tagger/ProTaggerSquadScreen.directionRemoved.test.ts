// Mandatory 1H attacking-direction step: the 1H Attacking Direction controls
// move off Squad Setup onto a dedicated screen between Go To Game and live
// (see ProTaggerDirectionScreen.tsx, ProTaggerPage.tsx's "direction" phase).
// This frees Squad Setup's footer for the lineup above it, and this screen
// no longer owns the attackDirection choice at all — the outgoing session it
// hands to onStart carries whatever attackDirection was already on it
// unchanged; the direction screen is what finalises it before live.
//
// ProTaggerSquadScreen.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite scans the component's source text directly, the same way
// ProTaggerSquadScreen.nameEditorToggle.test.ts verifies presentational
// changes with no harness available. Comments are stripped before the
// "no longer present" checks so a comment documenting the removal (which
// legitimately names the removed API) can't produce a false failure.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerSquadScreen.tsx", import.meta.url)), "utf8");
const codeOnly = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ProTaggerSquadScreen — 1H Attacking Direction controls removed (moved to ProTaggerDirectionScreen)", () => {
  it("no longer declares attackDir state or imports/uses ProTaggerAttackDirection", () => {
    expect(codeOnly).not.toMatch(/useState<ProTaggerAttackDirection>/);
    expect(codeOnly).not.toMatch(/\bsetAttackDir\b/);
    expect(codeOnly).not.toMatch(/ProTaggerAttackDirection/);
  });

  it("no longer renders a '1H Attacking Direction' label or Left/Right direction chips in actual code", () => {
    expect(codeOnly).not.toMatch(/1H Attacking Direction/);
    expect(codeOnly).not.toMatch(/←\s*Left/);
    expect(codeOnly).not.toMatch(/Right\s*→/);
  });

  it("handleStart's outgoing session no longer sets attackDirection itself — the mandatory direction screen finalises it instead", () => {
    expect(codeOnly).not.toMatch(/attackDirection:\s*attackDir/);
  });

  it("does not replace the removed control with a different one — no new direction-shaped state was added", () => {
    expect(codeOnly).not.toMatch(/[Dd]irection.*useState|useState.*[Dd]irection/);
  });

  it("Go To Game (header + footer) is unchanged in count and still calls the same handleStart", () => {
    const goToGameText = codeOnly.match(/Go To Game/g) ?? [];
    expect(goToGameText.length).toBe(2);
    const handleStartCalls = source.match(/onClick=\{handleStart\}/g) ?? [];
    expect(handleStartCalls.length).toBe(2);
  });

  it("still mounts the read-only lineup formation and the Edit Player Names toggle — this pass didn't touch either", () => {
    expect(codeOnly).toMatch(/<ProTaggerLineupFormation/);
    expect(codeOnly).toMatch(/Edit Player Names/);
  });
});
