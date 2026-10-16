// Matchday Pack V1 — internal, not a public PáircVision feature yet.
//
// Deliberately self-contained: no Event Stats types, no Team Sheet state.
// The only link to the Team Sheet is by reference — a side's
// `outfieldKitId` is an id from the existing kit registry
// (src/internal-team-sheet/team-sheet-kits.ts / team-sheet-kit-store.ts).
// Kit images are never copied into a pack, so there is exactly one jersey
// storage system.

export interface MatchdayTeamColours {
  /** "#rrggbb" — dominant jersey colour; drives the cover's team glow. */
  primary: string;
  /** "#rrggbb" — trim colour; used for name underlines and the fallback jersey. */
  secondary: string;
}

export interface MatchdaySide {
  /** Same id space as the kit registry: "ballylanders" or "team:<uuid>". */
  teamId: string;
  /** Display name, fadas preserved, e.g. "Na Piarsaigh". */
  name: string;
  colours: MatchdayTeamColours;
  /** Kit registry id; null (or a kit that no longer exists) → the cover draws
   * a neutral jersey in this side's colours — never another club's kit. */
  outfieldKitId: string | null;
}

export interface MatchdaySponsor {
  /** "sponsor:<uuid>". The logo blob arrives in PR 3; PR 1 renders the name. */
  id: string;
  name: string;
  /** When the club confirmed it has permission to use this sponsor's logo. */
  permissionConfirmedAt: number;
}

export interface MatchdayFixture {
  /** "Limerick Senior Football Championship". Required for a useful cover. */
  competition: string;
  /** Optional headline, e.g. "Quarter-Final". */
  round: string;
  venue: string;
  /** "YYYY-MM-DD" in local time — a plain string so no timezone/DST shifts. */
  date: string;
  /** "HH:mm" 24-hour local time. */
  throwIn: string;
}

export interface MatchdayPackV1 {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  home: MatchdaySide;
  away: MatchdaySide;
  fixture: MatchdayFixture;
  sponsors: MatchdaySponsor[];
}

// Sanity caps for stored text — generous enough for real Irish competition
// and club names; the renderer shrinks/wraps anything that fits these.
export const MATCHDAY_LIMITS = {
  teamName: 48,
  competition: 100,
  round: 48,
  venue: 80,
  sponsorName: 60,
  sponsors: 3,
} as const;
