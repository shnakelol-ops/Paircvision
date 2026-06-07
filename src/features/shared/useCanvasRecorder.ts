import { useEffect, useRef, useState } from "react";

export type RecordPhase = "idle" | "panel" | "countdown" | "recording" | "done";

export type CanvasRecorderHandle = {
  recordPhase: RecordPhase;
  recordDuration: 10 | 20 | 30;
  recordCountdown: number;
  recordBlob: Blob | null;
  setRecordDuration: (d: 10 | 20 | 30) => void;
  setRecordPhase: (p: RecordPhase) => void;
  canRecord: () => boolean;
  startCountdown: () => void;
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
  const [recordDuration, setRecordDuration] = useState<10 | 20 | 30>(30);
  const [recordCountdown, setRecordCountdown] = useState(3);
  const [recordBlob, setRecordBlob] = useState<Blob | null>(null);
  const [recordMimeType, setRecordMimeType] = useState("video/webm");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordDurationRef = useRef(recordDuration);
  recordDurationRef.current = recordDuration;

  useEffect(() => {
    return () => {
      if (recordCountdownRef.current) clearTimeout(recordCountdownRef.current);
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
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
    setRecordMimeType(mimeType);
    recordChunksRef.current = [];
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunksRef.current, { type: mimeType });
      setRecordBlob(blob);
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

  const dismissRecord = () => {
    if (recordCountdownRef.current) { clearTimeout(recordCountdownRef.current); recordCountdownRef.current = null; }
    stopRecording();
    setRecordPhase("idle");
    setRecordBlob(null);
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
    setRecordDuration,
    setRecordPhase,
    canRecord,
    startCountdown,
    stopRecording,
    dismissRecord,
    saveClip,
    shareClip,
  };
}
