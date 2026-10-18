import {
  MATCHDAY_LIMITS,
  type MatchdayFixture,
  type MatchdayPackV1,
  type MatchdaySide,
  type MatchdaySponsor,
  type MatchdayTeamColours,
} from "./matchday-pack-types";

// Own key — separate from the Team Sheet (paircvision_internal_team_sheet_v1)
// and every Event Stats key, so a pack can never corrupt either.
export const MATCHDAY_PACK_STORAGE_KEY = "paircvision_internal_matchday_pack_v1";

export const NEUTRAL_COLOURS: MatchdayTeamColours = { primary: "#64748b", secondary: "#e2e8f0" };

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Trimmed, whitespace-collapsed, length-capped text; anything else → "". */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function cleanColour(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value.toLowerCase() : fallback;
}

/** A real calendar date ("2026-02-30" is rejected), else "". */
export function cleanDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const m = ISO_DATE.exec(value);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d ? value : "";
}

export function cleanTime(value: unknown): string {
  return typeof value === "string" && TIME_24H.test(value) ? value : "";
}

function parseColours(value: unknown): MatchdayTeamColours {
  const v = asObject(value) ?? {};
  return {
    primary: cleanColour(v.primary, NEUTRAL_COLOURS.primary),
    secondary: cleanColour(v.secondary, NEUTRAL_COLOURS.secondary),
  };
}

/** A side without a team id or a name is unusable → null. */
function parseSide(value: unknown): MatchdaySide | null {
  const v = asObject(value);
  if (!v) return null;
  const teamId = typeof v.teamId === "string" ? v.teamId.trim() : "";
  const name = cleanText(v.name, MATCHDAY_LIMITS.teamName);
  if (!teamId || !name) return null;
  return {
    teamId,
    name,
    colours: parseColours(v.colours),
    outfieldKitId: typeof v.outfieldKitId === "string" && v.outfieldKitId ? v.outfieldKitId : null,
  };
}

function parseFixture(value: unknown): MatchdayFixture {
  const v = asObject(value) ?? {};
  return {
    competition: cleanText(v.competition, MATCHDAY_LIMITS.competition),
    round: cleanText(v.round, MATCHDAY_LIMITS.round),
    venue: cleanText(v.venue, MATCHDAY_LIMITS.venue),
    date: cleanDate(v.date),
    throwIn: cleanTime(v.throwIn),
  };
}

/** Sponsors without a confirmed permission timestamp are dropped. */
function parseSponsors(value: unknown): MatchdaySponsor[] {
  if (!Array.isArray(value)) return [];
  const out: MatchdaySponsor[] = [];
  for (const item of value) {
    const v = asObject(item);
    if (!v) continue;
    const id = typeof v.id === "string" && v.id.startsWith("sponsor:") ? v.id : "";
    const name = cleanText(v.name, MATCHDAY_LIMITS.sponsorName);
    const permissionConfirmedAt = typeof v.permissionConfirmedAt === "number" && v.permissionConfirmedAt > 0 ? v.permissionConfirmedAt : 0;
    if (!id || !name || !permissionConfirmedAt) continue;
    if (out.some((s) => s.id === id)) continue;
    out.push({ id, name, permissionConfirmedAt });
    if (out.length === MATCHDAY_LIMITS.sponsors) break;
  }
  return out;
}

/**
 * Validates anything (parsed JSON, a fixture, a future import) into a pack.
 * Unknown versions and packs missing a usable home or away side → null;
 * every other field is cleaned to a safe value rather than rejected.
 */
export function parseMatchdayPack(value: unknown): MatchdayPackV1 | null {
  const v = asObject(value);
  if (!v || v.version !== 1) return null;
  const home = parseSide(v.home);
  const away = parseSide(v.away);
  if (!home || !away) return null;
  const now = Date.now();
  const createdAt = typeof v.createdAt === "number" && v.createdAt > 0 ? v.createdAt : now;
  const updatedAt = typeof v.updatedAt === "number" && v.updatedAt >= createdAt ? v.updatedAt : createdAt;
  return {
    version: 1,
    id: typeof v.id === "string" && v.id ? v.id : newId(),
    createdAt,
    updatedAt,
    home,
    away,
    fixture: parseFixture(v.fixture),
    sponsors: parseSponsors(v.sponsors),
  };
}

export function createMatchdayPack(input: {
  home: MatchdaySide;
  away: MatchdaySide;
  fixture?: Partial<MatchdayFixture>;
  sponsors?: MatchdaySponsor[];
}): MatchdayPackV1 | null {
  const now = Date.now();
  return parseMatchdayPack({
    version: 1,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    home: input.home,
    away: input.away,
    fixture: input.fixture ?? {},
    sponsors: input.sponsors ?? [],
  });
}

export function loadMatchdayPack(): MatchdayPackV1 | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(MATCHDAY_PACK_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parseMatchdayPack(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Returns false when the pack is invalid or the device refused the write
 * (quota, private mode) — callers must surface that, never assume saved. */
export function saveMatchdayPack(pack: MatchdayPackV1): boolean {
  const clean = parseMatchdayPack({ ...pack, updatedAt: Math.max(Date.now(), pack.createdAt) });
  if (!clean) return false;
  try {
    window.localStorage.setItem(MATCHDAY_PACK_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}
