import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { loadSavedSquads } from "../features/player-performance-tracker/storage/trainingSessionStorage";
import type { AttendanceRecord, TrainingSession } from "./types";
import { saveActiveSessionId, upsertSession } from "./trainingStorage";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function navigate(path: string) {
  window.location.assign(path);
}

export default function NewSessionScreen() {
  const squads = loadSavedSquads();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO);
  const [focus, setFocus] = useState("");
  const [selectedSquadId, setSelectedSquadId] = useState<string>(
    squads.length > 0 ? squads[0].id : ""
  );

  const selectedSquad = squads.find((s) => s.id === selectedSquadId) ?? null;

  function handleStart() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const attendance: AttendanceRecord[] = (selectedSquad?.players ?? []).map((p) => ({
      playerId: p.id,
      playerNumber: p.number,
      playerName: p.name,
      status: "present" as const,
    }));

    const session: TrainingSession = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      date,
      title: trimmedTitle,
      focus: focus.trim() || undefined,
      squadId: selectedSquad?.id,
      status: "draft",
      attendance,
      playerNotes: [],
    };

    upsertSession(session);
    saveActiveSessionId(session.id);
    navigate(`/vision-training/session/${session.id}/attendance`);
  }

  const canStart = title.trim().length > 0;

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
              <h1 className="vt-heading">New Session</h1>
              <p className="vt-subheading">Set up tonight's training log</p>
            </div>
          </div>

          <div className="vt-panel">

            <label className="vt-label">
              Session Title
              <input
                className="vt-input"
                placeholder="e.g. Match Prep, Kickout Session…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </label>

            <label className="vt-label">
              Date
              <input
                type="date"
                className="vt-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            <label className="vt-label">
              Focus{" "}
              <span style={{ color: "#3d5a6a", fontWeight: 500 }}>(optional)</span>
              <input
                className="vt-input"
                placeholder="e.g. Kickouts, Attack play…"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                maxLength={80}
              />
            </label>

            {squads.length > 0 ? (
              <label className="vt-label">
                Squad
                <select
                  className="vt-input"
                  value={selectedSquadId}
                  onChange={(e) => setSelectedSquadId(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="">No squad — empty session</option>
                  {squads.map((sq) => (
                    <option key={sq.id} value={sq.id}>
                      {sq.name} ({sq.players.length} players)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#4a6070", lineHeight: 1.5 }}>
                No saved squads found. Save a squad in the Performance Tracker first, or start with an empty session.
              </p>
            )}

            {selectedSquad ? (
              <p style={{ margin: 0, fontSize: 11, color: "#2d7a4a", lineHeight: 1.4 }}>
                {selectedSquad.players.length} players · all defaulted to Present
              </p>
            ) : null}

          </div>

          <button
            type="button"
            className="vt-primary-btn"
            onClick={handleStart}
            disabled={!canStart}
            style={{ marginTop: 6 }}
          >
            Start Session
          </button>

        </div>
      </div>
    </div>
  );
}
