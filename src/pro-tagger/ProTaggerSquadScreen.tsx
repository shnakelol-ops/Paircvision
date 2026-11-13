import { useState, useCallback } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import { ProTaggerLineupFormation } from "./ProTaggerLineupFormation";
import { ProTaggerJersey } from "./ProTaggerJersey";
import {
  JERSEY_PATTERNS,
  JERSEY_PATTERN_LABEL,
  resolveJerseyKit,
  storedJerseyKit,
  type JerseyKit,
  type JerseyTrim,
} from "./jersey-kit";
import type {
  ProTaggerSession,
  ProTaggerSquadPlayer,
} from "./pro-tagger-session";
import {
  loadSavedTeams,
  saveTeamResult,
  deleteTeam,
  exportTeamAsSquad,
  buildNewTeam,
} from "./pro-tagger-team-storage";
import type { SavedTeam } from "./pro-tagger-team-storage";
import { CrestSheet } from "./crest/CrestSheet";
import { CrestThumb } from "./crest/CrestThumb";
import type { CrestCodec } from "./crest/crest-image";
import { isCrestStorageSupported, type CrestBackend } from "./crest/crest-store";

interface Props {
  session: ProTaggerSession;
  onBack: () => void;
  onStart: (session: ProTaggerSession) => void;
  /** Test seams for club crest storage; the app uses the defaults. */
  crestBackend?: CrestBackend;
  crestCodec?: CrestCodec;
  crestStorageSupported?: boolean;
}

type TeamTab   = "home" | "away";
type ColourSet = { primary: string; secondary: string };
type SaveStatus = "idle" | "success" | "full" | "unavailable";

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** A Saved Team whose players are all unnamed (e.g. an opposition club saved only for its name and crest). */
export function isClubOnlyTeam(team: Pick<SavedTeam, "players">): boolean {
  return team.players.every((p) => !p.name || p.name.trim() === "");
}

type CrestTarget = { id: string; teamName: string };

export function ProTaggerSquadScreen({ session, onBack, onStart, crestBackend, crestCodec, crestStorageSupported }: Props) {
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
  // Saved Team link per side (club crest identity). Set only by loading a
  // Saved Team or saving this squad as one — never from a name.
  const [homeSavedTeamId, setHomeSavedTeamId] = useState<string | undefined>(session.homeSquad.savedTeamId);
  const [awaySavedTeamId, setAwaySavedTeamId] = useState<string | undefined>(session.awaySquad.savedTeamId);
  // Jersey Designer V2 kit per side. Undefined = this squad has never had a
  // kit (renders the default and is written back as absent, so untouched
  // legacy squads are not rewritten). Set by editing it or loading a team.
  const [homeKit, setHomeKit] = useState<JerseyKit | undefined>(() => storedJerseyKit(session.homeSquad.kit));
  const [awayKit, setAwayKit] = useState<JerseyKit | undefined>(() => storedJerseyKit(session.awaySquad.kit));
  // Jersey Design panel: collapsed by default, shared across both tabs like
  // the name editor below — a display preference, not squad data.
  const [showKitDesigner, setShowKitDesigner] = useState(false);

  // Library overlay
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [savedTeams, setSavedTeams]   = useState<SavedTeam[]>([]);

  // Save prompt overlay
  const [saveOpen, setSaveOpen]       = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle");
  const [lastSavedTeam, setLastSavedTeam] = useState<CrestTarget | null>(null);

  // Club crests (stored separately in IndexedDB, keyed by Saved Team id)
  const crestsSupported = crestStorageSupported ?? isCrestStorageSupported();
  const [crestTarget, setCrestTarget]   = useState<CrestTarget | null>(null);
  const [crestVersion, setCrestVersion] = useState(0);

  // Visual lineup summary (read-only) is shown by default; the existing
  // name-editing list — unchanged — is collapsed behind this toggle. There
  // is still exactly one place names are edited: this reveals it, it does
  // not duplicate it. Shared across both tabs (not per-team) — purely a
  // display preference, not squad data.
  const [showNameEditor, setShowNameEditor] = useState(false);

  const homeLabel     = session.homeTeamName.trim() || "Home";
  const awayLabel     = session.awayTeamName.trim() || "Away";
  const activeLabel   = activeTab === "home" ? homeLabel : awayLabel;
  const players       = activeTab === "home" ? homePlayers : awayPlayers;
  const activeColours = activeTab === "home" ? homeColours : awayColours;
  const activeKit     = resolveJerseyKit(activeTab === "home" ? homeKit : awayKit);

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

  function handleKitChange(change: Partial<JerseyKit>) {
    const setter = activeTab === "home" ? setHomeKit : setAwayKit;
    setter((prev) => ({ ...resolveJerseyKit(prev), ...change }));
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
    const linkSetter   = activeTab === "home" ? setHomeSavedTeamId : setAwaySavedTeamId;
    const kitSetter    = activeTab === "home" ? setHomeKit : setAwayKit;
    playerSetter(squad.players);
    colourSetter({ primary: team.primaryColour, secondary: team.secondaryColour });
    nameSetter(team.teamName);
    linkSetter(team.id);
    kitSetter(squad.kit);
    setLibraryOpen(false);
  }

  // Deleting a Saved Team deliberately leaves its club crest in the crest
  // store: matches that reference this team id keep showing its crest. Only
  // "Remove crest" deletes a crest, and there is no automatic cleanup.
  function removeTeam(id: string) {
    deleteTeam(id);
    setSavedTeams((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Save prompt ──────────────────────────────────────────────────────────

  function openSave() {
    const fallback = activeLabel === "Home" || activeLabel === "Away" ? "" : activeLabel;
    setSaveName(fallback);
    setSaveStatus("idle");
    setLastSavedTeam(null);
    setSaveOpen(true);
  }

  function closeSave() {
    setSaveOpen(false);
  }

  function confirmSave() {
    const currentPlayers = activeTab === "home" ? homePlayers : awayPlayers;
    const currentColours = activeTab === "home" ? homeColours : awayColours;
    const currentKit     = activeTab === "home" ? homeKit : awayKit;
    const team = buildNewTeam({
      teamName:        saveName.trim() || activeLabel,
      primaryColour:   currentColours.primary,
      secondaryColour: currentColours.secondary,
      kit:             currentKit,
      players: currentPlayers.map((p) => ({
        id:       p.id,
        number:   p.number,
        name:     p.name,
        position: p.position,
      })),
    });
    const result = saveTeamResult(team);
    if (result.ok) {
      setSaveStatus("success");
      setLastSavedTeam({ id: team.id, teamName: team.teamName });
      // This squad is now that Saved Team: link it so the match uses its crest.
      (activeTab === "home" ? setHomeSavedTeamId : setAwaySavedTeamId)(team.id);
      // With crest storage available the prompt stays open so the coach can
      // tap "Add crest" for the team just saved; otherwise it closes as before.
      if (!crestsSupported) setTimeout(() => setSaveOpen(false), 900);
    } else {
      setSaveStatus(result.reason);
    }
  }

  // ── Go to game ───────────────────────────────────────────────────────────
  // 1H attacking direction is no longer chosen on this screen — it's now a
  // mandatory step between here and the live screen (see the "direction"
  // phase in ProTaggerPage.tsx / ProTaggerDirectionScreen.tsx), so this
  // handler leaves session.attackDirection untouched: that screen always
  // sets it explicitly before the match reaches live, regardless of
  // whatever value is already on `session`.

  function handleStart() {
    onStart({
      ...session,
      homeSquad: {
        ...session.homeSquad,
        players:         homePlayers,
        primaryColour:   homeColours.primary,
        secondaryColour: homeColours.secondary,
        teamName:        homeSquadTeamName,
        savedTeamId:     homeSavedTeamId,
        kit:             homeKit,
      },
      awaySquad: {
        ...session.awaySquad,
        players:         awayPlayers,
        primaryColour:   awayColours.primary,
        secondaryColour: awayColours.secondary,
        teamName:        awaySquadTeamName,
        savedTeamId:     awaySavedTeamId,
        kit:             awayKit,
      },
    });
  }

  return (
    <div style={S.shell}>
      <VisionStadiumBackground variant="training" />
      <div style={S.contentWrap}>

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
              {/* Jersey Design toggle — sits where the old 32px colour preview
                  jersey was, so the collapsed panel costs no extra height. */}
              <button
                type="button"
                style={S.kitToggle}
                onClick={() => setShowKitDesigner((v) => !v)}
                aria-expanded={showKitDesigner}
                aria-label="Jersey design"
              >
                <ProTaggerMiniJersey
                  primary={activeColours.primary}
                  secondary={activeColours.secondary}
                  kit={activeKit}
                  size={24}
                />
                <span>Jersey</span>
                <span style={S.editNamesChevron}>{showKitDesigner ? "▲" : "▼"}</span>
              </button>
            </div>

            {/* Jersey Design panel — pattern buttons drawn in this team's own
                colours, plus sleeve and collar colour. The Starting XV below
                is the live preview. Presentation only. */}
            {showKitDesigner && (
              <div style={S.kitPanel}>
                <div style={S.patternGrid} role="group" aria-label="Jersey pattern">
                  {JERSEY_PATTERNS.map((pattern) => {
                    const on = activeKit.pattern === pattern;
                    return (
                      <button
                        key={pattern}
                        type="button"
                        style={{ ...S.patternBtn, ...(on ? S.patternBtnOn : {}) }}
                        aria-pressed={on}
                        onClick={() => handleKitChange({ pattern })}
                      >
                        <ProTaggerJersey
                          primary={activeColours.primary}
                          secondary={activeColours.secondary}
                          kit={{ ...activeKit, pattern }}
                          size={28}
                        />
                        <span>{JERSEY_PATTERN_LABEL[pattern]}</span>
                      </button>
                    );
                  })}
                </div>
                {(["sleeves", "collar"] as const).map((part) => {
                  const partLabel = part === "sleeves" ? "Sleeves" : "Collar";
                  return (
                    <div key={part} style={S.trimRow}>
                      <span style={S.trimLabel}>{partLabel}</span>
                      <div style={S.trimSeg} role="group" aria-label={`${partLabel} colour`}>
                        {(["primary", "secondary"] as const).map((trim: JerseyTrim) => {
                          const on = activeKit[part] === trim;
                          return (
                            <button
                              key={trim}
                              type="button"
                              style={{ ...S.trimBtn, ...(on ? S.trimBtnOn : {}) }}
                              aria-pressed={on}
                              onClick={() => handleKitChange({ [part]: trim })}
                            >
                              <span style={{ ...S.trimChip, background: activeColours[trim] }} />
                              {trim === "primary" ? "Primary" : "Secondary"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Visual lineup summary — read-only team sheet, Starting 15 in the
              fixed GAA formation + substitutes below. Purely presentational:
              names are still edited only via the list revealed below. */}
          <ProTaggerLineupFormation
            players={players}
            primary={activeColours.primary}
            secondary={activeColours.secondary}
            kit={activeKit}
          />

          {/* Edit Player Names — collapsed by default. Expanding reveals the
              existing name-editing list unchanged; this is not a second
              editing mechanism, just a show/hide toggle around the one that
              already exists. */}
          <button
            style={S.editNamesToggle}
            onClick={() => setShowNameEditor((v) => !v)}
          >
            <span>Edit Player Names</span>
            <span style={S.editNamesChevron}>{showNameEditor ? "▲" : "▼"}</span>
          </button>

          {showNameEditor && (
            <>
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
            </>
          )}

        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      {/* 1H Attacking Direction used to live here — it's now chosen on a
          dedicated mandatory screen between Go To Game and the live screen
          (see ProTaggerDirectionScreen.tsx), which frees this space for the
          lineup above. */}
      <div style={S.footer}>
        <button style={S.footerStartBtn} onClick={handleStart}>
          Go To Game
        </button>
      </div>

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
                    <div style={S.crestSlot}>
                      <CrestThumb
                        teamId={team.id}
                        teamName={team.teamName}
                        version={crestVersion}
                        backend={crestsSupported ? crestBackend : null}
                        fallback={<div style={{ ...S.colourDot, background: team.primaryColour }} />}
                      />
                    </div>
                    <div style={S.teamInfo}>
                      <span style={S.teamRowName}>{team.teamName}</span>
                      <span style={S.teamRowMeta}>
                        {isClubOnlyTeam(team) ? "Club only" : `${team.players.length} players`}
                      </span>
                    </div>
                    {crestsSupported && (
                      <button
                        style={S.crestBtn}
                        aria-label={`Crest for ${team.teamName}`}
                        onClick={() => setCrestTarget({ id: team.id, teamName: team.teamName })}
                      >
                        Crest
                      </button>
                    )}
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
            {saveStatus === "unavailable" && (
              <span style={S.saveError}>Couldn't save this team on this device. Your squad for this match is unaffected.</span>
            )}
            {saveStatus === "success" && (
              <span style={S.saveSuccess}>Saved!</span>
            )}
            {saveStatus === "success" && crestsSupported && lastSavedTeam ? (
              <div style={S.saveActions}>
                <button style={S.cancelBtn} onClick={closeSave}>Done</button>
                <button
                  style={S.confirmBtn}
                  onClick={() => {
                    setCrestTarget(lastSavedTeam);
                    setSaveOpen(false);
                  }}
                >
                  Add crest
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* ── Club crest sheet (above the library) ───────────────────── */}
      {crestTarget && (
        <CrestSheet
          team={crestTarget}
          onClose={() => setCrestTarget(null)}
          onChanged={() => setCrestVersion((v) => v + 1)}
          backend={crestBackend}
          codec={crestCodec}
          storageSupported={crestsSupported}
        />
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
    background: "#050c14",
    color: "#dce8f4",
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    userSelect: "none",
    overflow: "hidden",
    position: "relative",
  },
  contentWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },

  // ── Header ──────────────────────────────────────────────────────────────
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
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#7a95ad",
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
    color: "#dce8f4",
    borderBottomColor: "#2ea043",
  },

  // ── Library toolbar ──────────────────────────────────────────────────────
  libraryBar: {
    display: "flex",
    gap: 8,
    padding: "7px 12px",
    background: "#050c14",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  libBtn: {
    flex: 1,
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
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
    borderBottom: "1px solid #17324a",
  },
  colourHeading: {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#7a95ad",
    padding: "6px 0 8px",
  },
  colourRow: {
    display: "flex",
    flexWrap: "wrap",
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
    color: "#7a95ad",
    fontWeight: 500,
  },
  colourInput: {
    width: 36,
    height: 28,
    borderRadius: 6,
    border: "1px solid #1c3a52",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    WebkitAppearance: "none",
  } as CSSProperties,

  // ── Jersey Design (Jersey Designer V2) ────────────────────────────────────
  kitToggle: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#dce8f4",
    fontSize: 12,
    fontWeight: 600,
    padding: "0 10px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  kitPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 10,
  },
  patternGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
  },
  patternBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 58,
    background: "#0a2134",
    border: "1px solid #1c3a52",
    borderRadius: 10,
    color: "#a9bdd0",
    fontSize: 11,
    fontWeight: 600,
    padding: "6px 2px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  patternBtnOn: {
    borderColor: "#2ea043",
    background: "#0e2d22",
    color: "#dce8f4",
  },
  trimRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trimLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#7a95ad",
  },
  trimSeg: {
    display: "flex",
    background: "#0a2134",
    border: "1px solid #1c3a52",
    borderRadius: 9,
    padding: 2,
  },
  trimBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    padding: "0 12px",
    border: "none",
    borderRadius: 7,
    background: "transparent",
    color: "#a9bdd0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  trimBtnOn: {
    background: "#17405e",
    color: "#ffffff",
  },
  trimChip: {
    width: 12,
    height: 12,
    borderRadius: 3,
    boxShadow: "0 0 0 1px #3b5b77",
  },

  // ── Player rows ──────────────────────────────────────────────────────────
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 0",
    borderBottom: "1px solid #17324a",
  },
  number: {
    fontSize: 13,
    fontWeight: 700,
    color: "#dce8f4",
    minWidth: 22,
    textAlign: "right" as const,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  position: {
    fontSize: 10,
    fontWeight: 700,
    color: "#7a95ad",
    letterSpacing: "0.04em",
    minWidth: 30,
    flexShrink: 0,
  },
  nameInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "1px solid #1c3a52",
    color: "#dce8f4",
    fontSize: 13,
    padding: "4px 2px",
    outline: "none",
    fontFamily: "inherit",
    userSelect: "text",
  },

  // ── Edit Player Names toggle ───────────────────────────────────────────────
  editNamesToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#dce8f4",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 14px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
    WebkitTapHighlightColor: "transparent",
  },
  editNamesChevron: {
    fontSize: 10,
    color: "#7a95ad",
  },

  // ── Add Player ───────────────────────────────────────────────────────────
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    background: "transparent",
    border: "1px dashed #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
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
    color: "#5e7a8a",
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
  },
  addMax: {
    marginTop: 10,
    fontSize: 12,
    color: "#5e7a8a",
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
    background: "#050c14",
    borderTop: "1px solid #17324a",
    flexShrink: 0,
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
    background: "#0a2134",
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
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#dce8f4",
    letterSpacing: "-0.2px",
  },
  sheetClose: {
    background: "transparent",
    border: "none",
    color: "#5e7a8a",
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
    color: "#5e7a8a",
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
    borderBottom: "1px solid #17324a",
  },
  crestSlot: {
    width: 26,
    height: 26,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  crestBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#9fb6ca",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
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
    color: "#dce8f4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  teamRowMeta: {
    fontSize: 11,
    color: "#5e7a8a",
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
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#5e7a8a",
    fontSize: 13,
    cursor: "pointer",
    padding: "5px 9px",
    outline: "none",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
  },

  // ── Save prompt ───────────────────────────────────────────────────────────
  savePrompt: {
    background: "#0a2134",
    borderRadius: "14px 14px 0 0",
    padding: "20px 16px 36px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  saveNameInput: {
    background: "#050c14",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#dce8f4",
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
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
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
