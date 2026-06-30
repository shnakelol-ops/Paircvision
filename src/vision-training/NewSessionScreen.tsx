import "./visionTraining.css";
import { useState } from "react";
import { ConfirmSheet, type ConfirmSheetProps } from "../components/ConfirmSheet";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { loadSavedSquads } from "../features/player-performance-tracker/storage/trainingSessionStorage";
import type { AttendanceRecord, TrainingHubSquad, TrainingSession } from "./types";
import { loadTrainingHubSquads, saveActiveSessionId, upsertSession, upsertTrainingHubSquad } from "./trainingStorage";

type QuickPlayer = { id: string; number: string; name: string };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function navigate(path: string) {
  window.location.assign(path);
}

export default function NewSessionScreen() {
  const [squads] = useState(() => loadSavedSquads());
  const hasSavedSquads = squads.length > 0;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO);
  const [focus, setFocus] = useState("");

  // Saved-squad path
  const [selectedSquadId, setSelectedSquadId] = useState<string>(
    squads.length > 0 ? squads[0].id : ""
  );

  // Quick-squad path (used when no saved squads exist)
  const [quickPlayers, setQuickPlayers] = useState<QuickPlayer[]>([]);
  const [trainingHubSquads, setTrainingHubSquads] = useState<TrainingHubSquad[]>(
    () => loadTrainingHubSquads()
  );
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetProps | null>(null);

  const selectedSquad = squads.find((s) => s.id === selectedSquadId) ?? null;

  const validQuickPlayers = quickPlayers.filter(
    (p) => p.name.trim().length > 0 && p.number.trim().length > 0
  );

  const playerCount = hasSavedSquads
    ? (selectedSquad?.players.length ?? 0)
    : validQuickPlayers.length;

  const canStart =
    title.trim().length > 0 &&
    (hasSavedSquads
      ? (selectedSquad?.players.length ?? 0) > 0
      : validQuickPlayers.length > 0);

  function addQuickPlayer() {
    if (quickPlayers.length >= 30) return;
    setQuickPlayers((prev) => [
      ...prev,
      { id: `qp-${Date.now()}-${prev.length}`, number: String(prev.length + 1), name: "" },
    ]);
  }

  function fill15() {
    setQuickPlayers(
      Array.from({ length: 15 }, (_, i) => ({
        id: `qp-fill-${i}`,
        number: String(i + 1),
        name: `Player ${i + 1}`,
      }))
    );
  }

  function clearPlayers() {
    setQuickPlayers([]);
  }

  function updateQuickPlayer(id: string, field: "number" | "name", value: string) {
    setQuickPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  function removeQuickPlayer(id: string) {
    setQuickPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSaveSquad() {
    if (validQuickPlayers.length === 0) return;
    const current = loadTrainingHubSquads();
    if (current.length >= 10) {
      setConfirmSheet({
        variant: "alert",
        message: "Maximum 10 saved training squads reached.",
        confirmLabel: "OK",
        onConfirm: () => setConfirmSheet(null),
        onCancel: () => setConfirmSheet(null),
      });
      return;
    }
    setConfirmSheet({
      variant: "prompt",
      message: "Name this training squad:",
      promptPlaceholder: "Squad name",
      confirmLabel: "Save Squad",
      onConfirm: (name) => {
        setConfirmSheet(null);
        if (!name?.trim()) return;
        const now = new Date().toISOString();
        const squad: TrainingHubSquad = {
          id: `ths-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim(),
          players: validQuickPlayers.map((p) => ({
            playerId: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            playerNumber: parseInt(p.number, 10) || 0,
            playerName: p.name.trim(),
          })),
          createdAt: now,
          updatedAt: now,
        };
        upsertTrainingHubSquad(squad);
        setTrainingHubSquads(loadTrainingHubSquads());
      },
      onCancel: () => setConfirmSheet(null),
    });
  }

  function handleLoadSquad(squad: TrainingHubSquad) {
    setQuickPlayers(
      squad.players.map((p, i) => ({
        id: `qp-loaded-${Date.now()}-${i}`,
        number: String(p.playerNumber),
        name: p.playerName,
      }))
    );
    setShowLoadPanel(false);
  }

  function handleStart() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !canStart) return;

    const attendance: AttendanceRecord[] = hasSavedSquads
      ? (selectedSquad?.players ?? []).map((p) => ({
          playerId: p.id,
          playerNumber: p.number,
          playerName: p.name,
          status: "present" as const,
        }))
      : validQuickPlayers.map((p, i) => ({
          playerId: `qp-${generateId()}-${i}`,
          playerNumber: parseInt(p.number, 10) || i + 1,
          playerName: p.name.trim(),
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

          {/* ── Session details ── */}
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
          </div>

          {/* ── Squad section ── */}
          {hasSavedSquads ? (
            /* Path A: saved squads exist */
            <div className="vt-panel">
              <label className="vt-label">
                Squad
                <select
                  className="vt-input"
                  value={selectedSquadId}
                  onChange={(e) => setSelectedSquadId(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  {squads.map((sq) => (
                    <option key={sq.id} value={sq.id}>
                      {sq.name} ({sq.players.length} players)
                    </option>
                  ))}
                </select>
              </label>

              {playerCount > 0 ? (
                <p className="vt-squad-count">
                  Squad: {playerCount} players · all defaulted to Present
                </p>
              ) : (
                <p className="vt-squad-count-warn">
                  This squad has no players. Choose a different squad.
                </p>
              )}
            </div>
          ) : (
            /* Path B: no saved squads — quick squad builder */
            <div className="vt-panel">
              <div className="vt-quick-squad-head">
                <span className="vt-quick-squad-label">Create Quick Squad</span>
                <div className="vt-quick-squad-actions">
                  <button type="button" className="vt-squad-action-btn" onClick={fill15}>
                    Fill 15
                  </button>
                  <button
                    type="button"
                    className="vt-squad-action-btn"
                    onClick={clearPlayers}
                    disabled={quickPlayers.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="vt-load-squad-row">
                <button
                  type="button"
                  className="vt-load-squad-toggle"
                  onClick={() => setShowLoadPanel((v) => !v)}
                >
                  {showLoadPanel ? "▴" : "▾"} Load a saved training squad
                </button>
              </div>

              {showLoadPanel && (
                <div className="vt-load-squad-panel">
                  {trainingHubSquads.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#4a6070", lineHeight: 1.5 }}>
                      No saved training squads yet.
                    </p>
                  ) : (
                    <div className="vt-load-squad-list">
                      {trainingHubSquads.map((sq) => (
                        <button
                          key={sq.id}
                          type="button"
                          className="vt-load-squad-item"
                          onClick={() => handleLoadSquad(sq)}
                        >
                          <span className="vt-load-squad-item-name">{sq.name}</span>
                          <span className="vt-load-squad-item-count">
                            {sq.players.length} players
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {quickPlayers.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "#4a6070", lineHeight: 1.5 }}>
                  No saved squads found. Create a quick squad for this session.
                </p>
              ) : (
                <div className="vt-quick-squad-players">
                  {quickPlayers.map((p) => (
                    <div key={p.id} className="vt-quick-player-row">
                      <input
                        className="vt-input"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="#"
                        value={p.number}
                        maxLength={2}
                        onChange={(e) =>
                          updateQuickPlayer(
                            p.id,
                            "number",
                            e.target.value.replace(/\D/g, "").slice(0, 2)
                          )
                        }
                        style={{ textAlign: "center", padding: "8px 4px" }}
                      />
                      <input
                        className="vt-input"
                        placeholder="Player name"
                        value={p.name}
                        maxLength={40}
                        onChange={(e) => updateQuickPlayer(p.id, "name", e.target.value)}
                      />
                      <button
                        type="button"
                        className="vt-quick-player-remove"
                        onClick={() => removeQuickPlayer(p.id)}
                        aria-label={`Remove ${p.name || "player"}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {quickPlayers.length < 30 ? (
                <button type="button" className="vt-squad-add-btn" onClick={addQuickPlayer}>
                  + Add Player
                </button>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: "#5a7080" }}>
                  Maximum 30 players reached.
                </p>
              )}

              {validQuickPlayers.length > 0 && (
                <button
                  type="button"
                  className="vt-squad-action-btn"
                  style={{ width: "100%", padding: "8px 12px", textAlign: "left" }}
                  onClick={handleSaveSquad}
                >
                  ↑ Save as Training Squad
                </button>
              )}

              {playerCount > 0 ? (
                <p className="vt-squad-count">
                  Squad: {playerCount} {playerCount === 1 ? "player" : "players"} · all defaulted to Present
                </p>
              ) : null}
            </div>
          )}

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
      {confirmSheet && <ConfirmSheet {...confirmSheet} />}
    </div>
  );
}
