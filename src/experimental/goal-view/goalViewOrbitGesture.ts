// EXPERIMENTAL — Goal View orbit gesture (prototype, /internal/goal-view only).
//
// Pure one-finger drag → orbit maths. No DOM, no PixiJS: the page feeds it
// pointer events and applies the returned orbit to the lens. Camera state is
// presentation-only and never touches board data.
//
//  - Horizontal drag rotates the pitch with the finger (camera orbits the
//    other way), 360° with wrap-around.
//  - Vertical drag tilts: dragging down raises the camera (more top-down),
//    dragging up lowers it towards pitch level. Clamped to the orbit limits.
//  - A drag only starts after a small dead zone, so taps never move the camera.
//  - Only the first finger is followed; a second finger ends the drag (pinch
//    is a later phase) so the camera never jumps.

import {
  DEFAULT_GOAL_VIEW_ORBIT,
  clampOrbit,
  type GoalViewCameraParams,
  baseElevationDeg,
  type GoalViewOrbit,
} from "./goalViewCamera";

export const ORBIT_GESTURE = {
  /** Degrees of yaw per CSS pixel of horizontal drag (≈180° across a phone). */
  yawDegPerPx: 0.5,
  /** Degrees of elevation per CSS pixel of vertical drag. */
  tiltDegPerPx: 0.25,
  /** Movement (CSS px) before a touch becomes a drag. */
  deadZonePx: 6,
} as const;

export type OrbitGestureState = {
  pointerId: number | null;
  startX: number;
  startY: number;
  startOrbit: GoalViewOrbit;
  dragging: boolean;
};

export const IDLE_ORBIT_GESTURE: OrbitGestureState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  startOrbit: DEFAULT_GOAL_VIEW_ORBIT,
  dragging: false,
};

export function orbitGestureDown(
  state: OrbitGestureState,
  pointer: { id: number; x: number; y: number },
  orbit: GoalViewOrbit,
): OrbitGestureState {
  // Second finger: stop following (no jump), wait for all fingers to lift.
  if (state.pointerId != null) return { ...IDLE_ORBIT_GESTURE, pointerId: -1 };
  return { pointerId: pointer.id, startX: pointer.x, startY: pointer.y, startOrbit: orbit, dragging: false };
}

/** Returns the new gesture state and, when the camera should move, the new orbit. */
export function orbitGestureMove(
  state: OrbitGestureState,
  pointer: { id: number; x: number; y: number },
  camera: GoalViewCameraParams,
): { state: OrbitGestureState; orbit: GoalViewOrbit | null } {
  if (state.pointerId == null || pointer.id !== state.pointerId) return { state, orbit: null };
  const dx = pointer.x - state.startX;
  const dy = pointer.y - state.startY;
  const dragging = state.dragging || Math.hypot(dx, dy) >= ORBIT_GESTURE.deadZonePx;
  if (!dragging) return { state, orbit: null };
  const startElevation = state.startOrbit.elevationDeg ?? baseElevationDeg(camera);
  const orbit = clampOrbit({
    yawDeg: state.startOrbit.yawDeg + dx * ORBIT_GESTURE.yawDegPerPx,
    elevationDeg: dy === 0 && state.startOrbit.elevationDeg == null ? null : startElevation + dy * ORBIT_GESTURE.tiltDegPerPx,
    zoom: state.startOrbit.zoom,
  });
  return { state: { ...state, dragging: true }, orbit };
}

export function orbitGestureUp(state: OrbitGestureState, pointer: { id: number }): OrbitGestureState {
  if (state.pointerId === -1 || pointer.id === state.pointerId) return IDLE_ORBIT_GESTURE;
  return state;
}
