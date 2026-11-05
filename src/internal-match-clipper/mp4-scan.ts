// Independent, minimal MP4/MOV structure scan — a second opinion next to
// Mediabunny's demuxer. It reads only box headers plus the `moov` box (never
// media data) and reports what tracks the file *declares*: handler type
// (vide/soun), sample-entry type (avc1, hvc1, mp4a, samr, …), AAC object type,
// and sample count. Used to confirm or contradict "no audio track" and to give
// field diagnostics something concrete to show.

import { readFileRange, type ReadStats } from "./file-source";

export interface ScannedTrack {
  id: number | null;
  /** 'vide', 'soun', 'meta', 'text', … */
  handler: string | null;
  /** First sample entry type, e.g. 'avc1', 'hvc1', 'mp4a', 'samr'. */
  sampleEntry: string | null;
  /** For mp4a: MPEG-4 objectTypeIndication from esds (0x40 = AAC). */
  objectType: number | null;
  channels: number | null;
  sampleRate: number | null;
  sampleCount: number | null;
  timescale: number | null;
  durationSeconds: number | null;
  enabled: boolean | null;
}

export interface Mp4Scan {
  brands: string[];
  /** Top-level boxes in file order (capped), with offsets. */
  topLevel: { type: string; offset: number; size: number }[];
  moov: { offset: number; size: number } | null;
  fragmented: boolean;
  tracks: ScannedTrack[];
  /** Set when the scan couldn't finish; tracks may then be partial. */
  error: string | null;
}

const MAX_TOP_LEVEL = 64;
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

function fourcc(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
}

interface Box {
  type: string;
  /** Absolute start of the box within the buffer. */
  start: number;
  /** Absolute start of the box payload within the buffer. */
  content: number;
  end: number;
}

/** Iterates child boxes of buffer range [from, to). */
function* boxes(b: Uint8Array, from: number, to: number): Generator<Box> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = from;
  while (p + 8 <= to) {
    let size = dv.getUint32(p);
    const type = fourcc(b, p + 4);
    let header = 8;
    if (size === 1) {
      if (p + 16 > to) return;
      size = Number(dv.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) {
      size = to - p;
    }
    if (size < header || p + size > to) return;
    yield { type, start: p, content: p + header, end: p + size };
    p += size;
  }
}

function child(b: Uint8Array, parent: Box, type: string): Box | null {
  for (const c of boxes(b, parent.content, parent.end)) if (c.type === type) return c;
  return null;
}

function path(b: Uint8Array, parent: Box | null, ...types: string[]): Box | null {
  let cur = parent;
  for (const t of types) {
    if (!cur) return null;
    cur = child(b, cur, t);
  }
  return cur;
}

/** Finds the esds objectTypeIndication inside an mp4a sample entry. */
function esdsObjectType(b: Uint8Array, entry: Box): number | null {
  // mp4a: 8 header + 28 bytes of AudioSampleEntry fields (v0), then child boxes.
  // QuickTime v1/v2 entries add 16/36 bytes; try each offset.
  for (const extra of [0, 16, 36]) {
    const from = entry.content + 28 + extra;
    for (const c of boxes(b, from, entry.end)) {
      if (c.type !== "esds") continue;
      let p = c.content + 4; // version + flags
      const readLen = () => {
        let len = 0;
        for (let i = 0; i < 4 && p < c.end; i++) {
          const v = b[p++]!;
          len = (len << 7) | (v & 0x7f);
          if (!(v & 0x80)) break;
        }
        return len;
      };
      if (b[p] !== 0x03) return null;
      p++;
      readLen();
      p += 2; // ES_ID
      const flags = b[p++]!;
      if (flags & 0x80) p += 2;
      if (flags & 0x40) p += 1 + b[p]!;
      if (flags & 0x20) p += 2;
      if (b[p] !== 0x04) return null;
      p++;
      readLen();
      return p < c.end ? b[p]! : null;
    }
  }
  return null;
}

export function parseMoov(moovBytes: Uint8Array): { tracks: ScannedTrack[]; fragmented: boolean } {
  const b = moovBytes;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const root = [...boxes(b, 0, b.length)].find((x) => x.type === "moov");
  if (!root) return { tracks: [], fragmented: false };
  const tracks: ScannedTrack[] = [];
  let fragmented = false;
  for (const trak of boxes(b, root.content, root.end)) {
    if (trak.type === "mvex") fragmented = true;
    if (trak.type !== "trak") continue;
    const t: ScannedTrack = {
      id: null, handler: null, sampleEntry: null, objectType: null, channels: null,
      sampleRate: null, sampleCount: null, timescale: null, durationSeconds: null, enabled: null,
    };
    const tkhd = child(b, trak, "tkhd");
    if (tkhd) {
      const version = b[tkhd.content]!;
      t.enabled = (dv.getUint32(tkhd.content) & 0x1) === 1;
      t.id = dv.getUint32(tkhd.content + (version === 1 ? 20 : 12));
    }
    const mdia = child(b, trak, "mdia");
    const hdlr = mdia && child(b, mdia, "hdlr");
    if (hdlr) t.handler = fourcc(b, hdlr.content + 8);
    const mdhd = mdia && child(b, mdia, "mdhd");
    if (mdhd) {
      const v = b[mdhd.content]!;
      const ts = dv.getUint32(mdhd.content + (v === 1 ? 20 : 12));
      const dur = v === 1 ? Number(dv.getBigUint64(mdhd.content + 24)) : dv.getUint32(mdhd.content + 16);
      t.timescale = ts;
      t.durationSeconds = ts > 0 ? dur / ts : null;
    }
    const stbl = path(b, mdia, "minf", "stbl");
    const stsd = stbl && child(b, stbl, "stsd");
    if (stsd) {
      const entry = [...boxes(b, stsd.content + 8, stsd.end)][0];
      if (entry) {
        t.sampleEntry = entry.type;
        if (t.handler === "soun" && entry.content + 28 <= entry.end) {
          t.channels = dv.getUint16(entry.content + 16);
          t.sampleRate = dv.getUint32(entry.content + 24) >>> 16;
          if (entry.type === "mp4a") t.objectType = esdsObjectType(b, entry);
        }
      }
    }
    const stsz = stbl && (child(b, stbl, "stsz") ?? child(b, stbl, "stz2"));
    if (stsz) t.sampleCount = dv.getUint32(stsz.content + 8);
    tracks.push(t);
  }
  return { tracks, fragmented };
}

/** Scans the file's box structure using slice reads only. */
export async function scanMp4(file: Blob, stats?: ReadStats): Promise<Mp4Scan> {
  const out: Mp4Scan = { brands: [], topLevel: [], moov: null, fragmented: false, tracks: [], error: null };
  try {
    let p = 0;
    while (p + 8 <= file.size && out.topLevel.length < MAX_TOP_LEVEL) {
      const h = await readFileRange(file, p, Math.min(file.size, p + 16), stats);
      const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      let size = dv.getUint32(0);
      const type = fourcc(h, 4);
      if (!/^[\x20-\x7e]{4}$/.test(type)) {
        out.error = `Not an MP4/MOV box at byte ${p}.`;
        break;
      }
      if (size === 1) size = Number(dv.getBigUint64(8));
      else if (size === 0) size = file.size - p;
      if (size < 8) {
        out.error = `Invalid box size at byte ${p}.`;
        break;
      }
      out.topLevel.push({ type, offset: p, size });
      if (type === "ftyp") {
        const f = await readFileRange(file, p, Math.min(p + size, p + 64), stats);
        out.brands.push(fourcc(f, 8));
        for (let i = 16; i + 4 <= f.length; i += 4) out.brands.push(fourcc(f, i));
      }
      if (type === "moof") out.fragmented = true;
      if (type === "moov") {
        out.moov = { offset: p, size };
        if (size > MAX_MOOV_BYTES) {
          out.error = `moov box is ${size} bytes — too large to scan.`;
        } else {
          const moov = await readFileRange(file, p, p + size, stats);
          const parsed = parseMoov(moov);
          out.tracks = parsed.tracks;
          out.fragmented = out.fragmented || parsed.fragmented;
        }
      }
      p += size;
    }
    if (!out.moov && !out.error) out.error = "No moov box found.";
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  out.brands = [...new Set(out.brands.filter((x) => /^[\x20-\x7e]{4}$/.test(x)))];
  return out;
}

/**
 * Tracks that declare audio and hold samples. In a fragmented MP4 the moov's
 * sample tables are empty by design (samples live in moof boxes), so any
 * declared audio track counts there.
 */
export function declaredAudioTracks(scan: Mp4Scan): ScannedTrack[] {
  return scan.tracks.filter(
    (t) => t.handler === "soun" && (scan.fragmented || t.sampleCount === null || t.sampleCount > 0),
  );
}
