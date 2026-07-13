// Capability profile for Rapid Capture's report exports.
//
// A single source of truth for "is there enough data for report X" — every
// export entry point (Match Hub FAB, Review screen) reads the same profile
// instead of each one re-deriving its own ad hoc boolean. The underlying PDF
// pipeline (reviewPdfExport.ts) already degrades gracefully page-by-page when
// data is thin (placeholder text, footnotes) — this profile governs whether
// the export action itself is offered at all, gating on "genuinely no data
// for this half/match" rather than duplicating that internal page logic.

import type { RapidMatchEvent } from "./rapid-capture-events";

export type RapidReportCapability = {
  hasAnyEvents: boolean;
  hasFirstHalfEvents: boolean;
  hasSecondHalfEvents: boolean;
  canExportHtSnapshot: boolean;
  canExportFtSnapshot: boolean;
  canExportFullReview: boolean;
  canExportIntelligencePack: boolean;
  /** Human-readable reason for each disabled export — undefined when enabled. */
  reasons: {
    htSnapshot?: string;
    ftSnapshot?: string;
    fullReview?: string;
    intelligencePack?: string;
  };
};

const NO_EVENTS_REASON = "No events recorded yet";
const NO_FIRST_HALF_REASON = "No first-half events recorded";

export function deriveRapidReportCapability(events: readonly RapidMatchEvent[]): RapidReportCapability {
  const hasAnyEvents = events.length > 0;
  const hasFirstHalfEvents = events.some((e) => e.half === 1);
  const hasSecondHalfEvents = events.some((e) => e.half === 2);

  const canExportHtSnapshot = hasFirstHalfEvents;
  const canExportFtSnapshot = hasAnyEvents;
  const canExportFullReview = hasAnyEvents;
  const canExportIntelligencePack = hasAnyEvents;

  return {
    hasAnyEvents,
    hasFirstHalfEvents,
    hasSecondHalfEvents,
    canExportHtSnapshot,
    canExportFtSnapshot,
    canExportFullReview,
    canExportIntelligencePack,
    reasons: {
      htSnapshot: canExportHtSnapshot ? undefined : NO_FIRST_HALF_REASON,
      ftSnapshot: canExportFtSnapshot ? undefined : NO_EVENTS_REASON,
      fullReview: canExportFullReview ? undefined : NO_EVENTS_REASON,
      intelligencePack: canExportIntelligencePack ? undefined : NO_EVENTS_REASON,
    },
  };
}
