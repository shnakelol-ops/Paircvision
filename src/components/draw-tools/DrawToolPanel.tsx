import type { CSSProperties } from "react";

/**
 * One tool button. `active`/`onSelect` are fully resolved by the caller —
 * this component holds no drawing-domain knowledge (no tool-id union, no
 * "move deactivates on Label" logic, no portrait/landscape guards). That
 * logic stays where it already lives (Standard Slate's own state/
 * controller in TacticalPadLiteClean.tsx) so there is exactly one source
 * of truth for what a tool selection means and does.
 */
export type DrawToolPanelOption = {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
};

/** One colour swatch, same fully-resolved-by-caller shape as above. */
export type DrawColorPanelOption = {
  label: string;
  value: number;
  css: string;
  active: boolean;
  ariaLabel: string;
  onSelect: () => void;
};

/**
 * Every style decision this panel renders with, supplied by the caller.
 * Standard Slate already computes these per layout mode (compact
 * landscape / mobile portrait / default) — extracting the JSX must not
 * duplicate that computation, so the panel just renders whatever it's
 * given rather than knowing about layout modes itself.
 */
export type DrawToolPanelStyles = {
  section: CSSProperties;
  sectionTitle: CSSProperties;
  toolGrid: CSSProperties;
  toolButton: CSSProperties;
  toolButtonActive: CSSProperties;
  colorGrid: CSSProperties;
  colorButton: CSSProperties;
  colorButtonActive: CSSProperties;
  colorSwatch: CSSProperties;
};

export type DrawToolPanelProps = {
  /** Section heading text (Standard Slate's current content passes "Draw"). */
  title: string;
  tools: readonly DrawToolPanelOption[];
  colors: readonly DrawColorPanelOption[];
  styles: DrawToolPanelStyles;
  /** Applied to the tool-grid wrapper div, for any external CSS (media queries etc.) keyed off it. */
  toolGridClassName?: string;
  /**
   * Standard Slate only shows a "Colour" heading above the colour grid in
   * its compact-landscape layout, never in portrait/default — an existing,
   * intentional asymmetry this panel preserves rather than resolves.
   */
  showColorSectionTitle?: boolean;
  colorSectionTitle?: string;
};

/**
 * Presentational Draw tool/colour panel shared by Standard Slate (and,
 * from PR4 onward, Game Timing). Owns no drawing state, controller
 * reference, or persistence of any kind — it only renders `tools`/`colors`
 * and reports picks through each option's own `onSelect`. Every fallback,
 * guard, and mode-specific decision (which tools are available, what a
 * tool's active state means, portrait/landscape styling) is the caller's
 * responsibility, resolved before these props reach this component.
 */
export function DrawToolPanel({
  title,
  tools,
  colors,
  styles,
  toolGridClassName,
  showColorSectionTitle = false,
  colorSectionTitle = "Colour",
}: DrawToolPanelProps) {
  return (
    <div style={styles.section}>
      <p style={styles.sectionTitle}>{title}</p>
      <div className={toolGridClassName} style={styles.toolGrid}>
        {tools.map((tool) => (
          <button
            key={`draw-tool-${tool.id}`}
            type="button"
            style={tool.active ? styles.toolButtonActive : styles.toolButton}
            onClick={tool.onSelect}
          >
            {tool.label}
          </button>
        ))}
      </div>
      {showColorSectionTitle ? <p style={styles.sectionTitle}>{colorSectionTitle}</p> : null}
      <div style={styles.colorGrid}>
        {colors.map((color) => (
          <button
            key={`draw-color-${color.label.toLowerCase()}`}
            type="button"
            aria-label={color.ariaLabel}
            style={color.active ? styles.colorButtonActive : styles.colorButton}
            onClick={color.onSelect}
          >
            <span style={{ ...styles.colorSwatch, background: color.css }} />
          </button>
        ))}
      </div>
    </div>
  );
}
