import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  ProTaggerSession,
  ProTaggerSport,
  ProTaggerMatchType,
  ProTaggerAttackDirection,
} from "./pro-tagger-session";
import { newSessionId, buildDefaultSquad } from "./pro-tagger-session";

interface Props {
  onContinue: (session: ProTaggerSession) => void;
}

const SPORT_LABELS: Record<ProTaggerSport, string> = {
  gaelic:          "Gaelic Football",
  ladies_football: "Ladies Football",
  hurling:         "Hurling",
  camogie:         "Camogie",
};

const MATCH_TYPE_LABELS: Record<ProTaggerMatchType, string> = {
  league:       "League",
  championship: "Championship",
  friendly:     "Friendly",
  training:     "Training",
};

export function ProTaggerSetupScreen({ onContinue }: Props) {
  const [sport, setSport]             = useState<ProTaggerSport>("gaelic");
  const [homeTeam, setHomeTeam]       = useState("");
  const [awayTeam, setAwayTeam]       = useState("");
  const [venue, setVenue]             = useState("");
  const [matchType, setMatchType]     = useState<ProTaggerMatchType>("league");
  const [attackDir, setAttackDir]     = useState<ProTaggerAttackDirection>("right");
  const [halfMins, setHalfMins]       = useState(35);

  function handleStart() {
    onContinue({
      id:                 newSessionId(),
      sport,
      homeTeamName:       homeTeam.trim(),
      awayTeamName:       awayTeam.trim(),
      venue:              venue.trim(),
      matchType,
      attackDirection:    attackDir,
      halfDurationMinutes: halfMins,
      createdAt:          Date.now(),
      homeSquad:          buildDefaultSquad("HOME"),
      awaySquad:          buildDefaultSquad("AWAY"),
    });
  }

  return (
    <div style={S.shell}>
      <div style={S.header}>
        <span style={S.title}>Pro Tagger</span>
        <span style={S.badge}>Setup</span>
      </div>

      <div style={S.body}>
        {/* Sport */}
        <span style={S.label}>Sport</span>
        <div style={S.chips}>
          {(["gaelic", "ladies_football", "hurling", "camogie"] as ProTaggerSport[]).map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              style={{ ...S.chip, ...(sport === s ? S.chipOn : {}) }}
            >
              {SPORT_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Teams */}
        <span style={S.label}>Home Team</span>
        <input
          type="text"
          placeholder="e.g. Kilkenny"
          value={homeTeam}
          onChange={(e) => setHomeTeam(e.target.value)}
          style={S.input}
        />

        <span style={S.label}>Away Team</span>
        <input
          type="text"
          placeholder="e.g. Tipperary"
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          style={S.input}
        />

        {/* Venue */}
        <span style={S.label}>
          Venue <span style={S.optional}>(optional)</span>
        </span>
        <input
          type="text"
          placeholder="e.g. Croke Park"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          style={S.input}
        />

        {/* Match type */}
        <span style={S.label}>Match Type</span>
        <div style={S.chips}>
          {(["league", "championship", "friendly", "training"] as ProTaggerMatchType[]).map((mt) => (
            <button
              key={mt}
              onClick={() => setMatchType(mt)}
              style={{ ...S.chip, ...(matchType === mt ? S.chipOn : {}) }}
            >
              {MATCH_TYPE_LABELS[mt]}
            </button>
          ))}
        </div>

        {/* Attack direction */}
        <span style={S.label}>1H Attacking Direction</span>
        <div style={S.chips}>
          <button
            onClick={() => setAttackDir("left")}
            style={{ ...S.chip, ...(attackDir === "left" ? S.chipOn : {}) }}
          >
            ← Left
          </button>
          <button
            onClick={() => setAttackDir("right")}
            style={{ ...S.chip, ...(attackDir === "right" ? S.chipOn : {}) }}
          >
            Right →
          </button>
        </div>

        {/* Half duration */}
        <span style={S.label}>Half Duration</span>
        <div style={S.chips}>
          {[25, 30, 35, 40].map((d) => (
            <button
              key={d}
              onClick={() => setHalfMins(d)}
              style={{ ...S.chip, ...(halfMins === d ? S.chipOn : {}) }}
            >
              {d} min
            </button>
          ))}
        </div>

        <button onClick={handleStart} style={S.startBtn}>
          Continue → Squads
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
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px 8px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.3px",
    flex: 1,
  },
  badge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "16px 16px 48px",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "#8b949e",
    marginTop: 4,
  },
  optional: {
    fontWeight: 400,
    textTransform: "none" as const,
    letterSpacing: 0,
    color: "#6e7681",
  },
  input: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    padding: "10px 12px",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 7,
  },
  chip: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 13px",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap" as const,
  },
  chipOn: {
    background: "#238636",
    borderColor: "#2ea043",
    color: "#ffffff",
  },
  startBtn: {
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    padding: "16px",
    width: "100%",
    cursor: "pointer",
    marginTop: 8,
    outline: "none",
    letterSpacing: "-0.2px",
  },
};
