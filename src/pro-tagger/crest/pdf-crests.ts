// Club crests for the PDF reports (Club Crest V1, Checkpoint 4).
//
// Wraps an existing PDF export: looks the two clubs' crests up by Saved Team
// id (ProTaggerSquad.savedTeamId — never by name), decodes them with the same
// loader Match Analysis uses, hands them to the exporter as
// `scoreCrests`, and always releases them afterwards.
//
// A crest can never stop a PDF: no ids, unavailable storage, unknown ids,
// failed reads or decodes and slow loads all mean "export without crests",
// which draws page 1 exactly as before.
import type { ReviewPdfExportInput } from "../../stats/reviewPdfExport";
import type { PdfScoreCrests } from "../../stats/reporting/pdfScoreCrests";
import { savedTeamIdOf } from "../dashboard/htFtDashboardView";
import type { ProTaggerSquad } from "../pro-tagger-session";
import { loadMatchCrests, type LoadedMatchCrests } from "./crest-artwork";

/** Upper bound on waiting for crests before exporting without them (the loader has its own shorter timeouts). */
export const PDF_CREST_WAIT_MS = 5000;

type Squads = { home?: Pick<ProTaggerSquad, "savedTeamId" | "primaryColour" | "secondaryColour"> | null; away?: Pick<ProTaggerSquad, "savedTeamId" | "primaryColour" | "secondaryColour"> | null };

function settle(load: Promise<LoadedMatchCrests>, ms: number): Promise<LoadedMatchCrests | null> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      resolve(null);
    }, ms);
    load.then(
      (loaded) => {
        if (done) {
          loaded.release(); // too late: never applied
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(loaded);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Runs `exportPdf(input)` with the clubs' crests added as `scoreCrests` when
 * at least one is available; otherwise exactly `exportPdf(input)`.
 */
export async function exportWithClubCrests<I extends ReviewPdfExportInput>(
  input: I,
  squads: Squads,
  exportPdf: (input: I) => Promise<void>,
  load: (ids: { home?: string; away?: string }) => Promise<LoadedMatchCrests> = loadMatchCrests,
): Promise<void> {
  const ids = { home: savedTeamIdOf(squads.home), away: savedTeamIdOf(squads.away) };
  if (!ids.home && !ids.away) return exportPdf(input);

  let loaded: LoadedMatchCrests | null = null;
  try {
    loaded = await settle(Promise.resolve().then(() => load(ids)), PDF_CREST_WAIT_MS);
  } catch {
    loaded = null;
  }
  try {
    const crests = loaded?.crests;
    if (!crests || (!crests.home && !crests.away)) return await exportPdf(input);
    const scoreCrests: PdfScoreCrests = {
      home: crests.home,
      away: crests.away,
      homeName: input.homeTeamName,
      awayName: input.awayTeamName,
      homeColours: { primary: squads.home?.primaryColour, secondary: squads.home?.secondaryColour },
      awayColours: { primary: squads.away?.primaryColour, secondary: squads.away?.secondaryColour },
    };
    return await exportPdf({ ...input, scoreCrests });
  } finally {
    loaded?.release();
  }
}
