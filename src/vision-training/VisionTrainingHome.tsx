import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { loadActiveSessionId, loadSessionById } from "./trainingStorage";

type HubCard = {
  name: string;
  sub: string;
  disabled: boolean;
  action?: () => void;
};

function navigate(path: string) {
  window.location.assign(path);
}

export default function VisionTrainingHome() {
  const [activeSession] = useState(() => {
    const id = loadActiveSessionId();
    return id ? loadSessionById(id) : null;
  });

  const hubCards: HubCard[] = [
    {
      name: "New Session",
      sub: "Start training log",
      disabled: false,
      action: () => navigate("/vision-training/session/new"),
    },
    {
      name: "Squad Attendance",
      sub: activeSession ? "Mark who trained" : "Start a session first",
      disabled: !activeSession,
      action: activeSession
        ? () => navigate(`/vision-training/session/${activeSession.id}/attendance`)
        : undefined,
    },
    { name: "Player Notes", sub: "Coming Soon", disabled: true },
    {
      name: "Session Review",
      sub: activeSession ? "End-of-night summary" : "Start a session first",
      disabled: !activeSession,
      action: activeSession
        ? () => navigate(`/vision-training/session/${activeSession.id}/review`)
        : undefined,
    },
  ];

  return (
    <div className="vt-page-shell">
      <VisionStadiumBackground variant="training" />
      <div className="vt-shell">
        <div className="vt-container">

          <div className="vt-header">
            <button
              type="button"
              className="vt-back-btn"
              aria-label="Back to home"
              onClick={() => navigate("/board")}
            >
              ←
            </button>
            <div>
              <h1 className="vt-heading">Vision Training</h1>
              <p className="vt-subheading">Training Hub · Player Performance</p>
            </div>
          </div>

          <p className="vt-section-label">Training Hub</p>
          <div className="vt-hub-panel">
            <div>
              <p className="vt-panel-title">Training Hub</p>
              <p className="vt-panel-sub">Record what happened at tonight's session</p>
            </div>
            <div className="vt-hub-grid">
              {hubCards.map((card) => (
                <div
                  key={card.name}
                  className={[
                    "vt-hub-card",
                    card.disabled ? "vt-hub-card--disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role={card.disabled ? undefined : "button"}
                  tabIndex={card.disabled ? undefined : 0}
                  aria-disabled={card.disabled || undefined}
                  onClick={card.disabled ? undefined : card.action}
                  onKeyDown={
                    card.disabled
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") card.action?.();
                        }
                  }
                >
                  <span className="vt-hub-card-name">{card.name}</span>
                  <span className="vt-hub-card-sub">{card.sub}</span>
                </div>
              ))}
              <div
                className="vt-hub-card vt-hub-card--disabled vt-hub-card--wide"
                aria-disabled="true"
              >
                <span className="vt-hub-card-name">History</span>
                <span className="vt-hub-card-sub">Coming Soon</span>
              </div>
            </div>
          </div>

          <p className="vt-section-label">Performance Tracker</p>
          <div className="vt-tracker-panel">
            <div>
              <p className="vt-tracker-panel-title">Performance Tracker</p>
              <p className="vt-tracker-panel-sub">
                Track player decisions, scores, work rate and mistakes
              </p>
            </div>
            <button
              type="button"
              className="vt-primary-btn"
              onClick={() => navigate("/vision-training/performance")}
            >
              Open Tracker
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
