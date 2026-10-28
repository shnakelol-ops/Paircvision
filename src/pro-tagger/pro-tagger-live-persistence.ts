/**
 * pro-tagger-live-persistence.ts
 *
 * When the live Event Stats screen writes the match to storage.
 *
 * Every committed change — a completed event, Undo, Half Time, Start Second
 * Half, Full Time, a live Review edit/delete, a substitution, a manual clock
 * pause/resume — is written immediately, not after a debounce: a debounce
 * leaves a window in which the screen shows the event but storage does not
 * hold it, and a run of quick events keeps pushing that window back. When the
 * page is hidden (app switch, screen lock, recents/task switcher) or being
 * unloaded, the current state is flushed again so the latest match clock is
 * stored too. Mobile browsers do not reliably fire `beforeunload`;
 * `visibilitychange` → hidden is the last event they reliably deliver before
 * a backgrounded tab can be frozen or discarded, and `pagehide` covers
 * browsers/navigations that skip it.
 *
 * Writes are synchronous (localStorage) and each one carries the complete
 * match, so a later write can never lose an earlier event. A snapshot
 * identical to the last successful write is not written again (e.g. the
 * `visibilitychange` + `pagehide` pair fired by one backgrounding).
 *
 * Framework-free so it is directly testable; ProTaggerLiveScreen owns the
 * refs it reads and the storage call it makes.
 */

export type LiveMatchState = "PRE_MATCH" | "FIRST_HALF" | "HALF_TIME" | "SECOND_HALF" | "FULL_TIME";

/** Everything a live write depends on. Arrays are compared by identity. */
export type LivePersistSnapshot = {
  events: readonly unknown[];
  matchState: LiveMatchState;
  half: 1 | 2;
  clockSeconds: number;
  homeSquad: readonly unknown[];
  awaySquad: readonly unknown[];
};

/** wrote = a write was attempted; ok = it succeeded (true when nothing needed writing). */
export type LivePersistResult = { wrote: boolean; ok: boolean };

/** A match that has not started and has no events is not stored (unchanged rule). */
export function shouldPersistLiveState(matchState: LiveMatchState, eventCount: number): boolean {
  return !(matchState === "PRE_MATCH" && eventCount === 0);
}

function sameSnapshot(a: LivePersistSnapshot, b: LivePersistSnapshot): boolean {
  return (
    a.events === b.events &&
    a.matchState === b.matchState &&
    a.half === b.half &&
    a.clockSeconds === b.clockSeconds &&
    a.homeSquad === b.homeSquad &&
    a.awaySquad === b.awaySquad
  );
}

export function createLivePersister(write: (snapshot: LivePersistSnapshot) => boolean) {
  let lastWritten: LivePersistSnapshot | null = null;
  return {
    persist(snapshot: LivePersistSnapshot): LivePersistResult {
      if (!shouldPersistLiveState(snapshot.matchState, snapshot.events.length)) return { wrote: false, ok: true };
      if (lastWritten && sameSnapshot(lastWritten, snapshot)) return { wrote: false, ok: true };
      const ok = write(snapshot);
      // Only a successful write may suppress the next identical one — after a
      // failure the same snapshot is retried.
      lastWritten = ok ? snapshot : null;
      return { wrote: true, ok };
    },
  };
}

type ListenerTarget = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/**
 * Calls `flush` when the page becomes hidden or is being hidden/unloaded.
 * Returns the cleanup that removes both listeners.
 */
export function registerBackgroundFlush(
  doc: ListenerTarget & { visibilityState: string },
  win: ListenerTarget,
  flush: () => void,
): () => void {
  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") flush();
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);
  win.addEventListener("pagehide", flush);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    win.removeEventListener("pagehide", flush);
  };
}

/**
 * State of the "Event saved" confirmation for the event just placed:
 * pending until its write has run, then saved or failed. The confirmation
 * text is only ever shown for "saved".
 */
export type EventSaveStatus = "pending" | "saved" | "failed";

export function eventSaveStatusFromResult(result: LivePersistResult): EventSaveStatus {
  return result.ok ? "saved" : "failed";
}
