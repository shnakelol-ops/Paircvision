// Live player-picker visual language alignment: replaces the old rectangular
// number/position tile with the same PáircVision jersey + centred number +
// optional compact name plate treatment Squad Setup's approved lineup uses
// (ProTaggerLineupJerseyTile.tsx, reused directly rather than duplicated).
// This is a PRESENTATION-ONLY change — live-player derivation (findSlot/
// bench, from squad activeSlot/isActive), the tap() selection callback,
// discipline gating (RED/SIN_BIN), and the No player/Unknown action are all
// unchanged; this suite exists specifically to prove that.
//
// ProTaggerPlayerPicker.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint), so
// this suite exercises the exact wiring/formula by reading it out of the
// component's own source — the same approach used throughout this session
// for presentational/wiring checks with no harness available.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
const codeOnly = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ProTaggerPlayerPicker — position abbreviations removed", () => {
  it("no longer renders a position-abbreviation fallback (the old p.position / fallbackPos stack)", () => {
    expect(codeOnly).not.toMatch(/p\.position\s*\?\?\s*fallbackPos/);
    expect(codeOnly).not.toMatch(/style=\{S\.pos\}/);
  });

  it("removed the now-unused S.pos style object (no dead position-label styling left behind)", () => {
    expect(codeOnly).not.toMatch(/\bpos:\s*\{/);
  });
});

describe("ProTaggerPlayerPicker — reuses the approved Squad Setup jersey tile (no duplicate jersey system)", () => {
  it("imports ProTaggerLineupJerseyTile rather than reimplementing jersey/number/name rendering", () => {
    expect(source).toMatch(/import \{ ProTaggerLineupJerseyTile \} from ".\/ProTaggerLineupJerseyTile"/);
    expect(source).toMatch(/<ProTaggerLineupJerseyTile/);
  });

  it("does not modify ProTaggerLineupJerseyTile.tsx or ProTaggerMiniJersey.tsx — the approved player-tile design stays untouched", () => {
    // This test only asserts the picker's own source composes the tile via
    // props; the fenced files' own byte-identical-to-main status is proven
    // separately in the diff audit, not by scanning this file.
    expect(source).toMatch(/primary=\{colour\}/);
    expect(source).toMatch(/secondary=\{secondaryColour \?\? "#ffffff"\}/);
  });

  it("player number and name are no longer rendered via the old inline S.number/S.name spans (now handled inside the reused tile)", () => {
    expect(codeOnly).not.toMatch(/style=\{S\.number\}/);
    expect(codeOnly).not.toMatch(/style=\{S\.name\}/);
    expect(codeOnly).not.toMatch(/\bnumber:\s*\{/);
    expect(codeOnly).not.toMatch(/^\s*name:\s*\{/m);
  });

  it("no rectangular card background/border remains on the player tap targets — a transparent hit area only", () => {
    const playerBtnBlock = source.match(/playerBtn:\s*\{([^}]*)\}/)![1];
    const subBtnBlock = source.match(/subBtn:\s*\{([^}]*)\}/)![1];
    for (const block of [playerBtnBlock, subBtnBlock]) {
      expect(block).toMatch(/background:\s*["']transparent["']/);
      expect(block).toMatch(/border:\s*["']none["']/);
    }
  });
});

describe("ProTaggerPlayerPicker — jersey/number sizing matches Squad Setup's approved values", () => {
  it("formation (starter) tiles use the approved 26px jersey, same as ProTaggerLineupFormation.tsx", () => {
    expect(source).toMatch(/FORMATION_JERSEY_SIZE = 26/);
  });

  it("bench tiles use the approved 22px jersey, same as Squad Setup's subs", () => {
    expect(source).toMatch(/BENCH_JERSEY_SIZE = 22/);
  });

  it("formation tiles pass the formation size constants, bench tiles pass the bench size constants — not mixed up", () => {
    expect(source).toMatch(/renderTile\(p, FORMATION_JERSEY_SIZE, FORMATION_NUMBER_FONT_SIZE\)/);
    expect(source).toMatch(/renderTile\(p, BENCH_JERSEY_SIZE, BENCH_NUMBER_FONT_SIZE\)/);
  });
});

describe("ProTaggerPlayerPicker — blank names render no placeholder (matches the reused tile's own guard)", () => {
  it("does not construct a 'Player N' or dash placeholder anywhere for display", () => {
    expect(codeOnly).not.toMatch(/Player \$\{/);
    expect(codeOnly).not.toMatch(/["']—["']/);
  });
});

describe("ProTaggerPlayerPicker — discipline status still always replaces the name line, RED still disables", () => {
  it("suppresses the tile's own name when a discipline status exists, so the status label is the only line shown", () => {
    expect(source).toMatch(/const tilePlayer = status \? \{ \.\.\.p, name: "" \} : p;/);
    expect(source).toMatch(/player=\{tilePlayer\}/);
  });

  it("still renders RED and SIN_BIN status labels as siblings of the jersey tile, using the unchanged status styles", () => {
    expect(source).toMatch(/status === "RED" && <span style=\{S\.statusRed\}>RED<\/span>/);
    expect(source).toMatch(/status === "SIN_BIN" && <span style=\{S\.statusSinBin\}>SIN BIN<\/span>/);
  });

  it("RED still disables the button (unchanged disabled={isRed} wiring) — SIN_BIN does not", () => {
    const formationButtonBlock = source.match(/FORMATION_ROWS\.map[\s\S]*?<\/button>\s*\);\s*\}\)/)![0];
    expect(formationButtonBlock).toMatch(/disabled=\{isRed\}/);
    const benchButtonBlock = source.match(/bench\.map[\s\S]*?<\/button>\s*\);\s*\}\)/)![0];
    expect(benchButtonBlock).toMatch(/disabled=\{isRed\}/);
  });

  it("the tap() selection callback itself is completely unchanged — still short-circuits on RED and calls onSelect with the same shape", () => {
    expect(source).toMatch(/function tap\(p: ProTaggerSquadPlayer\) \{/);
    expect(source).toMatch(/if \(disciplineStatus\?\.get\(p\.id\) === "RED"\) return;/);
    expect(source).toMatch(/onSelect\(\{\s*playerId:\s*p\.id,\s*playerName:\s*p\.name\.trim\(\) \|\| `#\$\{p\.number\}`,\s*playerNumber:\s*p\.number,\s*squadId,\s*\}\);/);
  });
});

describe("ProTaggerPlayerPicker — live-player derivation is unchanged (not replaced by Squad Setup's pre-match sort)", () => {
  it("still derives formation slots from squad activeSlot/isActive (findSlot), not from a jersey-number sort", () => {
    expect(source).toMatch(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{/);
    expect(source).toMatch(/p\.activeSlot === slot && p\.isActive !== false/);
    expect(source).not.toMatch(/deriveLineupSlots/);
    expect(source).not.toMatch(/from ".\/ProTaggerLineupFormation"/);
  });

  it("still derives the bench from squad activeSlot/isActive, not imported from Squad Setup's lineup module", () => {
    expect(source).toMatch(/const bench = squad\.filter\(\(p\) => p\.isActive !== false && p\.activeSlot === undefined\);/);
  });

  // ProTaggerLineupPitchBackground is now approved and reused (see the
  // dedicated ProTaggerPlayerPicker.pitchBackground.test.ts suite) — this
  // check narrows to what must still never be imported: Squad Setup's
  // pre-match formation-slot geometry/derivation itself.
  it("does not import the Squad Setup formation geometry or pre-match lineup summary component — only the presentational jersey tile and static pitch", () => {
    expect(codeOnly).not.toMatch(/pro-tagger-lineup-geometry/);
    expect(codeOnly).not.toMatch(/ProTaggerLineupFormation/);
  });
});

describe("ProTaggerPlayerPicker — team colour isolation (unchanged mechanism)", () => {
  it("still derives its jersey colour from the teamColour prop with the same default, no new colour state/derivation", () => {
    expect(source).toMatch(/const colour = teamColour \?\? "#238636";/);
    expect(codeOnly).not.toMatch(/useState.*[Cc]olour/);
  });
});

describe("ProTaggerPlayerPicker — No player / Unknown and header/Cancel context untouched", () => {
  it("the No player / Unknown button is present, unchanged in wiring (onSelect(null))", () => {
    expect(source).toMatch(/onClick=\{\(\) => onSelect\(null\)\}/);
    expect(source).toMatch(/No player \/ Unknown/);
  });

  it("the team header (jersey + '<Team> — Player') is still rendered, unchanged", () => {
    expect(source).toMatch(/\{teamLabel\} — Player/);
  });
});

describe("ProTaggerPlayerPicker — formation shape is untouched", () => {
  it("still exactly 1 / 2-3-4 / 5-6-7 / 8-9 / 10-11-12 / 13-14-15, no coordinate/drag semantics added", () => {
    expect(source).toMatch(/\[1\],\s*\/\/ #1  GK/);
    expect(source).toMatch(/\[2, 3, 4\],/);
    expect(source).toMatch(/\[5, 6, 7\],/);
    expect(source).toMatch(/\[8, 9\],/);
    expect(source).toMatch(/\[10, 11, 12\],/);
    expect(source).toMatch(/\[13, 14, 15\],/);
    expect(codeOnly).not.toMatch(/draggable|onDragStart|onDrop/);
  });
});
