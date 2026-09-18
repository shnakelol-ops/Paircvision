import type { CSSProperties } from "react";

import type { PlayerKitPattern } from "./playerKitPatterns";

export type PlayerKitLabelMode = "number" | "initials" | "name";
export type PlayerKitEditorTab = "base" | "pattern" | "label";

export type PlayerKitColorOption = { id: string; cssColor: string };

/**
 * Fully-resolved display value. The parent is responsible for supplying
 * already-resolved values (applying whatever fallback/default logic is
 * specific to that surface — e.g. Standard Slate's team-colour fallback,
 * or a goalkeeper override) — this component never computes a fallback or
 * default itself, and never re-sanitizes name/initials. It renders exactly
 * what it's given and reports exactly what the coach picked.
 */
export type PlayerKitEditorValue<TPattern extends PlayerKitPattern = PlayerKitPattern> = {
  baseColor?: string;
  pattern?: TPattern;
  patternColor?: string;
  labelMode?: PlayerKitLabelMode;
  initials?: string;
  name?: string;
};

export type PlayerKitEditorProps<TPattern extends PlayerKitPattern = PlayerKitPattern> = {
  /**
   * Disambiguates option keys when the editor is shown for different
   * players in turn (mirrors the original inline JSX's use of the active
   * player's id in each option's React key).
   */
  editorKey: string;
  position: { left: number; top: number };
  activeTab: PlayerKitEditorTab;
  onTabChange: (tab: PlayerKitEditorTab) => void;
  value: PlayerKitEditorValue<TPattern>;
  colorOptions: readonly PlayerKitColorOption[];
  allowedPatterns: readonly TPattern[];
  patternLabels: Readonly<Record<TPattern, string>>;
  onBaseColorChange: (color: string) => void;
  onPatternChange: (pattern: TPattern) => void;
  onPatternColorChange: (color: string) => void;
  onLabelModeChange: (mode: PlayerKitLabelMode) => void;
  onInitialsChange: (rawValue: string) => void;
  onNameChange: (rawValue: string) => void;
  onClose: () => void;
};

const EDITOR_MARGIN = 10;
const EDITOR_MAX_WIDTH = 260;
const EDITOR_MAX_HEIGHT_RATIO = 0.56;

const TABS: ReadonlyArray<{ id: PlayerKitEditorTab; label: string }> = [
  { id: "base", label: "Base" },
  { id: "pattern", label: "Pattern" },
  { id: "label", label: "Label" },
];

const LABEL_MODE_CHOICES: readonly PlayerKitLabelMode[] = ["number", "initials", "name"];
const LABEL_MODE_DISPLAY: Record<PlayerKitLabelMode, string> = {
  number: "Number",
  initials: "Initials",
  name: "Nickname",
};

const EDITOR_STYLE: CSSProperties = {
  position: "fixed",
  width: `min(${EDITOR_MAX_WIDTH}px, calc(100vw - 20px))`,
  maxWidth: `${EDITOR_MAX_WIDTH}px`,
  maxHeight: "56vh",
  overflowY: "auto",
  overscrollBehavior: "contain",
  display: "grid",
  gap: "6px",
  padding: "6px",
  borderRadius: "12px",
  border: "1px solid rgba(191, 214, 235, 0.24)",
  background: "rgba(10, 20, 25, 0.9)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 10px 22px rgba(2, 8, 15, 0.4)",
  zIndex: 30,
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "rgba(10, 20, 25, 0.96)",
  paddingBottom: "2px",
};

const TAB_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "4px",
  flex: 1,
};

const CLOSE_STYLE: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(198, 218, 236, 0.3)",
  background: "rgba(15, 28, 40, 0.8)",
  color: "#e8f2fd",
  cursor: "pointer",
  fontSize: "13px",
  lineHeight: 1,
  padding: 0,
};

const TAB_BUTTON_STYLE: CSSProperties = {
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(148, 163, 184, 0.34)",
  background: "rgba(15, 23, 42, 0.72)",
  color: "#dbe7f5",
  fontSize: "10px",
  fontWeight: 650,
  cursor: "pointer",
  minWidth: 0,
  fontFamily: "Inter, system-ui, sans-serif",
};

const TAB_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...TAB_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.8)",
  boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.35) inset",
  background: "rgba(38, 72, 102, 0.78)",
  color: "#f8fcff",
};

const SECTION_STYLE: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const COLOR_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "4px",
  justifyItems: "center",
};

const COLOR_BUTTON_STYLE: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(150, 170, 190, 0.52)",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const COLOR_SWATCH_STYLE: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.48)",
};

const MODE_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "4px",
};

const OPTION_BUTTON_STYLE: CSSProperties = {
  height: "26px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.36)",
  background: "rgba(15, 23, 42, 0.82)",
  color: "#dbe7f5",
  fontSize: "9.5px",
  fontWeight: 650,
  letterSpacing: "0.2px",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, sans-serif",
  minWidth: 0,
};

const OPTION_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...OPTION_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.66)",
  background: "rgba(38, 72, 102, 0.72)",
  color: "#f8fcff",
  minWidth: 0,
};

const INPUT_STYLE: CSSProperties = {
  height: "26px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.38)",
  background: "rgba(15, 23, 42, 0.86)",
  color: "#e2e8f0",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  fontFamily: "Inter, system-ui, sans-serif",
  padding: "0 8px",
  textTransform: "uppercase",
};

const ACTIVE_SWATCH_RING: CSSProperties = { boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.95)" };

/**
 * Presentational player-appearance editor shared by Standard Slate and Game
 * Timing. Owns no player/team/persistence/renderer state of any kind — it
 * only renders `value` and reports picks through callbacks. Every fallback,
 * default, and sanitization rule (team-colour fallback, goalkeeper
 * override, per-player vs per-team semantics, name/initials sanitizing) is
 * the caller's responsibility, computed before `value` reaches this
 * component and applied after a callback fires.
 */
export function PlayerKitEditor<TPattern extends PlayerKitPattern = PlayerKitPattern>({
  editorKey,
  position,
  activeTab,
  onTabChange,
  value,
  colorOptions,
  allowedPatterns,
  patternLabels,
  onBaseColorChange,
  onPatternChange,
  onPatternColorChange,
  onLabelModeChange,
  onInitialsChange,
  onNameChange,
  onClose,
}: PlayerKitEditorProps<TPattern>) {
  return (
    <div
      style={{ ...EDITOR_STYLE, left: `${position.left}px`, top: `${position.top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="false"
      aria-label="Player kit editor"
    >
      <div style={HEADER_STYLE}>
        <div style={TAB_ROW_STYLE}>
          {TABS.map((tab) => (
            <button
              key={`kit-editor-tab-${tab.id}`}
              type="button"
              style={activeTab === tab.id ? TAB_BUTTON_ACTIVE_STYLE : TAB_BUTTON_STYLE}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" style={CLOSE_STYLE} onClick={onClose} aria-label="Close kit editor">
          ×
        </button>
      </div>

      {activeTab === "base" ? (
        <div style={SECTION_STYLE}>
          <div style={COLOR_GRID_STYLE}>
            {colorOptions.map((option) => {
              const isActive = value.baseColor === option.id;
              return (
                <button
                  key={`kit-base-${editorKey}-${option.id}`}
                  type="button"
                  style={{ ...COLOR_BUTTON_STYLE, ...(isActive ? ACTIVE_SWATCH_RING : null) }}
                  aria-label={`Set base colour ${option.id}`}
                  onClick={() => onBaseColorChange(option.id)}
                >
                  <span style={{ ...COLOR_SWATCH_STYLE, background: option.cssColor }} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "pattern" ? (
        <div style={SECTION_STYLE}>
          <div style={MODE_ROW_STYLE}>
            {allowedPatterns.map((pattern) => {
              const isActive = value.pattern === pattern;
              return (
                <button
                  key={`kit-pattern-${editorKey}-${pattern}`}
                  type="button"
                  style={isActive ? OPTION_BUTTON_ACTIVE_STYLE : OPTION_BUTTON_STYLE}
                  onClick={() => onPatternChange(pattern)}
                >
                  {patternLabels[pattern]}
                </button>
              );
            })}
          </div>
          <div style={COLOR_GRID_STYLE}>
            {colorOptions.map((option) => {
              const isActive = value.patternColor === option.id;
              return (
                <button
                  key={`kit-pattern-color-${editorKey}-${option.id}`}
                  type="button"
                  style={{ ...COLOR_BUTTON_STYLE, ...(isActive ? ACTIVE_SWATCH_RING : null) }}
                  aria-label={`Set pattern colour ${option.id}`}
                  onClick={() => onPatternColorChange(option.id)}
                >
                  <span style={{ ...COLOR_SWATCH_STYLE, background: option.cssColor }} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "label" ? (
        <div style={SECTION_STYLE}>
          <div style={MODE_ROW_STYLE}>
            {LABEL_MODE_CHOICES.map((modeValue) => {
              const isActive = value.labelMode === modeValue;
              return (
                <button
                  key={`kit-label-mode-${editorKey}-${modeValue}`}
                  type="button"
                  style={isActive ? OPTION_BUTTON_ACTIVE_STYLE : OPTION_BUTTON_STYLE}
                  onClick={() => onLabelModeChange(modeValue)}
                >
                  {LABEL_MODE_DISPLAY[modeValue]}
                </button>
              );
            })}
          </div>
          {value.labelMode === "name" ? (
            <input
              type="text"
              maxLength={20}
              value={value.name ?? ""}
              onChange={(event) => onNameChange(event.target.value)}
              style={INPUT_STYLE}
              placeholder="Jordan, Dozer, Pat…"
              aria-label="Player nickname or display name"
            />
          ) : (
            <input
              type="text"
              maxLength={3}
              value={value.initials ?? ""}
              onChange={(event) => onInitialsChange(event.target.value)}
              style={{ ...INPUT_STYLE, ...(value.labelMode === "initials" ? null : { opacity: 0.72 }) }}
              placeholder="ABC"
              aria-label="Player initials"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export {
  EDITOR_MARGIN as PLAYER_KIT_EDITOR_MARGIN,
  EDITOR_MAX_WIDTH as PLAYER_KIT_EDITOR_MAX_WIDTH,
  EDITOR_MAX_HEIGHT_RATIO as PLAYER_KIT_EDITOR_MAX_HEIGHT_RATIO,
};
