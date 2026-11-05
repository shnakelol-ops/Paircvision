import { isClipCategory, type ClipCategory } from "./clip-types";

/**
 * Parses MM:SS or HH:MM:SS (optional fractional seconds, e.g. 25:30.5).
 * MM:SS allows minutes past 59 ("77:12"), as coaches read match clocks that way.
 * Returns seconds, or null when the text isn't a valid timestamp.
 */
export function parseTimestamp(text: string): number | null {
  const m = /^\s*(\d{1,3})(?::(\d{2}))?:(\d{2}(?:\.\d{1,3})?)\s*$/.exec(text);
  if (!m) return null;
  const hasHours = m[2] !== undefined;
  const first = Number(m[1]);
  const middle = hasHours ? Number(m[2]) : 0;
  const secs = Number(m[3]);
  if (!Number.isFinite(secs) || secs >= 60) return null;
  if (hasHours) {
    if (middle >= 60) return null;
    return first * 3600 + middle * 60 + secs;
  }
  return first * 60 + secs;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "25:29" or "1:02:03" — whole seconds, for labels. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/** "25:29.4" — tenths, for clip boundaries. */
export function formatPrecise(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const whole = Math.floor(tenths / 10);
  return `${formatClock(whole)}.${tenths % 10}`;
}

export interface TimestampDefaults {
  /** Seconds before the timestamp the clip starts. Default 1. */
  preRoll: number;
  /** Clip length in seconds. Default 6. */
  duration: number;
  category: ClipCategory;
}

export const DEFAULT_TIMESTAMP_SETTINGS: TimestampDefaults = { preRoll: 1, duration: 6, category: "other" };

export interface ParsedTimestampEntry {
  /** 1-based line number in the pasted text. */
  line: number;
  timestamp: number;
  start: number;
  end: number;
  category: ClipCategory;
  /** Label text after the timestamp (and category word), or "" when none. */
  label: string;
}

export interface TimestampParseError {
  line: number;
  text: string;
  reason: string;
}

const CATEGORY_WORDS: Record<string, ClipCategory> = {
  score: "score",
  hit: "hit",
  tackle: "hit",
  "hit/tackle": "hit",
  kickout: "kickout",
  "kick-out": "kickout",
  celebration: "celebration",
  other: "other",
};

const TIMESTAMP_TOKEN = /^\d{1,3}(?::\d{2})?:\d{2}(?:\.\d{1,3})?$/;

/**
 * Parses a pasted list. Each line is a timestamp optionally followed by a
 * category word and/or a label, e.g. "25:30 score Conor point". A line holding
 * only timestamps separated by commas/spaces ("12:04, 25:30, 41:10") expands
 * to one clip per timestamp. Lines that can't be read are reported, never
 * silently dropped. Blank lines are ignored.
 */
export function parseTimestampList(
  text: string,
  defaults: TimestampDefaults,
  sourceDuration: number | null,
): { entries: ParsedTimestampEntry[]; errors: TimestampParseError[] } {
  const entries: ParsedTimestampEntry[] = [];
  const errors: TimestampParseError[] = [];
  const preRoll = Math.max(0, defaults.preRoll);
  const length = Math.max(0.5, defaults.duration);

  const push = (line: number, raw: string, ts: number, category: ClipCategory, label: string) => {
    if (sourceDuration !== null && ts >= sourceDuration) {
      errors.push({ line, text: raw, reason: "After the end of the video" });
      return;
    }
    const start = Math.max(0, ts - preRoll);
    let end = start + length;
    if (sourceDuration !== null && end > sourceDuration) end = sourceDuration;
    if (end - start < 0.5) {
      errors.push({ line, text: raw, reason: "Too close to the end of the video" });
      return;
    }
    entries.push({ line, timestamp: ts, start, end, category, label });
  };

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const tokens = trimmed.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => TIMESTAMP_TOKEN.test(t))) {
      for (const t of tokens) {
        const ts = parseTimestamp(t);
        if (ts === null) errors.push({ line, text: t, reason: "Not a valid time" });
        else push(line, t, ts, defaults.category, "");
      }
      return;
    }

    const m = /^(\S+)\s*(.*)$/.exec(trimmed);
    const tsText = (m?.[1] ?? trimmed).replace(/[-–—,;|]+$/, "");
    const ts = parseTimestamp(tsText);
    if (ts === null) {
      errors.push({ line, text: trimmed, reason: "Start the line with a time like 25:30 or 1:02:03" });
      return;
    }
    let rest = (m?.[2] ?? "").replace(/^[-–—,;|:\s]+/, "").trim();
    let category = defaults.category;
    const firstWord = /^(\S+)\s*[-–—,;|:]?\s*(.*)$/.exec(rest);
    if (firstWord) {
      const word = firstWord[1]!.toLowerCase().replace(/[.,;:]+$/, "");
      const mapped = CATEGORY_WORDS[word];
      if (mapped && isClipCategory(mapped)) {
        category = mapped;
        rest = firstWord[2]!.trim();
      }
    }
    push(line, trimmed, ts, category, rest.slice(0, 80));
  });

  return { entries, errors };
}
