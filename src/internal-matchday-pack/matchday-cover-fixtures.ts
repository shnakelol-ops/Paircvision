// Fixture packs for the developer preview and the renderer tests. Opponent
// clubs are fictional; Ballylanders uses its real preset kits.
import { createMatchdayPack } from "./matchday-pack-storage";
import type { MatchdayPackV1 } from "./matchday-pack-types";

const BALLYLANDERS = {
  teamId: "ballylanders",
  name: "Ballylanders",
  colours: { primary: "#f2c12e", secondary: "#138a3a" },
  outfieldKitId: "preset:ballylanders-yellow",
};

const PERMITTED = Date.UTC(2026, 9, 1);

export interface CoverScenario {
  key: string;
  label: string;
  pack: MatchdayPackV1;
  /** Preview-only: draw this kit for the away side even though it belongs to
   * another team — used to judge the two-jersey layout until opponent kits
   * can be uploaded (Kit Builder, PR #360). Never used by the real cover. */
  awayStandInKitId?: string;
}

function pack(input: Parameters<typeof createMatchdayPack>[0]): MatchdayPackV1 {
  const p = createMatchdayPack(input);
  if (!p) throw new Error("Invalid fixture pack");
  return p;
}

export const COVER_SCENARIOS: readonly CoverScenario[] = [
  {
    key: "championship",
    label: "Championship — two real kits (away kit stand-in)",
    awayStandInKitId: "preset:ballylanders-green",
    pack: pack({
      home: BALLYLANDERS,
      away: {
        teamId: "team:demo-galtee-rovers",
        name: "Galtee Rovers",
        colours: { primary: "#1f8a46", secondary: "#f2c12e" },
        outfieldKitId: null,
      },
      fixture: {
        competition: "Limerick Senior Football Championship",
        round: "Quarter-Final",
        venue: "Kilmallock GAA Grounds",
        date: "2026-10-25",
        throwIn: "15:30",
      },
      sponsors: [
        { id: "sponsor:hanleys", name: "Hanley's Hardware", permissionConfirmedAt: PERMITTED },
        { id: "sponsor:ryans", name: "Ryan's Foodstore", permissionConfirmedAt: PERMITTED },
      ],
    }),
  },
  {
    key: "missing-kit",
    label: "Opponent kit missing — club-colour jersey",
    pack: pack({
      home: BALLYLANDERS,
      away: {
        teamId: "team:demo-cnoc",
        name: "Cnoc Áine",
        colours: { primary: "#7a1f2b", secondary: "#f4f4f2" },
        outfieldKitId: "user:deleted-kit",
      },
      fixture: {
        competition: "County Intermediate Hurling Championship",
        round: "Semi-Final",
        venue: "Bruff",
        date: "2026-11-01",
        throwIn: "14:00",
      },
    }),
  },
  {
    key: "long-names",
    label: "Long names, fadas, three sponsors",
    pack: pack({
      home: {
        teamId: "team:demo-naomh",
        name: "Naomh Mearnóg Ó Súilleabháin",
        colours: { primary: "#0b2a5b", secondary: "#e5e7eb" },
        outfieldKitId: null,
      },
      away: {
        teamId: "team:demo-cill",
        name: "Cill Mhic Ciaráin agus Ráth Dubh",
        colours: { primary: "#111111", secondary: "#f59e0b" },
        outfieldKitId: null,
      },
      fixture: {
        competition: "Corn Uí Mhuirí — All-Ireland Club Intermediate Ladies Football Championship",
        round: "Provincial Final Replay",
        venue: "Páirc Uí Chaoimh, Baile an Chollaigh, Corcaigh",
        date: "2027-01-17",
        throwIn: "12:00",
      },
      sponsors: [
        { id: "sponsor:a", name: "Ó Briain Engineering & Precision Fabrication", permissionConfirmedAt: PERMITTED },
        { id: "sponsor:b", name: "Kelly's Bar", permissionConfirmedAt: PERMITTED },
        { id: "sponsor:c", name: "Galtee Dairies", permissionConfirmedAt: PERMITTED },
      ],
    }),
  },
  {
    key: "minimal",
    label: "Minimal — competition only, no details",
    pack: pack({
      home: BALLYLANDERS,
      away: {
        teamId: "team:demo-oola",
        name: "Oola",
        colours: { primary: "#ffffff", secondary: "#1d4ed8" },
        outfieldKitId: null,
      },
      fixture: { competition: "Challenge Match" },
    }),
  },
];
