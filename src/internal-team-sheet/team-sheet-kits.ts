// Kit registry for the internal Team Sheet. A "kit" is one jersey image for
// one role (outfield or goalkeeper). Built-in Ballylanders kits are presets
// served from public/internal/; future user-uploaded kits will live in
// team-sheet-kit-store.ts (metadata in localStorage, image blob in
// IndexedDB). Kit ids are opaque strings — "preset:…" for built-ins,
// "user:…" for uploads — so selection state never needs a closed union.

export type KitRole = "outfield" | "gk";

export interface TeamSheetTeam {
  id: string;
  name: string;
}

export interface TeamSheetKit {
  id: string;
  teamId: string;
  name: string;
  role: KitRole;
  source: "preset" | "user";
  /** Static URL for presets. User kits resolve their src from IndexedDB. */
  src?: string;
}

export interface TeamSheetKitSelection {
  outfieldKitId: string;
  gkKitId: string;
}

/** Resolved, render-ready image URLs — the only thing the tiles consume. */
export interface TeamSheetKitSrcs {
  outfield: string;
  gk: string;
}

export const DEFAULT_TEAM: TeamSheetTeam = { id: "ballylanders", name: "Ballylanders" };

// Order is the selector's display order. The yellow outfield and black GK
// kits are the defaults every existing saved sheet renders with.
export const PRESET_KITS: readonly TeamSheetKit[] = [
  {
    id: "preset:ballylanders-yellow",
    teamId: DEFAULT_TEAM.id,
    name: "Yellow",
    role: "outfield",
    source: "preset",
    src: "/internal/ballylanders-outfield-jersey.webp",
  },
  {
    id: "preset:ballylanders-green",
    teamId: DEFAULT_TEAM.id,
    name: "Green",
    role: "outfield",
    source: "preset",
    src: "/internal/ballylanders-outfield-jersey-green.webp",
  },
  {
    id: "preset:ballylanders-white",
    teamId: DEFAULT_TEAM.id,
    name: "White",
    role: "outfield",
    source: "preset",
    src: "/internal/ballylanders-outfield-jersey-white.webp",
  },
  {
    id: "preset:ballylanders-gk-black",
    teamId: DEFAULT_TEAM.id,
    name: "Black",
    role: "gk",
    source: "preset",
    src: "/internal/ballylanders-gk-jersey.webp",
  },
];

export const DEFAULT_KIT_SELECTION: TeamSheetKitSelection = {
  outfieldKitId: "preset:ballylanders-yellow",
  gkKitId: "preset:ballylanders-gk-black",
};

// Pre-kit-registry saves stored `outfieldJersey: "yellow" | "green" | "white"`.
export const LEGACY_OUTFIELD_JERSEY_TO_KIT_ID: Readonly<Record<string, string>> = {
  yellow: "preset:ballylanders-yellow",
  green: "preset:ballylanders-green",
  white: "preset:ballylanders-white",
};

export function kitsForRole(kits: readonly TeamSheetKit[], teamId: string, role: KitRole): TeamSheetKit[] {
  return kits.filter((k) => k.teamId === teamId && k.role === role);
}

function defaultKitId(role: KitRole): string {
  return role === "gk" ? DEFAULT_KIT_SELECTION.gkKitId : DEFAULT_KIT_SELECTION.outfieldKitId;
}

/**
 * The kit to render for a role. A selection pointing at a kit that no
 * longer exists (deleted, wrong role, or its storage was evicted) falls
 * back to the role's default preset — never a blank jersey.
 */
export function resolveKit(kits: readonly TeamSheetKit[], kitId: string, role: KitRole): TeamSheetKit {
  const found = kits.find((k) => k.id === kitId && k.role === role);
  if (found) return found;
  return PRESET_KITS.find((k) => k.id === defaultKitId(role))!;
}

export function presetKitSrcs(selection: TeamSheetKitSelection = DEFAULT_KIT_SELECTION): TeamSheetKitSrcs {
  return {
    outfield: resolveKit(PRESET_KITS, selection.outfieldKitId, "outfield").src!,
    gk: resolveKit(PRESET_KITS, selection.gkKitId, "gk").src!,
  };
}
