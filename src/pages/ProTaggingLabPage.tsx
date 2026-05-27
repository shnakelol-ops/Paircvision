/**
 * ProTaggingLabPage.tsx
 *
 * Route: /vision-labs/pro-tagging
 * Branch: experiment/pro-tagging-system-vision-labs
 *
 * This is an EXPERIMENT surface — not a production feature.
 * Do NOT import this from StatsModeSurface.tsx or App.tsx.
 * Only registered in main.tsx via the pickRootComponent path switch.
 *
 * Phase 1: Experiment shell — sport selector + placeholder surface.
 * Phase 3+: Full capture loop added here.
 */

import { useState } from "react";
import ProTaggingShell from "../features/pro-tagging/components/ProTaggingShell";
import type { SportProfileId } from "../features/pro-tagging/model/sport-profile-types";
import "../features/pro-tagging/styles/pro-tagging.css";

export default function ProTaggingLabPage() {
  const [selectedProfile, setSelectedProfile] = useState<SportProfileId | null>(null);

  if (selectedProfile !== null) {
    return (
      <ProTaggingShell
        profileId={selectedProfile}
        onExit={() => setSelectedProfile(null)}
      />
    );
  }

  return (
    <div className="pro-lab-setup">
      <div className="pro-lab-setup__inner">
        <div className="pro-lab-setup__badge">VISION LABS · EXPERIMENT</div>
        <h1 className="pro-lab-setup__title">
          PáircVision
          <br />
          <span className="pro-lab-setup__title-pro">Pro Tagging</span>
        </h1>
        <p className="pro-lab-setup__subtitle">
          Fast universal GAA tagging engine.
          <br />
          Built for hurling speed. Works for all codes.
        </p>

        <div className="pro-lab-setup__divider" />

        <p className="pro-lab-setup__choose-label">Choose sport</p>

        <div className="pro-lab-setup__sport-grid">
          <SportButton
            label="Football"
            emoji="🏐"
            profileId="FOOTBALL"
            onSelect={setSelectedProfile}
          />
          <SportButton
            label="Ladies Football"
            emoji="🏐"
            profileId="LADIES_FOOTBALL"
            onSelect={setSelectedProfile}
          />
          <SportButton
            label="Hurling"
            emoji="🏑"
            profileId="HURLING"
            onSelect={setSelectedProfile}
          />
          <SportButton
            label="Camogie"
            emoji="🏑"
            profileId="CAMOGIE"
            onSelect={setSelectedProfile}
          />
        </div>

        <div className="pro-lab-setup__footer">
          <p className="pro-lab-setup__footer-note">
            Experiment branch · Not for production use
          </p>
        </div>
      </div>
    </div>
  );
}

type SportButtonProps = {
  label: string;
  emoji: string;
  profileId: SportProfileId;
  onSelect: (id: SportProfileId) => void;
};

function SportButton({ label, emoji, profileId, onSelect }: SportButtonProps) {
  return (
    <button
      type="button"
      className="pro-lab-setup__sport-btn"
      onClick={() => onSelect(profileId)}
    >
      <span className="pro-lab-setup__sport-emoji">{emoji}</span>
      <span className="pro-lab-setup__sport-label">{label}</span>
    </button>
  );
}
