import { useEffect, useRef, useState } from "react";

import { canCaptureCanvasStream, downloadClipBlob, getBestVideoMimeType, shareClipBlob } from "./mediaClipExport";

export type RecordPhase = "idle" | "panel" | "countdown" | "recording" | "done";
export type MicStatus = "off" | "requesting" | "active" | "denied" | "unavailable";

/** Auto-stop fires after this many seconds (10 minutes). */
export const MAX_RECORD_SECONDS = 600;

export type CanvasRecorderHandle = {
  recordPhase: RecordPhase;
  recordCountdown: number;
  /** Seconds elapsed since recording started. Holds the final elapsed value in the "done" phase until dismissed. */
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

    // Log canvas video track info.
    canvasStream.getVideoTracks().forEach((t, i) => {
      const s = t.getSettings();
      console.debug(`[PV REC] videoTrack[${i}] readyState:${t.readyState} label:"${t.label}" enabled:${t.enabled} muted:${t.muted} w:${s.width} h:${s.height} fps:${s.frameRate}`);
    });

    const audioStream = activeAudioStreamRef.current;
    const audioTracks = audioStream?.getAudioTracks() ?? [];
    const hasAudio = audioTracks.length > 0;
    hasAudioRef.current = hasAudio;

    // Log audio track info.
    audioTracks.forEach((t, i) => {
      const s = t.getSettings();
      console.debug(`[PV REC] audioTrack[${i}] readyState:${t.readyState} label:"${t.label}" enabled:${t.enabled} muted:${t.muted} sampleRate:${s.sampleRate} channelCount:${s.channelCount}`);
    });

    const stream = hasAudio
      ? new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])
      : canvasStream;

    // Audit the final merged stream — catch duplicate/stopped tracks before recorder starts.
    const allTracks = stream.getTracks();
    console.debug(`[PV REC] stream composition — ${allTracks.length} track(s): ${allTracks.map((t) => `${t.kind}/${t.readyState}/${t.enabled ? "on" : "off"}`).join(", ")}`);
    allTracks.forEach((t, i) => {
      const s = t.getSettings();
      const c = t.getConstraints();
      console.debug(`[PV REC] stream.track[${i}] kind:${t.kind} readyState:${t.readyState} enabled:${t.enabled} muted:${t.muted} label:"${t.label}" settings:${JSON.stringify(s)} constraints:${JSON.stringify(c)}`);
    });

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    // Log actual mimeType chosen by the browser and bitrate properties — may differ from requested.
    console.debug(`[PV REC] MediaRecorder — requested:"${mimeType}" actual:"${recorder.mimeType}" videoBPS:${recorder.videoBitsPerSecond} audioBPS:${recorder.audioBitsPerSecond}`);
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
      const chunks = recordChunksRef.current;
      console.debug("[PV REC] onstop — chunks:", chunks.length, "sizes:", chunks.map((c) => c.size).join(","));
      const blob = new Blob(chunks, { type: blobType });
      const url = URL.createObjectURL(blob);
      console.debug("[PV REC] blob — size:", blob.size, "type:", blob.type, "requestedMime:", mimeType, "url:", url.slice(0, 60));
      // Read first 32 bytes to detect actual container format.
      void chunks[0]?.arrayBuffer().then((buf) => {
        const arr = new Uint8Array(buf, 0, Math.min(32, buf.byteLength));
        const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const isWebM = arr[0] === 0x1a && arr[1] === 0x45 && arr[2] === 0xdf && arr[3] === 0xa3;
        // MP4 "ftyp" box appears at byte offset 4; bytes 4-7 = 0x66 0x74 0x79 0x70
        const hasMP4Ftyp = arr.length >= 8 && arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70;
        const container = isWebM ? "WebM/EBML" : hasMP4Ftyp ? "MP4 (ftyp)" : "UNKNOWN";
        console.debug("[PV REC] magic bytes (first 32):", hex);
        console.debug("[PV REC] detected container:", container, "| blobType claimed:", blobType, "| MISMATCH:", (isWebM && blobType === "video/mp4") || (hasMP4Ftyp && blobType === "video/webm"));
      });
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
    recordTimerRef.current = setTimeout(stopRecording, MAX_RECORD_SECONDS * 1000);
  };

  const startCountdown = () => {
    paramsRef.current.onBeforeCountdown?.();
    setRecordPhase("countdown");
    setRecordCountdown(3);
    let count = 3;
    const mimeType = getBestVideoMimeType();
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

  const saveClip = () => {
    if (!recordBlob) return;
    downloadClipBlob(recordBlob, recordMimeType, "paircvision-clip");
  };

  const shareClip = async () => {
    if (!recordBlob) return;
    setIsSharing(true);
    try {
      await shareClipBlob({
        blob: recordBlob,
        requestedMimeType: recordMimeType,
        filenamePrefix: "paircvision-clip",
        title: "PáircVision Coaching Clip",
      });
    } finally {
      setIsSharing(false);
    }
  };

  return {
    recordPhase,
    recordCountdown,
    recordElapsed,
    recordBlob,
    recordBlobUrl,
    recordHasAudio,
    recordMimeType,
    micStatus,
    isSharing,
    setRecordPhase,
    canRecord: canCaptureCanvasStream,
    startCountdown,
    startCountdownWithVoice,
    stopRecording,
    dismissRecord,
    saveClip,
    shareClip,
  };
}
