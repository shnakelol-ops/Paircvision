// Live player-picker jersey-number legibility pass: real Android
// screenshots showed double-digit numbers (10-15 especially) reading
// soft/blurry. Root cause traced to ProTaggerLineupJerseyTile.tsx's default
// number outline (a 0.75px WebkitTextStroke plus a 5-layer text-shadow
// stack — four hard 1px-offset diagonal copies plus one blurred shadow),
// which at the picker's small 13px number size adds up to nearly as much
// dark "ink" as a thin numeral's own stroke width (the "1" in 10/11/13/14/
// 15 especially).
//
// Fix: a new optional numberCrisp prop on the shared tile (default
// preserves the exact existing outline — Squad Setup passes nothing and is
// unaffected) plus a 1px number-size bump (13 -> 14, picker-local). This is
// a pure text-rendering change: no transform:scale, no filter/blur, no
// change to jersey size, formation, pitch, hit areas, or any live-capture
// semantics.
//
// Neither ProTaggerPlayerPicker.tsx nor ProTaggerLineupJerseyTile.tsx has a
// React rendering harness in this repo, so — as with every other
// presentational/wiring suite this session — this exercises the exact
// change by reading it out of both files' own source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pickerSource = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
const tileSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");
const pickerCodeOnly = pickerSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ProTaggerPlayerPicker — number size bumped by exactly 1px (not a big jump)", () => {
  it("formation and bench number size are both 14 (up from 13)", () => {
    expect(pickerSource).toMatch(/FORMATION_NUMBER_FONT_SIZE = 14/);
    expect(pickerSource).toMatch(/BENCH_NUMBER_FONT_SIZE = 14/);
  });

  it("jersey size is completely unchanged by this pass", () => {
    expect(pickerSource).toMatch(/FORMATION_JERSEY_SIZE = 26/);
    expect(pickerSource).toMatch(/BENCH_JERSEY_SIZE = 22/);
  });
});

describe("ProTaggerPlayerPicker — opts into the lighter numberCrisp outline", () => {
  it("both formation and bench tiles pass numberCrisp", () => {
    const jerseyTileCalls = pickerSource.match(/<ProTaggerLineupJerseyTile[\s\S]*?\/>/g) ?? [];
    expect(jerseyTileCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of jerseyTileCalls) {
      expect(call).toMatch(/numberCrisp/);
    }
  });
});

describe("ProTaggerLineupJerseyTile — numberCrisp is additive and default-preserving", () => {
  it("numberCrisp is optional and Squad Setup's default outline is untouched when omitted", () => {
    expect(tileSource).toMatch(/numberCrisp\?:\s*boolean/);
    expect(tileSource).toMatch(/numberCrisp \? S\.numberOutlineCrisp : S\.numberOutlineDefault/);
  });

  it("the default outline still has the exact same values as before this pass (0.75px stroke, 5-layer shadow)", () => {
    const defaultBlock = tileSource.match(/numberOutlineDefault:\s*\{([\s\S]*?)\n {2}\},/)![1];
    expect(defaultBlock).toMatch(/WebkitTextStroke:\s*["']0\.75px rgba\(6, 10, 16, 0\.9\)["']/);
    expect(defaultBlock).toMatch(/0 1px 1px rgba\(0,0,0,0\.6\)/);
    expect(defaultBlock).toMatch(/-1px -1px 0 rgba\(6,10,16,0\.8\)/);
    expect(defaultBlock).toMatch(/1px -1px 0 rgba\(6,10,16,0\.8\)/);
    expect(defaultBlock).toMatch(/-1px 1px 0 rgba\(6,10,16,0\.8\)/);
    expect(defaultBlock).toMatch(/1px 1px 0 rgba\(6,10,16,0\.8\)/);
  });

  it("the crisp outline is genuinely lighter: a thinner stroke and a single shadow, not the 5-layer stack", () => {
    const crispBlock = tileSource.match(/numberOutlineCrisp:\s*\{([\s\S]*?)\n {2}\},/)![1];
    const strokeMatch = crispBlock.match(/WebkitTextStroke:\s*["'](\d+(?:\.\d+)?)px/);
    expect(strokeMatch).not.toBeNull();
    expect(Number(strokeMatch![1])).toBeLessThan(0.75);

    const shadowMatch = crispBlock.match(/textShadow:\s*["']([^"']+)["']/);
    expect(shadowMatch).not.toBeNull();
    // A single "offset offset blur colour" shadow, not a comma-joined stack.
    expect(shadowMatch![1].split(",").length).toBeLessThanOrEqual(1 + 3); // "0 1px 1px rgba(...)" itself contains no top-level commas outside rgba()
    expect(crispBlock).not.toMatch(/-1px -1px 0/); // none of the four hard diagonal copies
  });

  it("no transform: scale(), filter blur, or animation was introduced anywhere in the tile", () => {
    expect(tileSource).not.toMatch(/transform:\s*["']scale/);
    expect(tileSource).not.toMatch(/filter:\s*["'][^"']*blur/);
    expect(tileSource).not.toMatch(/animation/i);
  });

  it("the number's centring transform and vertical position are unchanged — this pass is text-rendering only, not repositioning", () => {
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?top:\s*["']56%["']/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?transform:\s*["']translate\(-50%, -50%\)["']/);
  });

  it("font weight is unchanged (already at maximum, not the cause, not touched)", () => {
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?fontWeight:\s*900/);
  });
});

describe("ProTaggerPlayerPicker — every other approved element is unaffected by this legibility pass", () => {
  it("formation coordinates (FORMATION_ROWS) are byte-identical", () => {
    expect(pickerSource).toMatch(/\[1\],\s*\/\/ #1  GK/);
    expect(pickerSource).toMatch(/\[2, 3, 4\],/);
    expect(pickerSource).toMatch(/\[5, 6, 7\],/);
    expect(pickerSource).toMatch(/\[8, 9\],/);
    expect(pickerSource).toMatch(/\[10, 11, 12\],/);
    expect(pickerSource).toMatch(/\[13, 14, 15\],/);
  });

  it("the static pitch background is still present and reused unmodified", () => {
    expect(pickerSource).toMatch(/import \{ ProTaggerLineupPitchBackground \} from ".\/ProTaggerLineupPitchBackground"/);
    expect(pickerSource).toMatch(/<ProTaggerLineupPitchBackground \/>/);
  });

  it("player hit-area (playerBtn/subBtn) dimensions are unchanged", () => {
    const playerBtnBlock = pickerSource.match(/playerBtn:\s*\{([^}]*)\}/)![1];
    expect(playerBtnBlock).toMatch(/width:\s*80/);
    expect(playerBtnBlock).toMatch(/minHeight:\s*64/);
    const subBtnBlock = pickerSource.match(/subBtn:\s*\{([^}]*)\}/)![1];
    expect(subBtnBlock).toMatch(/width:\s*80/);
    expect(subBtnBlock).toMatch(/minHeight:\s*58/);
  });

  it("player names still render via the reused tile (no separate name treatment introduced)", () => {
    expect(pickerCodeOnly).not.toMatch(/style=\{S\.name\}/);
    expect(pickerCodeOnly).toMatch(/const tilePlayer = status \? \{ \.\.\.p, name: "" \} : p;/);
  });

  it("position abbreviations remain absent", () => {
    expect(pickerCodeOnly).not.toMatch(/p\.position/);
  });

  it("team colour props passed to the tile are unchanged (colour, secondaryColour ?? \"#ffffff\")", () => {
    expect(pickerSource).toMatch(/primary=\{colour\}/);
    expect(pickerSource).toMatch(/secondary=\{secondaryColour \?\? "#ffffff"\}/);
  });

  it("RED/SIN_BIN discipline presentation and disabled wiring are unchanged", () => {
    expect(pickerSource).toMatch(/status === "RED" && <span style=\{S\.statusRed\}>RED<\/span>/);
    expect(pickerSource).toMatch(/status === "SIN_BIN" && <span style=\{S\.statusSinBin\}>SIN BIN<\/span>/);
    expect(pickerSource).toMatch(/disabled=\{isRed\}/);
  });

  it("tap()/onSelect and No player/Unknown are unchanged", () => {
    expect(pickerSource).toMatch(/function tap\(p: ProTaggerSquadPlayer\) \{/);
    expect(pickerSource).toMatch(/if \(disciplineStatus\?\.get\(p\.id\) === "RED"\) return;/);
    expect(pickerSource).toMatch(/onSelect\(\{\s*playerId:\s*p\.id,\s*playerName:\s*p\.name\.trim\(\) \|\| `#\$\{p\.number\}`,\s*playerNumber:\s*p\.number,\s*squadId,\s*\}\);/);
    expect(pickerSource).toMatch(/onClick=\{\(\) => onSelect\(null\)\}/);
    expect(pickerSource).toMatch(/No player \/ Unknown/);
  });

  it("findSlot/bench live-player derivation is unchanged", () => {
    expect(pickerSource).toMatch(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{/);
    expect(pickerSource).toMatch(/return squad\.find\(\(p\) => p\.activeSlot === slot && p\.isActive !== false\) \?\? null;/);
    expect(pickerSource).toMatch(/const bench = squad\.filter\(\(p\) => p\.isActive !== false && p\.activeSlot === undefined\);/);
  });
});

describe("ProTaggerPlayerPicker — one- and two-digit numbers both still render through the same code path", () => {
  const numbersToCheck = [1, 8, 10, 11, 12, 13, 14, 15];
  it.each(numbersToCheck)("number %i has no per-digit-count special casing anywhere", (num) => {
    const digits = String(num);
    expect(digits.length === 1 || digits.length === 2).toBe(true);
    expect(pickerCodeOnly).not.toMatch(/digits?\.length/i);
    expect(tileSource).not.toMatch(/digits?\.length/i);
  });
});
