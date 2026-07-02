import { useEffect, useRef, useState } from "react";

// Shared mic-capture plumbing for anything that records a single audio-only
// clip via getUserMedia + MediaRecorder: acquire the mic, collect chunks,
// hand back a Blob on stop. Used by NotesQuickPanel.tsx (voice notes, with
// IndexedDB persistence) and useCoachingClip.ts (narration, held in memory).
// Domain logic — what to do with the resulting Blob — stays with the caller.

export type AudioRecorderPhase = "idle" | "recording";

// Discriminated on `status` (a string literal) rather than a boolean `ok`
// flag — this project's tsconfig doesn't enable strictNullChecks, and
// TypeScript's control-flow narrowing for `if (!result.ok)` on a boolean
// discriminant doesn't reliably narrow the union under those settings.
// A string-literal discriminant narrows correctly either way.
export type AudioRecorderStartResult =
  | { status: "started" }
  | { status: "no-getUserMedia" }
  | { status: "no-MediaRecorder" }
  | { status: "getUserMedia-failed"; error: unknown };

export type AudioRecorderHandle = {
  phase: AudioRecorderPhase;
  isSupported: () => boolean;
  start: () => Promise<AudioRecorderStartResult>;
  stop: () => void;
};

export function useAudioRecorder(params: {
  onStop: (blob: Blob, mimeType: string) => void;
  onRecordingError?: () => void;
}): AudioRecorderHandle {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [phase, setPhase] = useState<AudioRecorderPhase>("idle");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopTracks();
    };
  }, []);

  const isSupported = (): boolean =>
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const start = async (): Promise<AudioRecorderStartResult> => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return { status: "no-getUserMedia" };
    }
    if (typeof MediaRecorder === "undefined") {
      return { status: "no-MediaRecorder" };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopTracks();
        setPhase("idle");
        paramsRef.current.onStop(blob, mimeType);
      };
      recorder.onerror = () => {
        stopTracks();
        setPhase("idle");
        paramsRef.current.onRecordingError?.();
      };

      recorder.start();
      setPhase("recording");
      return { status: "started" };
    } catch (error) {
      stopTracks();
      setPhase("idle");
      return { status: "getUserMedia-failed", error };
    }
  };

  const stop = (): void => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  return { phase, isSupported, start, stop };
}
