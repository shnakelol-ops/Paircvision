import { useCallback, useEffect, useRef, useState } from "react";
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
import { DEFAULT_KIT_SELECTION, kitsForRole, PRESET_KITS, resolveKit, type KitRole, type TeamSheetKit } from "./team-sheet-kits";
import {
  deleteUserKit,
  loadUserKitRecords,
  userKitRecordToKit,
  type KitImageBackend,
  type UserKitRecord,
} from "./team-sheet-kit-store";
import { useKitImage, useKitImageSrc } from "./useKitImageSrc";
import { ACCEPT_ATTRIBUTE, browserKitImageCodec, type KitImageCodec } from "./kit-image-codec";
import { KitUploadSheet } from "./KitUploadSheet";
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

interface TeamSheetScreenProps {
  /** Test seams; the app uses IndexedDB and the real canvas codec. */
  kitImageBackend?: KitImageBackend;
  kitImageCodec?: KitImageCodec;
}

export default function TeamSheetScreen({ kitImageBackend, kitImageCodec = browserKitImageCodec }: TeamSheetScreenProps = {}) {
  const initial = useState(() => loadTeamSheet())[0];
  const [players, setPlayers] = useState<TeamSheetPlayer[]>(initial.players);
  const [substitutes, setSubstitutes] = useState<TeamSheetPlayer[]>(initial.substitutes);
  const [team] = useState(initial.team);
  const [kitSelection, setKitSelection] = useState(initial.kits);
  // Presets plus user kits saved on this device. Metadata is synchronous;
  // images resolve per kit below.
  const [allKits, setAllKits] = useState<TeamSheetKit[]>(() => [...PRESET_KITS, ...loadUserKitRecords().map(userKitRecordToKit)]);
  const outfieldKit = resolveKit(allKits, kitSelection.outfieldKitId, "outfield");
  const gkKit = resolveKit(allKits, kitSelection.gkKitId, "gk");
  const outfieldImage = useKitImage(outfieldKit, kitImageBackend);
  const gkImage = useKitImage(gkKit, kitImageBackend);
  const kitSrcs = { outfield: outfieldImage.src, gk: gkImage.src };
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userKitCount = allKits.filter((k) => k.source === "user").length;

  const onKitSaved = useCallback((record: UserKitRecord) => {
    const kit = userKitRecordToKit(record);
    setAllKits((prev) => [...prev, kit]);
    setKitSelection((prev) => (kit.role === "gk" ? { ...prev, gkKitId: kit.id } : { ...prev, outfieldKitId: kit.id }));
    setUploadFile(null);
  }, []);

  const removeUserKit = useCallback(
    (kit: TeamSheetKit) => {
      setAllKits((prev) => prev.filter((k) => k.id !== kit.id));
      setKitSelection((prev) =>
        kit.role === "gk"
          ? { ...prev, gkKitId: prev.gkKitId === kit.id ? DEFAULT_KIT_SELECTION.gkKitId : prev.gkKitId }
          : { ...prev, outfieldKitId: prev.outfieldKitId === kit.id ? DEFAULT_KIT_SELECTION.outfieldKitId : prev.outfieldKitId },
      );
      void deleteUserKit(kit.id, kitImageBackend);
    },
    [kitImageBackend],
  );

  // Selected uploaded kits, with whether their saved image could be loaded.
  const selectedUserKits = [
    { kit: outfieldKit, status: outfieldImage.status },
    { kit: gkKit, status: gkImage.status },
  ].filter((entry) => entry.kit.source === "user");

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
              backend={kitImageBackend}
              kits={kitsForRole(allKits, team.id, "outfield")}
              selectedId={outfieldKit.id}
              onSelect={(id) => setKitSelection((prev) => ({ ...prev, outfieldKitId: id }))}
            />
            <KitPicker
              label="Goalkeeper jersey"
              caption="GK"
              backend={kitImageBackend}
              kits={kitsForRole(allKits, team.id, "gk")}
              selectedId={gkKit.id}
              onSelect={(id) => setKitSelection((prev) => ({ ...prev, gkKitId: id }))}
            />
            <button type="button" style={S.addKitBtn} onClick={() => fileInputRef.current?.click()}>
              + Add jersey
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              style={{ display: "none" }}
              data-testid="kit-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) setUploadFile(file);
              }}
            />
            {selectedUserKits.map(({ kit, status }) => (
              <div
                key={kit.id}
                style={status === "missing" ? { ...S.kitNotice, ...S.kitNoticeWarn } : S.kitNotice}
                role={status === "missing" ? "alert" : undefined}
              >
                <span>
                  {status === "missing"
                    ? `The saved image for “${kit.name}” is missing on this device, so the default ${roleLabel(kit.role)} jersey is shown.`
                    : `“${kit.name}” is your ${roleLabel(kit.role)} jersey.`}
                </span>
                <button type="button" style={S.kitNoticeBtn} onClick={() => removeUserKit(kit)}>
                  Remove kit
                </button>
              </div>
            ))}
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

      {uploadFile && (
        <KitUploadSheet
          file={uploadFile}
          teamId={team.id}
          defaultName={`Kit ${userKitCount + 1}`}
          codec={kitImageCodec}
          backend={kitImageBackend}
          onSaved={onKitSaved}
          onClose={() => setUploadFile(null)}
        />
      )}
    </div>
  );
}

function roleLabel(role: KitRole): string {
  return role === "gk" ? "goalkeeper" : "outfield";
}

function KitPicker({
  label,
  caption,
  backend,
  kits,
  selectedId,
  onSelect,
}: {
  label: string;
  caption?: string;
  backend?: KitImageBackend;
  kits: TeamSheetKit[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={caption ? S.jerseyPickerCaptioned : S.jerseyPicker} role="radiogroup" aria-label={label}>
      {caption && <span style={S.jerseyPickerCaption}>{caption}</span>}
      {kits.map((kit) => (
        <KitOption
          key={kit.id}
          kit={kit}
          backend={backend}
          inGrid={!caption}
          selected={kit.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function KitOption({
  kit,
  backend,
  inGrid,
  selected,
  onSelect,
}: {
  kit: TeamSheetKit;
  backend?: KitImageBackend;
  inGrid: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const src = useKitImageSrc(kit, backend);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      style={{ ...S.jerseyOption, ...(inGrid ? S.jerseyOptionInGrid : null), ...(selected ? S.jerseyOptionSelected : null) }}
      onClick={() => onSelect(kit.id)}
    >
      <img src={src} alt="" width={22} height={Math.round(22 * JERSEY_ASPECT)} style={S.jerseyOptionImg} draggable={false} />
      <span style={S.jerseyOptionName}>{kit.name}</span>
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
  // Three equal columns — exactly the preset layout — so uploaded kits add
  // rows in the same columns instead of squeezing or stretching options.
  jerseyPicker: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  // The captioned GK row keeps its original flex layout (pixel-identical to
  // before uploads existed); extra GK kits wrap onto a new line.
  jerseyPickerCaptioned: {
    display: "flex",
    flexWrap: "wrap" as const,
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
  // Lets a long kit name ellipsise inside its grid column instead of overflowing it.
  jerseyOptionInGrid: {
    minWidth: 0,
  },
  jerseyOptionName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  addKitBtn: {
    alignSelf: "flex-end",
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    cursor: "pointer",
    outline: "none",
    fontFamily: "inherit",
  },
  kitNotice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    lineHeight: 1.35,
    color: "#7a95ad",
  },
  kitNoticeWarn: {
    color: "#fbbf24",
  },
  kitNoticeBtn: {
    flexShrink: 0,
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 11,
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
