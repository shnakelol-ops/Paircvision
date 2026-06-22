import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  ProTaggerSession,
  ProTaggerSport,
  ProTaggerMatchType,
  ProTaggerAttackDirection,
} from "./pro-tagger-session";
import { newSessionId, buildDefaultSquad } from "./pro-tagger-session";
import type { MatchTarget, MatchTargetDirection } from "../stats/matchTargets";

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

type TargetRow = {
  metric: MatchTarget["metric"];
  label: (sport: ProTaggerSport) => string;
  unit: string;
  defaultValue: number;
};

const TARGET_ROWS: readonly TargetRow[] = [
  { metric: "shots",                label: () => "Shots per half",                                                unit: "",  defaultValue: 12 },
  { metric: "shootingEfficiency",   label: () => "Shooting %",                                                   unit: "%", defaultValue: 50 },
  { metric: "kickoutWinRate",       label: (s) => (s === "hurling" || s === "camogie" ? "Puckout Win %" : "Kickout Win %"), unit: "%", defaultValue: 50 },
  { metric: "turnoversWon",         label: () => "Turnovers Won",                                                unit: "",  defaultValue: 10 },
  { metric: "turnoversLost",        label: () => "Turnovers Lost",                                               unit: "",  defaultValue: 10 },
  { metric: "possessionRetention",  label: () => "Possession Retention %",                                       unit: "%", defaultValue: 60 },
  { metric: "wides",                label: () => "Wides",                                                        unit: "",  defaultValue: 8  },
  { metric: "freesWon",             label: () => "Frees Won",                                                    unit: "",  defaultValue: 8  },
  { metric: "freesConceded",        label: () => "Frees Conceded",                                               unit: "",  defaultValue: 8  },
  { metric: "scores",               label: () => "Scores",                                                       unit: "",  defaultValue: 15 },
  { metric: "goals",                label: () => "Goals",                                                        unit: "",  defaultValue: 1  },
  { metric: "points",               label: () => "Points",                                                       unit: "",  defaultValue: 10 },
  { metric: "twoPointers",          label: () => "Two-Pointers",                                                 unit: "",  defaultValue: 2  },
  { metric: "oppShootingEfficiency", label: () => "Opp. Shooting %",                                            unit: "%", defaultValue: 50 },
  { metric: "kickoutsConceded",     label: (s) => (s === "hurling" || s === "camogie" ? "Puckouts Conceded" : "Kickouts Conceded"), unit: "", defaultValue: 8 },
];

export function ProTaggerSetupScreen({ onContinue }: Props) {
  const [sport, setSport]             = useState<ProTaggerSport>("gaelic");
  const [homeTeam, setHomeTeam]       = useState("");
  const [awayTeam, setAwayTeam]       = useState("");
  const [venue, setVenue]             = useState("");
  const [matchType, setMatchType]     = useState<ProTaggerMatchType>("league");
  const [attackDir, setAttackDir]     = useState<ProTaggerAttackDirection>("right");
  const [halfMins, setHalfMins]       = useState(35);

  // Match Targets state
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [moreExpanded,    setMoreExpanded]    = useState(false);
  const [targetEnabled,  setTargetEnabled]    = useState<boolean[]>([false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]);
  const [targetValue,    setTargetValue]      = useState<number[]>([12, 50, 50, 10, 10, 60, 8, 8, 8, 15, 1, 10, 2, 50, 8]);
  const [targetDir,      setTargetDir]        = useState<MatchTargetDirection[]>(
    ["atLeast", "atLeast", "atLeast", "atLeast", "atMost", "atLeast", "atMost", "atLeast", "atMost", "atLeast", "atLeast", "atLeast", "atLeast", "atMost", "atMost"],
  );

  const enabledCount = targetEnabled.filter(Boolean).length;

  function handleStart() {
    const targets = enabledCount > 0
      ? {
          targets: TARGET_ROWS.map((row, i) => ({
            metric:      row.metric,
            targetValue: targetValue[i],
            direction:   targetDir[i],
            enabled:     targetEnabled[i],
          })) as readonly MatchTarget[],
        }
      : undefined;

    onContinue({
      id:                  newSessionId(),
      sport,
      homeTeamName:        homeTeam.trim(),
      awayTeamName:        awayTeam.trim(),
      venue:               venue.trim(),
      matchType,
      attackDirection:     attackDir,
      halfDurationMinutes: halfMins,
      createdAt:           Date.now(),
      homeSquad:           buildDefaultSquad("HOME"),
      awaySquad:           buildDefaultSquad("AWAY"),
      targets,
    });
  }

  function toggleTarget(i: number) {
    setTargetEnabled((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function setDir(i: number, dir: MatchTargetDirection) {
    setTargetDir((prev) => prev.map((v, idx) => (idx === i ? dir : v)));
  }

  function setVal(i: number, raw: string) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 999) {
      setTargetValue((prev) => prev.map((v, idx) => (idx === i ? n : v)));
    }
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
          autoCapitalize="words"
          style={S.input}
        />

        <span style={S.label}>Away Team</span>
        <input
          type="text"
          placeholder="e.g. Tipperary"
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          autoCapitalize="words"
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
            Left
          </button>
          <button
            onClick={() => setAttackDir("right")}
            style={{ ...S.chip, ...(attackDir === "right" ? S.chipOn : {}) }}
          >
            Right
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

        {/* Match Targets — collapsible */}
        <button
          onClick={() => setTargetsExpanded((v) => !v)}
          style={S.targetsToggle}
        >
          <span style={S.targetsToggleLabel}>
            MATCH TARGETS
            <span style={S.optional}> optional</span>
          </span>
          <span style={S.targetsBadge}>
            {enabledCount > 0 ? `${enabledCount}/15 set` : "Not set"}
          </span>
          <span style={S.targetsChevron}>{targetsExpanded ? "▲" : "▼"}</span>
        </button>

        {targetsExpanded && (
          <div style={S.targetsPanel}>
            {TARGET_ROWS.slice(0, 6).map((row, i) => (
              <div key={row.metric} style={S.targetRow}>
                <button
                  onClick={() => toggleTarget(i)}
                  style={{ ...S.toggleBtn, ...(targetEnabled[i] ? S.toggleBtnOn : {}) }}
                >
                  {targetEnabled[i] ? "ON" : "OFF"}
                </button>
                <span style={{ ...S.targetLabel, ...(targetEnabled[i] ? {} : S.targetLabelOff) }}>
                  {row.label(sport)}
                </span>
                <button
                  onClick={() => setDir(i, targetDir[i] === "atLeast" ? "atMost" : "atLeast")}
                  style={{ ...S.dirBtn, ...(targetEnabled[i] ? {} : S.dirBtnOff) }}
                  title={targetDir[i] === "atLeast" ? "At least (click to change)" : "At most (click to change)"}
                >
                  {targetDir[i] === "atLeast" ? "≥" : "≤"}
                </button>
                <input
                  type="number"
                  min={0}
                  max={row.unit === "%" ? 100 : 99}
                  value={targetValue[i]}
                  onChange={(e) => setVal(i, e.target.value)}
                  style={{ ...S.targetInput, ...(targetEnabled[i] ? {} : S.targetInputOff) }}
                  disabled={!targetEnabled[i]}
                />
                {row.unit && (
                  <span style={{ ...S.targetUnit, ...(targetEnabled[i] ? {} : S.targetLabelOff) }}>
                    {row.unit}
                  </span>
                )}
              </div>
            ))}
            <button
              onClick={() => setMoreExpanded(v => !v)}
              style={{ ...S.toggleBtn, width: "100%", textAlign: "left", fontSize: 11, color: "#64748b", marginTop: 4 }}
            >
              More Targets {moreExpanded ? "▲" : "▼"}
              {targetEnabled.slice(6).filter(Boolean).length > 0 && (
                <span style={{ marginLeft: 6, color: "#4ade80" }}>
                  ({targetEnabled.slice(6).filter(Boolean).length} set)
                </span>
              )}
            </button>
            {moreExpanded && TARGET_ROWS.slice(6).map((row, j) => {
              const i = j + 6;
              return (
                <div key={row.metric} style={S.targetRow}>
                  <button
                    onClick={() => toggleTarget(i)}
                    style={{ ...S.toggleBtn, ...(targetEnabled[i] ? S.toggleBtnOn : {}) }}
                  >
                    {targetEnabled[i] ? "ON" : "OFF"}
                  </button>
                  <span style={{ ...S.targetLabel, ...(targetEnabled[i] ? {} : S.targetLabelOff) }}>
                    {row.label(sport)}
                  </span>
                  <button
                    onClick={() => setDir(i, targetDir[i] === "atLeast" ? "atMost" : "atLeast")}
                    style={{ ...S.dirBtn, ...(targetEnabled[i] ? {} : S.dirBtnOff) }}
                    title={targetDir[i] === "atLeast" ? "At least (click to change)" : "At most (click to change)"}
                  >
                    {targetDir[i] === "atLeast" ? "≥" : "≤"}
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={row.unit === "%" ? 100 : 99}
                    value={targetValue[i]}
                    onChange={(e) => setVal(i, e.target.value)}
                    style={{ ...S.targetInput, ...(targetEnabled[i] ? {} : S.targetInputOff) }}
                    disabled={!targetEnabled[i]}
                  />
                  {row.unit && (
                    <span style={{ ...S.targetUnit, ...(targetEnabled[i] ? {} : S.targetLabelOff) }}>
                      {row.unit}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
  // Match Targets section
  targetsToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#8b949e",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    padding: "10px 12px",
    cursor: "pointer",
    outline: "none",
    width: "100%",
    textAlign: "left" as const,
    marginTop: 6,
  },
  targetsToggleLabel: {
    flex: 1,
    textTransform: "uppercase" as const,
  },
  targetsBadge: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 5,
    color: "#8b949e",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 7px",
  },
  targetsChevron: {
    fontSize: 9,
    color: "#6e7681",
  },
  targetsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 8,
    padding: "12px 10px",
  },
  targetRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toggleBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#6e7681",
    fontSize: 10,
    fontWeight: 700,
    padding: "4px 8px",
    cursor: "pointer",
    outline: "none",
    minWidth: 38,
    textAlign: "center" as const,
    letterSpacing: "0.05em",
  },
  toggleBtnOn: {
    background: "#1a3a1e",
    borderColor: "#2ea043",
    color: "#4ade80",
  },
  targetLabel: {
    flex: 1,
    fontSize: 13,
    color: "#c9d1d9",
  },
  targetLabelOff: {
    color: "#8b949e",
  },
  dirBtn: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#8b949e",
    fontSize: 16,
    fontWeight: 600,
    padding: "2px 10px",
    cursor: "pointer",
    outline: "none",
    minWidth: 34,
    textAlign: "center" as const,
  },
  dirBtnOff: {
    color: "#484f58",
    borderColor: "#21262d",
  },
  targetInput: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    padding: "5px 8px",
    outline: "none",
    fontFamily: "inherit",
    width: 58,
    textAlign: "right" as const,
  },
  targetInputOff: {
    color: "#484f58",
    borderColor: "#21262d",
  },
  targetUnit: {
    fontSize: 13,
    color: "#8b949e",
    minWidth: 14,
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
