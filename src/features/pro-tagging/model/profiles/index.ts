/**
 * Profile registry — single import point for all sport profiles.
 */

import { FOOTBALL_PROFILE } from "./football-profile";
import { LADIES_FOOTBALL_PROFILE } from "./ladies-football-profile";
import { HURLING_PROFILE } from "./hurling-profile";
import { CAMOGIE_PROFILE } from "./camogie-profile";
import type { SportProfile, SportProfileId } from "../sport-profile-types";

export const SPORT_PROFILES: Record<SportProfileId, SportProfile> = {
  FOOTBALL:        FOOTBALL_PROFILE,
  LADIES_FOOTBALL: LADIES_FOOTBALL_PROFILE,
  HURLING:         HURLING_PROFILE,
  CAMOGIE:         CAMOGIE_PROFILE,
};

export function getSportProfile(id: SportProfileId): SportProfile {
  return SPORT_PROFILES[id];
}

export { FOOTBALL_PROFILE, LADIES_FOOTBALL_PROFILE, HURLING_PROFILE, CAMOGIE_PROFILE };
