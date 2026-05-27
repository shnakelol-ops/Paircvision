/**
 * EventKeyboard.tsx
 *
 * PáircVision Pro Tagging — Event Keyboard
 *
 * The primary capture surface. User taps an event button to begin the
 * Event → Player → Pitch loop.
 *
 * Design:
 *   - Portrait-first, phone-first, thumb-first
 *   - All primary events visible without scroll
 *   - Collapsible secondary sections (Delivery, Effort/Quality)
 *   - No modal, no confirmation screen
 *   - After tap: immediately transitions to Player Picker
 *
 * Phase 3 — Event → Player → Pitch Loop
 */

import { useState } from "react";
import type { EventButtonDef, KeyboardSection, SportProfile } from "../model/sport-profile-types";
import type { ProEventKind } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventKeyboardProps = {
  profile: SportProfile;
  onEventSelected: (kind: ProEventKind, button: EventButtonDef) => void;
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Column count heuristic
// ---------------------------------------------------------------------------

function colsClass(count: number): string {
  if (count <= 2) return "event-keyboard__section-buttons--cols-2";
  if (count <= 3) return "event-keyboard__section-buttons--cols-3";
  if (count <= 4) return "event-keyboard__section-buttons--cols-4";
  return ""; // auto-fit for 5+
}

// ---------------------------------------------------------------------------
// Event Button
// ---------------------------------------------------------------------------

type EventBtnProps = {
  button: EventButtonDef;
  onClick: () => void;
  secondary?: boolean;
  disabled?: boolean;
};

function EventBtn({ button, onClick, secondary = false, disabled = false }: EventBtnProps) {
  return (
    <button
      type="button"
      className={[
        "event-btn",
        `event-btn--${button.tone}`,
        secondary ? "event-btn--secondary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-label={button.label}
    >
      {button.shortLabel ? (
        <>
          <span style={{ fontSize: "11px", fontWeight: 800 }}>{button.shortLabel}</span>
          <span style={{ fontSize: "10px", fontWeight: 600, opacity: 0.8, marginTop: "2px" }}>
            {button.label}
          </span>
        </>
      ) : (
        button.label
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

type SectionProps = {
  section: KeyboardSection;
  onEventSelected: (kind: ProEventKind, button: EventButtonDef) => void;
  disabled: boolean;
};

function KeyboardSectionView({ section, onEventSelected, disabled }: SectionProps) {
  const [collapsed, setCollapsed] = useState(section.collapsible === true);

  return (
    <div className="event-keyboard__section">
      <div className="event-keyboard__section-header">
        {section.label ? (
          <span className="event-keyboard__section-label">{section.label}</span>
        ) : (
          <span />
        )}
        {section.collapsible && (
          <button
            type="button"
            className="event-keyboard__section-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? `Expand ${section.label ?? "section"}` : `Collapse ${section.label ?? "section"}`}
          >
            {collapsed ? "+" : "−"}
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          className={[
            "event-keyboard__section-buttons",
            colsClass(section.buttons.length),
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {section.buttons.map((btn) => (
            <EventBtn
              key={btn.proKind}
              button={btn}
              onClick={() => onEventSelected(btn.proKind, btn)}
              secondary={section.collapsible === true}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EventKeyboard({ profile, onEventSelected, disabled = false }: EventKeyboardProps) {
  return (
    <div className="event-keyboard">
      {profile.keyboardLayout.sections.map((section) => (
        <KeyboardSectionView
          key={section.id}
          section={section}
          onEventSelected={onEventSelected}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
