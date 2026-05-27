/**
 * PossessionReviewPanel.tsx
 *
 * PáircVision Pro Tagging — Session Possession Review
 *
 * Shows a post-session summary of possession data derived by the pure
 * possession engine (possession-engine.ts). No state of its own — all
 * data is computed by the caller and passed in as props.
 *
 * Sport vocabulary is sourced from the SportProfile:
 *   - Football/LGFA → "Kickout won", "Kickout lost", etc.
 *   - Hurling/Camogie → "Puckout won", "Puckout lost", etc.
 *
 * Proof-of-value UI — compact cards and bar rows, no tables, no dashboards.
 *
 * Phase 5 — Possession Engine UI Display
 */

import type { PossessionDataset } from "../engine/possession-engine";
import type { SportProfile } from "../model/sport-profile-types";
import type { ProSessionState, PossessionStartReason } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Sport-vocabulary helpers
// ---------------------------------------------------------------------------

/** All possible start reasons in display order (most common first). */
const ORDERED_START_REASONS: PossessionStartReason[] = [
  "RESTART_WON",
  "TURNOVER_WON",
  "FREE_WON",
  "MARK",
  "BREAK_WON",
  "DELIVERY_WON",
  "POSSESSION_WON",
  "MATCH_START",
];

function getStartReasonLabel(reason: PossessionStartReason, profile: SportProfile): string {
  switch (reason) {
    case "RESTART_WON":    return profile.reportVocabulary.restartWon;
    case "TURNOVER_WON":   return "Turnover won";
    case "FREE_WON":       return "Free won";
    case "MARK":           return "Mark";
    case "BREAK_WON":      return "Break won";
    case "DELIVERY_WON":   return "Delivery won";
    case "POSSESSION_WON": return "Possession won";
    case "MATCH_START":    return "Match start";
    default:               return reason as string;
  }
}

const START_REASON_TONE_CLASS: Record<PossessionStartReason, string> = {
  RESTART_WON:    "review-source-row--restart",
  TURNOVER_WON:   "review-source-row--turnover",
  FREE_WON:       "review-source-row--free",
  MARK:           "review-source-row--football",
  BREAK_WON:      "review-source-row--hurling",
  DELIVERY_WON:   "review-source-row--delivery",
  POSSESSION_WON: "review-source-row--possession",
  MATCH_START:    "review-source-row--possession",
};

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={["review-stat-card", accent ? "review-stat-card--accent" : ""].filter(Boolean).join(" ")}>
      <span className="review-stat-card__value">{value}</span>
      <span className="review-stat-card__label">{label}</span>
      {sub !== undefined && (
        <span className="review-stat-card__sub">{sub}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PossessionReviewPanelProps = {
  session: ProSessionState;
  profile: SportProfile;
  possessionData: PossessionDataset;
  onBack: () => void;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PossessionReviewPanel({
  session,
  profile,
  possessionData,
  onBack,
}: PossessionReviewPanelProps) {
  const {
    totalFor,
    scoringPossessionsFor,
    scoreReturnRateFor,
    shotPossessionsFor,
    avgDurationSecondsFor,
    byStartReason,
  } = possessionData;

  // Build source rows — only sources with count > 0 in this session
  type SourceEntry = {
    reason: PossessionStartReason;
    count: number;
    label: string;
    toneClass: string;
  };

  const sourceRows: SourceEntry[] = ORDERED_START_REASONS
    .map((reason) => ({
      reason,
      count: byStartReason[reason]?.for ?? 0,
      label: getStartReasonLabel(reason, profile),
      toneClass: START_REASON_TONE_CLASS[reason] ?? "",
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxSourceCount = sourceRows.length > 0 ? (sourceRows[0]?.count ?? 1) : 1;

  const scorePercent = pct(scoringPossessionsFor, totalFor);
  const shotPercent = pct(shotPossessionsFor, totalFor);
  const halfLabel = session.half === 1 ? "1st Half" : "2nd Half";

  return (
    <div className="possession-review">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="possession-review__header">
        <button
          type="button"
          className="possession-review__back-btn"
          onClick={onBack}
        >
          ← Live
        </button>

        <div className="possession-review__header-center">
          <span className="possession-review__title">Session Review</span>
          <span className="possession-review__sport-chip">{profile.displayName}</span>
        </div>

        {/* Balance spacer */}
        <div className="possession-review__header-spacer" aria-hidden="true" />
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="possession-review__body">

        {/* Match context */}
        <div className="possession-review__context">
          <span className="possession-review__match-label">
            {session.homeTeamName} vs {session.awayTeamName}
          </span>
          <div className="possession-review__meta-chips">
            <span className="possession-review__meta-chip">{halfLabel}</span>
            <span className="possession-review__meta-chip">{session.events.length} events</span>
          </div>
        </div>

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {totalFor === 0 && (
          <div className="possession-review__empty">
            <span className="possession-review__empty-icon" aria-hidden="true">📊</span>
            <p className="possession-review__empty-title">No possessions derived yet</p>
            <p className="possession-review__empty-hint">
              Log {profile.reportVocabulary.restartWon}, Turnover Won or Free Won
              events to see possession tracking.
            </p>
          </div>
        )}

        {/* ── Possession summary ──────────────────────────────────────── */}
        {totalFor > 0 && (
          <>
            {/* Stat cards */}
            <div className="possession-review__section">
              <p className="possession-review__section-label">Possessions</p>
              <div className="possession-review__stat-grid">
                <StatCard label="Total" value={totalFor} />
                <StatCard label="Scored" value={scoringPossessionsFor} sub={scorePercent} accent />
                <StatCard label="Shot" value={shotPossessionsFor} sub={shotPercent} />
                {avgDurationSecondsFor !== null && (
                  <StatCard label="Avg dur." value={fmtDuration(avgDurationSecondsFor)} />
                )}
              </div>
            </div>

            {/* Score return rate bar */}
            <div className="possession-review__section">
              <p className="possession-review__section-label">Score return rate</p>
              <div className="possession-review__rate-wrap">
                <div className="possession-review__rate-bar">
                  <div
                    className="possession-review__rate-bar-fill possession-review__rate-bar-fill--score"
                    style={{ width: `${Math.round(scoreReturnRateFor * 100)}%` }}
                  />
                </div>
                <span className="possession-review__rate-label">
                  {Math.round(scoreReturnRateFor * 100)}% of possessions ended in a score
                </span>
              </div>
            </div>

            {/* Possession sources */}
            {sourceRows.length > 0 && (
              <div className="possession-review__section">
                <p className="possession-review__section-label">
                  {profile.reportVocabulary.restart} &amp; possession sources
                </p>
                <div className="possession-review__sources">
                  {sourceRows.map((row) => (
                    <div
                      key={row.reason}
                      className={[
                        "possession-review__source-row",
                        row.toneClass,
                      ].join(" ")}
                    >
                      <span className="possession-review__source-label">
                        {row.label}
                      </span>
                      <div className="possession-review__source-bar-wrap">
                        <div
                          className="possession-review__source-bar-fill"
                          style={{
                            width: `${Math.round((row.count / maxSourceCount) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="possession-review__source-count">
                        {row.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer note */}
        <p className="possession-review__footer-note">
          Possession data derived from logged events
          {totalFor > 0 && " · Accuracy improves with more tagged events"}
        </p>

      </div>
    </div>
  );
}
