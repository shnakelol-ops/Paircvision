import { useState, useCallback } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import type {
  ProTaggerSession,
  ProTaggerSquadPlayer,
  ProTaggerAttackDirection,
} from "./pro-tagger-session";
import {
  loadSavedTeams,
  saveTeam,
  deleteTeam,
  exportTeamAsSquad,
  buildNewTeam,
} from "./pro-tagger-team-storage";
import type { SavedTeam } from "./pro-tagger-team-storage";

interface Props {
  session: ProTaggerSession;
  onBack: () => void;
  onStart: (session: ProTaggerSession) => void;
}

type TeamTab   = "home" | "away";
type ColourSet = { primary: string; secondary: string };
type SaveStatus = "idle" | "success" | "full";

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ProTaggerSquadScreen({ session, onBack, onStart }: Props) {
  const [activeTab, setActiveTab]     = useState<TeamTab>("home");
  const [homePlayers, setHomePlayers] = useState<ProTaggerSquadPlayer[]>(
    () => session.homeSquad.players.map((p) => ({ ...p })),
  );
  const [awayPlayers, setAwayPlayers] = useState<ProTaggerSquadPlayer[]>(
    () => session.awaySquad.players.map((p) => ({ ...p })),
  );
  const [homeColours, setHomeColours] = useState<ColourSet>({
    primary:   session.homeSquad.primaryColour   ?? "#16a34a",
    secondary: session.homeSquad.secondaryColour ?? "#ffffff",
  });
  const [awayColours, setAwayColours] = useState<ColourSet>({
    primary:   session.awaySquad.primaryColour   ?? "#dc2626",
    secondary: session.awaySquad.secondaryColour ?? "#ffffff",
  });
  const [homeSquadTeamName, setHomeSquadTeamName] = useState<string | undefined>(
    session.homeSquad.teamName,
  );
  const [awaySquadTeamName, setAwaySquadTeamName] = useState<string | undefined>(
    session.awaySquad.teamName,
  );

  // 1H attacking direction — seeded from the session (single source of truth,
  // set to its default in Setup) and finalised back onto the session at Go To
  // Game. Both Go To Game buttons on this screen read from this state.
  const [attackDir, setAttackDir] = useState<ProTaggerAttackDirection>(
    session.attackDirection,
  );

  // Library overlay
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [savedTeams, setSavedTeams]   = useState<SavedTeam[]>([]);

  // Save prompt overlay
  const [saveOpen, setSaveOpen]       = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle");

  const homeLabel     = session.homeTeamName.trim() || "Home";
  const awayLabel     = session.awayTeamName.trim() || "Away";
  const activeLabel   = activeTab === "home" ? homeLabel : awayLabel;
  const players       = activeTab === "home" ? homePlayers : awayPlayers;
  const activeColours = activeTab === "home" ? homeColours : awayColours;

  const setName = useCallback(
    (team: TeamTab, index: number, name: string) => {
      const setter = team === "home" ? setHomePlayers : setAwayPlayers;
      setter((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], name };
        return next;
      });
    },
    [],
  );

  function handleColourChange(type: "primary" | "secondary", value: string) {
    if (activeTab === "home") {
      setHomeColours((prev) => ({ ...prev, [type]: value }));
    } else {
      setAwayColours((prev) => ({ ...prev, [type]: value }));
    }
  }

  function addPlayer() {
    const current = activeTab === "home" ? homePlayers : awayPlayers;
    if (current.length >= 30) return;
    const setter = activeTab === "home" ? setHomePlayers : setAwayPlayers;
    setter((prev) => [
      ...prev,
      { id: genId(), number: prev.length + 1, name: "", position: "SUB" },
    ]);
  }

  // ── Library ──────────────────────────────────────────────────────────────

  function openLibrary() {
    setSavedTeams(loadSavedTeams());
    setLibraryOpen(true);
  }

  function closeLibrary() {
    setLibraryOpen(false);
  }

  function loadTeam(team: SavedTeam) {
    const side  = activeTab === "home" ? "HOME" : "AWAY";
    const squad = exportTeamAsSquad(team, side);
    const playerSetter = activeTab === "home" ? setHomePlayers : setAwayPlayers;
    const colourSetter = activeTab === "home" ? setHomeColours : setAwayColours;
    const nameSetter   = activeTab === "home" ? setHomeSquadTeamName : setAwaySquadTeamName;
    playerSetter(squad.players);
    colourSetter({ primary: team.primaryColour, secondary: team.secondaryColour });
    nameSetter(team.teamName);
    setLibraryOpen(false);
  }

  function removeTeam(id: string) {
    deleteTeam(id);
    setSavedTeams((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Save prompt ──────────────────────────────────────────────────────────

  function openSave() {
    const fallback = activeLabel === "Home" || activeLabel === "Away" ? "" : activeLabel;
    setSaveName(fallback);
    setSaveStatus("idle");
    setSaveOpen(true);
  }

  function closeSave() {
    setSaveOpen(false);
  }

  function confirmSave() {
    const currentPlayers = activeTab === "home" ? homePlayers : awayPlayers;
    const currentColours = activeTab === "home" ? homeColours : awayColours;
    const team = buildNewTeam({
      teamName:        saveName.trim() || activeLabel,
      primaryColour:   currentColours.primary,
      secondaryColour: currentColours.secondary,
      players: currentPlayers.map((p) => ({
        id:       p.id,
        number:   p.number,
        name:     p.name,
        position: p.position,
      })),
    });
    const ok = saveTeam(team);
    if (ok) {
      setSaveStatus("success");
      setTimeout(() => setSaveOpen(false), 900);
    } else {
      setSaveStatus("full");
    }
  }

  // ── Start match ──────────────────────────────────────────────────────────

  function handleStart() {
    onStart({
      ...session,
      attackDirection: attackDir,
      homeSquad: {
        ...session.homeSquad,
        players:         homePlayers,
        primaryColour:   homeColours.primary,
        secondaryColour: homeColours.secondary,
        teamName:        homeSquadTeamName,
      },
      awaySquad: {
        ...session.awaySquad,
        players:         awayPlayers,
        primaryColour:   awayColours.primary,
        secondaryColour: awayColours.secondary,
        teamName:        awaySquadTeamName,
      },
    });
  }

  return (
    <div style={S.shell}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Back</button>
        <span style={S.title}>Squads</span>
        <button style={S.startBtn} onClick={handleStart}>Go To Game</button>
      </div>

      {/* ── Team tabs ──────────────────────────────────────────────── */}
      <div style={S.tabs}>
        <button
          style={{ ...S.tab, ...(activeTab === "home" ? S.tabOn : {}) }}
          onClick={() => setActiveTab("home")}
        >
          {homeLabel}
        </button>
        <button
          style={{ ...S.tab, ...(activeTab === "away" ? S.tabOn : {}) }}
          onClick={() => setActiveTab("away")}
        >
          {awayLabel}
        </button>
      </div>

      {/* ── Library toolbar ────────────────────────────────────────── */}
      <div style={S.libraryBar}>
        <button style={S.libBtn} onClick={openLibrary}>↓ Load Team</button>
        <button style={S.libBtn} onClick={openSave}>↑ Save Team</button>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <div style={S.list}>
        <div style={S.listInner}>

          {/* Team colours */}
          <div style={S.colourSection}>
            <span style={S.colourHeading}>Team Colours</span>
            <div style={S.colourRow}>
              <ProTaggerMiniJersey
                primary={activeColours.primary}
                secondary={activeColours.secondary}
                size={32}
              />
              {(["primary", "secondary"] as const).map((type) => (
                <div key={type} style={S.colourItem}>
                  <span style={S.colourItemLabel}>
                    {type === "primary" ? "Primary" : "Secondary"}
                  </span>
                  <input
                    type="color"
                    value={activeColours[type]}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      handleColourChange(type, e.target.value)
                    }
                    style={{
                      ...S.colourInput,
                      background: activeColours[type],
                      outline: `2px solid ${activeColours[type]}`,
                      outlineOffset: 2,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Player rows */}
          {players.map((p, i) => (
            <div key={p.id} style={S.row}>
              <span style={S.number}>{p.number}</span>
              <span style={S.position}>{p.position ?? "—"}</span>
              <input
                type="text"
                placeholder={`#${p.number}`}
                value={p.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setName(activeTab, i, e.target.value)
                }
                style={S.nameInput}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          ))}

          {/* Add Player control */}
          {players.length < 30 ? (
            <button style={S.addBtn} onClick={addPlayer}>
              + Add Player
              <span style={S.addCount}>{players.length} / 30</span>
            </button>
          ) : (
            <div style={S.addMax}>Squad full (30 / 30)</div>
          )}

        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div style={S.footer}>
        <div style={S.directionSection}>
          <span style={S.directionLabel}>1H Attacking Direction</span>
          <div style={S.directionChips}>
            <button
              onClick={() => setAttackDir("left")}
              style={{ ...S.directionChip, ...(attackDir === "left" ? S.directionChipOn : {}) }}
            >
              ← Left
            </button>
            <button
              onClick={() => setAttackDir("right")}
              style={{ ...S.directionChip, ...(attackDir === "right" ? S.directionChipOn : {}) }}
            >
              Right →
            </button>
          </div>
        </div>
        <button style={S.footerStartBtn} onClick={handleStart}>
          Go To Game
        </button>
      </div>

      {/* ── Library overlay (bottom sheet) ─────────────────────────── */}
      {libraryOpen && (
        <div style={S.overlay} onClick={closeLibrary}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.sheetHeader}>
              <span style={S.sheetTitle}>Team Library — {activeLabel}</span>
              <button style={S.sheetClose} onClick={closeLibrary}>✕</button>
            </div>
            {savedTeams.length === 0 ? (
              <div style={S.emptyState}>No saved teams yet</div>
            ) : (
              <div style={S.teamList}>
                {savedTeams.map((team) => (
                  <div key={team.id} style={S.teamRow}>
                    <div style={{ ...S.colourDot, background: team.primaryColour }} />
                    <div style={S.teamInfo}>
                      <span style={S.teamRowName}>{team.teamName}</span>
                      <span style={S.teamRowMeta}>{team.players.length} players</span>
                    </div>
                    <button style={S.loadBtn} onClick={() => loadTeam(team)}>Load</button>
                    <button style={S.deleteBtn} onClick={() => removeTeam(team.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Save prompt overlay (bottom sheet) ─────────────────────── */}
      {saveOpen && (
        <div style={S.overlay} onClick={closeSave}>
          <div style={S.savePrompt} onClick={(e) => e.stopPropagation()}>
            <span style={S.sheetTitle}>Save {activeLabel} to Library</span>
            <input
              type="text"
              placeholder={activeLabel}
              value={saveName}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSaveName(e.target.value)}
              style={S.saveNameInput}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {saveStatus === "full" && (
              <span style={S.saveError}>Library is full (50 / 50). Delete a team first.</span>
            )}
            {saveStatus === "success" && (
              <span style={S.saveSuccess}>Saved!</span>
            )}
            <div style={S.saveActions}>
              <button style={S.cancelBtn} onClick={closeSave}>Cancel</button>
              <button
                style={{ ...S.confirmBtn, ...(saveStatus === "success" ? S.confirmDone : {}) }}
                onClick={confirmSave}
                disabled={saveStatus === "success"}
              >
                {saveStatus === "success" ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    width: "100%",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    position: "relative",
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
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
  startBtn: {
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

  // ── Tabs ────────────────────────────────────────────────────────────────
  tabs: {
    display: "flex",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 12px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tabOn: {
    color: "#e6edf3",
    borderBottomColor: "#2ea043",
  },

  // ── Library toolbar ──────────────────────────────────────────────────────
  libraryBar: {
    display: "flex",
    gap: 8,
    padding: "7px 12px",
    background: "#0d1117",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  libBtn: {
    flex: 1,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 10px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },

  // ── List ────────────────────────────────────────────────────────────────
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  listInner: {
    padding: "8px 12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },

  // ── Colours section ─────────────────────────────────────────────────────
  colourSection: {
    paddingBottom: 10,
    marginBottom: 8,
    borderBottom: "1px solid #21262d",
  },
  colourHeading: {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#8b949e",
    padding: "6px 0 8px",
  },
  colourRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  colourItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  },
  colourItemLabel: {
    fontSize: 12,
    color: "#8b949e",
    fontWeight: 500,
  },
  colourInput: {
    width: 36,
    height: 28,
    borderRadius: 6,
    border: "1px solid #30363d",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    WebkitAppearance: "none",
  } as CSSProperties,

  // ── Player rows ──────────────────────────────────────────────────────────
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 0",
    borderBottom: "1px solid #21262d",
  },
  number: {
    fontSize: 13,
    fontWeight: 700,
    color: "#e6edf3",
    minWidth: 22,
    textAlign: "right" as const,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  position: {
    fontSize: 10,
    fontWeight: 700,
    color: "#8b949e",
    letterSpacing: "0.04em",
    minWidth: 30,
    flexShrink: 0,
  },
  nameInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "1px solid #30363d",
    color: "#e6edf3",
    fontSize: 13,
    padding: "4px 2px",
    outline: "none",
    fontFamily: "inherit",
    userSelect: "text",
  },

  // ── Add Player ───────────────────────────────────────────────────────────
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    background: "transparent",
    border: "1px dashed #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 14px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
    WebkitTapHighlightColor: "transparent",
    boxSizing: "border-box" as const,
  },
  addCount: {
    marginLeft: "auto",
    fontSize: 11,
    color: "#6e7681",
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
  },
  addMax: {
    marginTop: 10,
    fontSize: 12,
    color: "#6e7681",
    textAlign: "center" as const,
    padding: "8px 0",
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    // Extra bottom padding + safe-area inset keeps the selector and the Go To
    // Game button clear of the Android nav bar / iOS home indicator.
    padding: "10px 12px calc(16px + env(safe-area-inset-bottom, 0px))",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    flexShrink: 0,
  },
  directionSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  directionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#8b949e",
  },
  directionChips: {
    display: "flex",
    gap: 8,
  },
  directionChip: {
    flex: 1,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 12px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
    WebkitTapHighlightColor: "transparent",
  },
  directionChipOn: {
    background: "#238636",
    borderColor: "#2ea043",
    color: "#ffffff",
  },
  footerStartBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
    padding: "14px",
    width: "100%",
    cursor: "pointer",
    outline: "none",
    letterSpacing: "-0.2px",
    boxSizing: "border-box" as const,
  },

  // ── Shared overlay backdrop ───────────────────────────────────────────────
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.65)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },

  // ── Library sheet ─────────────────────────────────────────────────────────
  sheet: {
    background: "#161b22",
    borderRadius: "14px 14px 0 0",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  sheetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 10px",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e6edf3",
    letterSpacing: "-0.2px",
  },
  sheetClose: {
    background: "transparent",
    border: "none",
    color: "#6e7681",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
    outline: "none",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6e7681",
    fontSize: 13,
    padding: 32,
  },
  teamList: {
    flex: 1,
    overflowY: "auto",
  },
  teamRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 16px",
    borderBottom: "1px solid #21262d",
  },
  colourDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.1)",
  },
  teamInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  teamRowName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e6edf3",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  teamRowMeta: {
    fontSize: 11,
    color: "#6e7681",
  },
  loadBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 14px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
  },
  deleteBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#6e7681",
    fontSize: 13,
    cursor: "pointer",
    padding: "5px 9px",
    outline: "none",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
  },

  // ── Save prompt ───────────────────────────────────────────────────────────
  savePrompt: {
    background: "#161b22",
    borderRadius: "14px 14px 0 0",
    padding: "20px 16px 36px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  saveNameInput: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 15,
    padding: "12px 12px",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  saveError: {
    fontSize: 12,
    color: "#f85149",
    marginTop: -4,
  },
  saveSuccess: {
    fontSize: 13,
    color: "#2ea043",
    fontWeight: 600,
    marginTop: -4,
  },
  saveActions: {
    display: "flex",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 14,
    fontWeight: 600,
    padding: "12px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  confirmBtn: {
    flex: 1,
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  confirmDone: {
    background: "#1a7f37",
    borderColor: "#2ea043",
    opacity: 0.7,
  },
};
