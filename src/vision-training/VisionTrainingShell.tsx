import VisionTrainingHome from "./VisionTrainingHome";
import PerformanceTrackerEntry from "./PerformanceTrackerEntry";

export default function VisionTrainingShell() {
  const path =
    typeof window === "undefined"
      ? ""
      : window.location.pathname.replace(/\/+$/, "");

  if (path === "/vision-training/performance") {
    return <PerformanceTrackerEntry />;
  }

  return <VisionTrainingHome />;
}
