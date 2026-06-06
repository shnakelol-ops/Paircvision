import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import type { TrainingSession } from "./types";
import { loadSessions } from "./trainingStorage";

function navigate(path: string) {
  window.location.assign(path);
}

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function TrainingHistoryScreen() {
  const [sessions] = useState<TrainingSession[]>(() =>
    loadSessions()
      .filter((s) => s.status === "completed")
      .sort((a, b) => {
        const ta = a.completedAt ?? a.createdAt;
        const tb = b.completedAt ?? b.createdAt;
        return tb.localeCompare(ta);
      })
  );

  return (
    <div className="vt-page-shell">
      <VisionStadiumBackground variant="training" />
      <div className="vt-shell">
        <div className="vt-container">

          <div className="vt-header">
            <button
              type="button"
              className="vt-back-btn"
              aria-label="Back to Vision Training"
              onClick={() => navigate("/vision-training")}
            >
              ←
            </button>
            <div>
              <h1 className="vt-heading">History</h1>
              <p className="vt-subheading">Completed training sessions</p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="vt-panel">
              <p className="vt-panel-sub" style={{ textAlign: "center", padding: "6px 0" }}>
                No completed sessions yet. Finish a session to see it here.
              </p>
            </div>
          ) : (
            <div className="vt-history-list">
              {sessions.map((session) => {
                const counts = { present: 0, late: 0, injured: 0, absent: 0 };
                for (const rec of session.attendance) {
                  counts[rec.status] = (counts[rec.status] ?? 0) + 1;
                }
                const total = session.attendance.length;
                const trained = counts.present + counts.late;
                const pct = total > 0 ? Math.round((trained / total) * 100) : 0;

                return (
                  <div
                    key={session.id}
                    className="vt-history-card"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      navigate(`/vision-training/session/${session.id}/summary`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        navigate(`/vision-training/session/${session.id}/summary`);
                    }}
                  >
                    <div className="vt-history-card-top">
                      <span className="vt-history-card-title">{session.title}</span>
                      <span className="vt-completed-badge">Completed</span>
                    </div>
                    <p className="vt-history-card-meta">
                      {formatDate(session.date)}
                      {session.focus ? ` · ${session.focus}` : ""}
                    </p>
                    <div className="vt-history-card-stats">
                      <div className="vt-history-stat">
                        <span className="vt-history-stat-value">{trained}</span>
                        <span className="vt-history-stat-label">Trained</span>
                      </div>
                      <div className="vt-history-stat">
                        <span className="vt-history-stat-value">{total}</span>
                        <span className="vt-history-stat-label">Squad</span>
                      </div>
                      <div className="vt-history-stat">
                        <span className="vt-history-stat-value vt-history-stat-value--pct">
                          {pct}%
                        </span>
                        <span className="vt-history-stat-label">Attendance</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 8 }}
            onClick={() => navigate("/vision-training")}
          >
            ← Back to Training Hub
          </button>

        </div>
      </div>
    </div>
  );
}
