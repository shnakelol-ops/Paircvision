import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { MatchEvent } from "../core/stats/stats-event-model";
import { computeTerritorialPressure } from "../tactical/pressure-engine";
import { computeTacticalSignals, type TacticalSignal } from "../tactical/tactical-signals";

interface Props {
  events: readonly MatchEvent[];
  clockSeconds: number;
}

export function RapidSignalBar({ events, clockSeconds }: Props) {
  const signals = useMemo<TacticalSignal[]>(() => {
    if (events.length === 0) return [];
    const states = computeTerritorialPressure(events, clockSeconds);
    return computeTacticalSignals(states);
  }, [events, clockSeconds]);

  // No events yet — hide entirely so pitch size is unaffected at match start
  if (events.length === 0) return null;

  return (
    <div style={S.bar}>
      {signals.length === 0 ? (
        <div style={S.empty}>No tactical signals detected yet</div>
      ) : (
        signals.map((sig) => (
          <div key={sig.id} style={S.row}>
            <span style={{ ...S.icon, ...(sig.level === "red" ? S.iconRed : S.iconAmber) }}>
              ⚠
            </span>
            <span style={{ ...S.text, ...(sig.level === "red" ? S.textRed : S.textAmber) }}>
              {sig.text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  bar: {
    background: "#0d1117",
    borderTop: "1px solid #21262d",
    paddingTop: 5,
    paddingBottom: 5,
    flexShrink: 0,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 5,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 2,
    paddingBottom: 2,
  },
  icon: {
    fontSize: 10,
    flexShrink: 0,
    lineHeight: "1.6",
  },
  iconAmber: { color: "#d29922" },
  iconRed:   { color: "#f85149" },
  text: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: "1.4",
    letterSpacing: "-0.1px",
  },
  textAmber: { color: "#e3b341" },
  textRed:   { color: "#f85149" },
  empty: {
    fontSize: 11,
    color: "#6e7681",
    fontStyle: "italic",
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 2,
    paddingBottom: 2,
  },
};
