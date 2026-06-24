import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import { createBasicRouteFollowSession, type BasicRouteFollowSession } from "../movement/basic-route-follow";
import { sampleRoutePoints } from "../routes/route-sampling";
import type {
  MovementPlaybackSpeed,
  MovementPlaybackState,
  MovementSegment,
  TacticalPassEvent,
  TacticalShotEvent,
} from "../shell/types";

const BASIC_ROUTE_FOLLOW_SPEED = 22;

const PLAYBACK_SPEED_MULTIPLIER: Record<MovementPlaybackSpeed, number> = {
  slow: 0.75,
  normal: 1,
  fast: 1.3,
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ComputedSegment = {
  segmentId: string;
  playerId: string;
  resolvedStartMs: number;
  resolvedEndMs: number;
  baseDurationMs: number;
  sampledPoints: NormalizedPoint[];
  targetPoint: NormalizedPoint;
  session: BasicRouteFollowSession | null;
  started: boolean;
  completed: boolean;
};

type ComputedPassEvent = {
  passId: string;
  fromPlayerId: string;
  toPlayerId: string;
  resolvedAtMs: number;
  fired: boolean;
};

type ActiveShotRun = {
  shotId: string;
  shooterId: string;
  remainingMs: number;
};

type PendingShotRun = {
  shotId: string;
  shooterId: string;
  delayMs: number;
};

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type TimelineEngineCallbacks = {
  onPlaybackReset: (tokenId: string, startPosition: NormalizedPoint) => void;
  onTokenStep: (tokenId: string, position: NormalizedPoint) => void;
  onStateChange: (state: MovementPlaybackState) => void;
  /** Returns all segments to animate (main routes synthesised from routeByTokenId + extra segments). */
  getSegments: () => readonly MovementSegment[];
  getStartPosition: (tokenId: string) => NormalizedPoint | null;
  getPassEvents: () => readonly TacticalPassEvent[];
  onPassStart: (fromPlayerId: string, toPlayerId: string) => void;
  getShotEvents: () => readonly TacticalShotEvent[];
  onShotStart: (shooterId: string) => void;
};

export type TimelineEngine = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: (opts?: { keepPausedState?: boolean }) => void;
  step: (deltaMs: number) => void;
  seek: (ms: number) => void;
  getPlayheadMs: () => number;
  getDurationMs: () => number;
  isLocked: () => boolean;
  hasActiveRuns: () => boolean;
  getState: () => MovementPlaybackState;
  setSpeed: (speed: MovementPlaybackSpeed) => void;
  setSpeedMultiplier: (n: number) => void;
  getSpeed: () => MovementPlaybackSpeed;
  /** Called by the shell when a pass arc lands; promotes pending shots for that player. */
  notifyPassLanded: (receiverId: string) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTotalLength(pts: ReadonlyArray<NormalizedPoint>): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function clonePoint(p: NormalizedPoint): NormalizedPoint {
  return { x: p.x, y: p.y };
}

/**
 * Build ComputedSegments and resolve triggeredBy chains.
 *
 * Segments with triggeredBy are assigned resolvedStartMs = endMs of the last
 * segment belonging to the referenced player.  Multiple resolution passes
 * handle chains (A triggers B triggers C) up to a cycle-safe limit.
 */
function buildComputedSegments(segments: readonly MovementSegment[]): ComputedSegment[] {
  type Raw = ComputedSegment & { rawStartMs: number; triggeredBy?: string };

  const computed: Raw[] = segments.map((seg) => {
    const sampled = sampleRoutePoints(seg.points);
    const length = computeTotalLength(sampled);
    const baseDurationMs = length > 0 ? (length / BASIC_ROUTE_FOLLOW_SPEED) * 1000 : 0;
    const firstPt = sampled[0] ?? { x: 50, y: 50 };
    return {
      segmentId: seg.id,
      playerId: seg.playerId,
      rawStartMs: seg.startMs,
      triggeredBy: seg.triggeredBy,
      resolvedStartMs: seg.startMs,
      resolvedEndMs: seg.startMs + baseDurationMs,
      baseDurationMs,
      sampledPoints: sampled,
      targetPoint: clonePoint(firstPt),
      session: null,
      started: false,
      completed: baseDurationMs === 0,
    };
  });

  // Iteratively resolve triggeredBy.  Each pass re-computes endMs per player
  // and updates triggered segments.  Converges in ≤ chain-length passes.
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;

    const playerEndMs = new Map<string, number>();
    for (const seg of computed) {
      const cur = playerEndMs.get(seg.playerId) ?? 0;
      playerEndMs.set(seg.playerId, Math.max(cur, seg.resolvedEndMs));
    }

    for (const seg of computed) {
      if (!seg.triggeredBy) continue;
      const trigEnd = playerEndMs.get(seg.triggeredBy) ?? 0;
      if (seg.resolvedStartMs !== trigEnd) {
        seg.resolvedStartMs = trigEnd;
        seg.resolvedEndMs = trigEnd + seg.baseDurationMs;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return computed;
}

/**
 * Build ComputedPassEvents, resolving triggeredBy to an absolute atMs.
 * Pass triggeredBy references the playerId whose last segment end fires the pass.
 */
function buildComputedPassEvents(
  passEvents: readonly TacticalPassEvent[],
  computedSegments: ComputedSegment[],
): ComputedPassEvent[] {
  const playerEndMs = new Map<string, number>();
  for (const seg of computedSegments) {
    const cur = playerEndMs.get(seg.playerId) ?? 0;
    playerEndMs.set(seg.playerId, Math.max(cur, seg.resolvedEndMs));
  }

  return passEvents.map((pass) => ({
    passId: pass.id,
    fromPlayerId: pass.fromPlayerId,
    toPlayerId: pass.toPlayerId,
    resolvedAtMs: pass.triggeredBy
      ? (playerEndMs.get(pass.triggeredBy) ?? 0)
      : (pass.delayMs ?? 0),
    fired: false,
  }));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTimelineEngine(
  initialSpeed: MovementPlaybackSpeed,
  callbacks: TimelineEngineCallbacks,
): TimelineEngine {
  let isPlaying = false;
  let isPaused = false;
  let playbackSpeed = initialSpeed;
  let speedMultiplier = PLAYBACK_SPEED_MULTIPLIER[initialSpeed];
  let playheadMs = 0;
  let totalDurationMs = 0;

  let computedSegments: ComputedSegment[] = [];
  let computedPassEvents: ComputedPassEvent[] = [];
  let activeShotRuns = new Map<string, ActiveShotRun>();
  let pendingShotRuns = new Map<string, PendingShotRun>();

  const emitState = () => callbacks.onStateChange({ isPlaying, isPaused });

  // ── Build ──────────────────────────────────────────────────────────────────

  const buildTimeline = () => {
    computedSegments = buildComputedSegments(callbacks.getSegments());
    computedPassEvents = buildComputedPassEvents(callbacks.getPassEvents(), computedSegments);

    activeShotRuns = new Map();
    pendingShotRuns = new Map();
    for (const shot of callbacks.getShotEvents()) {
      pendingShotRuns.set(shot.id, { shotId: shot.id, shooterId: shot.shooterId, delayMs: shot.delayMs });
    }

    let maxEnd = 0;
    for (const seg of computedSegments) {
      maxEnd = Math.max(maxEnd, seg.resolvedEndMs);
    }
    totalDurationMs = maxEnd;
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const cancelAllSessions = () => {
    for (const seg of computedSegments) {
      seg.session?.cancel();
      seg.session = null;
    }
  };

  const stop = (opts?: { keepPausedState?: boolean }) => {
    cancelAllSessions();
    computedSegments = [];
    computedPassEvents = [];
    activeShotRuns.clear();
    pendingShotRuns.clear();
    isPlaying = false;
    if (!(opts?.keepPausedState ?? false)) isPaused = false;
    playheadMs = 0;
    emitState();
  };

  const start = () => {
    if (isPlaying) return;

    // Resume from pause if there is active work
    if (isPaused && computedSegments.some((s) => s.started && !s.completed)) {
      isPaused = false;
      isPlaying = true;
      emitState();
      return;
    }

    isPaused = false;
    playheadMs = 0;
    buildTimeline();

    const hasWork =
      computedSegments.length > 0 ||
      computedPassEvents.length > 0 ||
      pendingShotRuns.size > 0;

    if (!hasWork) {
      emitState();
      return;
    }

    // Snap all tokens with segments to their initial positions before playback.
    // Tokens with no segments are untouched (they stay where the coach placed them).
    const seenPlayers = new Set<string>();
    for (const seg of computedSegments) {
      if (seenPlayers.has(seg.playerId)) continue;
      seenPlayers.add(seg.playerId);
      // Use board position as reset anchor; individual segments handle their own first-point snap.
      const startPos = callbacks.getStartPosition(seg.playerId);
      if (startPos) callbacks.onPlaybackReset(seg.playerId, startPos);
    }

    isPlaying = true;
    emitState();
  };

  const pause = () => {
    if (!isPlaying) return;
    // Keep sessions alive — resume() will continue them from their internal state.
    isPlaying = false;
    isPaused = true;
    emitState();
  };

  const resume = () => {
    if (!isPaused) return;
    isPaused = false;
    isPlaying = true;
    emitState();
  };

  // ── Seek ───────────────────────────────────────────────────────────────────

  /**
   * Jump the timeline to an absolute ms.  Uses linear interpolation along the
   * sampled path (no ease-in-out), which is approximate but sufficient for
   * reset (seek(0)) and future scrubbing.  Live playback is always exact.
   */
  const seek = (ms: number) => {
    const clamped = Math.max(0, Math.min(totalDurationMs > 0 ? totalDurationMs : ms, ms));
    playheadMs = clamped;

    for (const seg of computedSegments) {
      // Cancel any live session — positions will be overwritten
      seg.session?.cancel();
      seg.session = null;

      const pts = seg.sampledPoints;

      if (playheadMs < seg.resolvedStartMs || pts.length === 0) {
        // Before this segment: reset to its start point
        const pt = pts[0];
        if (pt) {
          seg.targetPoint = clonePoint(pt);
          callbacks.onPlaybackReset(seg.playerId, pt);
        }
        seg.started = false;
        seg.completed = false;
        continue;
      }

      if (playheadMs >= seg.resolvedEndMs) {
        // After this segment: snap to end
        const pt = pts[pts.length - 1];
        if (pt) {
          seg.targetPoint = clonePoint(pt);
          callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(pt));
        }
        seg.started = true;
        seg.completed = true;
        continue;
      }

      // Within the segment: linear interpolation along sampled path
      const t = seg.baseDurationMs > 0
        ? (playheadMs - seg.resolvedStartMs) / seg.baseDurationMs
        : 0;
      const idx = t * (pts.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(Math.ceil(idx), pts.length - 1);
      const f = idx - lo;
      const a = pts[lo] ?? pts[0]!;
      const b = pts[hi] ?? pts[pts.length - 1]!;
      const pos = clampNormalizedPoint({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      seg.targetPoint = pos;
      callbacks.onTokenStep(seg.playerId, pos);
      seg.started = true;
      seg.completed = false;
    }
  };

  // ── Step (per-frame) ───────────────────────────────────────────────────────

  const step = (deltaMs: number) => {
    if (!isPlaying) return;

    const scaledDelta = deltaMs * speedMultiplier;
    const prevPlayheadMs = playheadMs;
    playheadMs += scaledDelta;

    // 1. Activate segments whose resolvedStartMs has been reached this tick.
    for (const seg of computedSegments) {
      if (seg.started) continue;
      if (playheadMs < seg.resolvedStartMs) continue;

      // Snap to this segment's first point.
      const firstPt = seg.sampledPoints[0];
      if (firstPt) {
        seg.targetPoint = clonePoint(firstPt);
        callbacks.onPlaybackReset(seg.playerId, firstPt);
      }

      seg.started = true;

      if (seg.baseDurationMs === 0 || seg.sampledPoints.length < 2) {
        // Zero-length: immediately at end
        const lastPt = seg.sampledPoints[seg.sampledPoints.length - 1];
        if (lastPt) {
          seg.targetPoint = clonePoint(lastPt);
          callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(lastPt));
        }
        seg.completed = true;
        continue;
      }

      seg.session = createBasicRouteFollowSession({
        target: seg.targetPoint,
        route: seg.sampledPoints,
        speed: BASIC_ROUTE_FOLLOW_SPEED,
      });

      // If the segment activated partway through this tick, burn off the
      // amount of time that has already elapsed since its resolvedStartMs.
      const msIntoSegment = Math.min(playheadMs - seg.resolvedStartMs, scaledDelta);
      if (msIntoSegment > 0 && seg.session.isActive()) {
        seg.session.step(msIntoSegment);
        if (!seg.session.isActive()) {
          seg.completed = true;
          seg.session = null;
          const lastPt = seg.sampledPoints[seg.sampledPoints.length - 1];
          if (lastPt) callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(lastPt));
        } else {
          callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(seg.targetPoint));
        }
      }
    }

    // 2. Step still-active sessions.
    for (const seg of computedSegments) {
      if (!seg.started || seg.completed || !seg.session?.isActive()) continue;
      seg.session.step(scaledDelta);
      callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(seg.targetPoint));
    }

    // 3. Complete sessions that finished this tick.
    for (const seg of computedSegments) {
      if (!seg.started || seg.completed) continue;
      if (seg.session && !seg.session.isActive()) {
        seg.completed = true;
        seg.session = null;
        const lastPt = seg.sampledPoints[seg.sampledPoints.length - 1];
        if (lastPt) callbacks.onTokenStep(seg.playerId, clampNormalizedPoint(lastPt));
      }
    }

    // 4. Fire pass events whose resolvedAtMs was crossed this tick.
    for (const pass of computedPassEvents) {
      if (pass.fired) continue;
      if (prevPlayheadMs <= pass.resolvedAtMs && playheadMs > pass.resolvedAtMs) {
        callbacks.onPassStart(pass.fromPlayerId, pass.toPlayerId);
        pass.fired = true;
      } else if (pass.resolvedAtMs === 0 && prevPlayheadMs === 0 && playheadMs > 0) {
        // Edge: t=0 events fire on the very first tick
        callbacks.onPassStart(pass.fromPlayerId, pass.toPlayerId);
        pass.fired = true;
      }
    }

    // 5. Advance active shot countdown timers.
    const firedShotIds: string[] = [];
    for (const run of activeShotRuns.values()) {
      run.remainingMs = Math.max(0, run.remainingMs - scaledDelta);
      if (run.remainingMs <= 0) {
        callbacks.onShotStart(run.shooterId);
        firedShotIds.push(run.shotId);
      }
    }
    for (const id of firedShotIds) activeShotRuns.delete(id);

    // 6. Stop when all work is done.
    const segsDone = computedSegments.every((s) => s.completed);
    const passesDone = computedPassEvents.every((p) => p.fired);
    const shotsDone = activeShotRuns.size === 0 && pendingShotRuns.size === 0;

    if (segsDone && passesDone && shotsDone) {
      isPlaying = false;
      isPaused = false;
      playheadMs = totalDurationMs;
      emitState();
    }
  };

  // ── Pass-landed notification (shots) ──────────────────────────────────────

  const notifyPassLanded = (receiverId: string) => {
    if (!isPlaying) return;
    const toPromote: PendingShotRun[] = [];
    for (const pending of pendingShotRuns.values()) {
      if (pending.shooterId === receiverId) toPromote.push(pending);
    }
    for (const pending of toPromote) {
      pendingShotRuns.delete(pending.shotId);
      if (pending.delayMs <= 0) {
        callbacks.onShotStart(pending.shooterId);
      } else {
        activeShotRuns.set(pending.shotId, {
          shotId: pending.shotId,
          shooterId: pending.shooterId,
          remainingMs: pending.delayMs,
        });
      }
    }
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    start,
    pause,
    resume,
    stop,
    step,
    seek,
    getPlayheadMs: () => playheadMs,
    getDurationMs: () => totalDurationMs,
    isLocked: () => isPlaying || isPaused,
    hasActiveRuns: () =>
      (isPlaying || isPaused) &&
      (computedSegments.some((s) => s.started && !s.completed) ||
        computedPassEvents.some((p) => !p.fired) ||
        activeShotRuns.size > 0 ||
        pendingShotRuns.size > 0),
    getState: () => ({ isPlaying, isPaused }),
    setSpeed: (speed) => {
      playbackSpeed = speed;
      speedMultiplier = PLAYBACK_SPEED_MULTIPLIER[speed];
    },
    setSpeedMultiplier: (n) => {
      speedMultiplier = n;
    },
    getSpeed: () => playbackSpeed,
    notifyPassLanded,
  };
}
