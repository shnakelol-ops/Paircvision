import TacticalPadLiteClean from "../../pages/TacticalPadLiteClean";
import TacticalPlayPlaceholder from "./TacticalPlayPlaceholder";
import VisionTacticsHub from "./VisionTacticsHub";
import type { VisionTacticsView } from "./visionTacticsTypes";

function resolveView(): VisionTacticsView {
  if (typeof window === "undefined") return "hub";
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/vision-tactics/slate") return "slate";
  if (path === "/vision-tactics/play") return "play";
  return "hub";
}

export default function VisionTacticsShell() {
  const view = resolveView();
  if (view === "slate") return <TacticalPadLiteClean />;
  if (view === "play") return <TacticalPlayPlaceholder />;
  return <VisionTacticsHub />;
}
