import { useState } from "react";
import type { ProTaggerSession } from "./pro-tagger-session";
import { ProTaggerSetupScreen } from "./ProTaggerSetupScreen";
import { ProTaggerLiveScreen } from "./ProTaggerLiveScreen";

export default function ProTaggerPage() {
  const [session, setSession] = useState<ProTaggerSession | null>(null);

  if (!session) {
    return <ProTaggerSetupScreen onStart={setSession} />;
  }

  return (
    <ProTaggerLiveScreen
      session={session}
      onEnd={() => setSession(null)}
    />
  );
}
