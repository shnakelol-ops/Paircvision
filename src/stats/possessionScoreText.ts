/**
 * possessionScoreText.ts
 *
 * What a group of possessions produced, as the Intelligence cards print it.
 *
 * PossessionFamilySummary counts scoring POSSESSIONS: `goals` = possessions
 * ending in a goal, `points` = possessions ending in a point-type score (a
 * two-pointer counts once). Its `scoreValue` is the true points value (goal
 * 3, two-pointer 2, point 1). Printing `points` in G-PP notation therefore
 * understated every two-pointer ("0-01" for a 2-point score). This formats
 * the real value and says how many scores produced it. Presentation only —
 * no possession or scoring rule is involved.
 */
import type { PossessionFamilySummary } from "./chains/chain-types";

export type ProducedScore = { goals: number; points: number; scores: number };

export function producedScore(sm: Pick<PossessionFamilySummary, "goals" | "points" | "scoreValue">): ProducedScore {
  return {
    goals: sm.goals,
    points: Math.max(0, sm.scoreValue - 3 * sm.goals),
    scores: sm.goals + sm.points,
  };
}

/** "0-02 from 1 score", "1-03 from 3 scores"; "0-00 scored" when nothing was scored. */
export function producedScoreText(p: ProducedScore): string {
  const gp = `${p.goals}-${p.points.toString().padStart(2, "0")}`;
  return p.scores > 0 ? `${gp} from ${p.scores} score${p.scores === 1 ? "" : "s"}` : `${gp} scored`;
}
