/**
 * camogie-profile.ts
 *
 * PáircVision Pro Tagging — Camogie Sport Profile
 *
 * Identical to hurling in terms of capture mechanics and event set.
 * Same speed requirements apply.
 */

import { HURLING_PROFILE } from "./hurling-profile";
import type { SportProfile } from "../sport-profile-types";

export const CAMOGIE_PROFILE: SportProfile = {
  ...HURLING_PROFILE,
  id: "CAMOGIE",
  displayName: "Camogie",
  reportVocabulary: {
    ...HURLING_PROFILE.reportVocabulary,
    // Camogie uses same terminology as hurling
  },
};
