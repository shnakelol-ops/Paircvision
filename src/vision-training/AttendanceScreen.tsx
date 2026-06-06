import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import type { AttendanceStatus } from "./types";
import { loadSessionById, upsertSession } from "./trainingStorage";

type Props = { sessionId: string };

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  injured: "Injured",
  absent: "Absent",
};

const STATUSES: AttendanceStatus[] = ["present", "late", "injured", "absent"];

function navigate(path: string) {
  window.location.assign(path);
}

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function AttendanceScreen({ sessionId }: Props) {
  const [session, setSession] = useState(() => loadSessionById(sessionId));

  if (!session) {
    return (
      <div className="vt-page-shell">
        <VisionStadiumBackground variant="training" />
        <div className="vt-shell">
          <div className="vt-container">
            <div className="vt-header">
              <button
                type="button"
                className="vt-back-btn"
                aria-label="Back"
                onClick={() => navigate("/vision-training")}
              >
                ←
              </button>
              <div>
                <h1 className="vt-heading">Not Found</h1>
                <p className="vt-subheading">This session could not be loaded.</p>
              </div>
            </div>
            <button
              type="button"
              className="vt-ghost-btn"
              onClick={() => navigate("/vision-training")}
            >
              ← Back to Training Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  function setPlayerStatus(playerId: string, status: AttendanceStatus) {
    setSession((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        attendance: prev.attendance.map((rec) =>
          rec.playerId === playerId ? { ...rec, status } : rec
        ),
      };
      upsertSession(next);
      return next;
    });
  }

  const counts = { present: 0, late: 0, injured: 0, absent: 0 };
  for (const rec of session.attendance) {
    counts[rec.status] = (counts[rec.status] ?? 0) + 1;
  }

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
              <h1 className="vt-heading">{session.title}</h1>
              <p className="vt-subheading">
                {formatDate(session.date)}
                {session.focus ? ` · ${session.focus}` : ""}
                {" · Squad Attendance"}
              </p>
            </div>
          </div>

          <div className="vt-summary-strip">
            <span className="vt-summary-chip vt-summary-chip--present">Present {counts.present}</span>
            <span className="vt-summary-chip vt-summary-chip--late">Late {counts.late}</span>
            <span className="vt-summary-chip vt-summary-chip--injured">Injured {counts.injured}</span>
            <span className="vt-summary-chip vt-summary-chip--absent">Absent {counts.absent}</span>
          </div>

          {session.attendance.length === 0 ? (
            <div className="vt-panel">
              <p className="vt-panel-sub" style={{ textAlign: "center", padding: "6px 0" }}>
                No players in this session. Go back and select a squad when creating a session.
              </p>
            </div>
          ) : (
            <div className="vt-player-list">
              {session.attendance.map((rec) => (
                <div key={rec.playerId} className="vt-player-card">
                  <div className="vt-player-identity">
                    <div className="vt-player-number">{rec.playerNumber}</div>
                    <div className="vt-player-name">{rec.playerName}</div>
                  </div>
                  <div className="vt-status-row">
                    {STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={[
                          "vt-status-btn",
                          `vt-status-btn--${status}`,
                          rec.status === status ? "vt-status-btn--active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setPlayerStatus(rec.playerId, status)}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 8 }}
            onClick={() => navigate(`/vision-training/session/${sessionId}/review`)}
          >
            Session Review →
          </button>

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 6 }}
            onClick={() => navigate("/vision-training")}
          >
            ← Back to Training Hub
          </button>

        </div>
      </div>
    </div>
  );
}
