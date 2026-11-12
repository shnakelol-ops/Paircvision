// Montage Lab — memory and responsiveness indicators.
//
// Browsers on Android expose no documented API for total process memory. What
// this records, and how much weight each deserves:
//  - jsHeap: performance.memory (Chrome-only, non-standard, coarse). INDICATIVE
//    ONLY — it excludes video frames, codec buffers and file I/O buffers.
//  - stalls: gaps between animation frames. A long gap means the page's main
//    thread was blocked (GC pressure, heavy copies) — measurable everywhere.
//  - survival: whether the run finished without the tab being killed (see
//    lab-session run markers) — the definitive outcome on a phone.
//  - heldBytes: bytes the harness itself deliberately keeps in JS memory.

export interface MemorySample {
  t: number;
  jsHeapMB: number | null;
}

export interface MemorySummary {
  jsHeapApi: "performance.memory (indicative)" | "unavailable";
  jsHeapStartMB: number | null;
  jsHeapPeakMB: number | null;
  jsHeapEndMB: number | null;
  /** Longest gap between animation frames, ms. */
  longestStallMs: number;
  /** Gaps over 500 ms. */
  stallsOver500ms: number;
  samples: number;
}

type PerfWithMemory = Performance & { memory?: { usedJSHeapSize: number } };

export function jsHeapMB(): number | null {
  const m = (performance as PerfWithMemory).memory;
  return m && typeof m.usedJSHeapSize === "number" ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

export class MemoryMonitor {
  private samples: MemorySample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private lastFrame = 0;
  private longestStall = 0;
  private stalls = 0;
  private running = false;

  start(): void {
    this.samples = [];
    this.longestStall = 0;
    this.stalls = 0;
    this.running = true;
    this.samples.push({ t: performance.now(), jsHeapMB: jsHeapMB() });
    this.timer = setInterval(() => this.samples.push({ t: performance.now(), jsHeapMB: jsHeapMB() }), 1000);
    if (typeof requestAnimationFrame === "function") {
      this.lastFrame = performance.now();
      const tick = (now: number) => {
        if (!this.running) return;
        const gap = now - this.lastFrame;
        // Hidden tabs don't paint; only count stalls while visible.
        if (document.visibilityState === "visible") {
          this.longestStall = Math.max(this.longestStall, gap);
          if (gap > 500) this.stalls++;
        }
        this.lastFrame = now;
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  stop(): MemorySummary {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.raf);
    this.samples.push({ t: performance.now(), jsHeapMB: jsHeapMB() });
    const heaps = this.samples.map((s) => s.jsHeapMB).filter((v): v is number => v !== null);
    return {
      jsHeapApi: heaps.length ? "performance.memory (indicative)" : "unavailable",
      jsHeapStartMB: heaps[0] ?? null,
      jsHeapPeakMB: heaps.length ? Math.max(...heaps) : null,
      jsHeapEndMB: heaps.at(-1) ?? null,
      longestStallMs: Math.round(this.longestStall),
      stallsOver500ms: this.stalls,
      samples: this.samples.length,
    };
  }
}
