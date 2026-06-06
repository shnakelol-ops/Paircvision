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

export type TrainingSessionReview = {
  sessionId: string;
  attendanceSummary: {
    present: number;
    late: number;
    injured: number;
    absent: number;
    total: number;
    attendancePercent: number;
  };
  standoutPlayers: string[];
  concerns: string[];
  coachActions: string[];
  nextSessionFocus?: string;
  summaryNote?: string;
  updatedAt: string;
};

export type TrainingSession = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  focus?: string;
  squadId?: string;
  status: "draft" | "completed";
  completedAt?: string;
  attendance: AttendanceRecord[];
  playerNotes: PlayerTrainingNote[];
  review?: TrainingSessionReview;
};
