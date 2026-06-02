import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";
import { createBasicRouteFollowSession, type BasicRouteFollowSession } from "../movement/basic-route-follow";
import { sampleRoutePoints } from "../routes/route-sampling";
import type { MovementPlaybackSpeed, MovementPlaybackState } from "../shell/types";

const BASIC_ROUTE_FOLLOW_SPEED = 18;
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
  getStartPosition: (tokenId: string) => NormalizedPoint | null;
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
  isLocked: () => boolean;
  hasActiveRuns: () => boolean;
  getState: () => MovementPlaybackState;
  setSpeed: (speed: MovementPlaybackSpeed) => void;
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
  let activePlaybackRuns = new Map<string, ActivePlaybackRun>();

  const emitState = () => {
    callbacks.onStateChange({ isPlaying, isPaused });
  };

  const cancelRuns = () => {
    for (const run of activePlaybackRuns.values()) {
      run.session.cancel();
    }
    activePlaybackRuns.clear();
  };

  const buildRuns = (): Map<string, ActivePlaybackRun> => {
    const tokens = callbacks.getTokens();
    const runs = new Map<string, ActivePlaybackRun>();
    let staggerIndex = 0;

    for (const token of tokens) {
      const start = callbacks.getStartPosition(token.id) ?? token.position;
      const route = callbacks.getRoute(token.id);
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

      const targetPoint = clonePoint(start);
      const session = createBasicRouteFollowSession({
        target: targetPoint,
        route: sampled,
        speed: BASIC_ROUTE_FOLLOW_SPEED,
      });
      if (!session.isActive()) continue;

      runs.set(token.id, {
        tokenId: token.id,
        targetPoint,
        session,
        delayMs: staggerIndex * PLAY_ALL_STAGGER_MS,
      });
      staggerIndex += 1;
    }
    return runs;
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
    if (!isPlaying || activePlaybackRuns.size === 0) return;
    const multiplier = PLAYBACK_SPEED_MULTIPLIER[playbackSpeed];
    const completedIds: string[] = [];

    for (const run of activePlaybackRuns.values()) {
      if (run.delayMs > 0) {
        run.delayMs = Math.max(0, run.delayMs - deltaMs);
        continue;
      }
      run.session.step(deltaMs * multiplier);
      callbacks.onTokenStep(run.tokenId, clampNormalizedPoint(run.targetPoint));
      if (!run.session.isActive()) {
        completedIds.push(run.tokenId);
      }
    }

    for (const id of completedIds) {
      activePlaybackRuns.delete(id);
    }
    if (activePlaybackRuns.size === 0) {
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
    const nextRuns = buildRuns();
    if (nextRuns.size === 0) {
      isPlaying = false;
      emitState();
      return;
    }
    activePlaybackRuns = nextRuns;
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

  return {
    start,
    pause,
    resume,
    stop,
    step,
    isLocked: () => isPlaying || isPaused,
    hasActiveRuns: () => activePlaybackRuns.size > 0,
    getState: () => ({ isPlaying, isPaused }),
    setSpeed: (speed) => { playbackSpeed = speed; },
    getSpeed: () => playbackSpeed,
  };
}
