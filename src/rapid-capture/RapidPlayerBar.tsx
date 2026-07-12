import type { CSSProperties } from "react";
import type { RapidSquadPlayer } from "./rapid-capture-events";

const DEFAULT_JERSEY_NUMBERS: RapidSquadPlayer[] = Array.from({ length: 20 }, (_, i) => ({ number: i + 1 }));

// Optional, non-blocking player attribution strip. Uses the session's actual
// squad numbers when one was supplied (e.g. imported from Event Stats);
// otherwise falls back to a plain 1-20 jersey grid with no names.
export function RapidPlayerBar({
  squad,
  teamColour,
  onSelect,
}: {
  squad: readonly RapidSquadPlayer[] | undefined;
  teamColour: string;
  onSelect: (player: RapidSquadPlayer) => void;
}) {
  const players = squad && squad.length > 0 ? squad : DEFAULT_JERSEY_NUMBERS;
  return (
    <div style={S.bar}>
      {players.map((p) => (
        <button
          key={p.id ?? p.number}
          onClick={() => onSelect(p)}
          style={{ ...S.btn, borderColor: teamColour }}
          title={p.name}
        >
          {p.number}
        </button>
      ))}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  bar: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    background: "#161b22",
    borderTop: "1px solid #21262d",
    overflowX: "auto",
    flexShrink: 0,
  },
  btn: {
    flexShrink: 0,
    minWidth: 44,
    minHeight: 44,
    background: "#21262d",
    border: "1.5px solid #388bfd",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    outline: "none",
  },
};
