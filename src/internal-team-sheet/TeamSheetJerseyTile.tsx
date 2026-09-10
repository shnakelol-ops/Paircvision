import type { CSSProperties } from "react";
import type { TeamSheetPlayer } from "./team-sheet-types";
import { JERSEY_ASPECT, getJerseySrc } from "./team-sheet-jersey";

interface Props {
  player: TeamSheetPlayer;
  editable: boolean;
  size?: number;
  onNameChange: (name: string) => void;
  /**
   * Starting XV jerseys no longer show the squad number over the shirt —
   * pitch position identifies the player, so the overlay is unnecessary
   * clutter. Presentation only: `player.number` is untouched and still
   * drives GK-vs-outfield jersey selection. Defaults to true so any other
   * caller keeps today's behaviour unless it explicitly opts out.
   */
  showNumberOverlay?: boolean;
}

export function TeamSheetJerseyTile({ player, editable, size = 54, onNameChange, showNumberOverlay = true }: Props) {
  const jerseySrc = getJerseySrc(player.number);
  const height = Math.round(size * JERSEY_ASPECT);
  const name = player.name.trim();

  return (
    <div style={S.tile}>
      <div style={{ ...S.jerseyWrap, width: size, height }}>
        <img
          src={jerseySrc}
          alt={`#${player.number} jersey`}
          width={size}
          height={height}
          style={S.jerseyImg}
          draggable={false}
        />
        {showNumberOverlay && <span style={S.numberText}>{player.number}</span>}
      </div>
      {editable ? (
        <input
          type="text"
          value={player.name}
          placeholder={`#${player.number}`}
          onChange={(e) => onNameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={S.nameInput}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      ) : (
        name && <span style={S.nameText}>{name}</span>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  tile: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 3,
    width: 84,
    flexShrink: 0,
  },
  jerseyWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 0 2px rgba(4, 8, 14, 0.55)) drop-shadow(0 1px 3px rgba(4, 8, 14, 0.5))",
  },
  jerseyImg: {
    display: "block",
    objectFit: "contain" as const,
    pointerEvents: "none",
  },
  numberText: {
    position: "absolute",
    top: "54%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontWeight: 900,
    fontSize: 15,
    color: "#ffffff",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.3px",
    lineHeight: 1,
    pointerEvents: "none",
    WebkitTextStroke: "0.75px rgba(6, 10, 16, 0.9)",
    textShadow: [
      "0 1px 1px rgba(0,0,0,0.6)",
      "-1px -1px 0 rgba(6,10,16,0.8)",
      "1px -1px 0 rgba(6,10,16,0.8)",
      "-1px 1px 0 rgba(6,10,16,0.8)",
      "1px 1px 0 rgba(6,10,16,0.8)",
    ].join(", "),
  } as CSSProperties,
  nameInput: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "rgba(8, 20, 34, 0.55)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    color: "#e7f0f8",
    fontSize: 10,
    fontWeight: 700,
    textAlign: "center" as const,
    padding: "2px 4px",
    outline: "none",
    fontFamily: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis" as const,
  },
  nameText: {
    fontSize: 10,
    fontWeight: 700,
    color: "#e7f0f8",
    textAlign: "center" as const,
    maxWidth: 80,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.2,
    background: "rgba(8, 20, 34, 0.55)",
    borderRadius: 4,
    padding: "1px 6px",
  },
};
