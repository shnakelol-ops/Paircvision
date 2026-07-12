import { useRef, useState } from "react";
import type { CSSProperties } from "react";

// Permanent command centre for every non-tagging Rapid Capture action.
// Sections/items are supplied by the caller so new actions (Voice Notes,
// Player Recognition, Match Settings, Share Report, ...) are just more
// entries in the array — no change to this component required.

export type MatchHubMenuItem = {
  id: string;
  label: string;
  /** Plain action item. Mutually exclusive with onFileSelect. */
  onSelect?: () => void;
  /** File-picker item — opens a hidden file input instead of firing immediately. */
  onFileSelect?: (file: File) => void;
  /** file input accept attribute, used only with onFileSelect. */
  accept?: string;
  disabled?: boolean;
  badge?: string;
};

export type MatchHubMenuSection = {
  id: string;
  label: string;
  items: MatchHubMenuItem[];
};

/**
 * Inset from the viewport's bottom-right corner, in px (safe-area-inset-
 * bottom is added on top of `bottom` automatically). A plain fixed default
 * for now — kept as a typed prop, not a hardcoded style, so a future PR can
 * make this stateful (drag-to-reposition) without touching how the FAB
 * renders.
 */
export type MatchHubFabPosition = { right: number; bottom: number };

export const DEFAULT_FAB_POSITION: MatchHubFabPosition = { right: 14, bottom: 14 };

export function RapidMatchHubFab({
  sections,
  position = DEFAULT_FAB_POSITION,
  open: controlledOpen,
  onOpenChange,
}: {
  sections: MatchHubMenuSection[];
  position?: MatchHubFabPosition;
  /** Externally-controlled open state (e.g. a halftime panel's "Actions" button). Uncontrolled if omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileHandlerRef = useRef<((file: File) => void) | null>(null);

  function handleSelect(item: MatchHubMenuItem) {
    if (item.disabled) return;
    if (item.onFileSelect) {
      pendingFileHandlerRef.current = item.onFileSelect;
      if (fileInputRef.current) fileInputRef.current.accept = item.accept ?? "*/*";
      fileInputRef.current?.click();
      setOpen(false);
      return;
    }
    if (item.onSelect) {
      setOpen(false);
      item.onSelect();
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) pendingFileHandlerRef.current?.(file);
    pendingFileHandlerRef.current = null;
  }

  // env(safe-area-inset-bottom) keeps the FAB clear of device home-indicator
  // / gesture-nav areas; `position.bottom` is the extra margin above that.
  const fabBottom = `calc(${position.bottom}px + env(safe-area-inset-bottom, 0px))`;
  const panelBottom = `calc(${position.bottom + 60}px + env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        style={S.hiddenFileInput}
        onChange={handleFileInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {open && (
        <div style={S.backdrop} onClick={() => setOpen(false)} />
      )}

      {open && (
        <div
          style={{ ...S.panel, right: position.right, bottom: panelBottom }}
          role="menu"
          aria-label="Match Hub"
        >
          {sections.map((section) => (
            <div key={section.id} style={S.section}>
              <span style={S.sectionLabel}>{section.label}</span>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  onClick={() => handleSelect(item)}
                  disabled={item.disabled}
                  style={{ ...S.item, ...(item.disabled ? S.itemDisabled : {}) }}
                >
                  <span>{item.label}</span>
                  {item.badge && <span style={S.badge}>{item.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          ...S.fab,
          ...(open ? S.fabOpen : {}),
          right: position.right,
          bottom: fabBottom,
        }}
        aria-label="Match Hub"
        aria-expanded={open}
      >
        {open ? "✕" : "⚡"}
      </button>
    </>
  );
}

const S: Record<string, CSSProperties> = {
  hiddenFileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none",
  },
  // Split border (not shorthand) — fabOpen overrides borderColor every time
  // the FAB toggles open/closed; mixing shorthand/non-shorthand for the same
  // property trips a React styling warning across rerenders.
  fab: {
    position: "fixed",
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "#161b22",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "#30363d",
    color: "#e6edf3",
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    outline: "none",
    boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
    zIndex: 30,
  },
  fabOpen: {
    background: "#f0883e",
    borderColor: "#f0883e",
    color: "#0d1117",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 25,
  },
  panel: {
    position: "fixed",
    width: 250,
    maxHeight: "min(70%, 480px)",
    overflowY: "auto",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 14,
    padding: "10px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
    zIndex: 30,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6e7681",
    padding: "4px 10px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    background: "transparent",
    border: "none",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 14,
    fontWeight: 600,
    padding: "11px 10px",
    minHeight: 44,
    textAlign: "left",
    cursor: "pointer",
    outline: "none",
  },
  itemDisabled: {
    color: "#6e7681",
    cursor: "default",
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8b949e",
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "3px 6px",
    flexShrink: 0,
  },
};
