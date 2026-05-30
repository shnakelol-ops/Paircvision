import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { OverlayPortalProvider } from "./overlay/OverlayPortalContext";
import PitchFlowCoachShell from "./pages/PitchFlowCoachShell";
import TacticalPadLiteClean from "./pages/TacticalPadLiteClean";
import PlayerPerformanceTracker from "./pages/PlayerPerformanceTracker";
import MovementBoardCanvasShellPage from "./pages/MovementBoardCanvasShellPage";
import RapidCaptureLitePage from "./rapid-capture/RapidCaptureLitePage";
import { ProTaggerPitchView } from "./pro-tagger/ProTaggerPitchView";

const boardShell = () => <PitchFlowCoachShell initialTab="home" />;
const VISION_BOARD_PATH = "/vision-board";
const QUICK_BOARD_PATH = "/quickboard";
const FLOW_STATS_PATH = "/flowstats";
const NOTES_PATH = "/notes";
const PLAYER_PERFORMANCE_TRACKER_PATH = "/player-performance-tracker";
const MOVEMENT_BOARD_LABS_PATH = "/movement-board-labs";
const RAPID_CAPTURE_PATH = "/rapid-capture";
const PRO_TAGGER_PATH = "/pro-tagger";

function ProTaggerRoute() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#06150F",
        display: "grid",
        placeItems: "center",
        padding: "16px",
      }}
    >
      <div style={{ width: "min(420px, 100%)" }}>
        <ProTaggerPitchView
          sport="gaelic"
          attackDirection="right"
          half={1}
          feedbackDot={null}
          interactive={false}
          onTap={() => {}}
        />
      </div>
    </div>
  );
}

function redirectToBoard() {
  if (window.location.pathname !== "/board") {
    window.history.replaceState(null, "", "/board");
  }
  return boardShell;
}

function redirectToVisionBoard() {
  if (window.location.pathname !== VISION_BOARD_PATH) {
    window.history.replaceState(null, "", VISION_BOARD_PATH);
  }
  return TacticalPadLiteClean;
}

function redirectToFlowStats() {
  if (window.location.pathname !== FLOW_STATS_PATH) {
    window.history.replaceState(null, "", FLOW_STATS_PATH);
  }
  return () => <TacticalPadLiteClean initialMode="stats" />;
}

function redirectToNotes() {
  if (window.location.pathname !== NOTES_PATH) {
    window.history.replaceState(null, "", NOTES_PATH);
  }
  return () => <PitchFlowCoachShell initialTab="notes" />;
}

function pickRootComponent() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/") {
    return redirectToBoard();
  }
  if (normalizedPath === VISION_BOARD_PATH) {
    return TacticalPadLiteClean;
  }
  if (normalizedPath === QUICK_BOARD_PATH) {
    return redirectToVisionBoard();
  }
  if (normalizedPath === "/simulator") {
    return redirectToVisionBoard();
  }
  if (normalizedPath === "/flowlab") {
    return redirectToVisionBoard();
  }
  if (normalizedPath === "/tacticalpad-lite") {
    return redirectToVisionBoard();
  }
  if (normalizedPath === "/tacticalpad-lite-clean") {
    return redirectToVisionBoard();
  }
  if (normalizedPath === FLOW_STATS_PATH) {
    return () => <TacticalPadLiteClean initialMode="stats" />;
  }
  if (normalizedPath === "/stats") {
    return redirectToFlowStats();
  }
  if (normalizedPath === "/whiteboard") {
    return redirectToVisionBoard();
  }
  if (normalizedPath === "/board") {
    return boardShell;
  }
  if (normalizedPath === NOTES_PATH) {
    return () => <PitchFlowCoachShell initialTab="notes" />;
  }
  if (normalizedPath === "/library") {
    return redirectToNotes();
  }
  if (normalizedPath === "/sessions") {
    return () => <PitchFlowCoachShell initialTab="sessions" />;
  }
  if (normalizedPath === "/plans") {
    return () => <PitchFlowCoachShell initialTab="plans" />;
  }
  if (normalizedPath === PLAYER_PERFORMANCE_TRACKER_PATH) {
    return PlayerPerformanceTracker;
  }
  if (normalizedPath === MOVEMENT_BOARD_LABS_PATH) {
    return MovementBoardCanvasShellPage;
  }
  if (normalizedPath === RAPID_CAPTURE_PATH) {
    return RapidCaptureLitePage;
  }
  if (normalizedPath === PRO_TAGGER_PATH) {
    return ProTaggerRoute;
  }
  return redirectToBoard();
}

const RootComponent = pickRootComponent();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayPortalProvider>
      <RootComponent />
    </OverlayPortalProvider>
  </StrictMode>,
);

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
