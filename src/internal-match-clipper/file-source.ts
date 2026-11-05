// Reads the selected match File for Mediabunny with plain, short-lived
// `slice(start, end).arrayBuffer()` calls.
//
// Why not Mediabunny's BlobSource: on Chrome it reads through long-lived
// `blob.slice(pos).stream()` readers (up to 4 per Input) that stay open after
// the Input is disposed, alongside the <video> element reading the same file.
// It also reports a failed read only as "TypeError: network error". Slice
// reads are the path Mediabunny itself uses on WebKit, hold nothing open
// between reads, and surface the real DOMException (e.g. NotReadableError),
// which is what lets us tell a file-access failure apart from a codec or
// format problem. See PR #383 (Android field test R1).

export interface ReadFailure {
  /** DOMException / Error name, e.g. "NotReadableError". */
  name: string;
  message: string;
  /** Byte range that failed. */
  start: number;
  end: number;
  /** Whether a single retry was attempted (and also failed). */
  retried: boolean;
}

export interface ReadStats {
  reads: number;
  bytes: number;
  failure: ReadFailure | null;
}

export function newReadStats(): ReadStats {
  return { reads: 0, bytes: 0, failure: null };
}

/** Thrown into Mediabunny when the File can't be read; found again via ReadStats. */
export class SourceReadError extends Error {
  readonly failure: ReadFailure;
  constructor(failure: ReadFailure) {
    super(`${failure.name}: ${failure.message} (bytes ${failure.start}–${failure.end})`);
    this.name = "SourceReadError";
    this.failure = failure;
  }
}

function describe(err: unknown): { name: string; message: string } {
  if (err && typeof err === "object" && "name" in err) {
    const e = err as { name?: unknown; message?: unknown };
    return { name: String(e.name ?? "Error"), message: String(e.message ?? "") };
  }
  return { name: "Error", message: String(err) };
}

const RETRY_DELAY_MS = 150;

/** Reads [start, end) of the file, retrying once on a transient failure. */
export async function readFileRange(file: Blob, start: number, end: number, stats?: ReadStats): Promise<Uint8Array> {
  const attempt = async () => new Uint8Array(await file.slice(start, end).arrayBuffer());
  try {
    const data = await attempt();
    if (stats) {
      stats.reads++;
      stats.bytes += data.byteLength;
    }
    return data;
  } catch {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      const data = await attempt();
      if (stats) {
        stats.reads++;
        stats.bytes += data.byteLength;
      }
      return data;
    } catch (err) {
      const failure: ReadFailure = { ...describe(err), start, end, retried: true };
      if (stats && !stats.failure) stats.failure = failure;
      throw new SourceReadError(failure);
    }
  }
}

type Mediabunny = typeof import("mediabunny");

/** A Mediabunny Source over the File using slice reads; failures land in `stats`. */
export function createFileSource(mb: Mediabunny, file: Blob, stats: ReadStats) {
  return new mb.StreamSource({
    getSize: () => file.size,
    read: (start, end) => readFileRange(file, start, end, stats),
    prefetchProfile: "network",
    maxCacheSize: 16 * 1024 * 1024,
  });
}
