import "./visionTraining.css";
import { useState } from "react";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import type { PlayerTrainingNote } from "./types";
import { loadSessionById, upsertSession } from "./trainingStorage";

type Props = { sessionId: string };

function navigate(path: string) {
  window.location.assign(path);
}

function generateId(): string {
  return `pn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function PlayerNotesScreen({ sessionId }: Props) {
  const [session, setSession] = useState(() => loadSessionById(sessionId));
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (session) {
      for (const n of session.playerNotes) {
        map[n.playerId] = n.note;
      }
    }
    return map;
  });

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

  const noteCount = session.playerNotes.length;

  function togglePlayer(playerId: string) {
    setExpandedPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function saveNote(playerId: string) {
    if (!session) return;
    const noteText = (draftNotes[playerId] ?? "").trim();
    const now = new Date().toISOString();

    setDraftNotes((prev) => ({ ...prev, [playerId]: noteText }));

    let updatedNotes: PlayerTrainingNote[];

    if (noteText.length === 0) {
      updatedNotes = session.playerNotes.filter((n) => n.playerId !== playerId);
    } else {
      const existingIdx = session.playerNotes.findIndex(
        (n) => n.playerId === playerId
      );
      if (existingIdx >= 0) {
        updatedNotes = session.playerNotes.map((n) =>
          n.playerId === playerId ? { ...n, note: noteText, updatedAt: now } : n
        );
      } else {
        const player = session.attendance.find((r) => r.playerId === playerId);
        if (!player) return;
        const newNote: PlayerTrainingNote = {
          id: generateId(),
          sessionId,
          playerId,
          playerNumber: player.playerNumber,
          playerName: player.playerName,
          note: noteText,
          createdAt: now,
        };
        updatedNotes = [...session.playerNotes, newNote];
      }
    }

    const updated = { ...session, playerNotes: updatedNotes };
    upsertSession(updated);
    setSession(updated);
    setExpandedPlayerId(null);
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
                {" · Player Notes"}
              </p>
            </div>
          </div>

          <div className="vt-notes-summary">
            <span className="vt-notes-summary-count">{noteCount}</span>{" "}
            {noteCount === 1 ? "player note" : "player notes"} saved
          </div>

          {session.attendance.length === 0 ? (
            <div className="vt-panel">
              <p className="vt-panel-sub" style={{ textAlign: "center", padding: "6px 0" }}>
                No players in this session. Create a session with a squad first.
              </p>
            </div>
          ) : (
            <div className="vt-notes-player-list">
              {session.attendance.map((rec) => {
                const isExpanded = expandedPlayerId === rec.playerId;
                const savedNote = session.playerNotes.find(
                  (n) => n.playerId === rec.playerId
                );
                const draftText = draftNotes[rec.playerId] ?? savedNote?.note ?? "";

                return (
                  <div
                    key={rec.playerId}
                    className={[
                      "vt-notes-player-card",
                      isExpanded ? "vt-notes-player-card--expanded" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div
                      className="vt-notes-player-head"
                      role="button"
                      tabIndex={0}
                      onClick={() => togglePlayer(rec.playerId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          togglePlayer(rec.playerId);
                      }}
                    >
                      <div className="vt-player-number">{rec.playerNumber}</div>
                      <div className="vt-player-name">{rec.playerName}</div>
                      <span
                        className={[
                          "vt-notes-chevron",
                          isExpanded ? "vt-notes-chevron--open" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </div>

                    {!isExpanded && savedNote && (
                      <p className="vt-notes-player-preview">{savedNote.note}</p>
                    )}

                    {isExpanded && (
                      <div className="vt-notes-form">
                        <textarea
                          className="vt-textarea"
                          placeholder={`Observations for ${rec.playerName}…`}
                          value={draftText}
                          rows={3}
                          autoFocus
                          onChange={(e) =>
                            setDraftNotes((prev) => ({
                              ...prev,
                              [rec.playerId]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="vt-primary-btn"
                          onClick={() => saveNote(rec.playerId)}
                        >
                          Save Note
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="vt-ghost-btn"
            style={{ marginTop: 8 }}
            onClick={() =>
              navigate(`/vision-training/session/${sessionId}/review`)
            }
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
