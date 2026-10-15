import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  ProTaggerLineupPitchBackground,
  LINEUP_PITCH_PORTRAIT_VIEWBOX,
} from "../pro-tagger/ProTaggerLineupPitchBackground";
import { LINEUP_FORMATION_POSITIONS } from "../pro-tagger/pro-tagger-lineup-geometry";
import { TeamSheetJerseyTile } from "./TeamSheetJerseyTile";
import { TeamSheetSubTile } from "./TeamSheetSubTile";
import { buildSubstitute, loadTeamSheet, saveTeamSheet } from "./team-sheet-storage";
import { JERSEY_ASPECT } from "./team-sheet-jersey";
import { kitsForRole, PRESET_KITS, resolveKit, type TeamSheetKit } from "./team-sheet-kits";
import { loadUserKitRecords, userKitRecordToKit } from "./team-sheet-kit-store";
import { useKitImageSrc } from "./useKitImageSrc";
import type { TeamSheetPlayer } from "./team-sheet-types";

// Ballylanders internal Team Sheet — personal tool, not a public PáircVision
// feature. Reuses only the pure, stateless pitch/formation primitives from
// Event Stats' Squad Builder (ProTaggerLineupPitchBackground.tsx,
// LINEUP_FORMATION_POSITIONS) — both take no session/match state, so this
// screen has zero coupling to ProTaggerSession or Event Stats state. It
// defines its own local player type and its own localStorage key rather
// than reusing any pro-tagger squad/session module.

const JERSEY_SIZE = 46;

function navigateToInternal() {
  if (typeof window !== "undefined") window.location.assign("/internal");
}

export default function TeamSheetScreen() {
  const initial = useState(() => loadTeamSheet())[0];
  const [players, setPlayers] = useState<TeamSheetPlayer[]>(initial.players);
  const [substitutes, setSubstitutes] = useState<TeamSheetPlayer[]>(initial.substitutes);
  const [team] = useState(initial.team);
  const [kitSelection, setKitSelection] = useState(initial.kits);
  // Presets plus any user kits saved on this device (none until the Kit
  // Builder lands). Metadata is synchronous; images resolve per kit below.
  const [allKits] = useState<TeamSheetKit[]>(() => [...PRESET_KITS, ...loadUserKitRecords().map(userKitRecordToKit)]);
  const outfieldKit = resolveKit(allKits, kitSelection.outfieldKitId, "outfield");
  const gkKit = resolveKit(allKits, kitSelection.gkKitId, "gk");
  const kitSrcs = { outfield: useKitImageSrc(outfieldKit), gk: useKitImageSrc(gkKit) };
  const [screenshotMode, setScreenshotMode] = useState(false);

  useEffect(() => {
    saveTeamSheet({ players, substitutes, team, kits: kitSelection });
  }, [players, substitutes, team, kitSelection]);

  const setName = useCallback((slotIndex: number, name: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], name };
      return next;
    });
  }, []);

  const addSubstitute = useCallback(() => {
    setSubstitutes((prev) => {
      const nextNumber = prev.length === 0 ? 16 : Math.max(...prev.map((s) => s.number)) + 1;
      return [...prev, buildSubstitute(nextNumber)];
    });
  }, []);

  const setSubNumber = useCallback((id: string, number: number) => {
    setSubstitutes((prev) => prev.map((s) => (s.id === id ? { ...s, number } : s)));
  }, []);

  const setSubName = useCallback((id: string, name: string) => {
    setSubstitutes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const removeSubstitute = useCallback((id: string) => {
    setSubstitutes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Screenshot Mode never shows a blank sub with no name typed in yet —
  // only substitutes the coach actually entered appear in the capture.
  const subsForScreenshot = substitutes.filter((s) => s.name.trim());

  return (
    <div
      style={S.shell}
      onClick={screenshotMode ? () => setScreenshotMode(false) : undefined}
    >
      {!screenshotMode && (
        <div style={S.header}>
          <button type="button" style={S.backBtn} onClick={navigateToInternal}>
            ← Internal
          </button>
          <span style={S.title}>Team Sheet</span>
          <button
            type="button"
            style={S.screenshotBtn}
            onClick={(e) => {
              e.stopPropagation();
              setScreenshotMode(true);
            }}
          >
            Screenshot Mode
          </button>
        </div>
      )}

      <div style={S.content}>
        <div style={S.heading}>
          <span style={S.headingClub}>{team.name}</span>
          <span style={S.headingSub}>Starting XV</span>
        </div>

        {!screenshotMode && (
          <div style={S.kitPickers}>
            <KitPicker
              label="Outfield jersey"
              kits={kitsForRole(allKits, team.id, "outfield")}
              selectedId={outfieldKit.id}
              onSelect={(id) => setKitSelection((prev) => ({ ...prev, outfieldKitId: id }))}
            />
            <KitPicker
              label="Goalkeeper jersey"
              caption="GK"
              kits={kitsForRole(allKits, team.id, "gk")}
              selectedId={gkKit.id}
              onSelect={(id) => setKitSelection((prev) => ({ ...prev, gkKitId: id }))}
            />
          </div>
        )}

        <div
          style={{
            ...S.pitchBox,
            aspectRatio: `${LINEUP_PITCH_PORTRAIT_VIEWBOX.w} / ${LINEUP_PITCH_PORTRAIT_VIEWBOX.h}`,
          }}
        >
          <ProTaggerLineupPitchBackground />
          {Object.entries(LINEUP_FORMATION_POSITIONS).map(([slotKey, pos]) => {
            const slot = Number(slotKey);
            const player = players[slot - 1];
            if (!player) return null;
            return (
              <div key={player.id} style={{ ...S.slot, left: `${pos.x}%`, top: `${pos.y}%` }}>
                <TeamSheetJerseyTile
                  player={player}
                  editable={!screenshotMode}
                  kitSrcs={kitSrcs}
                  size={JERSEY_SIZE}
                  onNameChange={(name) => setName(slot - 1, name)}
                  showNumberOverlay={false}
                />
              </div>
            );
          })}
        </div>

        {screenshotMode ? (
          subsForScreenshot.length > 0 && (
            <div style={S.subsSection}>
              <span style={S.subsLabel}>Substitutes</span>
              <div style={S.subsRow}>
                {subsForScreenshot.map((sub) => (
                  <TeamSheetSubTile key={sub.id} player={sub} editable={false} kitSrcs={kitSrcs} />
                ))}
              </div>
            </div>
          )
        ) : substitutes.length === 0 ? (
          <button type="button" style={S.addSubsBtn} onClick={(e) => { e.stopPropagation(); addSubstitute(); }}>
            + Add Subs
          </button>
        ) : (
          <div style={S.subsSection} onClick={(e) => e.stopPropagation()}>
            <span style={S.subsLabel}>Substitutes</span>
            <div style={S.subsList}>
              {substitutes.map((sub) => (
                <TeamSheetSubTile
                  key={sub.id}
                  player={sub}
                  editable
                  kitSrcs={kitSrcs}
                  onNumberChange={(number) => setSubNumber(sub.id, number)}
                  onNameChange={(name) => setSubName(sub.id, name)}
                  onRemove={() => removeSubstitute(sub.id)}
                />
              ))}
            </div>
            <button type="button" style={S.addSubBtn} onClick={addSubstitute}>
              + Add Sub
            </button>
          </div>
        )}

        {!screenshotMode && (
          <p style={S.hint}>Tap a name to edit it. Screenshot Mode hides every control — tap anywhere to exit it.</p>
        )}
      </div>
    </div>
  );
}

function KitPicker({
  label,
  caption,
  kits,
  selectedId,
  onSelect,
}: {
  label: string;
  caption?: string;
  kits: TeamSheetKit[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={S.jerseyPicker} role="radiogroup" aria-label={label}>
      {caption && <span style={S.jerseyPickerCaption}>{caption}</span>}
      {kits.map((kit) => (
        <KitOption key={kit.id} kit={kit} selected={kit.id === selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function KitOption({ kit, selected, onSelect }: { kit: TeamSheetKit; selected: boolean; onSelect: (id: string) => void }) {
  const src = useKitImageSrc(kit);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      style={selected ? { ...S.jerseyOption, ...S.jerseyOptionSelected } : S.jerseyOption}
      onClick={() => onSelect(kit.id)}
    >
      <img src={src} alt="" width={22} height={Math.round(22 * JERSEY_ASPECT)} style={S.jerseyOptionImg} draggable={false} />
      {kit.name}
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100dvh",
    width: "100%",
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none" as const,
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px 8px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "-0.3px",
    flex: 1,
    textAlign: "center" as const,
  },
  screenshotBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 12px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
  },
  heading: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
  },
  headingClub: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: "0.04em",
    color: "#f1f7f0",
    textTransform: "uppercase" as const,
  },
  headingSub: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
  },
  kitPickers: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    width: "100%",
    maxWidth: 380,
  },
  jerseyPicker: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  // flex: 2 + the gap keeps a lone GK option aligned under the third
  // outfield option rather than stretching across the row.
  jerseyPickerCaption: {
    flex: 2,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#7a95ad",
    textAlign: "right" as const,
    paddingRight: 4,
  },
  jerseyOption: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    cursor: "pointer",
    outline: "none",
    fontFamily: "inherit",
  },
  jerseyOptionSelected: {
    background: "#0a2134",
    border: "1px solid #2ea043",
    color: "#ffffff",
  },
  jerseyOptionImg: {
    display: "block",
    objectFit: "contain" as const,
    pointerEvents: "none",
  },
  pitchBox: {
    position: "relative",
    width: "100%",
    maxWidth: 380,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #17324a",
  },
  slot: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
  },
  hint: {
    margin: 0,
    fontSize: 11,
    color: "#5e7a8a",
    textAlign: "center" as const,
    maxWidth: 300,
  },
  addSubsBtn: {
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 16px",
    cursor: "pointer",
    outline: "none",
  },
  subsSection: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 380,
  },
  subsLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
  },
  subsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  subsList: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
  },
  addSubBtn: {
    marginTop: 6,
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 16px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
  },
};
