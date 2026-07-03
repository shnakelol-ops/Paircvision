import { useEffect, useRef, useState } from "react";

import type { TacticalPadLiteSurface } from "../../../engine/pixi/createTacticalPadLiteSurface";
import { exportBoardSetupAsPng } from "../export/board-png-export";
import type { SlateTextAnnotation } from "../annotations/slateTextAnnotation";
import {
  canCaptureCanvasStream,
  downloadClipBlob,
  getBestVideoMimeType,
  shareClipBlob,
} from "../../shared/mediaClipExport";

// Coaching Clips V1 — a slideshow builder for annotated coaching images.
// Each slide is a flattened still of the board (built on PR #210's
// upload-image/background workflow + existing Tactical Slate annotation
// tools), captured via exportBoardSetupAsPng — the same compositor the
// existing Snapshot export uses. Export assembles the slides into an MP4/
// WebM with a fixed hold per slide. No live/real-time canvas recording and
// no narration in this iteration.

export type CoachingSlide = {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  createdAt: number;
};

export type ExportPhase = "idle" | "rendering" | "done" | "error";

export const MAX_COACHING_SLIDES = 12;
export const SLIDE_DURATION_OPTIONS_SECONDS = [3, 5, 7, 10, 15] as const;
export type SlideDurationSeconds = (typeof SLIDE_DURATION_OPTIONS_SECONDS)[number];
const DEFAULT_SLIDE_DURATION_SECONDS: SlideDurationSeconds = 5;

export type SlideAdvanceMode = "auto" | "manual";
const DEFAULT_SLIDE_ADVANCE_MODE: SlideAdvanceMode = "auto";
// "Manual style" trades a fixed, longer hold for a baked-in viewing cue —
// still just a fixed-duration slideshow under the hood, not real
// interactivity.
const MANUAL_MODE_SLIDE_SECONDS = 10;
const MANUAL_MODE_CAPTION = "Tap to pause / swipe to skip";

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
      reject(new Error("Could not read slide image"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export type CoachingClipHandle = {
  slides: CoachingSlide[];
  isCapturing: boolean;
  captureError: string | null;
  captureSlide: (surface: TacticalPadLiteSurface, textAnnotations: SlateTextAnnotation[]) => Promise<boolean>;
  removeSlide: (id: string) => void;
  clearSlides: () => void;
  moveSlideUp: (id: string) => void;
  moveSlideDown: (id: string) => void;

  slideDurationSeconds: SlideDurationSeconds;
  setSlideDurationSeconds: (seconds: SlideDurationSeconds) => void;
  slideAdvanceMode: SlideAdvanceMode;
  setSlideAdvanceMode: (mode: SlideAdvanceMode) => void;

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
  const [slides, setSlides] = useState<CoachingSlide[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [slideDurationSeconds, setSlideDurationSeconds] = useState<SlideDurationSeconds>(
    DEFAULT_SLIDE_DURATION_SECONDS,
  );
  const [slideAdvanceMode, setSlideAdvanceMode] = useState<SlideAdvanceMode>(DEFAULT_SLIDE_ADVANCE_MODE);

  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportMimeType, setExportMimeType] = useState("video/webm");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const slidesRef = useRef<CoachingSlide[]>([]);
  const slideDurationRef = useRef<SlideDurationSeconds>(DEFAULT_SLIDE_DURATION_SECONDS);
  const slideAdvanceModeRef = useRef<SlideAdvanceMode>(DEFAULT_SLIDE_ADVANCE_MODE);
  const exportRecorderRef = useRef<MediaRecorder | null>(null);
  const exportTimersRef = useRef<number[]>([]);
  const exportUrlRef = useRef<string | null>(null);
  const exportPhaseRef = useRef<ExportPhase>("idle");
  const isFirstInputsEffectRef = useRef(true);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    slideDurationRef.current = slideDurationSeconds;
  }, [slideDurationSeconds]);

  useEffect(() => {
    slideAdvanceModeRef.current = slideAdvanceMode;
  }, [slideAdvanceMode]);

  useEffect(() => {
    exportPhaseRef.current = exportPhase;
  }, [exportPhase]);

  // Reset a completed/errored export whenever the slide list changes, so the
  // panel never offers a stale clip after the coach edits the slide deck.
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
  }, [slides]);

  useEffect(() => {
    return () => {
      slidesRef.current.forEach((slide) => URL.revokeObjectURL(slide.url));
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      const exportRecorder = exportRecorderRef.current;
      if (exportRecorder && exportRecorder.state !== "inactive") exportRecorder.stop();
      exportTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const captureSlide = async (
    surface: TacticalPadLiteSurface,
    textAnnotations: SlateTextAnnotation[],
  ): Promise<boolean> => {
    if (isCapturing) return false;
    if (slidesRef.current.length >= MAX_COACHING_SLIDES) {
      setCaptureError(`Slide limit reached (${MAX_COACHING_SLIDES}). Clear slides to add more.`);
      return false;
    }
    setIsCapturing(true);
    setCaptureError(null);
    try {
      surface.pausePlayback();
      const file = await exportBoardSetupAsPng(surface, { textAnnotations });
      if (!file) {
        setCaptureError("Could not capture slide — please try again.");
        return false;
      }
      const dims = await readImageDimensions(file);
      const slide: CoachingSlide = {
        id: makeId("coaching-slide"),
        blob: file,
        url: URL.createObjectURL(file),
        width: dims.width,
        height: dims.height,
        createdAt: Date.now(),
      };
      setSlides((prev) => [...prev, slide]);
      return true;
    } catch {
      setCaptureError("Could not capture slide — please try again.");
      return false;
    } finally {
      setIsCapturing(false);
    }
  };

  const removeSlide = (id: string): void => {
    setSlides((prev) => {
      const target = prev.find((slide) => slide.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((slide) => slide.id !== id);
    });
  };

  const clearSlides = (): void => {
    slidesRef.current.forEach((slide) => URL.revokeObjectURL(slide.url));
    setSlides([]);
    setCaptureError(null);
  };

  const moveSlideUp = (id: string): void => {
    setSlides((prev) => {
      const index = prev.findIndex((slide) => slide.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      const above = next[index - 1]!;
      next[index - 1] = next[index]!;
      next[index] = above;
      return next;
    });
  };

  const moveSlideDown = (id: string): void => {
    setSlides((prev) => {
      const index = prev.findIndex((slide) => slide.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;
      const next = [...prev];
      const below = next[index + 1]!;
      next[index + 1] = next[index]!;
      next[index] = below;
      return next;
    });
  };

  const canGenerateClip = (): boolean => canCaptureCanvasStream();

  const generateClip = async (): Promise<void> => {
    if (slidesRef.current.length <= 0 || exportPhase === "rendering") return;
    if (!canGenerateClip()) {
      setExportPhase("error");
      setExportError("Clip export not supported in this browser.");
      return;
    }

    setExportPhase("rendering");
    setExportProgress(0);
    setExportError(null);

    let bitmaps: ImageBitmap[] = [];

    try {
      const clipSlides = slidesRef.current;
      bitmaps = await Promise.all(clipSlides.map((slide) => createImageBitmap(slide.blob)));

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

      const isManualStyle = slideAdvanceModeRef.current === "manual";

      const drawSlide = (bitmap: ImageBitmap) => {
        ctx.fillStyle = "#0b1110";
        ctx.fillRect(0, 0, outputWidth, outputHeight);
        const fitScale = Math.min(outputWidth / bitmap.width, outputHeight / bitmap.height);
        const w = bitmap.width * fitScale;
        const h = bitmap.height * fitScale;
        ctx.drawImage(bitmap, (outputWidth - w) / 2, (outputHeight - h) / 2, w, h);
        if (isManualStyle) {
          // A baked-in viewing cue for "Manual style" — not real
          // interactivity, just a coach-friendly hint for WhatsApp/video
          // players that this slideshow is meant to be paused/skipped
          // through rather than watched straight.
          const fontSize = Math.max(12, Math.round(outputWidth * 0.022));
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          const paddingX = Math.round(fontSize * 0.7);
          const paddingY = Math.round(fontSize * 0.5);
          const textWidth = ctx.measureText(MANUAL_MODE_CAPTION).width;
          const boxW = textWidth + paddingX * 2;
          const boxH = fontSize + paddingY * 2;
          const margin = Math.round(outputWidth * 0.02);
          const boxX = outputWidth - boxW - margin;
          const boxY = outputHeight - boxH - margin;
          ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(MANUAL_MODE_CAPTION, boxX + paddingX, boxY + boxH / 2);
        }
      };

      drawSlide(bitmaps[0]!);

      const perSlideMs = (isManualStyle ? MANUAL_MODE_SLIDE_SECONDS : slideDurationRef.current) * 1000;

      const canvasStream = (
        canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }
      ).captureStream(OUTPUT_FPS);
      const stream = new MediaStream(canvasStream.getVideoTracks());
      const mimeType = getBestVideoMimeType();
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
            setExportMimeType(mimeType);
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

      // Some browsers only push a fresh captureStream() frame when the
      // canvas is actually redrawn, even with a fixed frameRate requested —
      // a canvas left untouched for the whole hold can starve the recorder
      // of frames and produce a shorter file than the slide count x
      // duration implies. Redraw the current slide periodically so the
      // canvas stays invalidated for the full hold, not just at
      // transitions.
      let currentBitmap = bitmaps[0]!;
      const redrawTimer = window.setInterval(() => {
        drawSlide(currentBitmap);
      }, 200);
      exportTimersRef.current.push(redrawTimer);

      for (let i = 1; i < bitmaps.length; i += 1) {
        const bitmap = bitmaps[i]!;
        const timer = window.setTimeout(() => {
          currentBitmap = bitmap;
          drawSlide(bitmap);
          setExportProgress(Math.min(0.95, i / bitmaps.length));
        }, Math.round(perSlideMs * i));
        exportTimersRef.current.push(timer);
      }
      const stopAt = Math.round(perSlideMs * bitmaps.length) + 150;
      const stopTimer = window.setTimeout(() => {
        window.clearInterval(redrawTimer);
        if (recorder.state !== "inactive") recorder.stop();
      }, stopAt);
      exportTimersRef.current.push(stopTimer);

      await recordingDone;
    } catch (err) {
      setExportPhase("error");
      setExportError(err instanceof Error ? err.message : "Export failed — please try again.");
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close());
      exportTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      exportTimersRef.current = [];
    }
  };

  const saveClip = (): void => {
    if (!exportBlob) return;
    downloadClipBlob(exportBlob, exportMimeType, "paircvision-coaching-clip");
  };

  const shareClip = async (): Promise<void> => {
    if (!exportBlob) return;
    setIsSharing(true);
    try {
      await shareClipBlob({
        blob: exportBlob,
        requestedMimeType: exportMimeType,
        filenamePrefix: "paircvision-coaching-clip",
        title: "PáircVision Coaching Clip",
      });
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
    clearSlides();
    resetExport();
  };

  return {
    slides,
    isCapturing,
    captureError,
    captureSlide,
    removeSlide,
    clearSlides,
    moveSlideUp,
    moveSlideDown,

    slideDurationSeconds,
    setSlideDurationSeconds,
    slideAdvanceMode,
    setSlideAdvanceMode,

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
