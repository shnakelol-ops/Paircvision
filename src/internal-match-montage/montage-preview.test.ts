import { describe, expect, it } from "vitest";
import { PreviewController, type PreviewMedia, type PreviewState } from "./montage-preview";

/** A fake video: seeks complete immediately unless `slowSeeks` is set; time advances only when told. */
class FakeVideo implements PreviewMedia {
  private t = 0;
  paused = true;
  seeking = false;
  slowSeeks = false;
  seeks: number[] = [];
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    this.seeks.push(v);
    if (this.slowSeeks) this.seeking = true;
  }
  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  /** Simulates playback time passing (only while playing). */
  advance(seconds: number) {
    if (!this.paused && !this.seeking) this.t += seconds;
  }
  finishSeek() {
    this.seeking = false;
  }
}

function setup(segments = [{ start: 10, end: 16 }, { start: 100, end: 108 }, { start: 50, end: 53 }]) {
  const video = new FakeVideo();
  const states: PreviewState[] = [];
  let pending: (() => void) | null = null;
  const schedule = (cb: () => void) => {
    pending = cb;
    return () => {
      if (pending === cb) pending = null;
    };
  };
  const ctl = new PreviewController(video, segments, (s) => states.push(s), schedule);
  /** Runs animation frames, letting `step` seconds of video play between each. */
  const frames = (n: number, step = 1 / 60) => {
    for (let i = 0; i < n && pending; i++) {
      video.advance(step);
      const cb = pending;
      pending = null;
      cb();
    }
  };
  return { video, ctl, states, frames, last: () => states.at(-1)! };
}

describe("PreviewController", () => {
  it("plays every item in the chosen order and stops at the end of the last one", () => {
    const { video, ctl, frames, last } = setup();
    ctl.play();
    expect(video.seeks).toEqual([10]);
    frames(400); // 6 s of clip 1
    expect(last().index).toBe(1);
    expect(video.seeks).toEqual([10, 100]);
    frames(500); // 8 s of clip 2
    expect(last().index).toBe(2);
    expect(video.seeks.at(-1)).toBe(50);
    frames(200);
    expect(last().phase).toBe("ended");
    expect(video.paused).toBe(true);
    expect(last().montageDuration).toBe(17);
  });

  it("never plays past an item's end: the jump happens within one frame of the boundary", () => {
    const { video, ctl, frames, last } = setup([{ start: 10, end: 12 }, { start: 40, end: 42 }]);
    ctl.play();
    let maxOvershoot = 0;
    for (let i = 0; i < 150; i++) {
      const before = last().index;
      frames(1);
      if (last().index === before && before === 0) maxOvershoot = Math.max(maxOvershoot, video.currentTime - 12);
    }
    expect(maxOvershoot).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(video.seeks).toContain(40);
  });

  it("shows a seeking phase between clips and resumes only when the seek completes", () => {
    const { video, ctl, frames, last } = setup();
    video.slowSeeks = true;
    ctl.play();
    expect(last().phase).toBe("seeking");
    expect(video.paused).toBe(true); // never plays from the old position
    video.finishSeek();
    ctl.onSeeked();
    expect(last().phase).toBe("playing");
    expect(video.paused).toBe(false);
    frames(400);
    expect(last()).toMatchObject({ index: 1, phase: "seeking" });
    video.finishSeek();
    ctl.onSeeked();
    expect(last()).toMatchObject({ index: 1, phase: "playing" });
  });

  it("next and previous; previous restarts the current item when well into it", () => {
    const { video, ctl, frames, last } = setup();
    ctl.play();
    ctl.next();
    expect(last()).toMatchObject({ index: 1, phase: "playing" });
    frames(60); // 1 s in
    ctl.previous();
    expect(last().index).toBe(0); // < 2 s in → previous item
    frames(240); // 4 s in
    ctl.previous();
    expect(last().index).toBe(0); // > 2 s in → restart current
    expect(video.currentTime).toBe(10);
    ctl.next();
    ctl.next();
    ctl.next(); // already last — stays
    expect(last().index).toBe(2);
  });

  it("play/pause toggles, and play after the end starts again from the first item", () => {
    const { video, ctl, frames, last } = setup([{ start: 5, end: 6 }]);
    ctl.toggle();
    expect(last().phase).toBe("playing");
    ctl.toggle();
    expect(last().phase).toBe("paused");
    expect(video.paused).toBe(true);
    ctl.play();
    frames(120);
    expect(last().phase).toBe("ended");
    ctl.play();
    expect(video.seeks.at(-1)).toBe(5);
    expect(last()).toMatchObject({ index: 0, phase: "playing" });
  });

  it("seeks within the current item only, clamped to its range, and keeps playing if it was", () => {
    const { video, ctl, last } = setup();
    ctl.play();
    ctl.seekWithin(3);
    expect(video.currentTime).toBe(13);
    expect(last()).toMatchObject({ phase: "playing", clipTime: 3 });
    ctl.seekWithin(999);
    expect(video.currentTime).toBeLessThan(16);
    ctl.seekWithin(-5);
    expect(video.currentTime).toBe(10);
    ctl.pause();
    ctl.seekWithin(2);
    expect(last()).toMatchObject({ phase: "paused", clipTime: 2 });
  });

  it("reports position within the clip and within the whole montage", () => {
    const { ctl, frames, last } = setup();
    ctl.select(1);
    ctl.play();
    frames(120); // 2 s into item 2
    expect(last().clipTime).toBeCloseTo(2, 1);
    expect(last().montageTime).toBeCloseTo(6 + 2, 1);
    expect(last().count).toBe(3);
  });

  it("follows reordering and trimming without playing outside the new range", () => {
    const { video, ctl, last } = setup();
    ctl.select(1);
    ctl.setSegments([{ start: 10, end: 16 }, { start: 103, end: 108 }, { start: 50, end: 53 }]);
    expect(video.currentTime).toBe(103); // old position (100) is now outside the trimmed item
    ctl.setSegments([{ start: 50, end: 53 }]);
    expect(last().index).toBe(0);
    ctl.setSegments([]);
    expect(last()).toMatchObject({ phase: "idle", count: 0 });
  });
});
