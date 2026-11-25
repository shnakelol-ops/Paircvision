// Montage Lab — guarantees strictly increasing, gap-free video timestamps
// inside a montage. The audit spike found one join (1 of 30) where a clip
// starting ~1 ms after a source frame boundary produced two frames with the
// same timestamp. This holds back one frame and sets its duration from its
// successor, so a frame clamped to a join never overlaps the next one, and a
// frame that would not move time forward is dropped.

export interface TimedItem {
  timestamp: number;
  duration: number;
}

/** Smallest frame duration kept (seconds); shorter slivers are dropped, not emitted. */
export const MIN_FRAME = 0.0005;

export class FrameSequencer<T extends TimedItem> {
  private pending: T | null = null;
  private lastEmitted = -Infinity;
  private readonly emit: (item: T) => void | Promise<void>;
  private readonly drop: (item: T) => void;

  constructor(emit: (item: T) => void | Promise<void>, drop: (item: T) => void = () => undefined) {
    this.emit = emit;
    this.drop = drop;
  }

  /** Pushes the next frame, already placed at its montage timestamp (≥ the clip's join point). */
  async push(item: T): Promise<void> {
    if (this.pending) {
      const gap = item.timestamp - this.pending.timestamp;
      if (gap < MIN_FRAME) {
        // The new frame doesn't move time forward: keep the earlier one, drop this one.
        this.drop(item);
        return;
      }
      this.pending.duration = gap;
      await this.release();
    }
    this.pending = item;
  }

  /** Ends a clip: the held frame lasts until `end` (the next join). */
  async flush(end: number): Promise<void> {
    if (!this.pending) return;
    const d = end - this.pending.timestamp;
    if (d < MIN_FRAME) {
      this.drop(this.pending);
      this.pending = null;
      return;
    }
    this.pending.duration = d;
    await this.release();
  }

  /** Drops anything held (cancel/failure). */
  discard(): void {
    if (this.pending) this.drop(this.pending);
    this.pending = null;
  }

  private async release(): Promise<void> {
    const item = this.pending!;
    this.pending = null;
    if (item.timestamp <= this.lastEmitted) {
      this.drop(item);
      return;
    }
    this.lastEmitted = item.timestamp;
    await this.emit(item);
  }
}
