import { useEffect, useMemo, useRef, useState } from "react";

import {
  createInitialMatchEngineState,
  goToHalfTime,
  endMatch,
  formatMatchClock,
  isLoggingActive,
  startFirstHalf,
  startSecondHalf,
  tickMatchClock,
  type MatchState,
} from "./core/match/match-state-store";
import { createPixiPitchSurface } from "./core/pitch/create-pixi-pitch-surface";
import { type MatchEvent, type MatchEventKind } from "./core/stats/stats-event-model";
import { gaaModeConfig, type GaaModeKey } from "./config/gaaModeConfig";

type VisibilityMode = "ALL" | "LAST_5" | "LAST_10";
type TeamScore = { goals: number; points: number; total: number };
type TeamSide = "HOME" | "AWAY";
type UtilityPanel = "PLAYERS" | "REVIEW" | "SUMMARY" | null;
type ReviewHalf = "H1" | "H2" | "FULL";
type ReviewEventGroup =
  | "ALL"
  | "SCORES"
  | "WIDES"
  | "SHOTS"
  | "TURNOVERS"
  | "KICKOUTS"
  | "FREES";
type ReviewZone = "FULL" | "OWN_HALF" | "OPPOSITION_HALF";
type AttackingDirection = "LEFT" | "RIGHT";
type PlayerRole = "STARTER" | "SUB";
type SquadPlayer = { id: string; name: string; number: number; role: PlayerRole };
type Squad = { id: string; name: string; players: SquadPlayer[] };
type LoggedMatchEvent = MatchEvent & {
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  squadId?: string;
  team?: TeamSide;
};

type ReviewEventGroupOptionId = ReviewEventGroup | "ACTIVE";
const MODE_MENU_OPTIONS: ReadonlyArray<{ key: GaaModeKey; label: string }> = [
  { key: "football", label: "Football" },
  { key: "ladiesFootball", label: "Ladies Football" },
  { key: "hurling", label: "Hurling" },
  { key: "camogie", label: "Camogie" },
];
const FORMATION_ROW_SIZES = [1, 3, 3, 2, 3, 3] as const;
const SQUADS_STORAGE_KEY = "pitchsideclub.squads";
function newLocalEventId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createDefaultSquad(): Squad {
  return {
    id: `squad-${newLocalEventId()}`,
    name: "HOME",
    players: [],
  };
}

function parseStoredPlayer(input: unknown, idx: number): SquadPlayer | null {
  if (typeof input === "string") {
    const trimmedName = input.trim();
    if (trimmedName.length === 0) return null;
    return {
      id: `player-${idx + 1}-${trimmedName.toLowerCase().replace(/\s+/g, "-")}`,
      name: trimmedName,
      number: idx + 1,
      role: idx < 15 ? "STARTER" : "SUB",
    };
  }
  if (!input || typeof input !== "object") return null;
  const rawName = "name" in input ? input.name : null;
  if (typeof rawName !== "string") return null;
  const nextName = rawName.trim().slice(0, 24);
  if (nextName.length === 0) return null;
  const rawNumber = "number" in input ? input.number : null;
  const parsedNumber =
    typeof rawNumber === "number" && Number.isFinite(rawNumber)
      ? Math.max(1, Math.min(99, Math.floor(rawNumber)))
      : idx + 1;
  const rawRole = "role" in input ? input.role : null;
  const nextRole: PlayerRole =
    rawRole === "STARTER" || rawRole === "SUB" ? rawRole : idx < 15 ? "STARTER" : "SUB";
  const rawId = "id" in input ? input.id : null;
  const nextId =
    typeof rawId === "string" && rawId.trim().length > 0
      ? rawId
      : `player-${idx + 1}-${nextName.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    id: nextId,
    name: nextName,
    number: parsedNumber,
    role: nextRole,
  };
}

function parseStoredSquads(input: string | null): Squad[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const maybeId = "id" in item ? item.id : null;
        const maybeName = "name" in item ? item.name : null;
        const maybePlayers = "players" in item ? item.players : null;
        if (typeof maybeId !== "string" || typeof maybeName !== "string") return null;
        if (!Array.isArray(maybePlayers)) return null;
        const players = maybePlayers
          .map((player, idx) => parseStoredPlayer(player, idx))
          .filter((player): player is SquadPlayer => player !== null);
        return {
          id: maybeId,
          name: maybeName.slice(0, 24),
          players,
        };
      })
      .filter((squad): squad is Squad => squad !== null);
  } catch {
    return [];
  }
}

function computeTeamScore(events: readonly MatchEvent[], team: TeamSide): TeamScore {
  let goals = 0;
  let points = 0;

  for (const event of events) {
    if (event.id.startsWith(`team-${team.toLowerCase()}-`) === false) continue;
    if (event.kind === "GOAL") {
      goals += 1;
      continue;
    }
    if (event.kind === "POINT") {
      points += 1;
      continue;
    }
    if (event.kind === "TWO_POINTER") {
      points += 2;
      continue;
    }
    if (event.kind === "FORTY_FIVE_TWO_POINT") {
      points += 2;
      continue;
    }
    if (event.kind === "FREE_SCORED") {
      points += 1;
    }
  }

  return {
    goals,
    points,
    total: goals * 3 + points,
  };
}

function formatGaelicScore(score: TeamScore): string {
  return `${score.goals}-${String(score.points).padStart(2, "0")}`;
}

function getRenderablePitchEvents(
  events: readonly LoggedMatchEvent[],
  reviewHalf: ReviewHalf,
  reviewEventGroup: ReviewEventGroup,
  reviewEventGroupKinds: Record<
    Exclude<ReviewEventGroup, "ALL">,
    readonly MatchEventKind[]
  >,
  reviewZone: ReviewZone,
  attackingDirection: AttackingDirection,
  reviewActivePlayerOnly: boolean,
  activePlayerId: string | null,
): LoggedMatchEvent[] {
  const groupKinds =
    reviewEventGroup === "ALL"
      ? null
      : new Set<MatchEventKind>(reviewEventGroupKinds[reviewEventGroup]);
  return events.filter((event) => {
    if (event.id.includes("-instant-score-")) return false;

    if (reviewHalf === "H1" && event.half !== 1) return false;
    if (reviewHalf === "H2" && event.half !== 2) return false;

    if (groupKinds && !groupKinds.has(event.kind)) return false;
    if (reviewActivePlayerOnly && activePlayerId != null && event.playerId !== activePlayerId) return false;

    const isAttackingHalf = attackingDirection === "RIGHT" ? event.nx >= 0.5 : event.nx < 0.5;
    if (reviewZone === "OWN_HALF" && isAttackingHalf) return false;
    if (reviewZone === "OPPOSITION_HALF" && !isAttackingHalf) return false;

    return true;
  });
}

function oppositeAttackingDirection(direction: AttackingDirection): AttackingDirection {
  return direction === "RIGHT" ? "LEFT" : "RIGHT";
}

function getEffectiveAttackingDirection(
  firstHalfAttackingDirection: AttackingDirection,
  half: 1 | 2,
): AttackingDirection {
  return half === 2 ? oppositeAttackingDirection(firstHalfAttackingDirection) : firstHalfAttackingDirection;
}

const PANEL_CSS = `
.app-root {
  position: fixed;
  inset: 0;
  width: 100dvw;
  height: 100dvh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0f0c;
  overflow: hidden;
}

.floating-controls {
  position: fixed;
  right: 16px;
  bottom: 14px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.event-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 20, 35, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 8px 18px rgba(4, 12, 24, 0.26);
  width: min(calc(100vw - 32px), 308px);
  max-width: 95vw;
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
}

.event-btn {
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 9.5px;
  line-height: 1.1;
  padding: 5px 4px;
  min-height: 27px;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
  letter-spacing: 0.32px;
  text-transform: uppercase;
  transition: box-shadow 140ms ease, transform 120ms ease;
}

.event-btn:hover {
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.16), 0 0 10px rgba(148, 163, 184, 0.14);
}

.event-btn:active {
  transform: translateY(0.5px);
}

.visibility-row {
  margin-top: 1px;
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.visibility-btn {
  border-radius: 999px;
  color: #e2e8f0;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.1;
  padding: 3px 7px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.undo-wrap {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.undo-btn {
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.9);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  padding: 5px 8px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  letter-spacing: 0.25px;
  text-transform: uppercase;
}

.active-chip {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  line-height: 1;
  white-space: nowrap;
  letter-spacing: 0.25px;
  text-transform: uppercase;
}

.bubble-btn {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.76);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #e2e8f0;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.22), 0 0 12px rgba(34, 197, 94, 0.28);
}

.player-bubble-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.68);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #dbeafe;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12), 0 0 6px rgba(148, 163, 184, 0.14);
}

.utility-controls {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
  left: 16px;
  bottom: 90px;
}

.utility-controls--portrait {
  left: 16px;
  bottom: 90px;
  align-items: flex-start;
}

.utility-controls--landscape {
  left: 16px;
  bottom: 90px;
  align-items: flex-start;
}

.utility-bubble-btn {
  position: fixed;
  left: 16px;
  bottom: 90px;
  width: 39px;
  height: 39px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.3);
  background: rgba(15, 23, 42, 0.74);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.12), 0 0 8px rgba(96, 165, 250, 0.14);
  z-index: 9999;
  color: #dbeafe;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.utility-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(10, 20, 35, 0.74);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 18px rgba(4, 12, 24, 0.26);
  min-width: 110px;
  pointer-events: auto;
  margin-left: 44px;
  margin-bottom: 8px;
}

.utility-menu-btn {
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  cursor: pointer;
}

.active-player-chip {
  border: 1px solid rgba(125, 211, 252, 0.42);
  border-radius: 999px;
  background: rgba(14, 24, 40, 0.8);
  color: #dbeafe;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  padding: 5px 9px;
  white-space: nowrap;
  pointer-events: auto;
}

.utility-overlay-panel {
  position: fixed;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 208px;
  max-width: 86vw;
  padding: 8px;
  border-radius: 11px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(10, 20, 35, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 22px rgba(4, 12, 24, 0.3);
}

.utility-overlay-panel--portrait {
  left: 14px;
  bottom: 66px;
}

.utility-overlay-panel--landscape {
  right: 16px;
  bottom: 142px;
  max-height: calc(100dvh - 150px);
  overflow: hidden;
}

.utility-overlay-panel--review-landscape {
  right: 16px;
  bottom: 142px;
  max-height: calc(100dvh - 24px);
  min-width: 198px;
  max-width: min(70vw, 320px);
  padding: 6px;
  gap: 4px;
}

.utility-overlay-panel--review-landscape .utility-review-btn {
  min-height: 26px;
  height: 26px;
  font-size: 9px;
  padding: 0 8px;
}

.utility-review-scroll {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.utility-panel-close--sticky {
  position: sticky;
  bottom: 0;
  margin-top: 4px;
  background: rgba(15, 23, 42, 0.95);
  z-index: 1;
}

.review-strip {
  position: fixed;
  z-index: 23;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(10, 20, 35, 0.82);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.28);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
}

.review-strip--portrait {
  top: max(96px, calc(env(safe-area-inset-top) + 92px));
}

.review-strip--landscape {
  top: max(8px, env(safe-area-inset-top));
}

.review-strip-chip {
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.88);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  padding: 0 8px;
  cursor: pointer;
  flex: 0 0 auto;
}

.review-event-card {
  position: fixed;
  z-index: 22;
  left: 12px;
  min-width: 170px;
  max-width: min(58vw, 260px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(10, 20, 35, 0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.28);
}

.review-event-card--portrait {
  top: max(96px, calc(env(safe-area-inset-top) + 92px));
}

.review-event-card--landscape {
  top: max(48px, calc(env(safe-area-inset-top) + 44px));
}

.review-event-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.review-event-card-title {
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.review-event-card-close {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.review-event-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #dbe7f5;
  font-size: 9px;
  letter-spacing: 0.16px;
}

.review-event-card-row-label {
  opacity: 0.84;
  text-transform: uppercase;
}

.review-event-card-row-value {
  font-weight: 700;
  text-align: right;
}

.review-quick-strip {
  position: fixed;
  left: 8px;
  right: 8px;
  z-index: 23;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 5px 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(10, 20, 35, 0.76);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 14px rgba(4, 12, 24, 0.24);
  -webkit-overflow-scrolling: touch;
}

.review-quick-btn {
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  padding: 0 8px;
  white-space: nowrap;
  cursor: pointer;
  flex: 0 0 auto;
}

.utility-panel-title {
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22px;
  text-transform: uppercase;
}

.utility-squad-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.utility-squad-select {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-squad-create {
  display: flex;
  gap: 6px;
}

.utility-squad-input {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-player-add-row {
  display: flex;
  gap: 6px;
}

.utility-player-input {
  flex: 1;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
}

.utility-active-player-chip {
  border: 1px solid rgba(125, 211, 252, 0.42);
  border-radius: 999px;
  background: rgba(14, 116, 144, 0.28);
  color: #dbeafe;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  padding: 5px 8px;
  text-transform: uppercase;
  pointer-events: auto;
}

.utility-active-player-chip-floating {
  position: fixed;
  right: 16px;
  z-index: 22;
  pointer-events: none;
  max-width: min(62vw, 228px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.utility-player-btn,
.utility-review-btn {
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  text-align: left;
  padding: 0 9px;
  letter-spacing: 0.2px;
  cursor: pointer;
}

.utility-formation {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.utility-formation-row {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.utility-player-pill {
  min-height: 24px;
  max-width: 98px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  padding: 0 8px;
  letter-spacing: 0.18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.utility-subs-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.utility-subs-title {
  color: rgba(219, 231, 245, 0.84);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2px;
  text-transform: uppercase;
}

.utility-subs-row {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.utility-panel-close {
  align-self: flex-end;
  min-height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.86);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  padding: 0 8px;
  cursor: pointer;
}

.landscape-toolbar {
  position: fixed;
  right: 92px;
  bottom: 30px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: fit-content;
  max-width: min(620px, calc(100vw - 154px));
  max-height: 120px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 20, 35, 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 16px rgba(4, 12, 24, 0.24);
}

.landscape-toolbar-row {
  display: flex;
  gap: 4px;
}

.landscape-toolbar-secondary {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}

.landscape-toolbar-btn {
  min-width: 44px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 0 8px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.22px;
  text-transform: uppercase;
}

.landscape-toolbar-secondary-btn {
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 7px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-strip {
  position: fixed;
  top: max(2px, env(safe-area-inset-top));
  left: max(4px, env(safe-area-inset-left));
  z-index: 19;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: min(220px, calc(100vw - 12px));
  max-width: 220px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.3);
}

@media (min-width: 600px) and (max-width: 900px) {
  .scoreboard-strip {
    width: min(195px, calc(100vw - 12px));
    max-width: 195px;
  }
}

.scoreboard-strip-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
}

.scoreboard-side {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-width: 0;
}

.scoreboard-side-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-side-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.scoreboard-name-edit-btn {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.86);
  color: #cbd5e1;
  font-size: 9px;
  line-height: 1;
  padding: 0;
  margin: 0 0 0 1px;
  cursor: pointer;
}

.scoreboard-name-input {
  width: 100%;
  min-width: 0;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.44);
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 5px;
  letter-spacing: 0.18px;
  text-transform: uppercase;
}

.scoreboard-side-score {
  color: #f8fafc;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.24px;
}

.scoreboard-total {
  color: rgba(203, 213, 225, 0.9);
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  margin-left: 2px;
}

.scoreboard-team-toggle {
  margin-top: 1px;
  display: flex;
  gap: 3px;
}

.scoreboard-attack-row {
  margin-top: 3px;
}

.scoreboard-team-btn {
  min-height: 28px;
  min-width: 54px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  cursor: pointer;
}

.scoreboard-attack-btn {
  min-height: 28px;
  min-width: 54px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(186, 230, 253, 0.82);
  background: rgba(12, 74, 110, 0.86);
  color: #f8fafc;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.24px;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(12, 74, 110, 0.36), 0 1px 4px rgba(2, 6, 23, 0.35);
}

.scoreboard-attack-btn:disabled {
  cursor: default;
}

.scoreboard-attack-btn--rail {
  width: 100%;
}

.scoreboard-attack-btn--strip {
  width: 100%;
}

.scoreboard-rail {
  position: fixed;
  top: 50%;
  left: max(4px, env(safe-area-inset-left));
  transform: translateY(-50%);
  z-index: 19;
  width: clamp(72px, 11vw, 96px);
  min-height: clamp(220px, 52vh, 420px);
  max-height: min(80vh, 520px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 5px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.3);
}

.scoreboard-rail-score {
  color: #f8fafc;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.22px;
}

.scoreboard-rail-separator {
  color: rgba(203, 213, 225, 0.84);
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.scoreboard-rail-total {
  color: rgba(203, 213, 225, 0.88);
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  margin-left: 2px;
}

.scoreboard-rail-team-btn {
  min-height: 36px;
  width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.84);
  color: #dbe7f5;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  cursor: pointer;
}

.scoreboard-rail-team-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.scoreboard-rail-name-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.scoreboard-rail-team-name {
  color: rgba(203, 213, 225, 0.9);
  font-size: 8.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.16px;
  text-transform: uppercase;
}

.scoreboard-team-btn-inner {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.scoreboard-team-btn-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scoreboard-rail-name-input {
  width: 100%;
  min-width: 0;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 0 4px;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-rail-venue {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 18px;
  padding: 0 2px;
}

.scoreboard-rail-venue-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 64px;
}

.scoreboard-rail-venue-input {
  width: 100%;
  min-width: 0;
  height: 20px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 0 4px;
  letter-spacing: 0.16px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-strip-venue {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 4px;
  min-height: 18px;
  padding: 0 4px;
}

.scoreboard-strip-venue-label {
  color: rgba(203, 213, 225, 0.9);
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.scoreboard-strip-venue-input {
  width: 140px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.44);
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  padding: 0 5px;
  letter-spacing: 0.18px;
  text-transform: uppercase;
  text-align: center;
}

.scoreboard-side-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 8px;
  font: inherit;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.match-stopwatch {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 19;
  display: grid;
  grid-template-columns: auto auto;
  grid-template-areas:
    "state clock"
    "controls controls";
  align-items: center;
  row-gap: 4px;
  column-gap: 7px;
  justify-items: start;
  padding: 5px 8px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.14), 0 3px 10px rgba(2, 6, 23, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22px;
  text-transform: uppercase;
}

.match-stopwatch-state {
  grid-area: state;
  color: rgba(203, 213, 225, 0.84);
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
}

@media (orientation: landscape) {
  .scoreboard-rail {
    left: max(3px, env(safe-area-inset-left));
  }

  .match-stopwatch {
    top: max(2px, env(safe-area-inset-top));
    right: max(4px, env(safe-area-inset-right));
  }

  .utility-bubble-btn {
    left: 16px;
    right: auto;
    bottom: 90px;
  }

  .utility-controls--landscape {
    left: 16px;
    right: auto;
    bottom: 90px;
    align-items: flex-start;
  }

  .utility-controls--landscape .utility-menu {
    margin-left: 44px;
    margin-right: 0;
  }
}

.match-stopwatch-clock {
  grid-area: clock;
  justify-self: end;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.34px;
  line-height: 1;
  text-shadow: 0 0 7px rgba(148, 163, 184, 0.3);
}

.match-stopwatch-controls {
  grid-area: controls;
  width: 100%;
  display: flex;
}

.match-stopwatch-btn {
  position: relative;
  width: 100%;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(34, 197, 94, 0.62);
  background: rgba(22, 101, 52, 0.88);
  color: #dbe7f5;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.24px;
  padding: 0 10px;
  cursor: pointer;
  text-transform: uppercase;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.24), 0 0 10px rgba(34, 197, 94, 0.28);
}

.match-stopwatch-btn::before {
  content: "";
  position: absolute;
  inset: -5px;
}
`;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const floatingControlsRef = useRef<HTMLDivElement>(null);
  const [currentMode, setCurrentMode] = useState<GaaModeKey>("football");
  const mode = gaaModeConfig[currentMode];
  const [selectedEventKind, setSelectedEventKind] = useState<MatchEventKind>("POINT");
  const [activeTeam, setActiveTeam] = useState<TeamSide>("HOME");
  const [teamNames, setTeamNames] = useState<{ HOME: string; AWAY: string }>({
    HOME: "Team A",
    AWAY: "Team B",
  });
  const [editingTeam, setEditingTeam] = useState<TeamSide | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [venueName, setVenueName] = useState<string>("");
  const [editingVenue, setEditingVenue] = useState<boolean>(false);
  const [venueDraft, setVenueDraft] = useState("");
  const [isUtilityOpen, setIsUtilityOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [squads, setSquads] = useState<Squad[]>(() => {
    if (typeof window === "undefined") {
      return [createDefaultSquad()];
    }
    const parsed = parseStoredSquads(window.localStorage.getItem(SQUADS_STORAGE_KEY));
    return parsed.length > 0 ? parsed : [createDefaultSquad()];
  });
  const [activeSquadId, setActiveSquadId] = useState("");
  const [squadDraft, setSquadDraft] = useState("");
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [activePlayerNumber, setActivePlayerNumber] = useState<number | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [playerDraft, setPlayerDraft] = useState("");
  const [showPlayerInitials] = useState(true);
  const [reviewHalf, setReviewHalf] = useState<ReviewHalf>("FULL");
  const [reviewEventGroup, setReviewEventGroup] = useState<ReviewEventGroup>("ALL");
  const [reviewActivePlayerOnly, setReviewActivePlayerOnly] = useState(false);
  const [reviewZone, setReviewZone] = useState<ReviewZone>("FULL");
  const [firstHalfAttackingDirection, setFirstHalfAttackingDirection] =
    useState<AttackingDirection>("RIGHT");
  const [showReviewStrip, setShowReviewStrip] = useState(false);
  const [selectedReviewEventId, setSelectedReviewEventId] = useState<string | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<readonly LoggedMatchEvent[]>([]);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("ALL");
  const [matchState, setMatchState] = useState<MatchState>("PRE_MATCH");
  const [currentHalf, setCurrentHalf] = useState<1 | 2>(1);
  const [matchTimeSeconds, setMatchTimeSeconds] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isLandscape, setIsLandscape] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(orientation: landscape)").matches,
  );
  const selectedEventRef = useRef<MatchEventKind>("POINT");
  const activeTeamRef = useRef<TeamSide>("HOME");
  const activePlayerRef = useRef<string | null>(null);
  const activePlayerNumberRef = useRef<number | null>(null);
  const activePlayerIdRef = useRef<string | null>(null);
  const reviewHalfRef = useRef<ReviewHalf>("FULL");
  const reviewEventGroupRef = useRef<ReviewEventGroup>("ALL");
  const reviewActivePlayerOnlyRef = useRef(false);
  const reviewZoneRef = useRef<ReviewZone>("FULL");
  const firstHalfAttackingDirectionRef = useRef<AttackingDirection>("RIGHT");
  const pendingScorerRef = useRef<{ name: string; number: number; squadId: string } | null>(null);
  const activeSquadIdRef = useRef("");
  const homeNameInputRef = useRef<HTMLInputElement>(null);
  const awayNameInputRef = useRef<HTMLInputElement>(null);
  const venueInputRef = useRef<HTMLInputElement>(null);
  const matchEngineStateRef = useRef(createInitialMatchEngineState());
  const secondHalfSwitchBaselineEventCountRef = useRef<number | null>(null);
  const eventKindSwitchBaselineEventCountRef = useRef<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const EVENT_BUTTONS = mode.eventButtons;
  const EVENT_LABEL_BY_KIND = mode.eventLabels;
  const AWAY_INSTANT_SCORING_KINDS = useMemo(
    () => new Set<MatchEventKind>(mode.scoringEvents),
    [mode],
  );
  const SCORE_EVENT_KINDS = useMemo(
    () => new Set<MatchEventKind>(mode.scoringEvents),
    [mode],
  );
  const REVIEW_EVENT_GROUP_KINDS = useMemo<
    Record<Exclude<ReviewEventGroup, "ALL">, readonly MatchEventKind[]>
  >(
    () => ({
      SCORES: mode.reviewGroups.SCORES.kinds,
      WIDES: mode.reviewGroups.WIDES.kinds,
      SHOTS: mode.reviewGroups.SHOTS.kinds,
      TURNOVERS: mode.reviewGroups.TURNOVERS.kinds,
      KICKOUTS: mode.reviewGroups.KICKOUTS.kinds,
      FREES: mode.reviewGroups.FREES.kinds,
    }),
    [mode],
  );
  const REVIEW_EVENT_GROUP_OPTIONS = useMemo<
    ReadonlyArray<{ id: ReviewEventGroupOptionId; label: string }>
  >(
    () => [
      { id: "ALL", label: "ALL" },
      { id: "ACTIVE", label: "ACTIVE" },
      { id: "SCORES", label: mode.reviewGroups.SCORES.label },
      { id: "WIDES", label: mode.reviewGroups.WIDES.label },
      { id: "SHOTS", label: mode.reviewGroups.SHOTS.label },
      { id: "TURNOVERS", label: mode.reviewGroups.TURNOVERS.label },
      { id: "KICKOUTS", label: mode.reviewGroups.KICKOUTS.label },
      { id: "FREES", label: mode.reviewGroups.FREES.label },
    ],
    [mode],
  );
  const handleRef = useRef<{
    destroy: () => void;
    setEvents: (events: readonly import("./core/stats/stats-event-model").MatchEvent[]) => void;
    setActiveEventKind: (kind: MatchEventKind) => void;
    undoLastEvent: () => void;
    setShowPlayerInitials: (show: boolean) => void;
    setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
    setVisibleEventLimit: (limit: number | null) => void;
    setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
  } | null>(null);
  const canEditTeamNames = matchState === "PRE_MATCH";
  const activeSquad =
    squads.find((squad) => squad.id === activeSquadId) ?? squads[0] ?? createDefaultSquad();
  const activeSquadPlayers = activeSquad.players;
  const activePlayerEntry = activePlayer
    ? activeSquadPlayers.find(
        (player) => player.name === activePlayer && player.number === (activePlayerNumber ?? -1),
      ) ??
      activeSquadPlayers.find((player) => player.name === activePlayer) ??
      null
    : null;

  const setActiveSquadById = (nextSquadId: string) => {
    setActiveSquadId(nextSquadId);
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    activePlayerIdRef.current = null;
    setPlayerDraft("");
  };

  const updateActiveSquadPlayers = (
    updater: (prevPlayers: SquadPlayer[]) => SquadPlayer[],
    nextActivePlayerId?: string | null,
  ) => {
    const nextPlayersForActiveSquad = updater([...activeSquad.players]);
    const nextSelectedPlayer =
      nextActivePlayerId === undefined
        ? undefined
        : nextPlayersForActiveSquad.find((player) => player.id === nextActivePlayerId) ?? null;
    setSquads((prevSquads) =>
      prevSquads.map((squad) =>
        squad.id === activeSquad.id ? { ...squad, players: nextPlayersForActiveSquad } : squad,
      ),
    );
    if (nextActivePlayerId !== undefined) {
      if (nextSelectedPlayer) {
        setActivePlayer(nextSelectedPlayer.name);
        setActivePlayerNumber(nextSelectedPlayer.number);
        setActivePlayerId(nextSelectedPlayer.id);
        activePlayerRef.current = nextSelectedPlayer.name;
        activePlayerNumberRef.current = nextSelectedPlayer.number;
        activePlayerIdRef.current = nextSelectedPlayer.id;
      } else {
        setActivePlayer(null);
        setActivePlayerNumber(null);
        setActivePlayerId(null);
        activePlayerRef.current = null;
        activePlayerNumberRef.current = null;
        activePlayerIdRef.current = null;
      }
    }
  };

  const selectActivePlayerById = (playerId: string | null) => {
    if (!playerId) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      return;
    }
    const player = activeSquadPlayers.find((entry) => entry.id === playerId);
    if (!player) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      activePlayerRef.current = null;
      activePlayerNumberRef.current = null;
      activePlayerIdRef.current = null;
      return;
    }
    setActivePlayer(player.name);
    setActivePlayerNumber(player.number);
    setActivePlayerId(player.id);
    activePlayerRef.current = player.name;
    activePlayerNumberRef.current = player.number;
    activePlayerIdRef.current = player.id;
  };

  const toggleActivePlayerById = (playerId: string) => {
    if (activePlayerEntry?.id === playerId) {
      selectActivePlayerById(null);
      return;
    }
    selectActivePlayerById(playerId);
  };

  const handlePlayerPick = (player: SquadPlayer) => {
    toggleActivePlayerById(player.id);
    closeUtilityPanel();
    setIsUtilityOpen(false);
  };

  const editPlayer = (playerId: string) => {
    const targetPlayer = activeSquadPlayers.find((player) => player.id === playerId);
    if (!targetPlayer) return;
    const nextNameInput = window.prompt("Player name", targetPlayer.name);
    if (nextNameInput == null) return;
    const nextName = nextNameInput.trim();
    if (nextName.length === 0) return;
    const nextNumberInput = window.prompt("Jersey number", String(targetPlayer.number));
    if (nextNumberInput == null) return;
    const parsedNumber = Number.parseInt(nextNumberInput, 10);
    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) return;
    const nextRoleInput = window.prompt("Role: STARTER or SUB", targetPlayer.role);
    if (nextRoleInput == null) return;
    const normalizedRoleInput = nextRoleInput.trim().toUpperCase();
    const nextRole: PlayerRole = normalizedRoleInput === "SUB" ? "SUB" : "STARTER";
    updateActiveSquadPlayers(
      (prevPlayers) =>
        prevPlayers.map((player) =>
          player.id === playerId
            ? {
                ...player,
                name: nextName.slice(0, 24),
                number: Math.max(1, Math.min(99, Math.floor(parsedNumber))),
                role: nextRole,
              }
            : player,
        ),
      playerId,
    );
  };

  const createSquad = () => {
    const nextName = squadDraft.trim();
    if (nextName.length === 0) return;
    const nextSquad: Squad = {
      id: `squad-${newLocalEventId()}`,
      name: nextName.slice(0, 24),
      players: [],
    };
    setSquads((prev) => [...prev, nextSquad]);
    setActiveSquadById(nextSquad.id);
    setSquadDraft("");
  };

  const saveActiveSquadName = () => {
    const nextName = squadDraft.trim();
    if (nextName.length === 0) return;
    setSquads((prevSquads) =>
      prevSquads.map((squad) =>
        squad.id === activeSquad.id ? { ...squad, name: nextName.slice(0, 24) } : squad,
      ),
    );
    setSquadDraft("");
  };

  const undoLastEventAction = () => {
    const lastEvent = loggedEvents.at(-1);
    if (!lastEvent) return;
    const isInstantAwayScore = lastEvent.id.includes("-instant-score-");
    if (!isInstantAwayScore) {
      handleRef.current?.undoLastEvent();
    }
    setLoggedEvents((prev) => prev.slice(0, -1));
  };

  const startTeamNameEdit = (team: TeamSide) => {
    if (!canEditTeamNames) return;
    setEditingTeam(team);
    setTeamNameDraft(teamNames[team]);
  };

  const commitTeamNameEdit = () => {
    if (!editingTeam) return;
    const nextName = teamNameDraft.trim();
    if (nextName.length > 0) {
      setTeamNames((prev) => ({ ...prev, [editingTeam]: nextName.slice(0, 15) }));
    }
    setEditingTeam(null);
    setTeamNameDraft("");
  };

  const startVenueEdit = () => {
    if (!canEditTeamNames) return;
    setEditingVenue(true);
    setVenueDraft(venueName);
  };

  const commitVenueEdit = () => {
    setVenueName(venueDraft.trim().slice(0, 24));
    setEditingVenue(false);
    setVenueDraft("");
  };

  const selectEventKind = (kind: MatchEventKind) => {
    eventKindSwitchBaselineEventCountRef.current = loggedEvents.length;
    setSelectedEventKind(kind);
    selectedEventRef.current = kind;
    handleRef.current?.setActiveEventKind(kind);
    setIsPickerOpen(false);
  };

  const logAwayInstantScore = (kind: MatchEventKind) => {
    setLoggedEvents((prev) => {
      const next = [
        ...prev,
        {
          id: `team-away-instant-score-${newLocalEventId()}`,
          kind,
          nx: 0,
          ny: 0,
          half: matchEngineStateRef.current.currentHalf,
          timestamp: matchEngineStateRef.current.matchTimeSeconds,
        },
      ];
      if (import.meta.env.DEV) {
        console.assert(
          next.length === prev.length + 1,
          "[stats-events] Away instant score should append exactly one event",
          { previousCount: prev.length, nextCount: next.length, kind },
        );
      }
      return next;
    });
  };

  const handleEventButtonPress = (kind: MatchEventKind) => {
    if (!isLoggingActive(matchState)) return;
    if (activeTeam === "AWAY" && AWAY_INSTANT_SCORING_KINDS.has(kind)) {
      selectEventKind(kind);
      logAwayInstantScore(kind);
      return;
    }
    if (activeTeam === "AWAY") return;
    selectEventKind(kind);
  };

  const toggleMatchBubble = () => {
    setIsPickerOpen((prev) => {
      const next = !prev;
      if (next) setIsUtilityOpen(false);
      return next;
    });
  };

  const toggleCommandBubble = () => {
    setIsUtilityOpen((prev) => {
      const next = !prev;
      if (next) setIsPickerOpen(false);
      return next;
    });
  };

  useEffect(() => {
    activeTeamRef.current = activeTeam;
  }, [activeTeam]);

  useEffect(() => {
    activePlayerRef.current = activePlayer;
  }, [activePlayer]);

  useEffect(() => {
    activePlayerNumberRef.current = activePlayerNumber;
  }, [activePlayerNumber]);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  useEffect(() => {
    reviewHalfRef.current = reviewHalf;
  }, [reviewHalf]);

  useEffect(() => {
    reviewEventGroupRef.current = reviewEventGroup;
  }, [reviewEventGroup]);

  useEffect(() => {
    reviewActivePlayerOnlyRef.current = reviewActivePlayerOnly;
  }, [reviewActivePlayerOnly]);

  useEffect(() => {
    reviewZoneRef.current = reviewZone;
  }, [reviewZone]);

  useEffect(() => {
    firstHalfAttackingDirectionRef.current = firstHalfAttackingDirection;
  }, [firstHalfAttackingDirection]);

  useEffect(() => {
    const baseline = eventKindSwitchBaselineEventCountRef.current;
    if (baseline == null) return;
    if (import.meta.env.DEV) {
      console.assert(
        loggedEvents.length >= baseline,
        "[stats-events] Switching event type must not reduce total event count",
        {
          baselineCount: baseline,
          currentCount: loggedEvents.length,
          selectedEventKind,
        },
      );
    }
    eventKindSwitchBaselineEventCountRef.current = null;
  }, [loggedEvents.length, selectedEventKind]);

  useEffect(() => {
    if (!activePlayer) {
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      return;
    }
    const matchedPlayer =
      activeSquadPlayers.find(
        (player) => player.name === activePlayer && player.number === (activePlayerNumber ?? -1),
      ) ?? activeSquadPlayers.find((player) => player.name === activePlayer);
    if (!matchedPlayer) {
      setActivePlayer(null);
      setActivePlayerNumber(null);
      setActivePlayerId(null);
      return;
    }
    if (matchedPlayer.number !== activePlayerNumber) {
      setActivePlayerNumber(matchedPlayer.number);
    }
  }, [activePlayer, activeSquadPlayers]);

  useEffect(() => {
    activeSquadIdRef.current = activeSquadId;
  }, [activeSquadId]);

  useEffect(() => {
    if (activeSquadId === "") {
      setActiveSquadId(squads[0]?.id ?? "");
      return;
    }
    if (squads.some((squad) => squad.id === activeSquadId)) return;
    setActiveSquadId(squads[0]?.id ?? "");
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
  }, [activeSquadId, squads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SQUADS_STORAGE_KEY, JSON.stringify(squads));
  }, [squads]);

  useEffect(() => {
    if (canEditTeamNames) return;
    setEditingTeam(null);
    setTeamNameDraft("");
    setEditingVenue(false);
    setVenueDraft("");
  }, [canEditTeamNames]);

  useEffect(() => {
    if (!editingTeam) return;
    const target = editingTeam === "HOME" ? homeNameInputRef.current : awayNameInputRef.current;
    target?.focus();
    target?.select();
  }, [editingTeam]);

  useEffect(() => {
    if (!editingVenue) return;
    venueInputRef.current?.focus();
    venueInputRef.current?.select();
  }, [editingVenue]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let handle: {
      destroy: () => void;
      setEvents: (events: readonly import("./core/stats/stats-event-model").MatchEvent[]) => void;
      setActiveEventKind: (kind: MatchEventKind) => void;
      undoLastEvent: () => void;
      setShowPlayerInitials: (show: boolean) => void;
      setOnMarkerTap: (handler: ((eventId: string) => void) | null) => void;
      setVisibleEventLimit: (limit: number | null) => void;
      setEventContext: (context: { half: 1 | 2; timestamp: number; canLog: boolean }) => void;
    } | null = null;
    void createPixiPitchSurface(host, {
      sport: mode.pitchSport,
      activeEventKind: selectedEventRef.current,
      showPlayerInitials,
      onEventLogged: (event) => {
        const teamSide = activeTeamRef.current;
        const nextEvent: LoggedMatchEvent = {
          ...event,
          id: `team-${teamSide.toLowerCase()}-${event.id}`,
          team: teamSide,
        };
        if (teamSide === "HOME") {
          nextEvent.playerId = activePlayerIdRef.current ?? null;
          if (SCORE_EVENT_KINDS.has(event.kind) && pendingScorerRef.current) {
            nextEvent.playerName = pendingScorerRef.current.name;
            nextEvent.playerNumber = pendingScorerRef.current.number;
            nextEvent.squadId = pendingScorerRef.current.squadId;
            pendingScorerRef.current = null;
          } else if (activePlayerRef.current) {
            nextEvent.playerName = activePlayerRef.current;
            nextEvent.playerNumber = activePlayerNumberRef.current ?? undefined;
            nextEvent.squadId = activeSquadIdRef.current;
          } else {
            pendingScorerRef.current = null;
          }
        }
        setLoggedEvents((prev) => {
          const next = [...prev, nextEvent];
          if (import.meta.env.DEV) {
            console.assert(
              next.length === prev.length + 1,
              "[stats-events] Logged pitch event should append exactly one event",
              {
                previousCount: prev.length,
                nextCount: next.length,
                kind: nextEvent.kind,
                half: nextEvent.half,
              },
            );
          }
          return next;
        });
      },
    }).then((nextHandle) => {
      if (disposed) {
        nextHandle.destroy();
        return;
      }
      handle = nextHandle;
      handleRef.current = nextHandle;
      nextHandle.setEventContext({
        half: matchEngineStateRef.current.currentHalf,
        timestamp: matchEngineStateRef.current.matchTimeSeconds,
        canLog:
          isLoggingActive(matchEngineStateRef.current.matchState) &&
          activeTeamRef.current === "HOME",
      });
    });
    return () => {
      disposed = true;
      handleRef.current = null;
      handle?.destroy();
    };
  }, [mode.pitchSport]);

  useEffect(() => {
    const syncRealtimeClock = () => {
      const current = matchEngineStateRef.current;
      const next = tickMatchClock(current, Date.now());
      if (next === current) return;
      matchEngineStateRef.current = next;
      setMatchTimeSeconds(next.matchTimeSeconds);
    };
    const timerId = window.setInterval(syncRealtimeClock, 250);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      syncRealtimeClock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const startFirstHalfAction = () => {
    const next = startFirstHalf(matchEngineStateRef.current);
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
  };

  const goToHalfTimeAction = () => {
    const next = goToHalfTime(matchEngineStateRef.current);
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
  };

  const startSecondHalfAction = () => {
    secondHalfSwitchBaselineEventCountRef.current = loggedEvents.length;
    reviewHalfRef.current = "H2";
    reviewEventGroupRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    reviewActivePlayerOnlyRef.current = false;
    setReviewHalf("H2");
    setReviewEventGroup("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setUtilityPanel(null);
    const next = startSecondHalf(matchEngineStateRef.current);
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
    // Eagerly sync the pitch surface so 2H taps register immediately,
    // independent of when the React effect for setEventContext runs.
    handleRef.current?.setEventContext({
      half: next.currentHalf,
      timestamp: next.matchTimeSeconds,
      canLog: isLoggingActive(next.matchState) && activeTeamRef.current === "HOME",
    });
  };

  const endMatchAction = () => {
    const next = endMatch(matchEngineStateRef.current);
    matchEngineStateRef.current = next;
    setMatchState(next.matchState);
    setCurrentHalf(next.currentHalf);
    setMatchTimeSeconds(next.matchTimeSeconds);
  };

  const openPlayersPanel = () => {
    setUtilityPanel("PLAYERS");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const openReviewPanel = () => {
    setShowReviewStrip(true);
    setUtilityPanel(null);
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const openMatchSummaryPanel = () => {
    setShowReviewStrip(false);
    setUtilityPanel("SUMMARY");
    setIsUtilityOpen(false);
    setIsPickerOpen(false);
  };

  const closeUtilityPanel = () => {
    setUtilityPanel(null);
  };

  const exitReviewMode = () => {
    reviewHalfRef.current = "FULL";
    reviewEventGroupRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
    setReviewEventGroup("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setSelectedReviewEventId(null);
    setUtilityPanel(null);
  };

  const addPlayer = () => {
    const nextPlayerName = playerDraft.trim();
    if (nextPlayerName.length === 0) return;
    const starterCount = activeSquadPlayers.filter((player) => player.role === "STARTER").length;
    const nextPlayerNumber =
      activeSquadPlayers.reduce((maxNumber, player) => Math.max(maxNumber, player.number), 0) + 1;
    const nextPlayerRole: PlayerRole = starterCount < 15 ? "STARTER" : "SUB";
    const nextPlayerId = `player-${newLocalEventId()}`;
    updateActiveSquadPlayers(
      (prevPlayers) => [
        ...prevPlayers,
        {
          id: nextPlayerId,
          name: nextPlayerName.slice(0, 24),
          number: Math.min(99, nextPlayerNumber),
          role: nextPlayerRole,
        },
      ],
      activePlayerEntry?.id ?? nextPlayerId,
    );
    setPlayerDraft("");
  };

  const resetMatch = () => {
    setLoggedEvents([]);
    reviewHalfRef.current = "FULL";
    reviewEventGroupRef.current = "ALL";
    reviewZoneRef.current = "FULL";
    setReviewHalf("FULL");
    setReviewEventGroup("ALL");
    setReviewActivePlayerOnly(false);
    setReviewZone("FULL");
    setShowReviewStrip(false);
    setUtilityPanel(null);
    setActivePlayer(null);
    setActivePlayerNumber(null);
    setActivePlayerId(null);
    setPlayerDraft("");
    setMatchState("PRE_MATCH");
    setCurrentHalf(1);
    setMatchTimeSeconds(0);
    matchEngineStateRef.current = createInitialMatchEngineState();
    handleRef.current?.setEvents([]);
    handleRef.current?.setEventContext({
      half: 1,
      timestamp: 0,
      canLog: false,
    });
    setIsUtilityOpen(false);
  };

  useEffect(() => {
    handleRef.current?.setEventContext({
      half: currentHalf,
      timestamp: matchTimeSeconds,
      canLog: isLoggingActive(matchState) && activeTeam === "HOME",
    });
  }, [activeTeam, currentHalf, matchTimeSeconds, matchState]);

  useEffect(() => {
    if (currentHalf !== 2) return;
    const baseline = secondHalfSwitchBaselineEventCountRef.current;
    if (baseline == null) return;
    if (import.meta.env.DEV) {
      console.assert(
        loggedEvents.length >= baseline,
        "[stats-events] Switching to second half must not reduce total event count",
        {
          baselineCount: baseline,
          currentCount: loggedEvents.length,
        },
      );
    }
    secondHalfSwitchBaselineEventCountRef.current = null;
  }, [currentHalf, loggedEvents.length]);

  useEffect(() => {
    const visibleLimit =
      visibilityMode === "LAST_5" ? 5 : visibilityMode === "LAST_10" ? 10 : null;
    handleRef.current?.setVisibleEventLimit(visibleLimit);
  }, [visibilityMode]);

  useEffect(() => {
    handleRef.current?.setShowPlayerInitials(showPlayerInitials);
  }, [showPlayerInitials]);

  useEffect(() => {
    const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";
    handleRef.current?.setOnMarkerTap(
      isReviewModeActive
        ? (eventId) => {
            setSelectedReviewEventId(eventId);
          }
        : null,
    );
    if (!isReviewModeActive) {
      setSelectedReviewEventId(null);
    }
  }, [showReviewStrip, utilityPanel]);

  useEffect(() => {
    handleRef.current?.setEvents(
      getRenderablePitchEvents(
        loggedEvents,
        reviewHalf,
        reviewEventGroup,
        REVIEW_EVENT_GROUP_KINDS,
        reviewZone,
        getEffectiveAttackingDirection(firstHalfAttackingDirection, currentHalf),
        reviewActivePlayerOnly,
        activePlayerId,
      ),
    );
  }, [loggedEvents, reviewHalf, reviewEventGroup, REVIEW_EVENT_GROUP_KINDS, reviewZone, firstHalfAttackingDirection, currentHalf, reviewActivePlayerOnly, activePlayerId]);

  useEffect(() => {
    if (!selectedReviewEventId) return;
    if (loggedEvents.some((event) => event.id === selectedReviewEventId)) return;
    setSelectedReviewEventId(null);
  }, [loggedEvents, selectedReviewEventId]);

  useEffect(() => {
    const updateLandscape = () => {
      setIsLandscape(window.matchMedia("(orientation: landscape)").matches);
    };
    updateLandscape();

    window.addEventListener("resize", updateLandscape);
    return () => {
      window.removeEventListener("resize", updateLandscape);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(Math.round(inset));
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
    };
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingControlsRef.current?.contains(target)) return;
      setIsPickerOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isUtilityOpen) return;

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if ((event.currentTarget as Node | null) === null) {
        // no-op guard to keep TS satisfied about event usage shape
      }
      if ((document.querySelector(".utility-controls") as HTMLElement | null)?.contains(target)) return;
      setIsUtilityOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [isUtilityOpen]);

  const matchStateToken =
    matchState === "FIRST_HALF" || matchState === "SECOND_HALF"
      ? `H${currentHalf}`
      : matchState === "HALF_TIME"
        ? "HT"
        : matchState === "FULL_TIME"
          ? "FT"
          : "PRE";

  const contextualAction: { label: string; onClick: () => void } | null =
    matchState === "PRE_MATCH"
      ? { label: "START", onClick: startFirstHalfAction }
      : matchState === "FIRST_HALF"
        ? { label: "HT", onClick: goToHalfTimeAction }
        : matchState === "HALF_TIME"
          ? { label: "2H", onClick: startSecondHalfAction }
          : matchState === "SECOND_HALF"
            ? { label: "FT", onClick: endMatchAction }
            : null;

  const effectiveAttackingDirection = getEffectiveAttackingDirection(
    firstHalfAttackingDirection,
    currentHalf,
  );
  const renderableLoggedEvents = useMemo(
    () =>
      getRenderablePitchEvents(
        loggedEvents,
        reviewHalf,
        reviewEventGroup,
        REVIEW_EVENT_GROUP_KINDS,
        reviewZone,
        effectiveAttackingDirection,
        reviewActivePlayerOnly,
        activePlayerId,
      ),
    [loggedEvents, reviewHalf, reviewEventGroup, REVIEW_EVENT_GROUP_KINDS, reviewZone, effectiveAttackingDirection, reviewActivePlayerOnly, activePlayerId],
  );
  const attackingDirectionHalfLabel = currentHalf === 2 ? "2H" : "1H";
  const attackingDirectionLabel =
    effectiveAttackingDirection === "RIGHT"
      ? `${attackingDirectionHalfLabel} ATTACKING →`
      : `← ${attackingDirectionHalfLabel} ATTACKING`;
  const canSetFirstHalfAttackingDirection = matchState === "PRE_MATCH";
  const toggleFirstHalfAttackingDirection = () => {
    if (!canSetFirstHalfAttackingDirection) return;
    setFirstHalfAttackingDirection((prev) => oppositeAttackingDirection(prev));
  };
  const isReviewModeActive = showReviewStrip || utilityPanel === "REVIEW";
  const playerById = useMemo(() => {
    const next = new Map<string, SquadPlayer>();
    for (const squad of squads) {
      for (const player of squad.players) {
        next.set(player.id, player);
      }
    }
    return next;
  }, [squads]);
  const selectedReviewEvent =
    selectedReviewEventId == null
      ? null
      : loggedEvents.find((event) => event.id === selectedReviewEventId) ?? null;
  const selectedReviewPlayerLabel =
    selectedReviewEvent == null
      ? null
      : selectedReviewEvent.playerId == null
        ? "No player"
        : (() => {
            const matchedPlayer = playerById.get(selectedReviewEvent.playerId);
            if (!matchedPlayer) return "Unknown player";
            return `#${matchedPlayer.number} ${matchedPlayer.name}`;
          })();
  const activeReviewPlayerLabel =
    activePlayerId == null ? null : (() => {
      const player = playerById.get(activePlayerId);
      return player ? `#${player.number} ${player.name}` : null;
    })();
  const reviewMatchSummaryLines = useMemo(() => {
    const playerStats = new Map<
      string,
      { goals: number; points: number; twoPointers: number; turnoversWon: number; kickoutsWon: number; freesWon: number }
    >();
    let wides = 0;
    let shots = 0;
    let scores = 0;
    for (const event of loggedEvents) {
      if (event.team !== "HOME") continue;
      if (event.kind === "WIDE") wides += 1;
      if (event.kind === "SHOT" || event.kind === "GOAL" || event.kind === "POINT" || event.kind === "TWO_POINTER" || event.kind === "FORTY_FIVE_TWO_POINT" || event.kind === "FREE_SCORED" || event.kind === "WIDE") shots += 1;
      if (event.kind === "GOAL" || event.kind === "POINT" || event.kind === "TWO_POINTER" || event.kind === "FORTY_FIVE_TWO_POINT" || event.kind === "FREE_SCORED") scores += 1;
      const playerId = event.playerId;
      if (!playerId || !playerById.has(playerId)) continue;
      const stat = playerStats.get(playerId) ?? { goals: 0, points: 0, twoPointers: 0, turnoversWon: 0, kickoutsWon: 0, freesWon: 0 };
      if (event.kind === "GOAL") stat.goals += 1;
      else if (event.kind === "POINT") stat.points += 1;
      else if (event.kind === "TWO_POINTER") stat.twoPointers += 1;
      else if (event.kind === "FORTY_FIVE_TWO_POINT") stat.twoPointers += 1;
      else if (event.kind === "FREE_SCORED") stat.points += 1;
      else if (event.kind === "TURNOVER_WON") stat.turnoversWon += 1;
      else if (event.kind === "KICKOUT_WON") stat.kickoutsWon += 1;
      else if (event.kind === "FREE_WON") stat.freesWon += 1;
      playerStats.set(playerId, stat);
    }
    const formatPlayer = (playerId: string) => {
      const player = playerById.get(playerId);
      return player ? `#${player.number} ${player.name}` : null;
    };
    const topBy = (key: "turnoversWon" | "kickoutsWon" | "freesWon", label: string) => {
      let best: { playerId: string; value: number } | null = null;
      for (const [playerId, stat] of playerStats) {
        if (stat[key] <= 0) continue;
        if (!best || stat[key] > best.value) best = { playerId, value: stat[key] };
      }
      if (!best) return null;
      const playerLabel = formatPlayer(best.playerId);
      return playerLabel ? `${playerLabel} — ${label} (${best.value})` : null;
    };
    let topScorerLine: string | null = null;
    let bestScore = 0;
    for (const [playerId, stat] of playerStats) {
      const total = stat.goals * 3 + stat.points + stat.twoPointers * 2;
      if (total <= 0 || total < bestScore) continue;
      const playerLabel = formatPlayer(playerId);
      if (!playerLabel) continue;
      bestScore = total;
      topScorerLine = `${playerLabel} — Top Scorer (${stat.goals}-${String(stat.points + stat.twoPointers * 2).padStart(2, "0")})`;
    }
    const restartSummaryLabel = mode.restartLabel === "Puckout" ? "Most Puckouts Won" : "Most Kickouts Won";
    const lines = [topScorerLine, topBy("turnoversWon", "Most Turnovers Won"), topBy("kickoutsWon", restartSummaryLabel), topBy("freesWon", "Most Frees Won")].filter(
      (line): line is string => line != null,
    );
    if (wides > 0) lines.push(`Wides: ${wides}`);
    if (shots > 0) lines.push(`Conversion: ${Math.round((scores / shots) * 100)}%`);
    return lines;
  }, [loggedEvents, playerById, mode.restartLabel]);

  const homeScore = useMemo(() => computeTeamScore(loggedEvents, "HOME"), [loggedEvents]);
  const awayScore = useMemo(() => computeTeamScore(loggedEvents, "AWAY"), [loggedEvents]);

  const scoreboard = isLandscape ? (
    <div className="scoreboard-rail" aria-label="Match scoreboard">
      <div className="scoreboard-rail-venue">
        {editingVenue ? (
          <input
            ref={venueInputRef}
            className="scoreboard-rail-venue-input"
            value={venueDraft}
            onChange={(event) => {
              setVenueDraft(event.target.value.slice(0, 24));
            }}
            onBlur={commitVenueEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitVenueEdit();
              }
            }}
            maxLength={24}
            placeholder="Venue"
            aria-label="Edit venue"
          />
        ) : (
          <>
            <span className="scoreboard-rail-venue-label">
              {venueName.length > 0 ? venueName : "Venue"}
            </span>
            {canEditTeamNames ? (
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit venue"
                onClick={startVenueEdit}
              >
                ✏️
              </button>
            ) : null}
          </>
        )}
      </div>
      <div className="scoreboard-rail-team-wrap">
        {canEditTeamNames ? (
          editingTeam === "HOME" ? (
            <input
              ref={homeNameInputRef}
              className="scoreboard-rail-name-input"
              value={teamNameDraft}
              onChange={(event) => {
                setTeamNameDraft(event.target.value.slice(0, 15));
              }}
              onBlur={commitTeamNameEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTeamNameEdit();
                }
              }}
              maxLength={15}
              aria-label="Edit team A name"
            />
          ) : (
            <span className="scoreboard-rail-name-line">
              <span className="scoreboard-rail-team-name">{teamNames.HOME}</span>
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit team A name"
                onClick={() => startTeamNameEdit("HOME")}
              >
                ✏️
              </button>
            </span>
          )
        ) : (
          <button
            type="button"
            className="scoreboard-rail-team-btn"
            onClick={() => setActiveTeam("HOME")}
            style={
              activeTeam === "HOME"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-team-btn-name">{teamNames.HOME}</span>
          </button>
        )}
      </div>
      <div className="scoreboard-rail-score">
        {formatGaelicScore(homeScore)}
        <span className="scoreboard-rail-total">({homeScore.total})</span>
      </div>
      <div className="scoreboard-rail-separator">v</div>
      <div className="scoreboard-rail-score">
        {formatGaelicScore(awayScore)}
        <span className="scoreboard-rail-total">({awayScore.total})</span>
      </div>
      <div className="scoreboard-rail-team-wrap">
        {canEditTeamNames ? (
          editingTeam === "AWAY" ? (
            <input
              ref={awayNameInputRef}
              className="scoreboard-rail-name-input"
              value={teamNameDraft}
              onChange={(event) => {
                setTeamNameDraft(event.target.value.slice(0, 15));
              }}
              onBlur={commitTeamNameEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTeamNameEdit();
                }
              }}
              maxLength={15}
              aria-label="Edit team B name"
            />
          ) : (
            <span className="scoreboard-rail-name-line">
              <span className="scoreboard-rail-team-name">{teamNames.AWAY}</span>
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit team B name"
                onClick={() => startTeamNameEdit("AWAY")}
              >
                ✏️
              </button>
            </span>
          )
        ) : (
          <button
            type="button"
            className="scoreboard-rail-team-btn"
            onClick={() => setActiveTeam("AWAY")}
            style={
              activeTeam === "AWAY"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-team-btn-name">{teamNames.AWAY}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        className="scoreboard-attack-btn scoreboard-attack-btn--rail"
        onClick={toggleFirstHalfAttackingDirection}
        disabled={!canSetFirstHalfAttackingDirection}
        aria-label={`Tracked team attacking ${
          effectiveAttackingDirection === "RIGHT" ? "right" : "left"
        }`}
      >
        {attackingDirectionLabel}
      </button>
    </div>
  ) : (
    <div className="scoreboard-strip" aria-label="Match scoreboard">
      <div className="scoreboard-strip-venue">
        {editingVenue ? (
          <input
            ref={venueInputRef}
            className="scoreboard-strip-venue-input"
            value={venueDraft}
            onChange={(event) => {
              setVenueDraft(event.target.value.slice(0, 24));
            }}
            onBlur={commitVenueEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitVenueEdit();
              }
            }}
            maxLength={24}
            placeholder="Venue"
            aria-label="Edit venue"
          />
        ) : (
          <>
            <span className="scoreboard-strip-venue-label">
              {venueName.length > 0 ? venueName : "Venue"}
            </span>
            {canEditTeamNames ? (
              <button
                type="button"
                className="scoreboard-name-edit-btn"
                aria-label="Edit venue"
                onClick={startVenueEdit}
              >
                ✏️
              </button>
            ) : null}
          </>
        )}
      </div>
      <div className="scoreboard-strip-line">
        {canEditTeamNames ? (
          <span className="scoreboard-side">
            {editingTeam === "HOME" ? (
              <input
                ref={homeNameInputRef}
                className="scoreboard-name-input"
                value={teamNameDraft}
                onChange={(event) => {
                  setTeamNameDraft(event.target.value.slice(0, 15));
                }}
                onBlur={commitTeamNameEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitTeamNameEdit();
                  }
                }}
                maxLength={15}
                aria-label="Edit team A name"
              />
            ) : (
              <span className="scoreboard-side-label-wrap">
                <span className="scoreboard-side-label">{teamNames.HOME}</span>
                <button
                  type="button"
                  className="scoreboard-name-edit-btn"
                  aria-label="Edit team A name"
                  onClick={() => startTeamNameEdit("HOME")}
                >
                  ✏️
                </button>
              </span>
            )}
            <span className="scoreboard-side-score">
              {formatGaelicScore(homeScore)}
              <span className="scoreboard-total">({homeScore.total})</span>
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="scoreboard-side scoreboard-side-btn"
            onClick={() => setActiveTeam("HOME")}
            aria-pressed={activeTeam === "HOME"}
            style={
              activeTeam === "HOME"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-side-label">{teamNames.HOME}</span>
            <span className="scoreboard-side-score">
              {formatGaelicScore(homeScore)}
              <span className="scoreboard-total">({homeScore.total})</span>
            </span>
          </button>
        )}
        {canEditTeamNames ? (
          <span className="scoreboard-side">
            {editingTeam === "AWAY" ? (
              <input
                ref={awayNameInputRef}
                className="scoreboard-name-input"
                value={teamNameDraft}
                onChange={(event) => {
                  setTeamNameDraft(event.target.value.slice(0, 15));
                }}
                onBlur={commitTeamNameEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitTeamNameEdit();
                  }
                }}
                maxLength={15}
                aria-label="Edit team B name"
              />
            ) : (
              <span className="scoreboard-side-label-wrap">
                <span className="scoreboard-side-label">{teamNames.AWAY}</span>
                <button
                  type="button"
                  className="scoreboard-name-edit-btn"
                  aria-label="Edit team B name"
                  onClick={() => startTeamNameEdit("AWAY")}
                >
                  ✏️
                </button>
              </span>
            )}
            <span className="scoreboard-side-score">
              {formatGaelicScore(awayScore)}
              <span className="scoreboard-total">({awayScore.total})</span>
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="scoreboard-side scoreboard-side-btn"
            onClick={() => setActiveTeam("AWAY")}
            aria-pressed={activeTeam === "AWAY"}
            style={
              activeTeam === "AWAY"
                ? {
                    border: "1px solid rgba(34,197,94,0.9)",
                    background: "rgba(22,101,52,0.72)",
                  }
                : undefined
            }
          >
            <span className="scoreboard-side-label">{teamNames.AWAY}</span>
            <span className="scoreboard-side-score">
              {formatGaelicScore(awayScore)}
              <span className="scoreboard-total">({awayScore.total})</span>
            </span>
          </button>
        )}
      </div>
      <div className="scoreboard-attack-row">
        <button
          type="button"
          className="scoreboard-attack-btn scoreboard-attack-btn--strip"
          onClick={toggleFirstHalfAttackingDirection}
          disabled={!canSetFirstHalfAttackingDirection}
          aria-label={`Tracked team attacking ${
            effectiveAttackingDirection === "RIGHT" ? "right" : "left"
          }`}
        >
          {attackingDirectionLabel}
        </button>
      </div>
    </div>
  );

  const utilityControlsClass = isLandscape
    ? "utility-controls utility-controls--landscape"
    : "utility-controls utility-controls--portrait";
  const utilityPanelClass = isLandscape
    ? "utility-overlay-panel utility-overlay-panel--landscape"
    : "utility-overlay-panel utility-overlay-panel--portrait";
  const reviewPanelClass =
    isLandscape && utilityPanel === "REVIEW"
      ? `${utilityPanelClass} utility-overlay-panel--review-landscape`
      : utilityPanelClass;
  const starterPlayers = activeSquadPlayers.filter((player) => player.role === "STARTER");
  const subPlayers = activeSquadPlayers.filter((player) => player.role === "SUB");
  const formationPlayers = starterPlayers.slice(0, 15);
  const subsPlayers = subPlayers;
  const formationRows: SquadPlayer[][] = [];
  let formationCursor = 0;
  for (const rowSize of FORMATION_ROW_SIZES) {
    formationRows.push(formationPlayers.slice(formationCursor, formationCursor + rowSize));
    formationCursor += rowSize;
  }
  const activePlayerChipText =
    activePlayerEntry != null
      ? `Active: #${activePlayerEntry.number} ${activePlayerEntry.name}`
      : null;
  const activePlayerChipFloatingStyle =
    keyboardInset > 0
      ? { bottom: `${keyboardInset + 18}px` }
      : { bottom: "max(88px, calc(env(safe-area-inset-bottom) + 84px))" };
  const playersPanelStyle = isLandscape
    ? { zIndex: 10001 }
    : keyboardInset > 0
      ? {
          zIndex: 10001,
          left: "14px",
          top: "max(10px, env(safe-area-inset-top))",
          bottom: "auto",
        }
      : {
          zIndex: 10001,
          left: "14px",
          bottom: "max(142px, calc(env(safe-area-inset-bottom) + 120px))",
        };

  return (
    <>
      <main className="app-root">
        <style>{PANEL_CSS}</style>
        {scoreboard}
      {utilityPanel === "PLAYERS" ? (
        <div
          className={utilityPanelClass}
          role="dialog"
          aria-label="Home players"
          style={playersPanelStyle}
        >
          <div className="utility-review-scroll">
          <div className="utility-panel-title">HOME Players</div>
          <div className="utility-squad-row">
            <select
              className="utility-squad-select"
              value={activeSquad.id}
              onChange={(event) => {
                setActiveSquadById(event.target.value);
              }}
              aria-label="Select home squad"
            >
              {squads.map((squad) => (
                <option key={squad.id} value={squad.id}>
                  {squad.name}
                </option>
              ))}
            </select>
          </div>
          <div className="utility-squad-create">
            <input
              type="text"
              className="utility-squad-input"
              value={squadDraft}
              onChange={(event) => {
                setSquadDraft(event.target.value);
              }}
              placeholder="New or rename squad"
            />
            <button type="button" className="utility-review-btn" onClick={createSquad}>
              New
            </button>
            <button type="button" className="utility-review-btn" onClick={saveActiveSquadName}>
              Rename
            </button>
          </div>
          {activePlayerChipText ? (
            <div
              className="utility-active-player-chip"
              aria-live="polite"
              onClick={() => selectActivePlayerById(null)}
            >
              {activePlayerChipText}
            </div>
          ) : null}
          <div className="utility-player-add-row">
            <input
              type="text"
              className="utility-player-input"
              value={playerDraft}
              onChange={(event) => {
                setPlayerDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addPlayer();
              }}
              placeholder="Add player"
            />
            <button type="button" className="utility-review-btn" onClick={addPlayer}>
              Add
            </button>
          </div>
          <div className="utility-formation" aria-label="Home formation">
            {formationRows.map((row, rowIdx) =>
              row.length > 0 ? (
                <div key={`formation-row-${rowIdx}`} className="utility-formation-row">
                  {row.map((player, playerIdx) => {
                    const isActive = activePlayerEntry?.id === player.id;
                    return (
                      <button
                        key={`formation-${rowIdx}-${playerIdx}-${player.id}`}
                        type="button"
                        className="utility-player-pill"
                        onClick={() => {
                          handlePlayerPick(player);
                        }}
                        onDoubleClick={() => {
                          editPlayer(player.id);
                        }}
                        style={
                          isActive
                            ? {
                                border: "1px solid rgba(125,211,252,0.9)",
                                background: "rgba(14,116,144,0.38)",
                              }
                            : undefined
                        }
                      >
                        {isActive ? "● " : ""}
                        #{player.number} {player.name}
                      </button>
                    );
                  })}
                </div>
              ) : null,
            )}
          </div>
          {subsPlayers.length > 0 ? (
            <div className="utility-subs-wrap">
              <div className="utility-subs-title">Subs</div>
              <div className="utility-subs-row" aria-label="Home substitutes">
                {subsPlayers.map((player, idx) => {
                  const isActive = activePlayerEntry?.id === player.id;
                  return (
                    <button
                      key={`sub-${idx}-${player.id}`}
                      type="button"
                      className="utility-player-pill"
                      onClick={() => {
                        handlePlayerPick(player);
                      }}
                      onDoubleClick={() => {
                        editPlayer(player.id);
                      }}
                      style={
                        isActive
                          ? {
                              border: "1px solid rgba(125,211,252,0.9)",
                              background: "rgba(14,116,144,0.38)",
                            }
                          : undefined
                      }
                    >
                      {isActive ? "● " : ""}
                      #{player.number} {player.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          </div>
          <button
            type="button"
            className="utility-panel-close utility-panel-close--sticky"
            onClick={closeUtilityPanel}
          >
            Close
          </button>
        </div>
      ) : null}
      {utilityPanel === "REVIEW" ? (
        <div className={reviewPanelClass} role="dialog" aria-label="Review mode">
          <div className="utility-review-scroll">
            <div className="utility-panel-title">Review</div>
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Half
            </div>
            {([
              { id: "H1", label: "H1" },
              { id: "H2", label: "H2" },
              { id: "FULL", label: "FULL" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  setReviewHalf(option.id);
                  setShowReviewStrip(true);
                  closeUtilityPanel();
                }}
                style={
                  reviewHalf === option.id
                    ? {
                        border: "1px solid rgba(125,211,252,0.9)",
                        background: "rgba(14,116,144,0.38)",
                      }
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Event Group
            </div>
            {REVIEW_EVENT_GROUP_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  if (option.id === "ACTIVE") {
                    setReviewActivePlayerOnly((prev) => !prev);
                  } else {
                    setReviewEventGroup(option.id);
                  }
                  setShowReviewStrip(true);
                  closeUtilityPanel();
                }}
                style={
                  option.id === "ACTIVE" ? (reviewActivePlayerOnly ? {
                        border: "1px solid rgba(125,211,252,0.9)",
                        background: "rgba(14,116,144,0.38)",
                      } : undefined) : reviewEventGroup === option.id
                    ? {
                        border: "1px solid rgba(125,211,252,0.9)",
                        background: "rgba(14,116,144,0.38)",
                      }
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
            <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.86 }}>
              Zone
            </div>
            {([
              { id: "FULL", label: "FULL" },
              { id: "OWN_HALF", label: "OWN HALF" },
              { id: "OPPOSITION_HALF", label: "OPP HALF" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="utility-review-btn"
                onClick={() => {
                  setReviewZone(option.id);
                  setShowReviewStrip(true);
                  closeUtilityPanel();
                }}
                style={
                  reviewZone === option.id
                    ? {
                        border: "1px solid rgba(125,211,252,0.9)",
                        background: "rgba(14,116,144,0.38)",
                      }
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
            <div
              className="utility-panel-title"
              style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}
            >
              {renderableLoggedEvents.length} events shown
            </div>
            {reviewActivePlayerOnly && activePlayerId && activeReviewPlayerLabel ? (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                ACTIVE: {activeReviewPlayerLabel} · {renderableLoggedEvents.length} events
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="utility-panel-close utility-panel-close--sticky"
            onClick={closeUtilityPanel}
          >
            Close
          </button>
        </div>
      ) : null}
      {utilityPanel === "SUMMARY" ? (
        <div className={utilityPanelClass} role="dialog" aria-label="Match summary">
          <div className="utility-review-scroll">
            <div className="utility-panel-title">MATCH SUMMARY</div>
            {reviewMatchSummaryLines.length > 0 ? (
              reviewMatchSummaryLines.map((line) => (
                <div key={`summary-panel-${line}`} className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                  {line}
                </div>
              ))
            ) : (
              <div className="utility-panel-title" style={{ fontSize: "9px", opacity: 0.9, textTransform: "none" }}>
                No tagged match data yet.
              </div>
            )}
          </div>
          <button type="button" className="utility-panel-close" onClick={closeUtilityPanel}>
            Close
          </button>
        </div>
      ) : null}
      {showReviewStrip && utilityPanel !== "REVIEW" ? (
        <div
          className={`review-strip ${isLandscape ? "review-strip--landscape" : "review-strip--portrait"}`}
          role="toolbar"
          aria-label="Review quick controls"
        >
          {([
            { id: "H1", label: "H1" },
            { id: "H2", label: "H2" },
            { id: "FULL", label: "FULL" },
          ] as const).map((option) => (
            <button
              key={`strip-half-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewHalf(option.id);
              }}
              style={
                reviewHalf === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          {REVIEW_EVENT_GROUP_OPTIONS.map((option) => (
            <button
              key={`strip-group-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                if (option.id === "ACTIVE") {
                  setReviewActivePlayerOnly((prev) => !prev);
                } else {
                  setReviewEventGroup(option.id);
                }
              }}
              style={
                option.id === "ACTIVE" ? (reviewActivePlayerOnly ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    } : undefined) : reviewEventGroup === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          {([
            { id: "OWN_HALF", label: "DEF HALF" },
            { id: "OPPOSITION_HALF", label: "ATT HALF" },
          ] as const).map((option) => (
            <button
              key={`strip-zone-${option.id}`}
              type="button"
              className="review-strip-chip"
              onClick={() => {
                setReviewZone(option.id);
              }}
              style={
                reviewZone === option.id
                  ? {
                      border: "1px solid rgba(125,211,252,0.9)",
                      background: "rgba(14,116,144,0.38)",
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="review-strip-chip"
            onClick={exitReviewMode}
            style={{ border: "1px solid rgba(248,113,113,0.68)", background: "rgba(127,29,29,0.35)" }}
          >
            Exit
          </button>
        </div>
      ) : null}
      {isReviewModeActive && selectedReviewEvent ? (
        <div
          className={`review-event-card ${isLandscape ? "review-event-card--landscape" : "review-event-card--portrait"}`}
          role="status"
          aria-live="polite"
        >
          <div className="review-event-card-head">
            <div className="review-event-card-title">Event detail</div>
            <button
              type="button"
              className="review-event-card-close"
              aria-label="Close event detail"
              onClick={() => {
                setSelectedReviewEventId(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Type</span>
            <span className="review-event-card-row-value">{selectedReviewEvent.kind}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Player</span>
            <span className="review-event-card-row-value">{selectedReviewPlayerLabel}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Half</span>
            <span className="review-event-card-row-value">H{selectedReviewEvent.half}</span>
          </div>
          <div className="review-event-card-row">
            <span className="review-event-card-row-label">Time</span>
            <span className="review-event-card-row-value">
              {formatMatchClock(selectedReviewEvent.timestamp)}
            </span>
          </div>
        </div>
      ) : null}
      <div className="match-stopwatch" aria-live="polite">
        <span className="match-stopwatch-state">{matchStateToken}</span>
        <span className="match-stopwatch-clock">{formatMatchClock(matchTimeSeconds)}</span>
        <div className="match-stopwatch-controls">
          {contextualAction ? (
            <button
              type="button"
              className="match-stopwatch-btn"
              onClick={contextualAction.onClick}
            >
              {contextualAction.label}
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={floatingControlsRef}
        className="floating-controls"
      >
          {!isLandscape && isPickerOpen ? (
            <div className="event-panel">
              <div className="event-grid">
                {EVENT_BUTTONS.map((item, idx) => {
                  const isActive = item.kind === selectedEventKind;
                  const isScoring = idx <= 4;
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="event-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={{
                        border: isActive
                          ? "1px solid rgba(34,197,94,0.96)"
                          : isScoring
                            ? "1px solid rgba(148,163,184,0.52)"
                            : "1px solid rgba(148,163,184,0.36)",
                        background: isActive
                          ? "rgba(22,101,52,0.7)"
                          : isScoring
                            ? "rgba(21, 39, 62, 0.84)"
                            : "rgba(14, 24, 40, 0.72)",
                        fontWeight: isActive ? 700 : 600,
                        opacity: isDisabledForAway ? 0.46 : 1,
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="visibility-row">
                {([
                  { id: "ALL", label: "Show All" },
                  { id: "LAST_5", label: "Last 5 mins" },
                  { id: "LAST_10", label: "Last 10 mins" },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className="visibility-btn"
                    onClick={() => {
                      setVisibilityMode(mode.id);
                    }}
                    style={{
                      border:
                        visibilityMode === mode.id
                          ? "1px solid rgba(125,211,252,0.9)"
                          : "1px solid rgba(148,163,184,0.4)",
                      background:
                        visibilityMode === mode.id
                          ? "rgba(14,116,144,0.42)"
                          : "rgba(15,23,42,0.9)",
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="undo-wrap">
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className="undo-btn"
                    onClick={openReviewPanel}
                    style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    className="undo-btn"
                    onClick={openMatchSummaryPanel}
                    style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                  >
                    Match Summary
                  </button>
                  <button
                    type="button"
                    className="undo-btn"
                    onClick={() => {
                      undoLastEventAction();
                      setIsPickerOpen(false);
                    }}
                    style={{ border: "1px solid rgba(148,163,184,0.4)" }}
                  >
                    Undo last
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {isLandscape && isPickerOpen ? (
            <div className="landscape-toolbar">
              <div className="landscape-toolbar-row">
                {EVENT_BUTTONS.slice(0, 5).map((item) => {
                  const isActive = item.kind === selectedEventKind;
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="landscape-toolbar-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={
                        isActive || isDisabledForAway
                          ? {
                              ...(isActive
                                ? {
                                    border: "1px solid rgba(34,197,94,0.96)",
                                    background: "rgba(22,101,52,0.7)",
                                  }
                                : {}),
                              ...(isDisabledForAway ? { opacity: 0.46 } : {}),
                            }
                          : undefined
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="landscape-toolbar-row">
                {EVENT_BUTTONS.slice(5).map((item) => {
                  const isActive = item.kind === selectedEventKind;
                  const isDisabledForAway =
                    activeTeam === "AWAY" && !AWAY_INSTANT_SCORING_KINDS.has(item.kind);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="landscape-toolbar-btn"
                      disabled={isDisabledForAway}
                      onClick={() => {
                        handleEventButtonPress(item.kind);
                      }}
                      style={
                        isActive || isDisabledForAway
                          ? {
                              ...(isActive
                                ? {
                                    border: "1px solid rgba(34,197,94,0.96)",
                                    background: "rgba(22,101,52,0.7)",
                                  }
                                : {}),
                              ...(isDisabledForAway ? { opacity: 0.46 } : {}),
                            }
                          : undefined
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="landscape-toolbar-secondary">
                {([
                  { id: "ALL", label: "Show All" },
                  { id: "LAST_5", label: "Last 5 mins" },
                  { id: "LAST_10", label: "Last 10 mins" },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className="landscape-toolbar-secondary-btn"
                    onClick={() => {
                      setVisibilityMode(mode.id);
                    }}
                    style={{
                      border:
                        visibilityMode === mode.id
                          ? "1px solid rgba(125,211,252,0.9)"
                          : "1px solid rgba(148,163,184,0.36)",
                      background:
                        visibilityMode === mode.id
                          ? "rgba(14,116,144,0.4)"
                          : "rgba(15,23,42,0.84)",
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={openReviewPanel}
                  style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                >
                  Review
                </button>
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={openMatchSummaryPanel}
                  style={{ border: "1px solid rgba(125,211,252,0.52)" }}
                >
                  Match Summary
                </button>
                <button
                  type="button"
                  className="landscape-toolbar-secondary-btn"
                  onClick={() => {
                    undoLastEventAction();
                  }}
                >
                  Undo
                </button>
              </div>
            </div>
          ) : null}
          {!isPickerOpen && !isLandscape ? (
            <div aria-live="polite" className="active-chip">
              {EVENT_LABEL_BY_KIND[selectedEventKind]}
            </div>
          ) : null}
          <button
            type="button"
            className="player-bubble-btn"
            aria-label="Open players panel"
            onClick={openPlayersPanel}
          >
            👤
          </button>
          <button
            type="button"
            onClick={() => {
              toggleMatchBubble();
            }}
            aria-label="Toggle event picker"
            aria-expanded={isPickerOpen}
            className="bubble-btn"
            style={{
              border: isPickerOpen
                ? "1px solid rgba(34,197,94,0.78)"
                : "1px solid rgba(148,163,184,0.45)",
              boxShadow: isPickerOpen
                ? "0 0 0 1px rgba(34,197,94,0.34), 0 0 14px rgba(34,197,94,0.32)"
                : "0 0 0 1px rgba(148,163,184,0.16), 0 0 8px rgba(148,163,184,0.16)",
            }}
          >
            {isPickerOpen ? "×" : "●"}
          </button>
      </div>
        <div
          ref={hostRef}
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0f0c",
            overflow: "hidden",
          }}
          aria-label="PáircVision Pixi pitch"
          role="img"
        />
      </main>
      {activePlayerChipText ? (
        <button
          type="button"
          className="utility-active-player-chip utility-active-player-chip-floating"
          aria-live="polite"
          aria-label="Clear active player"
          title="Clear active player"
          style={{ ...activePlayerChipFloatingStyle, pointerEvents: "auto" }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectActivePlayerById(null);
          }}
        >
          {activePlayerChipText}
        </button>
      ) : null}
      {utilityPanel == null ? (
        <div className={utilityControlsClass}>
          {isUtilityOpen ? (
            <div className="utility-menu">
              <button
                type="button"
                className="utility-menu-btn"
                disabled
                style={{ opacity: 0.8, cursor: "default" }}
              >
                {teamNames.HOME} v {teamNames.AWAY}
              </button>
              <button
                type="button"
                className="utility-menu-btn"
                disabled
                style={{ opacity: 0.8, cursor: "default", textTransform: "none" }}
              >
                {venueName.length > 0 ? venueName : "Venue"}
              </button>
              {MODE_MENU_OPTIONS.map((option) => {
                const isActiveMode = option.key === currentMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className="utility-menu-btn"
                    onClick={() => {
                      setCurrentMode(option.key);
                    }}
                    style={
                      isActiveMode
                        ? {
                            border: "1px solid rgba(34,197,94,0.9)",
                            background: "rgba(22,101,52,0.72)",
                          }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
              <button type="button" className="utility-menu-btn" onClick={resetMatch}>
                Restart Match
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="utility-bubble-btn"
            aria-label="Toggle utility menu"
            aria-expanded={isUtilityOpen}
            onClick={() => {
              toggleCommandBubble();
            }}
            style={{
              boxShadow: "0 0 0 1px rgba(96,165,250,0.14), 0 0 7px rgba(96,165,250,0.14)",
            }}
          >
            ⋮
          </button>
        </div>
      ) : null}
    </>
  );
}
