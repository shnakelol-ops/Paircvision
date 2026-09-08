// Live player-picker static pitch background amendment: adds spatial
// reference (a GAA pitch) behind the existing 15-player formation, so the
// jerseys no longer float in an empty dark area. This REUSES the existing
// Squad Setup pitch component (ProTaggerLineupPitchBackground.tsx) exactly
// as-is — not ProTaggerPitchView.tsx (the live capture pitch) — and is
// wrapped, not modified, with a picker-local opacity and pointerEvents:
// "none" so it can never intercept a player tap.
//
// This is a pure visual-layering change on top of the earlier visual-
// alignment pass: findSlot/bench (live-player derivation), tap() (the
// selection callback), discipline gating, formation coordinates, jersey/
// number/name-plate treatment, and hit-target sizes must all be completely
// unaffected — this suite exists specifically to prove that alongside the
// new pitch layer.
//
// ProTaggerPlayerPicker.tsx has no React rendering harness in this repo,
// so — as with every other presentational/wiring suite this session — this
// exercises the exact composition by reading it out of the component's own
// source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
const codeOnly = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ProTaggerPlayerPicker — static pitch background renders behind the formation", () => {
  it("imports and renders ProTaggerLineupPitchBackground", () => {
    expect(source).toMatch(/import \{ ProTaggerLineupPitchBackground \} from ".\/ProTaggerLineupPitchBackground"/);
    expect(source).toMatch(/<ProTaggerLineupPitchBackground \/>/);
  });

  it("reuses the component with no props passed (it is parameterless — no attackDirection/half/coordinate input exists to pass)", () => {
    expect(source).toMatch(/<ProTaggerLineupPitchBackground\s*\/>/);
  });
});

describe("ProTaggerPlayerPicker — reuses the Squad Setup pitch background unmodified (not a duplicate implementation)", () => {
  it("does not reimplement pitch markings/SVG rendering locally — no getPitchConfig or marking-drawing logic in this file", () => {
    expect(codeOnly).not.toMatch(/getPitchConfig/);
    expect(codeOnly).not.toMatch(/renderPitchMarking/);
    expect(codeOnly).not.toMatch(/ellipseArcToSvgPath/);
  });

  it("ProTaggerLineupPitchBackground.tsx itself is not part of this file's diff — this file only imports and wraps it", () => {
    // A same-directory sibling-file check: the picker's own source contains
    // no PitchMarking/viewBox authoring, which would indicate the shared
    // component's internals were copied in rather than imported.
    expect(codeOnly).not.toMatch(/PitchMarking/);
    expect(codeOnly).not.toMatch(/LINEUP_PITCH_PORTRAIT_VIEWBOX/);
  });
});

describe("ProTaggerPlayerPicker — pitch is NOT the live capture pitch", () => {
  it("never imports ProTaggerPitchView.tsx or its coordinate-capture exports", () => {
    expect(codeOnly).not.toMatch(/ProTaggerPitchView/);
    expect(codeOnly).not.toMatch(/svgPointToPitchNorm/);
    expect(codeOnly).not.toMatch(/clientPointToPitchNorm/);
  });

  it("does not introduce any attacking-direction, orientation, or half-based transform for the pitch layer", () => {
    expect(codeOnly).not.toMatch(/attackDirection/);
    expect(codeOnly).not.toMatch(/PORTRAIT_MARKINGS_TRANSFORM/);
  });
});

describe("ProTaggerPlayerPicker — pitch layer is non-interactive and sits behind the players", () => {
  it("the pitch wrapper has pointerEvents: none", () => {
    const pitchLayerBlock = source.match(/pitchLayer:\s*\{([^}]*)\}/);
    expect(pitchLayerBlock).not.toBeNull();
    expect(pitchLayerBlock![1]).toMatch(/pointerEvents:\s*["']none["']/);
  });

  it("the pitch layer is absolutely positioned and stacked below the formation rows (lower zIndex)", () => {
    const pitchLayerBlock = source.match(/pitchLayer:\s*\{([^}]*)\}/)![1];
    expect(pitchLayerBlock).toMatch(/position:\s*["']absolute["']/);
    const pitchZIndexMatch = pitchLayerBlock.match(/zIndex:\s*(\d+)/);
    expect(pitchZIndexMatch).not.toBeNull();

    const formationRowsBlock = source.match(/formationRows:\s*\{([^}]*)\}/)![1];
    const rowsZIndexMatch = formationRowsBlock.match(/zIndex:\s*(\d+)/);
    expect(rowsZIndexMatch).not.toBeNull();

    expect(Number(rowsZIndexMatch![1])).toBeGreaterThan(Number(pitchZIndexMatch![1]));
  });

  it("the pitch is marked aria-hidden (decorative only, not part of the accessible player-selection tree)", () => {
    expect(source).toMatch(/<div style=\{S\.pitchLayer\} aria-hidden="true">/);
  });
});

describe("ProTaggerPlayerPicker — formation coordinates/order/hit-targets are unaffected by adding the pitch", () => {
  it("FORMATION_ROWS is byte-identical to the pre-pitch shape — no row/order change", () => {
    expect(source).toMatch(/\[1\],\s*\/\/ #1  GK/);
    expect(source).toMatch(/\[2, 3, 4\],/);
    expect(source).toMatch(/\[5, 6, 7\],/);
    expect(source).toMatch(/\[8, 9\],/);
    expect(source).toMatch(/\[10, 11, 12\],/);
    expect(source).toMatch(/\[13, 14, 15\],/);
  });

  it("jersey/number sizing constants are unchanged (26/13 starters, 22/13 bench)", () => {
    expect(source).toMatch(/FORMATION_JERSEY_SIZE = 26/);
    expect(source).toMatch(/FORMATION_NUMBER_FONT_SIZE = 13/);
    expect(source).toMatch(/BENCH_JERSEY_SIZE = 22/);
    expect(source).toMatch(/BENCH_NUMBER_FONT_SIZE = 13/);
  });

  it("player hit-area (playerBtn/subBtn) dimensions are unchanged by this pass", () => {
    const playerBtnBlock = source.match(/playerBtn:\s*\{([^}]*)\}/)![1];
    expect(playerBtnBlock).toMatch(/width:\s*80/);
    expect(playerBtnBlock).toMatch(/minHeight:\s*64/);
    const subBtnBlock = source.match(/subBtn:\s*\{([^}]*)\}/)![1];
    expect(subBtnBlock).toMatch(/width:\s*80/);
    expect(subBtnBlock).toMatch(/minHeight:\s*58/);
  });

  it("the formation-rows wrapper preserves the same row gap (5) and centring the rows always had directly in .scroll", () => {
    const formationRowsBlock = source.match(/formationRows:\s*\{([^}]*)\}/)![1];
    expect(formationRowsBlock).toMatch(/gap:\s*5/);
    expect(formationRowsBlock).toMatch(/alignItems:\s*["']center["']/);
    expect(formationRowsBlock).toMatch(/flexDirection:\s*["']column["']/);
  });
});

describe("ProTaggerPlayerPicker — live-player semantics untouched by this amendment", () => {
  it("findSlot is unchanged — still derives from squad activeSlot/isActive, not any pitch/geometry data", () => {
    expect(source).toMatch(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{/);
    expect(source).toMatch(/return squad\.find\(\(p\) => p\.activeSlot === slot && p\.isActive !== false\) \?\? null;/);
  });

  it("bench derivation is unchanged", () => {
    expect(source).toMatch(/const bench = squad\.filter\(\(p\) => p\.isActive !== false && p\.activeSlot === undefined\);/);
  });

  it("tap() and its onSelect payload are unchanged", () => {
    expect(source).toMatch(/function tap\(p: ProTaggerSquadPlayer\) \{/);
    expect(source).toMatch(/if \(disciplineStatus\?\.get\(p\.id\) === "RED"\) return;/);
    expect(source).toMatch(/onSelect\(\{\s*playerId:\s*p\.id,\s*playerName:\s*p\.name\.trim\(\) \|\| `#\$\{p\.number\}`,\s*playerNumber:\s*p\.number,\s*squadId,\s*\}\);/);
  });

  it("No player / Unknown is unchanged", () => {
    expect(source).toMatch(/onClick=\{\(\) => onSelect\(null\)\}/);
    expect(source).toMatch(/No player \/ Unknown/);
  });

  it("position abbreviations remain absent (not reintroduced alongside the pitch)", () => {
    expect(codeOnly).not.toMatch(/p\.position/);
  });

  it("RED and SIN_BIN discipline presentation remain intact", () => {
    expect(source).toMatch(/status === "RED" && <span style=\{S\.statusRed\}>RED<\/span>/);
    expect(source).toMatch(/status === "SIN_BIN" && <span style=\{S\.statusSinBin\}>SIN BIN<\/span>/);
    expect(source).toMatch(/disabled=\{isRed\}/);
  });
});

describe("ProTaggerPlayerPicker — pitch is scoped to the formation canvas only", () => {
  it("the pitch layer sits inside pitchArea alongside formationRows, not wrapping the header, bench, or No player/Unknown", () => {
    const pitchAreaMatch = source.match(/<div style=\{S\.pitchArea\}>([\s\S]*?)\n {8}<\/div>\n\n {8}\{\/\* Bench/);
    expect(pitchAreaMatch).not.toBeNull();
    const pitchAreaContent = pitchAreaMatch![1];
    expect(pitchAreaContent).toMatch(/ProTaggerLineupPitchBackground/);
    expect(pitchAreaContent).toMatch(/FORMATION_ROWS\.map/);
    expect(pitchAreaContent).not.toMatch(/Bench/);
    expect(pitchAreaContent).not.toMatch(/No player \/ Unknown/);
  });
});
