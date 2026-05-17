import { type TrainingEventDef, type TrainingPlayer } from "./trainingTypes";

export const TRAINING_EVENTS: TrainingEventDef[] = [
  { key: "goal", label: "Goal", points: 3, color: "blue", category: "score" },
  { key: "point", label: "Point", points: 1, color: "blue", category: "score" },
  { key: "two-pt", label: "2PT", points: 2, color: "blue", category: "score" },
  { key: "turnover-plus", label: "Turnover +", points: 1, color: "orange", category: "turnovers" },
  { key: "turnover-minus", label: "Turnover -", points: -1, color: "orange", category: "turnovers" },
  { key: "kickout-plus", label: "Kickout +", points: 1, color: "orange", category: "kickouts" },
  { key: "kickout-minus", label: "Kickout -", points: -1, color: "orange", category: "kickouts" },
  { key: "free-plus", label: "Free +", points: 1, color: "purple", category: "frees" },
  { key: "free-minus", label: "Free -", points: -1, color: "purple", category: "frees" },
  { key: "free-scored", label: "Free Scored", points: 1, color: "purple", category: "frees" },
  { key: "free-missed", label: "Free Missed", points: -1, color: "purple", category: "frees" },
  { key: "good-decision", label: "Good Decision", points: 1, color: "green", category: "decisions" },
  { key: "bad-decision", label: "Bad Decision", points: -1, color: "darkred", category: "decisions" },
  { key: "good-pass", label: "Good Pass", points: 1, color: "green", category: "passes" },
  { key: "bad-pass", label: "Bad Pass", points: -1, color: "darkred", category: "passes" },
  { key: "work-rate-plus", label: "Work Rate +", points: 1, color: "green", category: "workrate" },
  { key: "work-rate-minus", label: "Work Rate -", points: -1, color: "darkred", category: "workrate" },
  { key: "repeated-mistake", label: "Repeated Mistake", points: -3, color: "darkred", category: "decisions" },
  { key: "shot-dropped-short", label: "Shot — Dropped Short", points: -2, color: "darkred", category: "wides" },
  { key: "shot-blocked", label: "Shot — Blocked", points: -1, color: "darkred", category: "wides" },
  { key: "shot-bad-decision", label: "Shot — Bad Decision", points: -1, color: "darkred", category: "wides" },
  { key: "shot-outside-box-miss", label: "Shot — Outside Box Miss", points: -2, color: "darkred", category: "wides" },
  { key: "shot-wide", label: "Shot — Wide", points: -1, color: "darkred", category: "wides" },
];

export const SHOT_EVENT_KEYS = TRAINING_EVENTS.filter((event) => event.key.startsWith("shot-")).map((event) => event.key);

export function createDefaultPlayers(): TrainingPlayer[] {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `player-${index + 1}`,
    number: index + 1,
    name: `Player ${index + 1}`,
  }));
}

export function ratingColor(rating: number): string {
  if (rating >= 5) return "#24c15e";
  if (rating >= 2) return "#9fd84d";
  if (rating >= 0) return "#e1a500";
  if (rating >= -3) return "#e67e22";
  return "#d73a49";
}
