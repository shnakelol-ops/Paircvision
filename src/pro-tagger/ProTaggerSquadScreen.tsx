import { useState, useCallback } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import type { ProTaggerSession, ProTaggerSquadPlayer } from "./pro-tagger-session";

interface Props {
  session: ProTaggerSession;
  onBack: () => void;
  onStart: (session: ProTaggerSession) => void;
}

type TeamTab   = "home" | "away";
type ColourSet = { primary: string; secondary: string };

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ProTaggerSquadScreen({ session, onBack, onStart }: Props) {
  const [activeTab, setActiveTab]   = useState<TeamTab>("home");
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

  const homeLabel    = session.homeTeamName.trim() || "Home";
  const awayLabel    = session.awayTeamName.trim() || "Away";
  const players      = activeTab === "home" ? homePlayers : awayPlayers;
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

  function handleStart() {
    onStart({
      ...session,
      homeSquad: {
        ...session.homeSquad,
        players:         homePlayers,
        primaryColour:   homeColours.primary,
        secondaryColour: homeColours.secondary,
      },
      awaySquad: {
        ...session.awaySquad,
        players:         awayPlayers,
        primaryColour:   awayColours.primary,
        secondaryColour: awayColours.secondary,
      },
    });
  }

  return (
    <div style={S.shell}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Back</button>
        <span style={S.title}>Squads</span>
        <button style={S.startBtn} onClick={handleStart}>Start Match</button>
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
                      // Use accent border to show selected colour clearly
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
        <button style={S.footerStartBtn} onClick={handleStart}>
          Start Match
        </button>
      </div>

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
    padding: "10px 12px 16px",
    background: "#0d1117",
    borderTop: "1px solid #21262d",
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
};
