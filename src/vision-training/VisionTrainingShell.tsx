import AttendanceScreen from "./AttendanceScreen";
import NewSessionScreen from "./NewSessionScreen";
import PerformanceTrackerEntry from "./PerformanceTrackerEntry";
import VisionTrainingHome from "./VisionTrainingHome";

type Route =
  | { view: "home" }
  | { view: "performance" }
  | { view: "new-session" }
  | { view: "attendance"; sessionId: string };

function parsePath(): Route {
  const path =
    typeof window === "undefined"
      ? ""
      : window.location.pathname.replace(/\/+$/, "");

  if (path === "/vision-training/performance") return { view: "performance" };
  if (path === "/vision-training/session/new") return { view: "new-session" };

  const attendanceMatch = path.match(/^\/vision-training\/session\/([^/]+)\/attendance$/);
  if (attendanceMatch) return { view: "attendance", sessionId: attendanceMatch[1] };

  return { view: "home" };
}

export default function VisionTrainingShell() {
  const route = parsePath();

  if (route.view === "performance") return <PerformanceTrackerEntry />;
  if (route.view === "new-session") return <NewSessionScreen />;
  if (route.view === "attendance") return <AttendanceScreen sessionId={route.sessionId} />;
  return <VisionTrainingHome />;
}
