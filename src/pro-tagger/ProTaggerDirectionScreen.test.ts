// Mandatory 1H attacking-direction step: Squad Setup -> Go To Game now lands
// here instead of the live screen directly (see ProTaggerPage.tsx's
// "direction" phase). This screen's only job is to let the user choose LEFT
// or RIGHT — the choice itself is the confirmation, no second step.
//
// ProTaggerDirectionScreen.tsx has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so this suite scans the component's source text directly, the same way
// ProTaggerSquadScreen.nameEditorToggle.test.ts verifies presentational/
// wiring changes with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerDirectionScreen.tsx", import.meta.url)), "utf8");
// Strips `//` line comments so the "no reference to X" check below matches
// actual code, not documentation prose that legitimately names the API this
// file deliberately does NOT import/use (e.g. explaining why it doesn't
// touch ProTaggerLiveScreen).
const codeOnly = source.replace(/\/\/.*$/gm, "");

describe("ProTaggerDirectionScreen — mandatory 1H attacking-direction step", () => {
  it("shows the 1H context: a heading and the 'which way' question", () => {
    expect(source).toMatch(/1H Attacking Direction/);
    expect(source).toMatch(/Which way are we attacking in the 1st half\?/);
  });

  it("shows exactly two direction choices: LEFT and RIGHT", () => {
    expect(source).toMatch(/>LEFT<\/span>/);
    expect(source).toMatch(/>RIGHT<\/span>/);
  });

  it("choosing LEFT calls onChoose with the canonical \"left\" value; RIGHT with \"right\" — the same ProTaggerAttackDirection values the rest of the app already uses", () => {
    expect(source).toMatch(/onClick=\{\(\) => onChoose\("left"\)\}/);
    expect(source).toMatch(/onClick=\{\(\) => onChoose\("right"\)\}/);
  });

  it("imports the existing ProTaggerAttackDirection type rather than inventing a new direction value shape", () => {
    expect(source).toMatch(/import type \{ ProTaggerAttackDirection \} from "\.\/pro-tagger-session"/);
    expect(source).toMatch(/direction: ProTaggerAttackDirection/);
  });

  it("has a Back action wired to the onBack prop, with no other navigation control", () => {
    expect(source).toMatch(/onClick=\{onBack\}/);
    expect(source).toMatch(/← Back/);
  });

  it("the direction button press is the only confirmation — no separate Continue/Confirm step in actual code", () => {
    expect(codeOnly).not.toMatch(/Continue/);
    expect(codeOnly).not.toMatch(/Confirm/i);
  });

  it("takes no extra setup fields — only onBack and onChoose props", () => {
    const propsMatch = source.match(/interface Props \{([\s\S]*?)\}/);
    expect(propsMatch).not.toBeNull();
    const propNames = [...propsMatch![1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(propNames.sort()).toEqual(["onBack", "onChoose"]);
  });

  it("does not reference the live screen, a match clock, or a Start control in actual code — this is a pure direction-choice screen", () => {
    expect(codeOnly).not.toMatch(/ProTaggerLiveScreen/);
    expect(codeOnly).not.toMatch(/\bStart\b/);
    expect(codeOnly).not.toMatch(/clock/i);
  });
});
