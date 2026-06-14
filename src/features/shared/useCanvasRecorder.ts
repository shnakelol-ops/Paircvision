import { useEffect, useRef, useState } from "react";

export type RecordPhase = "idle" | "panel" | "countdown" | "recording" | "done";
export type RecordDuration = 30 | 60 | 90;
export type MicStatus = "off" | "requesting" | "active" | "denied" | "unavailable";

export type CanvasRecorderHandle = {
  recordPhase: RecordPhase;
  recordDuration: RecordDuration;
  recordCountdown: number;
  /** Seconds elapsed since recording started. Resets to 0 when recording begins or is dismissed. */
  recordElapsed: number;
  recordBlob: Blob | null;
  recordBlobUrl: string | null;
  recordHasAudio: boolean;
  // The MIME type that was passed to MediaRecorder — includes codec params when
  // an explicit codec was selected (e.g. "video/mp4;codecs=avc1.42E01E,mp4a.40.2").
  // "video/mp4" with no codec params means the generic fallback was used and the
  // browser may have produced VP9+Opus in an MP4 wrapper.
  recordMimeType: string;
  micStatus: MicStatus;
  /** True while the Web Share API call is in-flight. */
  isSharing: boolean;
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
  const [recordHasAudio, setRecordHasAudio] = useState(false);
  const [recordMimeType, setRecordMimeType] = useState("video/webm");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [isSharing, setIsSharing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordElapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordDurationRef = useRef(recordDuration);
  recordDurationRef.current = recordDuration;
  const activeAudioStreamRef = useRef<MediaStream | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const hasAudioRef = useRef(false);

  function stopAudioTracks() {
    const s = activeAudioStreamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      activeAudioStreamRef.current = null;
    }
    setMicStatus("off");
  }

  function clearElapsedInterval() {
    if (recordElapsedIntervalRef.current) {
      clearInterval(recordElapsedIntervalRef.current);
      recordElapsedIntervalRef.current = null;
    }
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
      clearElapsedInterval();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      stopAudioTracks();
      revokeBlobUrl();
    };
  }, []);

  function getBestMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "video/webm";
    // Probe in preference order.
    //
    // H.264+AAC in MP4 first — this is the only combination WhatsApp reliably
    // preserves audio for. The specific codec strings are tested before the
    // generic "video/mp4" because "video/mp4" alone may be honoured by the
    // browser but produce VP9+Opus internally (observed on Chrome for Android).
    //
    // VP9+Opus in WebM before generic "video/mp4" so that devices without an
    // H.264 hardware encoder land on correctly-labelled WebM rather than
    // VP9+Opus mislabelled as MP4.
    //
    // Generic "video/mp4" is kept as a last resort only.
    for (const t of [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",  // H.264 Baseline + AAC-LC
      "video/mp4;codecs=avc1,mp4a.40.2",          // H.264 + AAC shorthand
      "video/webm;codecs=vp9,opus",               // VP9+Opus in WebM (correct label)
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",                                // last resort — may produce VP9/Opus-in-MP4
    ]) {
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
    clearElapsedInterval();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const startRecordingInner = (mimeType: string) => {
    const canvas = paramsRef.current.getCanvas();
    if (!canvas) return;

    revokeBlobUrl();
    setRecordBlob(null);
    setRecordBlobUrl(null);
    setRecordHasAudio(false);

    setRecordMimeType(mimeType);
    recordChunksRef.current = [];

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30);

    const audioStream = activeAudioStreamRef.current;
    const audioTracks = audioStream?.getAudioTracks() ?? [];
    const hasAudio = audioTracks.length > 0;
    hasAudioRef.current = hasAudio;

    const stream = hasAudio
      ? new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])
      : canvasStream;

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearElapsedInterval();
      stopAudioTracks();
      // Use only the container MIME type (no codec params) for the Blob.
      // Some Android Chrome builds report H.264 support via isTypeSupported but
      // actually encode VP9. If we label the Blob "video/mp4;codecs=avc1…" and
      // the bytes are VP9, the browser's H.264 decoder fails and shows a blank
      // preview. Without codec params the container parser auto-detects the
      // actual codec from the bitstream, so playback works regardless.
      const blobType = mimeType.split(";")[0].trim();
      const blob = new Blob(recordChunksRef.current, { type: blobType });
      const url = URL.createObjectURL(blob);
      console.debug("[PV REC] onstop — chunks:", recordChunksRef.current.length, "size:", blob.size, "blobType:", blobType, "requestedMime:", mimeType, "url:", url);
      blobUrlRef.current = url;
      setRecordBlob(blob);
      setRecordBlobUrl(url);
      setRecordHasAudio(hasAudioRef.current);
      setRecordPhase("done");
      paramsRef.current.onComplete?.();
    };
    setRecordElapsed(0);
    recorder.start(200);
    recordElapsedIntervalRef.current = setInterval(() => setRecordElapsed((e) => e + 1), 1000);
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
    clearElapsedInterval();
    setRecordElapsed(0);
    stopRecording();
    stopAudioTracks();
    revokeBlobUrl();
    setRecordPhase("idle");
    setRecordBlob(null);
    setRecordBlobUrl(null);
    setRecordHasAudio(false);
  };

  // Determines the MIME type and file extension to use when sharing.
  //
  // The key case: MediaRecorder on some Chrome for Android versions produces
  // VP9+Opus bytes when given the generic "video/mp4" MIME type. We detect
  // this by checking whether the recorded MIME contains an explicit H.264
  // codec identifier. If not, the file is shared as video/webm so WhatsApp
  // routes it to a VP9-capable player rather than a H.264-only path.
  //
  // This applies to sharing only. saveClip preserves the original container
  // label because local media players (VLC, QuickTime) handle VP9-in-MP4.
  function resolveShareMeta(blob: Blob): { mimeType: string; ext: string } {
    const raw = blob.type || recordMimeType;
    const base = raw.split(";")[0].trim().toLowerCase();
    const isMp4Container = base === "video/mp4";

    if (isMp4Container) {
      // Only treat as a genuine H.264/AAC MP4 if the recorded MIME contained
      // an explicit H.264 codec string. Generic "video/mp4" may be VP9+Opus.
      const hasExplicitH264 =
        recordMimeType.includes("avc1") || recordMimeType.toLowerCase().includes("h264");
      if (!hasExplicitH264) {
        // VP9/Opus mislabelled as MP4 — share as WebM so the codec is honest.
        return { mimeType: "video/webm", ext: "webm" };
      }
      return { mimeType: "video/mp4", ext: "mp4" };
    }

    return { mimeType: "video/webm", ext: "webm" };
  }

  const saveClip = () => {
    if (!recordBlob) return;
    // Use the actual container format for downloads — local media players handle
    // VP9-in-MP4 correctly. The WhatsApp MIME correction is for sharing only.
    const raw = recordBlob.type || recordMimeType;
    const base = raw.split(";")[0].trim().toLowerCase();
    const ext = base === "video/mp4" ? "mp4" : "webm";
    const filename = `paircvision-clip-${Date.now()}.${ext}`;
    const file = new File([recordBlob], filename, { type: base });
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1200);
  };

  const shareClip = async () => {
    if (!recordBlob) return;
    setIsSharing(true);
    const { mimeType, ext } = resolveShareMeta(recordBlob);
    const filename = `paircvision-clip-${Date.now()}.${ext}`;
    const file = new File([recordBlob], filename, { type: mimeType });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "PáircVision Coaching Clip" });
      } else {
        saveClip();
      }
    } catch {
      saveClip();
    } finally {
      setIsSharing(false);
    }
  };

  return {
    recordPhase,
    recordDuration,
    recordCountdown,
    recordElapsed,
    recordBlob,
    recordBlobUrl,
    recordHasAudio,
    recordMimeType,
    micStatus,
    isSharing,
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
