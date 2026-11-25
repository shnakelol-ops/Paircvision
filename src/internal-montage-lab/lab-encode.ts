// Montage Lab — H.264 encoder support and sustained encode speed, measured
// with WebCodecs directly (the same encoder Mediabunny drives).

export interface EncoderSupportRow {
  label: string;
  width: number;
  height: number;
  codec: string;
  acceleration: HardwareAcceleration;
  supported: boolean | null;
  error: string | null;
}

const CODECS = [
  { codec: "avc1.640028", name: "High@4.0" },
  { codec: "avc1.42E01F", name: "Baseline@3.1" },
];
const SIZES = [
  { w: 1280, h: 720, name: "720p" },
  { w: 1920, h: 1080, name: "1080p" },
];

export async function encoderSupport(): Promise<EncoderSupportRow[]> {
  const rows: EncoderSupportRow[] = [];
  for (const s of SIZES) {
    for (const c of CODECS) {
      for (const acceleration of ["prefer-hardware", "prefer-software"] as HardwareAcceleration[]) {
        const row: EncoderSupportRow = {
          label: `${s.name} ${c.name} ${acceleration}`, width: s.w, height: s.h, codec: c.codec, acceleration, supported: null, error: null,
        };
        try {
          if (typeof VideoEncoder === "undefined") throw new Error("VideoEncoder missing");
          const r = await VideoEncoder.isConfigSupported({
            codec: c.codec, width: s.w, height: s.h, bitrate: s.h >= 1080 ? 6_000_000 : 3_000_000, framerate: 30,
            hardwareAcceleration: acceleration, avc: { format: "avc" },
          });
          row.supported = !!r.supported;
        } catch (err) {
          row.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

export async function aacEncodeSupported(): Promise<boolean | null> {
  try {
    if (typeof AudioEncoder === "undefined") return false;
    return !!(await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported;
  } catch {
    return null;
  }
}

export interface EncodeBenchResult {
  label: string;
  width: number;
  height: number;
  acceleration: HardwareAcceleration;
  frames: number;
  seconds: number;
  elapsedMs: number;
  /** Encoded seconds of video per wall-clock second (2.0 = twice real time). */
  realtimeFactor: number;
  fps: number;
  outputBytes: number;
  maxQueue: number;
  error: string | null;
}

/**
 * Encodes `seconds` of 30 fps synthetic video (moving bars, text and a
 * sweeping block, so every frame changes) and times it until the encoder has
 * flushed. Uses backpressure (encodeQueueSize) like a real export.
 */
export async function benchmarkEncode(
  width: number,
  height: number,
  seconds: number,
  acceleration: HardwareAcceleration,
  signal?: AbortSignal,
): Promise<EncodeBenchResult> {
  const fps = 30;
  const frames = Math.round(seconds * fps);
  const label = `${height}p ${acceleration}`;
  const result: EncodeBenchResult = {
    label, width, height, acceleration, frames, seconds, elapsedMs: 0, realtimeFactor: 0, fps: 0, outputBytes: 0, maxQueue: 0, error: null,
  };
  let encoder: VideoEncoder | null = null;
  try {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("No 2D canvas");
    let failed: Error | null = null;
    encoder = new VideoEncoder({
      output: (chunk) => {
        result.outputBytes += chunk.byteLength;
      },
      error: (e) => {
        failed = e;
      },
    });
    encoder.configure({
      codec: "avc1.640028", width, height, bitrate: height >= 1080 ? 6_000_000 : 3_000_000, framerate: fps,
      hardwareAcceleration: acceleration, avc: { format: "avc" }, latencyMode: "quality",
    });
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (failed) throw failed;
      const hue = (i * 3) % 360;
      ctx.fillStyle = `hsl(${hue} 60% 35%)`;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#2f8f3a";
      for (let x = -(i * 12) % 80; x < width; x += 80) ctx.fillRect(x, 0, 40, height);
      ctx.fillStyle = "#fff";
      ctx.fillRect((i * 17) % width, (i * 11) % height, width / 8, height / 8);
      ctx.font = `${Math.round(height / 10)}px sans-serif`;
      ctx.fillText(`frame ${i}`, width / 20, height / 2);
      const frame = new VideoFrame(canvas as CanvasImageSource, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();
      result.maxQueue = Math.max(result.maxQueue, encoder.encodeQueueSize);
      while (encoder.encodeQueueSize > 6) {
        await new Promise<void>((r) => encoder!.addEventListener("dequeue", () => r(), { once: true }));
      }
    }
    await encoder.flush();
    if (failed) throw failed;
    result.elapsedMs = Math.round(performance.now() - t0);
    result.realtimeFactor = +(seconds / (result.elapsedMs / 1000)).toFixed(2);
    result.fps = +(frames / (result.elapsedMs / 1000)).toFixed(1);
  } catch (err) {
    result.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
  }
  return result;
}
