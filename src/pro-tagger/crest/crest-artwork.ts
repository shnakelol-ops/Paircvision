// Crest artwork for the Match Analysis renderers (Club Crest V1, Checkpoint 2).
//
// Loads and decodes the Home and Away club crests ONCE, before any page is
// drawn, so the synchronous canvas renderers never touch IndexedDB. The
// result is a fixed snapshot for one Match Analysis session: every page,
// team and HT / FT choice in that session draws the same crests, and the
// preview image is the exported image.
//
// Identity is the Saved Team id only (ProTaggerSquad.savedTeamId) — never a
// team name. No id, an unknown id, a missing / unreadable / corrupt crest, a
// failed or slow database read, or a failed or slow decode all give `null`
// for that side, which the renderers draw as the existing monogram. This
// module never throws and never blocks Match Analysis for longer than the
// timeout.
import { getDefaultCrestBackend, isCrestStorageSupported, loadClubCrest, type CrestBackend } from "./crest-store";

/** A decoded crest, ready for ctx.drawImage. */
export type CrestArtwork = {
  image: CanvasImageSource;
  /** Pixel size of the decoded image (its natural shape). */
  width: number;
  height: number;
  /** Dark artwork: draw a very subtle light glow behind it. */
  needsBacking: boolean;
  /** Changes whenever the stored crest changes ("teamId:updatedAt") — used in render cache keys. */
  key: string;
};

export type MatchCrests = { home: CrestArtwork | null; away: CrestArtwork | null };

export const NO_CRESTS: MatchCrests = Object.freeze({ home: null, away: null }) as MatchCrests;

export type LoadedMatchCrests = {
  crests: MatchCrests;
  /** Frees the decoded images. Safe to call more than once. */
  release: () => void;
};

export type DecodedCrest = { image: CanvasImageSource; width: number; height: number; release: () => void };
export type CrestDecoder = (blob: Blob) => Promise<DecodedCrest>;

/** How long one database read, and separately one decode, may take before the monogram is used. */
export const CREST_LOAD_TIMEOUT_MS = 2000;

/**
 * Decodes a stored crest PNG. createImageBitmap where available (no object
 * URL needed); otherwise an <img> from an object URL that is revoked as soon
 * as the image has loaded or failed.
 */
export async function decodeCrestBlob(blob: Blob): Promise<DecodedCrest> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Crest image could not be decoded"));
      img.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resolves to the value, or null on rejection or timeout. A value that arrives late is handed to `onLate`. */
function settleWithin<T>(promise: Promise<T>, ms: number, onLate?: (value: T) => void): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);
    }, ms);
    promise.then(
      (value) => {
        if (done) {
          onLate?.(value);
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export type LoadMatchCrestsOptions = {
  backend?: CrestBackend;
  decode?: CrestDecoder;
  timeoutMs?: number;
  storageSupported?: boolean;
};

/**
 * Loads the crests for a match's Home and Away Saved Team ids. When both
 * sides share an id, the crest is read and decoded once and shared.
 */
export async function loadMatchCrests(
  ids: { home?: string; away?: string },
  options: LoadMatchCrestsOptions = {},
): Promise<LoadedMatchCrests> {
  const decoded: DecodedCrest[] = [];
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const d of decoded) {
      try {
        d.release();
      } catch {
        // already released
      }
    }
  };
  const wanted = [ids.home, ids.away].filter((id): id is string => typeof id === "string" && id.length > 0);
  const supported = options.storageSupported ?? isCrestStorageSupported();
  if (wanted.length === 0 || !supported) return { crests: NO_CRESTS, release };

  const timeoutMs = options.timeoutMs ?? CREST_LOAD_TIMEOUT_MS;
  const decode = options.decode ?? decodeCrestBlob;
  let backend: CrestBackend;
  try {
    backend = options.backend ?? getDefaultCrestBackend();
  } catch {
    return { crests: NO_CRESTS, release };
  }

  const loadOne = async (teamId: string): Promise<CrestArtwork | null> => {
    try {
      const record = await settleWithin(loadClubCrest(teamId, backend), timeoutMs);
      if (!record) return null;
      const image = await settleWithin(decode(record.image), timeoutMs, (late) => late.release());
      if (!image) return null;
      if (released) {
        image.release();
        return null;
      }
      decoded.push(image);
      if (!(image.width > 0 && image.height > 0)) return null;
      return {
        image: image.image,
        width: image.width,
        height: image.height,
        needsBacking: record.needsBacking,
        key: `${teamId}:${record.updatedAt}`,
      };
    } catch {
      return null;
    }
  };

  const unique = [...new Set(wanted)];
  const loaded = new Map<string, CrestArtwork | null>();
  await Promise.all(unique.map(async (id) => loaded.set(id, await loadOne(id))));
  return {
    crests: {
      home: ids.home ? loaded.get(ids.home) ?? null : null,
      away: ids.away ? loaded.get(ids.away) ?? null : null,
    },
    release,
  };
}

/** Cache-key fragment for a crest snapshot: identical crests → identical key. */
export function crestsKey(crests: MatchCrests): string {
  return `${crests.home?.key ?? "-"}|${crests.away?.key ?? "-"}`;
}
