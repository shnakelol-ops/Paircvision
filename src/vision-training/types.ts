export type AttendanceStatus = "present" | "late" | "injured" | "absent";

export type AttendanceRecord = {
  playerId: string;
  playerNumber: number;
  playerName: string;
  status: AttendanceStatus;
  note?: string;
};

export type PlayerTrainingNote = {
  id: string;
  sessionId: string;
  playerId: string;
  playerNumber: number;
  playerName: string;
  note: string;
  createdAt: string;
};

export type TrainingSession = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  focus?: string;
  squadId?: string;
  status: "draft" | "completed";
  attendance: AttendanceRecord[];
  playerNotes: PlayerTrainingNote[];
};
