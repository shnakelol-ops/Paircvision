import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import { createBasicRouteFollowSession, type BasicRouteFollowSession } from "../movement/basic-route-follow";
import { sampleRoutePoints } from "../routes/route-sampling";
import type { MovementPlaybackSpeed, MovementPlaybackState, TacticalPassEvent, TacticalShotEvent } from "../shell/types";

// Speed increased from 18 to 22 to preserve average travel time after ease-in-out
// introduces an average speed factor of ~0.82 (22 × 0.82 ≈ 18).
const BASIC_ROUTE_FOLLOW_SPEED = 22;
const PLAY_ALL_STAGGER_MS = 90;
const POSITION_EPSILON = 0.0001;

const PLAYBACK_SPEED_MULTIPLIER: Record<MovementPlaybackSpeed, number> = {
  slow: 0.75,
  normal: 1,
  fast: 1.3,
};

type ActivePlaybackRun = {
  tokenId: string;
  targetPoint: { x: number; y: number };
  session: BasicRouteFollowSession;
  delayMs: number;
};

type PendingTriggerRun = {
  tokenId: string;
  triggeredBy: string;
  sampled: NormalizedPoint[];
  startPosition: NormalizedPoint;
};

type ActivePassRun = {
  passId: string;
  fromPlayerId: string;
  toPlayerId: string;
  delayMs: number;
};

type PendingPassRun = {
  passId: string;
  fromPlayerId: string;
  toPlayerId: string;
  triggeredBy: string;
};

type ActiveShotRun = {
  shotId: string;
  shooterId: string;
  delayMs: number;
};

type PendingShotRun = {
  shotId: string;
  shooterId: string;
  delayMs: number;
};

type TokenRef = { id: string; position: NormalizedPoint };

export type PlaybackOrchestratorCallbacks = {
  /** Called once per token at the start of each playback run to snap it to its start position. Does NOT fire onTokenMove. */
  onPlaybackReset: (tokenId: string, startPosition: NormalizedPoint) => void;
  /** Called every tick frame while a token is actively moving. Fires onTokenMove in the shell. */
  onTokenStep: (tokenId: string, position: NormalizedPoint) => void;
  /** Called whenever isPlaying or isPaused changes. */
  onStateChange: (state: MovementPlaybackState) => void;
  getTokens: () => readonly TokenRef[];
  getRoute: (tokenId: string) => readonly NormalizedPoint[] | null;
  getRouteMeta: (tokenId: string) => { delayMs?: number; triggeredBy?: string } | null;
  getStartPosition: (tokenId: string) => NormalizedPoint | null;
  getPassEvents: () => readonly TacticalPassEvent[];
  /** Called when a pass should begin animating — shell handles the visual. */
  onPassStart: (fromPlayerId: string, toPlayerId: string) => void;
  getShotEvents: () => readonly TacticalShotEvent[];
  /** Called when a shot delay expires — shell fires the goal animation. */
  onShotStart: (shooterId: string) => void;
};

export type PlaybackOrchestrator = {
  /** Start playback. If paused with active runs, resumes instead of rebuilding. */
  start: () => void;
  pause: () => void;
  /** Resume from paused state. No-op if not paused or no active runs. */
  resume: () => void;
  /** Stop and cancel all runs. Pass keepPausedState to hold the paused flag. */
  stop: (opts?: { keepPausedState?: boolean }) => void;
  /** Advance all active runs by deltaMs. Call from the PixiJS ticker. */
  step: (deltaMs: number) => void;
  /**
   * Call when a pass arc completes and receiverId gains possession.
   * Promotes any pending shot for that shooter — starting the delay countdown
   * (or firing immediately if delayMs === 0).
   */
  notifyPassLanded: (receiverId: string) => void;
  isLocked: () => boolean;
  hasActiveRuns: () => boolean;
  getState: () => MovementPlaybackState;
  setSpeed: (speed: MovementPlaybackSpeed) => void;
  setSpeedMultiplier: (n: number) => void;
  getSpeed: () => MovementPlaybackSpeed;
};

function clonePoint(point: NormalizedPoint): NormalizedPoint {
  return { x: point.x, y: point.y };
}

export function createPlaybackOrchestrator(
  initialSpeed: MovementPlaybackSpeed,
  callbacks: PlaybackOrchestratorCallbacks,
): PlaybackOrchestrator {
  let isPlaying = false;
  let isPaused = false;
  let playbackSpeed = initialSpeed;
  let speedMultiplierOverride: number = PLAYBACK_SPEED_MULTIPLIER[initialSpeed];
  let activePlaybackRuns = new Map<string, ActivePlaybackRun>();
  let pendingTriggerRuns = new Map<string, PendingTriggerRun>();
  let activePassRuns = new Map<string, ActivePassRun>();
  let pendingPassRuns = new Map<string, PendingPassRun>();
  let activeShotRuns = new Map<string, ActiveShotRun>();
  let pendingShotRuns = new Map<string, PendingShotRun>();

  const emitState = () => {
    callbacks.onStateChange({ isPlaying, isPaused });
  };

  const cancelRuns = () => {
    for (const run of activePlaybackRuns.values()) {
      run.session.cancel();
    }
    activePlaybackRuns.clear();
    pendingTriggerRuns.clear();
    activePassRuns.clear();
    pendingPassRuns.clear();
    activeShotRuns.clear();
    pendingShotRuns.clear();
  };

  const buildRuns = (): {
    active: Map<string, ActivePlaybackRun>;
    pending: Map<string, PendingTriggerRun>;
    activePasses: Map<string, ActivePassRun>;
    pendingPasses: Map<string, PendingPassRun>;
    pendingShots: Map<string, PendingShotRun>;
  } => {
    const tokens = callbacks.getTokens();
    const active = new Map<string, ActivePlaybackRun>();
    const pending = new Map<string, PendingTriggerRun>();
    let staggerIndex = 0;

    for (const token of tokens) {
      const start = callbacks.getStartPosition(token.id) ?? token.position;
      const route = callbacks.getRoute(token.id);
      const meta = callbacks.getRouteMeta(token.id);
      let playbackPath: NormalizedPoint[] = [];

      if (route && route.length >= 2) {
        playbackPath = [clonePoint(start), ...route.slice(1).map((p) => clonePoint(p))];
      } else if (
        Math.abs(token.position.x - start.x) > POSITION_EPSILON ||
        Math.abs(token.position.y - start.y) > POSITION_EPSILON
      ) {
        playbackPath = [clonePoint(start), clonePoint(token.position)];
      }

      const sampled = sampleRoutePoints(playbackPath);
      if (sampled.length < 2) continue;

      callbacks.onPlaybackReset(token.id, start);

      if (meta?.triggeredBy) {
        pending.set(token.id, {
          tokenId: token.id,
          triggeredBy: meta.triggeredBy,
          sampled,
          startPosition: clonePoint(start),
        });
        continue;
      }

      const delay = meta?.delayMs !== undefined ? meta.delayMs : staggerIndex * PLAY_ALL_STAGGER_MS;

      const targetPoint = clonePoint(start);
      const session = createBasicRouteFollowSession({
        target: targetPoint,
        route: sampled,
        speed: BASIC_ROUTE_FOLLOW_SPEED,
      });
      if (!session.isActive()) continue;

      active.set(token.id, {
        tokenId: token.id,
        targetPoint,
        session,
        delayMs: delay,
      });
      staggerIndex += 1;
    }

    const activePasses = new Map<string, ActivePassRun>();
    const pendingPasses = new Map<string, PendingPassRun>();
    for (const pass of callbacks.getPassEvents()) {
      if (pass.triggeredBy) {
        pendingPasses.set(pass.id, {
          passId: pass.id,
          fromPlayerId: pass.fromPlayerId,
          toPlayerId: pass.toPlayerId,
          triggeredBy: pass.triggeredBy,
        });
      } else {
        activePasses.set(pass.id, {
          passId: pass.id,
          fromPlayerId: pass.fromPlayerId,
          toPlayerId: pass.toPlayerId,
          delayMs: pass.delayMs ?? 0,
        });
      }
    }

    // Shots always start pending — they are promoted to active only when
    // notifyPassLanded() confirms the shooter has possession.
    const pendingShots = new Map<string, PendingShotRun>();
    for (const shot of callbacks.getShotEvents()) {
      pendingShots.set(shot.id, {
        shotId: shot.id,
        shooterId: shot.shooterId,
        delayMs: shot.delayMs,
      });
    }

    return { active, pending, activePasses, pendingPasses, pendingShots };
  };

  const stop = (opts?: { keepPausedState?: boolean }) => {
    cancelRuns();
    isPlaying = false;
    if (!(opts?.keepPausedState ?? false)) {
      isPaused = false;
    }
    emitState();
  };

  const step = (deltaMs: number) => {
    const hasWork =
      activePlaybackRuns.size > 0 ||
      pendingTriggerRuns.size > 0 ||
      activePassRuns.size > 0 ||
      pendingPassRuns.size > 0 ||
      activeShotRuns.size > 0 ||
      pendingShotRuns.size > 0;
    if (!isPlaying || !hasWork) return;

    const multiplier = speedMultiplierOverride;
    const completedIds: string[] = [];

    for (const run of activePlaybackRuns.values()) {
      if (run.delayMs > 0) {
        run.delayMs = Math.max(0, run.delayMs - deltaMs * multiplier);
        continue;
      }
      run.session.step(deltaMs * multiplier);
      callbacks.onTokenStep(run.tokenId, clampNormalizedPoint(run.targetPoint));
      if (!run.session.isActive()) {
        completedIds.push(run.tokenId);
      }
    }

    // Advance delayed pass runs; fire any that reach 0.
    const firedPassIds: string[] = [];
    for (const run of activePassRuns.values()) {
      if (run.delayMs > 0) {
        run.delayMs = Math.max(0, run.delayMs - deltaMs * multiplier);
        if (run.delayMs > 0) continue;
      }
      callbacks.onPassStart(run.fromPlayerId, run.toPlayerId);
      firedPassIds.push(run.passId);
    }
    for (const id of firedPassIds) {
      activePassRuns.delete(id);
    }

    // Advance delayed shot runs; fire any that reach 0.
    const firedShotIds: string[] = [];
    for (const run of activeShotRuns.values()) {
      if (run.delayMs > 0) {
        run.delayMs = Math.max(0, run.delayMs - deltaMs * multiplier);
        if (run.delayMs > 0) continue;
      }
      callbacks.onShotStart(run.shooterId);
      firedShotIds.push(run.shotId);
    }
    for (const id of firedShotIds) {
      activeShotRuns.delete(id);
    }

    for (const id of completedIds) {
      activePlaybackRuns.delete(id);

      // Promote triggered token runs.
      const toPromote: Array<[string, PendingTriggerRun]> = [];
      for (const [pendingId, pending] of pendingTriggerRuns) {
        if (pending.triggeredBy === id) {
          toPromote.push([pendingId, pending]);
        }
      }
      for (const [pendingId, pending] of toPromote) {
        pendingTriggerRuns.delete(pendingId);
        const targetPoint = clonePoint(pending.startPosition);
        const session = createBasicRouteFollowSession({
          target: targetPoint,
          route: pending.sampled,
          speed: BASIC_ROUTE_FOLLOW_SPEED,
        });
        if (session.isActive()) {
          activePlaybackRuns.set(pendingId, {
            tokenId: pending.tokenId,
            targetPoint,
            session,
            delayMs: 0,
          });
        }
      }

      // Promote triggered pass runs.
      const passesToFire: PendingPassRun[] = [];
      for (const pendingPass of pendingPassRuns.values()) {
        if (pendingPass.triggeredBy === id) {
          passesToFire.push(pendingPass);
        }
      }
      for (const pass of passesToFire) {
        pendingPassRuns.delete(pass.passId);
        callbacks.onPassStart(pass.fromPlayerId, pass.toPlayerId);
      }
    }

    if (
      activePlaybackRuns.size === 0 &&
      pendingTriggerRuns.size === 0 &&
      activePassRuns.size === 0 &&
      pendingPassRuns.size === 0 &&
      activeShotRuns.size === 0 &&
      pendingShotRuns.size === 0
    ) {
      stop();
    }
  };

  const start = () => {
    if (isPlaying) return;
    if (isPaused && activePlaybackRuns.size > 0) {
      isPaused = false;
      isPlaying = true;
      emitState();
      return;
    }
    isPaused = false;
    const { active: nextActive, pending: nextPending, activePasses: nextActivePasses, pendingPasses: nextPendingPasses, pendingShots: nextPendingShots } = buildRuns();
    if (nextActive.size === 0 && nextPending.size === 0 && nextActivePasses.size === 0 && nextPendingPasses.size === 0 && nextPendingShots.size === 0) {
      isPlaying = false;
      emitState();
      return;
    }
    activePlaybackRuns = nextActive;
    pendingTriggerRuns = nextPending;
    activePassRuns = nextActivePasses;
    pendingPassRuns = nextPendingPasses;
    activeShotRuns = new Map();
    pendingShotRuns = nextPendingShots;
    isPlaying = true;
    emitState();
  };

  const pause = () => {
    if (!isPlaying) return;
    isPlaying = false;
    isPaused = true;
    emitState();
  };

  const resume = () => {
    if (!isPaused || activePlaybackRuns.size === 0) return;
    isPaused = false;
    isPlaying = true;
    emitState();
  };

  const notifyPassLanded = (receiverId: string) => {
    if (!isPlaying) return;
    const toPromote: PendingShotRun[] = [];
    for (const pending of pendingShotRuns.values()) {
      if (pending.shooterId === receiverId) {
        toPromote.push(pending);
      }
    }
    for (const pending of toPromote) {
      pendingShotRuns.delete(pending.shotId);
      if (pending.delayMs <= 0) {
        callbacks.onShotStart(pending.shooterId);
      } else {
        activeShotRuns.set(pending.shotId, {
          shotId: pending.shotId,
          shooterId: pending.shooterId,
          delayMs: pending.delayMs,
        });
      }
    }
  };

  return {
    start,
    pause,
    resume,
    stop,
    step,
    notifyPassLanded,
    isLocked: () => isPlaying || isPaused,
    hasActiveRuns: () =>
      activePlaybackRuns.size > 0 ||
      pendingTriggerRuns.size > 0 ||
      activePassRuns.size > 0 ||
      pendingPassRuns.size > 0 ||
      activeShotRuns.size > 0 ||
      pendingShotRuns.size > 0,
    getState: () => ({ isPlaying, isPaused }),
    setSpeed: (speed) => { playbackSpeed = speed; speedMultiplierOverride = PLAYBACK_SPEED_MULTIPLIER[speed]; },
    setSpeedMultiplier: (n) => { speedMultiplierOverride = n; },
    getSpeed: () => playbackSpeed,
  };
}
