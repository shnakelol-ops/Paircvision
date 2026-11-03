import { describe, expect, it, vi } from "vitest";
import {
  createLivePersister,
  eventSaveStatusFromResult,
  registerBackgroundFlush,
  shouldPersistLiveState,
  type LivePersistSnapshot,
} from "./pro-tagger-live-persistence";

const squad: readonly unknown[] = [];
function snap(over: Partial<LivePersistSnapshot> = {}): LivePersistSnapshot {
  return { events: [], matchState: "FIRST_HALF", half: 1, clockSeconds: 0, homeSquad: squad, awaySquad: squad, ...over };
}

describe("shouldPersistLiveState", () => {
  it("skips only a match that has not started and has no events", () => {
    expect(shouldPersistLiveState("PRE_MATCH", 0)).toBe(false);
    expect(shouldPersistLiveState("PRE_MATCH", 1)).toBe(true);
    expect(shouldPersistLiveState("FIRST_HALF", 0)).toBe(true);
    expect(shouldPersistLiveState("FULL_TIME", 0)).toBe(true);
  });
});

describe("createLivePersister", () => {
  it("writes every change immediately — five quick events are five writes, each holding all events so far", () => {
    const written: number[] = [];
    const p = createLivePersister((s) => { written.push(s.events.length); return true; });
    let events: readonly unknown[] = [];
    for (let i = 1; i <= 5; i++) {
      events = [...events, { id: i }];
      expect(p.persist(snap({ events, clockSeconds: 30 }))).toEqual({ wrote: true, ok: true });
    }
    expect(written).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not write an identical snapshot twice (visibilitychange + pagehide from one backgrounding)", () => {
    const write = vi.fn(() => true);
    const p = createLivePersister(write);
    const s = snap({ events: [{ id: 1 }], clockSeconds: 482 });
    p.persist(s);
    expect(p.persist({ ...s })).toEqual({ wrote: false, ok: true });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes again when only the clock, state, half or squads change", () => {
    const write = vi.fn(() => true);
    const p = createLivePersister(write);
    const s = snap({ events: [{ id: 1 }], clockSeconds: 100 });
    p.persist(s);
    p.persist({ ...s, clockSeconds: 101 });
    p.persist({ ...s, clockSeconds: 101, matchState: "HALF_TIME" });
    p.persist({ ...s, clockSeconds: 0, matchState: "SECOND_HALF", half: 2 });
    p.persist({ ...s, clockSeconds: 0, matchState: "SECOND_HALF", half: 2, homeSquad: [] });
    expect(write).toHaveBeenCalledTimes(5);
  });

  it("retries the same snapshot after a failed write, and reports the failure", () => {
    const write = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const p = createLivePersister(write);
    const s = snap({ events: [{ id: 1 }] });
    expect(p.persist(s)).toEqual({ wrote: true, ok: false });
    expect(p.persist(s)).toEqual({ wrote: true, ok: true });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("never writes a not-started match with no events", () => {
    const write = vi.fn(() => true);
    createLivePersister(write).persist(snap({ matchState: "PRE_MATCH" }));
    expect(write).not.toHaveBeenCalled();
  });
});

describe("registerBackgroundFlush", () => {
  function targets(visibility: string) {
    const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
    const win = new EventTarget();
    return { doc, win };
  }

  it("flushes when the page becomes hidden and on pagehide — not when it becomes visible", () => {
    const { doc, win } = targets("visible");
    const flush = vi.fn();
    registerBackgroundFlush(doc, win, flush);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(flush).not.toHaveBeenCalled();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("cleanup removes both listeners", () => {
    const { doc, win } = targets("hidden");
    const flush = vi.fn();
    const cleanup = registerBackgroundFlush(doc, win, flush);
    cleanup();
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("pagehide"));
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("eventSaveStatusFromResult", () => {
  it("is 'saved' only when the write succeeded", () => {
    expect(eventSaveStatusFromResult({ wrote: true, ok: true })).toBe("saved");
    expect(eventSaveStatusFromResult({ wrote: true, ok: false })).toBe("failed");
  });
});
