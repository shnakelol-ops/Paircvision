import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { loadSessionById } from "./trainingStorage";

type Props = { sessionId: string };

function navigate(path: string) {
  window.location.assign(path);
}

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function ReadOnlyReviewScreen({ sessionId }: Props) {
  const [session] = useState(() => loadSessionById(sessionId));

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
                aria-label="Back to History"
                onClick={() => navigate("/vision-training/history")}
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
              onClick={() => navigate("/vision-training/history")}
            >
              ← Back to History
            </button>
          </div>
        </div>
      </div>
    );
  }

  const counts = { present: 0, late: 0, injured: 0, absent: 0 };
  for (const rec of session.attendance) {
    counts[rec.status] = (counts[rec.status] ?? 0) + 1;
  }
  const total = session.attendance.length;
  const trained = counts.present + counts.late;
  const attendancePercent = total > 0 ? Math.round((trained / total) * 100) : 0;

  const review = session.review;

  return (
    <div className="vt-page-shell">
      <VisionStadiumBackground variant="training" />
      <div className="vt-shell">
        <div className="vt-container">

          <div className="vt-header">
            <button
              type="button"
              className="vt-back-btn"
              aria-label="Back to History"
              onClick={() => navigate("/vision-training/history")}
            >
              ←
            </button>
            <div>
              <h1 className="vt-heading">{session.title}</h1>
              <p className="vt-subheading">
                {formatDate(session.date)}
                {session.focus ? ` · ${session.focus}` : ""}
                {" · Session Summary"}
              </p>
            </div>
          </div>

          <p className="vt-section-label">Attendance Summary</p>
          <div className="vt-panel">
            <div className="vt-review-stats">
              <div className="vt-review-stat">
                <span className="vt-review-stat-label">Trained</span>
                <span className="vt-review-stat-value vt-review-stat-value--present">
                  {trained}
                </span>
              </div>
              <div className="vt-review-stat">
                <span className="vt-review-stat-label">Late</span>
                <span className="vt-review-stat-value vt-review-stat-value--late">
                  {counts.late}
                </span>
              </div>
              <div className="vt-review-stat">
                <span className="vt-review-stat-label">Injured</span>
                <span className="vt-review-stat-value vt-review-stat-value--injured">
                  {counts.injured}
                </span>
              </div>
              <div className="vt-review-stat">
                <span className="vt-review-stat-label">Absent</span>
                <span className="vt-review-stat-value vt-review-stat-value--absent">
                  {counts.absent}
                </span>
              </div>
              <div className="vt-review-stat vt-review-stat--total">
                <span className="vt-review-stat-label">Total Squad</span>
                <span className="vt-review-stat-value">{total}</span>
              </div>
            </div>
            <div className="vt-review-percent-row">
              <span className="vt-review-percent-label">Attendance</span>
              <span className="vt-review-percent-value">{attendancePercent}%</span>
            </div>
          </div>

          <p className="vt-section-label">Coach Notes</p>
          <div className="vt-panel">

            {!review ? (
              <p className="vt-review-no-notes" style={{ textAlign: "center", padding: "4px 0" }}>
                No review was saved for this session.
              </p>
            ) : (
              <>
                <div className="vt-review-note-block">
                  <span className="vt-review-note-label">Standout Players</span>
                  {review.standoutPlayers.length > 0 ? (
                    <ul className="vt-review-note-list">
                      {review.standoutPlayers.map((p, i) => (
                        <li key={i} className="vt-review-note-item">{p}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vt-review-no-notes">None recorded</p>
                  )}
                </div>

                <div className="vt-review-note-block">
                  <span className="vt-review-note-label">Concerns</span>
                  {review.concerns.length > 0 ? (
                    <ul className="vt-review-note-list">
                      {review.concerns.map((c, i) => (
                        <li key={i} className="vt-review-note-item">{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vt-review-no-notes">None recorded</p>
                  )}
                </div>

                <div className="vt-review-note-block">
                  <span className="vt-review-note-label">Coach Actions</span>
                  {review.coachActions.length > 0 ? (
                    <ul className="vt-review-note-list">
                      {review.coachActions.map((a, i) => (
                        <li key={i} className="vt-review-note-item">{a}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vt-review-no-notes">None recorded</p>
                  )}
                </div>

                {review.nextSessionFocus ? (
                  <div className="vt-review-note-block">
                    <span className="vt-review-note-label">Next Session Focus</span>
                    <p className="vt-review-note-text">{review.nextSessionFocus}</p>
                  </div>
                ) : null}

                {review.summaryNote ? (
                  <div className="vt-review-note-block">
                    <span className="vt-review-note-label">General Session Note</span>
                    <p className="vt-review-note-text">{review.summaryNote}</p>
                  </div>
                ) : null}
              </>
            )}

          </div>

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 6 }}
            onClick={() => navigate("/vision-training/history")}
          >
            ← Back to History
          </button>

        </div>
      </div>
    </div>
  );
}
