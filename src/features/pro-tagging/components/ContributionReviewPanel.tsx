/**
 * ContributionReviewPanel.tsx
 *
 * PáircVision Pro Tagging — Player Contribution Review
 *
 * Shows a post-session per-player impact summary derived by the pure
 * contribution engine (contribution-engine.ts). No state of its own — all
 * data is computed by the caller and passed in as props.
 *
 * Coach-friendly language:
 *   "What they gave us"   — per-player card header
 *   "Helped us: N"        — positive action count
 *   "Hurt us: N"          — negative action count
 *   "Score impact"        — scoring breakdown value
 *   "Possession impact"   — possession breakdown value
 *   "Pressure impact"     — hurlingSpecific breakdown (hurling/camogie only)
 *   "Delivery"            — delivery breakdown value
 *   "[Kickout/Puckout]"   — restarts breakdown, label from sport profile
 *   "Effort"              — effort/quality breakdown value
 *   "Score chains: N"     — possessions in which this player appeared that scored
 *   "⚠ Repeated mistake"  — flagged when REPEATED_MISTAKE events present
 *
 * Sport vocabulary is driven by SportProfile — football sees "Kickout",
 * hurling sees "Puckout". Pressure impact section only shown for hurling profiles.
 *
 * Proof-of-value UI — compact player cards, ranked by impact score.
 * No tables. No fantasy ratings. No "weakest link" framing.
 *
 * Phase 6 — Player Contribution Review
 */

import type { ContributionDataset, PlayerContributionCard } from "../engine/contribution-engine";
import { contributionRatingColor } from "../engine/contribution-engine";
import type { SportProfile } from "../model/sport-profile-types";
import type { ProSessionState } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Sport-profile helpers
// ---------------------------------------------------------------------------

/** True if this profile enables hurling-specific events (HOOK/BLOCK/BREAK). */
function isHurlingProfile(profile: SportProfile): boolean {
  return profile.enabledProKinds.has("HOOK");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtScore(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

// ---------------------------------------------------------------------------
// Breakdown items builder
// ---------------------------------------------------------------------------

type BreakdownItem = { key: string; label: string; value: number };

function buildBreakdownItems(card: PlayerContributionCard, profile: SportProfile): BreakdownItem[] {
  const items: BreakdownItem[] = [];

  if (card.breakdown.scoring !== 0) {
    items.push({ key: "scoring",    label: "Score impact",                           value: card.breakdown.scoring });
  }
  if (card.breakdown.restarts !== 0) {
    items.push({ key: "restarts",   label: profile.reportVocabulary.restart,         value: card.breakdown.restarts });
  }
  if (card.breakdown.possession !== 0) {
    items.push({ key: "possession", label: "Possession impact",                      value: card.breakdown.possession });
  }
  if (isHurlingProfile(profile) && card.breakdown.hurlingSpecific !== 0) {
    items.push({ key: "pressure",   label: "Pressure impact",                        value: card.breakdown.hurlingSpecific });
  }
  if (card.breakdown.delivery !== 0) {
    items.push({ key: "delivery",   label: "Delivery",                               value: card.breakdown.delivery });
  }
  if (card.breakdown.effort !== 0) {
    items.push({ key: "effort",     label: "Effort",                                 value: card.breakdown.effort });
  }

  return items;
}

// ---------------------------------------------------------------------------
// PlayerCard sub-component
// ---------------------------------------------------------------------------

function PlayerCard({ card, profile }: { card: PlayerContributionCard; profile: SportProfile }) {
  const scoreColor = contributionRatingColor(card.totalScore);
  const formattedScore = fmtScore(card.totalScore);
  const breakdownItems = buildBreakdownItems(card, profile);
  const repeatedMistakes = card.eventCounts.REPEATED_MISTAKE ?? 0;

  const displayName = card.playerName ?? `Player ${card.playerNumber ?? "?"}`;
  const displayNumber = card.playerNumber !== null ? `#${card.playerNumber}` : "#—";

  return (
    <div className="player-card">

      {/* ── Number · Name · Score badge ─────────────────────────────── */}
      <div className="player-card__header">
        <span className="player-card__number">{displayNumber}</span>

        <div className="player-card__identity">
          <span className="player-card__name">{displayName}</span>
          <span className="player-card__role-label">What they gave us</span>
        </div>

        <span
          className="player-card__score-badge"
          style={{ background: scoreColor }}
          aria-label={`Impact score ${formattedScore}`}
        >
          {formattedScore}
        </span>
      </div>

      {/* ── Helped us / Hurt us ─────────────────────────────────────── */}
      <div className="player-card__help-row">
        <span className="player-card__helped">Helped us: {card.positiveCount}</span>
        <span className="player-card__help-dot" aria-hidden="true">·</span>
        <span className="player-card__hurt">Hurt us: {card.negativeCount}</span>
      </div>

      {/* ── Category breakdown chips ─────────────────────────────────── */}
      {breakdownItems.length > 0 && (
        <div className="player-card__breakdown">
          {breakdownItems.map((item) => (
            <span
              key={item.key}
              className={[
                "player-card__chip",
                item.value > 0 ? "player-card__chip--pos"
                  : item.value < 0 ? "player-card__chip--neg"
                  : "player-card__chip--zero",
              ].join(" ")}
            >
              {item.label} {fmtScore(item.value)}
            </span>
          ))}
        </div>
      )}

      {/* ── Possession/score involvement meta ───────────────────────── */}
      {(card.scoringInvolvements > 0 || card.possessionInvolvements > 0) && (
        <div className="player-card__meta">
          {card.scoringInvolvements > 0 && (
            <span className="player-card__meta-chip player-card__meta-chip--score">
              Score chains: {card.scoringInvolvements}
            </span>
          )}
          {card.possessionInvolvements > 0 && (
            <span className="player-card__meta-chip">
              Possessions: {card.possessionInvolvements}
            </span>
          )}
        </div>
      )}

      {/* ── Repeated mistake flag ────────────────────────────────────── */}
      {repeatedMistakes > 0 && (
        <p className="player-card__mistake-warning" role="alert">
          ⚠ Repeated mistake ×{repeatedMistakes}
        </p>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContributionReviewPanelProps = {
  session: ProSessionState;
  profile: SportProfile;
  contributionData: ContributionDataset;
  onBack: () => void;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContributionReviewPanel({
  session,
  profile,
  contributionData,
  onBack,
}: ContributionReviewPanelProps) {
  const { players, totalAttributedEvents, unattributedEvents } = contributionData;

  return (
    <div className="contribution-review">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="contribution-review__header">
        <button
          type="button"
          className="contribution-review__back-btn"
          onClick={onBack}
        >
          ← Live
        </button>

        <div className="contribution-review__header-center">
          <span className="contribution-review__title">Player Impact</span>
          <span className="contribution-review__sport-chip">{profile.displayName}</span>
        </div>

        <div className="contribution-review__header-spacer" aria-hidden="true" />
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className="contribution-review__body">

        {/* Match context row */}
        <div className="contribution-review__context">
          <span className="contribution-review__match-label">
            {session.homeTeamName} vs {session.awayTeamName}
          </span>
          <div className="contribution-review__meta-chips">
            <span className="contribution-review__meta-chip">{session.events.length} events</span>
            <span className="contribution-review__meta-chip">{totalAttributedEvents} tagged</span>
          </div>
        </div>

        {/* Unattributed events notice */}
        {unattributedEvents > 0 && (
          <div className="contribution-review__unattributed">
            {unattributedEvents} event{unattributedEvents !== 1 ? "s" : ""} without a player —
            tag players when logging for richer data
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {players.length === 0 && (
          <div className="contribution-review__empty">
            <span className="contribution-review__empty-icon" aria-hidden="true">👤</span>
            <p className="contribution-review__empty-title">No player data yet</p>
            <p className="contribution-review__empty-hint">
              Select players when logging events to see their contribution summary here.
            </p>
          </div>
        )}

        {/* ── Player cards ────────────────────────────────────────── */}
        {players.length > 0 && (
          <div className="contribution-review__section">
            <p className="contribution-review__section-label">
              {players.length} {players.length === 1 ? "player" : "players"} · ranked by impact
            </p>
            <div className="contribution-review__player-list">
              {players.map((card) => (
                <PlayerCard key={card.playerId} card={card} profile={profile} />
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="contribution-review__footer-note">
          Impact scores derived from logged events
          {players.length > 0 && " · Tag players on each event for richer data"}
        </p>

      </div>
    </div>
  );
}
