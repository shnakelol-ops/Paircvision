import type { CSSProperties } from "react";
import type { DetailOption } from "./rapid-capture-events";

// Generic, reusable transient enrichment strip. Used for scores (source),
// turnovers and kickouts/puckouts (follow-up detail) — the option set is
// entirely caller-supplied, so this component knows nothing about event
// kinds or Match Stats tag vocabulary.
export function RapidDetailBar({
  options,
  onSelect,
}: {
  options: DetailOption[];
  onSelect: (tag: string) => void;
}) {
  return (
    <div style={S.bar}>
      {options.map((opt) => (
        <button key={opt.tag} onClick={() => onSelect(opt.tag)} style={S.btn}>
          {opt.label}
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
    flexShrink: 0,
  },
  btn: {
    flex: 1,
    background: "#21262d",
    border: "1.5px solid #f0883e",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
    cursor: "pointer",
    outline: "none",
  },
};
