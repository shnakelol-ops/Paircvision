// Field diagnostics for the Match Clipper. Everything here is read-only and
// local: it inspects the selected File, the browser's capabilities and the
// last export error, and produces a plain-text report the coach can copy and
// send. No video bytes are included — only sizes, offsets, names and errors.

import type { ClipExportError, SourceProbe } from "./clip-export";
import { hasWebCodecs, loadEngine } from "./clip-export";
import type { Mp4Scan } from "./mp4-scan";

export interface ReadCheck {
  method: "slice" | "stream";
  where: "start" | "middle" | "end";
  offset: number;
  ok: boolean;
  bytes: number;
  ms: number;
  error: string | null;
}

function errText(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const e = err as { name?: unknown; message?: unknown };
    return `${String(e.name)}: ${String(e.message ?? "")}`;
  }
  return String(err);
}

const CHUNK = 64 * 1024;

/**
 * Reads 64 KB at the start, middle and end of the file with both methods a
 * browser offers: `slice().arrayBuffer()` (what export uses) and
 * `slice().stream()` (what Mediabunny's default BlobSource used). Shows on the
 * phone itself whether the file is readable, and by which method.
 */
export async function runReadChecks(file: Blob): Promise<ReadCheck[]> {
  const offsets: [ReadCheck["where"], number][] = [
    ["start", 0],
    ["middle", Math.max(0, Math.floor(file.size / 2) - CHUNK / 2)],
    ["end", Math.max(0, file.size - CHUNK)],
  ];
  const out: ReadCheck[] = [];
  for (const [where, offset] of offsets) {
    const end = Math.min(file.size, offset + CHUNK);
    let t = performance.now();
    try {
      const buf = await file.slice(offset, end).arrayBuffer();
      out.push({ method: "slice", where, offset, ok: true, bytes: buf.byteLength, ms: Math.round(performance.now() - t), error: null });
    } catch (err) {
      out.push({ method: "slice", where, offset, ok: false, bytes: 0, ms: Math.round(performance.now() - t), error: errText(err) });
    }
    t = performance.now();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      reader = file.slice(offset, end).stream().getReader();
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
      }
      out.push({ method: "stream", where, offset, ok: true, bytes, ms: Math.round(performance.now() - t), error: null });
    } catch (err) {
      out.push({ method: "stream", where, offset, ok: false, bytes: 0, ms: Math.round(performance.now() - t), error: errText(err) });
    } finally {
      void reader?.cancel().catch(() => undefined);
    }
  }
  return out;
}

export interface EnvironmentInfo {
  userAgent: string;
  webCodecs: boolean;
  cores: number | null;
  deviceMemoryGB: number | null;
  canEncodeAvc: boolean | null;
  canEncodeAac: boolean | null;
}

export async function collectEnvironment(width: number, height: number): Promise<EnvironmentInfo> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const info: EnvironmentInfo = {
    userAgent: nav.userAgent,
    webCodecs: hasWebCodecs(),
    cores: nav.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    canEncodeAvc: null,
    canEncodeAac: null,
  };
  if (!info.webCodecs) return info;
  try {
    const mb = await loadEngine();
    info.canEncodeAvc = await mb.canEncodeVideo("avc", width > 0 ? { width, height } : undefined);
    info.canEncodeAac = await mb.canEncodeAudio("aac");
  } catch {
    // leave as unknown
  }
  return info;
}

export interface PlaybackInfo {
  /** Chrome's non-standard counters; > 0 means the player really decoded audio/video. */
  audioDecodedBytes: number | null;
  videoDecodedBytes: number | null;
  error: string | null;
}

export function readPlayback(video: HTMLVideoElement | null): PlaybackInfo {
  if (!video) return { audioDecodedBytes: null, videoDecodedBytes: null, error: null };
  const v = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; webkitVideoDecodedByteCount?: number };
  return {
    audioDecodedBytes: typeof v.webkitAudioDecodedByteCount === "number" ? v.webkitAudioDecodedByteCount : null,
    videoDecodedBytes: typeof v.webkitVideoDecodedByteCount === "number" ? v.webkitVideoDecodedByteCount : null,
    error: v.error ? `MediaError ${v.error.code}: ${v.error.message}` : null,
  };
}

function scanLines(scan: Mp4Scan | null): string[] {
  if (!scan) return ["  (not run)"];
  const lines = [
    `  brands: ${scan.brands.join(", ") || "-"}`,
    `  boxes: ${scan.topLevel.map((b) => `${b.type}@${b.offset}(${b.size})`).join(" ")}`,
    `  moov: ${scan.moov ? `${scan.moov.size} bytes at ${scan.moov.offset}` : "not found"}; fragmented: ${scan.fragmented}`,
  ];
  for (const t of scan.tracks) {
    lines.push(
      `  track ${t.id ?? "?"}: ${t.handler ?? "?"} ${t.sampleEntry ?? "?"}` +
        (t.objectType !== null ? ` oti=0x${t.objectType.toString(16)}` : "") +
        (t.channels !== null ? ` ${t.channels}ch ${t.sampleRate}Hz` : "") +
        ` samples=${t.sampleCount ?? "?"} dur=${t.durationSeconds?.toFixed(1) ?? "?"}s enabled=${t.enabled ?? "?"}`,
    );
  }
  if (!scan.tracks.length) lines.push("  no tracks listed");
  if (scan.error) lines.push(`  scan error: ${scan.error}`);
  return lines;
}

export function buildReport(parts: {
  file: File | null;
  probe: SourceProbe | null;
  readChecks: ReadCheck[] | null;
  environment: EnvironmentInfo | null;
  playback: PlaybackInfo | null;
  lastError: ClipExportError | null;
  now?: Date;
}): string {
  const { file, probe, readChecks, environment, playback, lastError } = parts;
  const lines: string[] = ["PáircVision Match Clipper — diagnostics", `time: ${(parts.now ?? new Date()).toISOString()}`];
  lines.push("", "file:");
  lines.push(
    file
      ? `  ${file.name} — ${file.size} bytes, type "${file.type || "-"}", lastModified ${new Date(file.lastModified).toISOString()}`
      : "  (none selected)",
  );
  lines.push("", "environment:");
  if (environment) {
    lines.push(`  ${environment.userAgent}`);
    lines.push(
      `  webcodecs=${environment.webCodecs} cores=${environment.cores ?? "?"} memoryGB=${environment.deviceMemoryGB ?? "?"} ` +
        `encode avc=${environment.canEncodeAvc ?? "?"} aac=${environment.canEncodeAac ?? "?"}`,
    );
  } else lines.push("  (not collected)");
  lines.push("", "read checks (64 KB each):");
  if (readChecks) {
    for (const c of readChecks) {
      lines.push(`  ${c.method.padEnd(6)} ${c.where.padEnd(6)} @${c.offset}: ${c.ok ? `ok ${c.bytes} B in ${c.ms} ms` : `FAILED ${c.error}`}`);
    }
  } else lines.push("  (not run)");
  lines.push("", "engine (Mediabunny):");
  if (probe) {
    lines.push(
      `  duration=${probe.duration.toFixed(2)}s ${probe.width}x${probe.height} video=${probe.videoCodec ?? "-"} audio=${probe.audioCodec ?? "-"} hasAudio=${probe.hasAudio}`,
    );
    lines.push(`  blocker: ${probe.blocker ? `${probe.blocker.code} — ${probe.blocker.message}${probe.blocker.detail ? ` [${probe.blocker.detail}]` : ""}` : "none"}`);
    if (probe.readFailure) lines.push(`  read failure: ${probe.readFailure.name}: ${probe.readFailure.message} @${probe.readFailure.start}`);
  } else lines.push("  (not run)");
  lines.push("", "structure scan:", ...scanLines(probe?.scan ?? null));
  lines.push("", "playback:");
  lines.push(
    playback
      ? `  audioDecodedBytes=${playback.audioDecodedBytes ?? "n/a"} videoDecodedBytes=${playback.videoDecodedBytes ?? "n/a"}${playback.error ? ` error=${playback.error}` : ""}`
      : "  (no video)",
  );
  lines.push("", "last export error:");
  lines.push(
    lastError
      ? `  ${lastError.code} at ${lastError.stage ?? "?"}: ${lastError.message}${lastError.detail ? `\n  raw: ${lastError.detail}` : ""}`
      : "  none",
  );
  return lines.join("\n");
}
