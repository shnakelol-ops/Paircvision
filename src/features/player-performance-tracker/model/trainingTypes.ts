export type TrainingPeriod = "PRE" | "1H" | "2H" | "ET";

export type TrainingEventKey =
  | "goal"
  | "point"
  | "two-pt"
  | "turnover-plus"
  | "turnover-minus"
  | "kickout-plus"
  | "kickout-minus"
  | "free-plus"
  | "free-minus"
  | "free-scored"
  | "free-missed"
  | "good-decision"
  | "bad-decision"
  | "good-pass"
  | "bad-pass"
  | "shot-dropped-short"
  | "shot-blocked"
  | "shot-bad-decision"
  | "shot-outside-box-miss"
  | "shot-wide"
  | "work-rate-plus"
  | "work-rate-minus"
  | "repeated-mistake";

export type TrainingPlayer = {
  id: string;
  number: number;
  name: string;
};

export type EventCategory = "score" | "shots" | "wides" | "turnovers" | "kickouts" | "frees" | "decisions" | "passes" | "workrate";

export type TrainingEventDef = {
  key: TrainingEventKey;
  label: string;
  points: number;
  color: "blue" | "orange" | "purple" | "green" | "darkred";
  category: EventCategory;
};

export type TrainingLogEntry = {
  id: string;
  eventKey: TrainingEventKey;
  eventLabel: string;
  points: number;
  category: EventCategory;
  playerId: string;
  playerName: string;
  playerNumber: number;
  elapsedSeconds: number;
  period: TrainingPeriod;
  createdAt: number;
};

export type TrainingSessionState = {
  sessionName: string;
  players: TrainingPlayer[];
  hasStarted: boolean;
  isRunning: boolean;
  elapsedSeconds: number;
  period: TrainingPeriod;
  logs: TrainingLogEntry[];
  activeTab: "tracker" | "ratings";
  activeEventKey: TrainingEventKey | null;
  lastDeleted?: TrainingLogEntry | null;
};

export type SeasonPlayerStat = {
  playerId: string;
  playerNumber: number;
  playerName: string;
  totalPoints: number;
  sessions: number;
};

export type SavedSquad = {
  id: string;
  name: string;
  players: TrainingPlayer[];
};
