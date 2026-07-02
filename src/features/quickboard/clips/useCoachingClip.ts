import { useEffect, useRef, useState } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import { exportBoardSetupAsPng } from "../export/board-png-export";
import type { SlateTextAnnotation } from "../annotations/slateTextAnnotation";
import {
  canCaptureCanvasStream,
  downloadBlob,
  getBestClipVideoMimeType,
  shareOrDownloadBlob,
} from "./coachingClipMedia";

export type CoachingClipFrame = {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  createdAt: number;
};

export type NarrationPhase = "idle" | "requesting" | "recording" | "recorded";
export type ExportPhase = "idle" | "rendering" | "done" | "error";

export const MAX_COACHING_CLIP_FRAMES = 12;
const DEFAULT_FRAME_HOLD_SECONDS = 2.5;
const MIN_FRAME_HOLD_MS = 300;
const OUTPUT_MAX_DIM = 1280;
const OUTPUT_FPS = 30;

function makeId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && "randomUUID" in cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("Could not read frame image"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function decodeNarrationAudio(blob: Blob): Promise<{ audioBuffer: AudioBuffer; ctx: AudioContext } | null> {
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return { audioBuffer, ctx };
  } catch {
    return null;
  }
}

export type CoachingClipHandle = {
  frames: CoachingClipFrame[];
  isCapturing: boolean;
  captureError: string | null;
  addFrame: (surface: TacticalPadLiteSurface, textAnnotations: SlateTextAnnotation[]) => Promise<boolean>;
  removeFrame: (id: string) => void;
  clearFrames: () => void;

  narrationPhase: NarrationPhase;
  narrationUrl: string | null;
  narrationError: string | null;
  canRecordNarration: () => boolean;
  startNarration: () => Promise<void>;
  stopNarration: () => void;
  clearNarration: () => void;

  exportPhase: ExportPhase;
  exportProgress: number;
  exportUrl: string | null;
  exportError: string | null;
  isSharing: boolean;
  canGenerateClip: () => boolean;
  generateClip: () => Promise<void>;
  saveClip: () => void;
  shareClip: () => Promise<void>;
  resetExport: () => void;

  resetAll: () => void;
};

export function useCoachingClip(): CoachingClipHandle {
  const [frames, setFrames] = useState<CoachingClipFrame[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const [narrationPhase, setNarrationPhase] = useState<NarrationPhase>("idle");
  const [narrationBlob, setNarrationBlob] = useState<Blob | null>(null);
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportMimeType, setExportMimeType] = useState("video/webm");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const framesRef = useRef<CoachingClipFrame[]>([]);
  const narrationRecorderRef = useRef<MediaRecorder | null>(null);
  const narrationStreamRef = useRef<MediaStream | null>(null);
  const narrationChunksRef = useRef<Blob[]>([]);
  const narrationUrlRef = useRef<string | null>(null);

  const exportRecorderRef = useRef<MediaRecorder | null>(null);
  const exportTimersRef = useRef<number[]>([]);
  const exportAudioCtxRef = useRef<AudioContext | null>(null);
  const exportUrlRef = useRef<string | null>(null);
  const exportPhaseRef = useRef<ExportPhase>("idle");
  const isFirstInputsEffectRef = useRef(true);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    exportPhaseRef.current = exportPhase;
  }, [exportPhase]);

  // Reset a completed/errored export whenever the inputs it was built from change,
  // so the panel never offers a stale clip after the coach edits frames or narration.
  useEffect(() => {
    if (isFirstInputsEffectRef.current) {
      isFirstInputsEffectRef.current = false;
      return;
    }
    if (exportPhaseRef.current !== "done" && exportPhaseRef.current !== "error") return;
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }
    setExportBlob(null);
    setExportUrl(null);
    setExportProgress(0);
    setExportError(null);
    setExportPhase("idle");
  }, [frames, narrationBlob]);

  useEffect(() => {
    return () => {
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
      if (narrationUrlRef.current) URL.revokeObjectURL(narrationUrlRef.current);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      narrationStreamRef.current?.getTracks().forEach((track) => track.stop());
      const narrationRecorder = narrationRecorderRef.current;
      if (narrationRecorder && narrationRecorder.state !== "inactive") narrationRecorder.stop();
      const exportRecorder = exportRecorderRef.current;
      if (exportRecorder && exportRecorder.state !== "inactive") exportRecorder.stop();
      exportTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      void exportAudioCtxRef.current?.close();
    };
  }, []);

  const addFrame = async (
    surface: TacticalPadLiteSurface,
    textAnnotations: SlateTextAnnotation[],
  ): Promise<boolean> => {
    if (isCapturing) return false;
    if (framesRef.current.length >= MAX_COACHING_CLIP_FRAMES) {
      setCaptureError(`Frame limit reached (${MAX_COACHING_CLIP_FRAMES}). Clear frames to add more.`);
      return false;
    }
    setIsCapturing(true);
    setCaptureError(null);
    try {
      surface.pausePlayback();
      const file = await exportBoardSetupAsPng(surface, { textAnnotations });
      if (!file) {
        setCaptureError("Could not capture frame — please try again.");
        return false;
      }
      const dims = await readImageDimensions(file);
      const frame: CoachingClipFrame = {
        id: makeId("clip-frame"),
        blob: file,
        url: URL.createObjectURL(file),
        width: dims.width,
        height: dims.height,
        createdAt: Date.now(),
      };
      setFrames((prev) => [...prev, frame]);
      return true;
    } catch {
      setCaptureError("Could not capture frame — please try again.");
      return false;
    } finally {
      setIsCapturing(false);
    }
  };

  const removeFrame = (id: string): void => {
    setFrames((prev) => {
      const target = prev.find((frame) => frame.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((frame) => frame.id !== id);
    });
  };

  const clearFrames = (): void => {
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    setFrames([]);
    setCaptureError(null);
  };

  const canRecordNarration = (): boolean => {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  };

  const startNarration = async (): Promise<void> => {
    if (narrationPhase === "recording" || narrationPhase === "requesting") return;
    if (!canRecordNarration()) {
      setNarrationError("Voice recording not supported on this device.");
      return;
    }
    setNarrationError(null);
    setNarrationPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      narrationStreamRef.current = stream;
      narrationChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      narrationRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) narrationChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(narrationChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        narrationChunksRef.current = [];
        if (narrationUrlRef.current) URL.revokeObjectURL(narrationUrlRef.current);
        const url = URL.createObjectURL(blob);
        narrationUrlRef.current = url;
        setNarrationBlob(blob);
        setNarrationUrl(url);
        setNarrationPhase("recorded");
        narrationStreamRef.current?.getTracks().forEach((track) => track.stop());
        narrationStreamRef.current = null;
      };
      recorder.onerror = () => {
        setNarrationError("Recording failed — please try again.");
        setNarrationPhase("idle");
        narrationStreamRef.current?.getTracks().forEach((track) => track.stop());
        narrationStreamRef.current = null;
      };
      recorder.start();
      setNarrationPhase("recording");
    } catch {
      setNarrationError("Microphone access denied.");
      setNarrationPhase("idle");
    }
  };

  const stopNarration = (): void => {
    const recorder = narrationRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const clearNarration = (): void => {
    const recorder = narrationRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    narrationStreamRef.current?.getTracks().forEach((track) => track.stop());
    narrationStreamRef.current = null;
    if (narrationUrlRef.current) {
      URL.revokeObjectURL(narrationUrlRef.current);
      narrationUrlRef.current = null;
    }
    setNarrationBlob(null);
    setNarrationUrl(null);
    setNarrationPhase("idle");
    setNarrationError(null);
  };

  const canGenerateClip = (): boolean => canCaptureCanvasStream();

  const generateClip = async (): Promise<void> => {
    if (framesRef.current.length <= 0 || exportPhase === "rendering") return;
    if (!canGenerateClip()) {
      setExportPhase("error");
      setExportError("Clip export not supported in this browser.");
      return;
    }

    setExportPhase("rendering");
    setExportProgress(0);
    setExportError(null);

    let bitmaps: ImageBitmap[] = [];
    let audioInfo: { audioBuffer: AudioBuffer; ctx: AudioContext } | null = null;

    try {
      const clipFrames = framesRef.current;
      bitmaps = await Promise.all(clipFrames.map((frame) => createImageBitmap(frame.blob)));

      const maxWidth = Math.max(...bitmaps.map((bitmap) => bitmap.width));
      const maxHeight = Math.max(...bitmaps.map((bitmap) => bitmap.height));
      const scale = Math.min(1, OUTPUT_MAX_DIM / maxWidth);
      const outputWidth = Math.max(2, Math.round(maxWidth * scale));
      const outputHeight = Math.max(2, Math.round(maxHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas rendering not available");

      const drawFrame = (bitmap: ImageBitmap) => {
        ctx.fillStyle = "#0b1110";
        ctx.fillRect(0, 0, outputWidth, outputHeight);
        const fitScale = Math.min(outputWidth / bitmap.width, outputHeight / bitmap.height);
        const w = bitmap.width * fitScale;
        const h = bitmap.height * fitScale;
        ctx.drawImage(bitmap, (outputWidth - w) / 2, (outputHeight - h) / 2, w, h);
      };

      drawFrame(bitmaps[0]!);

      if (narrationBlob) {
        audioInfo = await decodeNarrationAudio(narrationBlob);
      }

      const totalSeconds = audioInfo
        ? audioInfo.audioBuffer.duration
        : clipFrames.length * DEFAULT_FRAME_HOLD_SECONDS;
      const perFrameMs = Math.max(MIN_FRAME_HOLD_MS, (totalSeconds * 1000) / clipFrames.length);

      const canvasStream = (
        canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }
      ).captureStream(OUTPUT_FPS);
      const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

      let audioDestination: MediaStreamAudioDestinationNode | null = null;
      let audioSource: AudioBufferSourceNode | null = null;
      if (audioInfo) {
        audioDestination = audioInfo.ctx.createMediaStreamDestination();
        audioSource = audioInfo.ctx.createBufferSource();
        audioSource.buffer = audioInfo.audioBuffer;
        audioSource.connect(audioDestination);
        tracks.push(...audioDestination.stream.getAudioTracks());
        exportAudioCtxRef.current = audioInfo.ctx;
      }

      const stream = new MediaStream(tracks);
      const mimeType = getBestClipVideoMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      exportRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      const recordingDone = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => {
          try {
            const blobType = mimeType.split(";")[0]!.trim();
            const blob = new Blob(chunks, { type: blobType });
            const url = URL.createObjectURL(blob);
            exportUrlRef.current = url;
            setExportBlob(blob);
            setExportUrl(url);
            setExportMimeType(blobType);
            setExportProgress(1);
            setExportPhase("done");
            resolve();
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Export failed"));
          }
        };
        recorder.onerror = () => reject(new Error("Recording failed"));
      });

      exportTimersRef.current = [];
      recorder.start(200);
      audioSource?.start(0);

      for (let i = 1; i < bitmaps.length; i += 1) {
        const bitmap = bitmaps[i]!;
        const timer = window.setTimeout(() => {
          drawFrame(bitmap);
          setExportProgress(Math.min(0.95, i / bitmaps.length));
        }, Math.round(perFrameMs * i));
        exportTimersRef.current.push(timer);
      }
      const stopAt = Math.round(perFrameMs * bitmaps.length) + 150;
      const stopTimer = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, stopAt);
      exportTimersRef.current.push(stopTimer);

      await recordingDone;
    } catch (err) {
      setExportPhase("error");
      setExportError(err instanceof Error ? err.message : "Export failed — please try again.");
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close());
      if (audioInfo) void audioInfo.ctx.close();
      exportTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      exportTimersRef.current = [];
    }
  };

  const saveClip = (): void => {
    if (!exportBlob) return;
    const base = exportMimeType.split(";")[0]!.trim().toLowerCase();
    const ext = base === "video/mp4" ? "mp4" : "webm";
    downloadBlob(exportBlob, `paircvision-coaching-clip-${Date.now()}.${ext}`);
  };

  const shareClip = async (): Promise<void> => {
    if (!exportBlob) return;
    setIsSharing(true);
    try {
      const base = exportMimeType.split(";")[0]!.trim().toLowerCase();
      const ext = base === "video/mp4" ? "mp4" : "webm";
      await shareOrDownloadBlob(
        exportBlob,
        `paircvision-coaching-clip-${Date.now()}.${ext}`,
        base,
        "PáircVision Coaching Clip",
      );
    } finally {
      setIsSharing(false);
    }
  };

  const resetExport = (): void => {
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }
    setExportBlob(null);
    setExportUrl(null);
    setExportProgress(0);
    setExportError(null);
    setExportPhase("idle");
  };

  const resetAll = (): void => {
    clearFrames();
    clearNarration();
    resetExport();
  };

  return {
    frames,
    isCapturing,
    captureError,
    addFrame,
    removeFrame,
    clearFrames,

    narrationPhase,
    narrationUrl,
    narrationError,
    canRecordNarration,
    startNarration,
    stopNarration,
    clearNarration,

    exportPhase,
    exportProgress,
    exportUrl,
    exportError,
    isSharing,
    canGenerateClip,
    generateClip,
    saveClip,
    shareClip,
    resetExport,

    resetAll,
  };
}
