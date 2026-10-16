// Test-only recording CanvasRenderingContext2D. jsdom/node have no canvas,
// so this fakes just enough: state assignment, gradients, transforms (only
// translate is tracked — rotation/scale are ignored), and a deterministic
// measureText (0.55 × font size per character) so layout maths can be
// asserted. Follows the recording-context convention of the stats report
// tests (e.g. src/stats/reporting/playerInfluenceHeading.test.ts).

export interface TextCall {
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  width: number;
  /** Horizontal extent, honouring textAlign. */
  left: number;
  right: number;
}

export interface ImageCall {
  source: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHAR_WIDTH_FACTOR = 0.55;

export function fontSize(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

export function createRecordingContext() {
  const texts: TextCall[] = [];
  const images: ImageCall[] = [];
  const stack: { tx: number; ty: number }[] = [];
  let tx = 0;
  let ty = 0;
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const gradient = () => ({ addColorStop: () => undefined });

  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => {
      stack.push({ tx, ty });
    },
    restore: () => {
      const s = stack.pop();
      if (s) ({ tx, ty } = s);
    },
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    measureText: (text: string) => ({ width: [...text].length * fontSize(String(state.font)) * CHAR_WIDTH_FACTOR }),
    fillText: (text: string, x: number, y: number) => {
      const size = fontSize(String(state.font));
      const width = [...text].length * size * CHAR_WIDTH_FACTOR;
      const ax = x + tx;
      const align = state.textAlign ?? "start";
      const left = align === "center" ? ax - width / 2 : align === "right" || align === "end" ? ax - width : ax;
      texts.push({ text, x: ax, y: y + ty, size, font: String(state.font), width, left, right: left + width });
    },
    drawImage: (source: unknown, x: number, y: number, w: number, h: number) => {
      images.push({ source, x: x + tx, y: y + ty, w, h });
    },
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    getImageData: () => {
      throw new Error("not supported in tests");
    },
  };

  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in methods) return methods[prop];
      if (prop in target) return target[prop];
      return () => undefined; // beginPath, arc, fill, stroke, clip, rotate, scale, …
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  /** Tracked caps are drawn glyph by glyph; this rebuilds words from runs of
   * single characters on the same baseline. */
  function joinedText(): string[] {
    const out: string[] = [];
    let run = "";
    let runY: number | null = null;
    for (const t of texts) {
      if ([...t.text].length === 1 && (runY === null || runY === t.y)) {
        run += t.text;
        runY = t.y;
        continue;
      }
      if (run) out.push(run);
      run = "";
      runY = null;
      if ([...t.text].length === 1) {
        run = t.text;
        runY = t.y;
      } else {
        out.push(t.text);
      }
    }
    if (run) out.push(run);
    return out;
  }

  return { ctx, texts, images, joinedText };
}
