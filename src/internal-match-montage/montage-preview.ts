// Match Montage V2 — sequential preview of montage items on ONE <video>
// element playing the source match. No rendering or encoding: it plays each
// item's range in order and jumps between them.
//
// Precision: browsers fire `timeupdate` only every ~250 ms, which would let up
// to a quarter-second of the gap between clips show. While playing, the
// controller checks the playhead every animation frame (~16 ms) instead; at an
// item's end it pauses, seeks to the next item's start and resumes once the
// seek completes, so frames from outside the montage are never shown.

export interface PreviewSegment {
  start: number;
  end: number;
}

/** The subset of HTMLVideoElement the controller uses (a fake in tests). */
export interface PreviewMedia {
  currentTime: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export type PreviewPhase = "idle" | "playing" | "paused" | "seeking" | "ended";

export interface PreviewState {
  index: number;
  phase: PreviewPhase;
  /** Seconds into the current item. */
  clipTime: number;
  clipDuration: number;
  /** Seconds into the whole montage. */
  montageTime: number;
  montageDuration: number;
  count: number;
}

export type FrameScheduler = (cb: () => void) => () => void;

const END_EPSILON = 0.03;
/** "Previous" restarts the current item if more than this far into it. */
export const RESTART_THRESHOLD = 2;

export const browserScheduler: FrameScheduler = (cb) => {
  const id = requestAnimationFrame(() => cb());
  return () => cancelAnimationFrame(id);
};

export class PreviewController {
  private segments: PreviewSegment[];
  private index = 0;
  private phase: PreviewPhase = "idle";
  /** Resume playback once the pending seek completes. */
  private resumeAfterSeek = false;
  private cancelTick: (() => void) | null = null;
  private readonly media: PreviewMedia;
  private readonly onChange: (s: PreviewState) => void;
  private readonly schedule: FrameScheduler;

  constructor(media: PreviewMedia, segments: PreviewSegment[], onChange: (s: PreviewState) => void, schedule: FrameScheduler = browserScheduler) {
    this.media = media;
    this.segments = segments;
    this.onChange = onChange;
    this.schedule = schedule;
  }

  /** New order or trims: keep the same position when possible, otherwise stop safely. */
  setSegments(segments: PreviewSegment[], keepIndex = this.index): void {
    const prev = this.segments[this.index];
    this.segments = segments;
    if (!segments.length) {
      this.stop();
      this.index = 0;
      this.phase = "idle";
      this.emit();
      return;
    }
    this.index = Math.min(Math.max(0, keepIndex), segments.length - 1);
    const cur = segments[this.index]!;
    if (prev && (prev.start !== cur.start || prev.end !== cur.end)) {
      const t = this.media.currentTime;
      if (t < cur.start || t >= cur.end) this.goTo(this.index, this.phase === "playing");
    }
    this.emit();
  }

  get state(): PreviewState {
    const seg = this.segments[this.index];
    const durations = this.segments.map((s) => s.end - s.start);
    const before = durations.slice(0, this.index).reduce((n, d) => n + d, 0);
    const clipDuration = seg ? seg.end - seg.start : 0;
    const clipTime = seg ? clamp(this.media.currentTime - seg.start, 0, clipDuration) : 0;
    return {
      index: this.index,
      phase: this.phase,
      clipTime,
      clipDuration,
      montageTime: before + clipTime,
      montageDuration: durations.reduce((n, d) => n + d, 0),
      count: this.segments.length,
    };
  }

  play(): void {
    if (!this.segments.length) return;
    if (this.phase === "ended") {
      this.goTo(0, true);
      return;
    }
    const seg = this.segments[this.index]!;
    const t = this.media.currentTime;
    if (t < seg.start - 0.05 || t >= seg.end - END_EPSILON) {
      this.goTo(this.index, true);
      return;
    }
    this.phase = "playing";
    void Promise.resolve(this.media.play()).catch(() => this.pause());
    this.startTicking();
    this.emit();
  }

  pause(): void {
    this.stop();
    this.media.pause();
    if (this.phase !== "ended" && this.phase !== "idle") this.phase = "paused";
    this.emit();
  }

  toggle(): void {
    if (this.phase === "playing" || (this.phase === "seeking" && this.resumeAfterSeek)) this.pause();
    else this.play();
  }

  next(): void {
    if (this.index < this.segments.length - 1) this.goTo(this.index + 1, this.isActive());
  }

  previous(): void {
    if (this.state.clipTime > RESTART_THRESHOLD || this.index === 0) this.goTo(this.index, this.isActive());
    else this.goTo(this.index - 1, this.isActive());
  }

  /** Jump to an item (e.g. tapped in the list); keeps playing if it was. */
  select(index: number): void {
    if (index >= 0 && index < this.segments.length) this.goTo(index, this.isActive());
  }

  /** Seek inside the current item only (scrubber), clamped to its range. */
  seekWithin(offset: number): void {
    const seg = this.segments[this.index];
    if (!seg) return;
    const wasActive = this.isActive();
    this.stop();
    this.media.pause();
    this.resumeAfterSeek = wasActive;
    this.phase = "seeking";
    this.media.currentTime = seg.start + clamp(offset, 0, Math.max(0, seg.end - seg.start - END_EPSILON * 2));
    this.emit();
    if (!this.media.seeking) this.onSeeked();
  }

  /** Call from the video's `seeked` event. */
  onSeeked(): void {
    if (this.phase !== "seeking") {
      this.emit();
      return;
    }
    if (this.resumeAfterSeek) {
      this.resumeAfterSeek = false;
      this.phase = "playing";
      void Promise.resolve(this.media.play()).catch(() => this.pause());
      this.startTicking();
    } else {
      this.phase = this.phase === "seeking" ? "paused" : this.phase;
    }
    this.emit();
  }

  /** Call from the video's `ended` event (source video ran out). */
  onMediaEnded(): void {
    if (this.phase === "playing") this.advance();
  }

  dispose(): void {
    this.stop();
  }

  private isActive(): boolean {
    return this.phase === "playing" || (this.phase === "seeking" && this.resumeAfterSeek);
  }

  private goTo(index: number, resume: boolean): void {
    const seg = this.segments[index];
    if (!seg) return;
    this.stop();
    this.media.pause();
    this.index = index;
    this.resumeAfterSeek = resume;
    this.phase = "seeking";
    this.media.currentTime = seg.start;
    this.emit();
    if (!this.media.seeking) this.onSeeked();
  }

  private advance(): void {
    if (this.index < this.segments.length - 1) {
      this.goTo(this.index + 1, true);
    } else {
      this.stop();
      this.media.pause();
      this.phase = "ended";
      this.emit();
    }
  }

  private tick = (): void => {
    this.cancelTick = null;
    if (this.phase !== "playing") return;
    const seg = this.segments[this.index];
    if (!seg) return;
    if (this.media.currentTime >= seg.end - END_EPSILON) {
      this.advance();
      return;
    }
    this.emit();
    this.cancelTick = this.schedule(this.tick);
  };

  private startTicking(): void {
    if (!this.cancelTick) this.cancelTick = this.schedule(this.tick);
  }

  private stop(): void {
    this.cancelTick?.();
    this.cancelTick = null;
  }

  private emit(): void {
    this.onChange(this.state);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
