/**
 * ProPlayerPicker.tsx
 *
 * PáircVision Pro Tagging — Player Picker
 *
 * After an event is selected, this shows a fast grid of numbered player buttons.
 *
 * Adapted from:
 *   features/player-performance-tracker/components/PlayerPicker.tsx
 *   (not imported — rebuilt cleanly for Pro capture loop)
 *
 * Key differences from training tracker:
 *   - "SKIP" button prominent at top — event already logged without player
 *   - Shows pending event label above the grid
 *   - Optional live contribution rating chip per player
 *   - After 1 tap: immediately calls onSelectPlayer → Pitch Tap
 *
 * Phase 3 — Event → Player → Pitch Loop
 */

import type { ProPlayer } from "../model/pro-event-model";
import { contributionRatingColor } from "../engine/contribution-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProPlayerPickerProps = {
  players: readonly ProPlayer[];
  contributions: ReadonlyMap<string, number>; // playerId → session rating score
  onSelectPlayer: (player: ProPlayer) => void;
  onSkip: () => void;
  activePlayerId?: string | null;
  pendingEventLabel: string;
};

// ---------------------------------------------------------------------------
// Player Button
// ---------------------------------------------------------------------------

type PlayerBtnProps = {
  player: ProPlayer;
  score: number | undefined;
  isActive: boolean;
  onTap: () => void;
};

function PlayerBtn({ player, score, isActive, onTap }: PlayerBtnProps) {
  return (
    <button
      type="button"
      className={[
        "player-picker__player-btn",
        isActive ? "player-picker__player-btn--active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onTap}
      aria-label={`Player ${player.number} ${player.name}`}
    >
      <span className="player-picker__player-number">{player.number}</span>
      <span className="player-picker__player-name">{player.name}</span>
      {score !== undefined && (
        <span
          className="player-picker__rating-chip"
          style={{ background: contributionRatingColor(score) }}
        >
          {score > 0 ? `+${score}` : String(score)}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProPlayerPicker({
  players,
  contributions,
  onSelectPlayer,
  onSkip,
  activePlayerId,
  pendingEventLabel,
}: ProPlayerPickerProps) {
  const starters = players.filter((p) => p.role === "STARTER" && p.isActive);
  const subs = players.filter((p) => p.role === "SUB" && p.isActive);

  return (
    <div className="player-picker">
      {/* Header */}
      <div className="player-picker__header">
        <span className="player-picker__pending-label">
          {pendingEventLabel} — Who?
        </span>
        <button
          type="button"
          className="player-picker__skip-btn"
          onClick={onSkip}
        >
          Skip →
        </button>
      </div>

      {/* Starters grid */}
      <div className="player-picker__grid">
        {starters.map((player) => (
          <PlayerBtn
            key={player.id}
            player={player}
            score={contributions.get(player.id)}
            isActive={player.id === activePlayerId}
            onTap={() => onSelectPlayer(player)}
          />
        ))}
      </div>

      {/* Subs */}
      {subs.length > 0 && (
        <>
          <div className="player-picker__divider" />
          <p className="player-picker__subs-label">Subs</p>
          <div className="player-picker__grid">
            {subs.map((player) => (
              <PlayerBtn
                key={player.id}
                player={player}
                score={contributions.get(player.id)}
                isActive={player.id === activePlayerId}
                onTap={() => onSelectPlayer(player)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
