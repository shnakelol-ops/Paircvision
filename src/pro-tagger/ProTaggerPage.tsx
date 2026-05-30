import { useState } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import { ProTaggerSetupScreen } from "./ProTaggerSetupScreen";
import { ProTaggerSquadScreen } from "./ProTaggerSquadScreen";
import { ProTaggerLiveScreen } from "./ProTaggerLiveScreen";

type AppPhase = "setup" | "squads" | "live";

export default function ProTaggerPage() {
  const [phase, setPhase]               = useState<AppPhase>("setup");
  const [draftSession, setDraftSession] = useState<ProTaggerSession | null>(null);

  if (phase === "setup") {
    return (
      <ProTaggerSetupScreen
        onContinue={(draft) => {
          setDraftSession(draft);
          setPhase("squads");
        }}
      />
    );
  }

  if (phase === "squads" && draftSession) {
    return (
      <ProTaggerSquadScreen
        session={draftSession}
        onBack={() => setPhase("setup")}
        onStart={(finalSession) => {
          setDraftSession(finalSession);
          setPhase("live");
        }}
      />
    );
  }

  if (phase === "live" && draftSession) {
    return (
      <ProTaggerLiveScreen
        session={draftSession}
        onEnd={() => {
          setDraftSession(null);
          setPhase("setup");
        }}
      />
    );
  }

  return null;
}
