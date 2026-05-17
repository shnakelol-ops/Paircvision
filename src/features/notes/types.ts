export type CoachNoteType = "voice" | "text";
export type CoachNoteScope = "match" | "standalone";

export type CoachNote = {
  id: string;
  type: CoachNoteType;
  scope: CoachNoteScope;
  matchId?: string;
  half?: 1 | 2;
  matchClockMs?: number;
  text?: string;
  audioBlobId?: string;
  durationMs?: number;
  createdAt: number;
};

export function newCoachNoteId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && "randomUUID" in cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `note-${cryptoApi.randomUUID()}`;
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
