import type { NormalizedPoint } from "../../movement-board/coordinates/normalization";
import type { MovementBoardRoute } from "../../movement-board/shell/types";
import type { TacticalUnit } from "./tacticalUnitTypes";

export function buildMemberRoutes(
  leaderRoute: NormalizedPoint[],
  unit: TacticalUnit,
  leaderId: string,
  tokenPositions: Map<string, NormalizedPoint>,
): MovementBoardRoute[] {
  const leaderPos = tokenPositions.get(leaderId);
  const result: MovementBoardRoute[] = [
    { playerId: leaderId, points: leaderRoute, delayMs: 0 },
  ];

  for (const memberId of unit.memberIds) {
    if (memberId === leaderId) continue;
    const memberPos = tokenPositions.get(memberId);
    if (!memberPos) continue;
    const dx = leaderPos ? memberPos.x - leaderPos.x : 0;
    const dy = leaderPos ? memberPos.y - leaderPos.y : 0;
    const points: NormalizedPoint[] = leaderRoute.map((pt) => ({
      x: Math.min(100, Math.max(0, pt.x + dx)),
      y: Math.min(100, Math.max(0, pt.y + dy)),
    }));
    result.push({ playerId: memberId, points, delayMs: 0 });
  }

  return result;
}
