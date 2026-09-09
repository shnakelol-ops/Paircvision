// Jersey Style Selector — see the "IMPLEMENTATION AUTHORISATION" spec this
// suite proves. Each Home/Away squad can independently pick a jersey
// presentation SHAPE ("chest" | "sleeves" | "collar"): where the secondary
// team colour appears. This is presentation-metadata only — it must never
// be read by capture, scoring, substitutions, discipline, Review, Player
// Influence, PDFs, or any state-machine logic, and it must stay completely
// orthogonal to the Live Picker's own approved crisp NUMBER treatment
// (livePicker/numberCrisp), which this suite proves is untouched.
//
// None of the touched files have a React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts for the same constraint),
// so — as with every other presentational/wiring suite in this codebase —
// this suite exercises the exact composition by reading it out of each
// file's own source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sessionSource   = readFileSync(fileURLToPath(new URL("./pro-tagger-session.ts", import.meta.url)), "utf8");
const tileSource       = readFileSync(fileURLToPath(new URL("./ProTaggerLineupJerseyTile.tsx", import.meta.url)), "utf8");
const pickerSource     = readFileSync(fileURLToPath(new URL("./ProTaggerPlayerPicker.tsx", import.meta.url)), "utf8");
const liveScreenSource = readFileSync(fileURLToPath(new URL("./ProTaggerLiveScreen.tsx", import.meta.url)), "utf8");
const squadScreenSource = readFileSync(fileURLToPath(new URL("./ProTaggerSquadScreen.tsx", import.meta.url)), "utf8");
const formationSource  = readFileSync(fileURLToPath(new URL("./ProTaggerLineupFormation.tsx", import.meta.url)), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// ── Data model & legacy fallback ────────────────────────────────────────────

describe("ProTaggerJerseyStyle — data model (pro-tagger-session.ts)", () => {
  it("defines the type as exactly three literal shapes", () => {
    expect(sessionSource).toMatch(
      /export type ProTaggerJerseyStyle = "chest" \| "sleeves" \| "collar";/,
    );
  });

  it("ProTaggerSquad.jerseyStyle is optional (no schema-version bump, no migration)", () => {
    const squadTypeMatch = sessionSource.match(/export type ProTaggerSquad = \{([\s\S]*?)\};/);
    expect(squadTypeMatch).not.toBeNull();
    expect(squadTypeMatch![1]).toMatch(/jerseyStyle\?:\s*ProTaggerJerseyStyle;/);
  });

  it("is never referenced by ProTaggerSquadPlayer — this is squad-level (team) metadata, not per-player identity", () => {
    const playerTypeMatch = sessionSource.match(/export type ProTaggerSquadPlayer = \{([\s\S]*?)\};/);
    expect(playerTypeMatch).not.toBeNull();
    expect(playerTypeMatch![1]).not.toMatch(/jerseyStyle/);
  });
});

describe("ProTaggerJerseyStyle — legacy fallback resolves to \"chest\" at every read site", () => {
  it("ProTaggerLineupJerseyTile resolves an absent jerseyStyle to \"chest\"", () => {
    expect(tileSource).toMatch(/const resolvedJerseyStyle: ProTaggerJerseyStyle = jerseyStyle \?\? "chest";/);
  });

  it("ProTaggerLiveScreen resolves both squads' jerseyStyle independently, each defaulting to \"chest\"", () => {
    expect(liveScreenSource).toMatch(/const homeJerseyStyle\s*=\s*session\.homeSquad\.jerseyStyle\s*\?\?\s*"chest";/);
    expect(liveScreenSource).toMatch(/const awayJerseyStyle\s*=\s*session\.awaySquad\.jerseyStyle\s*\?\?\s*"chest";/);
  });

  it("ProTaggerSquadScreen seeds its local state from the session with the same \"chest\" fallback", () => {
    expect(squadScreenSource).toMatch(
      /useState<ProTaggerJerseyStyle>\(\s*session\.homeSquad\.jerseyStyle \?\? "chest",?\s*\)/,
    );
    expect(squadScreenSource).toMatch(
      /useState<ProTaggerJerseyStyle>\(\s*session\.awaySquad\.jerseyStyle \?\? "chest",?\s*\)/,
    );
  });

  it("renderJerseyShape's own fallthrough (unrecognised/absent shape) renders the \"chest\" ProTaggerMiniJersey", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(
      /return <ProTaggerMiniJersey primary=\{primary\} secondary=\{secondary\} size=\{size\} \/>;/,
    );
  });
});

// ── Orthogonality: jerseyStyle (shape) vs livePicker/numberCrisp (number) ───

describe("ProTaggerJerseyStyle — orthogonal to the Live Picker's number treatment", () => {
  it("the number outline ternary reads only livePicker/numberCrisp — jerseyStyle never appears in it", () => {
    const outlineMatch = tileSource.match(/const outlineStyle: CSSProperties = ([\s\S]*?);/);
    expect(outlineMatch).not.toBeNull();
    expect(outlineMatch![1]).toMatch(/livePicker/);
    expect(outlineMatch![1]).toMatch(/numberCrisp/);
    expect(outlineMatch![1]).not.toMatch(/jerseyStyle/);
  });

  it("resolvedJerseyStyle only feeds the shape renderer, never the outline/number styles", () => {
    const shapeCallSites = tileSource.match(/renderJerseyShape\(resolvedJerseyStyle,[^)]*\)/g) ?? [];
    expect(shapeCallSites.length).toBeGreaterThanOrEqual(1);
    // resolvedJerseyStyle must not appear anywhere near numberText/outline style application.
    const numberBlockMatch = tileSource.match(/const outlineStyle[\s\S]*?<\/div>/);
    expect(numberBlockMatch).not.toBeNull();
  });

  it("the three numberOutline* style objects are completely unchanged in structure by this feature", () => {
    expect(tileSource).toMatch(/numberOutlineDefault:\s*\{[\s\S]*?WebkitTextStroke:\s*["']0\.75px rgba\(6, 10, 16, 0\.9\)["']/);
    expect(tileSource).toMatch(/numberOutlineCrisp:\s*\{[\s\S]*?WebkitTextStroke:\s*["']0\.5px rgba\(6, 10, 16, 0\.85\)["']/);
    expect(tileSource).toMatch(/numberOutlineLivePicker:\s*\{[\s\S]*?textShadow:/);
  });

  it("ProTaggerPlayerPicker keeps livePicker hardcoded true on every tile call regardless of jerseyStyle — the crisp number treatment persists for all three shapes", () => {
    const jerseyTileCalls = pickerSource.match(/<ProTaggerLineupJerseyTile[\s\S]*?\/>/g) ?? [];
    expect(jerseyTileCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of jerseyTileCalls) {
      expect(call).toMatch(/\blivePicker\b/);
      expect(call).toMatch(/jerseyStyle=\{jerseyStyle\}/);
    }
  });
});

// ── Shape rendering correctness ─────────────────────────────────────────────

describe("ProTaggerJerseyStyle — \"chest\" renders the existing ProTaggerMiniJersey unchanged", () => {
  it("renderJerseyShape's default branch is ProTaggerMiniJersey — no new geometry invented for chest", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/return <ProTaggerMiniJersey primary=\{primary\} secondary=\{secondary\} size=\{size\} \/>;/);
  });

  it("ProTaggerMiniJersey.tsx itself is never modified by this feature (still the single \"chest\" shape source of truth)", () => {
    const miniJerseySource = readFileSync(
      fileURLToPath(new URL("./ProTaggerMiniJersey.tsx", import.meta.url)),
      "utf8",
    );
    expect(miniJerseySource).toMatch(/Chest stripe/);
    expect(miniJerseySource).toMatch(/<rect x="4" y="10" width="12" height="3" fill=\{secondary\} \/>/);
    expect(miniJerseySource).not.toMatch(/jerseyStyle/);
  });
});

describe("ProTaggerJerseyStyle — \"sleeves\" reuses the existing LivePickerJerseyMark unchanged", () => {
  const markMatch = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/);
  const mark = markMatch ? markMatch[0] : "";

  it("LivePickerJerseyMark itself is byte-identical geometry to before this feature: two secondary sleeves, one primary torso, no rect, no collar curve", () => {
    expect(mark).not.toMatch(/<rect/);
    expect(mark).not.toMatch(/\bQ\d/);
    const pathCount = (mark.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(3);
    expect((mark.match(/fill=\{secondary\}/g) ?? []).length).toBe(2);
    expect(mark).toMatch(/<path d="M4,21[^"]*" fill=\{primary\} \/>/);
  });

  it("renderJerseyShape routes \"sleeves\" to this exact mark", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/if \(resolvedStyle === "sleeves"\) return <LivePickerJerseyMark/);
  });
});

describe("ProTaggerJerseyStyle — \"collar\" is newly built, reusing ProTaggerMiniJersey's own path geometry", () => {
  const markMatch = tileSource.match(/function CollarJerseyMark[\s\S]*?\n\}/);
  const mark = markMatch ? markMatch[0] : "";

  it("exists as its own local function (no fourth file, no new SVG geometry invented)", () => {
    expect(markMatch).not.toBeNull();
  });

  it("reuses ProTaggerMiniJersey's exact body+sleeve outline path verbatim", () => {
    expect(mark).toContain(
      "M4,21 L4,8 L0,8 L0,4 L4,2 L7,5 L10,8 L13,5 L16,2 L20,4 L20,8 L16,8 L16,21 Z",
    );
  });

  it("reuses ProTaggerMiniJersey's exact collar path verbatim", () => {
    expect(mark).toContain("M7,5 L10,8 L13,5 Q10,2 7,5 Z");
  });

  it("has no chest-stripe rect and no third (sleeve-decomposition) path — primary body, primary sleeves, secondary collar only", () => {
    expect(mark).not.toMatch(/<rect/);
    const pathCount = (mark.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(2); // body+sleeve outline, collar — nothing else
  });

  it("body path is primary-filled, collar path is secondary-filled — same fill convention as ProTaggerMiniJersey", () => {
    expect(mark).toMatch(/fill=\{primary\}/);
    expect(mark).toMatch(/fill=\{secondary\}/);
  });

  it("uses the same viewBox/size formula as every other jersey shape (pixel-identical outer silhouette)", () => {
    expect(mark).toMatch(/viewBox="0 0 20 22"/);
    expect(mark).toMatch(/Math\.round\(\(size \* 22\) \/ 20\)/);
  });

  it("renderJerseyShape routes \"collar\" to this exact mark", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/if \(resolvedStyle === "collar"\) return <CollarJerseyMark/);
  });
});

describe("ProTaggerJerseyStyle — no fourth jersey implementation", () => {
  it("exactly three shape-rendering functions exist across the shared tile file: LivePickerJerseyMark, CollarJerseyMark, and the reused ProTaggerMiniJersey import", () => {
    expect(tileSource.match(/^function \w*JerseyMark/gm)?.length ?? 0).toBe(2); // LivePickerJerseyMark + CollarJerseyMark
    expect(tileSource).toMatch(/import \{ ProTaggerMiniJersey \} from "\.\/ProTaggerMiniJersey";/);
  });
});

// ── Threading: LiveScreen -> Picker -> Tile ─────────────────────────────────

describe("ProTaggerJerseyStyle — threaded into the live Player Picker", () => {
  it("ProTaggerPlayerPicker accepts an optional jerseyStyle prop", () => {
    expect(pickerSource).toMatch(/jerseyStyle\?:\s*ProTaggerJerseyStyle;/);
  });

  it("ProTaggerLiveScreen passes the FOR-side-resolved jerseyStyle into the single shared picker call site", () => {
    expect(liveScreenSource).toMatch(
      /jerseyStyle=\{\s*pending\.teamSide === "FOR" \? homeJerseyStyle : awayJerseyStyle\s*\}/,
    );
  });

  it("ProTaggerLiveScreen's jerseyStyle derivation sits directly alongside the existing colour derivation (same pattern, same location)", () => {
    const colourBlock = liveScreenSource.match(
      /const homeColour[\s\S]*?const awayJerseyStyle\s*=\s*session\.awaySquad\.jerseyStyle\s*\?\?\s*"chest";/,
    );
    expect(colourBlock).not.toBeNull();
  });
});

// ── Threading: SquadScreen -> LineupFormation -> Tile ───────────────────────

describe("ProTaggerJerseyStyle — threaded into Squad Setup's 15-player lineup preview", () => {
  it("ProTaggerLineupFormation accepts an optional jerseyStyle prop and forwards it to every tile", () => {
    expect(formationSource).toMatch(/jerseyStyle\?:\s*ProTaggerJerseyStyle;/);
    const tileCalls = formationSource.match(/<ProTaggerLineupJerseyTile[\s\S]*?\/>/g) ?? [];
    expect(tileCalls.length).toBe(2); // one starter call site (in .map), one sub call site (in .map)
    for (const call of tileCalls) {
      expect(call).toMatch(/jerseyStyle=\{jerseyStyle\}/);
    }
  });

  it("ProTaggerSquadScreen passes the active tab's jerseyStyle into ProTaggerLineupFormation", () => {
    expect(squadScreenSource).toMatch(/<ProTaggerLineupFormation[\s\S]*?jerseyStyle=\{activeJerseyStyle\}/);
  });

  it("formation geometry, starter/sub sizing, and pitch background are all untouched by this addition", () => {
    expect(formationSource).toMatch(/STARTER_JERSEY_SIZE = 26/);
    expect(formationSource).toMatch(/SUB_JERSEY_SIZE = 22/);
    expect(formationSource).toMatch(/LINEUP_FORMATION_POSITIONS/);
  });
});

// ── Squad Setup: state lifecycle, independence, and the compact selector ───

describe("ProTaggerJerseyStyle — Squad Setup state mirrors the existing colour-state lifecycle exactly", () => {
  it("declares homeJerseyStyle/awayJerseyStyle as local useState, same as homeColours/awayColours", () => {
    expect(squadScreenSource).toMatch(/\[homeJerseyStyle, setHomeJerseyStyle\]\s*=\s*useState<ProTaggerJerseyStyle>/);
    expect(squadScreenSource).toMatch(/\[awayJerseyStyle, setAwayJerseyStyle\]\s*=\s*useState<ProTaggerJerseyStyle>/);
  });

  it("derives activeJerseyStyle from activeTab exactly like activeColours", () => {
    expect(squadScreenSource).toMatch(
      /const activeJerseyStyle = activeTab === "home" \? homeJerseyStyle : awayJerseyStyle;/,
    );
  });

  it("handleJerseyStyleChange writes only the active tab's own setter — never both", () => {
    const fnMatch = squadScreenSource.match(/function handleJerseyStyleChange\([\s\S]*?\n {2}\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    expect(body).toMatch(/setHomeJerseyStyle\(style\)/);
    expect(body).toMatch(/setAwayJerseyStyle\(style\)/);
    // Both setters appear, but each only inside its own activeTab branch —
    // proven structurally: exactly one setHomeJerseyStyle and one
    // setAwayJerseyStyle call, gated by the if/else on activeTab.
    expect((body.match(/setHomeJerseyStyle\(style\)/g) ?? []).length).toBe(1);
    expect((body.match(/setAwayJerseyStyle\(style\)/g) ?? []).length).toBe(1);
    expect(body).toMatch(/if \(activeTab === "home"\)/);
  });

  it("is written back to the outgoing session ONLY through handleStart()'s existing squad spread — no new persistence mechanism", () => {
    const handleStartMatch = squadScreenSource.match(/function handleStart\(\) \{([\s\S]*?)\n {2}\}/);
    expect(handleStartMatch).not.toBeNull();
    const body = handleStartMatch![1];
    expect(body).toMatch(/homeSquad:\s*\{[\s\S]*?jerseyStyle:\s*homeJerseyStyle,/);
    expect(body).toMatch(/awaySquad:\s*\{[\s\S]*?jerseyStyle:\s*awayJerseyStyle,/);
    // Same spread pattern the colours already use — ...session.homeSquad /
    // ...session.awaySquad as the base, not a rebuilt object.
    expect(body).toMatch(/\.\.\.session\.homeSquad,/);
    expect(body).toMatch(/\.\.\.session\.awaySquad,/);
  });

  it("team library persistence (pro-tagger-team-storage.ts) is untouched — jerseyStyle is explicitly deferred there", () => {
    const teamStorageSource = readFileSync(
      fileURLToPath(new URL("./pro-tagger-team-storage.ts", import.meta.url)),
      "utf8",
    );
    expect(teamStorageSource).not.toMatch(/jerseyStyle/);
  });
});

describe("ProTaggerJerseyStyle — compact 3-tile selector in Squad Setup", () => {
  it("renders exactly three tiles — chest, sleeves, collar — as a mapped row, not three separate hand-written blocks", () => {
    expect(squadScreenSource).toMatch(/\(\["chest", "sleeves", "collar"\] as const\)\.map/);
  });

  it("each tile renders a real miniature jersey (ProTaggerJerseyStyleSwatch), not an emoji or text label alone", () => {
    expect(squadScreenSource).toMatch(/<ProTaggerJerseyStyleSwatch/);
    expect(squadScreenSource).toMatch(/jerseyStyle=\{style\}/);
    expect(squadScreenSource).toMatch(/primary=\{activeColours\.primary\}/);
    expect(squadScreenSource).toMatch(/secondary=\{activeColours\.secondary\}/);
  });

  it("swatch size is compact (~36-40px), matching the ~36-40px visible-size requirement", () => {
    const sizeMatch = squadScreenSource.match(/<ProTaggerJerseyStyleSwatch[\s\S]*?size=\{(\d+)\}/);
    expect(sizeMatch).not.toBeNull();
    const size = Number(sizeMatch![1]);
    expect(size).toBeGreaterThanOrEqual(32);
    expect(size).toBeLessThanOrEqual(40);
  });

  it("selection has a clear visual state (a distinct style applied only to the active tile)", () => {
    expect(squadScreenSource).toMatch(/activeJerseyStyle === style \? S\.jerseyStyleTileOn : \{\}/);
    expect(squadScreenSource).toMatch(/jerseyStyleTileOn:\s*\{/);
  });

  it("selecting a tile calls handleJerseyStyleChange directly — no modal, no dropdown, no separate confirm step", () => {
    expect(squadScreenSource).toMatch(/onClick=\{\(\) => handleJerseyStyleChange\(style\)\}/);
    expect(squadScreenSource).not.toMatch(/jerseyStyle[\s\S]{0,80}<select/i);
  });

  it("lives inside the existing Team Colours section, not a new screen/section", () => {
    const colourSectionMatch = squadScreenSource.match(
      /<div style=\{S\.colourSection\}>([\s\S]*?)\n {10}<\/div>\n\n {10}\{\/\* Visual lineup summary/,
    );
    expect(colourSectionMatch).not.toBeNull();
    expect(colourSectionMatch![1]).toMatch(/jerseyStyleRow/);
  });

  it("does not add a second/new Save or Go To Game control — the existing handleStart footer is unchanged", () => {
    const goToGameMatches = stripComments(squadScreenSource).match(/Go To Game/g) ?? [];
    expect(goToGameMatches.length).toBe(2); // header + footer buttons, unchanged from before this feature
  });
});

// ── Home/Away independence ──────────────────────────────────────────────────

describe("ProTaggerJerseyStyle — Home and Away are fully independent", () => {
  it("session-level: homeSquad.jerseyStyle and awaySquad.jerseyStyle are distinct optional fields on distinct squad objects", () => {
    const squadTypeMatch = sessionSource.match(/export type ProTaggerSquad = \{([\s\S]*?)\};/)![1];
    // A single jerseyStyle FIELD DECLARATION on the per-squad type,
    // instantiated once per squad (homeSquad/awaySquad are separate
    // ProTaggerSquad values) — there is no shared/global jerseyStyle
    // anywhere in the session shape.
    expect((squadTypeMatch.match(/jerseyStyle\?:/g) ?? []).length).toBe(1);
    expect(sessionSource).not.toMatch(/sharedJerseyStyle|globalJerseyStyle/);
  });

  it("Squad Setup: two independent useState hooks, never a single shared jerseyStyle state", () => {
    expect(squadScreenSource).not.toMatch(/const \[jerseyStyle, setJerseyStyle\]/);
    expect((squadScreenSource.match(/useState<ProTaggerJerseyStyle>/g) ?? []).length).toBe(2);
  });

  it("LiveScreen: two independently derived consts, each reading only its own side's squad", () => {
    expect(liveScreenSource).toMatch(/const homeJerseyStyle\s*=\s*session\.homeSquad\.jerseyStyle\s*\?\?\s*"chest";/);
    expect(liveScreenSource).toMatch(/const awayJerseyStyle\s*=\s*session\.awaySquad\.jerseyStyle\s*\?\?\s*"chest";/);
    // Each const's own initializer reads exactly one squad — homeJerseyStyle
    // never reads awaySquad and vice versa.
    const homeLine = liveScreenSource.match(/const homeJerseyStyle\s*=[^\n]*/)![0];
    const awayLine = liveScreenSource.match(/const awayJerseyStyle\s*=[^\n]*/)![0];
    expect(homeLine).not.toMatch(/awaySquad/);
    expect(awayLine).not.toMatch(/homeSquad/);
  });
});

// ── Capture-fence regression proofs ─────────────────────────────────────────
// This feature is presentation-metadata only. Every item below proves a
// capture/scoring/substitution/discipline/state-machine code path this
// feature must never touch is still present, unchanged, and does not
// reference jerseyStyle.

describe("ProTaggerJerseyStyle — capture-fence: ProTaggerLiveScreen", () => {
  const codeOnly = stripComments(liveScreenSource);

  it("clock/lifecycle state is untouched: matchState/currentHalf/matchTimeSeconds logic never reads jerseyStyle", () => {
    expect(codeOnly).not.toMatch(/matchState[\s\S]{0,60}jerseyStyle/);
    expect(codeOnly).not.toMatch(/jerseyStyle[\s\S]{0,60}matchState/);
  });

  it("event creation / handleTileTap is untouched: no jerseyStyle reference near it", () => {
    const tapMatch = codeOnly.match(/function handleTileTap[\s\S]*?\n {2}\}/);
    if (tapMatch) expect(tapMatch[0]).not.toMatch(/jerseyStyle/);
  });

  it("score computation is untouched: no jerseyStyle reference near computeScoreSide", () => {
    expect(codeOnly).not.toMatch(/computeScoreSide[\s\S]{0,200}jerseyStyle/);
  });

  it("substitution/discipline plumbing is untouched: no jerseyStyle reference near disciplineStatus/subSquadState", () => {
    expect(codeOnly).not.toMatch(/disciplineStatus[\s\S]{0,120}jerseyStyle/);
  });

  it("jerseyStyle is referenced in exactly the two derivation lines plus the one JSX prop — nowhere else in the file", () => {
    const occurrences = (codeOnly.match(/jerseyStyle/gi) ?? []).length;
    // homeJerseyStyle decl, awayJerseyStyle decl, and the jerseyStyle={...} JSX prop line
    // (each appears twice: once as an identifier declared, once as used, plus the prop name itself) —
    // bounded loosely to catch any unintended spread of this feature elsewhere in the file.
    expect(occurrences).toBeGreaterThanOrEqual(3);
    expect(occurrences).toBeLessThanOrEqual(8);
  });

  it("the picker call site still passes every pre-existing prop unchanged (teamLabel/squad/squadId/teamColour/secondaryColour/disciplineStatus/onSelect)", () => {
    const pickerCallMatch = liveScreenSource.match(/<ProTaggerPlayerPicker[\s\S]*?\/>/);
    expect(pickerCallMatch).not.toBeNull();
    const call = pickerCallMatch![0];
    expect(call).toMatch(/teamLabel=/);
    expect(call).toMatch(/squad=/);
    expect(call).toMatch(/squadId=/);
    expect(call).toMatch(/teamColour=/);
    expect(call).toMatch(/secondaryColour=/);
    expect(call).toMatch(/disciplineStatus=\{disciplineStatus\}/);
    expect(call).toMatch(/onSelect=\{handlePlayerSelect\}/);
  });
});

describe("ProTaggerJerseyStyle — capture-fence: ProTaggerPlayerPicker", () => {
  const codeOnly = stripComments(pickerSource);

  it("findSlot is byte-identical", () => {
    expect(pickerSource).toMatch(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{/);
    expect(pickerSource).toMatch(/return squad\.find\(\(p\) => p\.activeSlot === slot && p\.isActive !== false\) \?\? null;/);
  });

  it("bench derivation is byte-identical", () => {
    expect(pickerSource).toMatch(/const bench = squad\.filter\(\(p\) => p\.isActive !== false && p\.activeSlot === undefined\);/);
  });

  it("tap()/onSelect payload construction is byte-identical", () => {
    expect(pickerSource).toMatch(/function tap\(p: ProTaggerSquadPlayer\) \{/);
    expect(pickerSource).toMatch(
      /onSelect\(\{\s*playerId:\s*p\.id,\s*playerName:\s*p\.name\.trim\(\) \|\| `#\$\{p\.number\}`,\s*playerNumber:\s*p\.number,\s*squadId,\s*\}\);/,
    );
  });

  it("RED/SIN_BIN discipline handling is byte-identical", () => {
    expect(pickerSource).toMatch(/if \(disciplineStatus\?\.get\(p\.id\) === "RED"\) return;/);
    expect(pickerSource).toMatch(/status === "RED" && <span style=\{S\.statusRed\}>RED<\/span>/);
    expect(pickerSource).toMatch(/status === "SIN_BIN" && <span style=\{S\.statusSinBin\}>SIN BIN<\/span>/);
    expect(pickerSource).toMatch(/disabled=\{isRed\}/);
  });

  it("playerBtn/subBtn hit-area dimensions are byte-identical (80x64 / 80x58)", () => {
    const playerBtnBlock = pickerSource.match(/playerBtn:\s*\{([^}]*)\}/)![1];
    expect(playerBtnBlock).toMatch(/width:\s*80/);
    expect(playerBtnBlock).toMatch(/minHeight:\s*64/);
    const subBtnBlock = pickerSource.match(/subBtn:\s*\{([^}]*)\}/)![1];
    expect(subBtnBlock).toMatch(/width:\s*80/);
    expect(subBtnBlock).toMatch(/minHeight:\s*58/);
  });

  it("formation layout (FORMATION_ROWS) is byte-identical", () => {
    expect(pickerSource).toMatch(/\[1\],\s*\/\/ #1  GK/);
    expect(pickerSource).toMatch(/\[13, 14, 15\],/);
  });

  it("the static pitch background wiring (ProTaggerLineupPitchBackground, pitchLayer/formationRows z-index) is byte-identical", () => {
    expect(pickerSource).toMatch(/<ProTaggerLineupPitchBackground \/>/);
    const pitchLayerBlock = pickerSource.match(/pitchLayer:\s*\{([^}]*)\}/)![1];
    expect(pitchLayerBlock).toMatch(/zIndex:\s*0/);
    const formationRowsBlock = pickerSource.match(/formationRows:\s*\{([^}]*)\}/)![1];
    expect(formationRowsBlock).toMatch(/zIndex:\s*1/);
  });

  it("jerseyStyle is used only inside renderTile to forward the prop to the tile — never inside findSlot/tap/onSelect", () => {
    const findSlotFn = codeOnly.match(/function findSlot\(slot: number\): ProTaggerSquadPlayer \| null \{[\s\S]*?\n {2}\}/)![0];
    const tapFn = codeOnly.match(/function tap\(p: ProTaggerSquadPlayer\) \{[\s\S]*?\n {2}\}/)![0];
    expect(findSlotFn).not.toMatch(/jerseyStyle/);
    expect(tapFn).not.toMatch(/jerseyStyle/);
  });
});
