import AttendanceScreen from "./AttendanceScreen";
import NewSessionScreen from "./NewSessionScreen";
import PerformanceTrackerEntry from "./PerformanceTrackerEntry";
import ReadOnlyReviewScreen from "./ReadOnlyReviewScreen";
import SessionReviewScreen from "./SessionReviewScreen";
import TrainingHistoryScreen from "./TrainingHistoryScreen";
import VisionTrainingHome from "./VisionTrainingHome";

type Route =
  | { view: "home" }
  | { view: "performance" }
  | { view: "new-session" }
  | { view: "attendance"; sessionId: string }
  | { view: "review"; sessionId: string }
  | { view: "history" }
  | { view: "summary"; sessionId: string };

function parsePath(): Route {
  const path =
    typeof window === "undefined"
      ? ""
      : window.location.pathname.replace(/\/+$/, "");

  if (path === "/vision-training/performance") return { view: "performance" };
  if (path === "/vision-training/session/new") return { view: "new-session" };
  if (path === "/vision-training/history") return { view: "history" };

  const attendanceMatch = path.match(/^\/vision-training\/session\/([^/]+)\/attendance$/);
  if (attendanceMatch) return { view: "attendance", sessionId: attendanceMatch[1] };

  const reviewMatch = path.match(/^\/vision-training\/session\/([^/]+)\/review$/);
  if (reviewMatch) return { view: "review", sessionId: reviewMatch[1] };

  const summaryMatch = path.match(/^\/vision-training\/session\/([^/]+)\/summary$/);
  if (summaryMatch) return { view: "summary", sessionId: summaryMatch[1] };

  return { view: "home" };
}

export default function VisionTrainingShell() {
  const route = parsePath();

  if (route.view === "performance") return <PerformanceTrackerEntry />;
  if (route.view === "new-session") return <NewSessionScreen />;
  if (route.view === "history") return <TrainingHistoryScreen />;
  if (route.view === "attendance") return <AttendanceScreen sessionId={route.sessionId} />;
  if (route.view === "review") return <SessionReviewScreen sessionId={route.sessionId} />;
  if (route.view === "summary") return <ReadOnlyReviewScreen sessionId={route.sessionId} />;
  return <VisionTrainingHome />;
}
