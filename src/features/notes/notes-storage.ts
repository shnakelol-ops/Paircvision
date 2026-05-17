import { type CoachNote } from "./types";

const NOTES_STORAGE_KEY = "pitchflow_coach_notes_v1";

function isValidHalf(input: unknown): input is 1 | 2 {
  return input === 1 || input === 2;
}

function parseCoachNote(input: unknown): CoachNote | null {
  if (!input || typeof input !== "object") return null;
  const maybeId = "id" in input ? input.id : null;
  const maybeType = "type" in input ? input.type : null;
  const maybeScope = "scope" in input ? input.scope : null;
  const maybeCreatedAt = "createdAt" in input ? input.createdAt : null;

  if (typeof maybeId !== "string" || maybeId.trim().length === 0) return null;
  if (maybeType !== "voice" && maybeType !== "text") return null;
  if (maybeScope !== "match" && maybeScope !== "standalone") return null;
  if (typeof maybeCreatedAt !== "number" || !Number.isFinite(maybeCreatedAt) || maybeCreatedAt <= 0) return null;

  const next: CoachNote = {
    id: maybeId,
    type: maybeType,
    scope: maybeScope,
    createdAt: maybeCreatedAt,
  };

  const maybeMatchId = "matchId" in input ? input.matchId : null;
  if (typeof maybeMatchId === "string" && maybeMatchId.trim().length > 0) {
    next.matchId = maybeMatchId;
  }

  const maybeHalf = "half" in input ? input.half : null;
  if (isValidHalf(maybeHalf)) {
    next.half = maybeHalf;
  }

  const maybeMatchClockMs = "matchClockMs" in input ? input.matchClockMs : null;
  if (typeof maybeMatchClockMs === "number" && Number.isFinite(maybeMatchClockMs) && maybeMatchClockMs >= 0) {
    next.matchClockMs = maybeMatchClockMs;
  }

  const maybeText = "text" in input ? input.text : null;
  if (typeof maybeText === "string" && maybeText.trim().length > 0) {
    next.text = maybeText.trim();
  }

  const maybeAudioBlobId = "audioBlobId" in input ? input.audioBlobId : null;
  if (typeof maybeAudioBlobId === "string" && maybeAudioBlobId.trim().length > 0) {
    next.audioBlobId = maybeAudioBlobId;
  }

  const maybeDurationMs = "durationMs" in input ? input.durationMs : null;
  if (typeof maybeDurationMs === "number" && Number.isFinite(maybeDurationMs) && maybeDurationMs >= 0) {
    next.durationMs = maybeDurationMs;
  }

  return next;
}

export function loadCoachNotes(): CoachNote[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => parseCoachNote(entry))
      .filter((entry): entry is CoachNote => entry != null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveCoachNotes(notes: readonly CoachNote[]): void {
  if (typeof window === "undefined") return;
  const sanitized = [...notes]
    .map((entry) => parseCoachNote(entry))
    .filter((entry): entry is CoachNote => entry != null)
    .sort((a, b) => b.createdAt - a.createdAt);
  window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(sanitized));
}

export function appendCoachNote(note: CoachNote): CoachNote[] {
  const notes = loadCoachNotes();
  const next = [note, ...notes];
  saveCoachNotes(next);
  return next;
}

export function getMatchNotes(matchId: string): CoachNote[] {
  if (matchId.trim().length === 0) return [];
  return loadCoachNotes().filter((note) => note.scope === "match" && note.matchId === matchId);
}
