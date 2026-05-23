import { useEffect, useState } from "react";

import type { MatchEventKind } from "../core/stats/stats-event-model";

type EventLauncherTone = "blue" | "green" | "orange" | "purple" | "red" | "teal" | "slate";

type EventLauncherItem = {
  kind: MatchEventKind;
  label: string;
};

export type StatsEventLauncherGroup = {
  id: string;
  label: string;
  tone: EventLauncherTone;
  items: readonly EventLauncherItem[];
};

type StatsEventLauncherProps = {
  groups: readonly StatsEventLauncherGroup[];
  selectedEventKind: MatchEventKind;
  disabled?: boolean;
  onSelectEvent: (kind: MatchEventKind) => void;
};

const TILE_TONE_STYLES: Record<EventLauncherTone, { background: string; border: string }> = {
  blue: {
    background: "#2563eb",
    border: "#60a5fa",
  },
  green: {
    background: "#068a44",
    border: "#34d399",
  },
  orange: {
    background: "#f05907",
    border: "#fb923c",
  },
  purple: {
    background: "#9810fa",
    border: "#c084fc",
  },
  red: {
    background: "#b50020",
    border: "#ef4444",
  },
  teal: {
    background: "#0f766e",
    border: "#2dd4bf",
  },
  slate: {
    background: "#1e293b",
    border: "#64748b",
  },
};

export function StatsEventLauncher({
  groups,
  selectedEventKind,
  disabled = false,
  onSelectEvent,
}: StatsEventLauncherProps) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (openGroupId == null) return;
    const activeGroup = groups.find((group) => group.id === openGroupId);
    if (!activeGroup || activeGroup.items.length <= 1) {
      setOpenGroupId(null);
    }
  }, [groups, openGroupId]);

  return (
    <section style={{ display: "grid", gap: "10px" }} aria-label="Matchday event launcher">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        {groups.map((group) => {
          const canExpand = group.items.length > 1;
          const selectedItem = group.items.find((item) => item.kind === selectedEventKind) ?? null;
          const isOpen = canExpand && openGroupId === group.id;
          const isActive = selectedItem != null;
          const tone = TILE_TONE_STYLES[group.tone];

          return (
            <div key={group.id} style={{ display: "grid", gap: "6px", alignContent: "start" }}>
              <button
                type="button"
                onClick={() => {
                  if (disabled) return;
                  if (!canExpand) {
                    const onlyItem = group.items[0];
                    if (!onlyItem) return;
                    onSelectEvent(onlyItem.kind);
                    return;
                  }
                  setOpenGroupId((prev) => (prev === group.id ? null : group.id));
                }}
                aria-expanded={canExpand ? isOpen : undefined}
                disabled={disabled || group.items.length === 0}
                style={{
                  borderRadius: "14px",
                  border: `1px solid ${tone.border}`,
                  minHeight: "88px",
                  padding: "10px 10px 9px",
                  color: "#f8fafc",
                  background: tone.background,
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.52 : 1,
                  display: "grid",
                  alignContent: "space-between",
                  gap: "8px",
                  boxShadow: isOpen || isActive
                    ? "0 0 0 2px rgba(216,251,255,0.75), 0 6px 16px rgba(2,6,23,0.42)"
                    : "0 4px 12px rgba(2,6,23,0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: "18px",
                    lineHeight: 1.1,
                    fontWeight: 800,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {group.label}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    lineHeight: 1.2,
                    fontWeight: 700,
                    opacity: 0.95,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedItem
                    ? selectedItem.label
                    : canExpand
                      ? `${group.items.length} options ${isOpen ? "▲" : "▼"}`
                      : group.items[0]?.label ?? "Select"}
                </div>
              </button>
              {isOpen ? (
                <div
                  role="group"
                  aria-label={`${group.label} options`}
                  style={{
                    borderRadius: "11px",
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(15,23,42,0.94)",
                    padding: "6px",
                    display: "grid",
                    gap: "6px",
                    boxShadow: "0 8px 20px rgba(2,6,23,0.46)",
                  }}
                >
                  {group.items.map((item) => {
                    const isSelected = selectedEventKind === item.kind;
                    return (
                      <button
                        key={`${group.id}-${item.kind}`}
                        type="button"
                        onClick={() => {
                          if (disabled) return;
                          onSelectEvent(item.kind);
                          setOpenGroupId(null);
                        }}
                        disabled={disabled}
                        style={{
                          borderRadius: "9px",
                          border: isSelected
                            ? "1px solid rgba(34,197,94,0.95)"
                            : "1px solid rgba(148,163,184,0.45)",
                          background: isSelected ? "rgba(22,101,52,0.78)" : "rgba(30,41,59,0.8)",
                          color: "#f8fafc",
                          minHeight: "38px",
                          padding: "7px 8px",
                          fontSize: "12px",
                          lineHeight: 1.15,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          textAlign: "left",
                          cursor: disabled ? "not-allowed" : "pointer",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
