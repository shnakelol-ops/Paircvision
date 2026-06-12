import { useEffect, useRef, useState } from "react";

export type RecordPhase = "idle" | "panel" | "countdown" | "recording" | "done";
export type RecordDuration = 30 | 60 | 90;
export type MicStatus = "off" | "requesting" | "active" | "denied" | "unavailable";

export type CanvasRecorderHandle = {
  recordPhase: RecordPhase;
  recordDuration: RecordDuration;
  recordCountdown: number;
  recordBlob: Blob | null;
  recordBlobUrl: string | null;
  micStatus: MicStatus;
  setRecordDuration: (d: RecordDuration) => void;
  setRecordPhase: (p: RecordPhase) => void;
  canRecord: () => boolean;
  startCountdown: () => void;
  startCountdownWithVoice: () => Promise<void>;
  stopRecording: () => void;
  dismissRecord: () => void;
  saveClip: () => void;
  shareClip: () => Promise<void>;
};

export function useCanvasRecorder(params: {
  getCanvas: () => HTMLCanvasElement | null;
  onBeforeCountdown?: () => void;
  onComplete?: () => void;
}): CanvasRecorderHandle {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [recordPhase, setRecordPhase] = useState<RecordPhase>("idle");
  const [recordDuration, setRecordDuration] = useState<RecordDuration>(30);
  const [recordCountdown, setRecordCountdown] = useState(3);
  const [recordBlob, setRecordBlob] = useState<Blob | null>(null);
  const [recordBlobUrl, setRecordBlobUrl] = useState<string | null>(null);
  const [recordMimeType, setRecordMimeType] = useState("video/webm");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordDurationRef = useRef(recordDuration);
  recordDurationRef.current = recordDuration;
  const activeAudioStreamRef = useRef<MediaStream | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  function stopAudioTracks() {
    const s = activeAudioStreamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      activeAudioStreamRef.current = null;
    }
    setMicStatus("off");
  }

  function revokeBlobUrl() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (recordCountdownRef.current) clearTimeout(recordCountdownRef.current);
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      stopAudioTracks();
      revokeBlobUrl();
    };
  }, []);

  function getBestMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "video/webm";
    for (const t of ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "video/webm";
  }

  function canRecord(): boolean {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
    const c = document.createElement("canvas");
    return typeof (c as HTMLCanvasElement & { captureStream?: unknown }).captureStream === "function";
  }

  const stopRecording = () => {
    if (recordTimerRef.current) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const startRecordingInner = (mimeType: string) => {
    const canvas = paramsRef.current.getCanvas();
    if (!canvas) return;

    // Clear any previous clip before starting a new one.
    revokeBlobUrl();
    setRecordBlob(null);
    setRecordBlobUrl(null);

    setRecordMimeType(mimeType);
    recordChunksRef.current = [];

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30);

    // Merge audio track when mic is active; silent fallback if not.
    const audioStream = activeAudioStreamRef.current;
    const stream =
      audioStream && audioStream.getAudioTracks().length > 0
        ? new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()])
        : canvasStream;

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopAudioTracks();
      const blob = new Blob(recordChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setRecordBlob(blob);
      setRecordBlobUrl(url);
      setRecordPhase("done");
      paramsRef.current.onComplete?.();
    };
    recorder.start(200);
    recordTimerRef.current = setTimeout(stopRecording, recordDurationRef.current * 1000);
  };

  const startCountdown = () => {
    paramsRef.current.onBeforeCountdown?.();
    setRecordPhase("countdown");
    setRecordCountdown(3);
    let count = 3;
    const mimeType = getBestMimeType();
    const tick = () => {
      count -= 1;
      if (count <= 0) {
        setRecordPhase("recording");
        startRecordingInner(mimeType);
        return;
      }
      setRecordCountdown(count);
      recordCountdownRef.current = setTimeout(tick, 1000);
    };
    recordCountdownRef.current = setTimeout(tick, 1000);
  };

  // Request microphone access before starting the countdown so the permission
  // dialog resolves before recording begins. Falls back to silent if denied.
  const startCountdownWithVoice = async () => {
    setMicStatus("requesting");
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMicStatus("unavailable");
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        activeAudioStreamRef.current = stream;
        setMicStatus("active");
      }
    } catch {
      setMicStatus("denied");
      activeAudioStreamRef.current = null;
    }
    startCountdown();
  };

  const dismissRecord = () => {
    if (recordCountdownRef.current) { clearTimeout(recordCountdownRef.current); recordCountdownRef.current = null; }
    stopRecording();
    stopAudioTracks();
    revokeBlobUrl();
    setRecordPhase("idle");
    setRecordBlob(null);
    setRecordBlobUrl(null);
  };

  const saveClip = () => {
    if (!recordBlob) return;
    const ext = recordMimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(recordBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paircvision-clip-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1200);
  };

  const shareClip = async () => {
    if (!recordBlob) return;
    const ext = recordMimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const filename = `paircvision-clip-${Date.now()}.${ext}`;
    const file = new File([recordBlob], filename, { type: recordMimeType });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "PáircVision Clip" });
      } else {
        saveClip();
      }
    } catch {
      saveClip();
    }
  };

  return {
    recordPhase,
    recordDuration,
    recordCountdown,
    recordBlob,
    recordBlobUrl,
    micStatus,
    setRecordDuration,
    setRecordPhase,
    canRecord,
    startCountdown,
    startCountdownWithVoice,
    stopRecording,
    dismissRecord,
    saveClip,
    shareClip,
  };
}
