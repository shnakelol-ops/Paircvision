import type { CSSProperties } from "react";
import type { TeamSheetPlayer } from "./team-sheet-types";
import { JERSEY_ASPECT, getJerseySrc } from "./team-sheet-jersey";

// Compact substitute tile — smaller jersey than the Starting XV, no number
// overlaid on the shirt (pitch position isn't available to identify a sub,
// so the number is shown as a plain "16." label next to the name instead).
// Same real jersey assets as the pitch (getJerseySrc): number 1 = GK
// jersey, so marking a substitute goalkeeper is done by giving them squad
// number 1, exactly like the Starting XV's own #1 slot.

interface Props {
  player: TeamSheetPlayer;
  editable: boolean;
  size?: number;
  onNumberChange?: (number: number) => void;
  onNameChange?: (name: string) => void;
  onRemove?: () => void;
}

export function TeamSheetSubTile({ player, editable, size = 30, onNumberChange, onNameChange, onRemove }: Props) {
  const jerseySrc = getJerseySrc(player.number);
  const height = Math.round(size * JERSEY_ASPECT);
  const name = player.name.trim();

  if (!editable) {
    return (
      <div style={S.tile}>
        <img
          className="ts-jersey-shadow"
          src={jerseySrc}
          alt={`#${player.number} jersey`}
          width={size}
          height={height}
          style={S.jerseyImg}
          draggable={false}
        />
        <span style={S.label}>
          {player.number}. {name}
        </span>
      </div>
    );
  }

  return (
    <div style={S.row} onClick={(e) => e.stopPropagation()}>
      <img
        className="ts-jersey-shadow"
        src={jerseySrc}
        alt={`#${player.number} jersey`}
        width={size}
        height={height}
        style={S.jerseyImg}
        draggable={false}
      />
      <input
        type="number"
        value={player.number}
        onChange={(e) => onNumberChange?.(Number(e.target.value) || 0)}
        style={S.numberInput}
        autoComplete="off"
      />
      <input
        type="text"
        value={player.name}
        placeholder="Name"
        onChange={(e) => onNameChange?.(e.target.value)}
        style={S.nameInput}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button type="button" style={S.removeBtn} onClick={onRemove} aria-label="Remove substitute">
        ✕
      </button>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  tile: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
    width: 92,
    flexShrink: 0,
  },
  jerseyImg: {
    display: "block",
    objectFit: "contain" as const,
    pointerEvents: "none",
    filter: "drop-shadow(0 0 2px rgba(4, 8, 14, 0.5))",
  },
  // Wraps to a second line rather than ellipsis-truncating — a sub's name
  // is the whole point of this label, so a compact-but-readable two-line
  // wrap beats clipping it to fit a fixed single-line width.
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: "#e7f0f8",
    textAlign: "center" as const,
    width: 92,
    lineHeight: 1.25,
    wordBreak: "break-word" as const,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "4px 0",
    borderBottom: "1px solid #17324a",
  },
  numberInput: {
    width: 34,
    boxSizing: "border-box" as const,
    background: "rgba(8, 20, 34, 0.55)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    color: "#e7f0f8",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center" as const,
    padding: "4px 2px",
    outline: "none",
    fontFamily: "inherit",
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box" as const,
    background: "rgba(8, 20, 34, 0.55)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    color: "#e7f0f8",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    outline: "none",
    fontFamily: "inherit",
  },
  removeBtn: {
    flexShrink: 0,
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 12,
    padding: "4px 8px",
    cursor: "pointer",
    outline: "none",
  },
};
