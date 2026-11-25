// Pure text helpers for the Matchday Cover — no canvas, fully unit-tested.

/** Width of `text` rendered at `size` px in the caller's chosen font. */
export type MeasureText = (text: string, size: number) => number;

export interface FitOptions {
  maxWidth: number;
  maxSize: number;
  minSize: number;
  /** 1 or 2. Two lines are only used once one line would drop below `wrapBelow`. */
  maxLines?: 1 | 2;
  /** Font size under which a two-line break is preferred over shrinking. */
  wrapBelow?: number;
  step?: number;
  /**
   * Prefer breaking two lines right after this character (e.g. "," so
   * "Páirc Uí Chaoimh, Corcaigh" breaks at the comma) as long as that costs
   * at most `preferSlack` px of font size versus the best balanced break.
   */
  preferBreakAfter?: string;
  preferSlack?: number;
}

export interface FittedText {
  size: number;
  lines: string[];
  /** True when even the smallest size needed an ellipsis. */
  truncated: boolean;
}

const ELLIPSIS = "…";

/** Every way to break `text` into two lines at a space, most balanced first. */
function twoLineSplits(text: string): [string, string][] {
  const words = text.split(" ");
  if (words.length < 2) return [];
  const splits: [string, string][] = [];
  for (let i = 1; i < words.length; i++) {
    splits.push([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
  }
  return splits.sort(
    (a, b) => Math.abs(a[0].length - a[1].length) - Math.abs(b[0].length - b[1].length),
  );
}

/** Longest prefix of `text` + "…" that fits; never returns an empty string. */
export function ellipsize(measure: MeasureText, text: string, size: number, maxWidth: number): string {
  if (measure(text, size) <= maxWidth) return text;
  let lo = 1;
  let hi = text.length;
  let best = text.slice(0, 1) + ELLIPSIS;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid).trimEnd() + ELLIPSIS;
    if (measure(candidate, size) <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Largest size at which `text` fits `maxWidth`:
 *  1. one line, from maxSize down to wrapBelow;
 *  2. two balanced lines (at a space), from maxSize down to minSize;
 *  3. one line, from wrapBelow down to minSize (single long words);
 *  4. one ellipsized line at minSize — a cover never overflows its frame.
 */
export function fitText(measure: MeasureText, rawText: string, opts: FitOptions): FittedText {
  const text = rawText.replace(/\s+/g, " ").trim();
  const step = opts.step ?? 2;
  const maxLines = opts.maxLines ?? 1;
  const wrapBelow = Math.max(opts.minSize, Math.min(opts.maxSize, opts.wrapBelow ?? opts.minSize));
  if (!text) return { size: opts.maxSize, lines: [], truncated: false };

  for (let size = opts.maxSize; size >= wrapBelow; size -= step) {
    if (measure(text, size) <= opts.maxWidth) return { size, lines: [text], truncated: false };
  }
  if (maxLines === 2) {
    const fitsAt = (splits: [string, string][]): FittedText | null => {
      for (let size = opts.maxSize; size >= opts.minSize; size -= step) {
        const fit = splits.find(([a, b]) => measure(a, size) <= opts.maxWidth && measure(b, size) <= opts.maxWidth);
        if (fit) return { size, lines: [fit[0], fit[1]], truncated: false };
      }
      return null;
    };
    const splits = twoLineSplits(text);
    const balanced = fitsAt(splits);
    if (opts.preferBreakAfter) {
      const mark = opts.preferBreakAfter;
      const preferred = fitsAt(splits.filter(([a]) => a.endsWith(mark)));
      if (preferred && (!balanced || preferred.size >= balanced.size - (opts.preferSlack ?? 6))) return preferred;
    }
    if (balanced) return balanced;
  }
  for (let size = wrapBelow - step; size >= opts.minSize; size -= step) {
    if (measure(text, size) <= opts.maxWidth) return { size, lines: [text], truncated: false };
  }
  return { size: opts.minSize, lines: [ellipsize(measure, text, opts.minSize, opts.maxWidth)], truncated: true };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-25" → "Sun 25 Oct". Invalid/empty → "". Timezone-proof (UTC maths on a date-only value). */
export function formatCoverDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3])) return "";
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Irish GAA convention: "15:30" → "3.30pm", "14:00" → "2pm", "12:00" → "12pm". */
export function formatThrowIn(time: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return "";
  const h24 = Number(m[1]);
  const mins = m[2];
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "am" : "pm";
  return mins === "00" ? `${h12}${suffix}` : `${h12}.${mins}${suffix}`;
}
