import "./visionTraining.css";
import { useRef, useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import type { TrainingSessionReview } from "./types";
import { loadSessionById, upsertSession } from "./trainingStorage";

type Props = { sessionId: string };

function navigate(path: string) {
  window.location.assign(path);
}

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function fromLines(arr: string[]): string {
  return arr.join("\n");
}

export default function SessionReviewScreen({ sessionId }: Props) {
  const [session] = useState(() => loadSessionById(sessionId));

  const existingReview = session?.review;

  const [standoutPlayers, setStandoutPlayers] = useState(
    () => fromLines(existingReview?.standoutPlayers ?? [])
  );
  const [concerns, setConcerns] = useState(
    () => fromLines(existingReview?.concerns ?? [])
  );
  const [coachActions, setCoachActions] = useState(
    () => fromLines(existingReview?.coachActions ?? [])
  );
  const [nextSessionFocus, setNextSessionFocus] = useState(
    existingReview?.nextSessionFocus ?? ""
  );
  const [summaryNote, setSummaryNote] = useState(
    existingReview?.summaryNote ?? ""
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const feedbackTimerRef = useRef<number | null>(null);

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

  const counts = { present: 0, late: 0, injured: 0, absent: 0 };
  for (const rec of session.attendance) {
    counts[rec.status] = (counts[rec.status] ?? 0) + 1;
  }
  const total = session.attendance.length;
  const attendancePercent =
    total > 0 ? Math.round((counts.present / total) * 100) : 0;

  function saveReview() {
    const current = loadSessionById(sessionId);
    if (!current) return;

    const review: TrainingSessionReview = {
      sessionId,
      attendanceSummary: {
        present: counts.present,
        late: counts.late,
        injured: counts.injured,
        absent: counts.absent,
        total,
        attendancePercent,
      },
      standoutPlayers: toLines(standoutPlayers),
      concerns: toLines(concerns),
      coachActions: toLines(coachActions),
      nextSessionFocus: nextSessionFocus.trim() || undefined,
      summaryNote: summaryNote.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    upsertSession({ ...current, review });

    setSaveStatus("saved");
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setSaveStatus("idle");
      feedbackTimerRef.current = null;
    }, 1800);
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
              aria-label="Back to Attendance"
              onClick={() =>
                navigate(`/vision-training/session/${sessionId}/attendance`)
              }
            >
              ←
            </button>
            <div>
              <h1 className="vt-heading">{session.title}</h1>
              <p className="vt-subheading">
                {formatDate(session.date)}
                {session.focus ? ` · ${session.focus}` : ""}
                {" · Session Review"}
              </p>
            </div>
          </div>

          <p className="vt-section-label">Attendance Summary</p>
          <div className="vt-panel">
            <div className="vt-review-stats">
              <div className="vt-review-stat">
                <span className="vt-review-stat-label">Present</span>
                <span className="vt-review-stat-value vt-review-stat-value--present">
                  {counts.present}
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

            <label className="vt-label">
              Standout Players{" "}
              <span style={{ color: "#3d5a6a", fontWeight: 500 }}>(one per line)</span>
              <textarea
                className="vt-textarea"
                placeholder={"e.g. Darragh Ó Séaghdha\nCiarán Mac Lochlainn"}
                value={standoutPlayers}
                rows={3}
                onChange={(e) => setStandoutPlayers(e.target.value)}
                onBlur={saveReview}
              />
            </label>

            <label className="vt-label">
              Concerns{" "}
              <span style={{ color: "#3d5a6a", fontWeight: 500 }}>(one per line)</span>
              <textarea
                className="vt-textarea"
                placeholder={"e.g. Defensive shape\nKickout delivery"}
                value={concerns}
                rows={3}
                onChange={(e) => setConcerns(e.target.value)}
                onBlur={saveReview}
              />
            </label>

            <label className="vt-label">
              Coach Actions{" "}
              <span style={{ color: "#3d5a6a", fontWeight: 500 }}>(one per line)</span>
              <textarea
                className="vt-textarea"
                placeholder={"e.g. Review kickout footage\nAddress fitness block"}
                value={coachActions}
                rows={3}
                onChange={(e) => setCoachActions(e.target.value)}
                onBlur={saveReview}
              />
            </label>

            <label className="vt-label">
              Next Session Focus
              <input
                className="vt-input"
                placeholder="e.g. Attack play from kickouts…"
                value={nextSessionFocus}
                maxLength={120}
                onChange={(e) => setNextSessionFocus(e.target.value)}
                onBlur={saveReview}
              />
            </label>

            <label className="vt-label">
              General Session Note
              <textarea
                className="vt-textarea"
                placeholder="Overall thoughts on tonight's session…"
                value={summaryNote}
                rows={4}
                onChange={(e) => setSummaryNote(e.target.value)}
                onBlur={saveReview}
              />
            </label>

          </div>

          <button
            type="button"
            className="vt-primary-btn"
            onClick={saveReview}
            style={{ marginTop: 6 }}
          >
            {saveStatus === "saved" ? "Saved ✓" : "Save Review"}
          </button>

          <button
            type="button"
            className="vt-ghost-btn"
            disabled
            style={{ marginTop: 6 }}
          >
            Finish Session — Coming Soon
          </button>

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 6 }}
            onClick={() =>
              navigate(`/vision-training/session/${sessionId}/attendance`)
            }
          >
            ← Back to Attendance
          </button>

        </div>
      </div>
    </div>
  );
}
