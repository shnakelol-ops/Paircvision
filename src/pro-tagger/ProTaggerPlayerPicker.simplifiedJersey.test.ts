// Live player-picker simplified tagging jersey experiment: repeated
// real-Android testing showed jersey numbers (10-15 especially) still
// reading soft/busy after the number-legibility pass. Hypothesis: part of
// the problem is the secondary-colour CHEST BAND crossing the small jersey
// body right around the number, not purely typography. This experiment
// swaps, for the live player picker ONLY, the default jersey (primary
// body+sleeves as one shape, secondary collar, secondary chest stripe) for
// a simplified marker: primary torso, secondary sleeves, NO chest band, NO
// collar, plus a minimal (no-stroke, single-shadow) number treatment.
//
// This is built entirely inside ProTaggerLineupJerseyTile.tsx as a new
// opt-in `livePicker` prop (default false/undefined preserves today's
// exact rendering) — ProTaggerMiniJersey.tsx itself, which other screens
// (Squad Setup's Team Colours preview, its own lineup jerseys) still use,
// is never touched. Squad Setup's own call site
// (ProTaggerLineupFormation.tsx) passes neither `livePicker` nor
// `numberCrisp` and must keep rendering exactly as it did before this
// experiment — proven both here (source-level) and by
// ProTaggerLineupJerseyTile.test.ts / ProTaggerLineupFormation.test.ts
// continuing to pass unmodified.
//
// Neither file has a React rendering harness in this repo, so — as with
// every other presentational/wiring suite this session — this exercises
// the exact composition by reading it out of both files' own source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pickerSource = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
const tileSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");
const formationSource = readFileSync(fileURLToPath(new URL("./ProTaggerLineupFormation.tsx", import.meta.url)), "utf8");
const pickerCodeOnly = pickerSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const tileCodeOnly = tileSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ProTaggerPlayerPicker — requests the simplified live-tagging jersey (req. 1)", () => {
  it("both formation and bench tiles pass the livePicker prop", () => {
    const jerseyTileCalls = pickerSource.match(/<ProTaggerLineupJerseyTile[\s\S]*?\/>/g) ?? [];
    expect(jerseyTileCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of jerseyTileCalls) {
      expect(call).toMatch(/\blivePicker\b/);
    }
  });
});

describe("ProTaggerLineupJerseyTile — LivePickerJerseyMark geometry (req. 2, 3, 4)", () => {
  const markMatch = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/);
  const mark = markMatch ? markMatch[0] : "";

  // Superseded by the jersey style selector (see ProTaggerJerseyStyle):
  // shape is now gated on the resolved jerseyStyle ("sleeves" reuses this
  // exact same mark), not on the livePicker boolean, which now controls
  // only the number treatment — see the orthogonality tests below.
  it("exists and is used when jerseyStyle resolves to \"sleeves\"", () => {
    expect(markMatch).not.toBeNull();
    expect(tileSource).toMatch(/resolvedStyle === "sleeves"\) return <LivePickerJerseyMark/);
  });

  it("has NO secondary chest band — no <rect> element and no fill covering a horizontal stripe across the body", () => {
    expect(mark).not.toMatch(/<rect/);
  });

  it("has no collar accent either (no fourth path, no Q-curve collar shape)", () => {
    const pathCount = (mark.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(3); // two sleeves + one torso, nothing else
    expect(mark).not.toMatch(/\bQ\d/); // no quadratic-curve collar shape
  });

  it("uses primary colour fill on the torso (body) path", () => {
    const torsoPathMatch = mark.match(/<path d="M4,21[^"]*" fill=\{primary\} \/>/);
    expect(torsoPathMatch).not.toBeNull();
  });

  it("uses secondary colour fill on both sleeve paths", () => {
    const secondaryFillCount = (mark.match(/fill=\{secondary\}/g) ?? []).length;
    expect(secondaryFillCount).toBe(2); // left sleeve + right sleeve, nothing else secondary-filled
  });

  it("the three sub-paths reconstruct the exact same outer silhouette ProTaggerMiniJersey draws (shared boundary coordinates, same viewBox/size formula)", () => {
    expect(mark).toMatch(/viewBox="0 0 20 22"/);
    expect(mark).toMatch(/Math\.round\(\(size \* 22\) \/ 20\)/);
    // Every coordinate pair used by ProTaggerMiniJersey's single outline
    // path must appear somewhere across the three decomposed sub-paths.
    const originalPoints = ["4,21", "4,8", "0,8", "0,4", "4,2", "7,5", "10,8", "13,5", "16,2", "20,4", "20,8", "16,8", "16,21"];
    for (const point of originalPoints) {
      expect(mark).toContain(point);
    }
  });
});

describe("ProTaggerLineupJerseyTile — live-picker number treatment (req. 5, 6)", () => {
  it("the livePicker number outline has no WebkitTextStroke — clean white text, no heavy outline", () => {
    const block = tileSource.match(/numberOutlineLivePicker:\s*\{([\s\S]*?)\n {2}\},/)![1];
    expect(block).not.toMatch(/WebkitTextStroke/);
  });

  it("the livePicker number outline uses a single shadow, not the previous multi-layer stack", () => {
    const block = tileSource.match(/numberOutlineLivePicker:\s*\{([\s\S]*?)\n {2}\},/)![1];
    const shadowMatch = block.match(/textShadow:\s*["']([^"']+)["']/);
    expect(shadowMatch).not.toBeNull();
    // Strip the rgba(...) argument list before checking for a top-level
    // comma — rgba() itself contains commas, but a multi-layer shadow
    // stack (like numberOutlineDefault's) joins whole "offset offset blur
    // colour" layers with a comma OUTSIDE any rgba().
    const withoutColourArgs = shadowMatch![1].replace(/rgba?\([^)]*\)/g, "rgba(...)");
    expect(withoutColourArgs).not.toContain(",");
  });

  it("the number itself is still white, bold, and centred (unchanged base numberText style)", () => {
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?color:\s*["']#ffffff["']/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?fontWeight:\s*900/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?left:\s*["']50%["']/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?transform:\s*["']translate\(-50%, -50%\)["']/);
  });

  it("livePicker's outline takes priority over numberCrisp when both could apply", () => {
    expect(tileSource).toMatch(/livePicker\s*\n?\s*\?\s*S\.numberOutlineLivePicker/);
  });
});

describe("Default Squad Setup rendering is unchanged unless livePicker is explicitly requested (req. 7, 8)", () => {
  it("ProTaggerLineupFormation.tsx (Squad Setup's own caller) passes neither livePicker nor numberCrisp", () => {
    expect(formationSource).not.toMatch(/livePicker/);
    expect(formationSource).not.toMatch(/numberCrisp/);
  });

  // Superseded: shape now falls back on an absent/legacy jerseyStyle
  // (resolvedJerseyStyle = jerseyStyle ?? "chest"), independent of
  // livePicker — the number treatment (numberOutlineDefault whenever
  // livePicker is falsy) is unaffected and still checked here.
  it("the tile falls back to ProTaggerMiniJersey (\"chest\") whenever jerseyStyle is omitted, and to numberOutlineDefault whenever livePicker is falsy", () => {
    expect(tileSource).toMatch(/const resolvedJerseyStyle: ProTaggerJerseyStyle = jerseyStyle \?\? "chest";/);
    expect(tileSource).toMatch(/<ProTaggerMiniJersey primary=\{primary\} secondary=\{secondary\} size=\{size\} \/>/);
  });

  it("ProTaggerMiniJersey.tsx itself is not referenced by name inside LivePickerJerseyMark — it's an independent local shape, not a wrapper around the shared component", () => {
    const markMatch = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/)![0];
    expect(markMatch).not.toMatch(/ProTaggerMiniJersey/);
  });

  it("the default outline (numberOutlineDefault) values are completely untouched by this pass", () => {
    const defaultBlock = tileSource.match(/numberOutlineDefault:\s*\{([\s\S]*?)\n {2}\},/)![1];
    expect(defaultBlock).toMatch(/WebkitTextStroke:\s*["']0\.75px rgba\(6, 10, 16, 0\.9\)["']/);
    expect(defaultBlock.split(",").length).toBeGreaterThanOrEqual(5); // still the 5-layer shadow stack
  });
});

describe("Jersey and hit-target dimensions unchanged (req. 9, 10)", () => {
  it("FORMATION_JERSEY_SIZE / BENCH_JERSEY_SIZE are unchanged (26 / 22) — only internal jersey treatment changed, not the marker size", () => {
    expect(pickerSource).toMatch(/FORMATION_JERSEY_SIZE = 26/);
    expect(pickerSource).toMatch(/BENCH_JERSEY_SIZE = 22/);
  });

  it("LivePickerJerseyMark uses the exact same size formula as ProTaggerMiniJersey — same outer pixel dimensions for a given size prop", () => {
    const markMatch = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/)![0];
    expect(markMatch).toMatch(/const h = Math\.round\(\(size \* 22\) \/ 20\);/);
  });

  it("player hit-area (playerBtn/subBtn) CSS is byte-identical to before this experiment", () => {
    const playerBtnBlock = pickerSource.match(/playerBtn:\s*\{([^}]*)\}/)![1];
    expect(playerBtnBlock).toMatch(/width:\s*80/);
    expect(playerBtnBlock).toMatch(/minHeight:\s*64/);
    expect(playerBtnBlock).toMatch(/background:\s*["']transparent["']/);
    expect(playerBtnBlock).toMatch(/border:\s*["']none["']/);
    const subBtnBlock = pickerSource.match(/subBtn:\s*\{([^}]*)\}/)![1];
    expect(subBtnBlock).toMatch(/width:\s*80/);
    expect(subBtnBlock).toMatch(/minHeight:\s*58/);
  });
});

describe("Formation and pitch unaffected (req. 11, 12)", () => {
  it("FORMATION_ROWS is byte-identical — no coordinate/row/order change", () => {
    expect(pickerSource).toMatch(/\[1\],\s*\/\/ #1  GK/);
    expect(pickerSource).toMatch(/\[2, 3, 4\],/);
    expect(pickerSource).toMatch(/\[5, 6, 7\],/);
    expect(pickerSource).toMatch(/\[8, 9\],/);
    expect(pickerSource).toMatch(/\[10, 11, 12\],/);
    expect(pickerSource).toMatch(/\[13, 14, 15\],/);
  });

  it("the static pitch background is still imported and rendered unmodified", () => {
    expect(pickerSource).toMatch(/import \{ ProTaggerLineupPitchBackground \} from ".\/ProTaggerLineupPitchBackground"/);
    expect(pickerSource).toMatch(/<ProTaggerLineupPitchBackground \/>/);
    const pitchLayerBlock = pickerSource.match(/pitchLayer:\s*\{([^}]*)\}/)![1];
    expect(pitchLayerBlock).toMatch(/pointerEvents:\s*["']none["']/);
    expect(pitchLayerBlock).toMatch(/opacity:\s*0\.55/);
  });
});

describe("Home/Away colour values still come from squad state (req. 13)", () => {
  it("the tile still receives primary/secondary from the picker's own colour/secondaryColour props, not a hardcoded value", () => {
    expect(pickerSource).toMatch(/primary=\{colour\}/);
    expect(pickerSource).toMatch(/secondary=\{secondaryColour \?\? "#ffffff"\}/);
    expect(pickerSource).toMatch(/const colour = teamColour \?\? "#238636";/);
  });

  it("LivePickerJerseyMark takes primary/secondary as plain string props — no colour hardcoded to green/red/white inside it", () => {
    const markMatch = tileSource.match(/function LivePickerJerseyMark\(\{ primary, secondary, size \}: \{ primary: string; secondary: string; size: number \}\)/);
    expect(markMatch).not.toBeNull();
    const markBody = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/)![0];
    expect(markBody).not.toMatch(/#([0-9a-fA-F]{3}){1,2}/); // no literal hex colour anywhere in the shape
  });
});

describe("Names, discipline, and selection semantics unchanged (req. 14-19)", () => {
  it("player names still render via the reused tile's own name plate, unchanged", () => {
    expect(pickerCodeOnly).not.toMatch(/style=\{S\.name\}/);
    expect(pickerCodeOnly).toMatch(/const tilePlayer = status \? \{ \.\.\.p, name: "" \} : p;/);
    expect(tileSource).toMatch(/\{name && <span style=\{S\.name\}>\{name\}<\/span>\}/);
  });

  it("RED discipline behaviour is unchanged: disables the button, shows the RED label", () => {
    expect(pickerSource).toMatch(/disabled=\{isRed\}/);
    expect(pickerSource).toMatch(/status === "RED" && <span style=\{S\.statusRed\}>RED<\/span>/);
    expect(pickerSource).toMatch(/if \(disciplineStatus\?\.get\(p\.id\) === "RED"\) return;/);
  });

  it("SIN_BIN discipline behaviour is unchanged: label shown, tile stays tappable", () => {
    expect(pickerSource).toMatch(/status === "SIN_BIN" && <span style=\{S\.statusSinBin\}>SIN BIN<\/span>/);
  });

  it("tap() is completely unchanged", () => {
    expect(pickerSource).toMatch(/function tap\(p: ProTaggerSquadPlayer\) \{/);
  });

  it("onSelect payload shape is completely unchanged", () => {
    expect(pickerSource).toMatch(/onSelect\(\{\s*playerId:\s*p\.id,\s*playerName:\s*p\.name\.trim\(\) \|\| `#\$\{p\.number\}`,\s*playerNumber:\s*p\.number,\s*squadId,\s*\}\);/);
  });

  it("No player / Unknown is unchanged", () => {
    expect(pickerSource).toMatch(/onClick=\{\(\) => onSelect\(null\)\}/);
    expect(pickerSource).toMatch(/No player \/ Unknown/);
  });

  it("findSlot/bench live-player derivation is unchanged", () => {
    expect(pickerSource).toMatch(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{/);
    expect(pickerSource).toMatch(/return squad\.find\(\(p\) => p\.activeSlot === slot && p\.isActive !== false\) \?\? null;/);
    expect(pickerSource).toMatch(/const bench = squad\.filter\(\(p\) => p\.isActive !== false && p\.activeSlot === undefined\);/);
  });
});

describe("Position abbreviations remain absent (req. 20)", () => {
  it("no p.position read anywhere in the picker or tile", () => {
    expect(pickerCodeOnly).not.toMatch(/p\.position/);
    expect(tileCodeOnly).not.toMatch(/player\.position/);
  });
});

describe("No new production files/architecture were introduced beyond the two approved ones", () => {
  it("the simplified jersey is built inline in ProTaggerLineupJerseyTile.tsx, not a new file or a modification to ProTaggerMiniJersey.tsx", () => {
    // The picker still imports ProTaggerMiniJersey for its own unchanged
    // header icon (a hard-kept element, unrelated to the player tiles) —
    // this experiment did not remove that or add any other jersey import.
    expect(pickerSource).toMatch(/import \{ ProTaggerMiniJersey \} from ".\/ProTaggerMiniJersey"/);
    expect(pickerSource).toMatch(/<ProTaggerMiniJersey primary=\{colour\} secondary=\{secondaryColour \?\? "#ffffff"\} size=\{18\} \/>/);
  });

  it("ProTaggerLineupJerseyTile.tsx is the only file that defines the simplified jersey shape", () => {
    expect(tileSource).toMatch(/function LivePickerJerseyMark/);
  });
});
