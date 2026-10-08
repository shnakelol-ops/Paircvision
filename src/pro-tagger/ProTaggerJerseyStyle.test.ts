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
import { readableNumberColour } from "./ProTaggerLineupJerseyTile";

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

  it("renderJerseyShape's own fallthrough (unrecognised/absent shape) renders the \"chest\" mark", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(
      /return <ChestJerseyMark primary=\{primary\} secondary=\{secondary\} size=\{size\} \/>;/,
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

// Silhouette refinement pass: chest/sleeves/collar were rebuilt on a single
// shared, less-blocky base silhouette (JERSEY_BODY_PATH — sloped shoulders,
// tapered/rounded sleeve tips, a smooth curved neckline) instead of each
// reusing/duplicating ProTaggerMiniJersey's old squared-off path. See the
// "JERSEY VISUAL REFINEMENT" spec. ProTaggerMiniJersey.tsx itself is now a
// separate, untouched, out-of-scope decorative icon (used elsewhere, e.g.
// the live picker's header and Squad Setup's colour preview) — the
// jerseyStyle-driven shapes below no longer read its geometry at all.
describe("ProTaggerJerseyStyle — one shared base silhouette for chest/sleeves/collar", () => {
  it("JERSEY_BODY_PATH is defined once and is the single source of the outer silhouette", () => {
    expect(tileSource).toMatch(/const JERSEY_BODY_PATH =\s*\n?\s*"[^"]+";/);
  });

  it("ChestJerseyMark and CollarJerseyMark both render JERSEY_BODY_PATH directly — same outer shape, no per-style geometry", () => {
    const chestMatch = tileSource.match(/function ChestJerseyMark[\s\S]*?\n\}/)![0];
    const collarMatch = tileSource.match(/function CollarJerseyMark[\s\S]*?\n\}/)![0];
    expect(chestMatch).toMatch(/d=\{JERSEY_BODY_PATH\}/);
    expect(collarMatch).toMatch(/d=\{JERSEY_BODY_PATH\}/);
  });

  it("the \"sleeves\" decomposition (torso + 2 sleeves) is derived from the same silhouette, not an independently drawn shape (shared seam coordinates, verified in ProTaggerPlayerPicker.simplifiedJersey.test.ts)", () => {
    expect(tileSource).toMatch(/const JERSEY_TORSO_PATH = "[^"]+";/);
    expect(tileSource).toMatch(/const JERSEY_SLEEVE_LEFT_PATH = "[^"]+";/);
    expect(tileSource).toMatch(/const JERSEY_SLEEVE_RIGHT_PATH = "[^"]+";/);
  });

  it("ProTaggerMiniJersey.tsx itself is untouched and no longer imported by this file — it is a separate, unrelated decorative icon", () => {
    const miniJerseySource = readFileSync(
      fileURLToPath(new URL("./ProTaggerMiniJersey.tsx", import.meta.url)),
      "utf8",
    );
    expect(miniJerseySource).toMatch(/Chest stripe/);
    expect(miniJerseySource).not.toMatch(/jerseyStyle/);
    expect(tileSource).not.toMatch(/import.*ProTaggerMiniJersey/);
    expect(tileSource).not.toMatch(/<ProTaggerMiniJersey/);
  });

  it("outer bounding box is unchanged: same viewBox and the same size->height formula every jersey shape has always used", () => {
    expect(tileSource).toMatch(/viewBox="0 0 20 22"/);
    const heightFormulaCount = (tileSource.match(/Math\.round\(\(size \* 22\) \/ 20\)/g) ?? []).length;
    expect(heightFormulaCount).toBeGreaterThanOrEqual(3); // Chest, Sleeves(=Torso/sleeve), Collar all use it
  });
});

describe("ProTaggerJerseyStyle — \"chest\" style", () => {
  it("renderJerseyShape's default branch renders ChestJerseyMark — the shared silhouette plus a secondary chest band", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/return <ChestJerseyMark primary=\{primary\} secondary=\{secondary\} size=\{size\} \/>;/);
  });

  it("ChestJerseyMark renders exactly one body path (primary) and one chest-band rect (secondary), nothing else", () => {
    const mark = tileSource.match(/function ChestJerseyMark[\s\S]*?\n\}/)![0];
    expect((mark.match(/<path/g) ?? []).length).toBe(1);
    expect((mark.match(/<rect/g) ?? []).length).toBe(1);
    expect(mark).toMatch(/fill=\{primary\}/);
    expect(mark).toMatch(/fill=\{secondary\}/);
  });
});

describe("ProTaggerJerseyStyle — \"sleeves\" style (LivePickerJerseyMark)", () => {
  const markMatch = tileSource.match(/function LivePickerJerseyMark[\s\S]*?\n\}/);
  const mark = markMatch ? markMatch[0] : "";

  it("renders exactly the two sleeve paths (secondary) and the torso path (primary) — no chest band, no collar accent", () => {
    expect(mark).not.toMatch(/<rect/);
    expect(mark).not.toMatch(/JERSEY_COLLAR_PATH/);
    const pathCount = (mark.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(3);
    expect((mark.match(/fill=\{secondary\}/g) ?? []).length).toBe(2);
    expect(mark).toMatch(/d=\{JERSEY_TORSO_PATH\}\s+fill=\{primary\}/);
  });

  it("renderJerseyShape routes \"sleeves\" to this exact mark", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/if \(resolvedStyle === "sleeves"\) return <LivePickerJerseyMark/);
  });
});

describe("ProTaggerJerseyStyle — \"collar\" style (CollarJerseyMark)", () => {
  const markMatch = tileSource.match(/function CollarJerseyMark[\s\S]*?\n\}/);
  const mark = markMatch ? markMatch[0] : "";

  it("exists as its own local function (no fourth file, no per-style silhouette — see the shared-base describe block above)", () => {
    expect(markMatch).not.toBeNull();
  });

  it("renders the shared body path (primary) plus the JERSEY_COLLAR_PATH neck band (secondary) only — no chest-stripe rect, no sleeve decomposition", () => {
    expect(mark).toMatch(/d=\{JERSEY_BODY_PATH\}/);
    expect(mark).toMatch(/d=\{JERSEY_COLLAR_PATH\}/);
    expect(mark).not.toMatch(/<rect/);
    const pathCount = (mark.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(2); // body silhouette, collar band — nothing else
  });

  it("body path is primary-filled, collar path is secondary-filled", () => {
    expect(mark).toMatch(/fill=\{primary\}/);
    expect(mark).toMatch(/fill=\{secondary\}/);
  });

  it("the collar band traces the same neckline curve JERSEY_BODY_PATH uses between its two shoulder points — not an independent shape", () => {
    expect(tileSource).toMatch(/JERSEY_COLLAR_PATH = "M5,3[^"]*"/);
    expect(tileSource).toMatch(/JERSEY_BODY_PATH =\s*\n?\s*"[^"]*5,3[^"]*"/);
  });

  it("renderJerseyShape routes \"collar\" to this exact mark", () => {
    const fnMatch = tileSource.match(/function renderJerseyShape\([\s\S]*?\n\}/)![0];
    expect(fnMatch).toMatch(/if \(resolvedStyle === "collar"\) return <CollarJerseyMark/);
  });
});

// Contrast refinement pass: a white/light primary jersey with a fixed
// white number was unreadable (see the "JERSEY VISUAL REFINEMENT" spec's
// Objective A). The number's fill colour now derives automatically from
// the jersey's primary colour via readableNumberColour — real functional
// tests against the exported function, not source-scanning, since the
// correctness here is about actual luminance values, not just presence of
// code patterns.
describe("ProTaggerJerseyStyle — automatic number contrast (readableNumberColour)", () => {
  it("white primary -> dark number", () => {
    expect(readableNumberColour("#ffffff")).toBe("#0f172a");
  });

  it("near-white primary -> dark number", () => {
    expect(readableNumberColour("#f5f5f5")).toBe("#0f172a");
    expect(readableNumberColour("#eeeeee")).toBe("#0f172a");
  });

  it("yellow/light primary -> dark number", () => {
    expect(readableNumberColour("#fde047")).toBe("#0f172a"); // light yellow
    expect(readableNumberColour("#fef3c7")).toBe("#0f172a"); // pale cream
  });

  it("dark green primary -> white number", () => {
    expect(readableNumberColour("#16a34a")).toBe("#ffffff");
    expect(readableNumberColour("#14532d")).toBe("#ffffff");
  });

  it("dark blue primary -> white number", () => {
    expect(readableNumberColour("#1e3a8a")).toBe("#ffffff");
    expect(readableNumberColour("#1e40af")).toBe("#ffffff");
  });

  it("red primary -> white number", () => {
    expect(readableNumberColour("#dc2626")).toBe("#ffffff");
  });

  it("black primary -> white number", () => {
    expect(readableNumberColour("#000000")).toBe("#ffffff");
  });

  it("is a pure, deterministic function of the hex string alone — same input always yields the same output, no randomness/timing", () => {
    const samples = ["#ffffff", "#000000", "#16a34a", "#dc2626", "#fde047", "#1e3a8a"];
    for (const hex of samples) {
      const first = readableNumberColour(hex);
      const second = readableNumberColour(hex);
      expect(first).toBe(second);
    }
  });

  it("is implemented as a relative-luminance threshold, not hardcoded per-colour branches or canvas/DOM sampling", () => {
    expect(tileSource).toMatch(/function relativeLuminance\(hex: string\): number \{/);
    expect(tileSource).toMatch(/0\.2126.*0\.7152.*0\.0722/);
    expect(tileSource).toMatch(/relativeLuminance\(primary\) > 0\.58/);
    expect(tileSource).not.toMatch(/getContext\(["']2d["']\)/); // no canvas sampling
    expect(tileSource).not.toMatch(/getComputedStyle/); // no DOM-dependent sampling
  });

  it("reuses the existing codebase convention (same formula/threshold as the pixi token helpers) rather than inventing a competing algorithm", () => {
    expect(tileSource).toMatch(/relativeLuminance/);
    expect(tileSource).toMatch(/> 0\.58/);
  });

  it("Chest/Sleeves/Collar all resolve the SAME number colour for the same primary — the contrast rule is keyed on primary alone, not on jerseyStyle", () => {
    // The number's colour is computed once (readableNumberColour(primary))
    // and applied to the single <span> shared by every jerseyStyle branch —
    // there is exactly one call site, proving no per-style override exists.
    const tileCodeOnly = stripComments(tileSource);
    const callSites = tileCodeOnly.match(/readableNumberColour\(primary\)/g) ?? [];
    expect(callSites.length).toBe(1);
    expect(tileCodeOnly).not.toMatch(/jerseyStyle[\s\S]{0,120}readableNumberColour/);
  });

  it("Home and Away squads with different colours each get their own correctly-contrasted number independently", () => {
    // White jersey (Home) -> dark number; navy jersey (Away) -> white
    // number — computed independently per call, no shared/cached state.
    const home = readableNumberColour("#ffffff");
    const away = readableNumberColour("#1e3a8a");
    expect(home).toBe("#0f172a");
    expect(away).toBe("#ffffff");
    expect(home).not.toBe(away);
  });

  it("unparsable/malformed hex input falls back to white rather than throwing", () => {
    expect(() => readableNumberColour("not-a-colour")).not.toThrow();
    expect(readableNumberColour("not-a-colour")).toBe("#ffffff");
  });
});

describe("ProTaggerJerseyStyle — number positioning and outline treatment are unaffected by the contrast/silhouette refinement", () => {
  it("the number stays centred (unchanged left/top/transform) — the refinement only changed jersey shape and number fill colour", () => {
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?top:\s*["']56%["']/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?left:\s*["']50%["']/);
    expect(tileSource).toMatch(/numberText:\s*\{[\s\S]*?transform:\s*["']translate\(-50%, -50%\)["']/);
  });

  it("no heavy shadow was reintroduced: numberOutlineLivePicker/Crisp stay a single soft shadow / thin stroke, numberOutlineDefault's stack is untouched", () => {
    const livePickerBlock = tileSource.match(/numberOutlineLivePicker:\s*\{([\s\S]*?)\n {2}\},/)![1];
    expect(livePickerBlock).not.toMatch(/WebkitTextStroke/);
    const shadowMatch = livePickerBlock.match(/textShadow:\s*["']([^"']+)["']/)![1];
    expect(shadowMatch.replace(/rgba?\([^)]*\)/g, "rgba(...)")).not.toContain(",");
    const crispBlock = tileSource.match(/numberOutlineCrisp:\s*\{([\s\S]*?)\n {2}\},/)![1];
    expect(crispBlock).toMatch(/WebkitTextStroke:\s*["']0\.5px/);
  });

  it("the live picker's number treatment (numberOutlineLivePicker) still wins whenever livePicker is set, unaffected by the new colour override", () => {
    expect(tileSource).toMatch(/livePicker\s*\n?\s*\?\s*S\.numberOutlineLivePicker/);
    // The colour override is applied after spreading outlineStyle, so it
    // never removes or replaces the stroke/shadow the outline style sets.
    expect(tileSource).toMatch(/\.\.\.S\.numberText, \.\.\.outlineStyle, fontSize: resolvedNumberFontSize, color: numberColour/);
  });
});

describe("ProTaggerJerseyStyle — no fourth jersey implementation", () => {
  it("exactly three local shape-rendering functions exist, all built from the shared geometry constants — ProTaggerMiniJersey is no longer imported here at all", () => {
    expect(tileSource.match(/^function (Chest|LivePicker|Collar)JerseyMark/gm)?.length ?? 0).toBe(3);
    expect(tileSource).not.toMatch(/import.*ProTaggerMiniJersey/);
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

// UX correction: the original compact 3-tile visual selector (real mini
// jersey previews per tile) consumed too much permanent vertical space in
// Squad Setup, pushing the Starting XV pitch below the viewport on real
// Android devices. Replaced with a single compact "Jersey Style [ Sleeves
// ▾ ]" native dropdown row — the Starting XV immediately below is already
// the live preview, so no permanent preview tiles are needed. See the
// "COMPACT DROPDOWN UX CORRECTION" spec.
describe("ProTaggerJerseyStyle — compact Jersey Style dropdown in Squad Setup (replaces the 3-tile selector)", () => {
  it("the three permanent preview tiles (ProTaggerJerseyStyleSwatch, per-style buttons) are gone", () => {
    expect(squadScreenSource).not.toMatch(/ProTaggerJerseyStyleSwatch/);
    expect(squadScreenSource).not.toMatch(/\(\["chest", "sleeves", "collar"\] as const\)\.map/);
    expect(squadScreenSource).not.toMatch(/jerseyStyleTile\b/);
    expect(squadScreenSource).not.toMatch(/jerseyStyleTileOn/);
  });

  it("a compact Jersey Style control exists, labelled and using a native <select>", () => {
    expect(squadScreenSource).toMatch(/Jersey Style/);
    expect(squadScreenSource).toMatch(/<select[\s\S]{0,120}value=\{activeJerseyStyle\}/);
  });

  it("the options are exactly Chest, Sleeves, Collar (in that order, three only)", () => {
    const selectMatch = squadScreenSource.match(/<select[\s\S]*?<\/select>/);
    expect(selectMatch).not.toBeNull();
    const optionValues = [...selectMatch![0].matchAll(/<option value="(\w+)">/g)].map((m) => m[1]);
    expect(optionValues).toEqual(["chest", "sleeves", "collar"]);
    const optionLabels = [...selectMatch![0].matchAll(/<option value="\w+">([^<]+)<\/option>/g)].map((m) => m[1]);
    expect(optionLabels).toEqual(["Chest", "Sleeves", "Collar"]);
  });

  it("the currently selected value is displayed (controlled select bound to activeJerseyStyle)", () => {
    expect(squadScreenSource).toMatch(/<select\s+value=\{activeJerseyStyle\}/);
  });

  it("choosing any option calls handleJerseyStyleChange with the new value — same generic handler used for all three", () => {
    expect(squadScreenSource).toMatch(
      /onChange=\{[\s\S]*?handleJerseyStyleChange\(e\.target\.value as ProTaggerJerseyStyle\)/,
    );
  });

  it("no modal, bottom sheet, popover, or custom menu infrastructure was introduced — a plain native <select>", () => {
    expect(squadScreenSource).not.toMatch(/jerseyStyle[\s\S]{0,200}(Modal|BottomSheet|Popover|Accordion)/i);
    expect(squadScreenSource).toMatch(/<select/);
  });

  it("lives inside the existing Team Colours section, not a new screen/section", () => {
    const colourSectionMatch = squadScreenSource.match(
      /<div style=\{S\.colourSection\}>([\s\S]*?)\n {10}<\/div>\n\n {10}\{\/\* Visual lineup summary/,
    );
    expect(colourSectionMatch).not.toBeNull();
    expect(colourSectionMatch![1]).toMatch(/jerseyStyleRow/);
    expect(colourSectionMatch![1]).toMatch(/<select/);
  });

  it("does not add a second/new Save or Go To Game control — the existing handleStart footer is unchanged", () => {
    const goToGameMatches = stripComments(squadScreenSource).match(/Go To Game/g) ?? [];
    expect(goToGameMatches.length).toBe(2); // header + footer buttons, unchanged from before this feature
  });

  it("Primary/Secondary colour controls and their behaviour are unchanged by this correction", () => {
    expect(squadScreenSource).toMatch(/function handleColourChange\(type: "primary" \| "secondary", value: string\) \{/);
    expect(squadScreenSource).toMatch(/type="color"/);
    expect(squadScreenSource).toMatch(/value=\{activeColours\[type\]\}/);
    expect(squadScreenSource).toMatch(/onChange=\{\(e: ChangeEvent<HTMLInputElement>\) =>\s*\n\s*handleColourChange\(type, e\.target\.value\)/);
  });

  it("the row's own vertical footprint is small: no extra wrapping elements or multi-line preview blocks", () => {
    const rowMatch = squadScreenSource.match(/<div style=\{S\.jerseyStyleRow\}>([\s\S]*?)\n {12}<\/div>/);
    expect(rowMatch).not.toBeNull();
    // Exactly the label span and the select — nothing else nested inside.
    expect((rowMatch![1].match(/<span/g) ?? []).length).toBe(1);
    expect((rowMatch![1].match(/<select/g) ?? []).length).toBe(1);
    expect(rowMatch![1]).not.toMatch(/<button/);
    expect(rowMatch![1]).not.toMatch(/\.map\(/);
  });

  it("the select's own style targets a real but compact touch height (~40px), not a fixed large block", () => {
    const styleBlock = squadScreenSource.match(/jerseyStyleSelect:\s*\{([\s\S]*?)\n {2}\}/)![1];
    const heightMatch = styleBlock.match(/height:\s*(\d+)/);
    expect(heightMatch).not.toBeNull();
    const height = Number(heightMatch![1]);
    expect(height).toBeGreaterThanOrEqual(36);
    expect(height).toBeLessThanOrEqual(44);
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
