/**
 * ProSessionSetup.tsx
 *
 * PáircVision Pro Tagging — Session Setup Screen
 *
 * Shown between sport selection and live tagging.
 * Lets the analyst configure:
 *   - Home / away team names
 *   - Venue (optional)
 *   - Attacking direction (← Left | Right →)
 *   - Starting half (1H / 2H)
 *
 * Also shows the selected profile's key features as visual chips so
 * the analyst can confirm they chose the right sport before starting.
 *
 * Flow:
 *   1. User arrives here after selecting a sport profile
 *   2. Sees profile card (sport name, restart label, feature chips)
 *   3. Edits team names / direction / half
 *   4. Presses "Start session" → onStart(updatedSession)
 *   5. OR presses "Resume" if an existing session exists → onResume(existing)
 *   6. OR presses "← Change sport" → onBack()
 *
 * Phase 4 — Sport Profile Switching
 */

import { useState } from "react";
import type { SportProfile } from "../model/sport-profile-types";
import type { ProSessionState } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Feature chip definitions per profile
// ---------------------------------------------------------------------------

type FeatureChip = {
  label: string;
  tone: "score" | "restart" | "hurling" | "free" | "possession" | "football";
};

function getFeatureChips(profile: SportProfile): FeatureChip[] {
  const chips: FeatureChip[] = [];

  // Restart label is the most important differentiator
  chips.push({
    label: profile.restartLabel,
    tone: "restart",
  });

  // Football-specific
  if (profile.enabledProKinds.has("TWO_POINTER")) {
    chips.push({ label: "2PT", tone: "score" });
  }
  if (profile.enabledProKinds.has("FORTY_FIVE_TWO_POINT")) {
    chips.push({ label: "45+2", tone: "score" });
  }
  if (profile.enabledProKinds.has("MARK")) {
    chips.push({ label: "MARK", tone: "football" });
  }

  // Hurling/Camogie-specific
  if (profile.enabledProKinds.has("HOOK")) {
    chips.push({ label: "HOOK", tone: "hurling" });
    chips.push({ label: "BLOCK", tone: "hurling" });
  }
  if (profile.enabledProKinds.has("BREAK_WON")) {
    chips.push({ label: "BREAK", tone: "hurling" });
  }
  if (profile.enabledProKinds.has("SIXTY_FIVE")) {
    chips.push({ label: "65", tone: "free" });
  }
  if (profile.enabledProKinds.has("SIDELINE")) {
    chips.push({ label: "SIDELINE", tone: "hurling" });
  }

  return chips;
}

// ---------------------------------------------------------------------------
// Chip tone → CSS class
// ---------------------------------------------------------------------------

const CHIP_TONE_CLASS: Record<FeatureChip["tone"], string> = {
  score:      "setup-chip--score",
  restart:    "setup-chip--restart",
  hurling:    "setup-chip--hurling",
  free:       "setup-chip--free",
  possession: "setup-chip--possession",
  football:   "setup-chip--football",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProSessionSetupProps = {
  profile: SportProfile;
  /** Current session — may have events (resume case) or be a blank template */
  currentSession: ProSessionState;
  /** True if there is an existing session with events for this profile */
  hasExistingSession: boolean;
  onStart: (draft: Pick<ProSessionState, "homeTeamName" | "awayTeamName" | "venueName" | "attackingDirection" | "half">) => void;
  onResume: () => void;
  onBack: () => void;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProSessionSetup({
  profile,
  currentSession,
  hasExistingSession,
  onStart,
  onResume,
  onBack,
}: ProSessionSetupProps) {
  const [homeTeam, setHomeTeam] = useState(currentSession.homeTeamName || "Home");
  const [awayTeam, setAwayTeam] = useState(currentSession.awayTeamName || "Away");
  const [venue, setVenue] = useState(currentSession.venueName || "");
  const [direction, setDirection] = useState<"LEFT" | "RIGHT">(currentSession.attackingDirection);
  const [half, setHalf] = useState<1 | 2>(currentSession.half);

  const featureChips = getFeatureChips(profile);

  const handleStart = () => {
    onStart({
      homeTeamName: homeTeam.trim() || "Home",
      awayTeamName: awayTeam.trim() || "Away",
      venueName: venue.trim(),
      attackingDirection: direction,
      half,
    });
  };

  return (
    <div className="session-setup">
      <div className="session-setup__inner">

        {/* ── Back / header ─────────────────────────────────────────────── */}
        <div className="session-setup__toprow">
          <button
            type="button"
            className="session-setup__back-btn"
            onClick={onBack}
          >
            ← Change sport
          </button>
          <span className="session-setup__exp-badge">EXPERIMENT</span>
        </div>

        {/* ── Profile Card ──────────────────────────────────────────────── */}
        <div className="session-setup__profile-card">
          <div className="session-setup__profile-name">{profile.displayName}</div>
          <div className="session-setup__profile-sub">
            {profile.restartLabel} · Pro Tagging
          </div>
          <div className="session-setup__chips">
            {featureChips.map((chip) => (
              <span
                key={chip.label}
                className={["setup-chip", CHIP_TONE_CLASS[chip.tone]].join(" ")}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Team Setup ────────────────────────────────────────────────── */}
        <div className="session-setup__form">
          <div className="session-setup__field-group">
            <label className="session-setup__label" htmlFor="home-team">
              Home team
            </label>
            <input
              id="home-team"
              type="text"
              className="session-setup__input"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="Home"
              maxLength={32}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          <div className="session-setup__field-group">
            <label className="session-setup__label" htmlFor="away-team">
              Away team
            </label>
            <input
              id="away-team"
              type="text"
              className="session-setup__input"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="Away"
              maxLength={32}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          <div className="session-setup__field-group">
            <label className="session-setup__label" htmlFor="venue">
              Venue <span className="session-setup__label-opt">(optional)</span>
            </label>
            <input
              id="venue"
              type="text"
              className="session-setup__input"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue"
              maxLength={48}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          {/* ── Direction Toggle ─────────────────────────────────────── */}
          <div className="session-setup__field-group">
            <span className="session-setup__label">Attacking direction (Home)</span>
            <div className="session-setup__direction-row">
              <button
                type="button"
                className={[
                  "session-setup__direction-btn",
                  direction === "LEFT" ? "session-setup__direction-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setDirection("LEFT")}
                aria-pressed={direction === "LEFT"}
              >
                ← Left
              </button>
              <div className="session-setup__direction-pitch">
                <svg viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="1" y="1" width="58" height="18" fill="#1a2d1a" stroke="#3a5a3a" strokeWidth="1" rx="2" />
                  <line x1="30" y1="1" x2="30" y2="19" stroke="#3a5a3a" strokeWidth="0.8" />
                  {direction === "LEFT" ? (
                    <text x="8" y="13" fill="#25b055" fontSize="7" fontWeight="700">→ ATK</text>
                  ) : (
                    <text x="32" y="13" fill="#25b055" fontSize="7" fontWeight="700">ATK →</text>
                  )}
                </svg>
              </div>
              <button
                type="button"
                className={[
                  "session-setup__direction-btn",
                  direction === "RIGHT" ? "session-setup__direction-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setDirection("RIGHT")}
                aria-pressed={direction === "RIGHT"}
              >
                Right →
              </button>
            </div>
          </div>

          {/* ── Half Selector ────────────────────────────────────────── */}
          <div className="session-setup__field-group">
            <span className="session-setup__label">Start at</span>
            <div className="session-setup__half-row">
              <button
                type="button"
                className={[
                  "session-setup__half-btn",
                  half === 1 ? "session-setup__half-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setHalf(1)}
                aria-pressed={half === 1}
              >
                1st Half
              </button>
              <button
                type="button"
                className={[
                  "session-setup__half-btn",
                  half === 2 ? "session-setup__half-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setHalf(2)}
                aria-pressed={half === 2}
              >
                2nd Half
              </button>
            </div>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="session-setup__actions">
          <button
            type="button"
            className="session-setup__start-btn"
            onClick={handleStart}
          >
            Start new session
          </button>

          {hasExistingSession && (
            <button
              type="button"
              className="session-setup__resume-btn"
              onClick={onResume}
            >
              Resume session ({currentSession.events.length} events)
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
