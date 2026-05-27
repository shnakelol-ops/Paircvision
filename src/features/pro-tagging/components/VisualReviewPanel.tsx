/**
 * VisualReviewPanel.tsx
 *
 * PáircVision Pro Tagging — Visual Pitch Map Review
 *
 * Renders all captured ProEvents as colour-coded dots on a GAA pitch SVG.
 * Filter tabs allow the analyst to drill into event categories or a specific player.
 *
 * Design decisions:
 *   - Pure SVG — no Pixi, no canvas, no external deps
 *   - Pitch geometry matches PitchTapSurface (viewBox 0 0 100 160, portrait)
 *   - Dot colour is determined by event category (tone-matched to CSS vars)
 *   - All filter/player state is local — no global state
 *   - Proof-of-value prototype: no export, no PDF, no tactical analysis
 *
 * Coordinate mapping:
 *   event.nx (0–1)  → cx = nx * 100
 *   event.ny (0–1)  → cy = ny * 160
 *   Events skipped without a location are stored as {nx:0.5, ny:0.5} and
 *   will appear as a cluster near centre — labelled in footer note.
 *
 * Sport vocabulary:
 *   Football/LGFA  → "Kickout" in Restarts filter tab
 *   Hurling/Camogie → "Puckout" in Restarts filter tab
 *   Hurling/Camogie → "Pressure" in delivery/pressure filter tab
 *
 * Phase 7 — Pro Visual Review Prototype
 */

import { useState, useMemo } from "react";
import type { ProEvent } from "../model/pro-event-model";
import type { SportProfile } from "../model/sport-profile-types";
import type { ProSessionState } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Filter categories
// ---------------------------------------------------------------------------

type FilterId = "ALL" | "SCORES" | "SHOTS" | "RESTARTS" | "TURNOVERS" | "DELIVERY" | "PLAYER";

// Using Set<string> so .has(ProEventKind) works without widening issues
const SCORE_KINDS:    ReadonlySet<string> = new Set(["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"]);
const SHOT_KINDS:     ReadonlySet<string> = new Set(["WIDE", "SHOT", "FREE_MISSED"]);
const RESTART_KINDS:  ReadonlySet<string> = new Set(["RESTART_WON", "RESTART_LOST", "SHORT_RESTART", "LONG_RESTART"]);
const TURNOVER_KINDS: ReadonlySet<string> = new Set([
  "TURNOVER_WON", "TURNOVER_LOST",
  "POSSESSION_WON", "POSSESSION_LOST",
  "FREE_WON", "FREE_CONCEDED",
  "MARK",
]);
const DELIVERY_KINDS: ReadonlySet<string> = new Set([
  "DELIVERY_WON", "DELIVERY_LOST",
  "INSIDE_BALL_WON", "INSIDE_BALL_LOST",
  "BREAK_WON", "BREAK_LOST",
  "HOOK", "BLOCK",
  "SIXTY_FIVE", "SIDELINE",
]);

const HURLING_PRESSURE_KINDS: ReadonlySet<string> = new Set(["HOOK", "BLOCK", "BREAK_WON", "BREAK_LOST"]);

// ---------------------------------------------------------------------------
// Dot colours  (hex values match CSS tone vars — SVG fill can't use var())
// ---------------------------------------------------------------------------

function getDotColor(kind: string): string {
  if (kind === "GOAL")              return "#24c15e";  // bright green — goal highlight
  if (SCORE_KINDS.has(kind))        return "#25b055";  // tone-score-active
  if (SHOT_KINDS.has(kind))         return "#d96e00";  // tone-wide-active
  if (RESTART_KINDS.has(kind))      return "#2261af";  // tone-restart-active
  if (TURNOVER_KINDS.has(kind))     return "#b55020";  // tone-turnover-active
  if (HURLING_PRESSURE_KINDS.has(kind)) return "#af2525"; // tone-hurling-active
  if (DELIVERY_KINDS.has(kind))     return "#107f7f";  // tone-delivery-active
  // Effort events
  if (["GOOD_DECISION", "GOOD_PASS", "WORK_RATE_PLUS"].includes(kind))  return "#4a90d9";
  if (["BAD_DECISION", "BAD_PASS", "WORK_RATE_MINUS"].includes(kind))   return "#e67e22";
  if (kind === "REPEATED_MISTAKE")  return "#d73a49";
  return "#8090a8"; // fallback
}

function getDotRadius(kind: string): number {
  if (kind === "GOAL")         return 5.5;
  if (SCORE_KINDS.has(kind))   return 4;
  return 3;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

type LegendItem = { color: string; label: string; kinds: ReadonlySet<string> };

function buildLegendItems(profile: SportProfile): LegendItem[] {
  const isHurling = profile.enabledProKinds.has("HOOK");
  return [
    { color: "#25b055", label: "Score",                                      kinds: SCORE_KINDS    },
    { color: "#d96e00", label: "Shot / Wide",                                kinds: SHOT_KINDS     },
    { color: "#2261af", label: profile.reportVocabulary.restart,             kinds: RESTART_KINDS  },
    { color: "#b55020", label: "Turnovers",                                  kinds: TURNOVER_KINDS },
    { color: isHurling ? "#af2525" : "#107f7f",
      label: isHurling ? "Pressure" : "Delivery",                            kinds: DELIVERY_KINDS },
  ];
}

// ---------------------------------------------------------------------------
// GAA Pitch SVG lines (portrait, viewBox 0 0 100 160)
// Same geometry as PitchTapSurface — inlined here to avoid modifying that file
// ---------------------------------------------------------------------------

function PitchLines() {
  return (
    <>
      <rect x="0" y="0" width="100" height="160" fill="#1a2d1a" />
      {/* Main boundary */}
      <rect x="4" y="4" width="92" height="152" fill="none" stroke="#3a5a3a" strokeWidth="1.5" />
      {/* Midline + centre circle */}
      <line x1="4" y1="80" x2="96" y2="80" stroke="#3a5a3a" strokeWidth="1" />
      <circle cx="50" cy="80" r="10" fill="none" stroke="#3a5a3a" strokeWidth="1" />
      <circle cx="50" cy="80" r="1.5" fill="#3a5a3a" />
      {/* 45/65 lines (dashed) */}
      <line x1="4" y1="27"  x2="96" y2="27"  stroke="#2d4a2d" strokeWidth="0.8" strokeDasharray="2 3" />
      <line x1="4" y1="133" x2="96" y2="133" stroke="#2d4a2d" strokeWidth="0.8" strokeDasharray="2 3" />
      {/* 20m lines */}
      <line x1="4" y1="50"  x2="96" y2="50"  stroke="#3a5a3a" strokeWidth="0.8" />
      <line x1="4" y1="110" x2="96" y2="110" stroke="#3a5a3a" strokeWidth="0.8" />
      {/* Top penalty areas */}
      <rect x="28" y="4"  width="44" height="16" fill="none" stroke="#3a5a3a" strokeWidth="0.8" />
      <rect x="18" y="4"  width="64" height="26" fill="none" stroke="#2d4a2d" strokeWidth="0.8" />
      {/* Bottom penalty areas */}
      <rect x="28" y="140" width="44" height="16" fill="none" stroke="#3a5a3a" strokeWidth="0.8" />
      <rect x="18" y="130" width="64" height="26" fill="none" stroke="#2d4a2d" strokeWidth="0.8" />
      {/* Goal posts */}
      <rect x="39" y="0"   width="22" height="4" fill="#3a5a3a" />
      <rect x="39" y="156" width="22" height="4" fill="#3a5a3a" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisualReviewPanelProps = {
  session: ProSessionState;
  profile: SportProfile;
  events: readonly ProEvent[];
  onBack: () => void;
};

type TaggedPlayer = { id: string; number: number | null; name: string | null };

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function VisualReviewPanel({
  session,
  profile,
  events,
  onBack,
}: VisualReviewPanelProps) {
  const [activeFilter, setActiveFilter] = useState<FilterId>("ALL");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const isHurling = profile.enabledProKinds.has("HOOK");

  // Players who have at least one tagged event
  const taggedPlayers = useMemo<TaggedPlayer[]>(() => {
    const seen = new Map<string, TaggedPlayer>();
    for (const e of events) {
      if (e.playerId && !seen.has(e.playerId)) {
        seen.set(e.playerId, {
          id: e.playerId,
          number: e.playerNumber ?? null,
          name: e.playerName ?? null,
        });
      }
    }
    return [...seen.values()].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  }, [events]);

  // Per-category event counts for tab badges
  const filterCounts = useMemo(() => ({
    ALL:       events.length,
    SCORES:    events.filter(e => SCORE_KINDS.has(e.proKind)).length,
    SHOTS:     events.filter(e => SHOT_KINDS.has(e.proKind)).length,
    RESTARTS:  events.filter(e => RESTART_KINDS.has(e.proKind)).length,
    TURNOVERS: events.filter(e => TURNOVER_KINDS.has(e.proKind)).length,
    DELIVERY:  events.filter(e => DELIVERY_KINDS.has(e.proKind)).length,
    PLAYER:    events.filter(e => !!e.playerId).length,
  }), [events]);

  // Filtered events for the pitch map
  const filteredEvents = useMemo(() => {
    let result: readonly ProEvent[] = events;
    switch (activeFilter) {
      case "SCORES":    result = result.filter(e => SCORE_KINDS.has(e.proKind));    break;
      case "SHOTS":     result = result.filter(e => SHOT_KINDS.has(e.proKind));     break;
      case "RESTARTS":  result = result.filter(e => RESTART_KINDS.has(e.proKind));  break;
      case "TURNOVERS": result = result.filter(e => TURNOVER_KINDS.has(e.proKind)); break;
      case "DELIVERY":  result = result.filter(e => DELIVERY_KINDS.has(e.proKind)); break;
      case "PLAYER":
        result = selectedPlayerId !== null
          ? result.filter(e => e.playerId === selectedPlayerId)
          : result.filter(e => !!e.playerId);
        break;
      default: break;
    }
    return result;
  }, [events, activeFilter, selectedPlayerId]);

  // Legend items (only those with events in this session)
  const legendItems = useMemo(() => buildLegendItems(profile), [profile]);
  const activeLegendItems = useMemo(
    () => legendItems.filter(item => events.some(e => item.kinds.has(e.proKind))),
    [legendItems, events],
  );

  // Sorted dots — smaller radius first so larger dots (goals) render on top
  const sortedDots = useMemo(
    () => [...filteredEvents].sort((a, b) => getDotRadius(a.proKind) - getDotRadius(b.proKind)),
    [filteredEvents],
  );

  // Filter tab definitions
  const filterTabs: { id: FilterId; label: string; count: number }[] = [
    { id: "ALL",       label: "All",                                            count: filterCounts.ALL },
    { id: "SCORES",    label: "Scores",                                         count: filterCounts.SCORES },
    { id: "SHOTS",     label: "Shots",                                          count: filterCounts.SHOTS },
    { id: "RESTARTS",  label: profile.reportVocabulary.restart,                 count: filterCounts.RESTARTS },
    { id: "TURNOVERS", label: "Turnovers",                                      count: filterCounts.TURNOVERS },
    { id: "DELIVERY",  label: isHurling ? "Pressure" : "Delivery",              count: filterCounts.DELIVERY },
    { id: "PLAYER",    label: "Player",                                         count: filterCounts.PLAYER },
  ];

  const handleFilterClick = (id: FilterId) => {
    setActiveFilter(id);
    if (id !== "PLAYER") setSelectedPlayerId(null);
  };

  return (
    <div className="visual-review">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="visual-review__header">
        <button
          type="button"
          className="visual-review__back-btn"
          onClick={onBack}
        >
          ← Live
        </button>
        <div className="visual-review__header-center">
          <span className="visual-review__title">Pitch Map</span>
          <span className="visual-review__sport-chip">{profile.displayName}</span>
        </div>
        <div className="visual-review__header-spacer" aria-hidden="true" />
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className="visual-review__body">

        {/* Match context */}
        <div className="visual-review__context">
          <span className="visual-review__match-label">
            {session.homeTeamName} vs {session.awayTeamName}
          </span>
          <div className="visual-review__meta-chips">
            <span className="visual-review__meta-chip">{events.length} events</span>
          </div>
        </div>

        {/* ── Filter tabs ─────────────────────────────────────────── */}
        <div className="visual-review__filter-row" role="tablist" aria-label="Filter events">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.id}
              className={[
                "visual-review__filter-btn",
                activeFilter === tab.id ? "visual-review__filter-btn--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleFilterClick(tab.id)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="visual-review__filter-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Player sub-row (PLAYER filter active) ───────────────── */}
        {activeFilter === "PLAYER" && taggedPlayers.length === 0 && (
          <p className="visual-review__player-empty">
            No player-tagged events in this session
          </p>
        )}

        {activeFilter === "PLAYER" && taggedPlayers.length > 0 && (
          <div className="visual-review__player-row">
            <button
              type="button"
              className={[
                "visual-review__player-btn",
                selectedPlayerId === null ? "visual-review__player-btn--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setSelectedPlayerId(null)}
            >
              All
            </button>
            {taggedPlayers.map(p => (
              <button
                key={p.id}
                type="button"
                className={[
                  "visual-review__player-btn",
                  selectedPlayerId === p.id ? "visual-review__player-btn--active" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => setSelectedPlayerId(p.id)}
                title={p.name ?? undefined}
              >
                #{p.number ?? "?"}
              </button>
            ))}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {events.length === 0 && (
          <div className="visual-review__empty">
            <span className="visual-review__empty-icon" aria-hidden="true">📍</span>
            <p className="visual-review__empty-title">No events yet</p>
            <p className="visual-review__empty-hint">
              Log events with pitch locations to see them mapped here.
            </p>
          </div>
        )}

        {/* ── Pitch with event dots ───────────────────────────────── */}
        {events.length > 0 && (
          <div className="visual-review__pitch-wrap">
            <svg
              viewBox="0 0 100 160"
              className="visual-review__pitch-svg"
              aria-label="Event pitch map"
            >
              <PitchLines />

              {/* Event dots — sorted so larger (goals) render on top */}
              {sortedDots.map(event => (
                <circle
                  key={event.id}
                  cx={event.nx * 100}
                  cy={event.ny * 160}
                  r={getDotRadius(event.proKind)}
                  fill={getDotColor(event.proKind)}
                  fillOpacity={0.88}
                  stroke="#000"
                  strokeWidth={0.5}
                  strokeOpacity={0.35}
                />
              ))}
            </svg>
          </div>
        )}

        {/* ── Legend ──────────────────────────────────────────────── */}
        {activeLegendItems.length > 0 && (
          <div className="visual-review__legend">
            {activeLegendItems.map(item => (
              <span key={item.label} className="visual-review__legend-item">
                <svg
                  width="10"
                  height="10"
                  aria-hidden="true"
                  style={{ display: "block", flexShrink: 0 }}
                >
                  <circle cx="5" cy="5" r="4" fill={item.color} />
                </svg>
                {item.label}
              </span>
            ))}
          </div>
        )}

        {/* ── Event count ─────────────────────────────────────────── */}
        {events.length > 0 && (
          <p className="visual-review__count">
            {filteredEvents.length === events.length
              ? `${events.length} event${events.length !== 1 ? "s" : ""}`
              : `${filteredEvents.length} of ${events.length} event${events.length !== 1 ? "s" : ""} shown`
            }
          </p>
        )}

        {/* Footer note */}
        <p className="visual-review__footer-note">
          Events logged without a pitch tap appear near centre · Prototype view
        </p>

      </div>
    </div>
  );
}
