/**
 * ballylanders-galbally-real-fixture.ts
 *
 * Loader for the first REAL event-log regression fixture: Ballylanders v
 * Galbally (Pro Tagger, 29 Sep 2026), exported with Pro Tagger's Export JSON
 * and anonymised (see the `_provenance` field of the JSON file). Every event
 * kind, tag, coordinate, clock, period, segment, side and restart owner is
 * exactly as captured.
 *
 * Test-only: reads the JSON from disk with node:fs.
 */

import { readFileSync } from "node:fs";
import type { PdfExportEvent, PdfSquadPlayer } from "../reviewPdfExport";

type FixtureFile = {
  homeTeamName: string;
  awayTeamName: string;
  halfDurationMinutes: number;
  scorelineSnapshot: string;
  firstHalfAttackingDirection: "left" | "right";
  homeSquad: { players: { id: string; number: number }[] };
  awaySquad: { players: { id: string; number: number }[] };
  events: PdfExportEvent[];
};

export type BallylandersGalballyFixture = {
  homeTeam: string;
  awayTeam: string;
  halfDurationMinutes: number;
  scorelineSnapshot: string;
  homeAttackingDirection: "LEFT" | "RIGHT";
  homeSquadPlayers: PdfSquadPlayer[];
  awaySquadPlayers: PdfSquadPlayer[];
  events: PdfExportEvent[];
};

export function loadBallylandersGalballyFixture(): BallylandersGalballyFixture {
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/ballylanders-galbally-2026-09-29.json", import.meta.url), "utf8"),
  ) as FixtureFile;
  const squad = (players: { id: string; number: number }[]): PdfSquadPlayer[] =>
    players.map((p) => ({ id: p.id, number: p.number, name: "" }));
  return {
    homeTeam: raw.homeTeamName,
    awayTeam: raw.awayTeamName,
    halfDurationMinutes: raw.halfDurationMinutes,
    scorelineSnapshot: raw.scorelineSnapshot,
    homeAttackingDirection: raw.firstHalfAttackingDirection === "left" ? "LEFT" : "RIGHT",
    homeSquadPlayers: squad(raw.homeSquad.players),
    awaySquadPlayers: squad(raw.awaySquad.players),
    events: raw.events,
  };
}
