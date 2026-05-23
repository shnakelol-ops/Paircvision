import type {
  MatchEvent,
  MatchEventKind,
  MatchEventTeamSide,
} from "../core/stats/stats-event-model";

export type ReviewHalfFilter = "FULL" | "H1" | "H2";
export type ReviewSegmentFilter = "ALL" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
export type ReviewTeamSideFilter = "ALL" | "FOR" | "OPP";
export type ReviewZoneFilter = "FULL" | "OWN_HALF" | "OPPOSITION_HALF";
export type ReviewAttackingDirection = "LEFT" | "RIGHT";
export type ReviewCategoryFilter = string;

export type ReviewCategoryKindMap<TCategory extends ReviewCategoryFilter> = Partial<
  Record<Exclude<TCategory, "ALL" | "PLAYERS">, readonly MatchEventKind[]>
>;

export type ReviewSelectableEvent = MatchEvent & {
  playerId?: string | null;
  playerName?: string | null;
  team?: "HOME" | "AWAY" | null;
  teamSide?: MatchEventTeamSide;
};

export type ReviewEventFilters<TCategory extends ReviewCategoryFilter = ReviewCategoryFilter> = {
  half: ReviewHalfFilter;
  segment: ReviewSegmentFilter;
  teamSide: ReviewTeamSideFilter;
  category: TCategory;
  categoryKinds: ReviewCategoryKindMap<TCategory>;
  activePlayerId?: string | null;
  activePlayerOnly?: boolean;
  zone?: ReviewZoneFilter;
  attackingDirection?: ReviewAttackingDirection;
};
