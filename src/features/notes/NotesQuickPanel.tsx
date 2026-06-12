import { useEffect, useMemo, useRef, useState } from "react";

import { getVoiceBlob, saveVoiceBlob } from "./audio-storage";
import { appendCoachNote, loadCoachNotes } from "./notes-storage";
import { newCoachNoteId, type CoachNote } from "./types";

type MatchContext = {
  matchId: string;
  half: 1 | 2;
  matchClockMs: number;
};

type NotesQuickPanelProps = {
  matchContext: MatchContext;
  /** When true, hides all recording controls — display and playback only. */
  readonly?: boolean;
  /** Override which matchId to show notes for (e.g. a saved match being reviewed). */
  notesMatchId?: string;
  /** Called after a voice note is successfully saved. */
  onNoteAdded?: () => void;
};

function formatClockMs(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCreatedAt(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Operation failed";
}

export default function NotesQuickPanel({
  matchContext,
  readonly = false,
  notesMatchId,
  onNoteAdded,
}: NotesQuickPanelProps) {
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);

  const resolvedMatchId = notesMatchId ?? matchContext.matchId;

  const matchNotes = useMemo(
    () => notes.filter((note) => note.scope === "match" && note.matchId === resolvedMatchId),
    [resolvedMatchId, notes],
  );

  const stopLiveStreamTracks = () => {
    const stream = activeStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    activeStreamRef.current = null;
  };

  const cleanupPlayback = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
  };

  useEffect(() => {
    setNotes(loadCoachNotes());
  }, []);

  useEffect(() => {
    return () => {
      cleanupPlayback();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopLiveStreamTracks();
    };
  }, []);

  const startRecording = async () => {
    if (isRecording || isSaving) return;
    if (typeof window === "undefined" || !window.navigator.mediaDevices?.getUserMedia) {
      setFeedback("Voice recording not supported on this device.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setFeedback("Voice recording not available in this browser.");
      return;
    }

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      chunksRef.current = [];
      recordStartedAtRef.current = Date.now();

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setIsSaving(true);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          chunksRef.current = [];
          const durationMs = Math.max(0, Date.now() - (recordStartedAtRef.current ?? Date.now()));
          recordStartedAtRef.current = null;
          const audioBlobId = await saveVoiceBlob(blob);
          const note: CoachNote = {
            id: newCoachNoteId(),
            type: "voice",
            scope: "match",
            matchId: matchContext.matchId,
            half: matchContext.half,
            matchClockMs: matchContext.matchClockMs,
            audioBlobId,
            durationMs,
            createdAt: Date.now(),
          };
          const nextNotes = appendCoachNote(note);
          setNotes(nextNotes);
          setFeedback("Voice note saved.");
          onNoteAdded?.();
        } catch (error: unknown) {
          setFeedback(`Could not save voice note: ${toErrorMessage(error)}`);
        } finally {
          stopLiveStreamTracks();
          setIsSaving(false);
        }
      };

      recorder.onerror = () => {
        setFeedback("Recording failed.");
        setIsRecording(false);
        stopLiveStreamTracks();
      };

      recorder.start();
      setFeedback(null);
      setIsRecording(true);
    } catch (error: unknown) {
      setFeedback(`Microphone unavailable: ${toErrorMessage(error)}`);
      stopLiveStreamTracks();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const playVoiceNote = async (note: CoachNote) => {
    if (note.type !== "voice" || !note.audioBlobId) return;
    cleanupPlayback();
    try {
      const blob = await getVoiceBlob(note.audioBlobId);
      if (!(blob instanceof Blob)) {
        setFeedback("Audio file not found.");
        return;
      }
      const url = URL.createObjectURL(blob);
      activeAudioUrlRef.current = url;
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      audio.onended = cleanupPlayback;
      audio.onerror = () => {
        setFeedback("Playback failed.");
        cleanupPlayback();
      };
      await audio.play();
    } catch (error: unknown) {
      setFeedback(`Playback failed: ${toErrorMessage(error)}`);
      cleanupPlayback();
    }
  };

  return (
    <div className="utility-review-scroll">
      <div className="utility-panel-title">Voice Notes</div>

      {!readonly ? (
        <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.84, textTransform: "none" }}>
          H{matchContext.half} · {formatClockMs(matchContext.matchClockMs)}
        </div>
      ) : null}

      {!readonly ? (
        <button
          type="button"
          className="utility-review-btn"
          disabled={isSaving}
          onClick={() => {
            if (isRecording) {
              stopRecording();
            } else {
              void startRecording();
            }
          }}
          style={
            isRecording
              ? {
                  border: "1px solid rgba(248,113,113,0.9)",
                  background: "rgba(127,29,29,0.5)",
                }
              : undefined
          }
        >
          {isRecording ? "Stop Recording" : "Record Note"}
        </button>
      ) : null}

      {!readonly && isRecording ? (
        <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
          Recording...
        </div>
      ) : null}

      {feedback ? (
        <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
          {feedback}
        </div>
      ) : null}

      <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
        Recent Voice Notes
      </div>
      {matchNotes.length > 0 ? (
        matchNotes.map((note) => (
          <div
            key={note.id}
            style={{
              border: "1px solid rgba(148,163,184,0.32)",
              borderRadius: "8px",
              padding: "7px",
              background: "rgba(15,23,42,0.52)",
              marginBottom: "6px",
            }}
          >
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.95, textTransform: "none" }}>
              🎤 H{note.half ?? "-"} · {formatClockMs(note.matchClockMs)} · {formatCreatedAt(note.createdAt)}
            </div>
            <div style={{ marginTop: "4px", display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  void playVoiceNote(note);
                }}
              >
                Play
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
          No voice notes for this match yet.
        </div>
      )}
    </div>
  );
}
