/**
 * PitchTapSurface.tsx
 *
 * PáircVision Pro Tagging — Pitch Tap Surface
 *
 * After player selection, user taps a pitch location to record event coordinates.
 *
 * V1 approach: React div + SVG pitch outline, no Pixi dependency.
 * Phase 7: Replace with Pixi integration.
 *
 * Design:
 *   - Simple SVG GAA pitch outline (no Pixi, no canvas)
 *   - pointerdown captures normalised (nx, ny) immediately
 *   - Visual feedback: dot appears at tap point, fades in 800ms
 *   - No confirmation screen — event committed immediately on tap
 *   - "Skip location" button below pitch
 *
 * Coordinate system:
 *   nx = 0 (left goal) → 1 (right goal)  [attacking direction depends on setup]
 *   ny = 0 (top touchline) → 1 (bottom touchline)
 *
 * Phase 3 — Event → Player → Pitch Loop
 */

import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PitchCoords = {
  nx: number;
  ny: number;
};

type PitchTapSurfaceProps = {
  onPitchTapped: (coords: PitchCoords) => void;
  onSkip: () => void;
  pitchSport: "gaelic" | "hurling";
  attackingDirection: "LEFT" | "RIGHT";
  pendingEventLabel: string;
};

// ---------------------------------------------------------------------------
// GAA Pitch SVG — Simplified outline
// Viewbox 0 0 100 160 (portrait)
// ---------------------------------------------------------------------------

function GaaPitchSvg({ sport }: { sport: "gaelic" | "hurling" }) {
  const _sport = sport; // reserved for future pitch shape differences
  void _sport;
  return (
    <svg
      viewBox="0 0 100 160"
      xmlns="http://www.w3.org/2000/svg"
      className="pitch-tap-surface__svg"
      aria-hidden="true"
    >
      {/* Pitch background */}
      <rect x="0" y="0" width="100" height="160" fill="#1a2d1a" />

      {/* Main pitch boundary */}
      <rect x="4" y="4" width="92" height="152" fill="none" stroke="#3a5a3a" strokeWidth="1.5" />

      {/* Midline */}
      <line x1="4" y1="80" x2="96" y2="80" stroke="#3a5a3a" strokeWidth="1" />

      {/* Centre circle */}
      <circle cx="50" cy="80" r="10" fill="none" stroke="#3a5a3a" strokeWidth="1" />
      <circle cx="50" cy="80" r="1.5" fill="#3a5a3a" />

      {/* Top 45/65 line (13m) */}
      <line x1="4" y1="27" x2="96" y2="27" stroke="#2d4a2d" strokeWidth="0.8" strokeDasharray="2 3" />
      {/* Top 20m line */}
      <line x1="4" y1="50" x2="96" y2="50" stroke="#3a5a3a" strokeWidth="0.8" />

      {/* Bottom 20m line */}
      <line x1="4" y1="110" x2="96" y2="110" stroke="#3a5a3a" strokeWidth="0.8" />
      {/* Bottom 45/65 line */}
      <line x1="4" y1="133" x2="96" y2="133" stroke="#2d4a2d" strokeWidth="0.8" strokeDasharray="2 3" />

      {/* Top small square (14m) */}
      <rect x="28" y="4" width="44" height="16" fill="none" stroke="#3a5a3a" strokeWidth="0.8" />
      {/* Top large square (21m) */}
      <rect x="18" y="4" width="64" height="26" fill="none" stroke="#2d4a2d" strokeWidth="0.8" />

      {/* Bottom small square */}
      <rect x="28" y="140" width="44" height="16" fill="none" stroke="#3a5a3a" strokeWidth="0.8" />
      {/* Bottom large square */}
      <rect x="18" y="130" width="64" height="26" fill="none" stroke="#2d4a2d" strokeWidth="0.8" />

      {/* Top goal posts (symbolic) */}
      <rect x="39" y="0" width="22" height="4" fill="#3a5a3a" />

      {/* Bottom goal posts (symbolic) */}
      <rect x="39" y="156" width="22" height="4" fill="#3a5a3a" />

      {/* Attacking direction arrow hint — top */}
      <text x="50" y="14" textAnchor="middle" fill="#3a5a3a" fontSize="6" fontWeight="700">ATK</text>
      {/* Defending direction — bottom */}
      <text x="50" y="153" textAnchor="middle" fill="#3a5a3a" fontSize="5">DEF</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type TapIndicator = {
  nx: number;
  ny: number;
  key: number;
};

export default function PitchTapSurface({
  onPitchTapped,
  onSkip,
  pitchSport,
  attackingDirection: _attackingDirection,
  pendingEventLabel,
}: PitchTapSurfaceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<TapIndicator | null>(null);
  const indicatorKeyRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const wrap = wrapRef.current;
      if (!wrap) return;

      const rect = wrap.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      // Show tap indicator
      indicatorKeyRef.current++;
      setIndicator({ nx, ny, key: indicatorKeyRef.current });

      // Clear indicator after animation
      const key = indicatorKeyRef.current;
      setTimeout(() => {
        setIndicator((prev) => (prev?.key === key ? null : prev));
      }, 900);

      // Commit event immediately — no confirmation
      onPitchTapped({ nx, ny });
    },
    [onPitchTapped],
  );

  return (
    <div className="pitch-tap-surface">
      <p className="pitch-tap-surface__label">
        {pendingEventLabel} — Tap location
      </p>

      <div
        ref={wrapRef}
        className="pitch-tap-surface__canvas-wrap"
        onPointerDown={handlePointerDown}
        role="button"
        aria-label="Tap pitch location"
        tabIndex={0}
      >
        <GaaPitchSvg sport={pitchSport} />

        {indicator && (
          <div
            key={indicator.key}
            className="pitch-tap-surface__indicator"
            style={{
              left: `${indicator.nx * 100}%`,
              top: `${indicator.ny * 100}%`,
            }}
          />
        )}
      </div>

      <button
        type="button"
        className="pitch-tap-surface__skip-btn"
        onClick={onSkip}
      >
        Skip location
      </button>
    </div>
  );
}
